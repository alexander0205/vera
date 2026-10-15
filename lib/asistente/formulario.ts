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
 *
 * Este módulo es puro: lo usan el servidor (para reconocer el pedido) y el
 * panel (para dibujar y validar).
 */

export type TipoCampo = 'texto' | 'numero' | 'email' | 'select' | 'area' | 'archivo';

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
}

export type Valores = Record<string, string>;

export interface DefFormulario {
  id: 'cliente' | 'producto' | 'importar-productos' | 'importar-clientes';
  titulo: string;
  descripcion: string;
  boton: string;
  /** Ruta de la API de la app (la misma de la pantalla). */
  endpoint: string;
  /** `json`: campos → cuerpo JSON. `archivo`: sube el archivo en dos tiempos (vista previa y confirmar). */
  modo: 'json' | 'archivo';
  campos: Campo[];
  /** Pantalla donde se ve lo creado, para el enlace del resultado. */
  pantalla: string;
}

const MAX_TEXTO = 255;

export const FORMULARIOS: Record<DefFormulario['id'], DefFormulario> = {
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
      {
        id: 'tasaItbis', etiqueta: 'ITBIS', tipo: 'select', requerido: true,
        opciones: [
          { valor: '0.18', etiqueta: '18 %' }, { valor: '0.16', etiqueta: '16 %' },
          { valor: '0', etiqueta: '0 %' }, { valor: 'exento', etiqueta: 'Exento' },
        ],
      },
      { id: 'referencia', etiqueta: 'Referencia o código', tipo: 'texto', max: 100 },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'area', max: 1000 },
    ],
  },
  'importar-productos': {
    id: 'importar-productos',
    titulo: 'Importar productos desde un archivo',
    descripcion: 'Sube un CSV con las columnas Nombre, Referencia, Precio, ITBIS y Tipo. Verás un resumen antes de importar.',
    boton: 'Revisar archivo',
    endpoint: '/api/import/productos',
    modo: 'archivo',
    pantalla: '/dashboard/productos',
    campos: [{ id: 'archivo', etiqueta: 'Archivo CSV', tipo: 'archivo', requerido: true, accept: '.csv,text/csv' }],
  },
  'importar-clientes': {
    id: 'importar-clientes',
    titulo: 'Importar clientes desde un archivo',
    descripcion: 'Sube un CSV con las columnas Nombre, RNC o cédula, Correo y Teléfono. Verás un resumen antes de importar.',
    boton: 'Revisar archivo',
    endpoint: '/api/import/clientes',
    modo: 'archivo',
    pantalla: '/dashboard/clientes',
    campos: [{ id: 'archivo', etiqueta: 'Archivo CSV', tipo: 'archivo', requerido: true, accept: '.csv,text/csv' }],
  },
};

export const defFormulario = (id: string | null | undefined): DefFormulario | null =>
  id && Object.prototype.hasOwnProperty.call(FORMULARIOS, id) ? FORMULARIOS[id as DefFormulario['id']] : null;

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

/**
 * Lee el cuerpo de un bloque ```formulario:
 *
 *   tipo: cliente
 *   razonSocial: Colegio Andrés Bello
 *
 * Devuelve `null` si el tipo no existe. Solo se aceptan campos del formulario;
 * un `select` solo admite valores de sus opciones, y los archivos nunca se
 * adelantan.
 */
export function parsearFormulario(cuerpo: string): { def: DefFormulario; valores: Valores } | null {
  const lineas = cuerpo.replace(/\r/g, '').split('\n');
  let tipo: string | null = null;
  const crudos: Valores = {};
  for (const l of lineas) {
    const m = l.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[1].toLowerCase() === 'tipo') tipo = m[2].trim().toLowerCase();
    else crudos[m[1]] = m[2];
  }
  const def = defFormulario(tipo);
  if (!def) return null;

  const valores: Valores = {};
  for (const c of def.campos) {
    if (c.tipo === 'archivo') continue;
    const crudo = crudos[c.id];
    if (crudo == null) continue;
    const v = limpiarValor(crudo, c.max ?? MAX_TEXTO);
    if (!v) continue;
    if (c.tipo === 'select') {
      if (c.opciones?.some((o) => o.valor === v)) valores[c.id] = v;
      continue;
    }
    if (c.tipo === 'numero') {
      const n = Number(v.replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) valores[c.id] = String(n);
      continue;
    }
    valores[c.id] = v;
  }
  return { def, valores };
}

/** El bloque de markdown con el que el asistente muestra un formulario. */
export function bloqueFormulario(id: DefFormulario['id'], valores: Valores = {}): string {
  const def = FORMULARIOS[id];
  const lineas = [`tipo: ${id}`];
  for (const c of def.campos) {
    const v = valores[c.id];
    if (v) lineas.push(`${c.id}: ${limpiarValor(v, c.max ?? MAX_TEXTO)}`);
  }
  return '```formulario\n' + lineas.join('\n') + '\n```';
}

// ── Validación y envío ──────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC = /^(\d{9}|\d{11}|(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{5,20})$/;

/** Errores por campo (vacío = se puede enviar). Mismas reglas de fondo que la API. */
export function validarFormulario(def: DefFormulario, valores: Valores): Record<string, string> {
  const e: Record<string, string> = {};
  for (const c of def.campos) {
    if (c.tipo === 'archivo') continue;
    const v = (valores[c.id] ?? '').trim();
    if (!v) {
      if (c.requerido) e[c.id] = 'Este dato es obligatorio';
      continue;
    }
    if (c.max && v.length > c.max) e[c.id] = `Máximo ${c.max} caracteres`;
    if (c.tipo === 'email' && !EMAIL.test(v)) e[c.id] = 'Correo inválido';
    if (c.tipo === 'numero') {
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) e[c.id] = 'Escribe un número mayor o igual a 0';
    }
    if (c.tipo === 'select' && !c.opciones?.some((o) => o.valor === v)) e[c.id] = 'Elige una opción';
    if (def.id === 'cliente' && c.id === 'rnc') {
      const d = v.replace(/[-\s]/g, '').toUpperCase();
      if (!DOC.test(d)) e[c.id] = 'RNC (9 dígitos), cédula (11) o pasaporte';
    }
  }
  return e;
}

/** Cuerpo JSON que recibe la API; solo los campos del formulario. */
export function armarPayload(def: DefFormulario, valores: Valores): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of def.campos) {
    if (c.tipo === 'archivo') continue;
    const v = (valores[c.id] ?? '').trim();
    if (!v) continue;
    out[c.id] = c.tipo === 'numero' ? Number(v.replace(/,/g, '')) : v;
  }
  return out;
}

/** Qué se le dice a la persona cuando la API responde bien. */
export function resultadoDeCreacion(def: DefFormulario, respuesta: unknown): { mensaje: string; enlace: string } {
  const r = (respuesta ?? {}) as { cliente?: { id?: number; razonSocial?: string }; producto?: { id?: number; nombre?: string } };
  if (def.id === 'cliente') {
    const c = r.cliente;
    return {
      mensaje: `Listo: creé el cliente ${c?.razonSocial ?? ''}`.trim() + '.',
      enlace: c?.id ? `/dashboard/clientes/${c.id}/editar` : def.pantalla,
    };
  }
  const p = r.producto;
  return {
    mensaje: `Listo: creé ${p?.nombre ?? 'el producto'}.`,
    enlace: p?.id ? `/dashboard/productos/${p.id}` : def.pantalla,
  };
}

// ── Reconocer el pedido en lo que escribe la persona ────────────────────────

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const CORTESIA = '(?:por favor |porfa |ahora |ya |oye |entonces |quiero |necesito |puedes |podrias |me puedes |me podrias |ayudame a |vamos a |hay que )*';
const ARTICULO = '(?:un |una |el |la |mi |mis |los |las |unos |unas |nuevo |nueva |nuevos |nuevas )*';
const RE_CREAR = new RegExp(
  `^${CORTESIA}(?:crear|crea|creame|registrar|registra|registrame|agregar|agrega|agregame|anadir|anade|dar de alta|dame de alta|nuevo|nueva)\\s+${ARTICULO}(cliente|producto|servicio|articulo|item)\\b(.*)$`,
);
const RE_IMPORTAR = new RegExp(
  `^${CORTESIA}(?:importar|importa|cargar|carga|subir|sube|traer|trae)\\s+${ARTICULO}(?:lista de |archivo de |excel de |csv de )?(productos|servicios|clientes|catalogo|inventario)\\b`,
);

/**
 * ¿Pidió crear un cliente o un producto, o importarlos desde un archivo?
 * Las preguntas de «cómo» no entran: esas las contesta la guía.
 */
export function detectarFormulario(texto: string): { id: DefFormulario['id']; valores: Valores } | null {
  const t = normalizar(texto);
  if (!t || t.length > 200) return null;

  const imp = t.match(RE_IMPORTAR);
  if (imp) return { id: imp[1] === 'clientes' ? 'importar-clientes' : 'importar-productos', valores: {} };

  const cre = t.match(RE_CREAR);
  if (!cre) return null;
  const id: DefFormulario['id'] = cre[1] === 'cliente' ? 'cliente' : 'producto';

  // «…llamado Juan Pérez», «…de nombre Uniforme»: adelanta el nombre, como lo escribió.
  const resto = texto.replace(/\s+/g, ' ').trim();
  const nombre = resto.match(/\b(?:llamad[oa]|de nombre|que se llama|se llama)\s+(.{2,80})$/i)?.[1];
  const campo = id === 'cliente' ? 'razonSocial' : 'nombre';
  const valores: Valores = nombre ? { [campo]: limpiarValor(nombre, MAX_TEXTO) } : {};
  return { id, valores };
}
