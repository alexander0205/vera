import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptoPrecios, adminEscolarConceptosPago, adminEscolarCursos,
  adminEscolarEstudiantes, adminEscolarGrados, adminEscolarMatriculas, adminEscolarPaquetes, adminEscolarPeriodos,
} from '@/lib/db/schema';
import { resolverTarifasEnMemoria } from './tarifas';

/**
 * Lo que pinta «Servicios por alumno» y lo que se baja en Excel: los conceptos
 * activos, los paquetes y una fila por matrícula activa del año con lo que
 * cobra y lo que PODRÍA cobrar (lo que tiene tarifa para ella).
 */

async function periodoDe(teamId: number, pedido: number) {
  const periodos = await db
    .select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre, activo: adminEscolarPeriodos.activo })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.id));
  return periodos.find((p) => p.id === pedido) ?? periodos.find((p) => p.activo) ?? periodos[0] ?? null;
}

export async function leerServiciosAlumnos(teamId: number, pedido: number) {
  const periodo = await periodoDe(teamId, pedido);
  if (!periodo) return { periodo: null, conceptos: [], paquetes: [], filas: [] };

  const [conceptos, paquetes, precios, matriculas] = await Promise.all([
    db.select({
        id: adminEscolarConceptosPago.id, nombre: adminEscolarConceptosPago.nombre,
        opcional: adminEscolarConceptosPago.opcional, categoria: adminEscolarConceptosPago.categoria,
        admiteBeca: adminEscolarConceptosPago.admiteBeca,
      })
      .from(adminEscolarConceptosPago)
      .where(and(eq(adminEscolarConceptosPago.teamId, teamId), eq(adminEscolarConceptosPago.activo, true)))
      .orderBy(asc(adminEscolarConceptosPago.orden), asc(adminEscolarConceptosPago.nombre)),
    db.select({ id: adminEscolarPaquetes.id, nombre: adminEscolarPaquetes.nombre, conceptosIds: adminEscolarPaquetes.conceptosIds })
      .from(adminEscolarPaquetes)
      .where(and(eq(adminEscolarPaquetes.teamId, teamId), eq(adminEscolarPaquetes.activo, true)))
      .orderBy(asc(adminEscolarPaquetes.orden), asc(adminEscolarPaquetes.nombre)),
    db.select({
        conceptoId: adminEscolarConceptoPrecios.conceptoId, objetivoTipo: adminEscolarConceptoPrecios.objetivoTipo,
        objetivoId: adminEscolarConceptoPrecios.objetivoId, montoCentavos: adminEscolarConceptoPrecios.montoCentavos,
        productId: adminEscolarConceptoPrecios.productId, cuotas: adminEscolarConceptoPrecios.cuotas,
      })
      .from(adminEscolarConceptoPrecios)
      .where(and(
        eq(adminEscolarConceptoPrecios.teamId, teamId),
        eq(adminEscolarConceptoPrecios.periodoId, periodo.id),
        eq(adminEscolarConceptoPrecios.activo, true),
      )),
    db.select({
        matriculaId: adminEscolarMatriculas.id,
        estudianteId: adminEscolarMatriculas.estudianteId,
        conceptosIds: adminEscolarMatriculas.conceptosIds,
        becaTipo: adminEscolarMatriculas.becaTipo,
        becaValor: adminEscolarMatriculas.becaValor,
        cursoId: adminEscolarMatriculas.cursoId,
        seccion: adminEscolarCursos.nombre,
        gradoId: adminEscolarGrados.id,
        grado: adminEscolarGrados.nombre,
        servicioId: adminEscolarGrados.servicioId,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        codigo: adminEscolarEstudiantes.codigo,
        codigoRne: adminEscolarEstudiantes.codigoRne,
      })
      .from(adminEscolarMatriculas)
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarMatriculas.estudianteId))
      .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
      .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.periodoId, periodo.id),
        eq(adminEscolarMatriculas.estado, 'activa'),
      ))
      .orderBy(asc(adminEscolarGrados.orden), asc(adminEscolarCursos.nombre), asc(adminEscolarEstudiantes.apellidos)),
  ]);

  const ids = conceptos.map((c) => c.id);
  const admiteBeca = new Map(conceptos.map((c) => [c.id, c.admiteBeca]));
  const filas = matriculas.map((m) => {
    // Qué conceptos tienen tarifa para este alumno (su sección, grado, servicio
    // o la suya propia): solo esos se pueden marcar, los demás no tendrían con
    // qué cobrarse.
    const tarifas = resolverTarifasEnMemoria(precios, admiteBeca, {
      periodoId: periodo.id, seccionId: m.cursoId, gradoId: m.gradoId, servicioId: m.servicioId,
      becaTipo: m.becaTipo, becaValor: m.becaValor, estudianteId: m.estudianteId, conceptoMensualidadId: null,
    }, ids);
    return {
      matriculaId: m.matriculaId,
      estudianteId: m.estudianteId,
      nombre: `${m.nombres} ${m.apellidos}`.trim(),
      codigo: m.codigo ?? m.codigoRne ?? null,
      grado: m.grado,
      seccion: m.seccion,
      cursoId: m.cursoId,
      conceptosIds: (m.conceptosIds ?? []).map(Number),
      conTarifa: ids.filter((id) => tarifas.has(id)),
      beca: m.becaTipo ? { tipo: m.becaTipo, valor: m.becaValor } : null,
    };
  });

  return {
    periodo,
    conceptos: conceptos.map(({ admiteBeca: _a, ...c }) => c),
    paquetes,
    filas,
  };
}

