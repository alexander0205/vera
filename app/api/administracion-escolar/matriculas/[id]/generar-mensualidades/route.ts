import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarMatriculas, facturasRecurrentes,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';

/**
 * Crea las cuotas de mensualidad de ESTE alumno, alineadas al calendario de su
 * factura recurrente, a su tarifa —que incluye el monto propio—. Es lo que
 * dispara «Guardar mensualidad»: al fijar el precio, Cuentas por cobrar se llena
 * sola, sin ir mes por mes.
 *
 * Se usan los meses del RECURRENTE y no los del período a propósito. El período
 * puede empezar en agosto, mes sin colegiatura; el recurrente arranca en
 * septiembre. Alinearse al recurrente evita que nazca un agosto que nadie cobra,
 * y hace que lo que se ve sea EXACTAMENTE lo que emitirá el cron el día de cobro.
 *
 * Idempotente: salta los meses que ya tienen cuota de mensualidad, así que
 * volver a guardar no duplica. No emite facturas —solo deja la deuda pendiente—;
 * el recurrente la factura a su fecha y la engancha.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const matriculaId = parseInt(id);
  if (!Number.isInteger(matriculaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [mat] = await db
    .select({
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodoId:    adminEscolarMatriculas.periodoId,
      conceptoId:   adminEscolarMatriculas.conceptoMensualidadId,
      frId:         adminEscolarMatriculas.facturaRecurrenteId,
    })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!mat) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  // Sin mensualidad recurrente configurada no hay calendario al que alinear: no
  // se inventa uno. Guardar el precio sigue valiendo; solo no se crea deuda.
  if (!mat.conceptoId || !mat.frId) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }

  const [fr] = await db
    .select({ fechaInicio: facturasRecurrentes.fechaInicio, fechaFin: facturasRecurrentes.fechaFin })
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, mat.frId), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);
  if (!fr?.fechaInicio || !fr.fechaFin) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }

  // Meses del recurrente: de su fecha de inicio a su fecha de fin, inclusive.
  const [ai, mi] = fr.fechaInicio.split('-').map(Number);
  const [af, mf] = fr.fechaFin.split('-').map(Number);
  const desde = ai * 12 + (mi - 1);
  const hasta = af * 12 + (mf - 1);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }
  const meses: { mes: number; anio: number }[] = [];
  for (let idx = desde; idx <= hasta; idx++) {
    meses.push({ anio: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  }

  // Cuotas de mensualidad que ya existen, para no duplicar.
  const existentes = await db
    .select({ mes: adminEscolarCargos.mes, anio: adminEscolarCargos.anio })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.matriculaId, matriculaId),
      eq(adminEscolarCargos.conceptoId, mat.conceptoId),
      eq(adminEscolarCargos.teamId, teamId),
    ));
  const ya = new Set(existentes.filter((c) => c.mes != null).map((c) => `${c.anio}-${c.mes}`));

  // El monto sale del resolvedor de tarifas: aplica el monto propio del alumno
  // (o su descuento), igual que el devengo y que el recurrente. Nunca se teclea.
  const tarifa = await resolverTarifa(teamId, matriculaId, mat.conceptoId);
  if (!tarifa) {
    return NextResponse.json(
      { error: 'La mensualidad no tiene una tarifa que aplicar a este alumno.' },
      { status: 422 },
    );
  }

  const nuevos = meses.filter((m) => !ya.has(`${m.anio}-${m.mes}`));
  if (nuevos.length > 0) {
    await db.insert(adminEscolarCargos).values(nuevos.map((m) => ({
      teamId,
      estudianteId: mat.estudianteId,
      matriculaId,
      periodoId: mat.periodoId,
      conceptoId: mat.conceptoId!,
      mes: m.mes,
      anio: m.anio,
      montoCentavos: tarifa.montoCentavos,
      saldoCentavos: tarifa.montoCentavos,
      fechaVencimiento: `${m.anio}-${String(m.mes).padStart(2, '0')}-05`,
      estado: 'pendiente',
    })));
  }

  return NextResponse.json({ cargosCreados: nuevos.length, monto: tarifa.montoCentavos });
}
