/**
 * Matricular de una vez a los alumnos según la sección que dice SIGERD.
 *
 * `cruzarEstudiantes` crea los alumnos pero a propósito NO los matricula: la
 * matrícula lleva conceptos y cargos que el portal no trae. La sección, en
 * cambio, sí la trae, y quedaba en el snapshot sin uso: el colegio tenía que
 * matricular uno por uno, o sección por sección en el lote, algo que SIGERD ya
 * sabía. Esto cierra ese hueco con el mismo `matricularLote` de «Matricular en
 * lote»: cada alumno entra con los conceptos que tienen tarifa en su sección,
 * salvo lo que la pantalla le haya quitado, y con su precio propio si se le
 * puso. La matrícula queda completa y cobrando, no a medias.
 *
 * Solo entra quien se puede emparejar sin adivinar:
 *  - el alumno, por `sigerd_id` o por RNE (igual que `construirPlan`);
 *  - la sección, por `sigerd_seccion_id` y DENTRO del año escolar activo.
 * El resto se cuenta y se explica, no se fuerza.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptoPrecios, adminEscolarConceptosPago, adminEscolarCursos,
  adminEscolarEstudiantes, adminEscolarGrados, adminEscolarMatriculas,
  adminEscolarPeriodos, adminEscolarServicios,
} from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { LoteError, matricularLote, type ResultadoLote } from './matricula-lote';
import { contextoDeSeccion } from './tarifas';
import { armarPlanDeCobro } from './plan-cobro';
import { hoyRD } from '@/lib/utils/format';
import type { ArbolCentro } from '@/lib/sigerd/sync';
import { ultimoDumpSigerd } from '@/lib/sigerd/ultimo-dump';

export interface GrupoSigerd {
  cursoId: number;
  /** "Primero — A · Matutina". */
  curso: string;
  /** Nivel (servicio) del año, para agrupar grados en pantalla ("Primario"). */
  servicio: string;
  /** Grado, para agrupar secciones en pantalla ("Primero"). */
  grado: string;
  /** Nombre de la sección ("A"). */
  seccion: string;
  /** Tanda o servicio ("Matutina"). */
  tanda: string | null;
  estudiantes: Array<{
    id: number;
    nombre: string;
    /**
     * Sin «facturar a»: sus cargos nacen, pero la facturación automática los
     * salta y los avisos no tienen a quién llegar. Se avisa antes de matricular.
     */
    sinResponsable: boolean;
  }>;
}

/** Alguien que SIGERD lista pero que no se puede matricular, y dónde lo tiene. */
export interface OmitidoSigerd {
  nombre: string;
  /** Ruta que dice SIGERD: "Primario · Primero · A". */
  ubicacion: string;
}

export interface PendientesSigerd {
  /** Falso si no hay descarga de SIGERD o no hay año escolar activo. */
  disponible: boolean;
  motivo?: string;
  /**
   * El año activo. `fechaInicio` es la inscripción por defecto: quien viene de
   * SIGERD está en el colegio desde que empezó el año, así que le tocan todas
   * las cuotas del calendario, no solo las que faltan desde hoy.
   */
  periodo: { id: number; nombre: string; fechaInicio: string | null } | null;
  anoAcademico: number | null;
  /** Cuándo se bajó de SIGERD lo que se está enseñando: lo de después no está. */
  descargadaEl: string | null;
  /** Por sección: lo que el botón va a matricular. */
  grupos: GrupoSigerd[];
  /** Cuántos se matricularían (suma de los grupos). */
  porMatricular: number;
  /** Ya tienen matrícula activa en el período: se dejan como están. */
  yaMatriculados: number;
  /** Están en SIGERD pero no como estudiantes activos: sin cruzar, o dados de baja. */
  sinEstudiante: OmitidoSigerd[];
  /** Su sección de SIGERD no está enlazada a una sección del año activo. */
  sinSeccion: OmitidoSigerd[];
}

const vacio = (motivo: string): PendientesSigerd => ({
  disponible: false, motivo, periodo: null, anoAcademico: null, descargadaEl: null,
  grupos: [], porMatricular: 0, yaMatriculados: 0, sinEstudiante: [], sinSeccion: [],
});

export async function pendientesDesdeSigerd(teamId: number): Promise<PendientesSigerd> {
  // La descarga más reciente: es la que dice dónde está cada alumno este año.
  // Misma regla que «Revisar cambios» y el asistente (`ultimoDumpSigerd`): si
  // no, una pantalla diría «no hay descarga» mientras otra enseña datos.
  const imp = await ultimoDumpSigerd(teamId);
  const dump = imp?.dump ?? null;
  const arbol = dump?.estructura as ArbolCentro | undefined;
  if (!arbol) return vacio('No hay descarga de SIGERD todavía.');

  const [periodo] = await db.select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre, fechaInicio: adminEscolarPeriodos.fechaInicio })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);
  if (!periodo) return vacio('No hay año escolar activo.');

  // Secciones del año activo enlazadas a SIGERD. Una sección de otro año con el
  // mismo id de SIGERD no vale: matricularía en la estructura del año pasado.
  const [cursos, estudiantes] = await Promise.all([
    db.select({
      id: adminEscolarCursos.id,
      nombre: adminEscolarCursos.nombre,
      sigerd: adminEscolarCursos.sigerdSeccionId,
      grado: adminEscolarGrados.nombre,
      servicio: adminEscolarServicios.nombre,
      tanda: adminEscolarServicios.tanda,
      // El orden que el colegio le dio a su estructura: Maternal antes que
      // Cuarto, no por orden alfabético.
      ordenServicio: adminEscolarServicios.orden,
      ordenGrado: adminEscolarGrados.orden,
      ordenCurso: adminEscolarCursos.orden,
    })
      .from(adminEscolarCursos)
      .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
      .innerJoin(adminEscolarServicios, eq(adminEscolarServicios.id, adminEscolarGrados.servicioId))
      .where(and(
        eq(adminEscolarCursos.teamId, teamId),
        eq(adminEscolarServicios.periodoId, periodo.id),
        eq(adminEscolarCursos.activo, true),
        eq(adminEscolarGrados.activo, true),
        eq(adminEscolarServicios.activo, true),
      )),
    db.select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      sigerd: adminEscolarEstudiantes.sigerdId,
      rne: adminEscolarEstudiantes.codigoRne,
      facturarA: adminEscolarEstudiantes.facturarAClientId,
    })
      .from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.teamId, teamId), eq(adminEscolarEstudiantes.estado, 'activo'))),
  ]);

  const cursoPorSeccion = new Map(cursos.filter((c) => c.sigerd != null).map((c) => [c.sigerd!, c]));
  const estPorSigerd = new Map(estudiantes.filter((e) => e.sigerd != null).map((e) => [e.sigerd!, e]));
  const estPorRne = new Map(estudiantes.filter((e) => e.rne).map((e) => [e.rne!, e]));
  const fichas = (dump?.estudianteFichas ?? []) as Array<Record<string, unknown>>;
  const rnePorSigerd = new Map(fichas.map((f) => [Number(f.idSigerd), (f.codigoRNE as string | null) ?? null]));

  // Quien ya tiene matrícula este año no se toca: si SIGERD dice otra
  // sección, eso es un cambio de sección y lo decide una persona. Cuenta
  // cualquier estado, no solo la activa: al retirado o al anulado este año no
  // se le abre otra matrícula con su deuda porque SIGERD todavía lo liste.
  const ids = estudiantes.map((e) => e.id);
  const delAno = ids.length
    ? await db.select({ estudianteId: adminEscolarMatriculas.estudianteId })
        .from(adminEscolarMatriculas)
        .where(and(
          eq(adminEscolarMatriculas.teamId, teamId),
          eq(adminEscolarMatriculas.periodoId, periodo.id),
          inArray(adminEscolarMatriculas.estudianteId, ids),
        ))
    : [];
  const conMatricula = new Set(delAno.map((m) => m.estudianteId));

  type Estudiante = (typeof estudiantes)[number];
  type Curso = (typeof cursos)[number];
  const sinEstudiante: OmitidoSigerd[] = [];
  // Primero dónde lo pone SIGERD —todas las veces—, y después se decide. El
  // portal a veces repite a un alumno en dos secciones: quedarse con la
  // primera ponía al alumno en la que saliera antes en el árbol, que podía
  // ser la equivocada. Con dos sitios distintos no se adivina.
  const lugares = new Map<number, { est: Estudiante; sitios: Array<{ curso: Curso | undefined; ubicacion: string }> }>();
  for (const sv of arbol.servicios) {
    for (const g of sv.grados) {
      for (const s of g.secciones) {
        const curso = cursoPorSeccion.get(s.idSeccion);
        const ubicacion = `${sv.nombre} · ${g.nombre} · ${s.nombre}`;
        for (const e of s.estudiantes) {
          const rne = rnePorSigerd.get(e.id);
          const est = estPorSigerd.get(e.id) ?? (rne ? estPorRne.get(rne) : undefined);
          if (!est) { sinEstudiante.push({ nombre: e.nombre.trim(), ubicacion }); continue; }
          const l = lugares.get(est.id) ?? { est, sitios: [] };
          if (!l.sitios.some((x) => x.ubicacion === ubicacion)) l.sitios.push({ curso, ubicacion });
          lugares.set(est.id, l);
        }
      }
    }
  }

  const grupos = new Map<number, GrupoSigerd & { orden: number[] }>();
  let yaMatriculados = 0;
  const sinSeccion: OmitidoSigerd[] = [];

  for (const { est, sitios } of lugares.values()) {
    const nombre = `${est.nombres} ${est.apellidos}`.trim();
    if (conMatricula.has(est.id)) { yaMatriculados++; continue; }
    if (sitios.length > 1) {
      sinSeccion.push({ nombre, ubicacion: `SIGERD lo tiene en ${sitios.length} secciones: ${sitios.map((x) => x.ubicacion).join(' y ')}` });
      continue;
    }
    const { curso, ubicacion } = sitios[0];
    if (!curso) { sinSeccion.push({ nombre, ubicacion }); continue; }

    let grupo = grupos.get(curso.id);
    if (!grupo) {
      const partes = [curso.grado, curso.nombre].filter(Boolean).join(' — ');
      grupo = {
        cursoId: curso.id,
        curso: curso.tanda ? `${partes} · ${curso.tanda}` : partes,
        servicio: curso.servicio,
        grado: curso.grado,
        seccion: curso.nombre,
        tanda: curso.tanda,
        estudiantes: [],
        orden: [curso.ordenServicio ?? 0, curso.ordenGrado ?? 0, curso.ordenCurso ?? 0],
      };
      grupos.set(curso.id, grupo);
    }
    grupo.estudiantes.push({ id: est.id, nombre, sinResponsable: est.facturarA == null });
  }

  const porOrden = (a: number[], b: number[]) => a.findIndex((x, i) => x !== b[i]);
  const lista = [...grupos.values()]
    .sort((a, b) => {
      const i = porOrden(a.orden, b.orden);
      return i >= 0 ? a.orden[i] - b.orden[i] : a.curso.localeCompare(b.curso, 'es');
    })
    .map(({ orden: _orden, ...g }) => ({
      ...g,
      estudiantes: g.estudiantes.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
    }));
  return {
    disponible: true,
    periodo,
    anoAcademico: (dump?.anoAcademico as number | undefined) ?? imp?.anoAcademico ?? null,
    descargadaEl: imp?.bajadoEn ? imp.bajadoEn.toISOString() : null,
    grupos: lista,
    porMatricular: lista.reduce((n, g) => n + g.estudiantes.length, 0),
    yaMatriculados, sinEstudiante, sinSeccion,
  };
}

/** Un alumno tal como lo deja la pantalla: con qué conceptos y a qué precio. */
export interface AlumnoDesdeSigerd {
  estudianteId: number;
  /** Los conceptos que se le cobran. Los demás de su sección se le quitan. */
  conceptos: number[];
  /**
   * Su precio propio de un concepto, por cuota, cuando no es el de la sección.
   * Queda como su tarifa del año: la usan también los cargos de cada mes.
   */
  precios: Array<{ conceptoId: number; montoCentavos: number }>;
}

export interface ResultadoSeccionSigerd {
  curso: string;
  esperadas: number;
  creadas: number;
  conflicto: number;
  error: number;
  resultados: ResultadoLote[];
}

/**
 * Matricula UNA sección: los alumnos que la pantalla dejó marcados, cada uno con
 * sus conceptos y su precio.
 *
 * Va sección por sección —la pantalla llama una vez por cada una— para que se
 * vea avanzar y para que un colegio grande no choque con el tiempo máximo de
 * una petición. Debajo es el mismo `matricularLote` de «Matricular en lote».
 *
 * No se fía de la pantalla: vuelve a calcular quién está pendiente, y solo
 * matricula a quien SIGERD sigue poniendo en ESTA sección. Los precios se
 * toman del plan de la sección calculado aquí, no de lo que mande el navegador.
 */
export async function matricularSeccionDesdeSigerd(teamId: number, entrada: {
  cursoId: number;
  fechaInscripcion: string;
  alumnos: AlumnoDesdeSigerd[];
}): Promise<ResultadoSeccionSigerd> {
  const { cursoId, fechaInscripcion: fecha } = entrada;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new LoteError('Fecha de inscripción inválida', 400);

  const p = await pendientesDesdeSigerd(teamId);
  if (!p.disponible || !p.periodo) throw new LoteError(p.motivo ?? 'SIGERD no está disponible', 409);
  const grupo = p.grupos.find((g) => g.cursoId === cursoId);
  if (!grupo) throw new LoteError('Esa sección ya no tiene alumnos de SIGERD por matricular.', 409);

  const enGrupo = new Map(grupo.estudiantes.map((e) => [e.id, e]));
  const fuera: ResultadoLote[] = entrada.alumnos
    .filter((a) => !enGrupo.has(a.estudianteId))
    .map((a) => ({
      estudianteId: a.estudianteId, nombre: `Estudiante #${a.estudianteId}`, codigo: null,
      resultado: 'invalido', motivo: 'Ya no está pendiente en esta sección de SIGERD',
    }));
  const alumnos = entrada.alumnos.filter((a) => enGrupo.has(a.estudianteId));
  const base = { curso: grupo.curso, esperadas: entrada.alumnos.length };
  if (alumnos.length === 0) {
    return { ...base, creadas: 0, conflicto: 0, error: fuera.length, resultados: fuera };
  }

  // Precios propios PRIMERO, como en el alta individual: el lote recalcula el
  // plan de cada alumno con su tarifa personal, así que tiene que estar escrita
  // antes. Si su matrícula no llega a crearse, se deshacen.
  const escritos = await escribirPreciosPropios(teamId, p.periodo.id, cursoId, fecha, alumnos);

  let lote;
  try {
    lote = await matricularLote({
      teamId,
      periodoId: p.periodo.id,
      cursoId,
      estudianteIds: alumnos.map((a) => a.estudianteId),
      conceptos: 'todos',
      porEstudiante: new Map(alumnos.map((a) => [a.estudianteId, { conceptos: a.conceptos }])),
      fechaInscripcion: fecha,
      // Con la inscripción al inicio del año, lo ya vencido (agosto, septiembre…)
      // se carga ahora como pendiente; lo que viene lo crea el devengo.
      corteCargos: hoyRD(),
      dryRun: false,
    });
  } catch (err) {
    await deshacerPrecios(teamId, escritos, () => true);
    throw err;
  }

  const creados = new Set(lote.resultados.filter((r) => r.resultado === 'creada').map((r) => r.estudianteId));
  await deshacerPrecios(teamId, escritos, (estudianteId) => !creados.has(estudianteId));

  const resultados = [...lote.resultados, ...fuera];
  return {
    ...base,
    creadas: lote.resumen.crear,
    conflicto: lote.resumen.conflicto,
    error: lote.resumen.error + lote.resumen.invalido + fuera.length,
    resultados,
  };
}

interface PrecioEscrito {
  estudianteId: number;
  id: number;
  /** Lo que había antes en esa fila, para volver a dejarlo. `null` = no existía. */
  previo: { montoCentavos: number; productId: number | null; activo: boolean } | null;
}

/**
 * La tarifa personal de cada alumno que la lleve, con el mismo upsert que
 * Tarifas (`POST /concepto-precios`, objetivo `estudiante`).
 *
 * El producto sale del plan de la sección calculado aquí —el mismo que heredaría
 * el alumno—, o del concepto. Sin ninguno de los dos la tarifa no se podría
 * facturar (regla R2) y se rechaza, como en Tarifas.
 */
async function escribirPreciosPropios(
  teamId: number, periodoId: number, cursoId: number, fecha: string, alumnos: AlumnoDesdeSigerd[],
): Promise<PrecioEscrito[]> {
  const conPrecio = alumnos.filter((a) => a.precios.length > 0);
  if (conPrecio.length === 0) return [];

  const ctx = await contextoDeSeccion(teamId, periodoId, cursoId);
  const plan = ctx ? await armarPlanDeCobro(teamId, ctx, fecha) : [];
  const lineas = new Map(plan.map((l) => [l.conceptoId, l]));
  const conceptos = await db
    .select({ id: adminEscolarConceptosPago.id, productId: adminEscolarConceptosPago.productId })
    .from(adminEscolarConceptosPago)
    .where(and(
      eq(adminEscolarConceptosPago.teamId, teamId),
      inArray(adminEscolarConceptosPago.id, [...lineas.keys()].length ? [...lineas.keys()] : [0]),
    ));
  const productoDelConcepto = new Map(conceptos.map((c) => [c.id, c.productId]));

  const escritos: PrecioEscrito[] = [];
  try {
    for (const a of conPrecio) {
      for (const precio of a.precios) {
        const linea = lineas.get(precio.conceptoId);
        const monto = Math.round(Number(precio.montoCentavos));
        if (!linea) throw new LoteError('Ese concepto no tiene tarifa en esta sección.', 400);
        if (!Number.isFinite(monto) || monto < 0) throw new LoteError('Monto inválido', 400);
        const productId = linea.productId ?? productoDelConcepto.get(linea.conceptoId) ?? null;
        if (productId == null) {
          throw new LoteError(`«${linea.nombre}» no tiene producto de facturación: ponle uno en Tarifas antes de cambiarle el precio a un alumno.`, 400);
        }

        const clave = and(
          eq(adminEscolarConceptoPrecios.teamId, teamId),
          eq(adminEscolarConceptoPrecios.conceptoId, linea.conceptoId),
          eq(adminEscolarConceptoPrecios.periodoId, periodoId),
          eq(adminEscolarConceptoPrecios.objetivoTipo, 'estudiante'),
          eq(adminEscolarConceptoPrecios.objetivoId, a.estudianteId),
        );
        const [previo] = await db.select({
          montoCentavos: adminEscolarConceptoPrecios.montoCentavos,
          productId: adminEscolarConceptoPrecios.productId,
          activo: adminEscolarConceptoPrecios.activo,
        }).from(adminEscolarConceptoPrecios).where(clave).limit(1);

        const [fila] = await db.insert(adminEscolarConceptoPrecios)
          .values({
            teamId, conceptoId: linea.conceptoId, periodoId,
            objetivoTipo: 'estudiante', objetivoId: a.estudianteId,
            montoCentavos: monto, productId,
          })
          .onConflictDoUpdate({
            target: [
              adminEscolarConceptoPrecios.teamId, adminEscolarConceptoPrecios.conceptoId,
              adminEscolarConceptoPrecios.periodoId, adminEscolarConceptoPrecios.objetivoTipo,
              adminEscolarConceptoPrecios.objetivoId,
            ],
            set: { montoCentavos: monto, productId, activo: true, updatedAt: new Date() },
          })
          .returning({ id: adminEscolarConceptoPrecios.id });
        escritos.push({ estudianteId: a.estudianteId, id: fila.id, previo: previo ?? null });
      }
    }
  } catch (err) {
    // A medias no: si un precio no se pudo poner, los de antes se quitan.
    await deshacerPrecios(teamId, escritos, () => true);
    throw err;
  }
  invalidarEstructura(teamId);
  return escritos;
}

/**
 * Deja como estaban los precios de los alumnos que `cual` diga: un precio
 * propio sobre un alumno que nadie acabó de matricular le cambiaría lo que paga
 * sin que nadie lo decidiera.
 */
async function deshacerPrecios(
  teamId: number, escritos: PrecioEscrito[], cual: (estudianteId: number) => boolean,
) {
  const tocan = escritos.filter((e) => cual(e.estudianteId));
  if (tocan.length === 0) return;
  for (const e of tocan) {
    const fila = and(eq(adminEscolarConceptoPrecios.id, e.id), eq(adminEscolarConceptoPrecios.teamId, teamId));
    if (e.previo) {
      await db.update(adminEscolarConceptoPrecios)
        .set({ ...e.previo, updatedAt: new Date() })
        .where(fila);
    } else {
      await db.delete(adminEscolarConceptoPrecios).where(fila);
    }
  }
  invalidarEstructura(teamId);
}
