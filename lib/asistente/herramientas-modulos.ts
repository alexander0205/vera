import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  products, cotizaciones, facturasRecurrentes, clients,
  contabilidadAsientos, contabilidadAsientoLineas, contabilidadCuentas,
  adminEscolarEstudiantes, adminEscolarMatriculas, adminEscolarCursos, adminEscolarPeriodos,
  empleados, nominaCorridas, cajaTurnos, users,
} from '@/lib/db/schema';
import type { ConsultaHecha } from './herramientas';

/**
 * Consultas por módulo (inventario, cotizaciones, libro diario, estudiantes,
 * nómina, caja). Solo lectura, con el `teamId` de la sesión en cada consulta.
 *
 * Cada grupo lo registra `herramientas.ts` únicamente si la empresa tiene el
 * módulo y la persona tiene el permiso; aquí solo viven las consultas.
 *
 * En nómina no salen cédula ni cuenta bancaria: el asistente responde cuántos
 * son y cuánto cuesta, no entrega datos personales que nadie le pidió.
 */

const pesos = (c: number | string | null | undefined) => Math.round(Number(c) || 0) / 100;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa YYYY-MM-DD');
const MAX = 25;
const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contiene = (col: unknown, texto: string) =>
  sql`translate(lower(${col}), 'áéíóúüñ', 'aeiouun') LIKE ${'%' + quitarTildes(texto) + '%'}`;
const ymd = (d: Date | string | null | undefined) =>
  d == null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toLocaleDateString('en-CA');

type Anotar = (nombre: string, resumen: string) => void;
export const anotador = (consultas: ConsultaHecha[]): Anotar => (nombre, resumen) => consultas.push({ nombre, resumen });

// ── Facturación: inventario, cotizaciones, recurrentes ──────────────────────

export function herramientasFacturacion(teamId: number, anotar: Anotar) {
  return {
    buscar_productos: tool({
      description:
        'Productos y servicios del catálogo: precio, existencia y mínimo. Con soloBajoMinimo=true lista lo que está por agotarse ' +
        '(solo los que controlan inventario). Úsala para «cuánto cuesta X», «qué me queda de X», «qué se está acabando».',
      inputSchema: z.object({
        q: z.string().max(80).optional().describe('Nombre, referencia o código de barras'),
        soloBajoMinimo: z.boolean().default(false),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ q, soloBajoMinimo, limite }) => {
        const cond = [eq(products.teamId, teamId), eq(products.activo, 'true')];
        if (q?.trim()) {
          const t = q.trim();
          cond.push(sql`(${contiene(products.nombre, t)} OR ${contiene(products.referencia, t)} OR ${contiene(products.codigoBarras, t)})`);
        }
        if (soloBajoMinimo) cond.push(sql`${products.controlaInventario} AND ${products.stockActual} <= ${products.stockMinimo}`);
        const donde = and(...cond);
        const [filas, [tot]] = await Promise.all([
          db.select({
            nombre: products.nombre, referencia: products.referencia, tipo: products.tipo, precio: products.precio,
            costo: products.costo, existencia: products.stockActual, minimo: products.stockMinimo,
            controla: products.controlaInventario, unidad: products.unidadMedida,
          }).from(products).where(donde).orderBy(products.nombre).limit(limite),
          db.select({ n: sql<number>`count(*)::int` }).from(products).where(donde),
        ]);
        anotar('Productos', soloBajoMinimo ? 'bajo el mínimo' : q ?? 'catálogo');
        return {
          coinciden: Number(tot?.n ?? 0),
          mostrando: filas.length,
          productos: filas.map((p) => ({
            nombre: p.nombre, referencia: p.referencia, tipo: p.tipo, precio: pesos(p.precio), costo: pesos(p.costo),
            existencia: p.controla ? p.existencia : null, minimo: p.controla ? p.minimo : null, unidad: p.unidad,
          })),
        };
      },
    }),

    listar_cotizaciones: tool({
      description: 'Cotizaciones enviadas a clientes: número, cliente, total, estado y vencimiento.',
      inputSchema: z.object({
        estado: z.string().max(20).optional().describe('borrador, enviada, aceptada, rechazada, vencida…'),
        q: z.string().max(80).optional().describe('Cliente o número'),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ estado, q, limite }) => {
        const cond = [eq(cotizaciones.teamId, teamId)];
        if (estado) cond.push(eq(cotizaciones.estado, estado));
        if (q?.trim()) cond.push(sql`(${contiene(cotizaciones.razonSocialComprador, q.trim())} OR ${contiene(cotizaciones.numero, q.trim())})`);
        const donde = and(...cond);
        const [filas, [tot]] = await Promise.all([
          db.select({
            numero: cotizaciones.numero, estado: cotizaciones.estado, cliente: cotizaciones.razonSocialComprador,
            total: cotizaciones.montoTotal, emision: cotizaciones.fechaEmision, vence: cotizaciones.fechaVencimiento,
          }).from(cotizaciones).where(donde).orderBy(desc(cotizaciones.fechaEmision)).limit(limite),
          db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${cotizaciones.montoTotal}),0)` })
            .from(cotizaciones).where(donde),
        ]);
        anotar('Cotizaciones', estado ?? q ?? 'todas');
        return {
          coinciden: Number(tot?.n ?? 0), sumaTotal: pesos(Number(tot?.total ?? 0)),
          cotizaciones: filas.map((c) => ({
            numero: c.numero, estado: c.estado, cliente: c.cliente, total: pesos(c.total),
            emision: ymd(c.emision), vence: ymd(c.vence),
          })),
        };
      },
    }),

    facturas_recurrentes: tool({
      description: 'Facturas recurrentes (cobros automáticos): cliente, frecuencia, próxima emisión, estado y total estimado.',
      inputSchema: z.object({
        estado: z.enum(['activa', 'pausada', 'finalizada']).optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ estado, limite }) => {
        const cond = [eq(facturasRecurrentes.teamId, teamId)];
        if (estado) cond.push(eq(facturasRecurrentes.estado, estado));
        const donde = and(...cond);
        const [filas, [tot]] = await Promise.all([
          db.select({
            nombre: facturasRecurrentes.nombre, cliente: clients.razonSocial, frecuencia: facturasRecurrentes.frecuencia,
            proxima: facturasRecurrentes.proximaEmision, estado: facturasRecurrentes.estado,
            total: facturasRecurrentes.totalEstimado, emitidas: facturasRecurrentes.facturasEmitidas,
          }).from(facturasRecurrentes)
            .leftJoin(clients, eq(clients.id, facturasRecurrentes.clientId))
            .where(donde).orderBy(facturasRecurrentes.proximaEmision).limit(limite),
          db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${facturasRecurrentes.totalEstimado}),0)` })
            .from(facturasRecurrentes).where(donde),
        ]);
        anotar('Facturas recurrentes', estado ?? 'todas');
        return {
          coinciden: Number(tot?.n ?? 0), totalEstimadoPorCiclo: pesos(Number(tot?.total ?? 0)),
          recurrentes: filas.map((r) => ({
            nombre: r.nombre, cliente: r.cliente, frecuencia: r.frecuencia, proximaEmision: r.proxima,
            estado: r.estado, totalEstimado: pesos(r.total), facturasEmitidas: r.emitidas,
          })),
        };
      },
    }),
  };
}

// ── Contabilidad ────────────────────────────────────────────────────────────

export function herramientasContabilidad(teamId: number, anotar: Anotar) {
  return {
    libro_diario: tool({
      description:
        'Asientos del libro diario en un período: fecha, concepto, origen (manual, factura, nómina…) y total. ' +
        'Con un asiento puntual se ven sus líneas (cuenta, debe y haber).',
      inputSchema: z.object({
        desde: fecha.optional(), hasta: fecha.optional(),
        q: z.string().max(80).optional().describe('Texto del concepto'),
        origen: z.string().max(20).optional().describe('manual, factura, pago, compra, nomina…'),
        conLineas: z.boolean().default(false).describe('Incluir el detalle debe/haber de cada asiento (máx. 5 asientos)'),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ desde, hasta, q, origen, conLineas, limite }) => {
        const cond = [eq(contabilidadAsientos.teamId, teamId)];
        if (desde) cond.push(sql`${contabilidadAsientos.fecha} >= ${desde}`);
        if (hasta) cond.push(sql`${contabilidadAsientos.fecha} <= ${hasta}`);
        if (origen) cond.push(eq(contabilidadAsientos.origenTipo, origen));
        if (q?.trim()) cond.push(contiene(contabilidadAsientos.concepto, q.trim()));
        const donde = and(...cond);
        const [filas, [tot]] = await Promise.all([
          db.select({
            id: contabilidadAsientos.id, fecha: contabilidadAsientos.fecha, concepto: contabilidadAsientos.concepto,
            origen: contabilidadAsientos.origenTipo, total: contabilidadAsientos.totalCents,
          }).from(contabilidadAsientos).where(donde)
            .orderBy(desc(contabilidadAsientos.fecha), desc(contabilidadAsientos.id)).limit(limite),
          db.select({ n: sql<number>`count(*)::int` }).from(contabilidadAsientos).where(donde),
        ]);
        let lineas: Record<number, { cuenta: string; debe: number; haber: number }[]> = {};
        if (conLineas && filas.length) {
          const ids = filas.slice(0, 5).map((f) => f.id);
          const ls = await db.select({
            asientoId: contabilidadAsientoLineas.asientoId, codigo: contabilidadCuentas.codigo, nombre: contabilidadCuentas.nombre,
            debe: contabilidadAsientoLineas.debeCents, haber: contabilidadAsientoLineas.haberCents,
          }).from(contabilidadAsientoLineas)
            .innerJoin(contabilidadCuentas, eq(contabilidadCuentas.id, contabilidadAsientoLineas.cuentaId))
            .where(and(eq(contabilidadAsientoLineas.teamId, teamId), inArray(contabilidadAsientoLineas.asientoId, ids)))
            .orderBy(contabilidadAsientoLineas.orden);
          lineas = ls.reduce<typeof lineas>((acc, l) => {
            (acc[l.asientoId] ??= []).push({ cuenta: `${l.codigo} ${l.nombre}`, debe: pesos(l.debe), haber: pesos(l.haber) });
            return acc;
          }, {});
        }
        anotar('Libro diario', [desde, hasta, origen, q].filter(Boolean).join(' · ') || 'recientes');
        return {
          coinciden: Number(tot?.n ?? 0),
          asientos: filas.map((a) => ({
            fecha: a.fecha, concepto: a.concepto, origen: a.origen, total: pesos(a.total),
            ...(lineas[a.id] ? { lineas: lineas[a.id] } : {}),
          })),
        };
      },
    }),

    catalogo_cuentas: tool({
      description: 'Busca cuentas del catálogo contable por nombre o código (tipo, naturaleza, si se puede imputar).',
      inputSchema: z.object({ q: z.string().min(1).max(60), limite: z.number().int().min(1).max(MAX).default(10) }),
      execute: async ({ q, limite }) => {
        const filas = await db.select({
          codigo: contabilidadCuentas.codigo, nombre: contabilidadCuentas.nombre, tipo: contabilidadCuentas.tipo,
          naturaleza: contabilidadCuentas.naturaleza, imputable: contabilidadCuentas.imputable, activa: contabilidadCuentas.activa,
        }).from(contabilidadCuentas)
          .where(and(
            eq(contabilidadCuentas.teamId, teamId),
            sql`(${contiene(contabilidadCuentas.nombre, q.trim())} OR ${contiene(contabilidadCuentas.codigo, q.trim())})`,
          ))
          .orderBy(contabilidadCuentas.codigo).limit(limite);
        anotar('Catálogo de cuentas', q);
        return { encontradas: filas.length, cuentas: filas };
      },
    }),
  };
}

// ── Escolar ─────────────────────────────────────────────────────────────────

export function herramientasEscolar(teamId: number, anotar: Anotar) {
  return {
    buscar_estudiantes: tool({
      description: 'Busca estudiantes por nombre o código y dice su estado y el curso en que están matriculados.',
      inputSchema: z.object({
        q: z.string().min(2).max(60),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ q, limite }) => {
        const nombre = sql`(${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos})`;
        const filas = await db.select({
          nombre: sql<string>`${nombre}`, codigo: adminEscolarEstudiantes.codigo, estado: adminEscolarEstudiantes.estado,
          curso: adminEscolarCursos.nombre, periodo: adminEscolarPeriodos.nombre, matricula: adminEscolarMatriculas.estado,
        }).from(adminEscolarEstudiantes)
          .leftJoin(adminEscolarMatriculas, and(
            eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
            eq(adminEscolarMatriculas.estado, 'activa'),
          ))
          .leftJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
          .leftJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
          .where(and(
            eq(adminEscolarEstudiantes.teamId, teamId),
            sql`(${contiene(nombre, q.trim())} OR ${contiene(adminEscolarEstudiantes.codigo, q.trim())})`,
          ))
          .orderBy(adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres).limit(limite);
        anotar('Estudiantes', q);
        return { encontrados: filas.length, estudiantes: filas };
      },
    }),

    resumen_matriculas: tool({
      description: 'Cuántos estudiantes hay matriculados por curso (matrículas activas) y el total.',
      inputSchema: z.object({ periodo: z.string().max(60).optional().describe('Nombre del período, ej. 2026-2027. Si falta, los activos.') }),
      execute: async ({ periodo }) => {
        const cond = [eq(adminEscolarMatriculas.teamId, teamId), eq(adminEscolarMatriculas.estado, 'activa')];
        if (periodo?.trim()) cond.push(contiene(adminEscolarPeriodos.nombre, periodo.trim()));
        else cond.push(eq(adminEscolarPeriodos.activo, true));
        const filas = await db.select({
          periodo: adminEscolarPeriodos.nombre, curso: adminEscolarCursos.nombre, n: sql<number>`count(*)::int`,
        }).from(adminEscolarMatriculas)
          .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
          .innerJoin(adminEscolarPeriodos, eq(adminEscolarPeriodos.id, adminEscolarMatriculas.periodoId))
          .where(and(...cond))
          .groupBy(adminEscolarPeriodos.nombre, adminEscolarCursos.nombre, adminEscolarCursos.orden)
          .orderBy(adminEscolarPeriodos.nombre, adminEscolarCursos.orden, adminEscolarCursos.nombre);
        anotar('Matrículas', periodo ?? 'períodos activos');
        return {
          totalMatriculados: filas.reduce((s, f) => s + Number(f.n), 0),
          porCurso: filas.slice(0, 60).map((f) => ({ periodo: f.periodo, curso: f.curso, estudiantes: Number(f.n) })),
        };
      },
    }),
  };
}

// ── Nómina ──────────────────────────────────────────────────────────────────

export function herramientasNomina(teamId: number, anotar: Anotar) {
  return {
    resumen_nomina: tool({
      description: 'Empleados activos, costo mensual base y las últimas corridas de nómina con su estado y neto.',
      inputSchema: z.object({ corridas: z.number().int().min(1).max(12).default(3) }),
      execute: async ({ corridas }) => {
        const [[emp], filas] = await Promise.all([
          db.select({
            activos: sql<number>`count(*) filter (where ${empleados.estado} = 'activo')::int`,
            salarios: sql<number>`coalesce(sum(${empleados.salarioBaseCents}) filter (where ${empleados.estado} = 'activo'), 0)`,
          }).from(empleados).where(eq(empleados.teamId, teamId)),
          db.select({
            periodo: nominaCorridas.periodo, descripcion: nominaCorridas.descripcion, estado: nominaCorridas.estado,
            bruto: nominaCorridas.totalBrutoCents, neto: nominaCorridas.totalNetoCents, patronal: nominaCorridas.totalPatronalCents,
            pago: nominaCorridas.fechaPago,
          }).from(nominaCorridas).where(eq(nominaCorridas.teamId, teamId))
            .orderBy(desc(nominaCorridas.fechaFin), desc(nominaCorridas.id)).limit(corridas),
        ]);
        anotar('Resumen de nómina', `${corridas} corridas`);
        return {
          empleadosActivos: Number(emp?.activos ?? 0),
          salariosBaseMensuales: pesos(Number(emp?.salarios ?? 0)),
          ultimasCorridas: filas.map((c) => ({
            periodo: c.periodo, descripcion: c.descripcion, estado: c.estado,
            bruto: pesos(c.bruto), neto: pesos(c.neto), aportePatronal: pesos(c.patronal), fechaPago: c.pago,
          })),
        };
      },
    }),

    buscar_empleados: tool({
      description: 'Busca empleados por nombre o cargo: cargo, tipo de contrato, estado y fecha de ingreso (sin cédula ni cuentas).',
      inputSchema: z.object({
        q: z.string().max(60).optional(),
        estado: z.enum(['activo', 'inactivo', 'liquidado']).optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ q, estado, limite }) => {
        const cond = [eq(empleados.teamId, teamId)];
        if (estado) cond.push(eq(empleados.estado, estado));
        if (q?.trim()) {
          const t = q.trim();
          cond.push(sql`(${contiene(sql`(${empleados.nombres} || ' ' || ${empleados.apellidos})`, t)} OR ${contiene(empleados.cargo, t)})`);
        }
        const filas = await db.select({
          nombre: sql<string>`${empleados.nombres} || ' ' || ${empleados.apellidos}`, cargo: empleados.cargo,
          contrato: empleados.tipoContrato, estado: empleados.estado, ingreso: empleados.fechaIngreso,
          frecuencia: empleados.frecuenciaPago,
        }).from(empleados).where(and(...cond)).orderBy(empleados.apellidos).limit(limite);
        anotar('Empleados', q ?? estado ?? 'todos');
        return { encontrados: filas.length, empleados: filas };
      },
    }),
  };
}

// ── Punto de venta ──────────────────────────────────────────────────────────

export function herramientasPos(teamId: number, anotar: Anotar) {
  return {
    turnos_caja: tool({
      description: 'Turnos de caja: quién los abrió, apertura, estado, efectivo contado y diferencia. Para «cómo va la caja», «quién tiene turno abierto».',
      inputSchema: z.object({
        estado: z.enum(['ABIERTO', 'CIERRE_SOLICITADO', 'CERRADO']).optional(),
        limite: z.number().int().min(1).max(MAX).default(10),
      }),
      execute: async ({ estado, limite }) => {
        const cond = [eq(cajaTurnos.teamId, teamId)];
        if (estado) cond.push(eq(cajaTurnos.estado, estado));
        const filas = await db.select({
          cajero: users.name, estado: cajaTurnos.estado, apertura: cajaTurnos.aperturaAt,
          montoApertura: cajaTurnos.montoAperturaCentavos, contado: cajaTurnos.efectivoContadoCentavos,
          esperado: cajaTurnos.montoEsperadoCentavos, diferencia: cajaTurnos.diferenciaCentavos,
        }).from(cajaTurnos)
          .innerJoin(users, eq(users.id, cajaTurnos.usuarioId))
          .where(and(...cond)).orderBy(desc(cajaTurnos.aperturaAt)).limit(limite);
        anotar('Turnos de caja', estado ?? 'recientes');
        return {
          turnos: filas.map((t) => ({
            cajero: t.cajero, estado: t.estado, apertura: t.apertura?.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }),
            montoApertura: pesos(t.montoApertura),
            efectivoContado: t.contado != null ? pesos(t.contado) : null,
            esperado: t.esperado != null ? pesos(t.esperado) : null,
            diferencia: t.diferencia != null ? pesos(t.diferencia) : null,
          })),
        };
      },
    }),
  };
}
