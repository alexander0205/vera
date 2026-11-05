/**
 * Correcciones del revisor: SQL de fechas, depreciación tras una baja parcial,
 * tope de zip, candados que se pueden reintentar y cuentas base con otro uso.
 * La base se simula por el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const registro: { sql: string; params: unknown[] }[] = [];
let respuesta: (t: string, params: unknown[]) => unknown[] = () => [];

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => {
      const { sql, params } = dialect.sqlToQuery(q);
      const t = sql.trim().replace(/\s+/g, ' ');
      registro.push({ sql: t, params });
      return respuesta(t, params);
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: async (q: never) => {
      const { sql, params } = dialect.sqlToQuery(q);
      const t = sql.trim().replace(/\s+/g, ' ');
      registro.push({ sql: t, params });
      return respuesta(t, params);
    } }),
  },
}));
vi.mock('@/lib/contabilidad/bancos', () => ({
  cuentasBanco: async () => [{ id: 7, codigo: '110201', nombre: 'Banco', tipo: 'activo', imputable: true, activa: true }],
  tablaExiste: async () => true,
  textoLibre: (v: unknown) => (typeof v === 'string' ? v : null),
}));
vi.mock('@/lib/contabilidad/asientos', () => ({
  generarAsientoManual: async () => ({ asientoId: 42 }),
  AsientoManualError: class extends Error {},
  generarAsientoCompra: async () => ({ creado: false }),
}));

import { emparejarExtracto } from '@/lib/contabilidad/conciliacion';
import { asegurarCuentaBase } from '@/lib/contabilidad/catalogo-base';
import {
  ajustarCuotasPendientes, calcularCuotasConBajas, periodoFinalDeVida,
} from '@/lib/contabilidad/depreciacion';
import { calcularBaja } from '@/lib/contabilidad/activos-fijos';
import { deflateRawSync } from 'node:zlib';
import { validarTamanoZip, ZipDemasiadoGrandeError } from '@/lib/contabilidad/zip-tope';

beforeEach(() => { registro.length = 0; respuesta = () => []; });

describe('1 · aritmética de fechas con parámetros', () => {
  it('el emparejado suma y resta días con ::int * interval, nunca date ± parámetro sin tipo', async () => {
    respuesta = (t) => (t.includes("estado = 'pendiente'") && t.startsWith('SELECT id, to_char') ? [
      { id: 1, fecha: '2026-11-03', monto: '100', referencia: null, descripcion: null },
    ] : t.includes('SELECT id FROM contabilidad_cuentas') ? [] : []);
    await emparejarExtracto(1, 9, 7);
    const consulta = registro.find((r) => r.sql.includes('contabilidad_asiento_lineas l') && r.sql.includes('a.fecha >='));
    expect(consulta).toBeTruthy();
    expect(consulta!.sql).toContain("::date - ($");
    expect(consulta!.sql).toContain("::int * interval '1 day')");
    expect(consulta!.sql).not.toMatch(/::date [-+] \$\d/);
  });

  it('ninguna consulta de lib/contabilidad suma o resta un parámetro pelado a una fecha', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = 'lib/contabilidad';
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/::date\s*[-+]\s*\$\{/);
    }
  });
});

describe('C · las marcas manuales (0220) se ofrecen al emparejar', () => {
  it('apuntesLibres excluye solo lo que ya tiene línea del extracto, no lo marcado a mano', async () => {
    respuesta = (t) => (t.startsWith('SELECT id, to_char') ? [{ id: 1, fecha: '2026-11-03', monto: '100', referencia: null, descripcion: null }] : []);
    await emparejarExtracto(1, 9, 7);
    const q = registro.find((r) => r.sql.includes('a.fecha >='))!;
    expect(q.sql).toContain('NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas e WHERE e.linea_id = l.id');
    expect(q.sql).not.toContain('c.id IS NULL');
    expect(q.sql).not.toContain('JOIN contabilidad_conciliaciones');
  });

  it('al unir un apunte ya marcado a mano, no falla por la marca: la respeta y enlaza la línea', async () => {
    respuesta = (t) => {
      if (t.startsWith('SELECT id, to_char') && t.includes("estado = 'pendiente'")) return [{ id: 1, fecha: '2026-11-03', monto: '100', referencia: null, descripcion: null }];
      if (t.includes('a.fecha >=')) return [{ id: 50, fecha: '2026-11-03', monto: '100', texto: '' }];
      if (t.startsWith("UPDATE contabilidad_extracto_lineas SET estado = 'emparejada'")) return [{ id: 1 }];
      return [];
    };
    const r = await emparejarExtracto(1, 9, 7);
    expect(r.emparejadas).toBe(1);
    const marca = registro.find((x) => x.sql.startsWith('INSERT INTO contabilidad_conciliaciones'))!;
    expect(marca.sql).toContain('ON CONFLICT (linea_id) DO NOTHING');
    expect(marca.sql).toContain('RETURNING');   // para saber si la marca ya existía (marca_previa)
  });
});

describe('5 · depreciación tras una baja parcial no pasa del costo', () => {
  /** Simula la vida entera: cuotas mes a mes, con una baja en el mes indicado. */
  function simular(costo: number, cantidad: number, vida: number, unidadesBaja: number, mesBaja: number) {
    const activo = { costoCents: costo, valorResidualCents: 0, vidaUtilMeses: vida, fechaAdquisicion: '2026-01-15', cantidad };
    const fin = periodoFinalDeVida(activo.fechaAdquisicion, vida);
    let acumulada = 0; let costoVigente = costo; let dadas = 0;
    let bajas: { fecha: string; unidades: number }[] = [];
    let maximoCosto = costo;
    for (let m = 0; m < vida; m++) {
      const mes = new Date(Date.UTC(2026, 1 + m, 1)).toISOString().slice(0, 10);
      if (m === mesBaja && unidadesBaja > 0) {
        const c = calcularBaja({ costoVigenteCents: costoVigente, acumuladaVigenteCents: acumulada, cantidadVigente: cantidad - dadas }, unidadesBaja, 0);
        costoVigente -= c.costoBajaCents; acumulada -= c.depreciacionBajaCents; dadas += unidadesBaja;
        bajas = [{ fecha: mes.slice(0, 8) + '10', unidades: unidadesBaja }];
      }
      const todas = calcularCuotasConBajas(activo, bajas, mes);
      // Lo que falta por asentar al llegar a este mes: las de periodos aún no hechos.
      const hechasHasta = new Set(Array.from({ length: m }, (_, i) => new Date(Date.UTC(2026, 1 + i, 1)).toISOString().slice(0, 10)));
      const pend = todas.filter((c) => !hechasHasta.has(c.periodo));
      const techo = costoVigente - acumulada;
      const ajustadas = ajustarCuotasPendientes(pend, fin, techo);
      const esteMes = ajustadas.find((c) => c.periodo === mes);
      acumulada += esteMes?.montoCents ?? 0;
      expect(acumulada).toBeLessThanOrEqual(costoVigente);
      maximoCosto = Math.min(maximoCosto, costoVigente);
    }
    return { acumulada, costoVigente };
  }

  it('costo 3,000.00, 3 unidades, 12 meses y baja de 1 en el mes 6: termina exacto en el costo vigente', () => {
    const r = simular(300_000, 3, 12, 1, 5);
    expect(r.costoVigente).toBe(200_000);
    expect(r.acumulada).toBe(r.costoVigente);
  });

  it('120 meses y 7 unidades con una baja: nunca se pasa y cierra en el costo vigente', () => {
    const r = simular(1_000_003, 7, 120, 1, 40);
    expect(r.acumulada).toBeLessThanOrEqual(r.costoVigente);
    expect(r.acumulada).toBe(r.costoVigente);
  });

  it('sin bajas deja las cuotas como estaban', () => {
    const activo = { costoCents: 120_000, valorResidualCents: 0, vidaUtilMeses: 12, fechaAdquisicion: '2026-01-15', cantidad: 1 };
    const base = calcularCuotasConBajas(activo, [], '2026-12-01');
    expect(ajustarCuotasPendientes(base, periodoFinalDeVida(activo.fechaAdquisicion, 12), 120_000)).toEqual(base);
  });
});

describe('7 y F · asegurarCuentaBase solo adopta cuentas de la base', () => {
  const fila = (extra: Record<string, unknown>) => ({ id: 5, tipo: 'pasivo', imputable: true, activa: true, codigo: '2115', esBase: true, ...extra });
  const conExistente = (existente: Record<string, unknown> | null) => {
    respuesta = (t, p) => {
      if (t.startsWith('SELECT id, tipo, imputable, activa, codigo')) return p[1] === '2115' && existente ? [existente] : [];
      if (t.startsWith('INSERT INTO contabilidad_cuentas')) return [{ id: 99 }];
      return [];
    };
  };

  it('si 2115 es de otro tipo, crea la cuenta con un código libre y lo avisa', async () => {
    conExistente(fila({ tipo: 'gasto' }));
    const { asegurarCuentaBaseDetalle } = await import('@/lib/contabilidad/catalogo-base');
    const r = await asegurarCuentaBaseDetalle(1, '2115', 3);
    expect(r).toMatchObject({ id: 99, codigo: '2115-2' });
    expect(r?.aviso).toContain('2115-2');
    expect(registro.find((x) => x.sql.startsWith('INSERT INTO contabilidad_cuentas'))!.params).toContain('2115-2');
  });

  it('un catálogo propio donde 2115 es del mismo tipo pero NO es de la base: no se adopta', async () => {
    conExistente(fila({ esBase: false }));
    expect(await asegurarCuentaBase(1, '2115', 3)).toBe(99);
  });

  it('si ya existe y es de la base (mismo tipo, imputable, activa) la devuelve sin crear nada', async () => {
    conExistente(fila({}));
    expect(await asegurarCuentaBase(1, '2115', 3)).toBe(5);
    expect(registro.some((r) => r.sql.startsWith('INSERT'))).toBe(false);
  });

  it('una cuenta de la base desactivada o de agrupación tampoco se usa', async () => {
    conExistente(fila({ activa: false }));
    expect(await asegurarCuentaBase(1, '2115', 3)).toBe(99);
    registro.length = 0;
    conExistente(fila({ imputable: false }));
    expect(await asegurarCuentaBase(1, '2115', 3)).toBe(99);
  });

  it('un código que no es de la base devuelve null', async () => {
    expect(await asegurarCuentaBase(1, '9999', 3)).toBeNull();
  });
});

describe('8 · tope del zip descomprimido (con tamaños falsos)', () => {
  /** Arma un zip real de una sola entrada; `declarado` es lo que MIENTE el directorio central. */
  function zip(contenido: Buffer, declarado?: number, metodo: 0 | 8 = 8): Uint8Array {
    const datos = metodo === 8 ? deflateRawSync(contenido) : contenido;
    const nombre = Buffer.from('a.xml');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(declarado ?? contenido.length, 22); local.writeUInt16LE(nombre.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(metodo, 10);
    cd.writeUInt32LE(datos.length, 20); cd.writeUInt32LE(declarado ?? contenido.length, 24); cd.writeUInt16LE(nombre.length, 28); cd.writeUInt32LE(0, 42);
    const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 10);
    const offCd = local.length + nombre.length + datos.length;
    fin.writeUInt32LE(cd.length + nombre.length, 12); fin.writeUInt32LE(offCd, 16);
    return new Uint8Array(Buffer.concat([local, nombre, datos, cd, nombre, fin]));
  }

  it('acepta un zip honesto y razonable', () => {
    expect(validarTamanoZip(zip(Buffer.alloc(1_000_000, 65))).descomprimido).toBe(1_000_000);
    expect(validarTamanoZip(zip(Buffer.from('hola'), undefined, 0)).descomprimido).toBe(4);
  });

  it('una bomba que declara 100 bytes y se infla a decenas de MB se corta igual', () => {
    const bomba = zip(Buffer.alloc(60 * 1024 * 1024, 0), 100);
    expect(bomba.length).toBeLessThan(200_000);
    expect(() => validarTamanoZip(bomba)).toThrow(ZipDemasiadoGrandeError);
    expect(() => validarTamanoZip(bomba)).toThrow(/demasiado grande/);
  });

  it('el tope se puede bajar, y lo que no es un zip o trae demasiadas partes se rechaza', () => {
    expect(() => validarTamanoZip(zip(Buffer.alloc(2_000_000, 1)), { maxDescomprimido: 1_000_000 })).toThrow(/demasiado grande/);
    expect(() => validarTamanoZip(new Uint8Array(100))).toThrow(/no es un Excel/);
    expect(() => validarTamanoZip(zip(Buffer.from('x'.repeat(50))), { maxEntradas: 0 })).toThrow(/demasiadas partes/);
  });
});

describe('E · CSV en windows-1252', () => {
  it('decodifica UTF-8 y, si no lo es, windows-1252 (Débito llega bien y se reconoce la columna)', async () => {
    const { decodificarTexto } = await import('@/lib/contabilidad/extracto-archivo');
    const { leerCsv, interpretarExtracto } = await import('@/lib/contabilidad/extracto');
    expect(decodificarTexto(new TextEncoder().encode('Débito'))).toBe('Débito');
    const w1252 = Uint8Array.from([0x46, 0x65, 0x63, 0x68, 0x61, 0x3b, 0x44, 0xe9, 0x62, 0x69, 0x74, 0x6f, 0x0a, 0x30, 0x33, 0x2f, 0x31, 0x31, 0x2f, 0x32, 0x30, 0x32, 0x36, 0x3b, 0x31, 0x30, 0x2e, 0x30, 0x30]);
    const texto = decodificarTexto(w1252);
    expect(texto).toContain('Débito');
    expect(interpretarExtracto(leerCsv(texto)).filas[0].montoCents).toBe(-1000);
  });
});
