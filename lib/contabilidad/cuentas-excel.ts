/**
 * lib/contabilidad/cuentas-excel.ts — El catálogo de cuentas ida y vuelta por
 * Excel: qué columnas lleva el archivo y cómo se lee una fila.
 *
 * La idea es el ciclo completo: se exporta el catálogo, el contador lo trabaja
 * en Excel —que es donde vive un plan de cuentas de verdad— y se vuelve a subir.
 * Por eso el archivo de exportación ES la plantilla de importación: mismas
 * columnas, mismos nombres, mismas etiquetas.
 *
 * Aquí no hay base de datos. Lo que toca la base —crear, editar, las reglas de
 * movimientos y ciclos— vive en `cuentas-importar.ts`, que reutiliza las mismas
 * funciones que el formulario. Separado así, leer el archivo se puede probar sin
 * levantar nada.
 */

import type { TipoCuenta, NaturalezaCuenta } from './catalogo-base';

/** Encabezados tal como salen en el archivo exportado, en orden. */
export const COLUMNAS_EXCEL = [
  'Código',
  'Nombre',
  'Tipo',
  'Naturaleza',
  'Código cuenta padre',
  'Acepta movimientos',
  'Activa',
] as const;

export const ETIQUETA_TIPO: Record<TipoCuenta, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Patrimonio',
  ingreso: 'Ingresos',
  costo: 'Costos',
  gasto: 'Gastos',
};

export const ETIQUETA_NATURALEZA: Record<NaturalezaCuenta, string> = {
  deudora: 'Deudora',
  acreedora: 'Acreedora',
};

/** Más de esto no es un plan de cuentas, es un archivo equivocado. */
export const MAX_FILAS_IMPORTACION = 2000;

/** Una fila del archivo, ya interpretada. `undefined` = la celda venía vacía. */
export interface FilaCatalogo {
  /** Número de fila en Excel (1 = encabezado), para decirle al usuario dónde mirar. */
  fila: number;
  codigo: string;
  nombre?: string;
  tipo?: TipoCuenta;
  naturaleza?: NaturalezaCuenta;
  /** Vacío en el archivo = cuenta raíz. `undefined` = la columna no venía. */
  padreCodigo?: string | null;
  imputable?: boolean;
  activa?: boolean;
}

export interface ErrorFila {
  fila: number;
  codigo: string;
  mensaje: string;
}

// ─── Normalización ───────────────────────────────────────────────────────────

/** Minúsculas, sin tildes ni espacios sobrantes: «Código » y «codigo» son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El texto de una celda de ExcelJS, venga como venga.
 *
 * Un código `1101` tecleado en Excel llega como NÚMERO, no como texto; una celda
 * con formato llega como `richText`; una fórmula, con su `result`; un enlace,
 * con `text`. Tratar solo el caso string dejaría fuera la mitad de los archivos
 * reales.
 */
export function textoCelda(valor: unknown): string {
  if (valor == null) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((t) => t.text ?? '').join('').trim();
    }
    if ('result' in v) return textoCelda(v.result);
    if ('text' in v) return textoCelda(v.text);
  }
  return String(valor).trim();
}

const TIPOS_ACEPTADOS: Record<string, TipoCuenta> = {
  activo: 'activo', activos: 'activo',
  pasivo: 'pasivo', pasivos: 'pasivo',
  patrimonio: 'patrimonio', capital: 'patrimonio',
  ingreso: 'ingreso', ingresos: 'ingreso',
  costo: 'costo', costos: 'costo',
  gasto: 'gasto', gastos: 'gasto',
};

export function leerTipo(texto: string): TipoCuenta | null {
  return TIPOS_ACEPTADOS[normalizar(texto)] ?? null;
}

export function leerNaturaleza(texto: string): NaturalezaCuenta | null {
  const t = normalizar(texto);
  if (t === 'deudora' || t === 'd' || t === 'debito') return 'deudora';
  if (t === 'acreedora' || t === 'a' || t === 'credito') return 'acreedora';
  return null;
}

export function leerSiNo(texto: string): boolean | null {
  const t = normalizar(texto);
  // «Activa»/«Inactiva» porque la columna puede llamarse «Estado» y traer eso.
  if (['si', 's', 'x', 'true', '1', 'verdadero', 'yes', 'activa', 'activo'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'falso', 'inactiva', 'inactivo', 'desactivada'].includes(t)) return false;
  return null;
}

// ─── Lectura de la hoja ──────────────────────────────────────────────────────

type Campo = 'codigo' | 'nombre' | 'tipo' | 'naturaleza' | 'padre' | 'imputable' | 'activa';

/** Cómo puede llamarse cada columna. Se compara ya normalizado. */
const ALIAS: Record<Campo, string[]> = {
  codigo:     ['codigo', 'codigo cuenta', 'cuenta'],
  nombre:     ['nombre', 'nombre cuenta', 'descripcion'],
  tipo:       ['tipo', 'clase'],
  naturaleza: ['naturaleza'],
  padre:      ['codigo cuenta padre', 'cuenta padre', 'codigo padre', 'padre'],
  imputable:  ['acepta movimientos', 'imputable', 'acepta'],
  activa:     ['activa', 'activo?', 'estado'],
};

/**
 * Busca la fila de encabezado en las primeras 10 y devuelve dónde está cada
 * columna. Se busca en vez de asumir la fila 1 porque un contador suele poner
 * un título o el nombre de la empresa encima.
 */
function ubicarColumnas(filas: unknown[][]): { filaEncabezado: number; indice: Partial<Record<Campo, number>> } | null {
  for (let r = 0; r < Math.min(filas.length, 10); r++) {
    const celdas = (filas[r] ?? []).map((c) => normalizar(textoCelda(c)));
    const indice: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(ALIAS) as Campo[]) {
      const i = celdas.findIndex((c) => ALIAS[campo].includes(c));
      if (i >= 0) indice[campo] = i;
    }
    // Código y nombre son el mínimo para saber que esta es la fila buena.
    if (indice.codigo !== undefined && indice.nombre !== undefined) {
      return { filaEncabezado: r, indice };
    }
  }
  return null;
}

/**
 * Convierte las filas crudas de la hoja en filas del catálogo.
 *
 * `filas` es la hoja como matriz, fila 0 = fila 1 de Excel. Los errores de
 * formato —un tipo que no existe, un «tal vez» en «Acepta movimientos»— salen
 * aquí, antes de tocar la base, con el número de fila de Excel.
 */
export function leerFilasCatalogo(filas: unknown[][]): {
  filas: FilaCatalogo[];
  errores: ErrorFila[];
  /** Columnas que el archivo SÍ trae: lo que no venga no se toca al actualizar. */
  columnas: Campo[];
} {
  const errores: ErrorFila[] = [];
  const ubicacion = ubicarColumnas(filas);
  if (!ubicacion) {
    return {
      filas: [],
      errores: [{
        fila: 1, codigo: '',
        mensaje: 'No se encontró la fila de encabezados. El archivo necesita al menos las columnas «Código» y «Nombre». Descarga el catálogo para usarlo de plantilla.',
      }],
      columnas: [],
    };
  }

  const { filaEncabezado, indice } = ubicacion;
  const columnas = Object.keys(indice) as Campo[];
  const leer = (fila: unknown[], campo: Campo) =>
    indice[campo] === undefined ? undefined : textoCelda(fila[indice[campo]!]);

  const resultado: FilaCatalogo[] = [];
  const vistos = new Map<string, number>();

  for (let r = filaEncabezado + 1; r < filas.length; r++) {
    const fila = filas[r] ?? [];
    const numero = r + 1;
    const codigo = leer(fila, 'codigo') ?? '';
    const nombre = leer(fila, 'nombre') ?? '';

    // Fila en blanco: se salta sin quejarse. Excel deja muchas al final.
    const todas = columnas.map((c) => leer(fila, c) ?? '');
    if (todas.every((t) => t === '')) continue;

    if (!codigo) {
      errores.push({ fila: numero, codigo: '', mensaje: 'Falta el código.' });
      continue;
    }
    if (vistos.has(codigo)) {
      errores.push({
        fila: numero, codigo,
        mensaje: `El código ${codigo} ya aparece en la fila ${vistos.get(codigo)}. Cada cuenta va una sola vez.`,
      });
      continue;
    }
    vistos.set(codigo, numero);

    const item: FilaCatalogo = { fila: numero, codigo };
    if (nombre) item.nombre = nombre;

    const tipoTexto = leer(fila, 'tipo');
    if (tipoTexto) {
      const tipo = leerTipo(tipoTexto);
      if (!tipo) {
        errores.push({
          fila: numero, codigo,
          mensaje: `Tipo «${tipoTexto}» no reconocido. Usa: ${Object.values(ETIQUETA_TIPO).join(', ')}.`,
        });
        continue;
      }
      item.tipo = tipo;
    }

    const natTexto = leer(fila, 'naturaleza');
    if (natTexto) {
      const nat = leerNaturaleza(natTexto);
      if (!nat) {
        errores.push({ fila: numero, codigo, mensaje: `Naturaleza «${natTexto}» no reconocida. Usa Deudora o Acreedora.` });
        continue;
      }
      item.naturaleza = nat;
    }

    // El padre vacío SIGNIFICA algo —cuenta raíz—, así que se distingue de la
    // columna ausente: `null` es «sin padre», `undefined` es «no lo toques».
    if (indice.padre !== undefined) {
      const padre = leer(fila, 'padre') ?? '';
      if (padre === codigo) {
        errores.push({ fila: numero, codigo, mensaje: 'Una cuenta no puede ser su propia cuenta padre.' });
        continue;
      }
      item.padreCodigo = padre || null;
    }

    let valido = true;
    for (const campo of ['imputable', 'activa'] as const) {
      const texto = leer(fila, campo);
      if (!texto) continue;
      const v = leerSiNo(texto);
      if (v === null) {
        errores.push({
          fila: numero, codigo,
          mensaje: `«${texto}» en «${campo === 'imputable' ? 'Acepta movimientos' : 'Activa'}»: escribe Sí o No.`,
        });
        valido = false;
        break;
      }
      item[campo] = v;
    }
    if (!valido) continue;

    resultado.push(item);
  }

  if (resultado.length + errores.length > MAX_FILAS_IMPORTACION) {
    return {
      filas: [],
      errores: [{
        fila: 1, codigo: '',
        mensaje: `El archivo tiene más de ${MAX_FILAS_IMPORTACION} filas. Un plan de cuentas no llega a tanto: revisa que sea el archivo correcto.`,
      }],
      columnas,
    };
  }

  return { filas: resultado, errores, columnas };
}

/**
 * Ordena las filas para que cada padre vaya antes que sus hijas.
 *
 * Solo importa entre filas del MISMO archivo: si la hija se procesara primero,
 * su padre todavía no existiría y la regla «la cuenta padre no existe» la
 * rechazaría aunque el archivo sea correcto. Un ciclo dentro del archivo
 * (A padre de B, B padre de A) se reporta aquí, porque no hay orden que lo
 * resuelva.
 */
export function ordenarPadresPrimero(filas: FilaCatalogo[]): { ordenadas: FilaCatalogo[]; errores: ErrorFila[] } {
  const porCodigo = new Map(filas.map((f) => [f.codigo, f]));
  const estado = new Map<string, 'visitando' | 'hecho'>();
  const ordenadas: FilaCatalogo[] = [];
  const errores: ErrorFila[] = [];
  const enCiclo = new Set<string>();

  const visitar = (f: FilaCatalogo, camino: string[]): void => {
    const e = estado.get(f.codigo);
    if (e === 'hecho') return;
    if (e === 'visitando') {
      const desde = camino.indexOf(f.codigo);
      for (const c of camino.slice(desde)) enCiclo.add(c);
      return;
    }
    estado.set(f.codigo, 'visitando');
    const padre = f.padreCodigo ? porCodigo.get(f.padreCodigo) : undefined;
    if (padre) visitar(padre, [...camino, f.codigo]);
    estado.set(f.codigo, 'hecho');
    if (!enCiclo.has(f.codigo)) ordenadas.push(f);
  };

  for (const f of filas) visitar(f, []);

  for (const codigo of enCiclo) {
    const f = porCodigo.get(codigo)!;
    errores.push({
      fila: f.fila, codigo,
      mensaje: 'Forma un círculo con su cuenta padre dentro del archivo: una termina colgando de la otra.',
    });
  }

  return { ordenadas: ordenadas.filter((f) => !enCiclo.has(f.codigo)), errores };
}
