/**
 * Creación guiada por chat: el asistente va preguntando de a una y la persona
 * contesta escribiendo. Es una máquina de estados DETERMINISTA —sin modelo—:
 * cada pregunta sale de una plantilla y cada respuesta se interpreta con reglas.
 *
 * Qué no cambia respecto a los formularios (ver docs/asistente-politicas.md):
 *  - el asistente no escribe nada: al final arma el MISMO formulario, ya
 *    lleno, y quien crea es la persona al pulsar su botón (con la confirmación
 *    aparte de emitir/anular de siempre);
 *  - lo que se guarda lo decide la API con sus permisos y sus validaciones; aquí
 *    solo se recogen datos y se comprueban con las mismas reglas del formulario;
 *  - los datos vienen de lo que la persona escribió o de búsquedas de lectura
 *    sobre su propia empresa (clientes, productos, facturas).
 *
 * El estado vive en la propia conversación: cada pregunta lleva al final un
 * bloque ```paso con el estado, y la respuesta siguiente lo lee del último
 * mensaje del asistente. Solo el servidor escribe esos mensajes (la salida del
 * modelo se filtra para que no pueda dibujar un bloque ```paso ni un formulario
 * prellenado).
 */

import {
  bloqueGuiado, detectarFormulario, esFechaReal, FORMULARIOS, guardarLineas, leerLineas, limpiarValor, MAX_CANTIDAD, MAX_MONTO,
  METODOS_COBRO, MOTIVOS_DEBITO, MOTIVOS_NOTA, totalesDeLineas, validarFormulario,
  type Linea, type Valores,
} from './formulario';

export type IdGuiado = 'cliente' | 'producto' | 'cotizacion' | 'factura' | 'pago' | 'anulacion' | 'notacredito' | 'notadebito' | 'convertir' | 'borrador';
export const IDS_GUIADO: IdGuiado[] = ['cliente', 'producto', 'cotizacion', 'factura', 'pago', 'anulacion', 'notacredito', 'notadebito', 'convertir', 'borrador'];

/** Una opción numerada que la persona puede elegir (cliente, producto, factura). */
export interface Opcion { id: number | null; nombre: string; detalle?: string; rnc?: string; email?: string; precio?: number; tasa?: Linea['tasa']; bien?: boolean; saldo?: number; total?: number }

export interface Estado {
  /** Formulario que se está llenando. */
  f: IdGuiado;
  /** Paso en curso (la pregunta que se acaba de hacer). */
  p: string;
  /** Lo recogido hasta ahora (mismas claves que el formulario). */
  v: Valores;
  /** Opciones numeradas de la última pregunta. */
  o?: Opcion[];
  /** Línea que se está armando. */
  l?: Partial<Linea>;
  /** Pasos anteriores (para «atrás»), del más viejo al más nuevo. */
  h?: Estado[];
  /** Grupo de preguntas que se está corrigiendo desde el resumen: al terminarlo se vuelve al resumen. */
  r?: string;
  /** La pregunta que se mostró (para repetirla al volver atrás) y sus botones. */
  q?: string;
  c?: string[];
}

export interface BuscadoresGuiado {
  clientes(q: string): Promise<Opcion[]>;
  productos(q: string): Promise<Opcion[]>;
  facturas(q: string, soloBorradores?: boolean): Promise<Opcion[]>;
  cotizaciones(q: string): Promise<Opcion[]>;
  /** Líneas y validez de una factura para hacerle una nota (`credito`/`debito`) o editar su borrador. */
  detalleFactura(id: number, modo: 'credito' | 'debito' | 'borrador'): Promise<{ error: string | null; lineas: Linea[] }>;
  hoy: string;
}

export interface RespuestaGuiada {
  texto: string;
  chips: string[];
  /** `null` = terminó (cancelado o formulario armado). */
  estado: Estado | null;
  /** Formulario ya lleno para que la persona lo revise y lo envíe. */
  final?: { form: IdGuiado; valores: Valores };
  /** La persona preguntó otra cosa: se abandona y el mensaje sigue el camino normal. */
  abandona?: boolean;
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const pesos = (n: number) => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Un nombre que viene de la base o de la persona, listo para mostrarse sin que se interprete como marcado. */
export const nombreSeguro = (s: string, max = 80) => limpiarValor(s, max).replace(/[[\]()*_`<>|#~\\]/g, '').trim();

const FIN = '(?=$|[\\s,.;:!¡¿?])';
const RELLENO_SI = '(?:[\\s,]+(?:por favor|gracias|adelante|dale|claro|usalo|ese|esa|asi|tal cual|esta bien|de acuerdo|correcto|perfecto|armalo|guardalo))*';
const RELLENO_NO = '(?:[\\s,]+(?:gracias|por ahora|hay|tengo|aplica|quiero|necesito|mas|todavia|ninguno|ninguna|nada|es todo|ya|nota|tiene))*';
const SI = new RegExp('^(?:si|s|ok|okay|dale|claro|correcto|exacto|de acuerdo|listo|yes|y|va|vale|afirmativo|perfecto|asi es|esta bien|todo bien|adelante|confirmo|confirmado)' + RELLENO_SI + '[\\s.,!¡]*$');
const NO = new RegExp('^(?:no|n|nel|nop|nada|ninguno|ninguna|skip|saltar|salta|omitir|omite|sin nada|paso|pasar)' + RELLENO_NO + '[\\s.,!¡]*$');
// Las órdenes solo valen si son TODO el mensaje: «Para Todos SRL», «Sal marina» o «Editar PDF» son nombres, no órdenes.
const CANCELAR = /^(?:cancela(?:r|lo|la)?|salir|sal|olvidalo|olvidalo todo|ya no|ya no quiero|dejalo|deja eso|detener|detente|para|parar|basta|abortar|no quiero|mejor no)[\s.,!¡]*$/;
const FORMULARIO = /^(?:(?:ver |mejor |pasame |dame |abre |quiero )?(?:el |un )?formulario|editar|quiero editar|corregir|corrijo)[\s.,!¡]*$/;
// Una pregunta suelta (no un nombre): empieza por una palabra interrogativa COMPLETA o termina en «?».
const OTRA_PREGUNTA = /^(?:cuanto|cuantos|cuantas|quien|quienes|donde|como|que|cual|cuales|cuando|por que|muestrame|dame|dime|mostrar|resumen|ayuda)(?:\s|$)|\?\s*$/;

export const esSi = (t: string) => SI.test(norm(t));
export const esNo = (t: string) => NO.test(norm(t));

/** «1,500», «1.500,50», «RD$ 250», «1500.5» → número; `null` si no es un monto. */
export function leerMonto(texto: string): number | null {
  let t = norm(texto).replace(/rd\$?|\$|pesos?|dop|cada una|c\/u/g, '').replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t) || t.length > 14) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Elegir de una lista: «2», «dos», o parte del nombre. */
export function elegir<T extends { nombre: string }>(texto: string, opciones: T[]): { indice: number; opcion: T } | null {
  const t = norm(texto);
  const num = t.match(/^(\d{1,2})\b\)?\.?$/);
  if (num) { const i = Number(num[1]) - 1; return opciones[i] ? { indice: i, opcion: opciones[i] } : null; }
  const palabras: Record<string, number> = { uno: 1, primero: 1, primera: 1, dos: 2, segundo: 2, segunda: 2, tres: 3, tercero: 3, tercera: 3, cuatro: 4, cinco: 5, seis: 6 };
  if (palabras[t] && opciones[palabras[t] - 1]) return { indice: palabras[t] - 1, opcion: opciones[palabras[t] - 1] };
  const hallados = opciones.map((o, i) => ({ o, i })).filter(({ o }) => norm(o.nombre).includes(t) && t.length >= 3);
  return hallados.length === 1 ? { indice: hallados[0].i, opcion: hallados[0].o } : null;
}

const lista = (ops: Opcion[], extra?: string) =>
  ops.map((o, i) => `${i + 1}) ${nombreSeguro(o.nombre)}${o.detalle ? ` — ${nombreSeguro(o.detalle, 60)}` : ''}`).join('\n') + (extra ? `\n${extra}` : '');

const ETIQUETA_TIPO: Record<string, string> = { 'sin-ncf': 'Factura sin comprobante fiscal', '32': 'Factura de consumo (e-CF)', '31': 'Crédito fiscal (e-CF)' };
const ETIQUETA_TASA: Record<Linea['tasa'], string> = { '0.18': '18 %', '0.16': '16 %', '0': '0 %', exento: 'exento' };
const NOMBRE_FORM: Record<IdGuiado, string> = {
  cliente: 'el cliente', producto: 'el producto', cotizacion: 'la cotización', factura: 'la factura', pago: 'el cobro',
  anulacion: 'la anulación', notacredito: 'la nota de crédito', notadebito: 'la nota de débito', convertir: 'la conversión', borrador: 'la edición del borrador',
};

const ok = (e: Estado, texto: string, chips: string[] = []): RespuestaGuiada => ({ texto, chips, estado: { ...e, q: texto.includes('```') ? undefined : texto.slice(0, 1500), c: chips.slice(0, 6) } });
const repite = (e: Estado, motivo: string, pregunta: string, chips: string[] = []) => ok(e, `${motivo}\n\n${pregunta}`, chips);

// ── Preguntas ───────────────────────────────────────────────────────────────

function resumenLineas(ls: Linea[]): string {
  return ls.map((l, i) => `${i + 1}. ${nombreSeguro(l.nombre)} — ${l.cantidad} × ${pesos(l.precio)} (${ETIQUETA_TASA[l.tasa]})`).join('\n');
}

/** Los flujos que comparten las preguntas de líneas y cliente con la factura. */
const famDe = (f: IdGuiado): IdGuiado => (f === 'borrador' || f === 'notadebito' ? 'factura' : f);

function preguntaDe(e: Estado): { texto: string; chips: string[] } {
  const v = e.v;
  const ls = leerLineas(v.lineas);
  const esp = preguntaEspecifica(e);
  if (esp) return esp;
  switch (`${famDe(e.f)}:${e.p}`) {
    case 'factura:tipo':
      return { texto: '¿Qué tipo de comprobante?\n1) Factura sin comprobante fiscal\n2) Consumo (e-CF)\n3) Crédito fiscal (e-CF, pide cliente con RNC)', chips: [] };
    case 'factura:cliente':
    case 'cotizacion:cliente':
      return { texto: e.f === 'cotizacion'
        ? '¿Para quién es? Escribe su nombre o RNC (o «sin cliente» si todavía no lo sabes).'
        : '¿A quién le facturas? Escribe su nombre o RNC, o «consumo final».', chips: [e.f === 'cotizacion' ? 'Sin cliente' : 'Consumo final'] };
    case 'cotizacion:vence':
      return { texto: '¿Hasta cuándo es válida? Escribe la fecha (31/12/2026), «en 30 días», o «no» si no vence.', chips: ['En 15 días', 'En 30 días', 'No vence'] };
    case 'factura:linea':
    case 'cotizacion:linea':
      return { texto: ls.length ? '¿Qué otro producto o servicio agregas? (escribe el nombre)' : '¿Qué producto o servicio vendes? Escribe su nombre (o parte de él).', chips: [] };
    case 'factura:cantidad':
    case 'cotizacion:cantidad':
      return { texto: `¿Cuántas unidades de «${nombreSeguro(e.l?.nombre ?? '')}»?`, chips: ['1', '2', '5'] };
    case 'factura:precio':
    case 'cotizacion:precio':
      return (e.l?.precio ?? 0) < 0.01
        ? { texto: `«${nombreSeguro(e.l?.nombre ?? '')}» no tiene precio en tu catálogo. ¿A cuánto lo vendes? (cada unidad, antes de ITBIS)`, chips: [] }
        : { texto: `Cada una cuesta ${pesos(e.l?.precio ?? 0)}. ¿La dejo así? (sí, o escribe otro precio)`, chips: ['Sí'] };
    case 'factura:precio-libre':
    case 'cotizacion:precio-libre':
      return { texto: `¿A qué precio vendes «${nombreSeguro(e.l?.nombre ?? '')}»? (cada unidad, antes de ITBIS)`, chips: [] };
    case 'factura:itbis-libre':
    case 'cotizacion:itbis-libre':
      return { texto: '¿Qué ITBIS lleva?\n1) 18 %\n2) 16 %\n3) 0 %\n4) Exento', chips: [] };
    case 'factura:mas':
    case 'cotizacion:mas': {
      const t = totalesDeLineas(ls);
      return { texto: `Llevas:\n${resumenLineas(ls)}\n\nTotal ${pesos(t.total)}. ¿Agregas otra? (sí / no; o «quitar» para borrar la última)`, chips: ['Sí', 'No', 'Quitar la última'] };
    }
    case 'factura:pago':
      return { texto: '¿Ya te pagó? Dime cómo: efectivo, transferencia, tarjeta o cheque; o «no» si queda por cobrar.', chips: ['No, por cobrar', 'Efectivo', 'Transferencia', 'Tarjeta'] };
    case 'factura:notas':
    case 'cotizacion:notas':
      return { texto: '¿Quieres dejar una nota? Escríbela o di «no».', chips: ['No'] };
    case 'cliente:nombre':
      return { texto: '¿Qué nombre quieres ponerle al cliente? (nombre o razón social)', chips: [] };
    case 'cliente:rnc':
      return { texto: '¿Su RNC o cédula? (o «no» si no la tienes)', chips: ['No'] };
    case 'cliente:email':
      return { texto: '¿Su correo? (o «no»)', chips: ['No'] };
    case 'cliente:telefono':
      return { texto: '¿Su teléfono? (o «no»)', chips: ['No'] };
    case 'cliente:direccion':
      return { texto: '¿Su dirección? (o «no»)', chips: ['No'] };
    case 'producto:nombre':
      return { texto: '¿Qué nombre quieres ponerle al producto o servicio?', chips: [] };
    case 'producto:tipo':
      return { texto: '¿Es un servicio o un producto (bien)?\n1) Servicio\n2) Producto', chips: [] };
    case 'producto:precio':
      return { texto: '¿Cuánto cuesta? (precio de una unidad, antes de ITBIS)', chips: [] };
    case 'producto:itbis':
      return { texto: '¿Qué ITBIS lleva?\n1) 18 %\n2) 16 %\n3) 0 %\n4) Exento', chips: [] };
    case 'producto:referencia':
      return { texto: '¿Tiene un código o referencia? (o «no»)', chips: ['No'] };
    case 'pago:monto':
      return { texto: `La factura debe ${pesos(Number(v.documentoSaldoNum) || 0)}. ¿Cuánto te pagaron? (escribe el monto, o «todo»)`, chips: ['Todo'] };
    case 'pago:metodo':
      return { texto: '¿Con qué método pagó? efectivo, transferencia, tarjeta o cheque.', chips: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'] };
    case 'pago:fecha':
      return { texto: '¿De qué fecha es el cobro? Escribe «hoy», «ayer» o la fecha (15/10/2026).', chips: ['Hoy', 'Ayer'] };
    case 'pago:referencia':
      return { texto: '¿Número de transferencia, cheque o aprobación? (o «no»)', chips: ['No'] };
    default:
      return { texto: '', chips: [] };
  }
}

function resumenFinal(e: Estado): string {
  const v = e.v;
  const ls = leerLineas(v.lineas);
  const t = totalesDeLineas(ls);
  const filas: string[] = [];
  const esp = resumenEspecifico(e);
  if (esp) return esp;
  switch (e.f) {
    case 'cliente':
      filas.push(`• Nombre: ${nombreSeguro(v.razonSocial ?? '')}`, `• RNC o cédula: ${v.rnc ? nombreSeguro(v.rnc, 20) : '—'}`, `• Correo: ${v.email ? nombreSeguro(v.email, 120) : '—'}`, `• Teléfono: ${v.telefono ? nombreSeguro(v.telefono, 30) : '—'}`, `• Dirección: ${v.direccion ? nombreSeguro(v.direccion, 120) : '—'}`);
      break;
    case 'producto': {
      const tasa = (['0.18', '0.16', '0', 'exento'] as const).find((x) => x === v.tasaItbis) ?? '0.18';
      filas.push(`• Nombre: ${nombreSeguro(v.nombre ?? '')}`, `• Tipo: ${v.tipo === 'bien' ? 'Producto (bien)' : 'Servicio'}`, `• Precio: ${pesos(Number(v.precio) || 0)}`, `• ITBIS: ${ETIQUETA_TASA[tasa]}`, `• Referencia: ${v.referencia ? nombreSeguro(v.referencia, 100) : '—'}`);
      break;
    }
    case 'pago':
      filas.push(`• Factura: ${nombreSeguro(v.documentoNombre ?? '')}`, `• Monto: ${pesos(Number(v.monto) || 0)}`, `• Método: ${METODOS_COBRO.find((m) => m.valor === v.metodo)?.etiqueta ?? v.metodo}`, `• Fecha: ${v.fechaPago}`, `• Referencia: ${v.referencia ? nombreSeguro(v.referencia, 100) : '—'}`);
      break;
    default:
      if (e.f === 'factura') filas.push(`• Comprobante: ${ETIQUETA_TIPO[v.tipoEcf ?? 'sin-ncf']}`);
      filas.push(`• Cliente: ${v.clienteNombre ? nombreSeguro(v.clienteNombre) : e.f === 'factura' ? 'Consumo final' : 'Sin cliente'}`);
      if (e.f === 'cotizacion') filas.push(`• Válida hasta: ${v.fechaVencimiento || 'sin fecha'}`);
      filas.push(`• Líneas:\n${resumenLineas(ls)}`, `• Subtotal: ${pesos(t.subtotal)}`, `• ITBIS: ${pesos(t.itbis)}`, `• Total: ${pesos(t.total)}`);
      if (e.f === 'factura') filas.push(`• Cobro: ${v.pagoMetodo ? METODOS_COBRO.find((m) => m.valor === v.pagoMetodo)?.etiqueta ?? v.pagoMetodo : 'queda por cobrar'}`);
      if (v.notas) filas.push(`• Nota: ${nombreSeguro(v.notas, 300)}`);
  }
  return filas.join('\n');
}

/** Las viñetas del resumen pasan a filas «Etiqueta: valor» de una tarjeta (```resumen); lo que sigue a una fila con sangría la continúa. */
function aTarjeta(texto: string): string {
  const filas = texto.split('\n').map((l) => (l.startsWith('• ') ? l.slice(2).replace(/\*\*/g, '') : `  ${l.replace(/\*\*/g, '')}`));
  return '```resumen\n' + filas.join('\n') + '\n```';
}

function preguntaConfirmar(e: Estado): RespuestaGuiada {
  const nuevo: Estado = { ...e, p: 'confirmar', o: undefined, l: undefined, r: undefined };
  const puedeCambiar = (EDITABLES[e.f]?.length ?? 0) > 0;
  return ok(nuevo,
    `Esto es lo que tengo para ${NOMBRE_FORM[e.f]}:\n\n${aTarjeta(resumenFinal(e))}\n\n¿Armo el formulario para que lo revises y lo guardes?`,
    ['Sí, armar el formulario', ...(puedeCambiar ? ['Cambiar algo'] : []), 'Cancelar']);
}

/** Primera pregunta de cada flujo. */
export function iniciarGuiado(f: IdGuiado, inicial: Valores = {}): RespuestaGuiada {
  const v: Valores = {};
  if (inicial.clienteNombre) v.clienteNombre = limpiarValor(inicial.clienteNombre, 120);
  if (inicial.razonSocial) v.razonSocial = limpiarValor(inicial.razonSocial, 255);
  if (inicial.nombre) v.nombre = limpiarValor(inicial.nombre, 255);
  const primero: Record<IdGuiado, string> = {
    factura: 'tipo', cotizacion: 'cliente', cliente: 'nombre', producto: 'nombre', pago: 'documento',
    anulacion: 'documento', notacredito: 'documento', notadebito: 'documento', convertir: 'documento', borrador: 'documento',
  };
  let e: Estado = { f, p: primero[f], v };
  // Si ya dijo el nombre del cliente o del producto, se salta esa pregunta.
  if (f === 'cliente' && v.razonSocial) e = { ...e, p: 'rnc' };
  if (f === 'producto' && v.nombre) e = { ...e, p: 'tipo' };
  const q = preguntaDe(e);
  const intro = `Vamos paso a paso con ${NOMBRE_FORM[f]}. Escribe «cancelar» cuando quieras, o «formulario» para verlo completo.`;
  return ok(e, `${intro}\n\n${q.texto}`, q.chips);
}

// ── Avance ──────────────────────────────────────────────────────────────────

/** Recibe lo que escribió la persona y devuelve la siguiente pregunta (o el formulario ya lleno). */
export async function avanzarGuiado(e: Estado, entrada: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  const t = norm(limpiarValor(entrada, 300));
  let r: RespuestaGuiada;
  if (ATRAS.test(t)) return volver(e);
  if (e.p === 'confirmar' && CAMBIAR.test(t) && (EDITABLES[e.f]?.length ?? 0) > 0) r = preguntaQueCambiar(e);
  else if (e.p === 'cambiar') r = await elegirCambio(e, limpiarValor(entrada, 300), t, b);
  else r = await avanzarBase(e, entrada, b);
  return conHistorial(e, r);
}

async function avanzarBase(e: Estado, entrada: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  const texto = limpiarValor(entrada, 300);
  const t = norm(texto);
  if (!t) return ok(e, `No te leí nada. ${preguntaDe(e).texto}`, preguntaDe(e).chips);

  if (CANCELAR.test(t)) return { texto: `Listo, cancelé ${NOMBRE_FORM[e.f]}. No se guardó nada.`, chips: [], estado: null };
  if (FORMULARIO.test(t)) return formularioYa(e);

  // Una pregunta suelta en medio del flujo: se abandona y el mensaje sigue su camino normal.
  const esperaTexto = ['cliente', 'linea', 'nombre', 'factura', 'notas', 'direccion', 'documento', 'razon', 'nota'].includes(e.p);
  if (esperaTexto && OTRA_PREGUNTA.test(t) && !detectarFormulario(texto)) return { texto: '', chips: [], estado: null, abandona: true };

  const esp = await avanzarEspecifico(e, texto, t, b);
  if (esp) return esp;

  switch (`${famDe(e.f)}:${e.p}`) {
    // ── Factura ───────────────────────────────────────────────────────────
    case 'factura:tipo': {
      const el = t.match(/^[123]\b/)?.[0];
      const tipo = el === '1' || /sin|interna|simple/.test(t) ? 'sin-ncf' : el === '2' || /consumo|consumidor/.test(t) ? '32' : el === '3' || /credito|fiscal|rnc/.test(t) ? '31' : null;
      if (!tipo) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      // Si ya dijo para quién es («factura para Colegio X»), se busca de una vez.
      if (e.v.clienteNombre && !e.v.clienteId && !e.r) return pasoCliente({ ...e, p: 'cliente', v: { ...e.v, tipoEcf: tipo } }, e.v.clienteNombre, norm(e.v.clienteNombre), b);
      return siguiente({ ...e, p: 'cliente', v: { ...e.v, tipoEcf: tipo } });
    }
    case 'factura:cliente':
    case 'cotizacion:cliente':
      return pasoCliente(e, texto, t, b);
    case 'factura:cliente-elegir':
    case 'cotizacion:cliente-elegir':
      return pasoClienteElegir(e, texto, t, b);
    case 'factura:cliente-libre':
    case 'cotizacion:cliente-libre':
      if (esSi(texto)) return despuesDelCliente(e);
      return pasoCliente({ ...e, p: 'cliente' }, texto, t, b);
    case 'cotizacion:vence': {
      if (esNo(texto) || /^(no vence|sin fecha)/.test(t)) return siguiente({ ...e, p: 'linea', v: { ...e.v, fechaVencimiento: '' } });
      const f = leerFecha(texto, b.hoy);
      if (!f || f < b.hoy) return repite(e, 'Esa fecha no es válida (tiene que ser de hoy en adelante).', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'linea', v: { ...e.v, fechaVencimiento: f } });
    }
    case 'factura:linea':
    case 'cotizacion:linea':
      return pasoLinea(e, texto, b);
    case 'factura:linea-elegir':
    case 'cotizacion:linea-elegir':
      return pasoLineaElegir(e, texto, t, b);
    case 'factura:linea-libre':
    case 'cotizacion:linea-libre':
      if (esSi(texto) && e.l?.nombre) return siguiente({ ...e, p: 'precio-libre' });
      return pasoLinea({ ...e, p: 'linea' }, texto, b);
    case 'factura:precio-libre':
    case 'cotizacion:precio-libre': {
      const m = leerMonto(texto);
      if (m == null || m < 0.01 || m > MAX_MONTO) return repite(e, `Necesito un precio entre RD$ 0.01 y ${pesos(MAX_MONTO)}.`, preguntaDe(e).texto);
      return siguiente({ ...e, p: 'itbis-libre', l: { ...e.l, precio: m } });
    }
    case 'factura:itbis-libre':
    case 'cotizacion:itbis-libre':
    case 'producto:itbis': {
      const tasa = leerTasa(t);
      if (!tasa) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      if (e.f === 'producto') return siguiente({ ...e, p: 'referencia', v: { ...e.v, tasaItbis: tasa } });
      if (e.l?.cantidad) return agregarLinea({ ...e, l: { ...e.l, tasa } });
      return siguiente({ ...e, p: 'cantidad', l: { ...e.l, tasa } });
    }
    case 'factura:cantidad':
    case 'cotizacion:cantidad': {
      const n = esSi(texto) ? 1 : CANTIDAD_EN_PALABRAS[t] ?? leerMonto(texto);
      if (n == null || n <= 0 || n > MAX_CANTIDAD) return repite(e, `La cantidad debe ser mayor que 0 y no pasar de ${MAX_CANTIDAD.toLocaleString('es-DO')}.`, preguntaDe(e).texto, preguntaDe(e).chips);
      const l = { ...e.l, cantidad: n };
      // De catálogo: se confirma el precio. Libre: ya se preguntó, la línea está completa.
      if (l.productoId) return siguiente({ ...e, p: 'precio', l });
      return agregarLinea({ ...e, l });
    }
    case 'factura:precio':
    case 'cotizacion:precio': {
      if (esSi(texto) && (e.l?.precio ?? 0) >= 0.01) return agregarLinea(e);
      const m = leerMonto(texto);
      if (m == null || m < 0.01 || m > MAX_MONTO) return repite(e, `Escribe un precio válido (entre RD$ 0.01 y ${pesos(MAX_MONTO)}) o «sí» para dejarlo.`, preguntaDe(e).texto, preguntaDe(e).chips);
      return agregarLinea({ ...e, l: { ...e.l, precio: m } });
    }
    case 'factura:mas':
    case 'cotizacion:mas': {
      const quitar = t.match(/^(?:quitar|quita|borrar|borra|eliminar|elimina)(?: la)?(?: ultima| (\d{1,2}))?$/);
      if (quitar) {
        const ls = leerLineas(e.v.lineas);
        const i = quitar[1] ? Number(quitar[1]) - 1 : ls.length - 1;
        if (!ls[i]) return repite(e, 'No hay esa línea.', preguntaDe(e).texto, preguntaDe(e).chips);
        const quedan = ls.filter((_, j) => j !== i);
        const aviso = `Quité «${nombreSeguro(ls[i].nombre)}».`;
        if (!quedan.length) return repite({ ...e, p: 'linea', v: { ...e.v, lineas: '' } }, aviso, preguntaDe({ ...e, p: 'linea', v: { ...e.v, lineas: '' } }).texto);
        return repite({ ...e, v: { ...e.v, lineas: guardarLineas(quedan) } }, aviso, preguntaDe({ ...e, v: { ...e.v, lineas: guardarLineas(quedan) } }).texto, ['Sí', 'No']);
      }
      if (esSi(texto) || /^(?:otra|otro|mas|agrega(?:r)?(?: otra| otro)?)$/.test(t)) return siguiente({ ...e, p: 'linea', l: undefined });
      if (esNo(texto) || /^(?:es todo|nada mas|eso es todo|ya|listo)$/.test(t)) {
        if (e.f === 'borrador') return siguienteCambio(e);
        if (e.f === 'notadebito') return preguntaConfirmar(e);
        return e.f === 'factura' ? siguiente({ ...e, p: 'pago' }) : siguiente({ ...e, p: 'notas' });
      }
      return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
    }
    case 'factura:pago': {
      if (esNo(texto) || /^(por cobrar|despues|credito|fiado)/.test(t)) return siguiente({ ...e, p: 'notas', v: { ...e.v, pagoMetodo: '' } });
      const m = METODOS_COBRO.find((x) => t.includes(x.valor) || t.includes(norm(x.etiqueta)));
      if (!m) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'notas', v: { ...e.v, pagoMetodo: m.valor } });
    }
    case 'factura:notas':
    case 'cotizacion:notas': {
      const nota = esNo(texto) ? '' : limpiarValor(texto, 1000);
      return preguntaConfirmar({ ...e, v: { ...e.v, notas: nota } });
    }

    // ── Cliente ───────────────────────────────────────────────────────────
    case 'cliente:nombre':
      return siguiente({ ...e, p: 'rnc', v: { ...e.v, razonSocial: limpiarValor(texto, 255) } });
    case 'cliente:rnc': {
      if (esNo(texto)) return siguiente({ ...e, p: 'email', v: { ...e.v, rnc: '' } });
      const mal = validarFormulario(FORMULARIOS.cliente, { razonSocial: 'x', rnc: texto }).rnc;
      if (mal) return repite(e, `${mal}.`, preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'email', v: { ...e.v, rnc: texto.replace(/[-\s]/g, '') } });
    }
    case 'cliente:email': {
      if (esNo(texto)) return siguiente({ ...e, p: 'telefono', v: { ...e.v, email: '' } });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return repite(e, 'Ese correo no parece válido.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'telefono', v: { ...e.v, email: limpiarValor(texto, 120) } });
    }
    case 'cliente:telefono':
      return siguiente({ ...e, p: 'direccion', v: { ...e.v, telefono: esNo(texto) ? '' : limpiarValor(texto, 30) } });
    case 'cliente:direccion':
      return preguntaConfirmar({ ...e, v: { ...e.v, direccion: esNo(texto) ? '' : limpiarValor(texto, 300) } });

    // ── Producto ──────────────────────────────────────────────────────────
    case 'producto:nombre':
      return siguiente({ ...e, p: 'tipo', v: { ...e.v, nombre: limpiarValor(texto, 255) } });
    case 'producto:tipo': {
      const tipo = t.match(/^1\b/) || /servicio/.test(t) ? 'servicio' : t.match(/^2\b/) || /producto|bien|articulo/.test(t) ? 'bien' : null;
      if (!tipo) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'precio', v: { ...e.v, tipo } });
    }
    case 'producto:precio': {
      const m = leerMonto(texto);
      if (m == null || m < 0 || m > MAX_MONTO) return repite(e, `Necesito un precio entre 0 y ${pesos(MAX_MONTO)}.`, preguntaDe(e).texto);
      return siguiente({ ...e, p: 'itbis', v: { ...e.v, precio: String(m) } });
    }
    case 'producto:referencia':
      return preguntaConfirmar({ ...e, v: { ...e.v, referencia: esNo(texto) ? '' : limpiarValor(texto, 100) } });

    // ── Cobro ─────────────────────────────────────────────────────────────
    case 'pago:monto': {
      const saldo = Number(e.v.documentoSaldoNum) || 0;
      const m = /^(todo|total|completo|el total|todo el saldo)\b/.test(t) ? saldo : leerMonto(texto);
      if (m == null || m <= 0) return repite(e, 'Escribe un monto mayor que 0.', preguntaDe(e).texto, preguntaDe(e).chips);
      if (m > saldo + 0.005) return repite(e, `El cobro no puede ser mayor al saldo (${pesos(saldo)}).`, preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'metodo', v: { ...e.v, monto: String(m) } });
    }
    case 'pago:metodo': {
      const m = METODOS_COBRO.find((x) => t.includes(x.valor) || t.includes(norm(x.etiqueta)));
      if (!m) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'fecha', v: { ...e.v, metodo: m.valor } });
    }
    case 'pago:fecha': {
      const f = leerFecha(texto, b.hoy);
      if (!f || f > b.hoy) return repite(e, 'Esa fecha no es válida (no puede ser futura).', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'referencia', v: { ...e.v, fechaPago: f } });
    }
    case 'pago:referencia':
      return preguntaConfirmar({ ...e, v: { ...e.v, referencia: esNo(texto) ? '' : limpiarValor(texto, 100) } });

    // ── Confirmación ──────────────────────────────────────────────────────
    default:
      if (e.p === 'confirmar') {
        if (esSi(texto) || /^(?:armalo|arma|armar|adelante|continua|continuar|siguiente)$/.test(t)) {
          const mal = erroresFinales(e);
          if (mal) return repite(e, `Todavía falta o está mal: ${mal}.`, 'Escribe «formulario» para corregirlo ahí, o «cancelar».', ['Formulario', 'Cancelar']);
          return formularioYa(e);
        }
        return repite(e, 'No te entendí.', 'Escribe «sí» para armar el formulario, «formulario» para editarlo, o «cancelar».', ['Sí, armar el formulario', 'Cancelar']);
      }
      return { texto: `Perdí el hilo de ${NOMBRE_FORM[e.f]}. Empecemos de nuevo cuando quieras.`, chips: [], estado: null };
  }
}

function siguiente(e: Estado): RespuestaGuiada {
  const q = preguntaDe(e);
  return ok(e, q.texto, q.chips);
}

function leerTasa(t: string): Linea['tasa'] | null {
  if (/^1\b/.test(t) || /^18/.test(t)) return '0.18';
  if (/^2\b/.test(t) || /^16/.test(t)) return '0.16';
  if (/^3\b/.test(t) || /^0\b/.test(t) || /^cero/.test(t)) return '0';
  if (/^4\b/.test(t) || /exento/.test(t)) return 'exento';
  return null;
}

// ── Pasos con búsqueda ──────────────────────────────────────────────────────

async function pasoCliente(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  const sinCliente = /^(consumo final|consumidor final|sin cliente|mostrador|cliente general|generico|no s[eé]|todavia no)\b/.test(t) || (e.f === 'cotizacion' && esNo(texto));
  if (sinCliente) {
    if (e.f === 'borrador') return repite(e, 'Para quitar el cliente de un borrador usa el formulario.', 'Escribe el cliente nuevo, o «formulario».');
    if (e.v.tipoEcf === '31') return repite(e, 'El crédito fiscal necesita un cliente con RNC o cédula.', preguntaDe(e).texto);
    return despuesDelCliente({ ...e, v: { ...e.v, clienteId: '', clienteNombre: '', clienteRnc: '', clienteEmail: '' } });
  }
  const q = nombreSeguro(texto, 80);
  const hallados = await b.clientes(q);
  if (!hallados.length) {
    if (e.v.tipoEcf === '31') return repite({ ...e, p: 'cliente' }, `No encontré «${q}» entre tus clientes, y el crédito fiscal necesita un cliente registrado con RNC.`, 'Escribe otro nombre o RNC (o «cancelar»).');
    return ok({ ...e, p: 'cliente-libre', v: { ...e.v, clienteId: '', clienteNombre: q, clienteRnc: '', clienteEmail: '' } },
      `No encontré «${q}» entre tus clientes. ¿Uso ese nombre tal cual, sin registrarlo? (sí) O escribe otro nombre o RNC para buscar de nuevo.`, ['Sí, usar ese nombre', 'Cancelar']);
  }
  const exacto = hallados.length === 1 || (hallados[0] && norm(hallados[0].nombre) === norm(q) && hallados.filter((h) => norm(h.nombre) === norm(q)).length === 1);
  if (exacto) return conClienteElegido(e, hallados[0]);
  const ops = hallados.slice(0, 6);
  const libre = e.v.tipoEcf === '31' ? '' : `\n0) Ninguno: usar «${q}» como nombre libre`;
  return ok({ ...e, p: 'cliente-elegir', o: ops, v: { ...e.v, clienteNombre: q } }, `Encontré varios. ¿Cuál es?\n${lista(ops.map((o) => ({ ...o, detalle: o.rnc ? `RNC ${o.rnc}` : 'sin RNC' })))}${libre}`, ops.slice(0, 4).map((_, i) => String(i + 1)));
}

async function pasoClienteElegir(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (/^0\b/.test(t) && e.v.tipoEcf !== '31') return despuesDelCliente({ ...e, v: { ...e.v, clienteId: '', clienteRnc: '', clienteEmail: '' } });
  const el = elegir(texto, e.o ?? []);
  if (!el) return pasoCliente({ ...e, p: 'cliente' }, texto, t, b);
  return conClienteElegido(e, el.opcion);
}

function conClienteElegido(e: Estado, c: Opcion): RespuestaGuiada {
  if (e.v.tipoEcf === '31' && !c.rnc) {
    return repite({ ...e, p: 'cliente', o: undefined }, `«${nombreSeguro(c.nombre)}» no tiene RNC o cédula, y el crédito fiscal la exige.`, 'Escribe otro cliente (o «cancelar»).');
  }
  const v = { ...e.v, clienteId: c.id ? String(c.id) : '', clienteNombre: limpiarValor(c.nombre, 255), clienteRnc: c.rnc ?? '', clienteEmail: c.email ?? '' };
  const r = despuesDelCliente({ ...e, o: undefined, v });
  return { ...r, texto: `Cliente: ${nombreSeguro(c.nombre)}${c.rnc ? ` (${nombreSeguro(c.rnc, 20)})` : ''}.\n\n${r.texto}` };
}

function despuesDelCliente(e: Estado): RespuestaGuiada {
  if (e.f === 'borrador') return siguienteCambio({ ...e, o: undefined });
  const sig: Record<string, string> = { factura: 'linea', cotizacion: 'vence' };
  return siguiente({ ...e, p: sig[e.f], o: undefined });
}

async function pasoLinea(e: Estado, texto: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (leerLineas(e.v.lineas).length >= 30) return siguiente({ ...e, p: 'mas' });
  // «3 uniformes», «2 x matrícula»: la cantidad ya viene dicha y no se vuelve a preguntar.
  const pre = nombreSeguro(texto, 120).match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|unidades? de|uds?\.? de|de)?\s+(\D.{1,})$/i);
  const cant = pre ? Number(pre[1].replace(',', '.')) : undefined;
  const dicha = cant && cant > 0 && cant <= MAX_CANTIDAD ? cant : undefined;
  const q = dicha ? nombreSeguro(pre![2], 120) : nombreSeguro(texto, 120);
  const hallados = (await b.productos(q)).slice(0, 6);
  if (!hallados.length) {
    return ok({ ...e, p: 'linea-libre', l: { nombre: q, tasa: '0.18', ...(dicha ? { cantidad: dicha } : {}) } },
      `No encontré «${q}» en tu catálogo. ¿Lo agrego como línea libre con ese nombre? (sí) O escribe otro nombre para buscar de nuevo.`, ['Sí, línea libre']);
  }
  return ok({ ...e, p: 'linea-elegir', o: hallados, l: { nombre: q, ...(dicha ? { cantidad: dicha } : {}) } },
    `Encontré esto en tu catálogo. ¿Cuál es?\n${lista(hallados.map((o) => ({ ...o, detalle: `${pesos(o.precio ?? 0)} (${ETIQUETA_TASA[o.tasa ?? '0.18']})` })), `0) Ninguno: línea libre «${q}»`)}`,
    hallados.slice(0, 4).map((_, i) => String(i + 1)));
}

async function pasoLineaElegir(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (/^0\b/.test(t) && e.l?.nombre) return siguiente({ ...e, p: 'precio-libre', o: undefined, l: { nombre: e.l.nombre, tasa: '0.18', ...(e.l.cantidad ? { cantidad: e.l.cantidad } : {}) } });
  const el = elegir(texto, e.o ?? []);
  if (!el) return pasoLinea({ ...e, p: 'linea' }, texto, b);
  const p = el.opcion;
  const l = { nombre: limpiarValor(p.nombre, 255), productoId: p.id ?? undefined, precio: p.precio ?? 0, tasa: p.tasa ?? '0.18', bien: p.bien, ...(e.l?.cantidad ? { cantidad: e.l.cantidad } : {}) };
  return siguiente({ ...e, p: l.cantidad ? 'precio' : 'cantidad', o: undefined, l });
}

function agregarLinea(e: Estado): RespuestaGuiada {
  const l = e.l;
  if (!l?.nombre || !(Number(l.cantidad) > 0) || !(Number(l.precio) >= 0.01)) return { texto: 'No pude completar esa línea. Empecemos con ella otra vez.', chips: [], estado: { ...e, p: 'linea', l: undefined } };
  const nueva: Linea = {
    nombre: l.nombre, cantidad: Number(l.cantidad), precio: Number(l.precio), tasa: l.tasa ?? '0.18',
    ...(l.productoId ? { productoId: l.productoId } : {}), ...(typeof l.bien === 'boolean' ? { bien: l.bien } : {}),
  };
  const ls = [...leerLineas(e.v.lineas), nueva];
  const t = totalesDeLineas(ls);
  if (t.total > MAX_MONTO) {
    return repite({ ...e, p: 'linea', l: undefined }, `Con esa línea el total pasaría de ${pesos(MAX_MONTO)}, que es el máximo por documento. No la agregué.`, 'Escribe otro producto, o di «no» para seguir con lo que llevas.');
  }
  return siguiente({ ...e, p: 'mas', l: undefined, v: { ...e.v, lineas: guardarLineas(ls) } });
}

/** Lo que el formulario rechazaría con lo recogido (misma validación): se avisa antes de armarlo. */
function erroresFinales(e: Estado): string | null {
  // Borrador y notas: lo demás (comprobante, total, cliente original) lo trae la factura al abrir el formulario, que valida con ello.
  if (e.f === 'borrador' || e.f === 'notacredito' || e.f === 'notadebito' || e.f === 'convertir') return null;
  const v: Valores = { ...e.v };
  if (e.f === 'factura' && !v.tipoEcf) v.tipoEcf = 'sin-ncf';
  const errs = validarFormulario(FORMULARIOS[e.f], v);
  const primero = Object.values(errs).slice(0, 2).map((m) => nombreSeguro(m, 120));
  return primero.length ? primero.join('; ') : null;
}

/** Arma el formulario con lo recogido y termina el flujo. */
function formularioYa(e: Estado): RespuestaGuiada {
  const v: Valores = { ...e.v };
  delete v.lineasBase;
  delete v.cambios;
  if (e.f === 'factura' && !v.tipoEcf) v.tipoEcf = 'sin-ncf';
  if (e.f === 'pago') {
    v.fechaPago = v.fechaPago || '';
    v.metodo = v.metodo || 'efectivo';
  }
  return {
    texto: `Listo. Revisa los datos, ajusta lo que quieras y pulsa el botón del formulario para ${e.f === 'factura' ? 'guardarla o emitirla' : 'crearlo'}. Hasta que lo pulses no se guarda nada.`,
    chips: [], estado: null, final: { form: e.f, valores: v },
  };
}

// ── Estado dentro de la conversación ────────────────────────────────────────

const PASOS_VALIDOS = /^[a-z]{2,16}(-[a-z]{2,10})?$/;
const CLAVES_VALORES = new Set([
  'tipoEcf', 'clienteId', 'clienteNombre', 'clienteRnc', 'clienteEmail', 'lineas', 'pagoMetodo', 'notas', 'fechaVencimiento',
  'razonSocial', 'rnc', 'email', 'telefono', 'direccion', 'nombre', 'tipo', 'precio', 'tasaItbis', 'referencia',
  'documentoId', 'documentoNombre', 'documentoSaldo', 'documentoSaldoNum', 'documentoTotal', 'monto', 'metodo', 'fechaPago',
  'motivo', 'razonModificacion', 'tipoAnulacion', 'lineasBase', 'cambios',
]);
const SOLO_DIGITOS = new Set(['clienteId', 'documentoId']);
const MAX_ESTADO = 60_000;

/** El bloque que se pega al final de cada pregunta: ```paso con el estado en JSON. */
export function bloquePaso(e: Estado): string {
  let json = JSON.stringify(e);
  // Si el historial hace pesar demasiado el estado, se recorta («atrás» llega hasta donde alcance).
  for (let n = e.h?.length ?? 0; json.length > MAX_ESTADO * 0.7 && n > 0; n--) json = JSON.stringify({ ...e, h: e.h!.slice(-(n - 1)) });
  if (json.length > MAX_ESTADO * 0.7) json = JSON.stringify({ ...e, h: undefined, q: undefined });
  return '```paso\n' + json + '\n```';
}

/** Lo que el panel necesita del estado de un mensaje para dibujar el avance (sin verificar firma: solo se muestra). */
export function leerPasoVisible(contenido: string | null | undefined): Estado | null {
  const m = (contenido ?? '').match(/```paso\n([\s\S]*?)\n```/);
  if (!m) return null;
  const json = m[1].replace(/^\d+\.[0-9a-f]{64}\n/, '');
  return leerEstado('```paso\n' + json + '\n```');
}

/**
 * Lee el estado del mensaje anterior del asistente. Se valida todo: aunque solo
 * el servidor escribe esos mensajes, el estado se reconstruye campo por campo.
 */
export function leerEstado(contenido: string | null | undefined): Estado | null {
  const m = (contenido ?? '').match(/```paso\n([\s\S]*?)\n```/);
  if (!m || m[1].length > MAX_ESTADO) return null;
  let crudo: unknown;
  try { crudo = JSON.parse(m[1]); } catch { return null; }
  if (!crudo || typeof crudo !== 'object') return null;
  return reconstruir(crudo as Record<string, unknown>, 0);
}

function reconstruir(o: Record<string, unknown>, nivel: number): Estado | null {
  if (typeof o.f !== 'string' || !IDS_GUIADO.includes(o.f as IdGuiado)) return null;
  if (typeof o.p !== 'string' || !PASOS_VALIDOS.test(o.p)) return null;

  const v: Valores = {};
  if (o.v && typeof o.v === 'object') {
    for (const [k, x] of Object.entries(o.v as Record<string, unknown>)) {
      if (!CLAVES_VALORES.has(k) || typeof x !== 'string') continue;
      if (SOLO_DIGITOS.has(k)) { if (/^[1-9]\d{0,9}$/.test(x)) v[k] = x; else if (x === '') v[k] = ''; continue; }
      if (k === 'lineas' || k === 'lineasBase') { v[k] = guardarLineas(leerLineas(x)); continue; }
      v[k] = limpiarValor(x, 1000);
    }
  }
  const e: Estado = { f: o.f as IdGuiado, p: o.p, v };

  if (Array.isArray(o.o)) {
    e.o = o.o.slice(0, 8).flatMap((x): Opcion[] => {
      if (!x || typeof x !== 'object') return [];
      const r = x as Record<string, unknown>;
      const id = Number.isInteger(r.id) && Number(r.id) > 0 ? Number(r.id) : null;
      const tasa = (['0.18', '0.16', '0', 'exento'] as const).find((t) => t === r.tasa);
      const num = (z: unknown) => (typeof z === 'number' && Number.isFinite(z) && z >= 0 && z <= MAX_MONTO ? z : undefined);
      return [{
        id, nombre: limpiarValor(String(r.nombre ?? ''), 255), ...(typeof r.rnc === 'string' ? { rnc: limpiarValor(r.rnc, 20) } : {}),
        ...(typeof r.email === 'string' ? { email: limpiarValor(r.email, 120) } : {}), precio: num(r.precio), tasa, bien: typeof r.bien === 'boolean' ? r.bien : undefined,
        saldo: num(r.saldo), total: num(r.total),
      }];
    });
  }
  if (o.l && typeof o.l === 'object') {
    const r = o.l as Record<string, unknown>;
    const tasa = (['0.18', '0.16', '0', 'exento'] as const).find((t) => t === r.tasa);
    const num = (z: unknown, max: number) => (typeof z === 'number' && Number.isFinite(z) && z >= 0 && z <= max ? z : undefined);
    e.l = {
      nombre: limpiarValor(String(r.nombre ?? ''), 255), cantidad: num(r.cantidad, MAX_CANTIDAD), precio: num(r.precio, MAX_MONTO), tasa,
      ...(Number.isInteger(r.productoId) && Number(r.productoId) > 0 ? { productoId: Number(r.productoId) } : {}),
      ...(typeof r.bien === 'boolean' ? { bien: r.bien } : {}),
    };
  }
  if (typeof o.r === 'string' && PASOS_VALIDOS.test(o.r)) e.r = o.r;
  // Lo mostrado se guarda sin marcado: solo texto y saltos de línea.
  if (typeof o.q === 'string') e.q = o.q.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f<>`]/g, ' ').slice(0, 1500);
  if (Array.isArray(o.c)) e.c = o.c.slice(0, 6).filter((x): x is string => typeof x === 'string').map((x) => limpiarValor(x, 40));
  if (nivel === 0 && Array.isArray(o.h)) {
    e.h = o.h.slice(-6).flatMap((x) => (x && typeof x === 'object' ? [reconstruir(x as Record<string, unknown>, 1)] : [])).filter((x): x is Estado => x !== null);
  }
  return e;
}

/** El mensaje completo del asistente: texto, estado y, si terminó, el formulario ya lleno. */
export function armarMensajeGuiado(r: RespuestaGuiada): string {
  const partes = [r.texto.trim()];
  if (r.final) partes.push(bloqueGuiado(r.final.form, r.final.valores));
  if (r.estado) partes.push(bloquePaso(r.estado));
  return partes.filter(Boolean).join('\n\n');
}

// ── Reconocer el pedido ─────────────────────────────────────────────────────

const FRASE_GUIADA = /\b(paso a paso|preguntame|preguntandome|pregunta por pregunta|una pregunta a la vez|me vas preguntando|ve preguntando|vas preguntando|guiame|guiarme|haz(me)? (las )?preguntas|por aqui en el chat|por el chat|conversando|conversacion|interactivo|interactiva|sin formulario)\b/;

/** ¿Pidió crear algo contestando preguntas? («guíame para crear una factura», «créala paso a paso»). */
export function detectarGuiado(texto: string): { id: IdGuiado; valores: Valores } | null {
  const t = norm(texto);
  if (!t || t.length > 200 || !FRASE_GUIADA.test(t)) return null;
  const limpio = t.replace(FRASE_GUIADA, ' ').replace(/\b(guiame|guiarme)( para| a| con)?\b/g, ' ').replace(/\s+/g, ' ').trim();
  const f = detectarFormulario(limpio) ?? detectarFormulario(`crear ${limpio}`);
  if (f && (IDS_GUIADO as string[]).includes(f.id)) return { id: f.id as IdGuiado, valores: f.valores };
  const noun: IdGuiado | null = /nota de debito/.test(limpio) ? 'notadebito' : /nota de credito|nota credito/.test(limpio) ? 'notacredito' : /anul/.test(limpio) ? 'anulacion'
    : /borrador/.test(limpio) ? 'borrador' : /convert/.test(limpio) ? 'convertir'
    : /cotizacion|presupuesto|proforma/.test(limpio) ? 'cotizacion' : /factur/.test(limpio) ? 'factura' : /cobro|pago|abono/.test(limpio) ? 'pago'
    : /cliente/.test(limpio) ? 'cliente' : /producto|servicio|articulo/.test(limpio) ? 'producto' : null;
  return noun ? { id: noun, valores: {} } : null;
}

/**
 * La creación por conversación es el camino normal: «crea un cliente», «anula una factura»…
 * abren las preguntas. Solo se sirve el formulario si lo pide («dame el formulario») o si hay
 * un archivo de por medio (gastos e importaciones).
 */
export function detectarCreacionConversada(texto: string): { id: IdGuiado; valores: Valores } | null {
  const t = norm(texto);
  if (!t || t.length > 200 || /\bformulario\b/.test(t)) return null;
  const g = detectarGuiado(texto);
  if (g) return g;
  const f = detectarFormulario(texto);
  return f && (IDS_GUIADO as string[]).includes(f.id) ? { id: f.id as IdGuiado, valores: f.valores } : null;
}

// ── Flujos con documento existente: cobro, anulación, notas, conversión y edición ──

const QUE_DOCUMENTO: Record<string, string> = {
  pago: '¿A qué factura le registras el cobro? Escribe su número, código o el nombre del cliente.',
  anulacion: '¿Qué factura anulas? Escribe su número, código o el nombre del cliente.',
  notacredito: '¿A qué factura le haces la nota de crédito? Debe tener comprobante e-CF. Escribe su número o el nombre del cliente.',
  notadebito: '¿A qué factura le haces la nota de débito? Debe tener comprobante e-CF. Escribe su número o el nombre del cliente.',
  convertir: '¿Qué cotización conviertes en factura? Escribe su número (COT-0001) o el nombre del cliente.',
  borrador: '¿Qué borrador de factura editas? Escribe su código o el nombre del cliente.',
};
const NOMBRE_DOC: Record<string, string> = { convertir: 'Cotización', borrador: 'Borrador' };
const CAMBIOS = [
  { clave: 'cliente', etiqueta: 'El cliente', re: /cliente|comprador/ },
  { clave: 'lineas', etiqueta: 'Las líneas (qué se factura)', re: /linea|producto|servicio|items?|detalle/ },
  { clave: 'notas', etiqueta: 'La nota', re: /nota|comentario/ },
] as const;
const tiposAnulacion = () => FORMULARIOS.anulacion.campos.find((c) => c.id === 'tipoAnulacion')?.opciones ?? [];
const motivosDe = (f: IdGuiado) => (f === 'notadebito' ? MOTIVOS_DEBITO : MOTIVOS_NOTA).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }));
const etiquetaDe = (xs: readonly { valor: string; etiqueta: string }[], valor: string | undefined) => xs.find((x) => x.valor === valor)?.etiqueta ?? '—';

function preguntaEspecifica(e: Estado): { texto: string; chips: string[] } | null {
  if (e.p === 'documento' && QUE_DOCUMENTO[e.f]) return { texto: QUE_DOCUMENTO[e.f], chips: [] };
  switch (`${e.f}:${e.p}`) {
    case 'anulacion:tipoanul':
      return { texto: `¿Por qué la anulas?\n${tiposAnulacion().map((o, i) => `${i + 1}) ${o.etiqueta}`).join('\n')}`, chips: ['1', '2', '3'] };
    case 'anulacion:nota':
      return { texto: '¿Quieres dejar una nota interna con el motivo? Escríbela o di «no».', chips: ['No'] };
    case 'notacredito:motivo':
    case 'notadebito:motivo':
      return { texto: `¿Cuál es el motivo?\n${motivosDe(e.f).map((o, i) => `${i + 1}) ${o.etiqueta}`).join('\n')}`, chips: ['1', '2', '3'] };
    case 'notacredito:razon':
    case 'notadebito:razon':
      return { texto: 'Explica el motivo en una frase (máximo 200 caracteres).', chips: [] };
    case 'notacredito:que': {
      const base = leerLineas(e.v.lineasBase);
      return { texto: `La factura tiene:\n${resumenLineas(base)}\n\n¿Qué acreditas? Escribe «todo», o los números de línea (con cantidad si es parcial, por ejemplo «1, 3x2»).`, chips: ['Todo'] };
    }
    case 'borrador:cambios':
      return { texto: `¿Qué quieres cambiar de ese borrador?\n${CAMBIOS.map((c, i) => `${i + 1}) ${c.etiqueta}`).join('\n')}\n\nPuedes elegir varias («1 y 3»). Lo demás (cobros, retenciones, almacén) se conserva.`, chips: ['1', '2', '3'] };
    case 'borrador:notas':
      return { texto: 'Escribe la nota nueva del borrador.', chips: [] };
    default:
      return null;
  }
}

function resumenEspecifico(e: Estado): string | null {
  const v = e.v;
  const doc = `• Documento: ${nombreSeguro(v.documentoNombre ?? '')}`;
  switch (e.f) {
    case 'anulacion':
      return [doc, `• Motivo: ${etiquetaDe(tiposAnulacion(), v.tipoAnulacion)}`, `• Nota: ${v.motivo ? nombreSeguro(v.motivo, 300) : '—'}`, '• Anular no se deshace: la factura deja de contar en tus ventas.'].join('\n');
    case 'convertir':
      return [doc, `• Total de la cotización: ${pesos(Number(v.documentoTotal) || 0)}`, '• Se crea un borrador de factura con sus datos y líneas; no se emite nada.'].join('\n');
    case 'notacredito':
    case 'notadebito': {
      const ls = leerLineas(v.lineas);
      const t = totalesDeLineas(ls);
      return [doc, `• Motivo: ${etiquetaDe(motivosDe(e.f), v.motivo)}`, ...(v.razonModificacion ? [`• Explicación: ${nombreSeguro(v.razonModificacion, 200)}`] : []),
        `• ${e.f === 'notacredito' ? 'Acreditas' : 'Cargas'}:\n${resumenLineas(ls)}`, `• Total: ${pesos(t.total)}`].join('\n');
    }
    case 'borrador': {
      const filas = [doc];
      if (v.clienteNombre) filas.push(`• Cliente nuevo: ${nombreSeguro(v.clienteNombre)}`);
      if (v.lineas) { const ls = leerLineas(v.lineas); filas.push(`• Líneas nuevas:\n${resumenLineas(ls)}`, `• Total: ${pesos(totalesDeLineas(ls).total)}`); }
      if (v.notas) filas.push(`• Nota nueva: ${nombreSeguro(v.notas, 300)}`);
      return filas.join('\n');
    }
    default:
      return null;
  }
}

/** Lo que se acredita de la factura: «todo» o «1, 3x2» (línea y, si es parcial, cantidad). */
function leerSeleccion(texto: string, base: Linea[]): Linea[] | string {
  const t = norm(texto);
  if (/^(todo|todas|toda|completa|completo|total|la factura completa)/.test(t)) return base;
  const salida: Linea[] = [];
  const vistos = new Set<number>();
  for (const trozo of t.split(/[,;]| y /).map((x) => x.trim()).filter(Boolean)) {
    const m = trozo.match(/^(?:linea\s*)?(\d{1,2})(?:\s*(?:x|por|de)\s*(\d+(?:[.,]\d+)?))?$/);
    const i = m ? Number(m[1]) - 1 : -1;
    if (!m || !base[i]) return `No entendí «${nombreSeguro(trozo, 30)}». Usa números de la lista, por ejemplo «1, 3x2».`;
    if (vistos.has(i)) continue;
    vistos.add(i);
    const cantidad = m[2] ? Number(m[2].replace(',', '.')) : base[i].cantidad;
    if (!(cantidad > 0) || cantidad > base[i].cantidad) return `La línea ${i + 1} tiene ${base[i].cantidad} en la factura: no puedes acreditar ${m[2] ?? cantidad}.`;
    salida.push({ ...base[i], cantidad });
  }
  return salida.length ? salida : 'Dime «todo» o los números de línea.';
}

function siguienteCambio(e: Estado): RespuestaGuiada {
  const plan = (e.v.cambios ?? '').split(',').filter(Boolean);
  const [actual, ...resto] = plan;
  const v = { ...e.v, cambios: resto.join(',') };
  if (!actual) return preguntaConfirmar({ ...e, v });
  if (actual === 'cliente') return siguiente({ ...e, p: 'cliente', v, o: undefined });
  if (actual === 'lineas') {
    const r = siguiente({ ...e, p: 'linea', v: { ...v, lineas: '' }, o: undefined, l: undefined });
    return { ...r, texto: `Vas a reemplazar TODAS las líneas del borrador por las que me digas ahora.\n\n${r.texto}` };
  }
  return siguiente({ ...e, p: 'notas', v, o: undefined });
}

async function pasoDocumento(e: Estado, texto: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  const q = nombreSeguro(texto, 80);
  let hallados = e.f === 'convertir' ? await b.cotizaciones(q) : await b.facturas(q, e.f === 'borrador');
  if (e.f === 'pago') hallados = hallados.filter((f) => (f.saldo ?? 0) > 0);
  hallados = hallados.slice(0, 6);
  if (!hallados.length) {
    const que = e.f === 'pago' ? 'facturas con saldo' : e.f === 'convertir' ? 'cotizaciones que se puedan convertir' : e.f === 'borrador' ? 'borradores' : 'facturas';
    return repite({ ...e, p: 'documento', o: undefined }, `No encontré ${que} para «${q}».`, 'Escribe otro número, código o nombre del cliente (o «cancelar»).');
  }
  if (hallados.length === 1) return conDocumento(e, hallados[0], b);
  const conDetalle = hallados.map((o) => ({ ...o, detalle: e.f === 'pago' ? `debe ${pesos(o.saldo ?? 0)}` : pesos(o.total ?? 0) }));
  return ok({ ...e, p: 'documento-elegir', o: hallados }, `Encontré varias. ¿Cuál es?\n${lista(conDetalle, 'O escribe otra búsqueda.')}`, hallados.slice(0, 4).map((_, i) => String(i + 1)));
}

async function conDocumento(e: Estado, f: Opcion, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (f.id == null) return repite({ ...e, p: 'documento' }, 'Ese documento no se puede usar.', 'Escribe otra búsqueda.');
  const v: Valores = { ...e.v, documentoId: String(f.id), documentoNombre: limpiarValor(f.nombre, 200), documentoTotal: String(f.total ?? 0) };
  const ant = `${NOMBRE_DOC[e.f] ?? 'Factura'}: ${nombreSeguro(f.nombre)}.\n\n`;
  const con = (r: RespuestaGuiada): RespuestaGuiada => ({ ...r, texto: ant + r.texto });
  switch (e.f) {
    case 'pago':
      return con(siguiente({ ...e, p: 'monto', o: undefined, v: { ...v, documentoSaldoNum: String(f.saldo ?? 0), documentoSaldo: String(f.saldo ?? 0) } }));
    case 'anulacion':
      return con(siguiente({ ...e, p: 'tipoanul', o: undefined, v }));
    case 'convertir':
      return con(preguntaConfirmar({ ...e, o: undefined, v }));
    default: {
      // Notas y edición de borrador: se lee la factura para validarla y traer sus líneas.
      const modo = e.f === 'notacredito' ? 'credito' : e.f === 'notadebito' ? 'debito' : 'borrador';
      let d: { error: string | null; lineas: Linea[] };
      try { d = await b.detalleFactura(f.id, modo); } catch { d = { error: 'No pude leer esa factura.', lineas: [] }; }
      if (d.error) return repite({ ...e, p: 'documento', o: undefined }, nombreSeguro(d.error, 200), 'Escribe otra búsqueda (o «cancelar»).');
      const v2: Valores = { ...v, ...(e.f === 'notacredito' ? { lineasBase: guardarLineas(d.lineas) } : {}) };
      return con(siguiente({ ...e, p: e.f === 'borrador' ? 'cambios' : 'motivo', o: undefined, v: v2 }));
    }
  }
}

async function avanzarEspecifico(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada | null> {
  if (e.p === 'documento' && QUE_DOCUMENTO[e.f]) return pasoDocumento(e, texto, b);
  if (e.p === 'documento-elegir' && QUE_DOCUMENTO[e.f]) {
    const el = elegir(texto, e.o ?? []);
    if (!el) return pasoDocumento({ ...e, p: 'documento' }, texto, b);
    return conDocumento(e, el.opcion, b);
  }
  switch (`${e.f}:${e.p}`) {
    case 'anulacion:tipoanul': {
      const el = elegir(texto, tiposAnulacion().map((o) => ({ nombre: o.etiqueta, valor: o.valor })));
      if (!el) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'nota', v: { ...e.v, tipoAnulacion: el.opcion.valor } });
    }
    case 'anulacion:nota':
      return preguntaConfirmar({ ...e, v: { ...e.v, motivo: esNo(texto) ? '' : limpiarValor(texto, 500) } });
    case 'notacredito:motivo':
    case 'notadebito:motivo': {
      const el = elegir(texto, motivosDe(e.f).map((o) => ({ nombre: o.etiqueta, valor: o.valor })));
      if (!el) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      const v = { ...e.v, motivo: el.opcion.valor };
      if (el.opcion.valor === 'otro') return siguiente({ ...e, p: 'razon', v });
      return e.f === 'notacredito' ? siguiente({ ...e, p: 'que', v }) : siguiente({ ...e, p: 'linea', v, l: undefined });
    }
    case 'notacredito:razon':
    case 'notadebito:razon': {
      const razon = limpiarValor(texto, 200);
      if (razon.length < 3) return repite(e, 'Escribe una explicación breve.', preguntaDe(e).texto);
      const v = { ...e.v, razonModificacion: razon };
      return e.f === 'notacredito' ? siguiente({ ...e, p: 'que', v }) : siguiente({ ...e, p: 'linea', v, l: undefined });
    }
    case 'notacredito:que': {
      const base = leerLineas(e.v.lineasBase);
      if (!base.length) return { texto: 'Esa factura no tiene líneas que acreditar. Escribe «formulario» para hacerla a mano o «cancelar».', chips: ['Cancelar'], estado: e };
      const r = leerSeleccion(texto, base);
      if (typeof r === 'string') return repite(e, r, preguntaDe(e).texto, preguntaDe(e).chips);
      return preguntaConfirmar({ ...e, v: { ...e.v, lineas: guardarLineas(r) } });
    }
    case 'borrador:cambios': {
      const elegidos = CAMBIOS.filter((c, i) => c.re.test(t) || new RegExp(`(^|[^0-9])${i + 1}([^0-9]|$)`).test(t)).map((c) => c.clave);
      if (!elegidos.length) return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguienteCambio({ ...e, v: { ...e.v, cambios: elegidos.join(',') } });
    }
    case 'borrador:notas':
      return preguntaConfirmar({ ...e, v: { ...e.v, notas: limpiarValor(texto, 1000) } });
    default:
      return null;
  }
}


// ── Avance del flujo, «atrás» y «cambiar algo» ──────────────────────────────

const ATRAS = /^(?:atras|volver|vuelve|regresar|regresa|anterior|deshacer|deshaz|paso anterior|volver atras)[\s.,!¡]*$/;
const CAMBIAR = /^(?:cambiar(?: algo)?|cambia|corregir(?: algo)?|modificar(?: algo)?|quiero cambiar(?: algo)?|no|editar(?: algo)?)[\s.,!¡]*$/;
const CANTIDAD_EN_PALABRAS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12, 'una docena': 12, 'media docena': 6,
};

const TITULOS: Record<IdGuiado, string> = {
  factura: 'Nueva factura', cotizacion: 'Nueva cotización', cliente: 'Nuevo cliente', producto: 'Nuevo producto o servicio', pago: 'Registrar un cobro',
  anulacion: 'Anular una factura', notacredito: 'Nota de crédito', notadebito: 'Nota de débito', convertir: 'Convertir una cotización', borrador: 'Editar un borrador',
};
const ORDEN: Record<IdGuiado, string[]> = {
  factura: ['tipo', 'cliente', 'linea', 'pago', 'notas', 'confirmar'],
  cotizacion: ['cliente', 'vence', 'linea', 'notas', 'confirmar'],
  cliente: ['nombre', 'rnc', 'email', 'telefono', 'direccion', 'confirmar'],
  producto: ['nombre', 'tipo', 'precio', 'itbis', 'referencia', 'confirmar'],
  pago: ['documento', 'monto', 'metodo', 'fecha', 'referencia', 'confirmar'],
  anulacion: ['documento', 'tipoanul', 'nota', 'confirmar'],
  notacredito: ['documento', 'motivo', 'que', 'confirmar'],
  notadebito: ['documento', 'motivo', 'linea', 'confirmar'],
  convertir: ['documento', 'confirmar'],
  borrador: ['documento', 'cambios', 'cliente', 'linea', 'notas', 'confirmar'],
};
const CON_LINEAS: IdGuiado[] = ['factura', 'cotizacion', 'notadebito', 'borrador'];
const PASOS_DE_LINEA = ['linea', 'linea-elegir', 'linea-libre', 'precio', 'precio-libre', 'itbis-libre', 'cantidad', 'mas'];

/** Las preguntas que van juntas (buscar y elegir un cliente, armar una línea…) cuentan como un solo paso. */
export function grupoDe(f: IdGuiado, p: string): string {
  if (CON_LINEAS.includes(f) && PASOS_DE_LINEA.includes(p)) return 'linea';
  if (p.startsWith('cliente')) return 'cliente';
  if (p.startsWith('documento')) return 'documento';
  if (p === 'razon') return 'motivo';
  return p;
}

/** «Paso 3 de 6» para el panel; `null` si el paso no está en el recorrido. */
export function progresoGuiado(e: Pick<Estado, 'f' | 'p'>): { titulo: string; n: number; total: number } | null {
  const orden = ORDEN[e.f];
  const i = orden?.indexOf(grupoDe(e.f, e.p)) ?? -1;
  return i < 0 ? null : { titulo: TITULOS[e.f], n: i + 1, total: orden.length };
}

interface Editable { etiqueta: string; p: string; re: RegExp; limpiar?: string[] }
const CLIENTE_V = ['clienteId', 'clienteNombre', 'clienteRnc', 'clienteEmail'];
const EDITABLES: Partial<Record<IdGuiado, Editable[]>> = {
  factura: [
    { etiqueta: 'Tipo de comprobante', p: 'tipo', re: /tipo|comprobante/ },
    { etiqueta: 'Cliente', p: 'cliente', re: /cliente/, limpiar: CLIENTE_V },
    { etiqueta: 'Líneas (qué se factura)', p: 'linea', re: /linea|producto|item|factura/, limpiar: ['lineas'] },
    { etiqueta: 'Cobro', p: 'pago', re: /cobro|pago/ },
    { etiqueta: 'Nota', p: 'notas', re: /nota/ },
  ],
  cotizacion: [
    { etiqueta: 'Cliente', p: 'cliente', re: /cliente/, limpiar: CLIENTE_V },
    { etiqueta: 'Válida hasta', p: 'vence', re: /vence|valida|fecha/ },
    { etiqueta: 'Líneas (qué cotizas)', p: 'linea', re: /linea|producto|item/, limpiar: ['lineas'] },
    { etiqueta: 'Nota', p: 'notas', re: /nota/ },
  ],
  cliente: [
    { etiqueta: 'Nombre', p: 'nombre', re: /nombre/ },
    { etiqueta: 'RNC o cédula', p: 'rnc', re: /rnc|cedula|documento/ },
    { etiqueta: 'Correo', p: 'email', re: /correo|email/ },
    { etiqueta: 'Teléfono', p: 'telefono', re: /telefono|tel/ },
    { etiqueta: 'Dirección', p: 'direccion', re: /direccion/ },
  ],
  producto: [
    { etiqueta: 'Nombre', p: 'nombre', re: /nombre/ },
    { etiqueta: 'Tipo (producto o servicio)', p: 'tipo', re: /tipo/ },
    { etiqueta: 'Precio', p: 'precio', re: /precio|costo/ },
    { etiqueta: 'ITBIS', p: 'itbis', re: /itbis|impuesto/ },
    { etiqueta: 'Referencia', p: 'referencia', re: /referencia|codigo/ },
  ],
  pago: [
    { etiqueta: 'Monto', p: 'monto', re: /monto|valor|cantidad/ },
    { etiqueta: 'Método', p: 'metodo', re: /metodo|forma/ },
    { etiqueta: 'Fecha', p: 'fecha', re: /fecha/ },
    { etiqueta: 'Referencia', p: 'referencia', re: /referencia/ },
  ],
  anulacion: [
    { etiqueta: 'Motivo', p: 'tipoanul', re: /motivo|razon/ },
    { etiqueta: 'Nota', p: 'nota', re: /nota/ },
  ],
  notacredito: [
    { etiqueta: 'Motivo', p: 'motivo', re: /motivo|razon/, limpiar: ['razonModificacion'] },
    { etiqueta: 'Lo que acreditas', p: 'que', re: /acredit|linea/ },
  ],
  notadebito: [
    { etiqueta: 'Motivo', p: 'motivo', re: /motivo|razon/, limpiar: ['razonModificacion'] },
    { etiqueta: 'Lo que cargas', p: 'linea', re: /carg|linea/, limpiar: ['lineas'] },
  ],
};

function preguntaQueCambiar(e: Estado): RespuestaGuiada {
  const items = EDITABLES[e.f] ?? [];
  return ok({ ...e, p: 'cambiar', o: undefined, l: undefined },
    `¿Qué quieres cambiar?\n${items.map((x, i) => `${i + 1}) ${x.etiqueta}`).join('\n')}`,
    []);
}

async function elegirCambio(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (CANCELAR.test(t)) return { texto: `Listo, cancelé ${NOMBRE_FORM[e.f]}. No se guardó nada.`, chips: [], estado: null };
  if (/^(?:ninguno|nada|ya esta|esta bien|seguir|continuar|volver al resumen)[\s.,!]*$/.test(t)) return preguntaConfirmar(e);
  const items = EDITABLES[e.f] ?? [];
  const el = elegir(texto, items.map((x) => ({ nombre: x.etiqueta })));
  const item = el ? items[el.indice] : items.find((x) => x.re.test(t));
  if (!item) return repite(e, 'No te entendí.', preguntaDe(e).texto || (e.q ?? ''), e.c ?? []);
  const v = { ...e.v };
  for (const k of item.limpiar ?? []) v[k] = '';
  const nuevo: Estado = { ...e, p: item.p, v, r: grupoDe(e.f, item.p), o: undefined, l: undefined };
  void b;
  const q = preguntaDe(nuevo);
  return ok(nuevo, `Vamos a cambiar: ${item.etiqueta.toLowerCase()}.\n\n${q.texto}`, q.chips);
}

function volver(e: Estado): RespuestaGuiada {
  const h = e.h ?? [];
  if (!h.length) return ok(e, `Ya estás en la primera pregunta.\n\n${e.q ?? preguntaDe(e).texto}`, e.c ?? preguntaDe(e).chips);
  const prev = h[h.length - 1];
  const estado: Estado = { ...prev, h: h.slice(0, -1) };
  if (prev.p === 'confirmar') {
    const r = preguntaConfirmar(estado);
    return { ...r, texto: `Volvemos un paso.\n\n${r.texto}`, estado: { ...r.estado!, h: estado.h } };
  }
  const q = prev.q ?? preguntaDe(prev).texto;
  const chips = [...(prev.c ?? preguntaDe(prev).chips)];
  if (estado.h?.length && !chips.includes('Atrás')) chips.push('Atrás');
  return { texto: `Volvemos un paso.\n\n${q}`, chips: chips.slice(0, 6), estado: { ...estado, c: chips.slice(0, 6) } };
}

const instantanea = (e: Estado): Estado => ({ f: e.f, p: e.p, v: e.v, ...(e.o ? { o: e.o } : {}), ...(e.l ? { l: e.l } : {}), ...(e.r ? { r: e.r } : {}), ...(e.q ? { q: e.q } : {}), ...(e.c ? { c: e.c } : {}) });

/** Guarda el paso anterior para «atrás» y, si se estaba corrigiendo desde el resumen, vuelve a él al terminar ese grupo de preguntas. */
function conHistorial(e: Estado, r0: RespuestaGuiada): RespuestaGuiada {
  if (!r0.estado || r0.final || r0.abandona) return r0;
  let r = r0;
  if (e.r && r.estado!.p !== 'confirmar' && r.estado!.p !== 'cambiar' && grupoDe(r.estado!.f, r.estado!.p) !== e.r) {
    r = preguntaConfirmar({ ...r.estado!, r: undefined });
  }
  const est = r.estado!;
  const avanzo = est.p !== e.p || JSON.stringify(est.v) !== JSON.stringify(e.v);
  const h = avanzo ? [...(e.h ?? []).slice(-5), instantanea(e)] : e.h;
  const chips = [...r.chips];
  if (h?.length && !chips.includes('Atrás')) chips.push('Atrás');
  return { ...r, chips: chips.slice(0, 6), estado: { ...est, h, c: chips.slice(0, 6) } };
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** «hoy», «ayer», «mañana», «en 30 días», «15/10/2026», «15 de octubre» o AAAA-MM-DD → AAAA-MM-DD (o `null`). */
export function leerFecha(texto: string, hoy: string): string | null {
  const t = norm(texto).replace(/[.,!¡]+$/g, '');
  const rel: Record<string, number> = { hoy: 0, 'hoy mismo': 0, ahora: 0, 'de hoy': 0, ayer: -1, anteayer: -2, 'antes de ayer': -2, manana: 1, 'pasado manana': 2 };
  if (t in rel) return sumarDias(hoy, rel[t]);
  const en = t.match(/^(?:en |dentro de )?(\d{1,3}) (dias?|semanas?|meses|mes)$/);
  if (en) return sumarDias(hoy, Number(en[1]) * (en[2].startsWith('semana') ? 7 : en[2].startsWith('mes') ? 30 : 1));
  if (/^(?:en un mes|proximo mes)$/.test(t)) return sumarDias(hoy, 30);
  let a: number; let m: number; let d: number;
  let x = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (x) { a = +x[1]; m = +x[2]; d = +x[3]; } else if ((x = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) { d = +x[1]; m = +x[2]; a = +x[3]; } else if ((x = t.match(/^(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/))) {
    const i = MESES.indexOf(x[2]);
    if (i < 0) return null;
    d = +x[1]; m = i + 1; a = x[3] ? +x[3] : Number(hoy.slice(0, 4));
  } else return null;
  const iso = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return esFechaReal(iso) ? iso : null;
}
