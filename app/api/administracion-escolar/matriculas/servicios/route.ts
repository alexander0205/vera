/**
 * «Servicios por alumno»: la cuadrícula alumnos × conceptos de las matrículas
 * activas del año, para cambiar por lote qué cobra cada una.
 *
 *   GET  ?periodoId=N   → conceptos, paquetes y una fila por matrícula activa
 *   POST { periodoId, cambios: [{ matriculaId, agregar[], quitar[] }], anularSinFacturar }
 *
 * Agregar un concepto lo pone en el plan de la matrícula y crea ya las cuotas
 * cuya fecha llegó (el mismo devengo que «Asignar a estudiantes»); las demás
 * las crea el cron cuando les toque. Quitarlo saca el concepto del plan, y con
 * `anularSinFacturar` anula además sus cargos que nadie ha facturado ni pagado:
 * quitarle el almuerzo a quien nunca lo usó no debe dejarle agosto debiendo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarConceptosPago, adminEscolarMatriculas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerServiciosAlumnos } from '@/lib/administracion-escolar/servicios-alumnos-datos';
import { devengarPeriodo } from '@/lib/administracion-escolar/devengar';
import { conceptosTrasCambio, validarCambios } from '@/lib/administracion-escolar/servicios-alumnos';
import { logAudit } from '@/lib/audit';
import { hoyRD } from '@/lib/utils/format';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const pedido = Number(new URL(req.url).searchParams.get('periodoId')) || 0;
  return NextResponse.json(await leerServiciosAlumnos(auth.teamId, pedido));
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;
  const body = await req.json().catch(() => ({}));
  const periodoId = Number(body.periodoId);
  if (!Number.isInteger(periodoId) || periodoId <= 0) return NextResponse.json({ error: 'Falta el año escolar.' }, { status: 400 });
  const v = validarCambios(body.cambios);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const anularSinFacturar = body.anularSinFacturar !== false;

  // Los conceptos que se agregan tienen que ser de este colegio.
  const pedidos = [...new Set(v.cambios.flatMap((c) => c.agregar))];
  if (pedidos.length > 0) {
    const existen = await db.select({ id: adminEscolarConceptosPago.id }).from(adminEscolarConceptosPago)
      .where(and(eq(adminEscolarConceptosPago.teamId, teamId), inArray(adminEscolarConceptosPago.id, pedidos)));
    if (existen.length !== pedidos.length) return NextResponse.json({ error: 'Alguno de los conceptos no es de este colegio.' }, { status: 400 });
  }

  const resultados: { matriculaId: number; ok: boolean; error?: string; anulados?: number }[] = [];
  const conAgregados: number[] = [];

  for (const cambio of v.cambios) {
    try {
      const r = await db.transaction(async (tx) => {
        const [actual] = await tx.select({ conceptosIds: adminEscolarMatriculas.conceptosIds, estado: adminEscolarMatriculas.estado })
          .from(adminEscolarMatriculas)
          .where(and(
            eq(adminEscolarMatriculas.id, cambio.matriculaId),
            eq(adminEscolarMatriculas.teamId, teamId),
            eq(adminEscolarMatriculas.periodoId, periodoId),
          ))
          .for('update').limit(1);
        if (!actual) return { ok: false, error: 'La matrícula no es de este año escolar.' };
        if (actual.estado !== 'activa') return { ok: false, error: 'La matrícula no está activa.' };
        const antes = (actual.conceptosIds ?? []).map(Number);
        const despues = conceptosTrasCambio(antes, cambio);
        // Igual que «Editar matrícula»: no se deja una matrícula sin ningún
        // cobro de golpe. Para eso está darla de baja, que deja constancia.
        if (despues.length === 0 && antes.length > 0) {
          return { ok: false, error: 'No se puede dejar sin ningún concepto: da de baja la matrícula.' };
        }
        await tx.update(adminEscolarMatriculas)
          .set({ conceptosIds: despues, updatedAt: new Date() })
          .where(and(eq(adminEscolarMatriculas.id, cambio.matriculaId), eq(adminEscolarMatriculas.teamId, teamId)));

        let anulados = 0;
        const quitados = antes.filter((id) => !despues.includes(id));
        if (anularSinFacturar && quitados.length > 0) {
          // Solo lo que nadie tocó: sin factura, sin abonos y no anulado.
          const filas = await tx.update(adminEscolarCargos)
            .set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })
            .where(and(
              eq(adminEscolarCargos.teamId, teamId),
              eq(adminEscolarCargos.matriculaId, cambio.matriculaId),
              inArray(adminEscolarCargos.conceptoId, quitados),
              isNull(adminEscolarCargos.ecfDocumentId),
              ne(adminEscolarCargos.estado, 'anulado'),
              sql`${adminEscolarCargos.saldoCentavos} = ${adminEscolarCargos.montoCentavos}`,
            ))
            .returning({ id: adminEscolarCargos.id });
          anulados = filas.length;
        }
        return { ok: true, anulados, antes, despues };
      });
      resultados.push({ matriculaId: cambio.matriculaId, ok: r.ok, error: r.ok ? undefined : r.error, anulados: r.ok ? r.anulados : undefined });
      if (r.ok) {
        if (cambio.agregar.length > 0) conAgregados.push(cambio.matriculaId);
        logAudit({
          teamId, userId: user.id, actor: user.email, action: 'ESCOLAR_CONCEPTOS_LOTE',
          resource: `matricula:${cambio.matriculaId}`,
          meta: { agregar: cambio.agregar, quitar: cambio.quitar, anulados: r.anulados },
        });
      }
    } catch (e) {
      console.error('[servicios-alumnos] no se pudo guardar', cambio.matriculaId, e);
      resultados.push({ matriculaId: cambio.matriculaId, ok: false, error: 'No se pudo guardar.' });
    }
  }

  // Lo agregado cobra ya lo que tiene fecha alcanzada; lo demás, el cron.
  let cargosCreados = 0;
  let devengoPendiente = false;
  if (conAgregados.length > 0) {
    try {
      const d = await devengarPeriodo(teamId, periodoId, hoyRD(), false, {
        soloMatriculas: conAgregados,
        soloConceptos: [...new Set(v.cambios.filter((c) => conAgregados.includes(c.matriculaId)).flatMap((c) => c.agregar))],
      });
      cargosCreados = d.cargosCreados;
    } catch (e) {
      console.error('[servicios-alumnos] devengo', e);
      devengoPendiente = true;
    }
  }

  return NextResponse.json({
    guardados: resultados.filter((r) => r.ok).length,
    conError: resultados.filter((r) => !r.ok),
    anulados: resultados.reduce((s, r) => s + (r.anulados ?? 0), 0),
    cargosCreados,
    devengoPendiente,
  });
}
