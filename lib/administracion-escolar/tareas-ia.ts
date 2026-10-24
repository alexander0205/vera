/**
 * lib/administracion-escolar/tareas-ia.ts — Zero AI revisa los cargos y las
 * facturas del colegio y abre una tarea por cada cosa que alguien tiene que
 * decidir.
 *
 * No es un modelo de lenguaje: son las revisiones que se hacían a mano con el
 * colegio (Mi Casita, octubre 2026), escritas como consultas. Cada hallazgo
 * tiene su llave (`origen_clave`), así que revisar dos veces no repite tareas,
 * y una tarea que alguien ya completó no vuelve a abrirse. Qué dice cada tarea
 * está en `tareas-reglas.ts`, donde lo prueba vitest.
 *
 * Las tareas van al Propietario del colegio, que es quien decide qué se hace
 * con el dinero; si no tiene uno, a Soporte IT.
 */
import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { avisarResumenIa, crearTarea, familiaDe } from './tareas';
import {
  AUTOR_ZERO_AI, hallazgoCargoRepetido, hallazgoFacturaMenor, hallazgoPagoDeMas, type Hallazgo,
} from './tareas-reglas';

type Fila = Record<string, unknown>;
const filas = async (q: ReturnType<typeof sql>) => {
  const r = await db.execute(q) as unknown as { rows?: Fila[] } | Fila[];
  return (Array.isArray(r) ? r : (r.rows ?? []));
};
const n = (v: unknown) => Number(v);
const t = (v: unknown) => (v == null ? null : String(v));

/** Todo lo que encuentra hoy en el colegio, sin abrir nada. */
export async function buscarHallazgos(teamId: number): Promise<Hallazgo[]> {
  const pagosDeMas = await filas(sql`
    SELECT c.id, c.estudiante_id, c.monto_centavos, c.ecf_document_id, coalesce(d.codigo, d.encf) AS factura
    FROM admin_escolar_cargos c
    JOIN admin_escolar_conceptos_pago cp ON cp.id = c.concepto_id
    LEFT JOIN ecf_documents d ON d.id = c.ecf_document_id
    WHERE c.team_id = ${teamId} AND c.estado <> 'anulado' AND cp.nombre ILIKE 'pago de m_s%'
    ORDER BY c.id`);

  // Mismo alumno, mismo concepto, mismo mes, más de un cargo vivo.
  const repetidos = await filas(sql`
    SELECT c.estudiante_id, c.concepto_id, cp.nombre AS concepto, c.anio, c.mes,
           json_agg(json_build_object(
             'id', c.id, 'montoCentavos', c.monto_centavos, 'estado', c.estado,
             'factura', coalesce(d.codigo, d.encf), 'ecfDocumentId', c.ecf_document_id
           ) ORDER BY c.id) AS cargos
    FROM admin_escolar_cargos c
    JOIN admin_escolar_conceptos_pago cp ON cp.id = c.concepto_id
    LEFT JOIN ecf_documents d ON d.id = c.ecf_document_id AND d.estado <> 'ANULADO'
    WHERE c.team_id = ${teamId} AND c.estado <> 'anulado' AND c.mes IS NOT NULL
    GROUP BY c.estudiante_id, c.concepto_id, cp.nombre, c.anio, c.mes
    HAVING count(*) > 1`);

  // Un mes cuya factura (solo de ese cargo) es menor que el cargo y el cargo
  // sigue sin saldar. Las facturas de varios cargos no se miran: ahí la
  // diferencia puede ser de otra línea y la tarea sería ruido.
  const menores = await filas(sql`
    SELECT c.id, c.estudiante_id, cp.nombre AS concepto, c.anio, c.mes, c.monto_centavos,
           d.monto_total, coalesce(d.codigo, d.encf) AS factura, d.id AS ecf_document_id
    FROM admin_escolar_cargos c
    JOIN admin_escolar_conceptos_pago cp ON cp.id = c.concepto_id
    JOIN ecf_documents d ON d.id = c.ecf_document_id
    WHERE c.team_id = ${teamId} AND c.estado NOT IN ('anulado', 'pagado') AND c.mes IS NOT NULL
      AND d.estado <> 'ANULADO' AND d.monto_total < c.monto_centavos
      AND (SELECT count(*) FROM admin_escolar_cargos c2
           WHERE c2.ecf_document_id = d.id AND c2.estado <> 'anulado') = 1`);

  return [
    ...pagosDeMas.map((r) => hallazgoPagoDeMas({
      cargoId: n(r.id), estudianteId: n(r.estudiante_id), montoCentavos: n(r.monto_centavos),
      factura: t(r.factura), ecfDocumentId: r.ecf_document_id == null ? null : n(r.ecf_document_id),
    })),
    ...repetidos.map((r) => hallazgoCargoRepetido({
      estudianteId: n(r.estudiante_id), conceptoId: n(r.concepto_id), concepto: String(r.concepto),
      anio: n(r.anio), mes: n(r.mes),
      cargos: (r.cargos as { id: number; montoCentavos: number; estado: string; factura: string | null; ecfDocumentId: number | null }[]),
    })),
    ...menores.map((r) => hallazgoFacturaMenor({
      cargoId: n(r.id), estudianteId: n(r.estudiante_id), concepto: String(r.concepto), anio: n(r.anio), mes: n(r.mes),
      cargoCentavos: n(r.monto_centavos), facturaCentavos: n(r.monto_total), factura: String(r.factura),
      ecfDocumentId: n(r.ecf_document_id),
    })),
  ];
}

/** A quién van las tareas de Zero AI: el Propietario del colegio (no el equipo de Zero). */
async function propietario(teamId: number): Promise<{ id: number; nombre: string } | null> {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(
      eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner'),
      isNull(users.deletedAt), sql`coalesce(${users.platformRole}, '') <> 'admin'`,
    ))
    .orderBy(asc(teamMembers.joinedAt))
    .limit(1);
  return u ? { id: u.id, nombre: u.name?.trim() || u.email } : null;
}

/**
 * Revisa el colegio y abre las tareas nuevas. Devuelve cuántas cosas encontró
 * y cuántas tareas abrió (las demás ya existían). A quien le tocan le llega un
 * solo correo con todas, no uno por tarea.
 */
export async function revisarConZeroAi(teamId: number): Promise<{ encontradas: number; nuevas: number }> {
  const hallazgos = await buscarHallazgos(teamId);
  if (hallazgos.length === 0) return { encontradas: 0, nuevas: 0 };
  const duenio = await propietario(teamId);
  const nuevas: { id: number; titulo: string }[] = [];
  for (const h of hallazgos) {
    const fam = await familiaDe(teamId, h.estudianteId);
    if (!fam) continue;
    const id = await crearTarea(teamId, fam, AUTOR_ZERO_AI, {
      alcance: 'alumno', titulo: h.titulo, descripcion: h.descripcion,
      asignadaA: duenio ? 'persona' : 'soporte', asignadaUserId: duenio?.id ?? null,
      ecfDocumentId: h.ecfDocumentId, venceEl: null,
    }, duenio?.nombre ?? null, { origenClave: h.clave, cargoId: h.cargoId });
    if (id) nuevas.push({ id, titulo: h.titulo });
  }
  if (nuevas.length > 0) await avisarResumenIa(teamId, duenio?.id ?? null, nuevas);
  return { encontradas: hallazgos.length, nuevas: nuevas.length };
}
