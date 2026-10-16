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
const SI = new RegExp('^(si|s|ok|okay|dale|claro|correcto|exacto|de acuerdo|listo|yes|y|va|vale|afirmativo|perfecto|asi es|esta bien|todo bien)' + FIN);
const NO = new RegExp('^(no|n|nel|nop|nada|ninguno|ninguna|skip|saltar|salta|omitir|omite)' + FIN);
const CANCELAR = /^(cancela\w*|salir|sal|olvidalo|olvida\w*|ya no|dejalo|deja eso|detener|para|parar|basta|abortar)\b/;
const FORMULARIO = /^(formulario|ver formulario|mejor el formulario|pasame el formulario|editar|quiero editar|corregir|corrijo)\b/;
const OTRA_PREGUNTA = /^(cuanto|cuantos|cuantas|quien|quienes|donde|como|que |cual|cuales|cuando|por que|muestrame|dame|dime|mostrar|ver |resumen|ayuda)|\?\s*$/;

export const esSi = (t: string) => SI.test(norm(t));
export const esNo = (t: string) => NO.test(norm(t));

/** «1,500», «1.500,50», «RD$ 250», «1500.5» → número; `null` si no es un monto. */
export function leerMonto(texto: string): number | null {
  let t = norm(texto).replace(/rd\$?|\$|pesos?|dop|cada una|c\/u/g, '').replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
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

const ok = (e: Estado, texto: string, chips: string[] = []): RespuestaGuiada => ({ texto, chips, estado: e });
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
      return { texto: '¿Qué tipo de comprobante?\n1) Factura sin comprobante fiscal\n2) Consumo (e-CF)\n3) Crédito fiscal (e-CF, pide cliente con RNC)', chips: ['Sin comprobante', 'Consumo', 'Crédito fiscal'] };
    case 'factura:cliente':
    case 'cotizacion:cliente':
      return { texto: e.f === 'cotizacion'
        ? '¿Para quién es? Escribe su nombre o RNC (o «sin cliente» si todavía no lo sabes).'
        : '¿A quién le facturas? Escribe su nombre o RNC, o «consumo final».', chips: [e.f === 'cotizacion' ? 'Sin cliente' : 'Consumo final'] };
    case 'cotizacion:vence':
      return { texto: '¿Hasta qué fecha es válida? (AAAA-MM-DD, o «no» si no vence)', chips: ['No vence'] };
    case 'factura:linea':
    case 'cotizacion:linea':
      return { texto: ls.length ? '¿Qué otro producto o servicio agregas? (escribe el nombre)' : '¿Qué producto o servicio vendes? Escribe su nombre (o parte de él).', chips: [] };
    case 'factura:cantidad':
    case 'cotizacion:cantidad':
      return { texto: `¿Cuántas unidades de «${nombreSeguro(e.l?.nombre ?? '')}»?`, chips: ['1', '2', '5'] };
    case 'factura:precio':
    case 'cotizacion:precio':
      return { texto: `Cada una cuesta ${pesos(e.l?.precio ?? 0)}. ¿La dejo así? (sí, o escribe otro precio)`, chips: ['Sí'] };
    case 'factura:precio-libre':
    case 'cotizacion:precio-libre':
      return { texto: `¿A qué precio vendes «${nombreSeguro(e.l?.nombre ?? '')}»? (cada unidad, antes de ITBIS)`, chips: [] };
    case 'factura:itbis-libre':
    case 'cotizacion:itbis-libre':
      return { texto: '¿Qué ITBIS lleva?\n1) 18 %\n2) 16 %\n3) 0 %\n4) Exento', chips: ['18 %', 'Exento'] };
    case 'factura:mas':
    case 'cotizacion:mas': {
      const t = totalesDeLineas(ls);
      return { texto: `Llevas ${ls.length} ${ls.length === 1 ? 'línea' : 'líneas'}, total ${pesos(t.total)}. ¿Agregas otra? (sí / no)`, chips: ['Sí', 'No'] };
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
      return { texto: '¿Es un servicio o un producto (bien)?\n1) Servicio\n2) Producto', chips: ['Servicio', 'Producto'] };
    case 'producto:precio':
      return { texto: '¿Cuánto cuesta? (precio de una unidad, antes de ITBIS)', chips: [] };
    case 'producto:itbis':
      return { texto: '¿Qué ITBIS lleva?\n1) 18 %\n2) 16 %\n3) 0 %\n4) Exento', chips: ['18 %', 'Exento'] };
    case 'producto:referencia':
      return { texto: '¿Tiene un código o referencia? (o «no»)', chips: ['No'] };
    case 'pago:monto':
      return { texto: `La factura debe ${pesos(Number(v.documentoSaldoNum) || 0)}. ¿Cuánto te pagaron? (escribe el monto, o «todo»)`, chips: ['Todo'] };
    case 'pago:metodo':
      return { texto: '¿Con qué método pagó? efectivo, transferencia, tarjeta o cheque.', chips: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'] };
    case 'pago:fecha':
      return { texto: `¿De qué fecha es el cobro? (AAAA-MM-DD, o «hoy»)`, chips: ['Hoy'] };
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
      filas.push(`• Líneas:\n${resumenLineas(ls)}`, `• Subtotal ${pesos(t.subtotal)} · ITBIS ${pesos(t.itbis)} · **Total ${pesos(t.total)}**`);
      if (e.f === 'factura') filas.push(`• Cobro: ${v.pagoMetodo ? METODOS_COBRO.find((m) => m.valor === v.pagoMetodo)?.etiqueta ?? v.pagoMetodo : 'queda por cobrar'}`);
      if (v.notas) filas.push(`• Nota: ${nombreSeguro(v.notas, 300)}`);
  }
  return filas.join('\n');
}

function preguntaConfirmar(e: Estado): RespuestaGuiada {
  return ok({ ...e, p: 'confirmar', o: undefined, l: undefined },
    `Esto es lo que tengo para ${NOMBRE_FORM[e.f]}:\n\n${resumenFinal(e)}\n\n¿Armo el formulario para que lo revises y lo guardes? (sí / formulario para editarlo / cancelar)`,
    ['Sí, armar el formulario', 'Cancelar']);
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
  const texto = limpiarValor(entrada, 300);
  const t = norm(texto);
  if (!t) return ok(e, `No te leí nada. ${preguntaDe(e).texto}`, preguntaDe(e).chips);

  if (CANCELAR.test(t)) return { texto: `Listo, cancelé ${NOMBRE_FORM[e.f]}. No se guardó nada.`, chips: [], estado: null };
  if (FORMULARIO.test(t)) return formularioYa(e);

  // Una pregunta suelta en medio del flujo: se abandona y el mensaje sigue su camino normal.
  const esperaTexto = ['cliente', 'linea', 'nombre', 'factura', 'notas', 'direccion'].includes(e.p);
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
      if (e.v.clienteNombre && !e.v.clienteId) return pasoCliente({ ...e, p: 'cliente', v: { ...e.v, tipoEcf: tipo } }, e.v.clienteNombre, norm(e.v.clienteNombre), b);
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
      const f = texto.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (!f || !esFechaReal(f)) return repite(e, 'Esa fecha no es válida.', preguntaDe(e).texto, preguntaDe(e).chips);
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
      return siguiente({ ...e, p: 'cantidad', l: { ...e.l, tasa } });
    }
    case 'factura:cantidad':
    case 'cotizacion:cantidad': {
      const n = esSi(texto) ? 1 : leerMonto(texto);
      if (n == null || n <= 0 || n > MAX_CANTIDAD) return repite(e, `La cantidad debe ser mayor que 0 y no pasar de ${MAX_CANTIDAD.toLocaleString('es-DO')}.`, preguntaDe(e).texto, preguntaDe(e).chips);
      const l = { ...e.l, cantidad: n };
      // De catálogo: se confirma el precio. Libre: ya se preguntó, la línea está completa.
      if (l.productoId) return siguiente({ ...e, p: 'precio', l });
      return agregarLinea({ ...e, l });
    }
    case 'factura:precio':
    case 'cotizacion:precio': {
      if (esSi(texto)) return agregarLinea(e);
      const m = leerMonto(texto);
      if (m == null || m < 0.01 || m > MAX_MONTO) return repite(e, `Escribe un precio válido (entre RD$ 0.01 y ${pesos(MAX_MONTO)}) o «sí» para dejarlo.`, preguntaDe(e).texto, preguntaDe(e).chips);
      return agregarLinea({ ...e, l: { ...e.l, precio: m } });
    }
    case 'factura:mas':
    case 'cotizacion:mas':
      if (esSi(texto) || /^(otra|otro|mas|agrega)/.test(t)) return siguiente({ ...e, p: 'linea', l: undefined });
      if (esNo(texto) || /^(es todo|nada mas|eso es todo|ya)/.test(t)) {
        if (e.f === 'borrador') return siguienteCambio(e);
        if (e.f === 'notadebito') return preguntaConfirmar(e);
        return e.f === 'factura' ? siguiente({ ...e, p: 'pago' }) : siguiente({ ...e, p: 'notas' });
      }
      return repite(e, 'No te entendí.', preguntaDe(e).texto, preguntaDe(e).chips);
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
      if (/^(hoy|ahora|de hoy)\b/.test(t)) return siguiente({ ...e, p: 'referencia', v: { ...e.v, fechaPago: b.hoy } });
      const f = texto.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (!f || !esFechaReal(f) || f > b.hoy) return repite(e, 'Esa fecha no es válida (no puede ser futura).', preguntaDe(e).texto, preguntaDe(e).chips);
      return siguiente({ ...e, p: 'referencia', v: { ...e.v, fechaPago: f } });
    }
    case 'pago:referencia':
      return preguntaConfirmar({ ...e, v: { ...e.v, referencia: esNo(texto) ? '' : limpiarValor(texto, 100) } });

    // ── Confirmación ──────────────────────────────────────────────────────
    default:
      if (e.p === 'confirmar') {
        if (esSi(texto) || /^(armalo|arma|armar|adelante|continua|continuar|siguiente)/.test(t)) return formularioYa(e);
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
  const q = nombreSeguro(texto, 120);
  const hallados = (await b.productos(q)).slice(0, 6);
  if (!hallados.length) {
    return ok({ ...e, p: 'linea-libre', l: { nombre: q, tasa: '0.18' } },
      `No encontré «${q}» en tu catálogo. ¿Lo agrego como línea libre con ese nombre? (sí) O escribe otro nombre para buscar de nuevo.`, ['Sí, línea libre']);
  }
  return ok({ ...e, p: 'linea-elegir', o: hallados, l: { nombre: q } },
    `Encontré esto en tu catálogo. ¿Cuál es?\n${lista(hallados.map((o) => ({ ...o, detalle: `${pesos(o.precio ?? 0)} (${ETIQUETA_TASA[o.tasa ?? '0.18']})` })), `0) Ninguno: línea libre «${q}»`)}`,
    hallados.slice(0, 4).map((_, i) => String(i + 1)));
}

async function pasoLineaElegir(e: Estado, texto: string, t: string, b: BuscadoresGuiado): Promise<RespuestaGuiada> {
  if (/^0\b/.test(t) && e.l?.nombre) return siguiente({ ...e, p: 'precio-libre', o: undefined, l: { nombre: e.l.nombre, tasa: '0.18' } });
  const el = elegir(texto, e.o ?? []);
  if (!el) return pasoLinea({ ...e, p: 'linea' }, texto, b);
  const p = el.opcion;
  return siguiente({ ...e, p: 'cantidad', o: undefined, l: { nombre: limpiarValor(p.nombre, 255), productoId: p.id ?? undefined, precio: p.precio ?? 0, tasa: p.tasa ?? '0.18', bien: p.bien } });
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
export const bloquePaso = (e: Estado) => '```paso\n' + JSON.stringify(e) + '\n```';

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
  const o = crudo as Record<string, unknown>;
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
        `• ${e.f === 'notacredito' ? 'Acreditas' : 'Cargas'}:\n${resumenLineas(ls)}`, `• **Total ${pesos(t.total)}**`].join('\n');
    }
    case 'borrador': {
      const filas = [doc];
      if (v.clienteNombre) filas.push(`• Cliente nuevo: ${nombreSeguro(v.clienteNombre)}`);
      if (v.lineas) { const ls = leerLineas(v.lineas); filas.push(`• Líneas nuevas:\n${resumenLineas(ls)}`, `• **Total ${pesos(totalesDeLineas(ls).total)}**`); }
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
      const r = leerSeleccion(texto, leerLineas(e.v.lineasBase));
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
