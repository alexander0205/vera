import type { ToolSet } from 'ai';
import { normalizar, rd, hoyRd } from './util';
import { clasificarSolicitud } from './politicas';

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
const COMPLEJA = /\b(compar\w*|versus|vs|diferencia|por que|porque|tendencia|evolucion|analiz\w*|explica\w*|recomiend\w*|recomendacion|proyecc\w*|predic\w*|deberia|estrategia|conviene|mejorar|aumentar|reducir|bajar|subir|crecio|cayo|subio|bajo mas|cual fue el mejor|cual fue el peor|y tambien|ademas)\b/;

const PIDE_CAMBIO = /^(por favor )?(cambia|cambiale|borra|elimina|anula|modifica|deshabilita|desactiva|activa|edita|envia|enviale|manda|mandale|crea|creame|registra|emite|cobra|aplica|asigna|pon|ponle|quita|agrega|agregale)\b/;

const GUIA = /\b(donde|en que (modulo|parte|seccion|pantalla|menu)|que pantalla|como (se |puedo |hago |creo |registro |veo |configuro |agrego |anado |cambio |anulo |emito |envio |imprimo |exporto |cobro |pago |activo |desactivo |doy de alta |subo |cargo |ingreso |hago para )|como (crear|registrar|ver|configurar|agregar|cambiar|anular|emitir|enviar|imprimir|exportar|cobrar|activar|subir|cargar|hacer))/;

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
  { id: 'matriculas', peso: 7, re: /\b(matriculad\w*|inscritos|cuantos (estudiantes|alumnos)|estudiantes por curso|alumnos por curso)\b/, herramienta: 'resumen_matriculas' },
  { id: 'nomina', peso: 7, re: /\b(cuantos empleados|empleados activos|costo de (la )?nomina|nomina del mes|cuanto (pago|pagamos) (en|de) nomina|ultima nomina)\b/, herramienta: 'resumen_nomina' },
  { id: 'itbis', peso: 7, re: /\bitbis\b/, herramienta: 'resumen_itbis', usaPeriodo: true },
  { id: 'cobros-metodo', peso: 6, re: /\b(metodos? de pago|formas? de pago|por metodo|en efectivo|por transferencia|con tarjeta)\b/, herramienta: 'cobros_por_metodo', usaPeriodo: true },
  { id: 'mejores-clientes', peso: 6, re: /\b((mejores|principales|top) clientes|clientes que mas (compran|compraron|facturan)|quien(es)? (me )?compra(n)? mas)\b/, herramienta: 'ventas_por_cliente', usaPeriodo: true },
  { id: 'mas-vendidos', peso: 6, re: /\b((productos?|servicios?|conceptos?) (mas vendidos?|que mas (se )?vend\w*)|que (es lo que )?mas (se )?vend\w*|lo mas vendido)\b/, herramienta: 'ventas_por_producto', usaPeriodo: true },
  { id: 'cartera', peso: 5, re: /\b(quien(es)? me debe(n)?|me deben|que me deben|cuentas? por cobrar|cartera|morosos?|deudores|vencid[oa]s?|pendiente de cobro|por cobrar|quien no me (ha )?pagado|facturas? sin pagar|facturas? pendientes? de pago|que mas me debe|mas me debe)\b/, herramienta: 'cuentas_por_cobrar' },
  { id: 'gastos', peso: 5, re: /\b(gast(o|os|e|ado|amos|aron)|cuanto (he |hemos )?gastado|egresos)\b/, herramienta: 'resumen_gastos', usaPeriodo: true },
  { id: 'cobrado', peso: 4, re: /\b(cuanto (se )?(he |hemos )?(cobr\w*|recib\w*)|que (se )?(cobr\w*|entro)|cobros?|pagos recibidos|ultim[oa]s (pagos|cobros))\b/, herramienta: 'pagos_recibidos', usaPeriodo: true },
  { id: 'cliente-mas-facturas', peso: 7, re: /\b(cliente (con|que tiene|que tuvo) (mas|mayor)( cantidad de| numero de)? facturas|(quien|que cliente|cual cliente) (tiene|tuvo|se repite|repite)( mas)? facturas?|mas facturas (repetidas|por cliente)|facturas mas repetidas|cliente mas repetido|quien se repite mas)\b/, herramienta: 'clientes_con_mas_facturas', usaPeriodo: true },
  { id: 'recurrentes', peso: 6, re: /\b(facturas? recurrentes?|facturacion (automatica|recurrente)|cobros? automaticos?|mensualidades? automaticas?|recurrentes activas?)\b/, herramienta: 'facturas_recurrentes' },
  { id: 'ventas', peso: 3, re: /\b(vend(i|ido|imos|ieron|emos)|ventas|facturad[oa]s?|factur(e|amos)|ingresos|ticket promedio|cuantas facturas (emiti|hice|genere|hicimos|emitimos)|cuanto (he |hemos )?factur\w*)\b/, herramienta: 'resumen_ventas', usaPeriodo: true },
  { id: 'buscar-factura', peso: 12, re: /\bfactura (numero |no\.? |#)?(e\d{9,}|[a-z]{1,4}-[a-z0-9-]{4,})\b/, herramienta: 'buscar_facturas' },
  { id: 'anuladas', peso: 8, re: /\b(facturas? anuladas?|anuladas)\b/, herramienta: 'buscar_facturas' },
  { id: 'cotizaciones', peso: 7, re: /\b(cuantas cotizaciones|ultimas cotizaciones|mis cotizaciones|cotizaciones (pendientes|enviadas|aceptadas|rechazadas|vencidas|abiertas))\b/, herramienta: 'listar_cotizaciones' },
  { id: 'por-pagar', peso: 7, re: /\b(cuentas por pagar|cuanto debo( a (mis )?proveedores)?|deuda con (mis )?proveedores|por pagar a proveedores)\b/, herramienta: 'resumen_gastos', usaPeriodo: true },
];

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

type Plantilla = (r: Fila, p: Periodo | null, pedido: Record<string, unknown>) => string;

const PLANTILLAS: Record<string, Plantilla> = {
  ventas: (r, p) => {
    const ventas = n(r.ventasNetas);
    if (!n(r.facturas)) {
      return `No hay ventas registradas ${p!.etiqueta}.\n\nPor cobrar hoy tienes **${rd(n(r.porCobrarHoy))}**${n(r.vencidoHoy) ? `, de los cuales **${rd(n(r.vencidoHoy))}** están vencidos` : ''}.`;
    }
    return [
      `Vendiste **${rd(ventas)}** ${p!.etiqueta}, en ${n(r.facturas)} factura${n(r.facturas) === 1 ? '' : 's'}.`,
      '',
      `- Base imponible: ${rd(n(r.baseImponible))}`,
      `- ITBIS: ${rd(n(r.itbis))}`,
      `- Ticket promedio: ${rd(n(r.ticketPromedio))}`,
      `- Por cobrar hoy: ${rd(n(r.porCobrarHoy))}${n(r.vencidoHoy) ? ` (vencido: ${rd(n(r.vencidoHoy))})` : ''}`,
    ].join('\n');
  },

  cartera: (r, _p, pedido) => {
    const total = n(r.totalPorCobrar);
    if (!total) return 'No tienes cuentas por cobrar pendientes. Todo está cobrado.';
    const vencido = n(r.vencido0a30) + n(r.vencido31a60) + n(r.vencido61a90) + n(r.vencidoMasDe90);
    const deudores = (r.mayoresDeudores as Fila[] | undefined) ?? [];
    // «Morosos» pide solo lo vencido: los clientes y la tabla ya vienen filtrados.
    if (pedido.soloVencidas && !vencido) {
      return `No tienes clientes con facturas vencidas. Lo que te deben (${rd(total)}) todavía está dentro de su plazo.`;
    }
    const lineas = [
      pedido.soloVencidas
        ? `Tienes **${rd(vencido)}** vencido entre ${n(r.clientesConDeuda)} cliente${n(r.clientesConDeuda) === 1 ? '' : 's'} (de ${rd(total)} por cobrar en total).`
        : `Te deben **${rd(total)}** entre ${n(r.clientesConDeuda)} cliente${n(r.clientesConDeuda) === 1 ? '' : 's'}${vencido ? `; **${rd(vencido)}** ya está vencido` : ', y nada está vencido todavía'}.`,
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
      `Gastaste **${rd(n(r.totalGastado))}** ${p!.etiqueta}, en ${n(r.gastos)} registro${n(r.gastos) === 1 ? '' : 's'}.`,
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
    return [
      `Cobraste **${rd(total)}** ${p!.etiqueta}:`,
      '',
      tabla(['Método', 'Cobrado', 'Pagos', '%'], m.map((x) => [String(x.metodo), rd(n(x.cobrado)), n(x.pagos), pct(n(x.cobrado), total)])),
    ].join('\n');
  },

  cobrado: (r, p) => (n(r.cantidad)
    ? `Se cobraron **${rd(n(r.totalCobrado))}** ${p!.etiqueta}, en ${n(r.cantidad)} pago${n(r.cantidad) === 1 ? '' : 's'}.`
    : `No hay pagos recibidos ${p!.etiqueta}.`),

  'mejores-clientes': (r, p) => {
    const c = (r.clientes as Fila[]) ?? [];
    if (!c.length) return `No hay ventas a clientes ${p!.etiqueta}.`;
    return [`Tus mejores clientes ${p!.etiqueta}:`, '', tabla(['Cliente', 'Ventas', 'Facturas'], c.slice(0, 8).map((x) => [String(x.cliente), rd(n(x.ventas)), n(x.facturas)]))].join('\n');
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
  opts: { tolerante?: boolean; hoy?: string; previa?: string; /** La pregunta anterior de la persona, para «¿y el mes pasado?». */ preguntaPrevia?: string } = {},
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

  const periodo = interpretarPeriodo(t, opts.hoy);
  if (it.usaPeriodo && !periodo) return null;

  const input: Record<string, unknown> =
    it.id === 'cliente-mas-facturas' ? { limite: 8 }
      : it.id === 'recurrentes' ? { estado: /\b(pausad|finalizad)/.test(t) ? undefined : 'activa', limite: 12 }
      : it.id === 'ultima-factura' ? { limite: 5 }
      : it.id === 'ultima-compra' ? { limite: 5, desde: '2000-01-01', hasta: '2100-12-31' }
      : it.id === 'borradores' ? { estado: 'BORRADOR', limite: 8 }
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
            : it.id === 'por-revisar' ? { limite: 8 }
              : {};
  if (it.usaPeriodo && periodo && it.id !== 'cliente-mas-facturas') Object.assign(input, { desde: periodo.desde, hasta: periodo.hasta, limite: 8 });
  // «Qué cliente tiene más facturas»: salvo que diga un período, es todo el historial.
  if (it.id === 'cliente-mas-facturas' && periodo && /\b(este mes|hoy|ayer|semana|mes pasado|ano|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ultimos)\b/.test(t)) {
    Object.assign(input, { desde: periodo.desde, hasta: periodo.hasta });
  }

  const r = await ejecutar(tools, it.herramienta, input);
  if (!r) return null;
  return { intencion: it.id, respuesta: PLANTILLAS[it.id](r, periodo, input) };
}
