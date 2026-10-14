import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  clients, ecfDocuments, pagosRecibidos, adminEscolarCargos, adminEscolarEstudiantes, adminEscolarConceptosPago,
} from '@/lib/db/schema';
import { CAMPOS_FACTURA } from '@/lib/mcp/campos-facturas';
import { CAMPOS_CLIENTE } from '@/lib/mcp/campos-clientes';
import { listarCapturas, contarPorRevisar } from '@/lib/compras/captura/consultas';
import { listarCompras, resumenGastos } from '@/lib/compras/consultas';
import { parseRango, METODO_LABEL } from '@/lib/reportes/shared';
import type { ConsultaHecha } from './herramientas';
import { pesos, fechaYmd, ymd, contiene } from './util';

/**
 * Herramientas de consulta del día a día: no son reportes agregados sino
 * «¿qué hay pendiente?», «¿cuál es esa factura?», «¿qué debe esta familia?».
 *
 * Misma regla que las de reportes: solo lectura, con el `teamId` de la sesión
 * en TODA consulta, y salen por las proyecciones permitidas del MCP
 * (`lib/mcp/campos-*`), que ya dejan fuera lo interno.
 */

const fecha = fechaYmd;
const MAX = 25;

export function crearHerramientasNegocio(teamId: number, consultas: ConsultaHecha[]) {
  const anotar = (nombre: string, resumen: string) => consultas.push({ nombre, resumen });
  const rango = (d?: string, h?: string) => {
    const r = parseRango(d, h);
    return { ...r, desde: ymd(r.desde)!, hasta: ymd(r.hasta)!, texto: `${ymd(r.desde)} al ${ymd(r.hasta)}` };
  };

  return {
    facturas_por_revisar: tool({
      description:
        'Facturas de proveedor y comprobantes de gasto que llegaron por foto, enlace o PDF y TODAVÍA NO se han registrado ' +
        '(la bandeja «Facturas por revisar» de Gastos). Úsala para «qué facturas tengo por revisar», «qué gastos faltan registrar».',
      inputSchema: z.object({ limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: async ({ limite }) => {
        const [filas, total] = await Promise.all([
          listarCapturas(teamId, ['por_revisar', 'procesando'], limite),
          contarPorRevisar(teamId),
        ]);
        anotar('Facturas por revisar', `${total} pendientes`);
        return {
          totalPorRevisar: total,
          facturas: filas.map((f) => ({
            id: f.id,
            estado: f.estado === 'procesando' ? 'leyéndose' : 'por revisar',
            proveedor: f.datos?.proveedorNombre ?? null,
            rnc: f.datos?.proveedorRnc ?? null,
            ncf: f.datos?.ncf ?? null,
            fecha: f.datos?.fecha ?? null,
            total: f.datos?.totalCents != null ? pesos(f.datos.totalCents) : null,
            categoria: f.datos?.categoria ?? null,
            avisos: f.datos?.avisos ?? [],
            subidoPor: f.subidoPor,
            nota: f.nota,
            recibida: ymd(f.creadoEn),
          })),
        };
      },
    }),

    resumen_gastos: tool({
      description: 'Cuánto se gastó en un período: total, por pagar a proveedores, ITBIS por adelantar, retenciones y gasto por categoría.',
      inputSchema: z.object({
        desde: fecha.optional().describe('Primer día YYYY-MM-DD. Si falta, el 1 del mes actual.'),
        hasta: fecha.optional().describe('Último día YYYY-MM-DD. Si falta, el fin del mes actual.'),
      }),
      execute: async ({ desde, hasta }) => {
        const r = rango(desde, hasta);
        const g = await resumenGastos(teamId, { desde: r.desde, hasta: r.hasta });
        anotar('Resumen de gastos', r.texto);
        return {
          periodo: r.texto,
          gastos: g.vivas,
          totalGastado: pesos(g.totalCents),
          porPagarAProveedores: pesos(g.porPagarCents),
          itbisPorAdelantar: pesos(g.itbisPorAdelantarCents),
          retenciones: pesos(g.retencionesCents),
          borradores: g.borradores,
          porCategoria: g.porCategoria.slice(0, MAX).map((c) => ({ categoria: c.categoria ?? 'Sin categoría', total: pesos(c.totalCents) })),
        };
      },
    }),

    listar_gastos_compras: tool({
      description: 'Lista de gastos y compras a proveedores registrados en un período, con proveedor, monto, NCF y si están pagados.',
      inputSchema: z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        clase: z.enum(['gasto', 'compra']).optional(),
        limite: z.number().int().min(1).max(MAX).default(15),
      }),
      execute: async ({ desde, hasta, clase, limite }) => {
        const r = rango(desde, hasta);
        const filas = await listarCompras(teamId, { clase, desde: r.desde, hasta: r.hasta, limit: limite });
        anotar('Gastos y compras', r.texto);
        return {
          periodo: r.texto,
          mostrando: filas.length,
          registros: filas.map((c) => ({
            fecha: c.fecha, clase: c.clase, estado: c.estado, proveedor: c.proveedorNombre, ncf: c.ncf,
            total: pesos(c.montoTotal), estadoPago: c.estadoPago, categoria: c.categoria,
            pagado: pesos(c.pagadoCents),
          })),
        };
      },
    }),

    buscar_facturas: tool({
      description:
        'Busca facturas emitidas (ventas): por texto (número, cliente, RNC), estado, estado de pago o fechas. ' +
        'Estados: BORRADOR (sin emitir), ACEPTADO, EN_PROCESO, RECHAZADO, ANULADO, HISTORICA. ' +
        'Estado de pago: PENDIENTE, PARCIAL, PAGADA, ANULADA. Úsala para «mis borradores», «facturas sin cobrar de X», «la factura 123».',
      inputSchema: z.object({
        q: z.string().max(80).optional().describe('Número de factura/e-NCF, nombre del cliente o RNC'),
        estado: z.enum(['BORRADOR', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO', 'RECHAZADO', 'ANULADO', 'HISTORICA']).optional(),
        estadoPago: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA']).optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ q, estado, estadoPago, desde, hasta, limite }) => {
        const cond = [eq(ecfDocuments.teamId, teamId)];
        if (estado) cond.push(eq(ecfDocuments.estado, estado));
        if (estadoPago) cond.push(eq(ecfDocuments.estadoPago, estadoPago));
        if (desde) cond.push(sql`${ecfDocuments.fechaEmision}::date >= ${desde}`);
        if (hasta) cond.push(sql`${ecfDocuments.fechaEmision}::date <= ${hasta}`);
        if (q?.trim()) {
          const t = q.trim();
          cond.push(or(
            contiene(ecfDocuments.encf, t), contiene(ecfDocuments.codigo, t),
            contiene(ecfDocuments.razonSocialComprador, t), contiene(ecfDocuments.rncComprador, t),
          )!);
        }
        const donde = and(...cond);
        const [filas, [tot]] = await Promise.all([
          db.select(CAMPOS_FACTURA).from(ecfDocuments).where(donde)
            .orderBy(desc(ecfDocuments.fechaEmision), desc(ecfDocuments.id)).limit(limite),
          db.select({
            n: sql<number>`count(*)::int`,
            total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
          }).from(ecfDocuments).where(donde),
        ]);
        anotar('Búsqueda de facturas', [estado, estadoPago, q, desde && `desde ${desde}`].filter(Boolean).join(' · ') || 'todas');
        return {
          coinciden: Number(tot?.n ?? 0),
          sumaTotal: pesos(Number(tot?.total ?? 0)),
          mostrando: filas.length,
          facturas: filas.map((f) => ({
            numero: f.encf ?? f.codigo, tipo: f.tipoEcf, estado: f.estado, estadoPago: f.estadoPago,
            cliente: f.razonSocialComprador, rnc: f.rncComprador, total: pesos(f.montoTotal),
            fecha: ymd(f.fechaEmision), vence: f.fechaLimitePago, alumno: f.dependienteNombre,
          })),
        };
      },
    }),

    buscar_clientes: tool({
      description: 'Busca clientes (o familias) por nombre, RNC o teléfono y devuelve sus datos de contacto.',
      inputSchema: z.object({ q: z.string().min(2).max(80), limite: z.number().int().min(1).max(MAX).default(8) }),
      execute: async ({ q, limite }) => {
        const t = q.trim();
        const filas = await db.select(CAMPOS_CLIENTE).from(clients)
          .where(and(
            eq(clients.teamId, teamId),
            or(contiene(clients.razonSocial, t), contiene(clients.rnc, t), contiene(clients.telefono, t),
              contiene(clients.celular, t), contiene(clients.whatsapp, t), contiene(clients.email, t))!,
          ))
          .orderBy(clients.razonSocial).limit(limite);
        anotar('Búsqueda de clientes', q);
        return {
          encontrados: filas.length,
          clientes: filas.map((c) => ({
            id: c.id, nombre: c.razonSocial, rnc: c.rnc, email: c.email,
            telefono: c.telefono ?? c.celular ?? c.whatsapp, direccion: c.direccion,
          })),
        };
      },
    }),

    cargos_escolares: tool({
      description:
        'Cargos del colegio (mensualidades, inscripción, etc.) por estudiante: lo que se debe y lo ya pagado. ' +
        'Estados: pendiente, vencido, parcial, pagado, anulado. «Quién no ha pagado la mensualidad de octubre» = estado vencido o pendiente, mes 10.',
      inputSchema: z.object({
        estudiante: z.string().max(60).optional().describe('Nombre o apellido del estudiante'),
        estado: z.enum(['pendiente', 'vencido', 'parcial', 'pagado', 'anulado']).optional(),
        mes: z.number().int().min(1).max(12).optional(),
        anio: z.number().int().min(2000).max(2100).optional(),
        limite: z.number().int().min(1).max(MAX).default(15),
      }),
      execute: async ({ estudiante, estado, mes, anio, limite }) => {
        const cond = [eq(adminEscolarCargos.teamId, teamId)];
        if (estado) cond.push(eq(adminEscolarCargos.estado, estado));
        if (mes) cond.push(eq(adminEscolarCargos.mes, mes));
        if (anio) cond.push(eq(adminEscolarCargos.anio, anio));
        if (estudiante?.trim()) {
          cond.push(contiene(sql`(${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos})`, estudiante.trim()));
        }
        const donde = and(...cond);
        const base = db.select({
          estudiante: sql<string>`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`,
          concepto: adminEscolarConceptosPago.nombre,
          mes: adminEscolarCargos.mes, anio: adminEscolarCargos.anio,
          monto: adminEscolarCargos.montoCentavos, saldo: adminEscolarCargos.saldoCentavos,
          vence: adminEscolarCargos.fechaVencimiento, estado: adminEscolarCargos.estado,
        })
          .from(adminEscolarCargos)
          .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
          .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
          .where(donde);
        const [filas, [tot]] = await Promise.all([
          base.orderBy(adminEscolarCargos.fechaVencimiento, adminEscolarCargos.id).limit(limite),
          db.select({
            n: sql<number>`count(*)::int`,
            saldo: sql<number>`coalesce(sum(${adminEscolarCargos.saldoCentavos}), 0)`,
          })
            .from(adminEscolarCargos)
            .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
            .where(donde),
        ]);
        anotar('Cargos escolares', [estado, mes && `mes ${mes}`, anio, estudiante].filter(Boolean).join(' · ') || 'todos');
        return {
          coinciden: Number(tot?.n ?? 0),
          saldoTotal: pesos(Number(tot?.saldo ?? 0)),
          mostrando: filas.length,
          cargos: filas.map((c) => ({
            estudiante: c.estudiante, concepto: c.concepto, mes: c.mes, anio: c.anio,
            monto: pesos(c.monto), saldo: pesos(c.saldo), vence: c.vence, estado: c.estado,
          })),
        };
      },
    }),

    pagos_recibidos: tool({
      description: 'Pagos y cobros recibidos en un período: fecha, monto y método. Para «qué se cobró hoy/esta semana».',
      inputSchema: z.object({
        desde: fecha.optional(), hasta: fecha.optional(),
        limite: z.number().int().min(1).max(MAX).default(15),
      }),
      execute: async ({ desde, hasta, limite }) => {
        const r = rango(desde, hasta);
        const donde = and(
          eq(pagosRecibidos.teamId, teamId),
          gte(pagosRecibidos.fechaPago, r.desde), lte(pagosRecibidos.fechaPago, r.hasta),
        );
        const [filas, [tot]] = await Promise.all([
          db.select({
            fecha: pagosRecibidos.fechaPago, monto: pagosRecibidos.montoCentavos, metodo: pagosRecibidos.metodo,
            referencia: pagosRecibidos.referencia,
          }).from(pagosRecibidos).where(donde).orderBy(desc(pagosRecibidos.fechaPago), desc(pagosRecibidos.id)).limit(limite),
          db.select({
            n: sql<number>`count(*)::int`,
            total: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
          }).from(pagosRecibidos).where(donde),
        ]);
        anotar('Pagos recibidos', r.texto);
        return {
          periodo: r.texto,
          cantidad: Number(tot?.n ?? 0),
          totalCobrado: pesos(Number(tot?.total ?? 0)),
          mostrando: filas.length,
          pagos: filas.map((p) => ({
            fecha: p.fecha, monto: pesos(p.monto), metodo: METODO_LABEL[p.metodo] ?? p.metodo, referencia: p.referencia,
          })),
        };
      },
    }),
  };
}
