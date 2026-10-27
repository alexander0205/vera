import type { ToolSet } from 'ai';
import { normalizar, rd, hoyRd } from './util';
import { clasificarSolicitud } from './politicas';
import { NOMBRE_REGISTRO, type PantallaActual } from './pantalla';
import { MAPA_SISTEMA } from './mapa-sistema';
import { bloqueFormulario, detectarFormulario, FORMULARIOS } from './formulario';
import { DISPARA_FLUJO_COTIZACION, DISPARA_FLUJO_FACTURA, FLUJOS, formatearFlujo, type EstadoConfiguracion } from './guias-paso';
import { explicarMensajesDgii, significadoDelEstado, type MensajeDgii } from './dgii';
import { textoGrafico } from './grafico';
import { textoTarjeta, type TonoTarjeta } from './tarjeta';
import { formatearComparacion, type Metrica } from './comparar';

/**
 * Contestador local: responde SIN llamar a la IA las preguntas claras y
 * frecuentes, con las mismas herramientas (y los mismos permisos) que usa el
 * modelo. La IA queda para lo que de verdad necesita razonar: comparaciones,
 * preguntas compuestas, explicaciones o lo que aquí no se entiende.
 *
 * La regla es no perder calidad: solo contesta cuando está SEGURO de qué se
 * pregunta. Una pregunta que toca dos temas, compara, pide un porqué o es
 * larga va a la IA. Si la IA no está disponible o falla, se reintenta aquí en
 * modo «tolerante», que acepta un poco más de ambigüedad antes de rendirse.
 *
 * Es pura salvo por las herramientas que recibe: se prueba sin base ni modelo.
 */

export interface RespuestaLocal {
  respuesta: string;
  /** Qué entendió (para registros y pruebas). */
  intencion: string;
}

type Herramienta = {
  execute?: (input: unknown, opts: unknown) => unknown;
  inputSchema?: { safeParse?: (v: unknown) => { success: boolean; data?: unknown } };
};
type Fila = Record<string, unknown>;

// ── Períodos ────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface Periodo { desde: string; hasta: string; etiqueta: string }

const iso = (y: number, m: number, d: number) => {
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.toISOString().slice(0, 10);
};
const finDeMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const sumarDias = (ymd: string, dias: number) => {
  const f = new Date(`${ymd}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
};
export const fechaLarga = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};
const nombreMes = (y: number, m: number) => `${MESES[m - 1]} de ${y}`;

/**
 * Lo que la persona dijo, como rango de fechas. Sin período explícito es el mes
 * en curso, igual que las pantallas de reportes. `null` si dijo algo de tiempo
 * que aquí no se sabe leer («el trimestre pasado», «desde marzo»): eso va a la IA.
 */
export function interpretarPeriodo(t: string, hoy = hoyRd()): Periodo | null {
  const [Y, M, D] = hoy.split('-').map(Number);

  if (/\bhoy\b/.test(t)) return { desde: hoy, hasta: hoy, etiqueta: `hoy (${fechaLarga(hoy)})` };
  if (/\bayer\b/.test(t)) {
    const a = sumarDias(hoy, -1);
    return { desde: a, hasta: a, etiqueta: `ayer (${fechaLarga(a)})` };
  }
  const ultimos = t.match(/\bultimos? (\d{1,3}) dias\b/);
  if (ultimos) {
    const n = Number(ultimos[1]);
    return { desde: sumarDias(hoy, -(n - 1)), hasta: hoy, etiqueta: `los últimos ${n} días` };
  }
  const semanas = t.match(/\bultim[oa]s? (\d{1,2}) semanas\b/);
  if (semanas) {
    const k = Number(semanas[1]);
    return { desde: sumarDias(hoy, -(k * 7 - 1)), hasta: hoy, etiqueta: `las últimas ${k} semanas` };
  }
  const meses = t.match(/\bultim[oa]s? (\d{1,2}) meses\b/);
  if (meses) {
    const k = Number(meses[1]);
    const total = Y * 12 + (M - 1) - (k - 1);
    return { desde: iso(Math.floor(total / 12), (total % 12) + 1, 1), hasta: hoy, etiqueta: `los últimos ${k} meses` };
  }
  if (/\b(esta semana|semana actual)\b/.test(t)) {
    const dow = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
    const lunes = sumarDias(hoy, -dow);
    return { desde: lunes, hasta: hoy, etiqueta: `esta semana (desde el ${fechaLarga(lunes)})` };
  }
  if (/\b(semana pasada|semana anterior)\b/.test(t)) {
    const dow = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7;
    const lunes = sumarDias(hoy, -dow - 7);
    return { desde: lunes, hasta: sumarDias(lunes, 6), etiqueta: `la semana pasada (${fechaLarga(lunes)} al ${fechaLarga(sumarDias(lunes, 6))})` };
  }
  if (/\b(mes pasado|mes anterior)\b/.test(t)) {
    const y = M === 1 ? Y - 1 : Y;
    const m = M === 1 ? 12 : M - 1;
    return { desde: iso(y, m, 1), hasta: iso(y, m, finDeMes(y, m)), etiqueta: `el mes pasado (${nombreMes(y, m)})` };
  }
  if (/\b(este ano|ano actual|en el ano|del ano|en lo que va de ano)\b/.test(t)) {
    return { desde: iso(Y, 1, 1), hasta: hoy, etiqueta: `en lo que va de ${Y}` };
  }
  if (/\b(ano pasado|ano anterior)\b/.test(t)) {
    return { desde: iso(Y - 1, 1, 1), hasta: iso(Y - 1, 12, 31), etiqueta: `en ${Y - 1}` };
  }
  // Rangos abiertos o compuestos («desde marzo», «entre julio y agosto», «el trimestre»): la IA.
  if (/\b(trimestre|semestre|quincena|desde|hasta|entre|semanas)\b/.test(t)) return null;
  const mes = t.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?: (?:de |del )?(\d{4}))?/);
  if (mes) {
    const m = mes[1] === 'setiembre' ? 9 : MESES.indexOf(mes[1]) + 1;
    // «en noviembre» dicho en octubre es el noviembre pasado, no el que viene.
    const y = mes[2] ? Number(mes[2]) : m > M ? Y - 1 : Y;
    return { desde: iso(y, m, 1), hasta: iso(y, m, finDeMes(y, m)), etiqueta: nombreMes(y, m) };
  }
  return { desde: iso(Y, M, 1), hasta: iso(Y, M, finDeMes(Y, M)), etiqueta: `este mes (${nombreMes(Y, M)})` };
}

// ── Qué se pregunta ─────────────────────────────────────────────────────────

/** Preguntas que necesitan razonar: van a la IA aunque nombren un tema conocido. */
const COMPLEJA = /\b(compar\w*|versus|vs|diferencia|por que|porque|analiz\w*|explica\w*|recomiend\w*|recomendacion|proyecc\w*|predic\w*|deberia|estrategia|conviene|mejorar|aumentar|reducir|bajar|subir|crecio|cayo|subio|bajo mas|cual fue el mejor|cual fue el peor|y tambien|ademas)\b/;

const VERBOS_CAMBIO = [
  // imperativo
  'cambia', 'cambiale', 'borra', 'elimina', 'anula', 'modifica', 'deshabilita', 'desactiva', 'activa', 'edita',
  'envia', 'enviale', 'enviame', 'manda', 'mandale', 'mandame', 'crea', 'creame', 'registra', 'emite', 'cobra', 'aplica', 'aplicame',
  'asigna', 'pon', 'ponle', 'quita', 'agrega', 'agregale', 'haz que', 'sube', 'subeme', 'baja', 'transfiere', 'transfierele',
  'otorga', 'otorgame', 'concede', 'habilita', 'inhabilita', 'resetea', 'reinicia', 'restablece', 'reemplaza', 'sustituye',
  'corrige', 'actualiza', 'marca', 'marcame', 'duplica', 'cancela', 'suspende', 'reactiva', 'renueva', 'paga', 'abona',
  'devuelve', 'reembolsa', 'invita', 'expulsa', 'bloquea', 'desbloquea', 'regala', 'perdona', 'dame permisos', 'dame acceso',
  // subjuntivo («quiero que cambies…»)
  'cambies', 'borres', 'elimines', 'anules', 'modifiques', 'deshabilites', 'desactives', 'actives', 'edites', 'envies', 'mandes',
  'crees', 'registres', 'emitas', 'cobres', 'apliques', 'asignes', 'pongas', 'quites', 'agregues', 'hagas', 'subas', 'bajes',
  'transfieras', 'otorgues', 'habilites', 'resetees', 'reinicies', 'restablezcas', 'reemplaces', 'sustituyas', 'corrijas',
  'actualices', 'marques', 'dupliques', 'canceles', 'suspendas', 'reactives', 'renueves', 'pagues', 'abones', 'devuelvas',
  'reembolses', 'invites', 'expulses', 'bloquees', 'desbloquees',
  // infinitivo («puedes cambiar…»)
  'cambiar', 'borrar', 'eliminar', 'anular', 'modificar', 'deshabilitar', 'desactivar', 'activar', 'editar', 'enviar', 'mandar',
  'crear', 'registrar', 'emitir', 'cobrar', 'aplicar', 'asignar', 'poner', 'quitar', 'agregar', 'hacer', 'subir', 'bajar',
  'transferir', 'otorgar', 'habilitar', 'resetear', 'reiniciar', 'restablecer', 'reemplazar', 'sustituir', 'corregir',
  'actualizar', 'marcar', 'duplicar', 'cancelar', 'suspender', 'reactivar', 'renovar', 'pagar', 'abonar', 'devolver',
  'reembolsar', 'invitar', 'expulsar', 'bloquear', 'desbloquear',
];
const ENTRADA_CAMBIO = '(?:por favor |porfa |ahora |ya |oye |entonces |quiero que |necesito que |puedes |podrias |me puedes |me podrias |te pido que )*';
const PIDE_CAMBIO = new RegExp(`^${ENTRADA_CAMBIO}(?:${VERBOS_CAMBIO.join('|')})\\b`);

const GUIA = /\b(donde|en que (modulo|parte|seccion|pantalla|menu)|que pantalla|como (se |puedo |hago |creo |registro |veo |configuro |agrego |anado |cambio |anulo |emito |envio |imprimo |exporto |cobro |pago |declaro |programo |recibo |activo |desactivo |doy de alta |subo |cargo |ingreso |hago para )|como (crear|registrar|ver|configurar|agregar|cambiar|anular|emitir|enviar|programar|recibir|imprimir|exportar|cobrar|activar|subir|cargar|hacer))/;

/** Una pregunta del colegio acotada a un grado, una sección o un detalle que la lista general no da. */
const FILTRO_ESCOLAR = /\b(inicial|pre ?primario|kinder|maternal|primaria|secundaria|bachillerato|\d+(ro|do|to|vo|no|er|mo)|primero|segundo|tercero|cuarto|quinto|sexto|seccion|grado|curso|desde cuando|quien debe mas|que estudiante|cual estudiante|cual alumno|que alumno)\b/;

interface Intencion {
  id: string;
  /** Cuánto pesa si coincide: con dos temas a la vez, decide el más específico. */
  peso: number;
  re: RegExp;
  herramienta: string;
  usaPeriodo?: boolean;
}

const INTENCIONES: Intencion[] = [
  { id: 'ultima-compra', peso: 11, re: /\b(ultim[ao]s? (factura|compra|gasto)s? (recibid[ao]s?|de proveedor|de proveedores)|factura (de|del) proveedor mas reciente|ultim[ao]s? (compra|gasto)s?)\b/, herramienta: 'listar_gastos_compras' },
  { id: 'ultima-factura', peso: 10, re: /\b(ultim[ao]s? facturas?(?! (recibid|de proveedor|de compra))|factura mas reciente|ultima venta)\b/, herramienta: 'buscar_facturas' },
  { id: 'por-revisar', peso: 9, re: /\b(por revisar|pendientes? (de|por) revisar|sin registrar|bandeja de (gastos|facturas))\b/, herramienta: 'facturas_por_revisar' },
  { id: 'borradores', peso: 8, re: /\bborrador(es)?\b/, herramienta: 'buscar_facturas' },
  { id: 'stock-bajo', peso: 8, re: /\b(agot\w*|stock bajo|bajo (el )?minimo|por acabarse|se (me )?(esta|estan) acabando|poco inventario|sin existencia)\b/, herramienta: 'buscar_productos' },
  { id: 'turnos-caja', peso: 8, re: /\b(turnos? (de caja )?abiertos?|caja abierta|cajas abiertas|quien tiene (la )?caja)\b/, herramienta: 'turnos_caja' },
  // «¿Cuántos estudiantes tienen deuda vencida?» es de cobros, no de matrícula: con deuda o mora no se cuenta aquí.
  { id: 'matriculas', peso: 7, re: /\b(matriculad\w*|inscritos|cuantos (estudiantes|alumnos)(?! (tienen|con|deben|que (deben|tienen)|estan (en mora|atrasad|vencid|debiendo)|en mora|atrasad))|estudiantes por curso|alumnos por curso)\b/, herramienta: 'resumen_matriculas' },
  { id: 'nomina', peso: 7, re: /\b(cuantos empleados|empleados activos|costo de (la )?nomina|nomina del mes|cuanto (pago|pagamos) (en|de) nomina|ultima nomina)\b/, herramienta: 'resumen_nomina' },
  { id: 'itbis', peso: 7, re: /\bitbis\b/, herramienta: 'resumen_itbis', usaPeriodo: true },
  { id: 'cobros-metodo', peso: 6, re: /\b(metodos? de pago|formas? de pago|por metodo|en efectivo|por transferencia|con tarjeta)\b/, herramienta: 'cobros_por_metodo', usaPeriodo: true },
  { id: 'mejores-clientes', peso: 6, re: /\b((mejores|principales|top) clientes|clientes que mas (compran|compraron|facturan)|quien(es)? (me )?compra(n)? mas)\b/, herramienta: 'ventas_por_cliente', usaPeriodo: true },
  { id: 'mas-vendidos', peso: 6, re: /\b((productos?|servicios?|conceptos?) (mas vendidos?|que mas (se )?vend\w*)|que (es lo que )?mas (se )?vend\w*|lo mas vendido)\b/, herramienta: 'ventas_por_producto', usaPeriodo: true },
  // La deuda del colegio son sus CARGOS (mensualidades, inscripción), con factura o sin ella: no sale en Cuentas por cobrar.
  { id: 'deuda-colegio', peso: 9, re: /\b(estudiantes?|alumnos?|familias?|padres|representantes)\b.{0,40}\b(deben|debe|deuda\w*|mora\b|moros\w*|vencid\w*|atrasad\w*|no (han |ha )?pagad\w*|sin pagar)|\b(deben|deuda|moros\w*|mora)\b.{0,40}\b(estudiantes?|alumnos?|familias?|padres)\b/, herramienta: 'cargos_escolares' },
  { id: 'cartera', peso: 5, re: /\b(quien(es)? me debe(n)?|me deben|que me deben|cuentas? por cobrar|cartera|morosos?|deudores|vencid[oa]s?|pendiente de cobro|por cobrar|quien no me (ha )?pagado|facturas? sin pagar|facturas? pendientes? de pago|que mas me debe|mas me debe)\b/, herramienta: 'cuentas_por_cobrar' },
  { id: 'gastos', peso: 5, re: /\b(gast(o|os|e|ado|amos|aron)|cuanto (he |hemos )?gastado|egresos)\b/, herramienta: 'resumen_gastos', usaPeriodo: true },
  { id: 'cobrado', peso: 4, re: /\b(cuanto (se )?(ha |han |he |hemos )?(cobr\w*|recib\w*)|que (se )?(cobr\w*|entro)|cobros?|pagos recibidos|ultim[oa]s (pagos|cobros))\b/, herramienta: 'pagos_recibidos', usaPeriodo: true },
  { id: 'cliente-mas-facturas', peso: 7, re: /\b(cliente (con|que tiene|que tuvo) (mas|mayor)( cantidad de| numero de)? facturas|(quien|que cliente|cual cliente) (tiene|tuvo|se repite|repite)( mas)? facturas?|mas facturas (repetidas|por cliente)|facturas mas repetidas|cliente mas repetido|quien se repite mas)\b/, herramienta: 'clientes_con_mas_facturas', usaPeriodo: true },
  { id: 'recurrentes', peso: 6, re: /\b(facturas? recurrentes?|facturacion (automatica|recurrente)|cobros? automaticos?|mensualidades? automaticas?|recurrentes activas?)\b/, herramienta: 'facturas_recurrentes' },
  { id: 'ventas', peso: 3, re: /\b(vend(i|ido|imos|ieron|emos)|ventas|facturad[oa]s?|factur(e|amos)|ingresos|ticket promedio|cuantas facturas (emiti|hice|genere|hicimos|emitimos)|cuanto (he |hemos )?factur\w*)\b/, herramienta: 'resumen_ventas', usaPeriodo: true },
  { id: 'tendencia', peso: 9, re: /\b(tendencia|evolucion|ventas por (mes|dia|semana)|mes a mes|dia a dia|grafic[ao]s? (de )?(las )?ventas|como (han ido|van|fueron) (mis |las )?ventas|ventas de los ultimos \d+ (meses|dias|semanas))\b/, herramienta: 'tendencia_ventas' },
  { id: 'buscar-factura', peso: 12, re: /\bfactura (numero |no\.? |#)?(e\d{9,}|[a-z]{1,4}-[a-z0-9-]{4,})\b/, herramienta: 'buscar_facturas' },
  { id: 'anuladas', peso: 8, re: /\b(facturas? anuladas?|anuladas)\b/, herramienta: 'buscar_facturas' },
  { id: 'cotizaciones', peso: 7, re: /\b(cuantas cotizaciones|ultimas cotizaciones|mis cotizaciones|cotizaciones (pendientes|enviadas|aceptadas|rechazadas|vencidas|abiertas))\b/, herramienta: 'listar_cotizaciones' },
  { id: 'por-pagar', peso: 7, re: /\b(cuentas por pagar|cuanto debo( a (mis )?proveedores)?|deuda con (mis )?proveedores|por pagar a proveedores)\b/, herramienta: 'resumen_gastos', usaPeriodo: true },
];

/**
 * Las respuestas que salen de elegir un tema por palabras clave: aciertan el
 * tema pero pueden errar el dato. Son las que se le pasan a Jev para revisar
 * (ver decisiones.ts); un saludo o un formulario no hace falta revisarlos.
 */
export const INTENCIONES_POR_PALABRAS: ReadonlySet<string> = new Set(INTENCIONES.map((i) => i.id));

// ── Plantillas ──────────────────────────────────────────────────────────────

const n = (x: unknown) => Number(x) || 0;
const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '0%');
const tabla = (cab: string[], filas: (string | number)[][]) =>
  [`| ${cab.join(' | ')} |`, `| ${cab.map(() => '---').join(' | ')} |`, ...filas.map((f) => `| ${f.join(' | ')} |`)].join('\n');

/** 2026-10-08 → 08/10 (para etiquetas de enlace cortas). */
const corta = (f: unknown) => {
  const m = String(f ?? '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '';
};

/** `[texto](/ruta)` solo si hay una ruta; la validez la garantiza el filtro final. */
const enlazar = (texto: string, ruta: unknown) => (typeof ruta === 'string' && ruta.startsWith('/') ? `[${texto}](${ruta})` : texto);

/** Pantallas a las que lleva una cifra: tocarla abre donde se ve ese número. */
const PANTALLA_DE_CIFRA = {
  ventas: '/dashboard/reportes/panel',
  porCobrar: '/dashboard/cuentas-por-cobrar',
  gastos: '/dashboard/gastos',
  cobros: '/dashboard/pagos',
} as const;
const cifra = (monto: number, ruta: string) => `[${rd(monto)}](${ruta})`;

type Plantilla = (r: Fila, p: Periodo | null, pedido: Record<string, unknown>) => string;

/** Lo que deben los estudiantes según sus cargos (de `cargos_escolares` con `soloConDeuda`). */
function deudaColegio(r: Fila, soloVencido: boolean): string {
  const total = n(r.saldoTotal);
  const vencido = n(r.saldoVencido);
  const cuantos = n(r.estudiantesConDeuda);
  if (!total) return soloVencido ? 'Ningún estudiante tiene cargos vencidos.' : 'Ningún estudiante tiene cargos pendientes de pago.';
  const est = `${cuantos} estudiante${cuantos === 1 ? '' : 's'}`;
  const sinFactura = n(r.saldoSinFacturar);
  const l = [
    soloVencido
      ? `**${est}** tiene${cuantos === 1 ? '' : 'n'} cargos vencidos por ${enlazar(rd(total), r.enlaceLista)}.`
      : `**${est}** debe${cuantos === 1 ? '' : 'n'} ${enlazar(rd(total), r.enlaceLista)}${vencido ? `; **${rd(vencido)}** ya está vencido` : ', y nada está vencido todavía'}.`,
  ];
  if (sinFactura >= total) l.push('Nada de eso tiene factura todavía: no sale en Cuentas por cobrar hasta que se facture.');
  else if (sinFactura) l.push(`De eso, ${rd(sinFactura)} todavía no tiene factura.`);
  const filas = (r.porEstudiante as Fila[] | undefined) ?? [];
  if (filas.length) {
    l.push('', tabla(['Estudiante', 'Debe', 'Vencido', 'Cargos'],
      filas.slice(0, 10).map((f) => [String(f.estudiante), rd(n(f.debe)), n(f.vencido) ? rd(n(f.vencido)) : '—', n(f.cargos)])));
  }
  return l.join('\n');
}

const PLANTILLAS: Record<string, Plantilla> = {
  ventas: (r, p) => {
    const ventas = n(r.ventasNetas);
    if (!n(r.facturas)) {
      return `No hay ventas registradas ${p!.etiqueta}.\n\nPor cobrar hoy tienes **${rd(n(r.porCobrarHoy))}**${n(r.vencidoHoy) ? `, de los cuales **${rd(n(r.vencidoHoy))}** están vencidos` : ''}.`;
    }
    return [
      `Vendiste ${cifra(ventas, PANTALLA_DE_CIFRA.ventas)} ${p!.etiqueta}, en ${n(r.facturas)} factura${n(r.facturas) === 1 ? '' : 's'}.`,
      '',
      `- Base imponible: ${rd(n(r.baseImponible))}`,
      `- ITBIS: ${rd(n(r.itbis))}`,
      `- Ticket promedio: ${rd(n(r.ticketPromedio))}`,
      `- Por cobrar hoy: ${cifra(n(r.porCobrarHoy), PANTALLA_DE_CIFRA.porCobrar)}${n(r.vencidoHoy) ? ` (vencido: ${rd(n(r.vencidoHoy))})` : ''}`,
    ].join('\n');
  },

  'deuda-colegio': (r, _p, pedido) => deudaColegio(r, pedido.soloVencido === true),

  cartera: (r, _p, pedido) => {
    const total = n(r.totalPorCobrar);
    const colegio = pedido.colegio as Fila | undefined;
    // Un colegio puede no tener ni una factura pendiente y deber sus mensualidades:
    // los cargos sin facturar no están en Cuentas por cobrar. Antes decía «Todo está cobrado».
    if (!total && colegio && n(colegio.saldoTotal)) return deudaColegio(colegio, pedido.soloVencidas === true);
    if (!total) return 'No tienes cuentas por cobrar pendientes. Todo está cobrado.';
    const vencido = n(r.vencido0a30) + n(r.vencido31a60) + n(r.vencido61a90) + n(r.vencidoMasDe90);
    const deudores = (r.mayoresDeudores as Fila[] | undefined) ?? [];
    // «Morosos» pide solo lo vencido: los clientes y la tabla ya vienen filtrados.
    if (pedido.soloVencidas && !vencido) {
      return `No tienes clientes con facturas vencidas. Lo que te deben (${rd(total)}) todavía está dentro de su plazo.`;
    }
    const lineas = [
      pedido.soloVencidas
        // Con «solo vencidas» la API ya filtró: su total es lo vencido, no la cartera entera.
        ? `Tienes **${rd(vencido)}** vencido entre ${n(r.clientesConDeuda)} cliente${n(r.clientesConDeuda) === 1 ? '' : 's'}.`
        : `Te deben ${cifra(total, PANTALLA_DE_CIFRA.porCobrar)} entre ${n(r.clientesConDeuda)} cliente${n(r.clientesConDeuda) === 1 ? '' : 's'}${vencido ? `; **${rd(vencido)}** ya está vencido` : ', y nada está vencido todavía'}.`,
    ];
    if (deudores.length) {
      lineas.push('', tabla(['Cliente', 'Debe', 'Facturas', 'Días vencido'],
        deudores.slice(0, 8).map((d) => [String(d.cliente), rd(n(d.debe)), n(d.facturas), n(d.diasVencidoMaximo) > 0 ? n(d.diasVencidoMaximo) : '—'])));
      const top = deudores[0];
      if (deudores.length > 1 && n(top.debe) / total >= 0.25) {
        lineas.push('', `${top.cliente} concentra el ${pct(n(top.debe), total)} de lo que te deben.`);
      }
    }
    if (n(r.vencidoMasDe90)) lineas.push('', `Ojo: ${rd(n(r.vencidoMasDe90))} tienen más de 90 días vencidos.`);
    if (colegio && n(colegio.saldoSinFacturar)) {
      lineas.push('', `Además, el colegio tiene ${enlazar(rd(n(colegio.saldoSinFacturar)), colegio.enlaceLista)} en cargos de estudiantes que todavía no tienen factura.`);
    }
    return lineas.join('\n');
  },

  itbis: (r, p) => [
    `ITBIS de ${p!.etiqueta}:`,
    '',
    `- Facturado (débito): ${rd(n(r.itbisFacturado))}`,
    `- Adelantado en compras (crédito): ${rd(n(r.itbisEnCompras))}`,
    `- **A pagar: ${rd(n(r.itbisAPagar))}**`,
    '',
    `Base imponible de ventas: ${rd(n(r.baseVentas))}.`,
  ].join('\n'),

  gastos: (r, p) => {
    if (!n(r.gastos)) return `No hay gastos registrados ${p!.etiqueta}.${n(r.borradores) ? ` Tienes ${n(r.borradores)} en borrador sin registrar.` : ''}`;
    const cats = ((r.porCategoria as Fila[]) ?? []).filter((c) => n(c.total) > 0);
    const l = [
      `Gastaste ${cifra(n(r.totalGastado), PANTALLA_DE_CIFRA.gastos)} ${p!.etiqueta}, en ${n(r.gastos)} registro${n(r.gastos) === 1 ? '' : 's'}.`,
      '',
      `- Por pagar a proveedores: ${rd(n(r.porPagarAProveedores))}`,
      `- ITBIS por adelantar: ${rd(n(r.itbisPorAdelantar))}`,
      `- Retenciones: ${rd(n(r.retenciones))}`,
    ];
    if (cats.length) l.push('', tabla(['Categoría', 'Total'], cats.slice(0, 8).map((c) => [String(c.categoria), rd(n(c.total))])));
    if (n(r.borradores)) l.push('', `Además hay ${n(r.borradores)} gasto${n(r.borradores) === 1 ? '' : 's'} en borrador sin registrar.`);
    return l.join('\n');
  },

  'cobros-metodo': (r, p) => {
    const m = ((r.metodos as Fila[]) ?? []).filter((x) => n(x.cobrado) > 0);
    if (!m.length) return `No hay cobros registrados ${p!.etiqueta}.`;
    const total = m.reduce((s, x) => s + n(x.cobrado), 0);
    const grafico = textoGrafico(`Cobros por método ${p!.etiqueta}`, 'RD$', m.map((x) => ({ etiqueta: String(x.metodo), valor: n(x.cobrado) })), 'torta');
    return [
      `Cobraste ${cifra(total, PANTALLA_DE_CIFRA.cobros)} ${p!.etiqueta}:`,
      '',
      ...(grafico ? [grafico, ''] : []),
      tabla(['Método', 'Cobrado', 'Pagos', '%'], m.map((x) => [String(x.metodo), rd(n(x.cobrado)), n(x.pagos), pct(n(x.cobrado), total)])),
    ].join('\n');
  },

  cobrado: (r, p) => (n(r.cantidad)
    ? `Se cobraron ${cifra(n(r.totalCobrado), PANTALLA_DE_CIFRA.cobros)} ${p!.etiqueta}, en ${n(r.cantidad)} pago${n(r.cantidad) === 1 ? '' : 's'}.`
    : `No hay pagos recibidos ${p!.etiqueta}.`),

  'mejores-clientes': (r, p) => {
    const c = (r.clientes as Fila[]) ?? [];
    if (!c.length) return `No hay ventas a clientes ${p!.etiqueta}.`;
    const grafico = textoGrafico(`Ventas por cliente ${p!.etiqueta}`, 'RD$', c.slice(0, 6).map((x) => ({ etiqueta: String(x.cliente), valor: n(x.ventas) })));
    return [`Tus mejores clientes ${p!.etiqueta}:`, '', ...(grafico ? [grafico, ''] : []), tabla(['Cliente', 'Ventas', 'Facturas'], c.slice(0, 8).map((x) => [String(x.cliente), rd(n(x.ventas)), n(x.facturas)]))].join('\n');
  },

  'cliente-mas-facturas': (r) => {
    const c = (r.clientes as Fila[]) ?? [];
    if (!c.length) return 'No encontré facturas para comparar.';
    const [a] = c;
    const l = [
      `El cliente con más facturas es **${a.cliente}**, con **${n(a.facturas)}** (${n(a.emitidas)} emitidas${n(a.borradores) ? ` y ${n(a.borradores)} en borrador` : ''}), por **${rd(n(a.total))}**.`,
      '',
      'Lo conté sobre las facturas de venta (sin anuladas, sin notas de crédito ni débito). Las facturas recurrentes son otra cosa: pregúntame por ellas si te refieres a esas.',
      '',
      tabla(['Cliente', 'Facturas', 'Total', 'Últimas facturas'],
        c.slice(0, 8).map((x) => [
          String(x.cliente),
          `${n(x.facturas)} (${n(x.emitidas)} emitidas, ${n(x.borradores)} borrador)`,
          rd(n(x.total)),
          ((x.ultimas as Fila[]) ?? []).map((u) => enlazar(String(u.numero || `Borrador ${corta(u.fecha)}`), u.enlace)).join('<br>'),
        ])),
    ];
    if (r.parcial) l.push('', 'Hay más de 2,000 facturas: el conteo cubre las 2,000 más recientes.');
    return l.join('\n');
  },

  recurrentes: (r) => {
    const c = (r.porCliente as Fila[]) ?? [];
    if (!c.length) return 'No tienes facturas recurrentes activas.';
    const filas: (string | number)[][] = [];
    for (const x of c) {
      const lista = (x.recurrentes as Fila[]) ?? [];
      lista.forEach((rec, i) => filas.push([
        i === 0 ? String(x.cliente) : '↳',
        enlazar(String(rec.nombre ?? 'Recurrente'), rec.enlace),
        String(rec.frecuencia ?? '—'),
        rd(n(rec.totalEstimado)),
        String(rec.proximaEmision ?? '—'),
      ]));
    }
    return [
      `Tienes **${n(r.coinciden)}** factura${n(r.coinciden) === 1 ? '' : 's'} recurrente${n(r.coinciden) === 1 ? '' : 's'} activa${n(r.coinciden) === 1 ? '' : 's'}, por **${rd(n(r.totalEstimadoPorCiclo))}** por ciclo:`,
      '',
      tabla(['Cliente', 'Recurrente', 'Frecuencia', 'Total', 'Próxima emisión'], filas),
      '',
      'Todas están en [Facturas recurrentes](/dashboard/facturas-recurrentes).',
    ].join('\n');
  },

  'mas-vendidos': (r, p) => {
    const c = (r.productos as Fila[]) ?? [];
    if (!c.length) return `No hay ventas de productos o servicios ${p!.etiqueta}.`;
    return [
      `Lo más vendido ${p!.etiqueta} (base sin ITBIS):`,
      '',
      tabla(['Producto / servicio', 'Ref.', 'Unidades', 'Ventas'], c.slice(0, 8).map((x) => [String(x.nombre), String(x.referencia ?? '—'), n(x.unidades), rd(n(x.ventas))])),
    ].join('\n');
  },

  'por-revisar': (r) => {
    const f = (r.facturas as Fila[]) ?? [];
    if (!n(r.totalPorRevisar)) return 'No tienes facturas por revisar. Todo lo que llegó por foto, enlace o PDF ya está registrado o descartado.';
    return [
      `Tienes **${n(r.totalPorRevisar)}** factura${n(r.totalPorRevisar) === 1 ? '' : 's'} por revisar:`,
      '',
      tabla(['Proveedor', 'Total', 'Fecha', 'Recibida'], f.slice(0, 8).map((x) => [String(x.proveedor ?? 'Sin leer todavía'), x.total != null ? rd(n(x.total)) : '—', String(x.fecha ?? '—'), String(x.recibida ?? '—')])),
      '',
      'Se revisan en [Gastos](/dashboard/gastos), en la bandeja «Facturas por revisar».',
    ].join('\n');
  },

  'ultima-factura': (r) => {
    const f = (r.facturas as Fila[]) ?? [];
    if (!f.length) return 'No encontré facturas registradas.';
    const [a] = f;
    const estado = String(a.estado) === 'BORRADOR' ? 'en **borrador** (aún no emitida)' : `**${String(a.estado).toLowerCase()}**`;
    return [
      `La última factura es ${enlazar(String(a.numero || `borrador del ${a.fecha}`), a.enlace)}, del **${a.fecha}**, a nombre de **${a.cliente || 'cliente no indicado'}**, por **${rd(n(a.total))}**, ${estado}.`,
      '',
      f.length > 1 ? tabla(['Factura', 'Cliente', 'Total', 'Fecha', 'Estado'], f.map((x) => [enlazar(String(x.numero || `Borrador ${x.fecha}`), x.enlace), String(x.cliente || '—'), rd(n(x.total)), String(x.fecha ?? '—'), String(x.estado)])) : '',
      '',
      `Todas están en [Facturas](/dashboard/facturas).`,
    ].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n');
  },

  'ultima-compra': (r) => {
    const f = (r.registros as Fila[]) ?? [];
    if (!f.length) {
      return 'No hay compras ni gastos de proveedor registrados en ese período. Los comprobantes que llegan por foto o enlace esperan en la bandeja [Facturas por revisar](/dashboard/gastos) hasta que se registran.';
    }
    return [
      'Las últimas compras y gastos registrados:',
      '',
      tabla(['Fecha', 'Proveedor', 'Total', 'Estado', 'Detalle'], f.slice(0, 5).map((x) => [String(x.fecha ?? '—'), String(x.proveedor ?? '—'), rd(n(x.total)), String(x.estadoPago ?? x.estado ?? '—'), enlazar('Ver', x.enlace)])),
      '',
      'Lista completa en [Compras](/dashboard/compras).',
    ].join('\n');
  },

  borradores: (r) => {
    const f = (r.facturas as Fila[]) ?? [];
    if (!n(r.coinciden)) return 'No tienes facturas en borrador.';
    return [
      r.parcial
        ? `Tienes **${n(r.coinciden)}** facturas en borrador. Sumando las ${n(r.filasEvaluadas)} más recientes dan **${rd(n(r.sumaTotal))}** (hay más, así que el total real es mayor). Las más recientes:`
        : `Tienes **${n(r.coinciden)}** factura${n(r.coinciden) === 1 ? '' : 's'} en borrador, por **${rd(n(r.sumaTotal))}** en total. Las más recientes:`,
      '',
      tabla(['Número', 'Cliente', 'Total', 'Fecha'], f.slice(0, 8).map((x) => [enlazar(String(x.numero || `Borrador ${x.fecha}`), x.enlace), String(x.cliente || '—'), rd(n(x.total)), String(x.fecha ?? '—')])),
      '',
      'Los borradores no cuentan en los reportes de ventas hasta que se emiten.',
    ].join('\n');
  },

  'buscar-factura': (r) => {
    const f = (r.facturas as Fila[]) ?? [];
    if (!n(r.coinciden)) return 'No encontré ninguna factura con ese número. Revisa que esté bien escrito (con guiones, si los lleva).';
    return [
      n(r.coinciden) === 1 ? 'Encontré esta factura:' : `Encontré ${n(r.coinciden)} facturas que coinciden:`,
      '',
      tabla(['Número', 'Cliente', 'Total', 'Fecha', 'Estado'], f.slice(0, 5).map((x) => [
        enlazar(String(x.numero || `Borrador ${corta(x.fecha)}`), x.enlace), String(x.cliente || '—'), rd(n(x.total)), String(x.fecha ?? ''), String(x.estado ?? ''),
      ])),
    ].join('\n');
  },

  anuladas: (r) => {
    const f = (r.facturas as Fila[]) ?? [];
    if (!n(r.coinciden)) return 'No hay facturas anuladas.';
    return [
      `Hay **${n(r.coinciden)}** factura${n(r.coinciden) === 1 ? '' : 's'} anulada${n(r.coinciden) === 1 ? '' : 's'}, por **${rd(n(r.sumaTotal))}** en total. Las más recientes:`,
      '',
      tabla(['Número', 'Cliente', 'Total', 'Fecha'], f.slice(0, 8).map((x) => [
        enlazar(String(x.numero || `Borrador ${corta(x.fecha)}`), x.enlace), String(x.cliente || '—'), rd(n(x.total)), String(x.fecha ?? ''),
      ])),
    ].join('\n');
  },

  cotizaciones: (r, _p, pedido) => {
    const c = (r.cotizaciones as Fila[]) ?? [];
    const que = pedido.estado ? ` ${String(pedido.estado)}s` : '';
    if (!n(r.coinciden)) return `No tienes cotizaciones${que}.`;
    return [
      `Tienes **${n(r.coinciden)}** cotización${n(r.coinciden) === 1 ? '' : 'es'}${que}, por **${rd(n(r.sumaTotal))}** en total.`,
      '',
      tabla(['Número', 'Cliente', 'Total', 'Estado', 'Vence'], c.slice(0, 8).map((x) => [
        enlazar(String(x.numero), x.enlace), String(x.cliente || '—'), rd(n(x.total)), String(x.estado ?? ''), String(x.vence ?? '—'),
      ])),
    ].join('\n');
  },

  tendencia: (r) => {
    const pts = (r.puntos as Fila[]) ?? [];
    const por = String(r.agrupadoPor ?? 'dia');
    const unidad = por === 'mes' ? 'mes' : por === 'semana' ? 'semana' : 'día';
    const con = pts.filter((x) => n(x.ventas) > 0);
    if (!con.length) return `No hay ventas registradas en ${r.periodo}.`;
    const total = pts.reduce((s, x) => s + n(x.ventas), 0);
    const mejor = con.reduce((a, x) => (n(x.ventas) > n(a.ventas) ? x : a));
    const et = (x: Fila) => etiquetaPeriodo(String(x.periodo), por);
    const grafico = textoGrafico(`Ventas por ${unidad}`, 'RD$', pts.map((x) => ({ etiqueta: et(x), valor: n(x.ventas) })), 'linea');
    return [
      `Vendiste **${rd(total)}** en ${r.periodo}, por ${unidad}. El más alto fue **${et(mejor)}** con ${rd(n(mejor.ventas))}.`,
      '',
      ...(grafico ? [grafico, ''] : []),
      r.fuente
        ? `Es el mismo dato del gráfico «Tendencia de ingresos» del Dashboard.`
        : 'Agrupado por fecha de emisión de la factura (igual que Reportes).',
      '',
      pts.some((x) => x.facturas != null)
        ? tabla(['Período', 'Ventas', 'Facturas'], pts.slice(-12).map((x) => [et(x), rd(n(x.ventas)), n(x.facturas)]))
        : tabla(['Período', 'Ventas'], pts.slice(-12).map((x) => [et(x), rd(n(x.ventas))])),
    ].join('\n');
  },

  'por-pagar': (r, p) => {
    const debo = n(r.porPagarAProveedores);
    if (!debo) return `No tienes cuentas por pagar a proveedores ${p!.etiqueta}.`;
    return [
      `Debes **${rd(debo)}** a proveedores (facturas de compra de ${p!.etiqueta} sin pagar).`,
      '',
      `Gasto total del período: ${rd(n(r.totalGastado))}.`,
    ].join('\n');
  },

  'stock-bajo': (r) => {
    const p = (r.productos as Fila[]) ?? [];
    if (!n(r.coinciden)) return 'Ningún producto está por debajo de su mínimo de inventario.';
    return [
      `Hay **${n(r.coinciden)}** producto${n(r.coinciden) === 1 ? '' : 's'} en o por debajo del mínimo:`,
      '',
      tabla(['Producto', 'Existencia', 'Mínimo'], p.slice(0, 10).map((x) => [String(x.nombre), n(x.existencia), n(x.minimo)])),
    ].join('\n');
  },

  'turnos-caja': (r) => {
    const t = (r.turnos as Fila[]) ?? [];
    if (!t.length) return 'No hay turnos de caja abiertos en este momento.';
    return [
      `Hay ${t.length} turno${t.length === 1 ? '' : 's'} de caja abierto${t.length === 1 ? '' : 's'}:`,
      '',
      tabla(['Cajero', 'Abierto desde', 'Fondo inicial'], t.map((x) => [String(x.cajero), String(x.apertura ?? '—'), rd(n(x.montoApertura))])),
    ].join('\n');
  },

  matriculas: (r) => {
    const c = (r.porCurso as Fila[]) ?? [];
    if (!n(r.totalMatriculados)) return 'No hay estudiantes con matrícula activa en el período actual.';
    return [
      `Hay **${n(r.totalMatriculados)}** estudiantes matriculados:`,
      '',
      tabla(['Curso', 'Estudiantes'], c.slice(0, 40).map((x) => [String(x.curso), n(x.estudiantes)])),
    ].join('\n');
  },

  nomina: (r) => {
    const c = (r.ultimasCorridas as Fila[]) ?? [];
    const l = [`Tienes **${n(r.empleadosActivos)}** empleado${n(r.empleadosActivos) === 1 ? '' : 's'} activo${n(r.empleadosActivos) === 1 ? '' : 's'}, con salarios base por **${rd(n(r.salariosBaseMensuales))}** al mes.`];
    if (c.length) {
      l.push('', 'Últimas nóminas:', '', tabla(['Período', 'Estado', 'Neto', 'Pago'], c.map((x) => [String(x.descripcion ?? x.periodo), String(x.estado), rd(n(x.neto)), String(x.fechaPago ?? '—')])));
    }
    return l.join('\n');
  },
};

// ── Guía ────────────────────────────────────────────────────────────────────

interface ResGuia {
  resultados: { titulo: string; modulo: string; menu: string; ruta: string; que: string; pasos?: string[]; puntaje: number }[];
  noDisponibles: { titulo: string; modulo: string; motivo: string }[];
}

function plantillaGuia(g: ResGuia, tolerante: boolean, cambio: boolean): string | null {
  const [a, b] = g.resultados;
  const intro = cambio ? 'Eso no lo hago desde aquí, pero te digo dónde se hace. ' : '';
  if (!a) {
    if (g.noDisponibles.length) {
      const x = g.noDisponibles[0];
      return `${intro}${x.titulo} es parte de **${x.modulo}**. ${x.motivo}, así que no puedes abrirla desde tu cuenta. Si la necesitas, habla con el administrador de tu empresa o pulsa **Hablar con una persona**.`;
    }
    return null;
  }
  // Seguro: un ganador claro. Si hay dos parecidos, se ofrecen los dos.
  const claro = a.puntaje >= 8 && (!b || a.puntaje >= b.puntaje * 1.35);
  if (!claro && !tolerante && a.puntaje < 6) return null;

  if (claro) {
    const l = [`${intro}Lo encuentras en **${a.modulo}**, en el menú **${a.menu}**: [${a.titulo}](${a.ruta}).`, '', a.que];
    if (a.pasos?.length) l.push('', ...a.pasos.map((p, i) => `${i + 1}. ${p}`));
    return l.join('\n');
  }
  const opciones = g.resultados.slice(0, 3);
  return [
    `${intro}Puede ser una de estas pantallas:`,
    '',
    ...opciones.map((o) => `- [${o.titulo}](${o.ruta}) — **${o.modulo}** › ${o.menu.split('›').slice(1).join('›').trim() || o.menu}. ${o.que}`),
    '',
    'Dime cuál y te explico los pasos.',
  ].join('\n');
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-07-01» → «jul 2026» (por mes) o «06/07» (por día / semana). */
function etiquetaPeriodo(periodo: string, por: string): string {
  const m = periodo.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return periodo;
  if (por === 'mes') return `${MES_CORTO[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return m[3] ? `${m[3]}/${m[2]}` : periodo;
}

/**
 * «Ventas por mes» sin período: los últimos 6 meses, por mes. Con período
 * explícito se respeta, agrupando por día (hasta 45 días) o por mes.
 */
function entradaTendencia(t: string, periodo: Periodo | null, hoy?: string): Record<string, unknown> {
  const h = hoy ?? hoyRd();
  const dicho = /\b(este mes|hoy|ayer|semana|mes pasado|ano|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ultimos)\b/.test(t);
  const porMes = /\b(por mes|mes a mes|meses|evolucion|tendencia)\b/.test(t);
  if (periodo && dicho) {
    const dias = (Date.parse(periodo.hasta) - Date.parse(periodo.desde)) / 86_400_000 + 1;
    const agrupar = /\bpor semana\b/.test(t) ? 'semana' : dias > 45 || /\bpor mes\b/.test(t) ? 'mes' : 'dia';
    return { desde: periodo.desde, hasta: periodo.hasta, agrupar };
  }
  const [Y, M] = h.split('-').map(Number);
  const ini = new Date(Date.UTC(Y, M - 1 - 5, 1)).toISOString().slice(0, 10);
  return { desde: ini, hasta: h, agrupar: porMes || !dicho ? 'mes' : 'dia' };
}

// ── Seguimiento ──────────────────────────────────────────────────

const MESES_RE = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const FRASE_PERIODO = new RegExp(
  `\\b(hoy|ayer|esta semana|la semana pasada|semana pasada|este mes|el mes pasado|mes pasado|este ano|el ano pasado|ano pasado|ultimos? \\d+ (?:dias|semanas|meses)|(?:en )?(?:${MESES_RE})(?: de \\d{4})?)\\b`,
);
const DIMENSION = /^(?:y |y de |y segun |y desglosado )?(?:por|segun|desglosado por|separado por|agrupado por) (?:el |la |cada )?(cliente|clientes|producto|productos|servicio|servicios|concepto|conceptos|metodos de pago|metodo de pago|metodos|metodo|forma de pago|formas de pago|mes|meses|dia|dias|semana|semanas)$/;
const ANTERIOR = /^(?:y )?(?:el |la )?(mes|semana|ano|dia) (?:anterior|previo|pasado)$/;
const MAS = /^(?:y )?(?:dame |muestrame |ver |quiero ver )?(?:mas|todos|todas)(?: el detalle| detalle| resultados| filas| clientes| facturas| productos)?$/;

const BASE_POR_DIMENSION: Record<string, string> = {
  cliente: 'mis mejores clientes', clientes: 'mis mejores clientes',
  producto: 'productos mas vendidos', productos: 'productos mas vendidos', servicio: 'productos mas vendidos',
  servicios: 'productos mas vendidos', concepto: 'productos mas vendidos', conceptos: 'productos mas vendidos',
  metodo: 'cobros por metodo de pago', metodos: 'cobros por metodo de pago',
  'metodo de pago': 'cobros por metodo de pago', 'metodos de pago': 'cobros por metodo de pago',
  'forma de pago': 'cobros por metodo de pago', 'formas de pago': 'cobros por metodo de pago',
  mes: 'ventas por mes', meses: 'ventas por mes', dia: 'ventas por dia', dias: 'ventas por dia',
  semana: 'ventas por semana', semanas: 'ventas por semana',
};
const ANTERIOR_A: Record<string, string> = { mes: 'el mes pasado', semana: 'la semana pasada', ano: 'el ano pasado', dia: 'ayer' };

/**
 * «¿Y por cliente?» después de «cuánto vendí este mes» → «mis mejores clientes
 * este mes». Devuelve la pregunta completa, 'DONDE' para «dame más», o null.
 * Solo reordena lo que ya se preguntó; no adivina un tema nuevo.
 */
export function reescribirSeguimiento(t: string, previaT: string): string | 'DONDE' | null {
  const frase = previaT.match(FRASE_PERIODO)?.[1] ?? '';

  const dim = t.match(DIMENSION);
  if (dim) {
    const base = BASE_POR_DIMENSION[dim[1]];
    // Por mes/día/semana el período lo decide la tendencia; con período, se respeta.
    return base ? `${base}${frase && !/^ventas por (mes|dia|semana)$/.test(base) ? ` ${frase}` : ''}` : null;
  }

  const ant = t.match(ANTERIOR);
  if (ant) {
    if (!FRASE_PERIODO.test(previaT) && !/\b(vend|venta|cobr|gast|itbis|cliente|producto)\w*/.test(previaT)) return null;
    return `${previaT.replace(FRASE_PERIODO, ' ').replace(/\s+/g, ' ').trim()} ${ANTERIOR_A[ant[1]]}`;
  }

  // «Compara con el mes pasado»: de lo que se estaba viendo (gastos, cobros, ITBIS o ventas).
  const cmp = t.match(/^(?:y )?compara(?:lo|r)? (?:con|contra|vs) (.+)$/);
  if (cmp) {
    const que = /\bitbis\b/.test(previaT) ? 'itbis' : /\bgast\w*/.test(previaT) ? 'gastos' : /\bcobr\w*/.test(previaT) ? 'cobros' : 'ventas';
    return `compara ${que} de ${frase || 'este mes'} con ${cmp[1]}`;
  }

  if (MAS.test(t)) return 'DONDE';
  return null;
}

// ── Comparativos ─────────────────────────────────────────────────

const DISPARA_COMPARACION = /\b(compar\w*|versus|vs|contra|frente a|respecto a|con relacion a|en relacion al)\b/;
const SEPARADOR_COMPARACION = /\s+(?:con|y|vs|versus|contra|frente a|respecto a|con relacion a|en relacion al|comparad[oa] con|comparad[oa] al)\s+/;

function metricaDe(t: string): Metrica {
  if (/\b(itbis|impuesto)\b/.test(t)) return 'itbis';
  if (/\b(gast\w*|compras|egresos)\b/.test(t)) return 'gastos';
  if (/\b(cobr\w*|pagos? recibid\w*|recaud\w*)\b/.test(t)) return 'cobros';
  return 'ventas';
}

/** El mismo tramo, un año antes. «Octubre 2026» → «Octubre 2025»; «este año» → «el año pasado». */
function mismoPeriodoAnioAnterior(p: Periodo): Periodo {
  const y = (f: string) => `${Number(f.slice(0, 4)) - 1}${f.slice(4)}`;
  const desde = y(p.desde);
  const hasta = y(p.hasta);
  return { desde, hasta, etiqueta: `${p.etiqueta.replace(/\s*\(.*\)$/, '')} (${Number(p.desde.slice(0, 4)) - 1})` };
}

/**
 * Lee «A vs B» o «comparado con B». Devuelve null si no entiende los períodos
 * (entonces decide la IA). Con un solo lado, el otro es el período en curso.
 */
export function parsearComparacion(t: string, hoy: string): { metrica: Metrica; a: Periodo; b: Periodo } | null {
  if (!DISPARA_COMPARACION.test(t)) return null;
  // Si además pide explicar la causa, razonar es trabajo de la IA.
  if (/\b(por que|porque|que (cambio|paso|causo)|a que se debe|explica\w*|motivo|razon)\b/.test(t)) return null;
  const metrica = metricaDe(t);
  const mismoMesAnioPasado = /\bmismo (mes|periodo|tramo)\b.{0,30}\bano (pasado|anterior)\b/.test(t);

  const limpio = t.replace(/^(?:y |entonces )?(?:compara\w*|comparame|como (?:voy|vamos|estoy|estamos|van|va|me fue|nos fue)|que tal)\s+(?:mis |las |los |el |la )?(?:ventas|cobros|gastos|itbis|ingresos|facturacion|resultados)?\s*(?:de |del |en )?/, '');
  const partes = limpio.replace(/^comparad[oa]\s+(?:con|al|a|contra)\s+/, '').split(SEPARADOR_COMPARACION).map((x) => x.trim()).filter(Boolean);

  const leer = (frase: string): Periodo | null => {
    // Sin ninguna palabra de tiempo, interpretarPeriodo devuelve «este mes»: no es lo que dijo.
    if (!/\b(hoy|ayer|semana|mes|ano|trimestre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ultimos?)\b/.test(frase)) return null;
    return interpretarPeriodo(frase, hoy);
  };

  let a: Periodo | null = null;
  let b: Periodo | null = null;
  if (partes.length >= 2) {
    a = leer(partes[0]);
    b = leer(partes[1]);
    const esAnio = /\b(ano pasado|ano anterior)\b/.test(partes[1]) || mismoMesAnioPasado;
    if (a && esAnio && a.etiqueta.indexOf('en lo que va de') < 0) b = mismoPeriodoAnioAnterior(a);
  } else if (partes.length === 1) {
    b = leer(partes[0]);
    a = interpretarPeriodo('este mes', hoy);
    if (b && (/\b(ano pasado|ano anterior)\b/.test(partes[0]) || mismoMesAnioPasado)) b = mismoPeriodoAnioAnterior(a!);
  }
  if (!a || !b) return null;
  return { metrica, a, b };
}

const HERRAMIENTA_Y_CAMPO: Record<Metrica, [string, string, (d: Fila) => number]> = {
  ventas: ['resumen_ventas', 'ventasNetas', (d) => n(d.ventasNetas)],
  cobros: ['pagos_recibidos', 'totalCobrado', (d) => n(d.totalCobrado)],
  gastos: ['resumen_gastos', 'totalGastado', (d) => n(d.totalGastado)],
  itbis: ['resumen_itbis', 'itbisAPagar', (d) => n(d.itbisAPagar)],
};

async function compararPeriodos(tools: ToolSet, t: string, hoy: string): Promise<string | null> {
  const c = parsearComparacion(t, hoy);
  if (!c) return null;
  const [herramienta, , leer] = HERRAMIENTA_Y_CAMPO[c.metrica];
  if (!tools[herramienta]) return null;
  const pedir = (p: Periodo) => ejecutar(tools, herramienta, c.metrica === 'cobros'
    ? { desde: p.desde, hasta: p.hasta, limite: 1 }
    : { desde: p.desde, hasta: p.hasta });
  const [ra, rb] = await Promise.all([pedir(c.a), pedir(c.b)]);
  if (!ra || !rb || ra.error || rb.error) return null;
  const etiqueta = (p: Periodo) => p.etiqueta.replace(/^(el |la |los |las )/, '');
  return formatearComparacion({
    metrica: c.metrica, hoy,
    a: { etiqueta: etiqueta(c.a), hasta: c.a.hasta, valor: leer(ra) },
    b: { etiqueta: etiqueta(c.b), hasta: c.b.hasta, valor: leer(rb) },
  });
}

// ── Resumen de la semana ──────────────────────────────────────────

const RESUMEN_SEMANA = /\b(resumen (de la|de esta|de la ultima|de lo de la|semanal)(?: semana)?|como (me )?(fue|va|ha ido|anduvo) la semana|balance (de|de la) semana|semana en resumen|resumen semanal|como (estuvo|esta) la semana)\b/;

async function resumenSemanal(tools: ToolSet, t: string, hoy: string): Promise<string | null> {
  const pasada = /\b(pasada|anterior|ultima)\b/.test(t);
  const p = interpretarPeriodo(pasada ? 'semana pasada' : 'esta semana', hoy);
  if (!p) return null;
  // La semana anterior a la que se mira, del mismo largo.
  const dias = Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000) + 1;
  const previa = { desde: sumarDias(p.desde, -7), hasta: sumarDias(p.desde, -7 + dias - 1) };

  const [ventas, anterior, cobros, gastos, clientes, dias_, cartera] = await Promise.all([
    tools.resumen_ventas ? intentar(tools, 'resumen_ventas', { desde: p.desde, hasta: p.hasta }) : null,
    tools.resumen_ventas ? intentar(tools, 'resumen_ventas', previa) : null,
    tools.pagos_recibidos ? intentar(tools, 'pagos_recibidos', { desde: p.desde, hasta: p.hasta, limite: 1 }) : null,
    tools.resumen_gastos ? intentar(tools, 'resumen_gastos', { desde: p.desde, hasta: p.hasta }) : null,
    tools.ventas_por_cliente ? intentar(tools, 'ventas_por_cliente', { desde: p.desde, hasta: p.hasta, limite: 3 }) : null,
    tools.tendencia_ventas ? intentar(tools, 'tendencia_ventas', { desde: p.desde, hasta: p.hasta, agrupar: 'dia' }) : null,
    tools.cuentas_por_cobrar ? intentar(tools, 'cuentas_por_cobrar', { soloVencidas: true, limite: 3 }) : null,
  ]);
  if (![ventas, cobros, gastos, clientes, cartera].some(Boolean)) return null;

  const L: string[] = [`**Resumen de ${pasada ? 'la semana pasada' : 'esta semana'}**, del ${fechaLarga(p.desde)} al ${fechaLarga(p.hasta)}`, ''];

  if (ventas) {
    const v = n(ventas.ventasNetas);
    let cmp = '';
    if (anterior && n(anterior.ventasNetas) > 0 && dias === 7) {
      const pct = Math.round(((v - n(anterior.ventasNetas)) / n(anterior.ventasNetas)) * 1000) / 10;
      cmp = ` — ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% frente a la semana anterior (${rd(n(anterior.ventasNetas))})`;
    }
    L.push(n(ventas.facturas)
      ? `- Ventas: **${rd(v)}** en ${n(ventas.facturas)} factura${n(ventas.facturas) === 1 ? '' : 's'}${cmp}`
      : '- Ventas: no hubo facturas emitidas');
  }
  if (cobros) L.push(n(cobros.cantidad) ? `- Cobrado: **${rd(n(cobros.totalCobrado))}** en ${n(cobros.cantidad)} pago${n(cobros.cantidad) === 1 ? '' : 's'}` : '- Cobrado: no se registraron pagos');
  if (gastos) L.push(n(gastos.gastos) ? `- Gastos: **${rd(n(gastos.totalGastado))}** en ${n(gastos.gastos)} registro${n(gastos.gastos) === 1 ? '' : 's'}` : '- Gastos: no se registraron');

  const pts = ((dias_?.puntos as Fila[] | undefined) ?? []).map((x) => ({ etiqueta: etiquetaDia(String(x.periodo)), valor: n(x.ventas) }));
  const grafico = textoGrafico('Ventas por día', 'RD$', pts);
  if (grafico) L.push('', grafico);

  const top = (clientes?.clientes as Fila[] | undefined) ?? [];
  if (top.length) {
    L.push('', '**Quienes más compraron**', '', tabla(['Cliente', 'Ventas', 'Facturas'], top.map((x) => [String(x.cliente), rd(n(x.ventas)), n(x.facturas)])));
  }

  if (cartera && n(cartera.totalPorCobrar)) {
    const venc = n(cartera.vencido0a30) + n(cartera.vencido31a60) + n(cartera.vencido61a90) + n(cartera.vencidoMasDe90);
    if (venc) L.push('', `Pendiente: tienes **${rd(venc)}** vencido por cobrar (de ${rd(n(cartera.totalPorCobrar))} en total). Pregúntame «¿quién me debe?» para el detalle.`);
  }
  return L.join('\n');
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function etiquetaDia(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS_SEMANA[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}

// ── Resumen del día ───────────────────────────────────────────────

const RESUMEN_DIA = /\b(resumen (del|de|para) (dia|hoy)|resumen de hoy|como va (el|mi) dia|como (va|vamos|amanecio|esta|estamos) (el )?(negocio|hoy|hoy dia)|que paso hoy|que (hay|tengo|queda) (pendiente )?(para )?hoy|panorama (de hoy|del dia)|como (va|anda) todo)\b/;

/** Una consulta que puede fallar o no existir sin tumbar el resumen. */
async function intentar(tools: ToolSet, nombre: string, input: Record<string, unknown>): Promise<Fila | null> {
  try {
    const r = await ejecutar(tools, nombre, input);
    return r && !r.error ? r : null;
  } catch {
    return null;
  }
}

async function resumenDelDia(tools: ToolSet, hoy: string): Promise<string | null> {
  const [ventas, cobros, cartera, borradores, porRevisar, turnos, stock] = await Promise.all([
    tools.resumen_ventas ? intentar(tools, 'resumen_ventas', { desde: hoy, hasta: hoy }) : null,
    tools.pagos_recibidos ? intentar(tools, 'pagos_recibidos', { desde: hoy, hasta: hoy, limite: 1 }) : null,
    tools.cuentas_por_cobrar ? intentar(tools, 'cuentas_por_cobrar', { soloVencidas: false, limite: 3 }) : null,
    tools.buscar_facturas ? intentar(tools, 'buscar_facturas', { estado: 'BORRADOR', limite: 1 }) : null,
    tools.facturas_por_revisar ? intentar(tools, 'facturas_por_revisar', { limite: 1 }) : null,
    tools.turnos_caja ? intentar(tools, 'turnos_caja', { estado: 'ABIERTO', limite: 10 }) : null,
    tools.buscar_productos ? intentar(tools, 'buscar_productos', { soloBajoMinimo: true, limite: 1 }) : null,
  ]);
  if (![ventas, cobros, cartera, borradores, porRevisar, turnos, stock].some(Boolean)) return null;

  const hoyLinea: string[] = [];
  if (ventas) {
    hoyLinea.push(n(ventas.facturas)
      ? `- Ventas: **${rd(n(ventas.ventasNetas))}** en ${n(ventas.facturas)} factura${n(ventas.facturas) === 1 ? '' : 's'}` : '- Ventas: todavía no hay facturas emitidas hoy');
  }
  if (cobros) {
    hoyLinea.push(n(cobros.cantidad)
      ? `- Cobrado: **${rd(n(cobros.totalCobrado))}** en ${n(cobros.cantidad)} pago${n(cobros.cantidad) === 1 ? '' : 's'}` : '- Cobrado: todavía no se ha registrado ningún pago hoy');
  }

  const atencion: string[] = [];
  if (cartera && n(cartera.totalPorCobrar)) {
    const vencido = n(cartera.vencido0a30) + n(cartera.vencido31a60) + n(cartera.vencido61a90) + n(cartera.vencidoMasDe90);
    atencion.push(`- Por cobrar: **${rd(n(cartera.totalPorCobrar))}** entre ${n(cartera.clientesConDeuda)} cliente${n(cartera.clientesConDeuda) === 1 ? '' : 's'}${vencido ? `, de los cuales ${rd(vencido)} ya están vencidos` : ''}`);
  }
  if (borradores && n(borradores.coinciden)) {
    atencion.push(`- Facturas en borrador sin emitir: **${n(borradores.coinciden)}** (${enlazar('ver borradores', borradores.enlaceLista)})`);
  }
  if (porRevisar && n(porRevisar.totalPorRevisar)) {
    atencion.push(`- Facturas de proveedor por revisar: **${n(porRevisar.totalPorRevisar)}** (${enlazar('revisarlas', porRevisar.enlace)})`);
  }
  if (turnos && !turnos.nota && ((turnos.turnos as Fila[]) ?? []).length) {
    const k = ((turnos.turnos as Fila[]) ?? []).length;
    atencion.push(`- Turnos de caja abiertos: **${k}** (${enlazar('ver caja', turnos.enlaceLista)})`);
  }
  if (stock && n(stock.coinciden)) {
    atencion.push(`- Productos en o bajo su mínimo de inventario: **${n(stock.coinciden)}**`);
  }

  return [
    `**Resumen de hoy, ${fechaLarga(hoy)}**`,
    '',
    ...(hoyLinea.length ? ['**Lo de hoy**', '', ...hoyLinea, ''] : []),
    ...(atencion.length ? ['**Lo que requiere atención**', '', ...atencion] : ['No hay nada pendiente que requiera atención: todo está al día.']),
  ].join('\n').trim();
}

// ── Pantalla actual ──────────────────────────────────────────────

const DONDE_ESTOY = /\b(que (puedo|podemos|se puede) hacer (en|aqui|desde|con) (esta|este|aqui|esto)?\s*(pantalla|pagina|seccion|modulo)?|que hago aqui|para que sirve (esta|este|esto)( pantalla| pagina| seccion)?|en que (pantalla|pagina|parte|modulo|seccion) (estoy|estamos)|que (estoy|estamos) (viendo|mirando)|donde (estoy|estamos)|que (es|veo) (esto|esta pantalla|esta pagina|aqui))\b/;
const quitarPeriodo = (t: string) => t.replace(/\b(este|esta|estos|estas) (mes|ano|semana|trimestre|periodo|dia)\b/g, ' ');
const DEICTICO_FACTURA = /\b(esta|esa|aqui|actual|la que (estoy|estamos) viendo)\b|\best[ao]\b/;
const PREGUNTA_DGII = /\b(rechaz\w*|por que (no|fue|esta|se)|motivo|error(es)?|problema|que (paso|pasa|le paso|tiene|esta pasando)|no (se )?(emitio|acepto|envio|valido)|falla\w*|observacion\w*|en proceso|pendiente de la dgii|aceptad[ao] por|estado (ante|de la) dgii|dgii)\b/;
const PREGUNTA_FACTURA = /\b(pagad[ao]|pago|pagos|debe|deben|adeuda|saldo|pendiente|total|cuanto|cliente|de quien|a quien|estado|vence|vencimiento|fecha|detalle|resumen|itbis|numero|ncf|ecf|aceptad[ao]|dgii|items?|lineas|productos?|que (dice|tiene|lleva))\b/;

const ETIQUETA_PAGO: Record<string, string> = { PAGADA: 'pagada', PARCIAL: 'con pago parcial', PENDIENTE: 'pendiente de pago' };
const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: 'Borrador (sin emitir)', ACEPTADO: 'Emitida y aceptada por la DGII', ACEPTADO_CONDICIONAL: 'Aceptada condicionalmente por la DGII',
  EN_PROCESO: 'En proceso ante la DGII', RECHAZADO: 'Rechazada por la DGII', ANULADO: 'Anulada', HISTORICA: 'Histórica',
};

function plantillaFacturaActual(r: Fila, t: string): string {
  const numero = String(r.numero || r.codigoInterno || 'sin número');
  const borrador = r.estado === 'BORRADOR';
  const total = n(r.total);
  const pendiente = n(r.pendiente);
  const de = r.cliente ? ` de ${r.cliente}` : '';
  let titular: string;
  if (/\b(pagad[ao]|pago|pagos|pague|debe|deben|adeuda|saldo|pendiente)\b/.test(t)) {
    titular = borrador && n(r.pagado) === 0
      ? `La factura ${numero} es un borrador: todavía no se emite ni se cobra.`
      : r.estadoPago === 'PAGADA'
        ? `Sí, la factura ${numero} está pagada por completo (${rd(total)}).`
        : `La factura ${numero} está ${ETIQUETA_PAGO[String(r.estadoPago)] ?? 'sin pagar'}: faltan ${rd(pendiente)} de ${rd(total)}.`;
  } else {
    titular = `Estás viendo la factura ${numero}${de}.`;
  }
  const datos: [string, string][] = [];
  if (r.cliente) datos.push(['Cliente', `${r.cliente}${r.rnc ? ` (RNC ${r.rnc})` : ''}`]);
  if (r.dependiente) datos.push(['Estudiante', String(r.dependiente)]);
  datos.push(['Estado', ETIQUETA_ESTADO[String(r.estado)] ?? String(r.estado)]);
  datos.push(['Total', rd(total)]);
  datos.push(['Pagado', rd(n(r.pagado))]);
  if (n(r.notasDeCredito)) datos.push(['Notas de crédito', rd(n(r.notasDeCredito))]);
  datos.push(['Pendiente', rd(pendiente)]);
  if (r.fecha) datos.push(['Fecha', String(r.fecha)]);
  if (r.vence) datos.push(['Vence', String(r.vence)]);
  if (r.codigoInterno && r.codigoInterno !== r.numero) datos.push(['Código interno', String(r.codigoInterno)]);

  const pagos = (r.pagos as Fila[] | undefined) ?? [];
  const cola = pagos.length
    ? ['', '**Pagos recibidos**', '', tabla(['Fecha', 'Método', 'Monto'], pagos.map((p) => [String(p.fecha ?? ''), String(p.metodo ?? ''), rd(n(p.monto))]))]
    : [];
  const estadoDgii = String(r.estado);
  const tono: TonoTarjeta = estadoDgii === 'ACEPTADO' ? 'ok' : estadoDgii === 'RECHAZADO' || estadoDgii === 'ANULADO' ? 'malo'
    : estadoDgii === 'EN_PROCESO' || estadoDgii === 'ACEPTADO_CONDICIONAL' ? 'aviso' : 'neutro';
  const tarjeta = textoTarjeta({
    titulo: numero,
    subtitulo: [r.cliente, r.dependiente ? `estudiante: ${r.dependiente}` : null].filter(Boolean).join(' · ') || null,
    valor: rd(total),
    estado: { texto: ETIQUETA_ESTADO[estadoDgii] ?? estadoDgii, tono },
    filas: datos.filter(([k]) => !['Cliente', 'Estudiante', 'Estado', 'Total'].includes(k)),
  });
  return [titular, '', tarjeta, ...cola].join('\n');
}


// ── Cliente, cotización y producto en pantalla ───────────────────────────────

const DEICTICO_REGISTRO = /\b(este|esta|ese|esa|esto|eso|su|sus|aqui|actual|la que (estoy|estamos) viendo|el que (estoy|estamos) viendo)\b/;

const PREGUNTA_CLIENTE = /\b(debe|deben|deuda|adeuda|saldo|pendiente|facturas?|compro|comprado|compras|facturado|telefono|celular|whatsapp|correo|email|rnc|cedula|direccion|contacto|datos|ultima|ultimas|resumen|quien es|detalle|cuanto|cliente)\b/;
const PREGUNTA_COTIZACION = /\b(estado|total|monto|vence|vencida|vencimiento|cliente|de quien|fecha|aceptada|enviada|rechazada|detalle|resumen|cuanto|cotizacion)\b/;
const PREGUNTA_PRODUCTO = /\b(precio|cuesta|cuanto|stock|existencia|inventario|quedan|minimo|costo|itbis|impuesto|referencia|codigo|detalle|resumen|margen|ganancia|producto)\b/;

function filasDatos(datos: [string, string | number | null | undefined][]): string {
  return tabla(['Dato', 'Detalle'], datos.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
}

function plantillaClienteActual(r: Fila, t: string): string {
  const nombre = String(r.nombre ?? 'Cliente');
  const debe = n(r.debe);
  const ultimas = (r.ultimas as Fila[] | undefined) ?? [];
  let titular = `Estás viendo a **${nombre}**.`;
  if (/\b(debe|deben|deuda|adeuda|saldo|pendiente)\b/.test(t)) {
    const pend = n(r.facturasPendientes);
    const atraso = n(r.diasVencidoMaximo) > 0 ? `, la más atrasada con ${n(r.diasVencidoMaximo)} días vencida` : '';
    titular = debe > 0
      ? `**${nombre}** te debe **${rd(debe)}** en ${pend} factura${pend === 1 ? '' : 's'}${atraso}.`
      : `**${nombre}** no tiene saldo pendiente.`;
  }
  const recientes = n(r.facturasRecientes);
  const datos = filasDatos([
    ['Cliente', nombre],
    ['RNC / cédula', r.rnc as string | null],
    ['Correo', r.email as string | null],
    ['Teléfono', r.telefono as string | null],
    ['Dirección', r.direccion as string | null],
    ['Debe', debe > 0 ? rd(debe) : 'Nada pendiente'],
    ['Facturas recientes', `${recientes}${recientes >= 20 ? ' (las 20 más recientes)' : ''} · ${rd(n(r.totalRecientes))}`],
  ]);
  const filas = ultimas.slice(0, 5).map((x) => [
    enlazar(String(x.numero || `Borrador ${corta(x.fecha)}`), x.enlace), String(x.fecha ?? ''), String(x.estado ?? ''), rd(n(x.total)),
  ]);
  void datos;
  const tarjeta = textoTarjeta({
    titulo: nombre,
    subtitulo: [r.rnc, r.telefono].filter(Boolean).join(' · ') || null,
    valor: debe > 0 ? rd(debe) : null,
    estado: debe > 0 ? { texto: n(r.diasVencidoMaximo) > 0 ? 'Con deuda vencida' : 'Con saldo pendiente', tono: n(r.diasVencidoMaximo) > 0 ? 'malo' : 'aviso' } : { texto: 'Al día', tono: 'ok' },
    filas: [
      ['Correo', r.email as string | null], ['Dirección', r.direccion as string | null],
      ['Facturas recientes', `${recientes}${recientes >= 20 ? ' (las 20 más recientes)' : ''} · ${rd(n(r.totalRecientes))}`],
    ],
  });
  return [titular, '', tarjeta, ...(filas.length ? ['', '**Últimas facturas**', '', tabla(['Número', 'Fecha', 'Estado', 'Total'], filas)] : [])].join('\n');
}

function plantillaCotizacionActual(r: Fila): string {
  const numero = String(r.numero);
  const titular = r.vencida === true
    ? `La cotización **${numero}** está **vencida** (venció el ${r.vence}).`
    : `Estás viendo la cotización **${numero}**${r.cliente ? ` de **${r.cliente}**` : ''}.`;
  return [titular, '', filasDatos([
    ['Cliente', r.cliente as string | null],
    ['Estado', r.estado as string | null],
    ['Total', rd(n(r.total))],
    ['Emitida', r.emision as string | null],
    ['Vence', r.vence as string | null],
  ])].join('\n');
}

function plantillaProductoActual(r: Fila, t: string): string {
  const nombre = String(r.nombre);
  let titular = `Estás viendo **${nombre}**.`;
  if (/\b(precio|cuesta|cuanto)\b/.test(t)) {
    titular = `**${nombre}** cuesta **${rd(n(r.precio))}**${r.itbis ? ` (ITBIS ${r.itbis})` : ''}.`;
  } else if (/\b(stock|existencia|inventario|quedan|minimo)\b/.test(t)) {
    titular = r.controlaInventario
      ? `De **${nombre}** quedan **${n(r.stock)}** ${r.unidad ?? 'unidades'}${n(r.stock) <= n(r.stockMinimo) ? `, en o por debajo del mínimo (${n(r.stockMinimo)})` : ''}.`
      : `**${nombre}** no controla inventario.`;
  }
  return [titular, '', filasDatos([
    ['Producto', nombre],
    ['Referencia', r.referencia as string | null],
    ['Tipo', r.tipo as string | null],
    ['Precio', rd(n(r.precio))],
    ['Costo', n(r.costo) ? rd(n(r.costo)) : null],
    ['ITBIS', r.itbis as string | null],
    ['Existencia', r.controlaInventario ? `${n(r.stock)} ${r.unidad ?? ''}`.trim() : 'No controla inventario'],
    ['Mínimo', r.controlaInventario ? n(r.stockMinimo) : null],
  ])].join('\n');
}

const REGISTROS_EN_PANTALLA: Record<string, { herramienta: string; pregunta: RegExp; plantilla: (r: Fila, t: string) => string; intencion: string }> = {
  cliente: { herramienta: 'ver_cliente', pregunta: PREGUNTA_CLIENTE, plantilla: plantillaClienteActual, intencion: 'cliente-actual' },
  cotizacion: { herramienta: 'ver_cotizacion', pregunta: PREGUNTA_COTIZACION, plantilla: (r) => plantillaCotizacionActual(r), intencion: 'cotizacion-actual' },
  producto: { herramienta: 'ver_producto', pregunta: PREGUNTA_PRODUCTO, plantilla: plantillaProductoActual, intencion: 'producto-actual' },
};

function plantillaEstadoDgii(r: Fila): string {
  const numero = String(r.numero || r.codigoInterno || 'sin número');
  const estado = String(r.estado);
  const msgs = ((r.mensajesDgii as MensajeDgii[] | undefined) ?? []).filter((m) => m.mensaje);
  const lineas: string[] = [`La factura ${numero}: ${significadoDelEstado(estado)}`];

  if (estado === 'RECHAZADO' || estado === 'ACEPTADO_CONDICIONAL' || (estado !== 'ACEPTADO' && estado !== 'BORRADOR' && msgs.length)) {
    if (!msgs.length) {
      lineas.push('', 'La DGII no devolvió un mensaje que pueda leer aquí. Usa **Consultar DGII** en la factura para traer el detalle, o pulsa «Hablar con una persona».');
    } else {
      const ex = explicarMensajesDgii(msgs);
      lineas.push('', ex.length === 1 ? '**Qué dijo la DGII**' : '**Qué dijo la DGII** (' + ex.length + ' mensajes)');
      for (const e of ex) {
        lineas.push('', `- «${e.mensaje}»`, `  - Causa: ${e.causa}`, `  - Qué hacer: ${e.solucion}${e.enlace ? ` ([${e.enlace.texto}](${e.enlace.ruta}))` : ''}`);
      }
    }
  } else if (estado === 'EN_PROCESO') {
    lineas.push('', 'Espera unos minutos y usa **Consultar DGII** para actualizar el estado. No emitas otra: podrías duplicarla.');
  } else if (estado === 'ACEPTADO') {
    lineas.push('', 'No hay nada que corregir.');
  } else if (estado === 'BORRADOR') {
    lineas.push('', 'Cuando la emitas se envía a la DGII y ahí verás si la aceptó.');
  }
  if (r.trackId) lineas.push('', `Referencia de la DGII (trackId): ${r.trackId}`);
  return lineas.join('\n');
}

// ── Saludos ─────────────────────────────────────────────────────────────────

const SALUDO = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|hey|que tal)( (zero|asistente))?$/;
const GRACIAS = /^(gracias|muchas gracias|ok gracias|perfecto gracias|listo gracias|ok|okay|perfecto|listo|entendido)$/;

// ── Entrada ─────────────────────────────────────────────────────────────────

async function ejecutar(tools: ToolSet, nombre: string, input: unknown): Promise<Fila | null> {
  const t = tools[nombre] as Herramienta | undefined;
  if (!t?.execute) return null;
  // Por el mismo esquema que valida al modelo: aplica los valores por defecto
  // (límites, agrupación) y rechaza lo que no cuadra en vez de consultar mal.
  const v = t.inputSchema?.safeParse?.(input);
  if (v && !v.success) return null;
  return (await t.execute(v ? v.data : input, { toolCallId: `local-${nombre}`, messages: [] })) as Fila;
}

/**
 * Intenta responder sin IA. `tolerante` = la IA no está o acaba de fallar: se
 * acepta una guía menos segura antes que no contestar nada.
 * Devuelve null cuando no es claro qué se pregunta; entonces decide la IA.
 */
export async function responderLocal(
  texto: string,
  tools: ToolSet,
  /** `previa`: la última respuesta del asistente, para entender «¿dónde la veo?». */
  opts: { tolerante?: boolean; hoy?: string; previa?: string; /** La pregunta anterior de la persona, para «¿y el mes pasado?». */ preguntaPrevia?: string; /** La pantalla en la que está la persona (ya validada). */ pantalla?: PantallaActual | null } = {},
): Promise<RespuestaLocal | null> {
  const t = normalizar(texto);
  const tolerante = opts.tolerante ?? false;

  // Políticas: lo que NO se contesta con el modelo (prompt, claves, otra
  // empresa, asesoría, evasión…). Respuesta fija y revisada.
  const politica = clasificarSolicitud(texto);
  if (politica) return { intencion: `politica:${politica.categoria}`, respuesta: politica.respuesta };
  if (!t) return null;

  // Seguimiento: «¿y el mes pasado?», «y en septiembre», «y ayer». Si lo único
  // que trae es un período y antes se preguntó algo, se repite esa pregunta con
  // el período nuevo en vez de mandarlo a la IA sin contexto.
  if (opts.preguntaPrevia && t.split(' ').length <= 6
    && /^(y |y en |y para |y de |y que tal |entonces |ahora )?(en |de |para )?(el |la |los |las )?(hoy|ayer|esta semana|la semana pasada|semana pasada|este mes|mes pasado|el mes pasado|este ano|ano pasado|el ano pasado|ultimos? \d+ (dias|semanas|meses)|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)( de \d{4})?\??$/.test(t)
    && !INTENCIONES.some((i) => i.re.test(t))) {
    const r = await responderLocal(`${opts.preguntaPrevia} ${texto}`, tools, { ...opts, preguntaPrevia: undefined });
    if (r) return { ...r, intencion: `seguimiento:${r.intencion}` };
  }

  // Seguimiento con otra dimensión o «el anterior»: «¿y por cliente?», «¿y por método de pago?»,
  // «¿y el mes anterior?», «dame más». Se reescribe sobre la pregunta anterior.
  if (opts.preguntaPrevia && t.split(' ').length <= 8) {
    const reescrita = reescribirSeguimiento(t, normalizar(opts.preguntaPrevia));
    if (reescrita === 'DONDE') {
      const r = await responderLocal('donde la veo', tools, { ...opts, preguntaPrevia: undefined });
      if (r) return { ...r, intencion: `seguimiento:${r.intencion}` };
    } else if (reescrita) {
      const r = await responderLocal(reescrita, tools, { ...opts, preguntaPrevia: undefined });
      if (r) return { ...r, intencion: `seguimiento:${r.intencion}` };
    }
  }

  // «Este mes vs el mes pasado»: dos consultas y la diferencia, sin IA.
  if (DISPARA_COMPARACION.test(t)) {
    const c = await compararPeriodos(tools, t, opts.hoy ?? hoyRd());
    if (c) return { intencion: 'comparativo', respuesta: c };
  }

  // «¿Qué me falta para emitir mi primera factura?»: pasos reales con lo que ya está hecho.
  // «¿Qué me falta en el colegio?» es otra lista (estado_colegio): la arma la IA.
  if ((DISPARA_FLUJO_FACTURA.test(t) || DISPARA_FLUJO_COTIZACION.test(t)) && !/\b(colegio|escuela|gobernanza|escolar|matricul)/.test(t) && tools.estado_configuracion) {
    const flujo = FLUJOS.find((f) => f.id === (DISPARA_FLUJO_COTIZACION.test(t) ? 'primera-cotizacion' : 'primera-factura'))!;
    const estado = await intentar(tools, 'estado_configuracion', {});
    if (estado) return { intencion: 'guia-paso', respuesta: formatearFlujo(flujo, estado as unknown as EstadoConfiguracion) };
  }

  // «Resumen de la semana»: ventas, cobros, gastos, mejores clientes y lo vencido.
  if (RESUMEN_SEMANA.test(t)) {
    const r = await resumenSemanal(tools, t, opts.hoy ?? hoyRd());
    if (r) return { intencion: 'resumen-semana', respuesta: r };
  }

  // «Resumen de hoy»: varias consultas juntas, cada una opcional.
  if (RESUMEN_DIA.test(t)) {
    const r = await resumenDelDia(tools, opts.hoy ?? hoyRd());
    if (r) return { intencion: 'resumen-dia', respuesta: r };
  }

  // «¿En qué pantalla estamos?», «¿qué estoy viendo?»: se contesta con la pantalla real.
  if (opts.pantalla && DONDE_ESTOY.test(t)) {
    const p = opts.pantalla;
    if (p.registro?.tipo === 'factura' && tools.ver_factura) {
      const r = await ejecutar(tools, 'ver_factura', { id: p.registro.id });
      if (r && !r.error) return { intencion: 'registro-actual', respuesta: plantillaFacturaActual(r, 'detalle') };
    }
    const confP = p.registro ? REGISTROS_EN_PANTALLA[p.registro.tipo] : undefined;
    if (p.registro && confP && tools[confP.herramienta]) {
      const r = await ejecutar(tools, confP.herramienta, { id: p.registro.id });
      if (r && !r.error) return { intencion: confP.intencion, respuesta: confP.plantilla(r, 'detalle') };
    }
    if (p.registro) return { intencion: 'pantalla', respuesta: `Estás viendo ${NOMBRE_REGISTRO[p.registro.tipo]} (su pantalla de detalle).` };
    if (p.titulo) {
      const e = MAPA_SISTEMA.find((x) => x.ruta === p.ruta);
      const pasos = e?.como?.length ? ['', 'Desde aquí puedes:', '', ...e.como.filter((x) => !/^entra a /i.test(x)).map((x, i) => `${i + 1}. ${x}`)] : [];
      return { intencion: 'pantalla', respuesta: [`Estás en **${p.titulo}** (menú ${p.menu}).`, ...(e?.que ? ['', e.que] : []), ...pasos].join('\n') };
    }
  }

  // «¿Está pagada esta factura?» con una factura abierta en pantalla.
  const reg = opts.pantalla?.registro;
  if (reg?.tipo === 'factura' && DEICTICO_FACTURA.test(quitarPeriodo(t)) && (PREGUNTA_FACTURA.test(t) || PREGUNTA_DGII.test(t)) && tools.ver_factura) {
    const r = await ejecutar(tools, 'ver_factura', { id: reg.id });
    if (r && !r.error) {
      if (PREGUNTA_DGII.test(t) && !/\b(pagad[ao]|debe|saldo|pendiente de pago|cuanto)\b/.test(t)) {
        return { intencion: 'estado-dgii', respuesta: plantillaEstadoDgii(r) };
      }
      return { intencion: 'registro-actual', respuesta: plantillaFacturaActual(r, t) };
    }
  }

  // Cliente, cotización o producto abierto: «¿cuánto debe este cliente?», «¿cuánto cuesta este producto?».
  const conf = reg ? REGISTROS_EN_PANTALLA[reg.tipo] : undefined;
  if (reg && conf && tools[conf.herramienta] && DEICTICO_REGISTRO.test(quitarPeriodo(t)) && conf.pregunta.test(t)) {
    const r = await ejecutar(tools, conf.herramienta, { id: reg.id });
    if (r && !r.error) return { intencion: conf.intencion, respuesta: conf.plantilla(r, t) };
  }

  if (SALUDO.test(t)) {
    return {
      intencion: 'saludo',
      respuesta: '¡Hola! Pregúntame por tus ventas, lo que te deben, tus gastos o el ITBIS, o dime qué quieres hacer en Zero y te digo dónde se hace.',
    };
  }
  if (GRACIAS.test(t)) return { intencion: 'gracias', respuesta: '¡Con gusto! Si necesitas algo más, aquí estoy.' };

  // «¿Dónde la veo?», «¿dónde está eso?»: se refiere a lo último que se dijo. Si
  // esa respuesta traía enlaces (reales: ya pasaron el filtro), son la respuesta.
  if (opts.previa && /^(y )?(donde|en que pantalla|en que modulo) (puedo |se puede |podria )?(verl[aoes]+|esta|estan|lo veo|la veo|los veo|las veo|lo encuentro|la encuentro|lo consulto|la consulto)\b/.test(t)) {
    const enlaces = [...new Map([...opts.previa.matchAll(/\[([^\]]+)\]\((\/[^)\s]+)\)/g)].map((m) => [m[2], m[1]])).entries()].slice(0, 4);
    if (enlaces.length) {
      return {
        intencion: 'contexto',
        respuesta: ['Lo ves aquí:', '', ...enlaces.map(([ruta, nombre]) => `- [${nombre}](${ruta})`)].join('\n'),
      };
    }
  }

  if (/^(y )?(donde|en que pantalla|en que modulo) (puedo |se puede |podria )?(verl[aoes]+|lo veo|la veo|los veo|las veo)$/.test(t)) return null;

  const palabras = t.split(' ').length;
  const compleja = COMPLEJA.test(t) || palabras > 16;

  // «Crea un cliente», «importar productos»: el formulario viene en el propio chat.
  const form = detectarFormulario(texto);
  if (form) {
    const def = FORMULARIOS[form.id];
    const intro = form.id.startsWith('importar')
      ? `Claro. Sube el archivo aquí mismo y te muestro un resumen antes de importar nada.`
      : form.id === 'gasto'
        ? `Claro. Sube aquí la foto o el PDF del comprobante; queda en «por revisar» para que lo confirmes.`
        : form.id === 'convertir'
          ? `Claro. Elige la cotización y te creo un borrador de factura con sus datos.`
        : form.id === 'borrador'
          ? `Claro. Elige el borrador y cambia lo que necesites; lo demás se conserva.`
        : form.id === 'notadebito'
          ? `Claro. Elige la factura y el motivo, y anota los cargos nuevos que le sumas.`
        : form.id === 'notacredito'
          ? `Claro. Elige la factura y el motivo; las líneas vienen de la factura y ajustas lo que acreditas.`
        : form.id === 'anulacion'
          ? `Claro. Elige la factura y el motivo; antes de anular te pido confirmación.`
        : form.id === 'factura'
          ? `Claro. Llena la factura aquí mismo: puedes guardarla como borrador o emitirla.`
          : `Claro. Llena este formulario aquí mismo: ${def.titulo.toLowerCase()}.`;
    return { intencion: 'formulario', respuesta: `${intro}\n\n${bloqueFormulario(form.id, form.valores)}` };
  }

  // «Cámbiale el rol a…», «anula la factura…»: no se hace desde el chat, pero se guía.
  const cambio = PIDE_CAMBIO.test(t);
  if (cambio || GUIA.test(t)) {
    if (compleja && !tolerante) return null;
    const g = await ejecutar(tools, 'donde_encontrar', { consulta: texto });
    const r = g ? plantillaGuia(g as unknown as ResGuia, tolerante, cambio) : null;
    if (r) return { intencion: cambio ? 'cambio' : 'guia', respuesta: r };
    if (cambio) {
      return {
        intencion: 'cambio',
        respuesta: 'Todavía no hago cambios desde el chat: se hacen en la pantalla correspondiente de Zero. Cuando pueda crear o eliminar algo, siempre te mostraré qué va a pasar y esperaré tu confirmación. Si me dices qué quieres cambiar, te digo dónde está, o pulsa **Hablar con una persona**.',
      };
    }
    return null;
  }

  if (compleja && !tolerante) return null;

  const coinciden = INTENCIONES.filter((i) => i.re.test(t) && tools[i.herramienta]);
  if (!coinciden.length) return null;
  coinciden.sort((a, b) => b.peso - a.peso);
  // Dos temas unidos («ventas y gastos», «ITBIS, además lo cobrado») piden
  // combinar: eso lo hace mejor la IA. Sin conjunción, gana el más específico
  // («cobros por método» también dice «cobros», pero es una sola pregunta).
  if (!tolerante && coinciden.length > 1 && (/\b(y|e|tambien|ademas)\b|,/.test(t) || coinciden[0].peso === coinciden[1].peso)) return null;
  const it = coinciden[0];
  // Las respuestas del colegio son listas generales: si la pregunta filtra por
  // grado o sección, o pide «desde cuándo» / «quién debe más», la contesta la
  // IA con las herramientas. Antes salía la lista de todos sin filtrar.
  if (!tolerante && (it.id === 'deuda-colegio' || it.id === 'matriculas') && FILTRO_ESCOLAR.test(t)) return null;

  const periodo = interpretarPeriodo(t, opts.hoy);
  if (it.usaPeriodo && !periodo) return null;

  const input: Record<string, unknown> =
    it.id === 'cliente-mas-facturas' ? { limite: 8 }
      : it.id === 'recurrentes' ? { estado: /\b(pausad|finalizad)/.test(t) ? undefined : 'activa', limite: 12 }
      : it.id === 'ultima-factura' ? { limite: 5 }
      : it.id === 'ultima-compra' ? { limite: 5, desde: '2000-01-01', hasta: '2100-12-31' }
      : it.id === 'borradores' ? { estado: 'BORRADOR', limite: 8 }
      : it.id === 'tendencia' ? entradaTendencia(t, periodo, opts.hoy)
      : it.id === 'anuladas' ? { estado: 'ANULADO', limite: 8 }
      : it.id === 'buscar-factura' ? { q: t.match(/\bfactura (?:numero |no\.? |#)?([a-z0-9-]{6,})\b/)?.[1], limite: 5 }
      : it.id === 'cotizaciones' ? {
        estado: /\b(pendientes?|enviadas?|abiertas?)\b/.test(t) ? 'enviada' : /\baceptadas?\b/.test(t) ? 'aceptada'
          : /\brechazadas?\b/.test(t) ? 'rechazada' : /\bvencidas?\b/.test(t) ? 'vencida' : undefined,
        limite: 8,
      }
      : it.id === 'stock-bajo' ? { soloBajoMinimo: true, limite: 10 }
        : it.id === 'turnos-caja' ? { estado: 'ABIERTO', limite: 10 }
          : it.id === 'cartera' ? { soloVencidas: /\b(vencid|moros)/.test(t), limite: 8 }
            : it.id === 'deuda-colegio' ? { soloConDeuda: true, soloVencido: /\b(vencid|moros|mora\b|atrasad)/.test(t), limite: 10 }
            : it.id === 'por-revisar' ? { limite: 8 }
              : {};
  if (it.usaPeriodo && periodo && it.id !== 'cliente-mas-facturas') Object.assign(input, { desde: periodo.desde, hasta: periodo.hasta, limite: 8 });
  // «Qué cliente tiene más facturas»: salvo que diga un período, es todo el historial.
  if (it.id === 'cliente-mas-facturas' && periodo && /\b(este mes|hoy|ayer|semana|mes pasado|ano|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ultimos)\b/.test(t)) {
    Object.assign(input, { desde: periodo.desde, hasta: periodo.hasta });
  }

  // «Ventas por mes»: el mismo número que el gráfico del Dashboard, para que no haya dos versiones.
  const pideFechaConcreta = /\b(ano|20\d\d|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(t);
  if (it.id === 'tendencia' && input.agrupar === 'mes' && tools.ingresos_por_mes && !pideFechaConcreta) {
    const d = await ejecutar(tools, 'ingresos_por_mes', {});
    if (d && !d.error && Array.isArray(d.puntos) && d.puntos.length) {
      return { intencion: it.id, respuesta: PLANTILLAS[it.id](d, periodo, input) };
    }
  }

  const r = await ejecutar(tools, it.herramienta, input);
  if (!r) return null;
  // En un colegio, «quién me debe» también son los cargos de los estudiantes, con factura o sin ella.
  if (it.id === 'cartera' && tools.cargos_escolares) {
    const colegio = await ejecutar(tools, 'cargos_escolares', { soloConDeuda: true, soloVencido: input.soloVencidas === true, limite: 10 });
    if (colegio && !colegio.error) input.colegio = colegio;
  }
  return { intencion: it.id, respuesta: PLANTILLAS[it.id](r, periodo, input) };
}
