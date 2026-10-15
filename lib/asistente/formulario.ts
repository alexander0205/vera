/**
 * Formularios dentro del chat: el asistente manda un formulario (bloque
 * ```formulario) y la persona lo llena —o sube un archivo— sin salir del panel.
 *
 * Qué hace el asistente y qué no:
 *  - SOLO elige qué formulario mostrar y, a lo sumo, adelanta algunos valores.
 *    No elige la dirección a la que se envía ni arma el contenido: eso sale de
 *    este registro, que vive en código.
 *  - Enviar el formulario es un acto de la persona (botón «Crear»), con sus
 *    datos a la vista, y viaja a la MISMA ruta de la API que usa la pantalla
 *    equivalente, con su sesión: mismos permisos, mismas validaciones y mismo
 *    registro de auditoría. No hay una vía paralela para escribir.
 *  - Emitir un comprobante a la DGII es el único paso que no se deshace: pide
 *    una segunda confirmación con el total y el cliente a la vista.
 *
 * Este módulo es puro: lo usan el servidor (para reconocer el pedido) y el
 * panel (para dibujar, validar y armar lo que se envía).
 */

export type TipoCampo =
  | 'texto' | 'numero' | 'email' | 'select' | 'area' | 'fecha' | 'archivo'
  | 'cliente' | 'documento' | 'lineas';

export interface Campo {
  id: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  ayuda?: string;
  placeholder?: string;
  max?: number;
  opciones?: { valor: string; etiqueta: string }[];
  /** Solo `archivo`: extensiones aceptadas. */
  accept?: string;
  /** Solo `archivo`: cuántos admite. */
  multiple?: boolean;
}

export type Valores = Record<string, string>;
export type IdFormulario =
  | 'cliente' | 'producto' | 'cotizacion' | 'factura' | 'pago' | 'gasto' | 'anulacion' | 'notacredito' | 'notadebito'
  | 'importar-productos' | 'importar-clientes';

export interface DefFormulario {
  id: IdFormulario;
  titulo: string;
  descripcion: string;
  boton: string;
  /** Ruta de la API de la app (la misma de la pantalla). `{documentoId}` se completa al enviar. */
  endpoint: string;
  /**
   * `json`: los campos viajan como cuerpo JSON.
   * `csv`: sube el archivo en dos tiempos (resumen y confirmar).
   * `captura`: sube el archivo tal cual a la bandeja de gastos por revisar.
   */
  modo: 'json' | 'csv' | 'captura';
  campos: Campo[];
  /** Pantalla donde se ve lo creado, para el enlace del resultado. */
  pantalla: string;
}

const MAX_TEXTO = 255;
const MAX_LINEAS = 30;

const TASAS = [
  { valor: '0.18', etiqueta: '18 %' }, { valor: '0.16', etiqueta: '16 %' },
  { valor: '0', etiqueta: '0 %' }, { valor: 'exento', etiqueta: 'Exento' },
];

/** Métodos con los que se registra un cobro (los que ofrece la pantalla). */
export const METODOS_COBRO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'cheque', etiqueta: 'Cheque' },
];

/** Motivos de una nota de crédito y su código DGII de modificación. */
export const MOTIVOS_NOTA = [
  { valor: 'devolucion', etiqueta: 'Devolución de mercancía', codigo: 3 },
  { valor: 'error_precio', etiqueta: 'Error en el precio', codigo: 3 },
  { valor: 'descuento', etiqueta: 'Descuento no aplicado', codigo: 3 },
  { valor: 'cancelacion', etiqueta: 'Cancelación parcial', codigo: 3 },
  { valor: 'anulacion', etiqueta: 'Anulación de la operación', codigo: 1 },
  { valor: 'otro', etiqueta: 'Otro (explícalo)', codigo: 3 },
] as const;

/** Motivos de una nota de débito (cargos sobre una factura ya emitida). */
export const MOTIVOS_DEBITO = [
  { valor: 'cargo', etiqueta: 'Cargo adicional', codigo: 3 },
  { valor: 'error_precio', etiqueta: 'Corrección de monto a favor tuyo', codigo: 3 },
  { valor: 'mora', etiqueta: 'Interés o recargo por mora', codigo: 3 },
  { valor: 'otro', etiqueta: 'Otro (explícalo)', codigo: 3 },
] as const;

/** ¿Es una nota (crédito o débito) que modifica una factura? */
export const esNota = (id: string) => id === 'notacredito' || id === 'notadebito';

export const FORMULARIOS: Record<IdFormulario, DefFormulario> = {
  cliente: {
    id: 'cliente',
    titulo: 'Nuevo cliente',
    descripcion: 'Con nombre basta. El RNC o la cédula hacen falta para facturar con crédito fiscal.',
    boton: 'Crear cliente',
    endpoint: '/api/clientes',
    modo: 'json',
    pantalla: '/dashboard/clientes',
    campos: [
      { id: 'razonSocial', etiqueta: 'Nombre o razón social', tipo: 'texto', requerido: true, max: MAX_TEXTO, placeholder: 'Ej.: Colegio Andrés Bello SRL' },
      { id: 'rnc', etiqueta: 'RNC o cédula', tipo: 'texto', max: 20, placeholder: '9 dígitos (RNC) u 11 (cédula)', ayuda: 'Sin guiones; se aceptan con guiones también.' },
      { id: 'email', etiqueta: 'Correo', tipo: 'email', max: 120, placeholder: 'nombre@empresa.com' },
      { id: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', max: 30 },
      { id: 'direccion', etiqueta: 'Dirección', tipo: 'texto', max: 300 },
    ],
  },
  producto: {
    id: 'producto',
    titulo: 'Nuevo producto o servicio',
    descripcion: 'Lo vas a poder elegir con un clic al facturar.',
    boton: 'Crear producto',
    endpoint: '/api/productos',
    modo: 'json',
    pantalla: '/dashboard/productos',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: MAX_TEXTO, placeholder: 'Ej.: Uniforme escolar' },
      {
        id: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true,
        opciones: [{ valor: 'servicio', etiqueta: 'Servicio' }, { valor: 'bien', etiqueta: 'Producto (bien)' }],
      },
      { id: 'precio', etiqueta: 'Precio (RD$)', tipo: 'numero', requerido: true, placeholder: '0.00', ayuda: 'Antes de ITBIS.' },
      { id: 'tasaItbis', etiqueta: 'ITBIS', tipo: 'select', requerido: true, opciones: TASAS },
      { id: 'referencia', etiqueta: 'Referencia o código', tipo: 'texto', max: 100 },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'area', max: 1000 },
    ],
  },
  cotizacion: {
    id: 'cotizacion',
    titulo: 'Nueva cotización',
    descripcion: 'Se guarda como borrador; después la envías o la conviertes en factura.',
    boton: 'Crear cotización',
    endpoint: '/api/cotizaciones',
    modo: 'json',
    pantalla: '/dashboard/cotizaciones',
    campos: [
      { id: 'cliente', etiqueta: 'Cliente', tipo: 'cliente', ayuda: 'Búscalo por nombre o RNC, o escribe un nombre libre.' },
      { id: 'fechaVencimiento', etiqueta: 'Válida hasta', tipo: 'fecha' },
      { id: 'lineas', etiqueta: 'Qué cotizas', tipo: 'lineas', requerido: true },
      { id: 'notas', etiqueta: 'Notas', tipo: 'area', max: 1000 },
    ],
  },
  factura: {
    id: 'factura',
    titulo: 'Nueva factura',
    descripcion: 'Guárdala como borrador para revisarla, o emítela. Emitir un e-CF se envía a la DGII y no se deshace.',
    boton: 'Guardar borrador',
    endpoint: '/api/ecf/emitir',
    modo: 'json',
    pantalla: '/dashboard/facturas',
    campos: [
      {
        id: 'tipoEcf', etiqueta: 'Tipo de comprobante', tipo: 'select', requerido: true,
        opciones: [
          { valor: 'sin-ncf', etiqueta: 'Factura sin comprobante fiscal' },
          { valor: '32', etiqueta: 'Factura de consumo (e-CF)' },
          { valor: '31', etiqueta: 'Crédito fiscal (e-CF) — pide RNC' },
        ],
      },
      { id: 'cliente', etiqueta: 'Cliente', tipo: 'cliente', ayuda: 'Para crédito fiscal debe tener RNC o cédula.' },
      { id: 'lineas', etiqueta: 'Qué facturas', tipo: 'lineas', requerido: true },
      {
        id: 'pagoMetodo', etiqueta: '¿Ya te pagó?', tipo: 'select',
        opciones: [{ valor: '', etiqueta: 'No, queda por cobrar' }, ...METODOS_COBRO.map((m) => ({ valor: m.valor, etiqueta: `Sí, en ${m.etiqueta.toLowerCase()}` }))],
      },
      { id: 'notas', etiqueta: 'Notas', tipo: 'area', max: 1000 },
    ],
  },
  pago: {
    id: 'pago',
    titulo: 'Registrar un cobro',
    descripcion: 'Busca la factura y anota lo que te pagaron. Si no es el total, queda como pago parcial.',
    boton: 'Registrar cobro',
    endpoint: '/api/cuentas-por-cobrar/{documentoId}/pagos',
    modo: 'json',
    pantalla: '/dashboard/cuentas-por-cobrar',
    campos: [
      { id: 'documento', etiqueta: 'Factura', tipo: 'documento', requerido: true, ayuda: 'Busca por número, código o nombre del cliente.' },
      { id: 'monto', etiqueta: 'Monto cobrado (RD$)', tipo: 'numero', requerido: true, placeholder: '0.00' },
      { id: 'metodo', etiqueta: 'Método', tipo: 'select', requerido: true, opciones: METODOS_COBRO },
      { id: 'fechaPago', etiqueta: 'Fecha del cobro', tipo: 'fecha', requerido: true },
      { id: 'referencia', etiqueta: 'Referencia', tipo: 'texto', max: 100, ayuda: 'Número de transferencia, cheque o aprobación (opcional).' },
    ],
  },
  notacredito: {
    id: 'notacredito',
    titulo: 'Nota de crédito',
    descripcion: 'Corrige o devuelve parte (o todo) de una factura con comprobante e-CF. Parte de las líneas de la factura; ajusta lo que acreditas.',
    boton: 'Guardar borrador',
    endpoint: '/api/ecf/emitir',
    modo: 'json',
    pantalla: '/dashboard/notas-credito',
    campos: [
      { id: 'documento', etiqueta: 'Factura que corriges', tipo: 'documento', requerido: true, ayuda: 'Debe tener comprobante e-CF (31, 32…). Busca por número o cliente.' },
      { id: 'motivo', etiqueta: 'Motivo', tipo: 'select', requerido: true, opciones: MOTIVOS_NOTA.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta })) },
      { id: 'razonModificacion', etiqueta: 'Explica el motivo', tipo: 'texto', max: 200, ayuda: 'Obligatorio si elegiste «Otro».' },
      { id: 'lineas', etiqueta: 'Lo que acreditas', tipo: 'lineas', requerido: true },
    ],
  },
  notadebito: {
    id: 'notadebito',
    titulo: 'Nota de débito',
    descripcion: 'Agrega un cargo a una factura con comprobante e-CF (mora, un cargo olvidado, una corrección a tu favor). Las líneas son los cargos nuevos.',
    boton: 'Guardar borrador',
    endpoint: '/api/ecf/emitir',
    modo: 'json',
    pantalla: '/dashboard/notas-debito',
    campos: [
      { id: 'documento', etiqueta: 'Factura a la que cargas', tipo: 'documento', requerido: true, ayuda: 'Debe tener comprobante e-CF (31, 32…). Busca por número o cliente.' },
      { id: 'motivo', etiqueta: 'Motivo', tipo: 'select', requerido: true, opciones: MOTIVOS_DEBITO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta })) },
      { id: 'razonModificacion', etiqueta: 'Explica el motivo', tipo: 'texto', max: 200, ayuda: 'Obligatorio si elegiste «Otro».' },
      { id: 'lineas', etiqueta: 'Qué cargas', tipo: 'lineas', requerido: true },
    ],
  },
  anulacion: {
    id: 'anulacion',
    titulo: 'Anular una factura',
    descripcion: 'La factura queda anulada y no cuenta en tus ventas. Si tiene cobros registrados, no se anula desde aquí.',
    boton: 'Anular factura…',
    endpoint: '/api/facturas/{documentoId}/anular',
    modo: 'json',
    pantalla: '/dashboard/facturas',
    campos: [
      { id: 'documento', etiqueta: 'Factura', tipo: 'documento', requerido: true, ayuda: 'Busca por número, código o nombre del cliente.' },
      {
        id: 'tipoAnulacion', etiqueta: 'Motivo', tipo: 'select', requerido: true,
        opciones: [
          { valor: '04', etiqueta: 'Cesación de operaciones' },
          { valor: '03', etiqueta: 'Impresión defectuosa' },
          { valor: '02', etiqueta: 'Errores de impresión' },
          { valor: '01', etiqueta: 'Deterioro de factura pre-impresa' },
          { valor: '05', etiqueta: 'Pérdida o hurto de talonarios' },
        ],
      },
      { id: 'motivo', etiqueta: 'Nota interna', tipo: 'area', max: 500, ayuda: 'Opcional: por qué se anula.' },
    ],
  },
  gasto: {
    id: 'gasto',
    titulo: 'Subir una factura de gasto',
    descripcion: 'Sube la foto o el PDF del comprobante de tu proveedor. Queda en «por revisar» para que lo confirmes.',
    boton: 'Subir comprobante',
    endpoint: '/api/gastos/capturas',
    modo: 'captura',
    pantalla: '/dashboard/gastos',
    campos: [
      { id: 'archivos', etiqueta: 'Comprobante (PDF o imagen)', tipo: 'archivo', requerido: true, accept: '.pdf,image/*', multiple: true },
      { id: 'nota', etiqueta: 'Nota', tipo: 'texto', max: 300, ayuda: 'Opcional: para qué fue el gasto.' },
    ],
  },
  'importar-productos': {
    id: 'importar-productos',
    titulo: 'Importar productos desde un archivo',
    descripcion: 'Sube un CSV con las columnas Nombre, Referencia, Precio, ITBIS y Tipo. Verás un resumen antes de importar.',
    boton: 'Revisar archivo',
    endpoint: '/api/import/productos',
    modo: 'csv',
    pantalla: '/dashboard/productos',
    campos: [{ id: 'archivo', etiqueta: 'Archivo CSV', tipo: 'archivo', requerido: true, accept: '.csv,text/csv' }],
  },
  'importar-clientes': {
    id: 'importar-clientes',
    titulo: 'Importar clientes desde un archivo',
    descripcion: 'Sube un CSV con las columnas Nombre, RNC o cédula, Correo y Teléfono. Verás un resumen antes de importar.',
    boton: 'Revisar archivo',
    endpoint: '/api/import/clientes',
    modo: 'csv',
    pantalla: '/dashboard/clientes',
    campos: [{ id: 'archivo', etiqueta: 'Archivo CSV', tipo: 'archivo', requerido: true, accept: '.csv,text/csv' }],
  },
};

export const defFormulario = (id: string | null | undefined): DefFormulario | null =>
  id && Object.prototype.hasOwnProperty.call(FORMULARIOS, id) ? FORMULARIOS[id as IdFormulario] : null;

// ── Líneas (cotización y factura) ───────────────────────────────────────────

export interface Linea {
  nombre: string;
  cantidad: number;
  /** Precio unitario en RD$, antes de ITBIS. */
  precio: number;
  tasa: '0.18' | '0.16' | '0' | 'exento';
  productoId?: number;
  /** true = bien, false = servicio. */
  bien?: boolean;
  /** Beneficiario de la línea (colegios): hay que conservarlo al copiar de otra factura. */
  dependienteId?: number;
  dependienteNombre?: string;
}

export const lineaVacia = (): Linea => ({ nombre: '', cantidad: 1, precio: 0, tasa: '0.18' });

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lee las líneas guardadas en el valor del campo (JSON); `[]` si no son válidas. */
export function leerLineas(valor: string | undefined): Linea[] {
  if (!valor) return [];
  let crudo: unknown;
  try { crudo = JSON.parse(valor); } catch { return []; }
  if (!Array.isArray(crudo)) return [];
  const out: Linea[] = [];
  for (const x of crudo.slice(0, MAX_LINEAS)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const cantidad = Number(o.cantidad);
    const precio = Number(o.precio);
    const tasa = String(o.tasa ?? '0.18');
    out.push({
      nombre: limpiarValor(String(o.nombre ?? ''), MAX_TEXTO),
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      precio: Number.isFinite(precio) ? precio : 0,
      tasa: (['0.18', '0.16', '0', 'exento'] as const).includes(tasa as never) ? (tasa as Linea['tasa']) : '0.18',
      ...(Number.isInteger(o.productoId) && Number(o.productoId) > 0 ? { productoId: Number(o.productoId) } : {}),
      ...(typeof o.bien === 'boolean' ? { bien: o.bien } : {}),
      ...(Number.isInteger(o.dependienteId) && Number(o.dependienteId) > 0 ? { dependienteId: Number(o.dependienteId) } : {}),
      ...(typeof o.dependienteNombre === 'string' && o.dependienteNombre ? { dependienteNombre: limpiarValor(o.dependienteNombre, MAX_TEXTO) } : {}),
    });
  }
  return out;
}

export const guardarLineas = (l: Linea[]) => JSON.stringify(l);

/** Subtotal, ITBIS y total, con la misma cuenta que el documento (por línea, tasa sobre la base). */
export function totalesDeLineas(lineas: Linea[]): { subtotal: number; itbis: number; total: number } {
  let subtotal = 0;
  let itbis = 0;
  for (const l of lineas) {
    const base = l.cantidad * l.precio;
    subtotal += base;
    if (l.tasa === '0.18') itbis += base * 0.18;
    else if (l.tasa === '0.16') itbis += base * 0.16;
  }
  return { subtotal: redondear(subtotal), itbis: redondear(itbis), total: redondear(subtotal + itbis) };
}

// ── Valores adelantados por el asistente ────────────────────────────────────

/** Un valor que viene del modelo o de un dato: sin control, sin marcado y con tope. */
export function limpiarValor(v: string, max = MAX_TEXTO): string {
  return v
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Campos que solo la persona llena (el asistente nunca los adelanta). */
const SOLO_PERSONA = new Set<TipoCampo>(['archivo', 'documento', 'lineas']);

/**
 * Lee el cuerpo de un bloque ```formulario:
 *
 *   tipo: cliente
 *   razonSocial: Colegio Andrés Bello
 *
 * Devuelve `null` si el tipo no existe. Solo se aceptan campos del formulario;
 * un `select` solo admite valores de sus opciones. El cliente adelantado es
 * solo un texto de búsqueda: nunca un id, que la persona elige de la lista.
 */
export function parsearFormulario(cuerpo: string): { def: DefFormulario; valores: Valores } | null {
  const lineas = cuerpo.replace(/\r/g, '').split('\n');
  let tipo: string | null = null;
  const crudos: Valores = {};
  for (const l of lineas) {
    const m = l.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[1].toLowerCase() === 'tipo' && tipo === null) tipo = m[2].trim().toLowerCase();
    else crudos[m[1]] = m[2];
  }
  const def = defFormulario(tipo);
  if (!def) return null;

  const valores: Valores = {};
  for (const c of def.campos) {
    if (SOLO_PERSONA.has(c.tipo)) continue;
    const clave = c.tipo === 'cliente' ? 'clienteNombre' : c.id;
    const crudo = crudos[c.tipo === 'cliente' ? c.id : c.id] ?? (c.tipo === 'cliente' ? crudos.clienteNombre : undefined);
    if (crudo == null) continue;
    const v = limpiarValor(crudo, c.max ?? MAX_TEXTO);
    if (!v) continue;
    if (c.tipo === 'select') {
      if (c.opciones?.some((o) => o.valor === v)) valores[clave] = v;
      continue;
    }
    if (c.tipo === 'numero') {
      const n = Number(v.replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) valores[clave] = String(n);
      continue;
    }
    if (c.tipo === 'fecha') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) valores[clave] = v;
      continue;
    }
    valores[clave] = v;
  }
  return { def, valores };
}

/** El bloque de markdown con el que el asistente muestra un formulario. */
export function bloqueFormulario(id: IdFormulario, valores: Valores = {}): string {
  const def = FORMULARIOS[id];
  const lineas = [`tipo: ${id}`];
  for (const c of def.campos) {
    if (SOLO_PERSONA.has(c.tipo)) continue;
    const v = c.tipo === 'cliente' ? valores.clienteNombre : valores[c.id];
    if (v) lineas.push(`${c.id}: ${limpiarValor(v, c.max ?? MAX_TEXTO)}`);
  }
  return '```formulario\n' + lineas.join('\n') + '\n```';
}

// ── Validación y envío ──────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC = /^(\d{9}|\d{11}|(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{5,20})$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Errores por campo (vacío = se puede enviar). Mismas reglas de fondo que la API. */
export function validarFormulario(def: DefFormulario, valores: Valores): Record<string, string> {
  const e: Record<string, string> = {};
  for (const c of def.campos) {
    if (c.tipo === 'archivo') continue;
    if (c.tipo === 'lineas') {
      const ls = leerLineas(valores[c.id]).filter((l) => l.nombre || l.precio > 0);
      if (!ls.length) { e[c.id] = 'Agrega al menos una línea'; continue; }
      const mala = ls.find((l) => !l.nombre || !(l.cantidad > 0) || !(l.precio > 0));
      if (mala) e[c.id] = 'Cada línea necesita descripción, cantidad y un precio mayor a 0';
      continue;
    }
    if (c.tipo === 'documento') {
      if (c.requerido && !valores.documentoId) e[c.id] = 'Elige la factura de la lista';
      continue;
    }
    if (c.tipo === 'cliente') continue;
    const v = (valores[c.id] ?? '').trim();
    if (!v) {
      if (c.requerido) e[c.id] = 'Este dato es obligatorio';
      continue;
    }
    if (c.max && v.length > c.max) e[c.id] = `Máximo ${c.max} caracteres`;
    if (c.tipo === 'email' && !EMAIL.test(v)) e[c.id] = 'Correo inválido';
    if (c.tipo === 'fecha' && !FECHA.test(v)) e[c.id] = 'Fecha inválida';
    if (c.tipo === 'numero') {
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) e[c.id] = 'Escribe un número mayor o igual a 0';
      else if (def.id === 'pago' && n <= 0) e[c.id] = 'El monto debe ser mayor a 0';
    }
    if (c.tipo === 'select' && !c.opciones?.some((o) => o.valor === v)) e[c.id] = 'Elige una opción';
    if (def.id === 'cliente' && c.id === 'rnc') {
      const d = v.replace(/[-\s]/g, '').toUpperCase();
      if (!DOC.test(d)) e[c.id] = 'RNC (9 dígitos), cédula (11) o pasaporte';
    }
  }
  if (esNota(def.id)) {
    if (valores.documentoId && !(valores.ncfModificado ?? '').trim() && !e.documento) {
      e.documento = valores.documentoError || 'Esa factura no tiene comprobante e-CF; la nota se hace desde su pantalla.';
    }
    if (valores.motivo === 'otro' && !(valores.razonModificacion ?? '').trim()) e.razonModificacion = 'Explica el motivo';
    const total = totalesDeLineas(lineasLlenas(valores)).total;
    const tope = Number(valores.documentoTotal);
    if (def.id === 'notacredito' && !e.lineas && Number.isFinite(tope) && tope > 0 && total > tope + 0.005) {
      e.lineas = `La nota no puede ser mayor que la factura (RD$ ${tope.toLocaleString('es-DO', { minimumFractionDigits: 2 })}).`;
    }
  }
  if (def.id === 'factura' && valores.tipoEcf === '31' && !(valores.clienteRnc ?? '').trim()) {
    e.cliente = 'El crédito fiscal necesita un cliente con RNC o cédula';
  }
  return e;
}

const aNumero = (v: string) => Number(v.replace(/,/g, ''));

function itemsDeLineas(lineas: Linea[], conCatalogo: boolean) {
  return lineas.map((l) => ({
    nombreItem: l.nombre,
    cantidadItem: l.cantidad,
    precioUnitarioItem: l.precio,
    ...(l.tasa === 'exento' ? {} : { tasaItbis: Number(l.tasa) }),
    indicadorBienoServicio: l.bien ? 1 : 2,
    ...(conCatalogo && l.productoId ? { productoId: l.productoId } : {}),
    ...(l.dependienteId ? { dependienteId: l.dependienteId, dependienteNombre: l.dependienteNombre } : {}),
  }));
}

const lineasLlenas = (valores: Valores) => leerLineas(valores.lineas).filter((l) => l.nombre && l.cantidad > 0 && l.precio > 0);

/** Datos del cliente elegido (o el nombre libre) tal como los pide cada API. */
function datosDeCliente(valores: Valores) {
  const id = Number(valores.clienteId);
  const nombre = (valores.clienteNombre ?? '').trim();
  return {
    clientId: Number.isInteger(id) && id > 0 ? id : null,
    razonSocial: nombre || null,
    rnc: (valores.clienteRnc ?? '').trim() || null,
    email: (valores.clienteEmail ?? '').trim() || null,
  };
}

export type ModoEmision = 'borrador' | 'emitir';

/** Cuerpo JSON que recibe la API; solo los campos del formulario. */
export function armarPayload(def: DefFormulario, valores: Valores, modo: ModoEmision = 'borrador'): Record<string, unknown> {
  if (def.id === 'cotizacion') {
    const lineas = lineasLlenas(valores);
    const t = totalesDeLineas(lineas);
    const c = datosDeCliente(valores);
    return {
      clientId: c.clientId,
      razonSocialComprador: c.razonSocial,
      rncComprador: c.rnc,
      emailComprador: c.email,
      fechaVencimiento: valores.fechaVencimiento || null,
      montoSubtotal: t.subtotal,
      montoDescuento: 0,
      totalItbis: t.itbis,
      montoTotal: t.total,
      items: lineas.map((l) => ({
        productoId: l.productoId ?? null,
        nombreItem: l.nombre,
        cantidadItem: l.cantidad,
        precioUnitarioItem: l.precio,
        tasaItbis: l.tasa === 'exento' ? undefined : Number(l.tasa),
        indicadorBienoServicio: l.bien ? 1 : 2,
        unidadMedida: '',
      })),
      notas: (valores.notas ?? '').trim() || null,
    };
  }

  if (def.id === 'factura') {
    const lineas = lineasLlenas(valores);
    const t = totalesDeLineas(lineas);
    const c = datosDeCliente(valores);
    const paga = (valores.pagoMetodo ?? '').trim();
    return {
      modo,
      tipoEcf: valores.tipoEcf,
      ...(c.rnc ? { rncComprador: c.rnc.replace(/[-\s]/g, '').toUpperCase() } : {}),
      ...(c.razonSocial ? { razonSocialComprador: c.razonSocial } : {}),
      ...(c.email ? { emailComprador: c.email } : {}),
      ...(c.clientId ? { clientId: c.clientId } : {}),
      tipoPago: 1,
      items: itemsDeLineas(lineas, true),
      ...((valores.notas ?? '').trim() ? { notas: valores.notas.trim() } : {}),
      ...(paga ? { pagoRecibido: true, pagoMetodo: paga, pagoValor: t.total } : {}),
    };
  }

  if (esNota(def.id)) {
    const lineas = lineasLlenas(valores);
    const c = datosDeCliente(valores);
    const motivos: readonly { valor: string; etiqueta: string; codigo: number }[] = def.id === 'notadebito' ? MOTIVOS_DEBITO : MOTIVOS_NOTA;
    const motivo = motivos.find((m) => m.valor === valores.motivo);
    const razon = valores.motivo === 'otro' ? (valores.razonModificacion ?? '').trim() : (motivo?.etiqueta ?? '');
    return {
      modo,
      tipoEcf: def.id === 'notadebito' ? '33' : '34',
      origenDocumentoId: Number(valores.documentoId),
      ncfModificado: valores.ncfModificado,
      fechaNcfModificado: valores.fechaNcfModificado,
      codigoModificacion: motivo?.codigo ?? 3,
      ...(razon ? { razonModificacion: razon } : {}),
      ...(c.rnc ? { rncComprador: c.rnc.replace(/[-\s]/g, '').toUpperCase() } : {}),
      ...(c.razonSocial ? { razonSocialComprador: c.razonSocial } : {}),
      ...(c.email ? { emailComprador: c.email } : {}),
      ...(c.clientId ? { clientId: c.clientId } : {}),
      tipoPago: 1,
      items: itemsDeLineas(lineas, true),
    };
  }

  if (def.id === 'anulacion') {
    return {
      tipoAnulacion: valores.tipoAnulacion,
      ...((valores.motivo ?? '').trim() ? { motivo: valores.motivo.trim() } : {}),
    };
  }

  if (def.id === 'pago') {
    return {
      montoDOP: aNumero(valores.monto ?? '0'),
      metodo: valores.metodo,
      fechaPago: valores.fechaPago,
      ...((valores.referencia ?? '').trim() ? { referencia: valores.referencia.trim() } : {}),
    };
  }

  const out: Record<string, unknown> = {};
  for (const c of def.campos) {
    if (c.tipo === 'archivo' || SOLO_PERSONA.has(c.tipo) || c.tipo === 'cliente') continue;
    const v = (valores[c.id] ?? '').trim();
    if (!v) continue;
    out[c.id] = c.tipo === 'numero' ? aNumero(v) : v;
  }
  return out;
}

/** La dirección a la que se envía (completa `{documentoId}` con el id elegido). */
export function endpointDe(def: DefFormulario, valores: Valores): string | null {
  if (!def.endpoint.includes('{documentoId}')) return def.endpoint;
  const id = Number(valores.documentoId);
  return Number.isInteger(id) && id > 0 ? def.endpoint.replace('{documentoId}', String(id)) : null;
}

/** Qué dice la confirmación antes de emitir (con el total y el cliente a la vista). */
export function resumenDeEmision(valores: Valores): string {
  const t = totalesDeLineas(lineasLlenas(valores));
  const cliente = (valores.clienteNombre ?? '').trim() || 'consumo final';
  const total = t.total.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Se emitirá una factura por RD$ ${total} a ${cliente} y se enviará a la DGII. No se puede deshacer.`;
}

/** Confirmación antes de emitir una nota de crédito, con el monto y la factura a la vista. */
export function resumenDeNota(valores: Valores, tipo: 'credito' | 'debito' = 'credito'): string {
  const t = totalesDeLineas(lineasLlenas(valores));
  const total = t.total.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f = (valores.documentoNombre ?? '').trim() || 'la factura elegida';
  return `Se emitirá una nota de ${tipo === 'debito' ? 'débito' : 'crédito'} por RD$ ${total} sobre ${f} y se enviará a la DGII. No se puede deshacer.`;
}

/** Lo que trae la ficha de una factura (GET /api/facturas/{id}) para preparar la nota de crédito. */
export function prefillDeNota(api: unknown, copiarLineas = true): { valores: Valores; error: string | null } {
  const p = (api ?? {}) as {
    id?: number; encf?: string | null; tipoEcf?: string; estado?: string; fechaEmision?: string | null;
    montos?: { montoTotalDOP?: string | number };
    comprador?: { clienteId?: number | null; razonSocial?: string | null; rnc?: string | null; email?: string | null };
    lineas?: Record<string, unknown>[];
  };
  const vacio: Valores = { ncfModificado: '', fechaNcfModificado: '', documentoTotal: '', documentoError: '' };
  const fallo = (m: string) => ({ valores: { ...vacio, documentoError: m }, error: m });
  if (!p.id) return fallo('No pude leer esa factura.');
  if (p.estado === 'ANULADO') return fallo('Esa factura está anulada y no admite notas.');
  if (p.tipoEcf === '33' || p.tipoEcf === '34') return fallo('No se puede hacer una nota sobre otra nota.');
  const encf = typeof p.encf === 'string' ? p.encf : '';
  if (!/^E\d{10,12}$/.test(encf) || p.tipoEcf === 'sin-ncf') {
    return fallo('Esa factura no tiene comprobante e-CF; la nota se hace desde su pantalla.');
  }
  const total = Number(String(p.montos?.montoTotalDOP ?? '').replace(/,/g, ''));
  const lineas: Linea[] = leerLineas(JSON.stringify((p.lineas ?? []).map((l) => ({
    nombre: l.nombreItem, cantidad: l.cantidadItem, precio: l.precioUnitarioItem,
    tasa: ['0.18', '0.16', '0', 'exento'].includes(String(l.tasaItbis)) ? String(l.tasaItbis) : 'exento',
    productoId: typeof l.productoId === 'number' ? l.productoId : undefined,
    bien: String(l.indicadorBienoServicio) === '1',
    dependienteId: typeof l.dependienteId === 'number' ? l.dependienteId : undefined,
    dependienteNombre: typeof l.dependienteNombre === 'string' ? l.dependienteNombre : undefined,
  }))));
  const c = p.comprador ?? {};
  return {
    error: null,
    valores: {
      ncfModificado: encf,
      fechaNcfModificado: p.fechaEmision ? String(p.fechaEmision).slice(0, 10) : '',
      documentoTotal: Number.isFinite(total) ? String(total) : '',
      documentoError: '',
      ...(copiarLineas ? { lineas: guardarLineas(lineas) } : {}),
      clienteId: c.clienteId ? String(c.clienteId) : '',
      clienteNombre: c.razonSocial ?? '',
      clienteRnc: c.rnc ?? '',
      clienteEmail: c.email ?? '',
    },
  };
}

/** Confirmación antes de anular, con la factura a la vista. */
export function resumenDeAnulacion(valores: Valores): string {
  const f = (valores.documentoNombre ?? '').trim() || 'la factura elegida';
  return `Se anulará ${f}. Deja de contar en tus ventas y no se puede deshacer desde aquí.`;
}

/** Qué se le dice a la persona cuando la API responde bien. */
export function resultadoDeCreacion(def: DefFormulario, respuesta: unknown, modo: ModoEmision = 'borrador'): { mensaje: string; enlace: string } {
  const r = (respuesta ?? {}) as {
    cliente?: { id?: number; razonSocial?: string };
    producto?: { id?: number; nombre?: string };
    cotizacion?: { id?: number; numero?: string };
    documentoId?: number; encf?: string | null; codigo?: string | null; estado?: string;
    id?: number; repetida?: boolean;
  };
  switch (def.id) {
    case 'cliente': {
      const c = r.cliente;
      return {
        mensaje: `Listo: creé el cliente ${c?.razonSocial ?? ''}`.trim() + '.',
        enlace: c?.id ? `/dashboard/clientes/${c.id}/editar` : def.pantalla,
      };
    }
    case 'producto': {
      const p = r.producto;
      return { mensaje: `Listo: creé ${p?.nombre ?? 'el producto'}.`, enlace: p?.id ? `/dashboard/productos/${p.id}` : def.pantalla };
    }
    case 'cotizacion': {
      const c = r.cotizacion;
      return {
        mensaje: `Listo: creé la cotización ${c?.numero ?? ''}`.trim() + ' como borrador.',
        enlace: c?.id ? `/dashboard/cotizaciones/${c.id}` : def.pantalla,
      };
    }
    case 'factura': {
      const num = r.encf || r.codigo || '';
      const enlace = r.documentoId ? `/dashboard/facturas/${r.documentoId}` : def.pantalla;
      return modo === 'emitir'
        ? { mensaje: `Listo: emití la factura ${num}`.trim() + (r.estado ? ` (${r.estado.toLowerCase().replace('_', ' ')}).` : '.'), enlace }
        : { mensaje: `Listo: guardé la factura ${num}`.trim() + ' como borrador. Revísala y emítela cuando quieras.', enlace };
    }
    case 'pago':
      return { mensaje: 'Listo: registré el cobro.', enlace: def.pantalla };
    case 'anulacion':
      return { mensaje: 'Listo: la factura quedó anulada.', enlace: def.pantalla };
    case 'notacredito':
    case 'notadebito': {
      const nombre = def.id === 'notadebito' ? 'nota de débito' : 'nota de crédito';
      const num = r.encf || r.codigo || '';
      const enlace = r.documentoId ? `/dashboard/facturas/${r.documentoId}` : def.pantalla;
      return modo === 'emitir'
        ? { mensaje: `Listo: emití la ${nombre} ${num}`.trim() + (r.estado ? ` (${r.estado.toLowerCase().replace('_', ' ')}).` : '.'), enlace }
        : { mensaje: `Listo: guardé la ${nombre} ${num}`.trim() + ' como borrador. Revísala y emítela cuando quieras.', enlace };
    }
    case 'gasto':
      return {
        mensaje: r.repetida ? 'Ese comprobante ya estaba subido.' : 'Listo: subí el comprobante. Quedó en «por revisar» para que lo confirmes.',
        enlace: def.pantalla,
      };
    default:
      return { mensaje: 'Listo.', enlace: def.pantalla };
  }
}

// ── Reconocer el pedido en lo que escribe la persona ────────────────────────

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const CORTESIA = '(?:por favor |porfa |ahora |ya |oye |entonces |quiero |necesito |puedes |podrias |me puedes |me podrias |ayudame a |vamos a |hay que )*';
const ARTICULO = '(?:un |una |el |la |mi |mis |los |las |unos |unas |nuevo |nueva |nuevos |nuevas |otro |otra )*';
const VERBO_CREAR = '(?:crear|crea|creame|registrar|registra|registrame|agregar|agrega|agregame|anadir|anade|dar de alta|dame de alta|nuevo|nueva|hacer|haz|hazme|preparar|prepara|preparame|armar|arma|armame|generar|genera)';
const RE_CREAR = new RegExp(`^${CORTESIA}${VERBO_CREAR}\\s+${ARTICULO}(cliente|producto|servicio|articulo|item)\\b(.*)$`);
const RE_COTIZACION = new RegExp(`^${CORTESIA}${VERBO_CREAR}\\s+${ARTICULO}(?:cotizacion|presupuesto|proforma)\\b(.*)$`);
const RE_FACTURA = new RegExp(`^${CORTESIA}(?:${VERBO_CREAR}|emitir|emite|emiteme|facturar|factura)\\s+${ARTICULO}(?:factura|facturas)\\b(.*)$`);
const RE_FACTURAR_A = /^(?:por favor |porfa |ahora |ya |oye |quiero |necesito |puedes |ayudame a )*(?:(?:facturar|facturale|facturame)\s+(?:a |para )?|factura\s+(?:a|para)\s+)([a-z][^0-9]{1,79})$/;
const RE_PAGO = new RegExp(
  `^${CORTESIA}(?:${VERBO_CREAR}|anotar|anota|cargar|carga|aplicar|aplica|ingresar|ingresa)\\s+${ARTICULO}(?:cobro|pago recibido|pago|abono)\\b(.*)$`,
);
const RE_COBRAR = /^(?:por favor |porfa |ahora |ya |oye |quiero |necesito |puedes |ayudame a )*(?:cobrar|cobra|cobrale)\s+(?:una |la |esa )?factura\b(.*)$/;
const RE_NOTA = new RegExp(`^${CORTESIA}(?:${VERBO_CREAR}|emitir|emite|emiteme)\\s+${ARTICULO}nota de (?:credito|debito)\\b(.*)$`);
const RE_ANULAR = /^(?:por favor |porfa |ahora |ya |oye |quiero |necesito |puedes |podrias |me puedes |ayudame a )*(?:anular|anula|anulame|cancelar|cancela)\s+(?:una |la |esa |otra )?factura\b(.*)$/;
const RE_GASTO = new RegExp(
  `^${CORTESIA}(?:${VERBO_CREAR}|subir|sube|cargar|carga|mandar|manda|enviar|envia|adjuntar|adjunta)\\s+${ARTICULO}(?:factura|facturas|comprobante|comprobantes|recibo|recibos|ticket|tickets|compra|compras)\\s+(?:de |del |para )?(?:gasto|gastos|proveedor|proveedores|compra|compras)\\b(.*)$`,
);
const RE_GASTO_2 = new RegExp(`^${CORTESIA}(?:${VERBO_CREAR}|subir|sube|cargar|carga|anotar|anota)\\s+${ARTICULO}(?:gasto|gastos)\\b(.*)$`);
const RE_IMPORTAR = new RegExp(
  `^${CORTESIA}(?:importar|importa|cargar|carga|subir|sube|traer|trae)\\s+${ARTICULO}(?:lista de |archivo de |excel de |csv de )?(productos|servicios|clientes|catalogo|inventario)\\b`,
);

/**
 * ¿Pidió crear algo de facturación, o importarlo desde un archivo?
 * Las preguntas de «cómo» no entran: esas las contesta la guía.
 */
export function detectarFormulario(texto: string): { id: IdFormulario; valores: Valores } | null {
  const t = normalizar(texto);
  if (!t || t.length > 200) return null;
  const original = texto.replace(/\s+/g, ' ').trim();
  const nombreDe = (patron: RegExp) => original.match(patron)?.[1];
  const llamado = /\b(?:llamad[oa]|de nombre|que se llama|se llama)\s+(.{2,80})$/i;
  const para = /\b(?:para|a nombre de|de)\s+(?!la |el |los |las |un |una )(.{2,80})$/i;

  const imp = t.match(RE_IMPORTAR);
  if (imp) return { id: imp[1] === 'clientes' ? 'importar-clientes' : 'importar-productos', valores: {} };

  const nota = t.match(RE_NOTA);
  if (nota) return { id: /nota de debito/.test(t) ? 'notadebito' : 'notacredito', valores: {} };
  if (RE_ANULAR.test(t)) return { id: 'anulacion', valores: {} };
  if (RE_GASTO.test(t) || RE_GASTO_2.test(t)) return { id: 'gasto', valores: {} };
  if (RE_PAGO.test(t) || RE_COBRAR.test(t)) return { id: 'pago', valores: {} };

  if (RE_COTIZACION.test(t)) {
    const n = nombreDe(para) ?? nombreDe(llamado);
    return { id: 'cotizacion', valores: n ? { clienteNombre: limpiarValor(n) } : {} };
  }
  if (RE_FACTURA.test(t)) {
    const n = nombreDe(para) ?? nombreDe(llamado);
    return { id: 'factura', valores: n ? { clienteNombre: limpiarValor(n) } : {} };
  }
  const fa = t.match(RE_FACTURAR_A);
  if (fa && !/\b(factura|cotizacion|cliente|producto)\b/.test(fa[1])) {
    const n = original.match(/(?:facturar|factura|facturale|facturame)\s+(?:a |para )?(.{2,80})$/i)?.[1];
    return { id: 'factura', valores: n ? { clienteNombre: limpiarValor(n) } : {} };
  }

  const cre = t.match(RE_CREAR);
  if (!cre) return null;
  const id: IdFormulario = cre[1] === 'cliente' ? 'cliente' : 'producto';
  const nombre = nombreDe(llamado);
  const campo = id === 'cliente' ? 'razonSocial' : 'nombre';
  return { id, valores: nombre ? { [campo]: limpiarValor(nombre, MAX_TEXTO) } : {} };
}
