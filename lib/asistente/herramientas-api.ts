import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import type { ClienteApi } from './api';
import { ErrorApi } from './api';
import type { ConsultaHecha } from './herramientas';
import {
  enlaceFactura, enlaceCliente, enlaceCotizacion, enlaceCompraLocal, enlaceProducto, enlaceRecurrente, enlaceEstudiante,
} from './enlaces';
import { leerMensajesDgii } from './dgii';
import { leerEstadoConfiguracion } from './estado-configuracion';
import { pesos, fechaYmd, ymd, normalizar, quitarTildes, hoyRd } from './util';

/**
 * Consultas del asistente que pasan por la API de la app.
 *
 * Cada herramienta llama a la misma ruta que usa la pantalla correspondiente
 * (con la sesión de la persona), así que ve lo mismo que ella: mismos filtros,
 * mismo orden, mismos permisos. El asistente no consulta la base de datos para
 * buscar. Y como cada fila trae su `id` de la API, el `enlace` sale de ese id
 * y no de un número que el modelo vea en pantalla.
 *
 * Los montos de la API vienen en centavos; aquí salen en pesos.
 *
 * Lo que la API no filtra (estado de pago, mes, nombre) se filtra después,
 * sobre lo que la propia API devolvió; cuando la API tiene más filas que las
 * que trae, el resultado lo dice (`parcial`) en vez de aparentar ser completo.
 */

type Anotar = (nombre: string, resumen: string) => void;
const MAX = 25;
const fecha = fechaYmd;

const sin = (t: unknown) => normalizar(String(t ?? ''));
const contiene = (t: unknown, q: string) => sin(t).includes(normalizar(q));

/** Una herramienta que falla por la API no tumba la respuesta: dice qué pasó. */
function seguro<I, O>(nombre: string, fn: (i: I) => Promise<O>) {
  return async (i: I): Promise<O | { error: string }> => {
    try {
      return await fn(i);
    } catch (e) {
      if (e instanceof ErrorApi) {
        if (e.status === 401 || e.status === 403) return { error: `Tu rol no tiene acceso a ${nombre}.` };
        return { error: `No pude consultar ${nombre} ahora (${e.status}). Díselo a la persona y que reintente.` };
      }
      return { error: `No pude consultar ${nombre} ahora. Díselo a la persona y que reintente.` };
    }
  };
}

export function crearHerramientasApi(api: ClienteApi, consultas: ConsultaHecha[]) {
  const anotar: Anotar = (nombre, resumen) => consultas.push({ nombre, resumen });
  const rango = (desde?: string, hasta?: string) => {
    const hoy = new Date();
    const d = desde ?? ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1))!;
    const h = hasta ?? ymd(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))!;
    return { desde: d, hasta: h, texto: `${d} al ${h}` };
  };

  return {
    // ── Facturas ──────────────────────────────────────────────────────────
    ver_factura: tool({
      description:
        'El detalle de UNA factura por su id (el de la pantalla que la persona está viendo, o el «enlace» de una búsqueda): ' +
        'número, cliente, estado ante la DGII, estado de pago, total, pagado, saldo pendiente, vencimiento, pagos y líneas. ' +
        'Úsala para «¿está pagada esta factura?», «¿cuánto debe?», «¿de quién es?».',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: seguro('la factura', async ({ id }) => {
        const d = await api.get<FacturaDetalleApi>('/api/facturas/' + id);
        const total = Number(d.montos?.montoTotal ?? 0);
        const pagado = Number(d.pago?.valorCts ?? 0);
        const nc = Number(d.montos?.ncAplicado ?? 0);
        const pendiente = Math.max(0, total - pagado - nc);
        anotar('Detalle de factura', d.encf ?? d.codigo ?? ('id ' + id));
        return {
          enlace: enlaceFactura(d.id),
          numero: d.encf?.trim() || d.codigo?.trim() || ('Borrador del ' + (ymd(d.fechaEmision) ?? '')),
          tipo: d.tipoNombre ?? d.tipoEcf,
          estado: d.estado,
          estadoPago: pendiente === 0 && total > 0 ? 'PAGADA' : pagado > 0 || nc > 0 ? 'PARCIAL' : 'PENDIENTE',
          cliente: d.comprador?.razonSocial ?? null,
          rnc: d.comprador?.rnc ?? null,
          // En un colegio la factura es del responsable, pero la pantalla la muestra por el estudiante.
          dependiente: d.dependienteNombre ?? null,
          codigoInterno: d.codigo ?? null,
          fecha: ymd(d.fechaEmision),
          vence: ymd(d.fechaLimitePago),
          total: pesos(total),
          itbis: pesos(d.montos?.totalItbis),
          pagado: pesos(pagado),
          notasDeCredito: pesos(nc),
          pendiente: pesos(pendiente),
          // Lo que respondió la DGII (para explicar un rechazo o un «en proceso»).
          mensajesDgii: leerMensajesDgii(d.mensajesDgii),
          trackId: d.trackId ?? null,
          pagos: (d.pago?.lineas ?? []).slice(0, 8).map((p) => ({ fecha: ymd(p.fechaPago), metodo: p.metodo, monto: Number(p.valor) })),
          lineas: (d.lineas ?? []).slice(0, 8).map((l) => ({
            nombre: String(l.nombreItem ?? ''), cantidad: Number(l.cantidadItem ?? 0), precio: Number(l.precioUnitarioItem ?? 0),
          })),
        };
      }),
    }),

    estado_configuracion: tool({
      description:
        'Qué tiene ya configurada la empresa para facturar: certificado digital, secuencias de NCF, clientes, productos y si ya emitió facturas. ' +
        'Solo conteos. Úsala para «¿qué me falta para emitir mi primera factura?».',
      inputSchema: z.object({}),
      execute: seguro('la configuración', async () => {
        const estado = await leerEstadoConfiguracion(api);
        anotar('Configuración de la empresa', 'certificado, secuencias, clientes, productos');
        return estado;
      }),
    }),

    ver_cliente: tool({
      description:
        'El detalle de UN cliente por su id (el de la pantalla que la persona está viendo): contacto, cuánto debe, cuántas facturas ' +
        'tiene y las últimas. Úsala para «¿cuánto me debe este cliente?», «¿cuál es su teléfono?».',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: seguro('el cliente', async ({ id }) => {
        const d = await api.get<{ cliente: ClienteDetalleApi; facturas?: FacturaResumenApi[] }>('/api/clientes/' + id);
        const c = d.cliente;
        const nombre = (c.razonSocial ?? '').trim();
        // La deuda sale de las cuentas por cobrar (las mismas de la pantalla), por nombre.
        let debe = 0; let pendientes = 0; let diasMax = 0;
        try {
          const cx = await api.get<CxcApi>('/api/cuentas-por-cobrar', { limit: 2000 });
          for (const x of cx.cuentas ?? []) {
            const quien = (x.razonSocialComprador ?? x.clienteRazonSocial ?? '').trim();
            if (nombre && quien.toLowerCase() === nombre.toLowerCase()) {
              debe += Number(x.saldo || 0); pendientes += 1; diasMax = Math.max(diasMax, Number(x.diasVencido || 0));
            }
          }
        } catch { /* sin permiso a cuentas por cobrar: no se muestra la deuda */ }
        const facturas = d.facturas ?? [];
        anotar('Detalle de cliente', nombre || ('id ' + id));
        return {
          enlace: enlaceCliente(c.id ?? id),
          nombre, rnc: c.rnc ?? null, email: c.email ?? null, telefono: c.telefono ?? c.celular ?? c.whatsapp ?? null,
          direccion: c.direccion ?? null,
          debe: pesos(debe), facturasPendientes: pendientes, diasVencidoMaximo: diasMax,
          facturasRecientes: facturas.length,
          totalRecientes: pesos(facturas.reduce((s, f) => s + Number(f.montoTotal || 0), 0)),
          ultimas: facturas.slice(0, 5).map((f) => ({
            enlace: enlaceFactura(f.id), numero: f.encf || '', fecha: ymd(f.fechaEmision), estado: f.estado, total: pesos(f.montoTotal),
          })),
        };
      }),
    }),

    ver_cotizacion: tool({
      description: 'El detalle de UNA cotización por su id (la que la persona está viendo): cliente, estado, total y vencimiento.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: seguro('la cotización', async ({ id }) => {
        const d = await api.get<{ cotizacion: CotizacionApi }>('/api/cotizaciones/' + id);
        const c = d.cotizacion;
        const vence = ymd(c.fechaVencimiento);
        const hoy = ymd(new Date());
        anotar('Detalle de cotización', c.numero);
        return {
          enlace: enlaceCotizacion(c.id), numero: c.numero, estado: c.estado, cliente: c.razonSocialComprador ?? null,
          total: pesos(c.montoTotal), emision: ymd(c.fechaEmision), vence,
          vencida: Boolean(vence && hoy && vence < hoy && !['aceptada', 'convertida', 'rechazada'].includes(sin(c.estado))),
        };
      }),
    }),

    ver_producto: tool({
      description: 'El detalle de UN producto por su id (el que la persona está viendo): precio, ITBIS, existencia y mínimo.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: seguro('el producto', async ({ id }) => {
        const d = await api.get<{ producto: ProductoDetalleApi }>('/api/productos/' + id);
        const p = d.producto;
        anotar('Detalle de producto', p.nombre);
        return {
          enlace: enlaceProducto(p.id), nombre: p.nombre, referencia: p.referencia ?? null, tipo: p.tipo,
          precio: pesos(p.precio), costo: pesos(p.costo),
          itbis: p.tasaItbis === 'exento' ? 'Exento' : `${Math.round(Number(p.tasaItbis) * 100)}%`,
          controlaInventario: Boolean(p.controlaInventario), stock: Number(p.stockActual ?? 0), stockMinimo: Number(p.stockMinimo ?? 0),
          unidad: p.unidadMedida ?? null,
        };
      }),
    }),

    buscar_facturas: tool({
      description:
        'Busca facturas de venta por la MISMA API que la pantalla de Facturas: por texto (número o e-NCF, nombre del cliente), estado o fechas. ' +
        'No incluye notas de crédito ni de débito (tienen su propia pantalla). ' +
        'Estados: BORRADOR (sin emitir), ACEPTADO, EN_PROCESO, RECHAZADO, ANULADO, HISTORICA. Estado de pago: PENDIENTE, PARCIAL, PAGADA. ' +
        'Orden: la más reciente primero. Cada factura trae su «enlace»: es el único enlace válido, NUNCA armes uno con el número de la factura.',
      inputSchema: z.object({
        q: z.string().max(80).optional().describe('Número de factura / e-NCF o nombre del cliente'),
        estado: z.enum(['BORRADOR', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO', 'RECHAZADO', 'ANULADO', 'HISTORICA']).optional(),
        estadoPago: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADA']).optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('las facturas', async ({ q, estado, estadoPago, desde, hasta, limite }) => {
        // La búsqueda de la API distingue tildes: «Méndez» no encuentra «Mendez».
        // Se prueba como se escribió y sin tildes, y se unen sin repetir.
        const textos = [...new Set([q?.trim(), q ? quitarTildes(q).trim() : undefined].filter((x): x is string => !!x))];
        // La API entrega 200 como máximo por llamada: se pide página por página
        // (hasta 2000 filas) para que la cuenta y la suma sean de TODO lo que
        // coincide, no solo de las 200 más recientes.
        const pedir = async (search: string | undefined) => {
          const primera = await api.get<{ docs: FacturaApi[]; total: number }>('/api/facturas', { search, estado, desde, hasta, limit: 200, offset: 0 });
          const total = Number(primera.total ?? 0);
          const offsets: number[] = [];
          for (let o = 200; o < Math.min(total, 2000); o += 200) offsets.push(o);
          const resto = await Promise.all(offsets.map((offset) =>
            api.get<{ docs: FacturaApi[] }>('/api/facturas', { search, estado, desde, hasta, limit: 200, offset })));
          return { docs: [...(primera.docs ?? []), ...resto.flatMap((x) => x.docs ?? [])], total };
        };
        const respuestas = await Promise.all((textos.length ? textos : [undefined]).map(pedir));
        const unidas = new Map<number, FacturaApi>();
        for (const x of respuestas) for (const d of x.docs ?? []) unidas.set(d.id, d);
        const r = {
          docs: [...unidas.values()].sort((a, b) =>
            String(b.createdAt ?? b.fechaEmision ?? '').localeCompare(String(a.createdAt ?? a.fechaEmision ?? '')) || b.id - a.id),
          total: respuestas.length > 1 ? unidas.size : respuestas[0]?.total ?? 0,
        };
        const traidas = r.docs;
        let docs = traidas;
        if (estadoPago) docs = docs.filter((d) => estadoDePago(d) === estadoPago);
        anotar('Búsqueda de facturas', [estado, estadoPago, q, desde && `desde ${desde}`].filter(Boolean).join(' · ') || 'todas');
        return {
          coinciden: estadoPago ? docs.length : Number(r.total ?? docs.length),
          sumaTotal: pesos(docs.reduce((s, d) => s + Number(d.montoTotal || 0), 0)),
          // Solo si hay más de 2000 coincidencias: la suma cubre las 2000 más recientes.
          parcial: Number(r.total ?? 0) > traidas.length,
          filasEvaluadas: traidas.length,
          mostrando: Math.min(limite, docs.length),
          enlaceLista: '/dashboard/facturas',
          facturas: docs.slice(0, limite).map((d) => ({
            enlace: enlaceFactura(d.id),
            // Lo que identifica la factura aunque el PDF pierda el enlace: e-NCF, código
            // interno o, si es un borrador sin número, «Borrador» y su fecha.
            numero: numeroDe(d),
            tipo: d.tipoEcf,
            estado: d.estado,
            estadoPago: estadoDePago(d),
            cliente: d.razonSocialComprador ?? null,
            rnc: d.rncComprador ?? null,
            total: pesos(d.montoTotal),
            pagado: pesos(d.pagado),
            porCobrar: pesos(Math.max(0, Number(d.montoTotal || 0) - Number(d.pagado || 0)) + Number(d.moraPendiente || 0)),
            fecha: ymd(d.fechaEmision ?? d.createdAt),
            vence: d.fechaLimitePago ?? null,
            alumno: d.dependienteNombre ?? null,
          })),
        };
      }),
    }),

    cuentas_por_cobrar: tool({
      description:
        'Cartera pendiente de HOY, por la API de Cuentas por cobrar: total, antigüedad por cubetas y los clientes que más deben. ' +
        'Úsala para «quién me debe», «cuánto tengo vencido», «cartera», «morosos». ' +
        'Los RECARGOS POR MORA (notas de débito por pagar tarde) van aparte en `recargosMora`: lo vencido NO es mora.',
      inputSchema: z.object({
        soloVencidas: z.boolean().default(false).describe('Solo lo que ya pasó su fecha límite'),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('las cuentas por cobrar', async ({ soloVencidas, limite }) => {
        const r = await api.get<CxcApi>('/api/cuentas-por-cobrar', { soloVencidas: soloVencidas || undefined, limit: 2000 });
        anotar('Cuentas por cobrar', soloVencidas ? 'solo vencidas' : 'toda la cartera');
        const porCliente = new Map<string, { saldo: number; mora: number; facturas: number; diasMax: number; enlace: string }>();
        let mora = 0;
        for (const c of r.cuentas ?? []) {
          const cliente = c.razonSocialComprador?.trim() || c.clienteRazonSocial?.trim() || 'Consumidor Final';
          const x = porCliente.get(cliente) ?? { saldo: 0, mora: 0, facturas: 0, diasMax: 0, enlace: enlaceFactura(c.id) };
          x.saldo += Number(c.saldo || 0);
          x.mora += Number(c.moraSaldo || 0);
          mora += Number(c.moraSaldo || 0);
          x.facturas += 1;
          x.diasMax = Math.max(x.diasMax, Number(c.diasVencido || 0));
          porCliente.set(cliente, x);
        }
        const a = r.antiguedad ?? {};
        const g = (k: string) => pesos(a[k]?.saldo);
        return {
          totalPorCobrar: pesos(r.totales?.pendiente),
          // El recargo por pagar tarde, ya incluido en lo que debe cada cliente. El chat lo confundía con lo vencido.
          recargosMora: pesos(mora),
          porVencer: g('porVencer'),
          vencido0a30: g('d1a30'),
          vencido31a60: g('d31a60'),
          vencido61a90: g('d61a90'),
          vencidoMasDe90: g('d90mas'),
          clientesConDeuda: porCliente.size,
          enlaceLista: '/dashboard/cuentas-por-cobrar',
          mayoresDeudores: [...porCliente.entries()]
            .sort((x, y) => y[1].saldo - x[1].saldo)
            .slice(0, limite)
            .map(([cliente, c]) => ({ cliente, debe: pesos(c.saldo), deEsoMora: pesos(c.mora), facturas: c.facturas, diasVencidoMaximo: c.diasMax })),
        };
      }),
    }),

    pagos_recibidos: tool({
      description: 'Pagos y cobros recibidos en un período, por la API de Pagos: fecha, monto, método y factura. Para «qué se cobró hoy/esta semana».',
      inputSchema: z.object({ desde: fecha.optional(), hasta: fecha.optional(), limite: z.number().int().min(1).max(MAX).default(15) }),
      execute: seguro('los pagos', async ({ desde, hasta, limite }) => {
        const p = rango(desde, hasta);
        const r = await api.get<{ pagos: PagoApi[]; totales?: { monto: number; count: number } }>('/api/pagos/listado', { desde: p.desde, hasta: p.hasta });
        anotar('Pagos recibidos', p.texto);
        const pagos = r.pagos ?? [];
        return {
          periodo: p.texto,
          cantidad: Number(r.totales?.count ?? pagos.length),
          totalCobrado: pesos(r.totales?.monto ?? pagos.reduce((s, x) => s + Number(x.montoCentavos || 0), 0)),
          mostrando: Math.min(limite, pagos.length),
          pagos: pagos.slice(0, limite).map((x) => ({
            enlace: x.docId ? enlaceFactura(x.docId) : undefined,
            fecha: x.fechaPago, monto: pesos(x.montoCentavos), metodo: x.metodo, referencia: x.referencia ?? null,
            cliente: x.cliente ?? null, factura: x.docEncf ?? x.docCodigo ?? null,
          })),
        };
      }),
    }),

    buscar_clientes: tool({
      description: 'Busca clientes (o familias) por nombre, RNC, correo o nombre de un dependiente, por la API de Clientes, y devuelve sus datos de contacto.',
      inputSchema: z.object({ q: z.string().min(2).max(80), limite: z.number().int().min(1).max(MAX).default(8) }),
      execute: seguro('los clientes', async ({ q, limite }) => {
        const r = await api.get<{ clientes: ClienteRegApi[] }>('/api/clientes', { q: q.trim(), limit: 200 });
        anotar('Búsqueda de clientes', q);
        const c = r.clientes ?? [];
        return {
          encontrados: c.length,
          enlaceLista: '/dashboard/clientes',
          clientes: c.slice(0, limite).map((x) => ({
            nombre: x.razonSocial, rnc: x.rnc ?? null, email: x.email ?? null,
            telefono: x.telefono ?? x.celular ?? x.whatsapp ?? null, direccion: x.direccion ?? null,
            dependientes: x.dependientes ?? [],
          })),
        };
      }),
    }),

    // ── Compras y gastos ──────────────────────────────────────────────────
    facturas_por_revisar: tool({
      description:
        'Facturas de proveedor y comprobantes de gasto que llegaron por foto, enlace o PDF y TODAVÍA NO se han registrado ' +
        '(la bandeja «Facturas por revisar» de Gastos). Úsala para «qué facturas tengo por revisar», «qué gastos faltan registrar».',
      inputSchema: z.object({ limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: seguro('las facturas por revisar', async ({ limite }) => {
        const r = await api.get<{ capturas: CapturaApi[] }>('/api/gastos/capturas', { estado: 'pendientes' });
        const c = r.capturas ?? [];
        anotar('Facturas por revisar', `${c.length} pendientes`);
        return {
          totalPorRevisar: c.length,
          // Pantalla donde se revisan: usa este enlace tal cual, no armes otro.
          enlace: '/dashboard/gastos',
          facturas: c.slice(0, limite).map((x) => ({
            estado: x.estado === 'procesando' ? 'leyéndose' : 'por revisar',
            proveedor: x.datos?.proveedorNombre ?? null,
            rnc: x.datos?.proveedorRnc ?? null,
            ncf: x.datos?.ncf ?? null,
            fecha: x.datos?.fecha ?? null,
            total: x.datos?.totalCents != null ? pesos(x.datos.totalCents) : null,
            categoria: x.datos?.categoria ?? null,
            avisos: x.datos?.avisos ?? [],
            subidoPor: x.subidoPor ?? null,
            nota: x.nota ?? null,
            recibida: ymd(x.creadoEn),
          })),
        };
      }),
    }),

    listar_gastos_compras: tool({
      description:
        'Gastos y compras a proveedores YA REGISTRADOS, por la API de Compras: fecha, proveedor, monto, NCF y si están pagados. ' +
        'Para la «última factura recibida de un proveedor» usa esta. Cada registro trae su «enlace».',
      inputSchema: z.object({
        desde: fecha.optional(), hasta: fecha.optional(),
        clase: z.enum(['gasto', 'compra']).optional(),
        limite: z.number().int().min(1).max(MAX).default(15),
      }),
      execute: seguro('las compras y gastos', async ({ desde, hasta, clase, limite }) => {
        const p = rango(desde, hasta);
        const r = await api.get<{ compras: CompraApi[] }>('/api/compras/local', { clase, desde: p.desde, hasta: p.hasta });
        anotar('Gastos y compras', p.texto);
        const c = (r.compras ?? []).filter((x) => x.estado !== 'anulada');
        return {
          periodo: p.texto,
          mostrando: Math.min(limite, c.length),
          coinciden: c.length,
          enlaceLista: '/dashboard/compras',
          registros: c.slice(0, limite).map((x) => ({
            enlace: enlaceCompraLocal(x.id),
            fecha: x.fecha, clase: x.clase, estado: x.estado, proveedor: x.proveedorNombre ?? null, ncf: x.ncf ?? null,
            total: pesos(x.montoTotal), estadoPago: x.estadoPago ?? null, categoria: x.categoriaLabel ?? x.categoria ?? null,
            pagado: pesos(x.pagadoCents),
          })),
        };
      }),
    }),

    resumen_gastos: tool({
      description: 'Cuánto se gastó en un período, por la API de Compras: total, por pagar a proveedores, ITBIS por adelantar, retenciones y gasto por categoría.',
      inputSchema: z.object({ desde: fecha.optional(), hasta: fecha.optional() }),
      execute: seguro('los gastos', async ({ desde, hasta }) => {
        const p = rango(desde, hasta);
        const r = await api.get<{ compras: CompraApi[] }>('/api/compras/local', { clase: 'gasto', desde: p.desde, hasta: p.hasta });
        anotar('Resumen de gastos', p.texto);
        const todas = r.compras ?? [];
        const vivas = todas.filter((x) => x.estado === 'registrada');
        const cat = new Map<string, number>();
        for (const x of vivas) {
          const k = x.categoriaLabel ?? x.categoria ?? 'Sin categoría';
          cat.set(k, (cat.get(k) ?? 0) + Number(x.montoTotal || 0));
        }
        return {
          periodo: p.texto,
          gastos: vivas.length,
          totalGastado: pesos(vivas.reduce((s, x) => s + Number(x.montoTotal || 0), 0)),
          porPagarAProveedores: pesos(vivas.reduce((s, x) => s + Number(x.saldoCents || 0), 0)),
          itbisPorAdelantar: pesos(vivas.reduce((s, x) => s + Number(x.itbisAdelantarCents || 0), 0)),
          retenciones: pesos(vivas.reduce((s, x) => s + Number(x.retencionesCents || 0), 0)),
          borradores: todas.filter((x) => x.estado === 'borrador').length,
          porCategoria: [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX).map(([categoria, c]) => ({ categoria, total: pesos(c) })),
        };
      }),
    }),

    // ── Catálogo y documentos ─────────────────────────────────────────────
    buscar_productos: tool({
      description:
        'Productos y servicios, por la API de Productos: precio, existencia y mínimo. Con soloBajoMinimo=true lista lo agotado o por agotarse ' +
        '(solo los que controlan inventario). Úsala para «cuánto cuesta X», «qué me queda de X», «qué se está acabando».',
      inputSchema: z.object({
        q: z.string().max(80).optional().describe('Nombre o referencia'),
        soloBajoMinimo: z.boolean().default(false),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('los productos', async ({ q, soloBajoMinimo, limite }) => {
        const r = await api.get<{ productos: ProductoApi[] }>('/api/productos', { q: q?.trim(), limit: 1000 });
        let p = (r.productos ?? []).filter((x) => x.activo !== 'false');
        if (soloBajoMinimo) {
          p = p.filter((x) => x.controlaInventario && (Number(x.stockActual) <= 0 || (Number(x.stockMinimo) > 0 && Number(x.stockActual) <= Number(x.stockMinimo))));
        }
        anotar('Productos', soloBajoMinimo ? 'bajo el mínimo' : q ?? 'catálogo');
        return {
          coinciden: p.length,
          mostrando: Math.min(limite, p.length),
          enlaceLista: '/dashboard/productos',
          productos: p.slice(0, limite).map((x) => ({
            enlace: enlaceProducto(x.id),
            nombre: x.nombre, referencia: x.referencia ?? null, tipo: x.tipo,
            precio: x.precioDOP ?? pesos(x.precio), costo: x.costoDOP ?? pesos(x.costo),
            existencia: x.controlaInventario ? x.stockActual : null, minimo: x.controlaInventario ? x.stockMinimo : null,
          })),
        };
      }),
    }),

    listar_cotizaciones: tool({
      description: 'Cotizaciones, por la API de Cotizaciones: número, cliente, total, estado y vencimiento. Cada una trae su «enlace».',
      inputSchema: z.object({
        estado: z.string().max(20).optional().describe('borrador, enviada, aceptada, rechazada, vencida…'),
        q: z.string().max(80).optional().describe('Cliente o número'),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('las cotizaciones', async ({ estado, q, limite }) => {
        const r = await api.get<{ cotizaciones: CotizacionApi[] }>('/api/cotizaciones', { q: q?.trim() });
        let c = r.cotizaciones ?? [];
        if (estado) c = c.filter((x) => sin(x.estado) === sin(estado));
        anotar('Cotizaciones', estado ?? q ?? 'todas');
        return {
          coinciden: c.length,
          sumaTotal: pesos(c.reduce((s, x) => s + Number(x.montoTotal || 0), 0)),
          enlaceLista: '/dashboard/cotizaciones',
          cotizaciones: c.slice(0, limite).map((x) => ({
            enlace: enlaceCotizacion(x.id), numero: x.numero, estado: x.estado, cliente: x.razonSocialComprador ?? null,
            total: pesos(x.montoTotal), emision: ymd(x.fechaEmision), vence: ymd(x.fechaVencimiento),
          })),
        };
      }),
    }),

    facturas_recurrentes: tool({
      description: 'Facturas recurrentes (cobros automáticos), por la API: cliente, frecuencia, próxima emisión, estado y total estimado.',
      inputSchema: z.object({ estado: z.enum(['activa', 'pausada', 'finalizada']).optional(), limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: seguro('las facturas recurrentes', async ({ estado, limite }) => {
        const r = await api.get<{ facturasRecurrentes: RecurrenteApi[] }>('/api/facturas-recurrentes', { limit: 200 });
        let c = r.facturasRecurrentes ?? [];
        if (estado) c = c.filter((x) => x.estado === estado);
        anotar('Facturas recurrentes', estado ?? 'todas');
        // Agrupado aquí, no por el modelo: así cada recurrente conserva SU enlace.
        const por = new Map<string, RecurrenteApi[]>();
        for (const x of c) {
          const k = x.clienteRazonSocial?.trim() || 'Sin cliente';
          por.set(k, [...(por.get(k) ?? []), x]);
        }
        return {
          coinciden: c.length,
          totalEstimadoPorCiclo: pesos(c.reduce((s, x) => s + Number(x.totalEstimado || 0), 0)),
          enlaceLista: '/dashboard/facturas-recurrentes',
          porCliente: [...por.entries()]
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
            .slice(0, limite)
            .map(([cliente, lista]) => ({
              cliente,
              cantidad: lista.length,
              totalEstimado: pesos(lista.reduce((s, x) => s + Number(x.totalEstimado || 0), 0)),
              proximaEmision: lista.map((x) => x.proximaEmision).sort()[0] ?? null,
              recurrentes: lista.map((x) => ({
                enlace: enlaceRecurrente(x.id), nombre: x.nombre, frecuencia: x.frecuencia,
                totalEstimado: pesos(x.totalEstimado), proximaEmision: x.proximaEmision,
              })),
            })),
          recurrentes: c.slice(0, limite).map((x) => ({
            enlace: enlaceRecurrente(x.id), nombre: x.nombre, cliente: x.clienteRazonSocial ?? null, frecuencia: x.frecuencia,
            proximaEmision: x.proximaEmision, estado: x.estado, totalEstimado: pesos(x.totalEstimado), facturasEmitidas: x.facturasEmitidas,
          })),
        };
      }),
    }),

    clientes_con_mas_facturas: tool({
      description:
        'Qué clientes tienen MÁS FACTURAS emitidas (conteo de facturas de venta, no montos), por la API de Facturas. ' +
        'Úsala para «qué cliente tiene más facturas», «quién se repite más». NO son las facturas recurrentes (para eso, facturas_recurrentes). ' +
        'Excluye anuladas; separa emitidas de borradores. Cada cliente trae los enlaces de sus facturas más recientes.',
      inputSchema: z.object({
        desde: fecha.optional(), hasta: fecha.optional(),
        incluirBorradores: z.boolean().default(true).describe('Si false, cuenta solo las emitidas a la DGII'),
        limite: z.number().int().min(1).max(MAX).default(8),
      }),
      execute: seguro('las facturas', async ({ desde, hasta, incluirBorradores, limite }) => {
        const primera = await api.get<{ docs: FacturaApi[]; total: number }>('/api/facturas', { desde, hasta, limit: 200, offset: 0 });
        const total = Number(primera.total ?? 0);
        const offsets: number[] = [];
        for (let o = 200; o < Math.min(total, 2000); o += 200) offsets.push(o);
        const resto = await Promise.all(offsets.map((offset) =>
          api.get<{ docs: FacturaApi[] }>('/api/facturas', { desde, hasta, limit: 200, offset })));
        const docs = [...(primera.docs ?? []), ...resto.flatMap((x) => x.docs ?? [])]
          .filter((d) => d.estado !== 'ANULADO' && (incluirBorradores || d.estado !== 'BORRADOR'));

        const por = new Map<string, { emitidas: number; borradores: number; total: number; facturas: FacturaApi[] }>();
        for (const d of docs) {
          const k = d.razonSocialComprador?.trim() || 'Consumidor final / sin nombre';
          const x = por.get(k) ?? { emitidas: 0, borradores: 0, total: 0, facturas: [] };
          if (d.estado === 'BORRADOR') x.borradores++; else x.emitidas++;
          x.total += Number(d.montoTotal || 0);
          x.facturas.push(d);
          por.set(k, x);
        }
        anotar('Clientes con más facturas', desde || hasta ? `${desde ?? ''} ${hasta ?? ''}`.trim() : 'todas');
        return {
          facturasContadas: docs.length,
          // Más de 2000 coincidencias: el conteo cubre las 2000 más recientes.
          parcial: total > 2000,
          incluyeBorradores: incluirBorradores,
          enlaceLista: '/dashboard/facturas',
          clientes: [...por.entries()]
            .sort((a, b) => (b[1].emitidas + b[1].borradores) - (a[1].emitidas + a[1].borradores) || b[1].total - a[1].total)
            .slice(0, limite)
            .map(([cliente, x]) => ({
              cliente,
              facturas: x.emitidas + x.borradores,
              emitidas: x.emitidas,
              borradores: x.borradores,
              total: pesos(x.total),
              ultimas: x.facturas.slice(0, 3).map((d) => ({
                enlace: enlaceFactura(d.id), numero: numeroDe(d), fecha: ymd(d.fechaEmision ?? d.createdAt),
                estado: d.estado, total: pesos(d.montoTotal),
              })),
            })),
        };
      }),
    }),

    // ── Contabilidad ──────────────────────────────────────────────────────
    libro_diario: tool({
      description:
        'Asientos del libro diario en un período, por la API de Contabilidad: fecha, concepto, origen y total. ' +
        'Con conLineas=true se ve el debe y haber de cada asiento (máx. 5).',
      inputSchema: z.object({
        desde: fecha.optional(), hasta: fecha.optional(),
        q: z.string().max(80).optional().describe('Texto del concepto'),
        origen: z.string().max(20).optional().describe('factura, pago, manual, compra, nomina…'),
        conLineas: z.boolean().default(false),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('el libro diario', async ({ desde, hasta, q, origen, conLineas, limite }) => {
        const r = await api.get<{ asientos: AsientoApi[]; total: number }>('/api/contabilidad/libro-diario', {
          desde, hasta, origenTipo: origen, limit: q ? 200 : limite, offset: 0,
        });
        let a = r.asientos ?? [];
        if (q?.trim()) a = a.filter((x) => contiene(x.concepto, q));
        a = a.slice(0, limite);
        const lineas: Record<number, { cuenta: string; debe: number; haber: number }[]> = {};
        if (conLineas) {
          for (const x of a.slice(0, 5)) {
            const d = await api.get<{ apuntes?: { cuentaCodigo: string; cuentaNombre: string; debeCents: number; haberCents: number }[] }>(
              `/api/contabilidad/libro-diario/${x.id}`,
            ).catch(() => null);
            lineas[x.id] = (d?.apuntes ?? []).map((l) => ({ cuenta: `${l.cuentaCodigo} ${l.cuentaNombre}`, debe: pesos(l.debeCents), haber: pesos(l.haberCents) }));
          }
        }
        anotar('Libro diario', [desde, hasta, origen, q].filter(Boolean).join(' · ') || 'recientes');
        return {
          coinciden: q ? a.length : Number(r.total ?? a.length),
          enlaceLista: '/contabilidad/libro-diario',
          asientos: a.map((x) => ({
            fecha: x.fecha, concepto: x.concepto, origen: x.origenTipo, total: pesos(x.totalCents),
            ...(lineas[x.id] ? { lineas: lineas[x.id] } : {}),
          })),
        };
      }),
    }),

    catalogo_cuentas: tool({
      description: 'Busca cuentas del catálogo contable por nombre o código, por la API de Contabilidad.',
      inputSchema: z.object({ q: z.string().min(1).max(60), limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: seguro('el catálogo de cuentas', async ({ q, limite }) => {
        const r = await api.get<{ cuentas: CuentaApi[] }>('/api/contabilidad/cuentas', { plano: true });
        const c = (r.cuentas ?? []).filter((x) => contiene(x.nombre, q) || contiene(x.codigo, q));
        anotar('Catálogo de cuentas', q);
        return {
          encontradas: c.length,
          cuentas: c.slice(0, limite).map((x) => ({ codigo: x.codigo, nombre: x.nombre, tipo: x.tipo, naturaleza: x.naturaleza, imputable: x.imputable, activa: x.activa })),
        };
      }),
    }),

    // ── Escolar ───────────────────────────────────────────────────────────
    buscar_estudiantes: tool({
      description: 'Busca estudiantes por nombre, apellido, código o tutor, por la API de Estudiantes: estado, curso actual y deuda.',
      inputSchema: z.object({ q: z.string().min(2).max(60), limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: seguro('los estudiantes', async ({ q, limite }) => {
        const r = await api.get<{ estudiantes: EstudianteApi[]; total?: number }>('/api/administracion-escolar/estudiantes', {
          q: q.trim(), estado: 'todos', limit: 50, offset: 0,
        });
        const e = r.estudiantes ?? [];
        anotar('Estudiantes', q);
        return {
          encontrados: Number(r.total ?? e.length),
          enlaceLista: '/escolar/estudiantes',
          estudiantes: e.slice(0, limite).map((x) => ({
            enlace: x.origen === 'dependiente' || !x.matriculaActivaId && !x.codigo ? undefined : enlaceEstudiante(x.id),
            nombre: `${x.nombres} ${x.apellidos}`.trim(), codigo: x.codigo ?? null, estado: x.estado,
            curso: x.cursoActual ?? null, periodo: x.periodoActivo ?? null,
            tutor: x.tutorResponsable ?? null,
            deuda: x.deudaCentavos != null ? pesos(x.deudaCentavos) : null,
          })),
        };
      }),
    }),

    resumen_matriculas: tool({
      description: 'Cuántos estudiantes hay matriculados por curso (matrículas activas), por la API de Matriculación, y el total.',
      inputSchema: z.object({ periodo: z.string().max(60).optional().describe('Nombre del período, ej. 2026-2027. Si falta, todos los activos.') }),
      execute: seguro('las matrículas', async ({ periodo }) => {
        const filas: { periodo: string; curso: string }[] = [];
        for (let pagina = 1; pagina <= 10; pagina++) {
          const r = await api.get<{ matriculas: { periodo: string; curso: string; grado?: string | null; estado: string }[]; paginas?: number }>(
            '/api/administracion-escolar/matriculas', { estado: 'activa', pagina, porPagina: 200 },
          );
          // El curso con su grado: «A» solo junta las secciones A de todos los grados.
          for (const m of r.matriculas ?? []) {
            if (m.estado === 'activa') filas.push({ periodo: m.periodo, curso: m.grado ? `${m.grado} — ${m.curso}` : m.curso });
          }
          if (!r.paginas || pagina >= r.paginas) break;
        }
        const f = periodo?.trim() ? filas.filter((x) => contiene(x.periodo, periodo)) : filas;
        const por = new Map<string, number>();
        for (const x of f) por.set(`${x.periodo}|${x.curso}`, (por.get(`${x.periodo}|${x.curso}`) ?? 0) + 1);
        anotar('Matrículas', periodo ?? 'activas');
        return {
          totalMatriculados: f.length,
          enlaceLista: '/escolar/matriculas',
          porCurso: [...por.entries()].sort().slice(0, 60).map(([k, n]) => {
            const [per, curso] = k.split('|');
            return { periodo: per, curso, estudiantes: n };
          }),
        };
      }),
    }),

    cargos_escolares: tool({
      description:
        'Cargos del colegio (mensualidades, inscripción…) por estudiante, por la API de Cargos: lo que se debe y lo pagado. ' +
        'Es la deuda del colegio aunque todavía no tenga factura: para «quién debe», «cuántos estudiantes deben» o «morosos» usa soloConDeuda ' +
        '(y soloVencido para lo ya vencido). Estados: pendiente, vencido, parcial, pagado, anulado. ' +
        '«Quién no ha pagado la mensualidad de octubre» = soloConDeuda, mes 10.',
      inputSchema: z.object({
        estudiante: z.string().max(60).optional().describe('Nombre o apellido del estudiante'),
        curso: z.string().max(60).optional().describe('Grado o sección, como lo diga la persona: «2do de primaria», «inicial», «1ro A».'),
        estado: z.enum(['pendiente', 'vencido', 'parcial', 'pagado', 'anulado']).optional(),
        soloConDeuda: z.boolean().optional().describe('Solo cargos con saldo por pagar (pendiente, vencido o parcial).'),
        soloVencido: z.boolean().optional().describe('Solo cargos con saldo cuya fecha de vencimiento ya pasó.'),
        mes: z.number().int().min(1).max(12).optional(),
        anio: z.number().int().min(2000).max(2100).optional(),
        limite: z.number().int().min(1).max(MAX).default(15),
      }),
      execute: seguro('los cargos escolares', async ({ estudiante, curso, estado, soloConDeuda, soloVencido, mes, anio, limite }) => {
        // «Vencido» se decide por la fecha y no por el estado guardado: un cargo
        // sigue «pendiente» en la base hasta que una tarea lo marca, y pedir
        // estado=vencido dejaba fuera lo que venció ayer.
        const porFecha = estado === 'vencido' || soloVencido === true;
        const conDeuda = porFecha || soloConDeuda === true;
        const cargos: CargoApi[] = [];
        for (let pagina = 1; pagina <= 5; pagina++) {
          const r = await api.get<{ cargos: CargoApi[]; paginas?: number }>('/api/administracion-escolar/cargos', {
            estado: conDeuda ? undefined : estado, pagina, porPagina: 200,
          });
          cargos.push(...(r.cargos ?? []));
          if (!r.paginas || pagina >= r.paginas) break;
        }
        const hoy = hoyRd();
        const debe = (x: CargoApi) => Number(x.saldoCentavos || 0) > 0 && ['pendiente', 'vencido', 'parcial'].includes(x.estado);
        const vencio = (x: CargoApi) => debe(x) && Boolean(x.fechaVencimiento) && String(x.fechaVencimiento).slice(0, 10) < hoy;
        const c = cargos.filter((x) =>
          (!mes || x.mes === mes) && (!anio || x.anio === anio)
          && (!conDeuda || debe(x)) && (!porFecha || vencio(x))
          && (!estudiante?.trim() || contiene(`${x.estudiante} ${x.estudianteApellidos}`, estudiante))
          && (!curso?.trim() || cursoCoincide(x.curso, curso)));
        const porEst = new Map<string, { debe: number; vencido: number; cargos: number; curso: string | null; desde: string | null }>();
        for (const x of c) {
          if (!debe(x)) continue;
          const k = `${x.estudiante} ${x.estudianteApellidos}`.trim();
          const e = porEst.get(k) ?? { debe: 0, vencido: 0, cargos: 0, curso: x.curso ?? null, desde: null };
          e.debe += Number(x.saldoCentavos || 0);
          if (vencio(x)) {
            e.vencido += Number(x.saldoCentavos || 0);
            const f = String(x.fechaVencimiento).slice(0, 10);
            if (!e.desde || f < e.desde) e.desde = f;
          }
          e.cargos += 1;
          porEst.set(k, e);
        }
        const suma = (f: (x: CargoApi) => boolean) => pesos(c.filter(f).reduce((s, x) => s + Number(x.saldoCentavos || 0), 0));
        anotar('Cargos escolares', [estado, soloVencido ? 'vencidos' : soloConDeuda && 'con deuda', mes && `mes ${mes}`, anio, estudiante].filter(Boolean).join(' · ') || 'todos');
        return {
          coinciden: c.length,
          saldoTotal: pesos(c.reduce((s, x) => s + Number(x.saldoCentavos || 0), 0)),
          saldoVencido: suma(vencio),
          // Lo que se debe y todavía no tiene factura: no sale en Cuentas por cobrar.
          saldoSinFacturar: suma((x) => debe(x) && !x.ecfDocumentId),
          estudiantesConDeuda: porEst.size,
          porEstudiante: [...porEst.entries()].sort((a, b) => b[1].debe - a[1].debe).slice(0, limite)
            .map(([nombre, e]) => ({ estudiante: nombre, curso: e.curso, debe: pesos(e.debe), vencido: pesos(e.vencido), vencidoDesde: e.desde, cargos: e.cargos })),
          enlaceLista: '/escolar/responsables?filtro=con-deuda',
          cargos: c.slice(0, limite).map((x) => ({
            enlace: x.ecfDocumentId ? enlaceFactura(x.ecfDocumentId) : undefined,
            estudiante: `${x.estudiante} ${x.estudianteApellidos}`.trim(), concepto: x.concepto, mes: x.mes, anio: x.anio,
            monto: pesos(x.montoCentavos), saldo: pesos(x.saldoCentavos), vence: x.fechaVencimiento, estado: x.estado,
          })),
        };
      }),
    }),

    // ── Nómina ────────────────────────────────────────────────────────────
    resumen_nomina: tool({
      description: 'Empleados activos, costo mensual base y las últimas corridas de nómina, por la API de Nómina.',
      inputSchema: z.object({ corridas: z.number().int().min(1).max(12).default(3) }),
      execute: seguro('la nómina', async ({ corridas }) => {
        const [e, c] = await Promise.all([
          api.get<{ empleados: EmpleadoApi[] }>('/api/nomina/empleados'),
          api.get<{ corridas: CorridaApi[] }>('/api/nomina/corridas'),
        ]);
        const activos = (e.empleados ?? []).filter((x) => x.estado === 'activo');
        anotar('Resumen de nómina', `${corridas} corridas`);
        return {
          empleadosActivos: activos.length,
          salariosBaseMensuales: pesos(activos.reduce((s, x) => s + Number(x.salarioBaseCents || 0), 0)),
          enlaceLista: '/nomina/corridas',
          ultimasCorridas: (c.corridas ?? []).slice(0, corridas).map((x) => ({
            periodo: x.periodo, descripcion: x.descripcion, estado: x.estado,
            bruto: pesos(x.totalBrutoCents), neto: pesos(x.totalNetoCents), aportePatronal: pesos(x.totalPatronalCents), fechaPago: x.fechaPago ?? null,
          })),
        };
      }),
    }),

    buscar_empleados: tool({
      description: 'Busca empleados por nombre o cargo, por la API de Empleados: cargo, tipo de contrato, estado y fecha de ingreso (sin cédula ni cuentas).',
      inputSchema: z.object({
        q: z.string().max(60).optional(),
        estado: z.enum(['activo', 'inactivo', 'liquidado']).optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('los empleados', async ({ q, estado, limite }) => {
        const r = await api.get<{ empleados: EmpleadoApi[] }>('/api/nomina/empleados');
        let e = r.empleados ?? [];
        if (estado) e = e.filter((x) => x.estado === estado);
        if (q?.trim()) e = e.filter((x) => contiene(`${x.nombres} ${x.apellidos}`, q) || contiene(x.cargo, q));
        anotar('Empleados', q ?? estado ?? 'todos');
        return {
          encontrados: e.length,
          enlaceLista: '/nomina/empleados',
          empleados: e.slice(0, limite).map((x) => ({
            nombre: `${x.nombres} ${x.apellidos}`.trim(), cargo: x.cargo ?? null, contrato: x.tipoContrato,
            estado: x.estado, ingreso: x.fechaIngreso ?? null, frecuencia: x.frecuenciaPago,
          })),
        };
      }),
    }),

    // ── Caja ──────────────────────────────────────────────────────────────
    turnos_caja: tool({
      description:
        'Turnos de caja, por la API de Caja. ABIERTO = el turno abierto de quien pregunta; CIERRE_SOLICITADO = cierres que esperan aprobación ' +
        '(solo supervisores); CERRADO = historial de cierres aprobados, con diferencia.',
      inputSchema: z.object({
        estado: z.enum(['ABIERTO', 'CIERRE_SOLICITADO', 'CERRADO']).default('ABIERTO'),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: seguro('los turnos de caja', async ({ estado, limite }) => {
        anotar('Turnos de caja', estado);
        if (estado === 'ABIERTO') {
          const r = await api.get<{ turno: { aperturaAt?: string; montoAperturaCentavos?: number; estado?: string } | null }>('/api/caja/turnos');
          return {
            nota: 'Esta API solo informa el turno abierto de la persona que pregunta; los de otros cajeros se ven en Caja.',
            enlaceLista: '/dashboard/caja',
            turnos: r.turno ? [{
              cajero: 'Tú', estado: r.turno.estado ?? 'ABIERTO',
              apertura: r.turno.aperturaAt ? new Date(r.turno.aperturaAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }) : null,
              montoApertura: pesos(r.turno.montoAperturaCentavos),
            }] : [],
          };
        }
        const ruta = estado === 'CERRADO' ? '/api/caja/historial' : '/api/caja/aprobaciones';
        const r = await api.get<{ turnos?: TurnoApi[]; cierres?: TurnoApi[] }>(ruta, estado === 'CERRADO' ? { limit: limite } : {});
        const t = (r.turnos ?? r.cierres ?? []) as TurnoApi[];
        return {
          enlaceLista: estado === 'CERRADO' ? '/dashboard/caja' : '/dashboard/caja/aprobaciones',
          turnos: t.slice(0, limite).map((x) => ({
            cajero: x.cajero ?? null, estado,
            apertura: x.aperturaAt ? new Date(x.aperturaAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }) : null,
            montoApertura: pesos(x.montoAperturaCentavos), efectivoContado: x.efectivoContadoCentavos != null ? pesos(x.efectivoContadoCentavos) : null,
            esperado: x.montoEsperadoCentavos != null ? pesos(x.montoEsperadoCentavos) : null,
            diferencia: x.diferenciaCentavos != null ? pesos(x.diferenciaCentavos) : null,
          })),
        };
      }),
    }),
  };
}

// ── Formas que devuelve la API (solo lo que se usa) ─────────────────────────

interface FacturaApi {
  id: number; encf: string | null; codigo: string | null; tipoEcf: string; estado: string;
  razonSocialComprador?: string | null; rncComprador?: string | null; montoTotal: number; pagado?: number; moraPendiente?: number;
  fechaEmision?: string | null; createdAt?: string | null; fechaLimitePago?: string | null; dependienteNombre?: string | null;
}
interface CxcApi {
  cuentas?: { id: number; razonSocialComprador?: string | null; clienteRazonSocial?: string | null; saldo: number; moraSaldo?: number; diasVencido?: number }[];
  totales?: { pendiente: number };
  antiguedad?: Record<string, { saldo: number }>;
}
interface PagoApi { docId?: number | null; montoCentavos: number; metodo: string; referencia?: string | null; fechaPago: string; cliente?: string | null; docEncf?: string | null; docCodigo?: string | null }
interface ClienteRegApi { razonSocial: string; rnc?: string | null; email?: string | null; telefono?: string | null; celular?: string | null; whatsapp?: string | null; direccion?: string | null; dependientes?: string[] }
interface CapturaApi {
  estado: string; subidoPor?: string | null; nota?: string | null; creadoEn: string;
  datos?: { proveedorNombre?: string | null; proveedorRnc?: string | null; ncf?: string | null; fecha?: string | null; totalCents?: number | null; categoria?: string | null; avisos?: string[] } | null;
}
interface CompraApi {
  id: number; clase: string; estado: string; fecha: string; proveedorNombre?: string | null; ncf?: string | null; montoTotal: number;
  estadoPago?: string | null; categoria?: string | null; categoriaLabel?: string | null; pagadoCents?: number; saldoCents?: number;
  itbisAdelantarCents?: number; retencionesCents?: number;
}
interface ProductoApi {
  id: number; nombre: string; referencia?: string | null; tipo: string; precio: number; costo: number; precioDOP?: number; costoDOP?: number;
  stockActual: number; stockMinimo: number; controlaInventario: boolean; activo?: string;
}
interface ClienteDetalleApi {
  id?: number; razonSocial?: string | null; rnc?: string | null; email?: string | null;
  telefono?: string | null; celular?: string | null; whatsapp?: string | null; direccion?: string | null;
}
interface FacturaResumenApi { id: number; encf?: string | null; estado: string; montoTotal: number; fechaEmision?: string | null }
interface ProductoDetalleApi {
  id: number; nombre: string; referencia?: string | null; tipo?: string; precio: number; costo: number; tasaItbis: string;
  controlaInventario?: boolean; stockActual?: number; stockMinimo?: number; unidadMedida?: string | null;
}
interface FacturaDetalleApi {
  mensajesDgii?: unknown;
  trackId?: string | null;
  dependienteNombre?: string | null;
  id: number; encf: string | null; codigo?: string | null; tipoEcf?: string; tipoNombre?: string; estado: string;
  fechaEmision: string; fechaLimitePago?: string | null;
  comprador?: { razonSocial?: string | null; rnc?: string | null };
  montos?: { montoTotal?: number; totalItbis?: number; ncAplicado?: number };
  pago?: { valorCts?: number; lineas?: { fechaPago?: string | null; metodo?: string; valor?: string }[] };
  lineas?: { nombreItem?: unknown; cantidadItem?: unknown; precioUnitarioItem?: unknown }[];
}
interface CotizacionApi { id: number; numero: string; estado: string; razonSocialComprador?: string | null; montoTotal: number; fechaEmision?: string | null; fechaVencimiento?: string | null }
interface RecurrenteApi { id: number; nombre: string; clienteRazonSocial?: string | null; frecuencia: string; proximaEmision: string; estado: string; totalEstimado: number; facturasEmitidas: number }
interface AsientoApi { id: number; fecha: string; concepto: string; origenTipo: string; totalCents: number }
interface CuentaApi { codigo: string; nombre: string; tipo: string; naturaleza: string; imputable: boolean; activa: boolean }
interface EstudianteApi {
  origen?: string; id: number; codigo?: string | null; nombres: string; apellidos: string; estado: string; matriculaActivaId?: number | null;
  periodoActivo?: string | null; cursoActual?: string | null; tutorResponsable?: string | null; deudaCentavos?: number | null;
}
/**
 * ¿El curso del cargo («2do de Primaria — A») es el que dijo la persona
 * («2do de primaria», «segundo», «2do A»)? Se comparan las palabras sin tildes,
 * con los ordinales en número.
 */
export function cursoCoincide(cursoCargo: string | null | undefined, pedido: string): boolean {
  if (!cursoCargo) return false;
  const ORD: Record<string, string> = { primero: '1', segundo: '2', tercero: '3', cuarto: '4', quinto: '5', sexto: '6' };
  const palabras = (x: string) => quitarTildes(x.toLowerCase())
    .replace(/(\d+)\s*(ro|do|to|vo|no|er|mo|°|º)\b/g, '$1')
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map((w) => ORD[w] ?? w)
    .filter((w) => !['de', 'del', 'la', 'el', 'grado', 'curso', 'seccion'].includes(w));
  const del = new Set(palabras(cursoCargo));
  const quiere = palabras(pedido);
  return quiere.length > 0 && quiere.every((w) => del.has(w));
}

interface CargoApi {
  estudiante: string; estudianteApellidos: string; concepto: string; mes: number; anio: number; curso?: string | null;
  montoCentavos: number; saldoCentavos: number; fechaVencimiento: string; estado: string; ecfDocumentId?: number | null;
}
interface EmpleadoApi { nombres: string; apellidos: string; cargo?: string | null; tipoContrato: string; estado: string; fechaIngreso?: string | null; frecuenciaPago: string; salarioBaseCents: number }
interface CorridaApi { periodo: string; descripcion: string; estado: string; totalBrutoCents: number; totalNetoCents: number; totalPatronalCents: number; fechaPago?: string | null }
interface TurnoApi { cajero?: string | null; aperturaAt?: string | null; montoAperturaCentavos?: number; efectivoContadoCentavos?: number | null; montoEsperadoCentavos?: number | null; diferenciaCentavos?: number | null }

/** Número con el que se reconoce una factura, para mostrarlo siempre junto al enlace. */
function numeroDe(d: FacturaApi): string {
  const n = d.encf?.trim() || d.codigo?.trim();
  if (n) return n;
  const f = ymd(d.fechaEmision ?? d.createdAt);
  return f ? `Borrador del ${f}` : 'Borrador';
}

/** Lo que la pantalla de Facturas llama «pagada», «parcial» o «pendiente». */
function estadoDePago(d: FacturaApi): 'PENDIENTE' | 'PARCIAL' | 'PAGADA' {
  const total = Number(d.montoTotal || 0);
  const pagado = Number(d.pagado || 0);
  if (total > 0 && pagado >= total && Number(d.moraPendiente || 0) <= 0) return 'PAGADA';
  return pagado > 0 ? 'PARCIAL' : 'PENDIENTE';
}
