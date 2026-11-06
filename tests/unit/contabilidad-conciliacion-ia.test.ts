import { describe, it, expect } from 'vitest';
import {
  validarSaldos, aplicarMapeo, limpiarMapeo, mapearColumnasConIa, leerPdfConIa, limpiarFilasIa, limpiarFilasConfirmadas,
  permitirUsoIa, conciliacionIaActiva, faltanColumnas, pesosACentavos, armarVistaIa, LecturaIaError, LIMITES_IA,
  type LlamadaModelo, type MapeoModelo, type SalidaPdf,
} from '@/lib/contabilidad/extracto-ia';
import { interpretarExtracto, ExtractoError, type FilaExtracto } from '@/lib/contabilidad/extracto';
import {
  clasificarCargoBancario, detectarSuma, resumenParaCuadrar, limpiarSugerenciasIa, clientesEnDescripcion, candidatosLibro,
  ayudaDeterminista, type EntradaAyudaIa, type LineaAyuda, type ApunteLibro,
} from '@/lib/contabilidad/conciliacion-ayuda-reglas';

const fila = (n: number, monto: number, saldo: number | null, fecha = '2026-10-05'): FilaExtracto =>
  ({ fila: n, fecha, descripcion: `mov ${n}`, referencia: null, montoCents: monto, saldoCents: saldo });

describe('validarSaldos: la lectura contra el balance del banco', () => {
  it('cuadra cuando saldo inicial + movimientos = saldo final y cada fila encadena', () => {
    const f = [fila(1, 100_000, 1_100_000), fila(2, -25_000, 1_075_000), fila(3, -5_000, 1_070_000)];
    const r = validarSaldos(f, { inicialCents: 1_000_000, finalCents: 1_070_000 });
    expect(r.estado).toBe('cuadra');
    expect(r.mensaje).toBe('Cuadra con el saldo del banco ✓');
    expect(r.filasRotas).toEqual([]);
  });

  it('marca la fila mal leída y no arrastra a las siguientes', () => {
    // La fila 2 se leyó como -52_000 en vez de -25_000.
    const f = [fila(1, 100_000, 1_100_000), fila(2, -52_000, 1_075_000), fila(3, -5_000, 1_070_000)];
    const r = validarSaldos(f, { inicialCents: 1_000_000, finalCents: 1_070_000 });
    expect(r.estado).toBe('no-cuadra');
    expect(r.filasRotas).toEqual([2]);
    expect(r.mensaje).toContain('La fila 2 no cuadra con el balance: revísalas');
  });

  it('dice «las filas 7 y 8» cuando se rompen dos', () => {
    const f = [fila(6, 100, 1_000), fila(7, 500, 9_999), fila(8, 500, 8_888), fila(9, 100, 8_988)];
    const r = validarSaldos(f, {});
    expect(r.filasRotas).toEqual([7, 8]);
    expect(r.mensaje).toBe('Las filas 7 y 8 no cuadran con el balance: revísalas.');
  });

  it('detecta un archivo con lo más nuevo primero', () => {
    const f = [fila(1, -5_000, 1_070_000), fila(2, -25_000, 1_075_000), fila(3, 100_000, 1_100_000)];
    const r = validarSaldos(f, { inicialCents: 1_000_000, finalCents: 1_070_000 });
    expect(r.estado).toBe('cuadra');
  });

  it('avisa cuando el total no llega al saldo final aunque las filas encadenen', () => {
    const f = [fila(1, 100_000, null), fila(2, -25_000, null)];
    const r = validarSaldos(f, { inicialCents: 1_000_000, finalCents: 1_200_000 });
    expect(r.estado).toBe('no-cuadra');
    expect(r.total?.diferenciaCents).toBe(125_000);
    expect(r.mensaje).toContain('el banco dice');
  });

  it('sin saldos no hay con qué comprobar, y lo dice', () => {
    const r = validarSaldos([fila(1, 100, null)], {});
    expect(r.estado).toBe('sin-datos');
  });
});

describe('cargos del banco por palabras clave', () => {
  const c = (d: string, m = -35_000) => clasificarCargoBancario(d, m).esCargo;
  it('reconoce comisiones, mantenimiento, 0.15 % e ITBIS', () => {
    expect(c('COMISION POR TRANSFERENCIA')).toBe(true);
    expect(c('Cargo por mantenimiento de cuenta')).toBe(true);
    expect(c('IMPUESTO 0.15% LEY 288-04')).toBe(true);
    expect(c('ITBIS COMISIONES')).toBe(true);
    expect(c('Cargo por servicio')).toBe(true);
    expect(c('Impuesto transferencia electrónica')).toBe(true);
  });
  it('no confunde un pago de impuestos o una entrada con un cargo', () => {
    expect(c('PAGO IMPUESTO DGII')).toBe(false);
    expect(c('Pago TSS')).toBe(false);
    expect(c('Transferencia a Juan Perez')).toBe(false);
    expect(c('COMISION AHORRO', 35_000)).toBe(false); // entró dinero: no es cargo
    expect(c(null as unknown as string)).toBe(false);
  });
});

describe('una línea del banco = suma de varios cobros del libro', () => {
  const linea: LineaAyuda = { id: 1, fecha: '2026-10-14', descripcion: 'DEPOSITO', referencia: null, montoCents: 1_500_000 };
  const ap = (id: number, monto: number, fecha = '2026-10-14'): ApunteLibro => ({ lineaId: id, fecha, concepto: `Cobro ${id}`, montoCents: monto });

  it('encuentra 3 cobros del mismo día que suman el depósito', () => {
    const p = detectarSuma(linea, [ap(10, 500_000), ap(11, 700_000), ap(12, 300_000), ap(13, 999_00)]);
    expect(p?.apuntes.map((a) => a.lineaId)).toEqual([10, 11, 12]);
  });
  it('no mira apuntes a más de 3 días ni de otro signo', () => {
    expect(detectarSuma(linea, [ap(10, 500_000, '2026-10-01'), ap(11, 1_000_000), ap(12, -500_000)])).toBeNull();
  });
  it('un solo apunte no es una suma', () => {
    expect(detectarSuma(linea, [ap(10, 1_500_000)])).toBeNull();
  });
});

describe('el resumen de arriba', () => {
  it('cuenta cargos y depósitos como lo pidió el dueño', () => {
    expect(resumenParaCuadrar({ cargos: [{ montoCents: -35_000 }, { montoCents: -10_974 }], depositos: [{ montoCents: 1_500_000 }], otrosRetiros: [] }))
      .toBe('Para cuadrar te faltan: 2 cargos del banco (RD$459.74) y 1 depósito de RD$15,000.00.');
  });
  it('sin nada pendiente lo dice', () => {
    expect(resumenParaCuadrar({ cargos: [], depositos: [], otrosRetiros: [] })).toBe('No te falta nada por registrar para cuadrar.');
  });
});

describe('ayudaDeterminista', () => {
  it('sugiere cargo solo si el libro no tiene ya un apunte igual', () => {
    const cargo: LineaAyuda = { id: 1, fecha: '2026-10-05', descripcion: 'COMISION', referencia: null, montoCents: -35_000 };
    const igual: ApunteLibro = { lineaId: 9, fecha: '2026-10-06', concepto: 'Cargo', montoCents: -35_000 };
    expect(ayudaDeterminista([cargo], []).sugerencias[0].tipo).toBe('gasto-bancario');
    expect(ayudaDeterminista([cargo], [igual]).sugerencias).toEqual([]);
  });
});

// ── CSV / Excel: el modelo solo dice las columnas ────────────────────────────

const matrizRara = () => [
  ['Banco Ejemplo'], ['Cuenta 123'], [],
  ['Fch', 'Detalle de mov', 'Nro', 'Sale', 'Entra', 'Bal'],
  ['03/25/2026', 'DEPOSITO', '0001', '', '1,500.00', '11,500.00'],
  ['03/26/2026', 'COMISION', '0002', '350.00', '', '11,150.00'],
];
const mapeoBueno: MapeoModelo = {
  filaEncabezado: 3, fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, monto: null, saldo: 5, tipo: null,
  ordenFecha: 'mdy', montoInvertido: false, confianza: 0.9,
};

describe('mapeo de columnas con IA', () => {
  it('las reglas no reconocen este archivo, el mapeo sí; los montos los lee el código', () => {
    expect(() => interpretarExtracto(matrizRara())).toThrow(ExtractoError);
    try { interpretarExtracto(matrizRara()); } catch (e) { expect(faltanColumnas(e)).toBe(true); }

    const m = limpiarMapeo(mapeoBueno, matrizRara())!;
    const l = aplicarMapeo(matrizRara(), m);
    expect(l.filas.map((f) => [f.fecha, f.montoCents, f.saldoCents, f.fila])).toEqual([
      ['2026-03-25', 150_000, 1_150_000, 5],
      ['2026-03-26', -35_000, 1_115_000, 6],
    ]);
    expect(l.columnas.fecha).toBe('Fch');
  });

  it('monto invertido (tarjeta): los cargos positivos salen como salidas', () => {
    const matriz = [['Fecha', 'Concepto', 'Importe'], ['01/10/2026', 'COMPRA', '100.00'], ['02/10/2026', 'PAGO', '-100.00']];
    const m = limpiarMapeo({ ...mapeoBueno, filaEncabezado: 0, fecha: 0, descripcion: 1, referencia: null, debito: null, credito: null, monto: 2, saldo: null, ordenFecha: 'dmy', montoInvertido: true }, matriz)!;
    expect(aplicarMapeo(matriz, m).filas.map((f) => f.montoCents)).toEqual([-10_000, 10_000]);
  });

  it('descarta un mapa con índices fuera de la tabla, columnas repetidas o sin fecha/monto', () => {
    const base = matrizRara();
    expect(limpiarMapeo({ ...mapeoBueno, saldo: 40 }, base)).toBeNull();
    expect(limpiarMapeo({ ...mapeoBueno, descripcion: 0 }, base)).toBeNull();
    expect(limpiarMapeo({ ...mapeoBueno, fecha: null }, base)).toBeNull();
    expect(limpiarMapeo({ ...mapeoBueno, debito: null, credito: null, monto: null }, base)).toBeNull();
    expect(limpiarMapeo({ ...mapeoBueno, filaEncabezado: null }, base)).toBeNull();
    expect(limpiarMapeo({ ...mapeoBueno, filaEncabezado: 30 }, base)).toBeNull();
  });

  it('con un modelo falso: manda solo una muestra y devuelve la vista', async () => {
    let visto = '';
    const llamar: LlamadaModelo = async (p) => { visto = p.texto ?? ''; return { salida: mapeoBueno, modelo: 'falso/modelo' }; };
    const r = await mapearColumnasConIa(matrizRara(), { llamar });
    expect(visto).toContain('fila 3 | Fch');
    expect(r.metodo).toBe('ia-columnas');
    expect(r.filasIa).toEqual([]);
    expect(r.lectura.filas).toHaveLength(2);
  });

  it('una salida que no cumple el esquema es un error claro, no un cuelgue', async () => {
    const llamar: LlamadaModelo = async () => ({ salida: { cualquier: 'cosa' }, modelo: 'x' });
    await expect(mapearColumnasConIa(matrizRara(), { llamar })).rejects.toBeInstanceOf(LecturaIaError);
  });

  it('un mapa que la IA da pero no produce movimientos es un error, no un archivo vacío', async () => {
    const llamar: LlamadaModelo = async () => ({ salida: { ...mapeoBueno, filaEncabezado: 5 }, modelo: 'x' });
    await expect(mapearColumnasConIa(matrizRara(), { llamar })).rejects.toBeInstanceOf(LecturaIaError);
  });
});

// ── PDF ──────────────────────────────────────────────────────────────────────

const pdfBytes = (extra = '') => Buffer.from(`%PDF-1.4 ${extra}`);
const salidaPdf = (o: Partial<SalidaPdf> = {}): SalidaPdf => ({
  esEstadoDeCuenta: true, banco: 'Banco X', moneda: 'DOP', periodoDesde: '2026-10-01', periodoHasta: '2026-10-31',
  saldoInicial: 10_000, saldoFinal: 11_150,
  movimientos: [
    { fecha: '2026-10-05', descripcion: 'DEPOSITO', referencia: '0001', monto: 1_500, saldo: 11_500 },
    { fecha: '2026-10-06', descripcion: 'COMISION', referencia: null, monto: -350, saldo: 11_150 },
  ],
  confianza: 0.95, ...o,
});
const TEXTO = `Estado de cuenta ${'movimiento 12345 '.repeat(40)}`;
const hoy = '2026-11-06';

describe('PDF con IA', () => {
  it('con texto usable, el modelo lee el texto (no el archivo) y la lectura cuadra', async () => {
    let pet: { texto?: string; archivo?: unknown } = {};
    const llamar: LlamadaModelo = async (p) => { pet = p; return { salida: salidaPdf(), modelo: 'falso/a' }; };
    const r = await leerPdfConIa(pdfBytes(), { llamar, hoy, extraerTexto: async () => ({ texto: TEXTO, paginas: 2 }) });
    expect(pet.archivo).toBeUndefined();
    expect(pet.texto).toContain('Estado de cuenta');
    expect(r.metodo).toBe('ia-pdf');
    expect(r.comprobacion.estado).toBe('cuadra');
    expect(r.lectura.filas.map((f) => f.montoCents)).toEqual([150_000, -35_000]);
    expect(r.filasIa).toEqual([1, 2]);
  });

  it('escaneado (sin texto) o con la librería caída, se manda el PDF como archivo', async () => {
    let archivo: unknown;
    const llamar: LlamadaModelo = async (p) => { archivo = p.archivo; return { salida: salidaPdf(), modelo: 'falso/a' }; };
    for (const extraer of [async () => ({ texto: '  ', paginas: 1 }), async () => null, async () => { throw new Error('boom'); }]) {
      archivo = undefined;
      const r = await leerPdfConIa(pdfBytes(), { llamar, hoy, extraerTexto: extraer });
      expect(archivo).toBeTruthy();
      expect(r.metodo).toBe('ia-pdf-archivo');
    }
  });

  it('un monto mal leído se marca en la vista previa', async () => {
    const mala = salidaPdf({ movimientos: [
      { fecha: '2026-10-05', descripcion: 'DEPOSITO', referencia: null, monto: 1_500, saldo: 11_500 },
      { fecha: '2026-10-06', descripcion: 'COMISION', referencia: null, monto: -530, saldo: 11_150 },
    ] });
    const r = await leerPdfConIa(pdfBytes(), { llamar: async () => ({ salida: mala, modelo: 'x' }), hoy, extraerTexto: async () => ({ texto: TEXTO, paginas: 1 }) });
    expect(r.comprobacion.estado).toBe('no-cuadra');
    const v = armarVistaIa(r);
    expect(v.filas.map((f) => f.dudosa)).toEqual([false, true]);
    expect(v.filas.every((f) => f.porIa)).toBe(true);
  });

  it('rechaza lo que no es PDF, lo muy grande, de muchas páginas, o que no es un estado de cuenta', async () => {
    const llamar: LlamadaModelo = async () => ({ salida: salidaPdf(), modelo: 'x' });
    const deps = { llamar, hoy, extraerTexto: async () => ({ texto: TEXTO, paginas: 2 }) };
    await expect(leerPdfConIa(Buffer.from('hola mundo'), deps)).rejects.toThrow('no es un PDF');
    await expect(leerPdfConIa(Buffer.concat([pdfBytes(), Buffer.alloc(10 * 1024 * 1024)]), deps)).rejects.toThrow('10 MB');
    await expect(leerPdfConIa(pdfBytes(), { ...deps, extraerTexto: async () => ({ texto: TEXTO, paginas: 31 }) })).rejects.toThrow('31 páginas');
    await expect(leerPdfConIa(pdfBytes(), { ...deps, llamar: async () => ({ salida: salidaPdf({ esEstadoDeCuenta: false, movimientos: [] }), modelo: 'x' }) })).rejects.toThrow('no parece un estado de cuenta');
    await expect(leerPdfConIa(pdfBytes(), { ...deps, llamar: async () => ({ salida: salidaPdf({ movimientos: [] }), modelo: 'x' }) })).rejects.toThrow('No encontré movimientos');
  });

  it('avisa si el estado está en dólares', async () => {
    const r = await leerPdfConIa(pdfBytes(), { llamar: async () => ({ salida: salidaPdf({ moneda: 'USD' }), modelo: 'x' }), hoy, extraerTexto: async () => ({ texto: TEXTO, paginas: 1 }) });
    expect(r.avisos.join(' ')).toContain('dólares');
  });
});

describe('limpiar lo que devuelve el modelo', () => {
  it('pesos a centavos, y más de dos decimales se rechaza', () => {
    expect(pesosACentavos(1234.5)).toBe(123_450);
    expect(pesosACentavos(-0.1)).toBe(-10);
    expect(pesosACentavos(10.005)).toBeNull();
    expect(pesosACentavos(1e12)).toBeNull();
    expect(pesosACentavos('5' as unknown)).toBeNull();
    expect(pesosACentavos(NaN)).toBeNull();
  });

  it('fechas imposibles, futuras o con otro formato', () => {
    const s = salidaPdf({ movimientos: [
      { fecha: '2026-02-31', descripcion: 'a', referencia: null, monto: 1, saldo: null },
      { fecha: '2027-01-01', descripcion: 'b', referencia: null, monto: 1, saldo: null },
      { fecha: '05/10/2026', descripcion: 'c', referencia: null, monto: 1, saldo: null },
      { fecha: '2026-10-05', descripcion: 'd', referencia: null, monto: 10.123, saldo: null },
      { fecha: '2026-10-05', descripcion: 'e', referencia: null, monto: 0, saldo: null },
    ] });
    const l = limpiarFilasIa(s, hoy);
    expect(l.filas.map((f) => f.fecha)).toEqual(['2026-10-05']);
    expect(l.errores.map((e) => e.fila)).toEqual([1, 2, 4]);
  });
});

describe('lo que llega al confirmar se valida otra vez', () => {
  it('acepta filas sanas y recorta textos', () => {
    const r = limpiarFilasConfirmadas([{ fila: 1, fecha: '2026-10-05', descripcion: ' x '.repeat(200), referencia: 'R1', montoCents: -500, saldoCents: null }], hoy);
    expect(r.filas[0].descripcion!.length).toBeLessThanOrEqual(300);
    expect(r.filas[0].montoCents).toBe(-500);
  });
  it('rechaza montos con decimales, cero, enormes, fechas malas, o nada', () => {
    const ok = { fecha: '2026-10-05', montoCents: 100 };
    expect(() => limpiarFilasConfirmadas([{ ...ok, montoCents: 1.5 }], hoy)).toThrow(ExtractoError);
    expect(() => limpiarFilasConfirmadas([{ ...ok, montoCents: 0 }], hoy)).toThrow(ExtractoError);
    expect(() => limpiarFilasConfirmadas([{ ...ok, montoCents: 1e15 }], hoy)).toThrow(ExtractoError);
    expect(() => limpiarFilasConfirmadas([{ ...ok, fecha: '2026-13-01' }], hoy)).toThrow(ExtractoError);
    expect(() => limpiarFilasConfirmadas([], hoy)).toThrow(ExtractoError);
    expect(() => limpiarFilasConfirmadas('x', hoy)).toThrow(ExtractoError);
  });
});

// ── Ayuda: salida del modelo contra los candidatos ───────────────────────────

describe('sugerencias de la IA contra lo que se le dio', () => {
  const linea: LineaAyuda = { id: 7, fecha: '2026-10-10', descripcion: 'TRANSF COLEGIO PEREZ', referencia: 'R9', montoCents: 500_000 };
  const igual: ApunteLibro = { lineaId: 100, fecha: '2026-10-09', concepto: 'Cobro F-12', montoCents: 500_000 };
  const parecido: ApunteLibro = { lineaId: 101, fecha: '2026-10-09', concepto: 'Cobro F-13', montoCents: 490_000 };
  const entradas: EntradaAyudaIa[] = [{
    linea, libro: [igual, parecido],
    clientes: [{ clienteId: 5, nombre: 'Colegio Perez SRL', rnc: null, abiertas: [] }],
  }];
  const s = (o: Record<string, unknown>) => ({ sugerencias: [{ lineaId: 7, tipo: 'emparejar', libroLineaId: null, clienteId: null, razon: 'Coincide', confianza: 0.9, ...o }] }) as never;

  it('acepta un emparejamiento con un candidato de monto igual', () => {
    const r = limpiarSugerenciasIa(s({ libroLineaId: 100 }), entradas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'emparejar', accionable: true });
  });
  it('un candidato de monto distinto baja a «revisar», sin botón de aceptar', () => {
    const r = limpiarSugerenciasIa(s({ libroLineaId: 101 }), entradas);
    expect(r[0]).toMatchObject({ tipo: 'revisar', accionable: false });
    expect(r[0].razon).toContain('RD$100');
  });
  it('descarta ids inventados, líneas que no se pidieron, baja confianza y razones vacías', () => {
    expect(limpiarSugerenciasIa(s({ libroLineaId: 999 }), entradas)).toEqual([]);
    expect(limpiarSugerenciasIa(s({ lineaId: 8, libroLineaId: 100 }), entradas)).toEqual([]);
    expect(limpiarSugerenciasIa(s({ libroLineaId: 100, confianza: 0.1 }), entradas)).toEqual([]);
    expect(limpiarSugerenciasIa(s({ libroLineaId: 100, razon: '  ' }), entradas)).toEqual([]);
    expect(limpiarSugerenciasIa(s({ tipo: 'ninguna' }), entradas)).toEqual([]);
  });
  it('un cliente solo si salió de la búsqueda, con el enlace a sus cobros', () => {
    const ok = limpiarSugerenciasIa(s({ tipo: 'cliente', clienteId: 5 }), entradas);
    expect(ok[0]).toMatchObject({ tipo: 'cliente', clienteNombre: 'Colegio Perez SRL', accionable: false });
    expect((ok[0] as { href: string }).href).toBe('/dashboard/cuentas-por-cobrar?clienteId=5');
    expect(limpiarSugerenciasIa(s({ tipo: 'cliente', clienteId: 6 }), entradas)).toEqual([]);
  });
  it('una sola sugerencia por línea', () => {
    const doble = { sugerencias: [
      { lineaId: 7, tipo: 'emparejar', libroLineaId: 100, clienteId: null, razon: 'a', confianza: 0.9 },
      { lineaId: 7, tipo: 'cliente', libroLineaId: null, clienteId: 5, razon: 'b', confianza: 0.9 },
    ] } as never;
    expect(limpiarSugerenciasIa(doble, entradas)).toHaveLength(1);
  });
});

describe('qué ve el modelo', () => {
  it('candidatos de libro: mismo signo, cerca en fecha y monto, y pocos', () => {
    const linea: LineaAyuda = { id: 1, fecha: '2026-10-10', descripcion: null, referencia: null, montoCents: 100_000 };
    const libro: ApunteLibro[] = [
      { lineaId: 1, fecha: '2026-10-11', concepto: 'a', montoCents: 100_000 },
      { lineaId: 2, fecha: '2026-10-11', concepto: 'b', montoCents: -100_000 },
      { lineaId: 3, fecha: '2026-06-01', concepto: 'c', montoCents: 100_000 },
      { lineaId: 4, fecha: '2026-10-11', concepto: 'd', montoCents: 900_000 },
    ];
    expect(candidatosLibro(linea, libro).map((a) => a.lineaId)).toEqual([1]);
  });
  it('clientes: nombre completo, RNC, o dos palabras; una palabra suelta no basta', () => {
    const cs = [
      { id: 1, razonSocial: 'Colegio San Judas SRL', rnc: '131234567' },
      { id: 2, razonSocial: 'Ferreteria Lopez', rnc: null },
      { id: 3, razonSocial: 'Juan Perez', rnc: null },
    ];
    expect(clientesEnDescripcion('TRANSF COLEGIO SAN JUDAS TADEO', cs)).toEqual([1]);
    expect(clientesEnDescripcion('DEP RNC 131234567', cs)).toEqual([1]);
    expect(clientesEnDescripcion('PAGO FERRETERIA', cs)).toEqual([]);
    expect(clientesEnDescripcion('TRANSF', cs)).toEqual([]);
  });
});

// ── Interruptor y tope ───────────────────────────────────────────────────────

describe('quién puede llamar al modelo', () => {
  const siempre = async () => ({ allowed: true });
  it('CONCILIACION_IA=0 (o false/off) apaga todo; vacío o cualquier otra cosa lo deja encendido', async () => {
    expect(conciliacionIaActiva({ CONCILIACION_IA: '0' })).toBe(false);
    expect(conciliacionIaActiva({ CONCILIACION_IA: 'off' })).toBe(false);
    expect(conciliacionIaActiva({})).toBe(true);
    expect(conciliacionIaActiva({ CONCILIACION_IA: '1' })).toBe(true);
    const r = await permitirUsoIa('lectura', 1, siempre, { CONCILIACION_IA: '0' });
    expect(r).toMatchObject({ ok: false, motivo: 'apagada', status: 503 });
  });
  it('el tope es por empresa y tipo: 30 lecturas y 20 ayudas por hora', async () => {
    const llamadas: [string, number, number][] = [];
    const limitar = async (k: string, max: number, ms: number) => { llamadas.push([k, max, ms]); return { allowed: true }; };
    await permitirUsoIa('lectura', 7, limitar, {});
    await permitirUsoIa('ayuda', 7, limitar, {});
    expect(llamadas).toEqual([['conciliacion-ia-lectura:7', 30, 3600_000], ['conciliacion-ia-ayuda:7', 20, 3600_000]]);
    expect(LIMITES_IA).toEqual({ lectura: 30, ayuda: 20 });
  });
  it('pasado el tope: 429; y si el contador falla, NO se llama (falla cerrado)', async () => {
    expect(await permitirUsoIa('ayuda', 1, async () => ({ allowed: false }), {})).toMatchObject({ ok: false, motivo: 'limite', status: 429 });
    expect(await permitirUsoIa('ayuda', 1, async () => { throw new Error('db'); }, {})).toMatchObject({ ok: false, status: 503 });
    expect(await permitirUsoIa('ayuda', 1, siempre, {})).toEqual({ ok: true });
  });
});

describe('la parte «conciliacion» de /admin/ia', () => {
  it('existe con Haiku de principal y Gemini Flash de respaldo, y se puede cambiar', async () => {
    const { USOS_IA, elegirModelos, usosIa, validarAjusteModelos } = await import('@/lib/ia/modelos');
    expect(USOS_IA).toContain('conciliacion');
    expect(usosIa().find((u) => u.uso === 'conciliacion')?.nombre).toBe('Contabilidad: leer estado de cuenta y conciliar');
    expect(elegirModelos(null, 'conciliacion')).toEqual({ principal: 'anthropic/claude-haiku-5.5', respaldo: 'google/gemini-2.5-flash' });
    expect(validarAjusteModelos({ conciliacion: { principal: 'anthropic/claude-sonnet-5.5', respaldo: 'google/gemini-2.5-flash' } }).ok).toBe(true);
  });
});
