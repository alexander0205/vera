import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarConceptoCuotas, adminEscolarConceptosPago, adminEscolarCursos, adminEscolarGrados,
  adminEscolarMatriculas,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';
import { cuotasDeLaTarifa, montosPorCuota, precioEsPorCuota } from '@/lib/administracion-escolar/repartir';
import { sugerirMontoDelCargo } from '@/lib/administracion-escolar/precio-cargo-individual';

/**
 * GET /api/administracion-escolar/matriculas/[id]/precio?conceptoId=N&mes=M
 *
 * El precio que tiene `conceptoId` para el curso de ESTA matrícula, para que
 * «Agregar cargo» salga con el monto puesto. Usa `resolverTarifa`, la misma
 * cadena de precios que el plan de cobro de la matrícula (precio personal →
 * sección → grado → servicio, y la beca encima). En un concepto repartido en
 * cuotas propone la cuota del mes, como haría el devengo; ojo que
 * `POST /cargos` sin monto cobra la tarifa ENTERA, no la cuota, por eso el
 * formulario manda siempre el monto (salvo el cero de una beca del 100 %).
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
  const cuotaCruda = Number(req.nextUrl.searchParams.get('cuotaId'));
  const cuotaElegida = Number.isInteger(cuotaCruda) && cuotaCruda > 0 ? cuotaCruda : null;
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
    .select({ tipo: adminEscolarConceptosPago.tipo, precioPorCuota: adminEscolarConceptosPago.precioPorCuota })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
    .limit(1);
  if (!concepto) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const [tarifa, cuotas, cargadas] = await Promise.all([
    resolverTarifa(teamId, matriculaId, conceptoId),
    db.select({
        id:                  adminEscolarConceptoCuotas.id,
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
    // Las cuotas que el alumno ya tiene cargadas: no se proponen otra vez.
    db.select({ cuotaId: adminEscolarCargos.cuotaId })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.matriculaId, matriculaId),
        isNotNull(adminEscolarCargos.cuotaId),
        ne(adminEscolarCargos.estado, 'anulado'),
      )),
  ]);
  const yaCargadas = new Set(cargadas.map((c) => c.cuotaId));
  const delConcepto = cuotas.map((c) => ({
    id: c.id,
    etiqueta: c.etiqueta,
    mes: Number(String(c.fechaEmision).slice(5, 7)),
    porcentajeMilesimas: c.porcentajeMilesimas,
    cargada: yaCargadas.has(c.id),
  }));

  // El mes de cada cuota sale de su fecha de emisión, como en el plan: una
  // fecha editada después de generar el calendario manda sobre `mes`.
  const sugerencia = sugerirMontoDelCargo(
    concepto.tipo,
    tarifa,
    delConcepto,
    mes != null && Number.isInteger(mes) ? mes : null,
    cuotaElegida,
    concepto.precioPorCuota,
  );
  // Un concepto repartido enseña sus cuotas para que se elija cuál es este
  // cargo: el cargo se ata a ella y el devengo ya no la vuelve a crear.
  const deLaTarifa = cuotasDeLaTarifa(delConcepto, tarifa?.cuotas);
  const montos = tarifa && deLaTarifa.length > 1 && !precioEsPorCuota(concepto)
    ? montosPorCuota(concepto.tipo, tarifa.montoCentavos, deLaTarifa.map((c) => c.porcentajeMilesimas), concepto.precioPorCuota)
    : null;

  return NextResponse.json({
    curso: `${matricula.grado} ${matricula.seccion}`.trim(),
    sugerencia,
    cuotas: montos
      ? deLaTarifa.map((c, i) => ({ id: c.id, etiqueta: c.etiqueta, montoCentavos: montos[i], cargada: c.cargada }))
      : [],
  });
}
