import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarMatriculas, adminEscolarConceptosPago } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { and, eq, isNull } from 'drizzle-orm';
import { planesVinculablesParaMatricula, planEsVinculable } from '@/lib/administracion-escolar/plan-existente';

/**
 * Vincular una matrícula a un plan de facturación recurrente que YA existe
 * (a diferencia de "Configurar mensualidad", que crea uno nuevo).
 *
 * Resuelve el caso de un colegio migrado a gobernanza con planes recurrentes
 * previos, sueltos: sin este enlace, gobernanza devenga la deuda y el plan emite
 * su factura por separado = doble cobro. Al vincular, `reflejarFacturaRecurrenteEnCargo`
 * pega la factura del plan al cargo del mes y `mesYaFacturadoAMano` evita duplicar.
 *
 * GET  → planes existentes que se pueden vincular a esta matrícula.
 * POST → { facturaRecurrenteId, conceptoId } vincula el plan elegido.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const matriculaId = parseInt((await params).id, 10);
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'Matrícula no válida' }, { status: 400 });
  }
  const [planes, conceptos] = await Promise.all([
    planesVinculablesParaMatricula(teamId, matriculaId),
    db.select({ id: adminEscolarConceptosPago.id, nombre: adminEscolarConceptosPago.nombre })
      .from(adminEscolarConceptosPago)
      .where(and(
        eq(adminEscolarConceptosPago.teamId, teamId),
        eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
        eq(adminEscolarConceptosPago.activo, true),
      )),
  ]);
  return NextResponse.json({ planes, conceptos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const matriculaId = parseInt((await params).id, 10);
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'Matrícula no válida' }, { status: 400 });
  }

  const { facturaRecurrenteId, conceptoId } = await req.json().catch(() => ({}));
  if (!Number.isInteger(facturaRecurrenteId) || !Number.isInteger(conceptoId)) {
    return NextResponse.json({ error: 'Falta facturaRecurrenteId o conceptoId' }, { status: 400 });
  }

  // El concepto debe ser una mensualidad activa del team: es el que el devengo y
  // el reflejo usan para encontrar el cargo del mes.
  const [concepto] = await db
    .select({ id: adminEscolarConceptosPago.id })
    .from(adminEscolarConceptosPago)
    .where(and(
      eq(adminEscolarConceptosPago.id, conceptoId),
      eq(adminEscolarConceptosPago.teamId, teamId),
      eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
      eq(adminEscolarConceptosPago.activo, true),
    ))
    .limit(1);
  if (!concepto) {
    return NextResponse.json({ error: 'El concepto no es una mensualidad válida del colegio' }, { status: 422 });
  }

  const vinc = await planEsVinculable(teamId, matriculaId, facturaRecurrenteId);
  if (!vinc.ok) return NextResponse.json({ error: vinc.error }, { status: vinc.status });

  // Enlace con candado: solo si sigue sin vincular (dos clics no la ligan dos veces).
  const res = await db.update(adminEscolarMatriculas)
    .set({ facturaRecurrenteId, conceptoMensualidadId: conceptoId, updatedAt: new Date() })
    .where(and(
      eq(adminEscolarMatriculas.id, matriculaId),
      eq(adminEscolarMatriculas.teamId, teamId),
      isNull(adminEscolarMatriculas.facturaRecurrenteId),
    ))
    .returning({ id: adminEscolarMatriculas.id, facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId });

  if (res.length === 0) {
    return NextResponse.json({ error: 'La matrícula ya tenía un plan vinculado' }, { status: 409 });
  }
  return NextResponse.json({ matricula: res[0] });
}
