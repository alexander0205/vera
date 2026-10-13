import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import {
  getKpis, getTendencia, getIngresosPorProducto, getIngresosPorCliente,
  getIngresosPorMetodo, getAgingCxC, getItbisResumen, getVentasPorTipo,
  getVentasPorUsuario,
} from '@/lib/reportes/queries';
import { parseRango, METODO_LABEL } from '@/lib/reportes/shared';
import type { ToolSet } from 'ai';
import { crearHerramientasNegocio } from './herramientas-negocio';
import {
  anotador, herramientasFacturacion, herramientasContabilidad, herramientasEscolar, herramientasNomina, herramientasPos,
} from './herramientas-modulos';
import { contextoDePrueba, type ContextoAsistente } from './contexto';
import { buscarEnMapa } from './guia';

/**
 * Herramientas del asistente de Zero. TODAS son de solo lectura: cada una es
 * una consulta de `lib/reportes/queries.ts`, las mismas que alimentan las
 * pantallas de reportes, y todas reciben el `teamId` que sale de la sesión —
 * nunca del modelo. El modelo solo escoge fechas y límites.
 *
 * Los montos viajan en PESOS (los reportes guardan centavos): así el modelo no
 * tiene que dividir y no se equivoca por un factor de 100.
 */

const pesos = (centavos: number) => Math.round(Number(centavos) || 0) / 100;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa YYYY-MM-DD');
const periodo = {
  desde: fecha.optional().describe('Primer día, YYYY-MM-DD. Si falta, el 1 del mes actual.'),
  hasta: fecha.optional().describe('Último día incluido, YYYY-MM-DD. Si falta, el fin del mes actual.'),
};

/** Un resumen corto de lo que consultó, para mostrar «Consulté: …» en el chat. */
export interface ConsultaHecha { nombre: string; resumen: string }

const MAX_FILAS = 25;

function herramientasReportes(teamId: number, consultas: ConsultaHecha[]) {
  const anotar = (nombre: string, resumen: string) => consultas.push({ nombre, resumen });
  const rango = (d?: string, h?: string) => {
    const r = parseRango(d, h);
    const f = (x: Date) => x.toLocaleDateString('en-CA');
    return { ...r, texto: `${f(r.desde)} al ${f(r.hasta)}` };
  };

  return {
    resumen_ventas: tool({
      description:
        'Resumen del período: ventas netas, base imponible, ITBIS, cantidad de facturas, ticket promedio, ' +
        'cuentas por cobrar y vencido (la cartera es de hoy, no del período).',
      inputSchema: z.object(periodo),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const k = await getKpis(teamId, r.desde, r.hasta);
        anotar('Resumen de ventas', r.texto);
        return {
          periodo: r.texto,
          ventasNetas: pesos(k.ingresosCents),
          baseImponible: pesos(k.baseCents),
          itbis: pesos(k.itbisCents),
          facturas: k.numFacturas,
          ticketPromedio: pesos(k.ticketPromedioCents),
          porCobrarHoy: pesos(k.porCobrarCents),
          vencidoHoy: pesos(k.vencidoCents),
        };
      },
    }),

    tendencia_ventas: tool({
      description: 'Ventas por día, semana o mes dentro de un período, para ver cómo evolucionan o comparar.',
      inputSchema: z.object({ ...periodo, agrupar: z.enum(['dia', 'semana', 'mes']).default('dia') }),
      execute: async ({ desde, hasta, agrupar }) => {
        const r = rango(desde, hasta);
        const filas = await getTendencia(teamId, r.desde, r.hasta, agrupar);
        anotar('Tendencia de ventas', `${r.texto}, por ${agrupar}`);
        return {
          periodo: r.texto,
          agrupadoPor: agrupar,
          puntos: filas.slice(-60).map((f) => ({
            periodo: f.periodo, ventas: pesos(f.ingresosCents), facturas: f.numFacturas,
          })),
        };
      },
    }),

    ventas_por_producto: tool({
      description: 'Qué productos o servicios más se vendieron (base sin ITBIS) en un período.',
      inputSchema: z.object({ ...periodo, limite: z.number().int().min(1).max(MAX_FILAS).default(10) }),
      execute: async ({ desde, hasta, limite }) => {
        const r = rango(desde, hasta);
        const filas = await getIngresosPorProducto(teamId, r.desde, r.hasta);
        anotar('Ventas por producto', r.texto);
        return {
          periodo: r.texto,
          totalProductos: filas.length,
          productos: filas.slice(0, limite).map((f) => ({
            nombre: f.nombre,
            // Varios renglones pueden llamarse igual («Pago de colegiatura»):
            // la referencia es lo que los distingue.
            referencia: f.referencia,
            unidades: f.unidades, ventas: pesos(f.ingresosCents),
            facturas: f.numFacturas,
          })),
        };
      },
    }),

    ventas_por_cliente: tool({
      description: 'Qué clientes (o familias) más compraron en un período.',
      inputSchema: z.object({ ...periodo, limite: z.number().int().min(1).max(MAX_FILAS).default(10) }),
      execute: async ({ desde, hasta, limite }) => {
        const r = rango(desde, hasta);
        const filas = await getIngresosPorCliente(teamId, r.desde, r.hasta, limite);
        anotar('Ventas por cliente', r.texto);
        return {
          periodo: r.texto,
          clientes: filas.map((f) => ({ cliente: f.cliente, ventas: pesos(f.ingresosCents), facturas: f.numFacturas })),
        };
      },
    }),

    cobros_por_metodo: tool({
      description: 'Cuánto se cobró en el período por cada método de pago (efectivo, transferencia, tarjeta…).',
      inputSchema: z.object(periodo),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const filas = await getIngresosPorMetodo(teamId, r.desde, r.hasta);
        anotar('Cobros por método', r.texto);
        return {
          periodo: r.texto,
          metodos: filas.map((f) => ({
            metodo: METODO_LABEL[f.metodo] ?? f.metodo, cobrado: pesos(f.totalCents), pagos: f.numPagos,
          })),
        };
      },
    }),

    cuentas_por_cobrar: tool({
      description:
        'Cartera pendiente de HOY: total, antigüedad por cubetas y los clientes que más deben. ' +
        'Úsala para «quién me debe», «cuánto tengo vencido», «cartera».',
      inputSchema: z.object({
        soloVencidas: z.boolean().default(false).describe('Solo lo que ya pasó su fecha límite'),
        limite: z.number().int().min(1).max(MAX_FILAS).default(10),
      }),
      execute: async ({ soloVencidas, limite }) => {
        const a = await getAgingCxC(teamId);
        anotar('Cuentas por cobrar', soloVencidas ? 'solo vencidas' : 'toda la cartera');
        const porCliente = new Map<string, { saldo: number; facturas: number; diasMax: number }>();
        for (const f of a.filas) {
          if (soloVencidas && f.cubeta === 'porVencer') continue;
          const c = porCliente.get(f.cliente) ?? { saldo: 0, facturas: 0, diasMax: 0 };
          c.saldo += f.saldoCents; c.facturas += 1; c.diasMax = Math.max(c.diasMax, f.diasVencido);
          porCliente.set(f.cliente, c);
        }
        const deudores = [...porCliente.entries()]
          .sort((x, y) => y[1].saldo - x[1].saldo)
          .slice(0, limite)
          .map(([cliente, c]) => ({
            cliente, debe: pesos(c.saldo), facturas: c.facturas, diasVencidoMaximo: c.diasMax,
          }));
        return {
          totalPorCobrar: pesos(a.totalCents),
          porVencer: pesos(a.buckets.porVencer),
          vencido0a30: pesos(a.buckets['0-30']),
          vencido31a60: pesos(a.buckets['31-60']),
          vencido61a90: pesos(a.buckets['61-90']),
          vencidoMasDe90: pesos(a.buckets['90+']),
          clientesConDeuda: porCliente.size,
          mayoresDeudores: deudores,
        };
      },
    }),

    resumen_itbis: tool({
      description: 'ITBIS del período: facturado (débito), adelantado en compras (crédito) y a pagar.',
      inputSchema: z.object(periodo),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const i = await getItbisResumen(teamId, r.desde, r.hasta);
        anotar('Resumen de ITBIS', r.texto);
        return {
          periodo: r.texto,
          baseVentas: pesos(i.baseCents),
          itbisFacturado: pesos(i.itbisDebitoCents),
          itbisEnCompras: pesos(i.itbisCreditoCents),
          itbisAPagar: pesos(i.aPagarCents),
        };
      },
    }),

    ventas_por_tipo_comprobante: tool({
      description: 'Ventas separadas por tipo de comprobante (crédito fiscal, consumo, notas…).',
      inputSchema: z.object(periodo),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const filas = await getVentasPorTipo(teamId, r.desde, r.hasta);
        anotar('Ventas por tipo de comprobante', r.texto);
        return {
          periodo: r.texto,
          tipos: filas.map((f) => ({ tipo: f.nombre, ventas: pesos(f.ingresosCents), facturas: f.numFacturas })),
        };
      },
    }),

    ventas_por_usuario: tool({
      description: 'Cuánto facturó cada usuario del sistema (cajero, vendedor) en el período.',
      inputSchema: z.object(periodo),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const filas = await getVentasPorUsuario(teamId, r.desde, r.hasta);
        anotar('Ventas por usuario', r.texto);
        return {
          periodo: r.texto,
          usuarios: filas.slice(0, MAX_FILAS).map((f) => ({
            usuario: f.nombre, ventas: pesos(f.ingresosCents), facturas: f.numFacturas,
          })),
        };
      },
    }),
  };
}



const solo = (t: ToolSet, claves: string[]): ToolSet =>
  Object.fromEntries(Object.entries(t).filter(([k]) => claves.includes(k)));

/**
 * El catálogo completo, ya filtrado para esta persona en esta empresa: una
 * herramienta solo existe si el módulo está contratado y el rol tiene el
 * permiso de esa pantalla. Lo que no está en la lista, el modelo ni sabe que
 * existe — y la guía le dice a la persona dónde está o por qué no la ve.
 *
 * Recibe un número (solo pruebas) o el contexto real de la sesión.
 */
export function crearHerramientas(entrada: number | ContextoAsistente, consultas: ConsultaHecha[]): ToolSet {
  const ctx = typeof entrada === 'number' ? contextoDePrueba(entrada) : entrada;
  const { teamId } = ctx;
  const anotar = anotador(consultas);
  const negocio = crearHerramientasNegocio(teamId, consultas) as ToolSet;

  const t: ToolSet = {
    ...herramientasReportes(teamId, consultas),
    // Consultas puntuales de facturación: qué está pendiente, buscar algo.
    ...solo(negocio, ['facturas_por_revisar', 'resumen_gastos', 'listar_gastos_compras', 'buscar_clientes', 'pagos_recibidos']),
    ...(ctx.puede('facturas:ver') ? solo(negocio, ['buscar_facturas']) : {}),
    ...(ctx.tieneModulo('escolar') && ctx.puede('administracion-escolar:ver') ? solo(negocio, ['cargos_escolares']) : {}),
  };

  const fact = herramientasFacturacion(teamId, anotar) as ToolSet;
  if (ctx.puede('productos:ver')) Object.assign(t, solo(fact, ['buscar_productos']));
  if (ctx.puede('cotizaciones:ver')) Object.assign(t, solo(fact, ['listar_cotizaciones']));
  if (ctx.puede('facturas:ver')) Object.assign(t, solo(fact, ['facturas_recurrentes']));

  if (ctx.tieneModulo('contabilidad') && ctx.puede('contabilidad:ver')) {
    Object.assign(t, herramientasContabilidad(teamId, anotar));
  }
  if (ctx.tieneModulo('escolar') && ctx.puede('administracion-escolar:ver')) {
    Object.assign(t, herramientasEscolar(teamId, anotar));
  }
  if (ctx.tieneModulo('nomina') && ctx.puede('empleados:ver')) {
    Object.assign(t, herramientasNomina(teamId, anotar));
  }
  if (ctx.tieneModulo('pos') && ctx.puede('caja:ver')) {
    Object.assign(t, herramientasPos(teamId, anotar));
  }

  // La guía va siempre: orientar no abre ningún dato.
  t.donde_encontrar = tool({
    description:
      'Dice DÓNDE está algo en Zero y CÓMO se hace: el módulo, el camino en el menú y los pasos. ' +
      'Úsala para «dónde veo…», «cómo creo…», «dónde configuro…», «en qué módulo está…». ' +
      'Con el resultado, explica el camino con el nombre del módulo y de la sección, y pon el enlace.',
    inputSchema: z.object({
      consulta: z.string().min(2).max(120).describe('Lo que la persona quiere encontrar o hacer, con sus palabras'),
    }),
    execute: async ({ consulta }) => {
      const r = buscarEnMapa(consulta, { tieneModulo: ctx.tieneModulo, puede: ctx.puede });
      anotar('Guía de Zero', consulta);
      return r.resultados.length || r.noDisponibles.length
        ? r
        : { resultados: [], noDisponibles: [], nota: 'No hay una pantalla registrada con ese nombre. Dilo con claridad y sugiere «Hablar con una persona».' };
    },
  });

  return t;
}
