/**
 * GET  /api/facturas-recurrentes        — Lista facturas recurrentes del equipo (con paginación)
 * POST /api/facturas-recurrentes        — Crea una nueva factura recurrente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  facturasRecurrentes, clients,
  adminEscolarMatriculas, adminEscolarPeriodos, adminEscolarConceptosPago,
  adminEscolarEstudiantes,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { esTipoEcfRecurrenteValido, esTipoVentaFiscal } from '@/lib/ecf/categorias';
import { getAmbienteTenant, mensajeAmbienteNoProduccion } from '@/lib/ecf-api/ambiente';

// GET /api/facturas-recurrentes?page=1&limit=50
export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const page  = parseInt(req.nextUrl.searchParams.get('page')  ?? '1');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50');
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id:               facturasRecurrentes.id,
      nombre:           facturasRecurrentes.nombre,
      descripcion:      facturasRecurrentes.descripcion,
      tipoEcf:          facturasRecurrentes.tipoEcf,
      tipoPago:         facturasRecurrentes.tipoPago,
      diasParaPago:     facturasRecurrentes.diasParaPago,
      frecuencia:       facturasRecurrentes.frecuencia,
      diaCobro:         facturasRecurrentes.diaCobro,
      fechaInicio:      facturasRecurrentes.fechaInicio,
      fechaFin:         facturasRecurrentes.fechaFin,
      proximaEmision:   facturasRecurrentes.proximaEmision,
      estado:           facturasRecurrentes.estado,
      totalEstimado:    facturasRecurrentes.totalEstimado,
      facturasEmitidas: facturasRecurrentes.facturasEmitidas,
      notas:            facturasRecurrentes.notas,
      clientId:         facturasRecurrentes.clientId,
      createdAt:        facturasRecurrentes.createdAt,
      // client info
      clienteRazonSocial: clients.razonSocial,
    })
    .from(facturasRecurrentes)
    .leftJoin(clients, eq(facturasRecurrentes.clientId, clients.id))
    .where(eq(facturasRecurrentes.teamId, teamId))
    .orderBy(desc(facturasRecurrentes.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturasRecurrentes: rows, page, limit });
}

// POST /api/facturas-recurrentes
export async function POST(req: NextRequest) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json();

  // Sin esta comprobación, un tipoEcf arbitrario llegaba crudo al INSERT y
  // reventaba como 500 del driver en vez de 422.
  if (body.tipoEcf != null && !esTipoEcfRecurrenteValido(body.tipoEcf)) {
    return NextResponse.json({ error: 'Tipo de comprobante inválido' }, { status: 422 });
  }

  // Un plan de venta fiscal fuera de Producción generaría, ciclo tras ciclo,
  // borradores que nunca se pueden emitir. Se bloquea en el servidor: esconder
  // la opción en el formulario no impide el POST directo.
  //
  // Ojo con el default: omitir tipoEcf daba '31', que se saltaba este control.
  // Por eso se resuelve el tipo efectivo ANTES de comprobarlo.
  const ambiente = await getAmbienteTenant(teamId);
  const enProduccion = ambiente === 'Produccion';
  const tipoEcfEfectivo: string = body.tipoEcf ?? (enProduccion ? '31' : 'sin-ncf');

  if (esTipoVentaFiscal(tipoEcfEfectivo) && !enProduccion) {
    return NextResponse.json({ error: mensajeAmbienteNoProduccion(ambiente), ambiente }, { status: 403 });
  }

  // Contexto opcional del módulo escolar. El plan sigue siendo genérico; la FK
  // vive en matrícula. Esto fuerza tutor correcto + mensualidad + calendario.
  const contextoEscolar = body.contextoEscolar as { matriculaId?: number; conceptoId?: number } | undefined;
  if (contextoEscolar) {
    const escolarAuth = await requirePermission('administracion-escolar:gestionar');
    if (!escolarAuth.ok) return escolarAuth.response;
    if (!Number.isInteger(contextoEscolar.matriculaId) || !Number.isInteger(contextoEscolar.conceptoId)) {
      return NextResponse.json({ error: 'Contexto de matrícula inválido' }, { status: 400 });
    }
    const matriculaId = contextoEscolar.matriculaId as number;
    const conceptoId = contextoEscolar.conceptoId as number;
    if (body.frecuencia && body.frecuencia !== 'mensual') {
      return NextResponse.json({ error: 'La facturación automática escolar debe ser mensual' }, { status: 422 });
    }
    if (!body.fechaFin) {
      return NextResponse.json({ error: 'La facturación escolar debe finalizar con el período académico' }, { status: 422 });
    }

    const [matricula] = await db
      .select({
        id: adminEscolarMatriculas.id,
        estudianteId: adminEscolarMatriculas.estudianteId,
        estado: adminEscolarMatriculas.estado,
        facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
        fechaInicio: adminEscolarPeriodos.fechaInicio,
        fechaFin: adminEscolarPeriodos.fechaFin,
      })
      .from(adminEscolarMatriculas)
      .innerJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
      .where(and(
        eq(adminEscolarMatriculas.id, matriculaId),
        eq(adminEscolarMatriculas.teamId, teamId),
      ))
      .limit(1);
    if (!matricula || matricula.estado !== 'activa') {
      return NextResponse.json({ error: 'La matrícula activa no fue encontrada' }, { status: 404 });
    }
    if (matricula.facturaRecurrenteId) {
      return NextResponse.json({ error: 'Esta matrícula ya tiene facturación automática configurada' }, { status: 409 });
    }
    if (!matricula.fechaInicio || !matricula.fechaFin ||
        body.fechaInicio < matricula.fechaInicio || body.fechaInicio > matricula.fechaFin ||
        body.fechaFin > matricula.fechaFin || body.fechaFin < body.fechaInicio) {
      return NextResponse.json({ error: 'Las fechas deben estar dentro del período académico' }, { status: 422 });
    }

    const [[concepto], [responsable]] = await Promise.all([
      db.select({ id: adminEscolarConceptosPago.id })
        .from(adminEscolarConceptosPago)
        .where(and(
          eq(adminEscolarConceptosPago.id, conceptoId),
          eq(adminEscolarConceptosPago.teamId, teamId),
          eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
          eq(adminEscolarConceptosPago.activo, true),
        ))
        .limit(1),
      // A quién se le factura: el responsable de pago del alumno, que es un
      // CONTACTO (`facturar_a_client_id`). Antes salía del tutor con la casilla
      // `responsable_pago`, que dejó de marcarse cuando tutor y responsable se
      // separaron: la consulta no encontraba a nadie y toda mensualidad
      // recurrente moría con «no tiene tutor responsable vinculado».
      db.select({ clientId: adminEscolarEstudiantes.facturarAClientId })
        .from(adminEscolarEstudiantes)
        .where(and(
          eq(adminEscolarEstudiantes.teamId, teamId),
          eq(adminEscolarEstudiantes.id, matricula.estudianteId),
        ))
        .limit(1),
    ]);
    if (!concepto) return NextResponse.json({ error: 'Concepto de mensualidad no encontrado' }, { status: 422 });
    if (!responsable?.clientId) {
      return NextResponse.json({ error: 'El estudiante no tiene responsable de pago asignado' }, { status: 422 });
    }
    if (body.clientId !== responsable.clientId) {
      return NextResponse.json({ error: 'La factura debe pertenecer al responsable de pago del estudiante' }, { status: 422 });
    }
  }

  if (!body.nombre?.trim())        return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 422 });
  if (!body.fechaInicio)           return NextResponse.json({ error: 'La fecha de inicio es obligatoria' }, { status: 422 });
  if (!body.proximaEmision)        return NextResponse.json({ error: 'La próxima emisión es obligatoria' }, { status: 422 });

  const ESTADOS_VALIDOS = ['activa', 'pausada', 'finalizada'] as const;
  if (body.estado != null && !ESTADOS_VALIDOS.includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 422 });
  }

  const frecuencia = body.frecuencia ?? 'mensual';
  // diaCobro solo aplica para frecuencias mensual/trimestral/anual
  const diaCobro = ['mensual', 'trimestral', 'anual'].includes(frecuencia)
    ? (body.diaCobro != null ? Math.min(31, Math.max(1, parseInt(body.diaCobro))) : null)
    : null;

  const values = {
      teamId,
      clientId:       body.clientId ?? null,
      nombre:         body.nombre.trim(),
      descripcion:    body.descripcion?.trim() ? body.descripcion.trim().slice(0, 200) : null,
      tipoEcf:        tipoEcfEfectivo,
      tipoPago:       body.tipoPago ?? 1,
      diasParaPago:   body.tipoPago === 2 && body.diasParaPago ? parseInt(body.diasParaPago) : null,
      frecuencia,
      diaCobro,
      fechaInicio:    body.fechaInicio,
      fechaFin:       body.fechaFin ?? null,
      proximaEmision: body.proximaEmision,
      estado:         body.estado ?? 'activa',
      items:          body.items ? JSON.stringify(body.items) : '[]',
      notas:          body.notas ?? null,
      totalEstimado:  Math.round((body.totalEstimado ?? 0) * 100),
  };

  const [row] = contextoEscolar
    ? await db.transaction(async (tx) => {
      const [matriculaBloqueada] = await tx.select({ facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId })
        .from(adminEscolarMatriculas)
        .where(and(
          eq(adminEscolarMatriculas.id, contextoEscolar.matriculaId as number),
          eq(adminEscolarMatriculas.teamId, teamId),
        ))
        .for('update')
        .limit(1);
      if (!matriculaBloqueada || matriculaBloqueada.facturaRecurrenteId) {
        throw new Error('La matrícula ya tiene facturación automática configurada');
      }
      const [plan] = await tx.insert(facturasRecurrentes).values(values).returning();
      await tx.update(adminEscolarMatriculas)
        .set({
          facturaRecurrenteId: plan.id,
          conceptoMensualidadId: contextoEscolar.conceptoId as number,
          updatedAt: new Date(),
        })
        .where(and(
          eq(adminEscolarMatriculas.id, contextoEscolar.matriculaId as number),
          eq(adminEscolarMatriculas.teamId, teamId),
          isNull(adminEscolarMatriculas.facturaRecurrenteId),
        ));
      return [plan];
    })
    : await db.insert(facturasRecurrentes).values(values).returning();

  return NextResponse.json({ facturaRecurrente: row }, { status: 201 });
}
