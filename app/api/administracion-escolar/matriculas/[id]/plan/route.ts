import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarMatriculas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { cargarPlan } from '@/lib/administracion-escolar/plan-matricula';

/**
 * Lo que ESTA matrícula va a deber en el año, cuota por cuota.
 *
 * Va aparte de `matriculas/plan-cobro`, que sirve a la pantalla de matriculación
 * y recibe la sección y la beca sueltas porque todavía no existe ninguna fila.
 * Aquí la matrícula ya existe, así que sus datos —beca, fecha de inscripción y
 * los conceptos que la secretaria marcó— se leen de ella y no viajan por la URL.
 *
 * Es la MISMA fuente que usa el devengo. Esa es la gracia: la ficha del alumno
 * puede enseñar los meses que aún no son deuda sabiendo que, cuando lleguen,
 * van a salir con estos importes y estas fechas. Si se calculara aparte, la
 * pantalla y la cartera se separarían el día que cambie una regla.
 *
 * El GET solo lee. El POST es el que aterriza UNA cuota antes de tiempo.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const cargado = await cargarPlan(auth.teamId, parseInt(id));
  if (!cargado) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  return NextResponse.json({
    lineas: cargado.lineas,
    // En una matrícula retirada el plan sigue existiendo pero no va a
    // convertirse en deuda, y enseñarlo como previsto sería prometer una
    // factura que no va a salir.
    devenga: cargado.devenga,
  });
}

/**
 * Aterriza UNA cuota prevista antes de que le toque.
 *
 *   accion: 'adelantar' → nace el cargo pendiente y ya se puede facturar/cobrar.
 *                         Es el padre que llega en septiembre a pagar el año.
 *   accion: 'omitir'    → nace anulado. A este alumno no se le va a cobrar esa
 *                         cuota (beca puntual, un mes que no asistió).
 *
 * Las dos hacen lo mismo por debajo, y no por casualidad: el índice único
 * `(matricula_id, cuota_id)` es lo que impide que el devengo mensual vuelva a
 * crearla. Un cargo anulado no suma en ninguna cuenta, así que "omitir" es
 * gastar la cuota sin cobrarla — con rastro, que es lo que se perdería si en
 * vez de esto se guardara una lista de exclusiones aparte.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const matriculaId = parseInt(id);

  const body = await req.json().catch(() => ({}));
  const cuotaId = Number(body.cuotaId);
  const conceptoId = Number(body.conceptoId);
  const accion = String(body.accion ?? '');
  if (accion !== 'adelantar' && accion !== 'omitir') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }
  if (!Number.isInteger(cuotaId) || cuotaId <= 0) {
    return NextResponse.json({ error: 'cuotaId inválido' }, { status: 400 });
  }

  const cargado = await cargarPlan(auth.teamId, matriculaId);
  if (!cargado) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  // La cuota tiene que salir del plan de ESTA matrícula. Sin esto, el id de una
  // cuota de otro colegio crearía un cargo con el monto que trajera el cuerpo.
  const linea = cargado.lineas.find((l) => l.conceptoId === conceptoId);
  const cuota = linea?.cuotas.find((c) => c.cuotaId === cuotaId && !c.omitida);
  if (!linea || !cuota) {
    return NextResponse.json({ error: 'Esa cuota no está en el plan de esta matrícula' }, { status: 404 });
  }

  const [creado] = await db
    .insert(adminEscolarCargos)
    .values({
      teamId: auth.teamId,
      estudianteId: cargado.estudianteId,
      matriculaId,
      periodoId: cargado.periodoId,
      conceptoId: linea.conceptoId,
      cuotaId: cuota.cuotaId,
      mes: cuota.mes,
      anio: Number(cuota.fechaEmision.slice(0, 4)),
      montoCentavos: cuota.montoCentavos,
      saldoCentavos: accion === 'omitir' ? 0 : cuota.montoCentavos,
      fechaVencimiento: cuota.fechaVencimiento,
      estado: accion === 'omitir' ? 'anulado' : 'pendiente',
    })
    // Si el devengo ganó la carrera mientras el usuario decidía, la cuota ya es
    // un cargo y no hay nada que hacer.
    .onConflictDoNothing()
    .returning({ id: adminEscolarCargos.id });

  if (!creado) {
    return NextResponse.json({ error: 'Esa cuota ya tiene un cargo' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, cargoId: creado.id }, { status: 201 });
}
