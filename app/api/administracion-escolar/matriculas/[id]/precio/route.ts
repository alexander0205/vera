import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptoCuotas, adminEscolarConceptosPago, adminEscolarCursos, adminEscolarGrados,
  adminEscolarMatriculas,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';
import { sugerirMontoDelCargo } from '@/lib/administracion-escolar/precio-cargo-individual';

/**
 * GET /api/administracion-escolar/matriculas/[id]/precio?conceptoId=N&mes=M
 *
 * El precio que tiene `conceptoId` para el curso de ESTA matrícula, para que
 * «Agregar cargo» salga con el monto puesto. Usa `resolverTarifa`, la misma
 * cadena que aplica `POST /cargos` cuando no recibe monto (precio personal →
 * sección → grado → servicio, y la beca encima), así que lo que se enseña es
 * lo que el servidor habría cobrado.
 *
 * `sugerencia: null` significa que el concepto no tiene precio para este
 * curso: el formulario pide el monto a mano.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const matriculaId = Number(id);
  const conceptoId = Number(req.nextUrl.searchParams.get('conceptoId'));
  const mesCrudo = req.nextUrl.searchParams.get('mes');
  const mes = mesCrudo ? Number(mesCrudo) : null;
  if (!Number.isInteger(matriculaId) || matriculaId <= 0 || !Number.isInteger(conceptoId) || conceptoId <= 0) {
    return NextResponse.json({ error: 'matrícula y conceptoId son requeridos' }, { status: 400 });
  }

  const [matricula] = await db
    .select({
      periodoId: adminEscolarMatriculas.periodoId,
      seccion:   adminEscolarCursos.nombre,
      grado:     adminEscolarGrados.nombre,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
    .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!matricula) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  const [concepto] = await db
    .select({ tipo: adminEscolarConceptosPago.tipo })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
    .limit(1);
  if (!concepto) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const [tarifa, cuotas] = await Promise.all([
    resolverTarifa(teamId, matriculaId, conceptoId),
    db.select({
        etiqueta:            adminEscolarConceptoCuotas.etiqueta,
        fechaEmision:        adminEscolarConceptoCuotas.fechaEmision,
        porcentajeMilesimas: adminEscolarConceptoCuotas.porcentajeMilesimas,
      })
      .from(adminEscolarConceptoCuotas)
      .where(and(
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        eq(adminEscolarConceptoCuotas.conceptoId, conceptoId),
        eq(adminEscolarConceptoCuotas.periodoId, matricula.periodoId),
        eq(adminEscolarConceptoCuotas.activo, true),
      ))
      .orderBy(asc(adminEscolarConceptoCuotas.numero)),
  ]);

  // El mes de cada cuota sale de su fecha de emisión, como en el plan: una
  // fecha editada después de generar el calendario manda sobre `mes`.
  const sugerencia = sugerirMontoDelCargo(
    concepto.tipo,
    tarifa,
    cuotas.map((c) => ({
      etiqueta: c.etiqueta,
      mes: Number(String(c.fechaEmision).slice(5, 7)),
      porcentajeMilesimas: c.porcentajeMilesimas,
    })),
    mes != null && Number.isInteger(mes) ? mes : null,
  );

  return NextResponse.json({
    curso: `${matricula.grado} ${matricula.seccion}`.trim(),
    sugerencia,
  });
}
