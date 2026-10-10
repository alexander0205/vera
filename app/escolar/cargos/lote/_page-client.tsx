'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { FiltroCurso } from '@/components/administracion-escolar/FiltroCurso';
import { PasoLote } from '@/components/administracion-escolar/cargo-lote/PasoLote';
import { QueSeCobra } from '@/components/administracion-escolar/cargo-lote/QueSeCobra';
import { ListaAlumnosLote } from '@/components/administracion-escolar/cargo-lote/ListaAlumnosLote';
import { ConfirmarCobroDialog } from '@/components/administracion-escolar/cargo-lote/ConfirmarCobroDialog';
import { ResultadoLote } from '@/components/administracion-escolar/cargo-lote/ResultadoLote';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { mesesDelPeriodo, type MesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import {
  TODOS_LOS_CURSOS, contarAlumnos, cursoDeCadaAlumno, nombreDelGrupo, normalizarFiltro, seccionesDelFiltro,
  type FiltroGrupo, type MatriculaActiva,
} from '@/lib/administracion-escolar/filtro-curso';
import {
  ERRORES_AL_COMPROBAR_EL_COBRO, ERRORES_PASO_1, ERROR_SIN_ELEGIR_A_QUIEN,
  alumnosConCargoVivo, alumnosEnLetras, avisoDeComprobacion, avisosDeConfirmar, claveDeQuienes,
  cobroConEseNombre, comprobarIntento, consejoTodosLoTienen, esCobroFijo, esFechaValida,
  fraseDeDuplicados, fraseDeMarcados, fraseDeQuitados, fraseDelCobro, leerMonto, marcarLosQueYaLoTienen,
  marcasTrasRevisar, mensajeDeError, mesEnLetras, nombresMarcados, resumenAQuien, resumenQueSeCobra,
  sumarDias, tituloTodosLoTienen,
  type Comprobacion, type CuerpoGenerar, type DetalleRevisado, type ErroresPaso1, type IntentoSinRespuesta,
  type MemoriaDeMarcas, type OrigenMonto, type PedidoRevisado, type Quien,
} from '@/lib/administracion-escolar/cargo-lote';
import { ArrowLeft, Check, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Cobrarle lo mismo a un grupo: la excursión, el día de cine, la foto del curso.
 *
 * La usa la secretaria de un colegio pequeño, con prisa y sin que nadie se la
 * haya explicado. Por eso no es un formulario: son TRES PREGUNTAS, una a la
 * vez y en el orden en que ella lo piensa.
 *
 *   1. Qué se cobra — el cobro, cuánto paga cada alumno y hasta cuándo.
 *   2. A quién se le cobra — un grupo, todo el colegio o solo algunos.
 *   3. Revisa y confirma — la lista con sus casillas y, pegada abajo, una frase
 *      entera que dice lo que va a pasar («Les vas a cobrar RD$150.00 de «Día
 *      de cine» a 5 alumnos de Sala de tareas»).
 *
 * Fueron dos columnas: el formulario a un lado y la lista al otro, con un botón
 * «Revisar» en medio que había que acordarse de pulsar. Todo estaba a la vista
 * a la vez y nada decía por dónde empezar ni qué acotaba y qué se cobraba.
 * Ahora solo hay un paso abierto; el contestado se queda en una línea con su
 * respuesta (y se toca para volver) y el que falta es un rótulo gris. «Revisar»
 * ya no existe: es el «Continuar» del paso 2.
 *
 * La confirmación es un diálogo de sí o no porque esto no tiene deshacer —un
 * cargo mal puesto se anula alumno por alumno— y porque el botón que cobra
 * queda donde un momento antes estaba «Continuar».
 *
 * Lo que no se puede romper, y por eso está escrito con nombre propio:
 *  - la frase y lo que se manda al crear salen del MISMO objeto, el pedido que
 *    se le preguntó al servidor en la revisión (`revision.pedido`);
 *  - cambiar cualquier dato tira lo revisado (`limpiarRevision`);
 *  - la respuesta de una pregunta que ya no está en pantalla no se pinta
 *    (`revisionPedida`);
 *  - nunca se crea con la lista de marcados vacía: el servidor la leería como
 *    «a todos los del grupo»;
 *  - si la respuesta de crear se pierde, la siguiente revisión CONTESTA si los
 *    cargos se crearon o no (`intentoSinRespuesta`), en vez de dejar a la
 *    persona delante de un «todos ya lo tienen» que invita a cobrar otra vez;
 *  - «ya lo tiene» también es quien tiene ese cobro guardado con mes
 *    (`alumnosConEseCobro`), que el servidor no ve cuando se cobra sin mes.
 *
 * Las reglas y los textos que no necesitan pantalla viven en
 * `lib/administracion-escolar/cargo-lote.ts`, donde se pueden probar.
 */

interface Periodo { id: number; nombre: string; fechaInicio: string | null; fechaFin: string | null; activo: boolean }
interface Curso {
  id: number; nombre: string; activo: boolean;
  gradoId: number; gradoNombre: string; gradoActivo: boolean;
  servicioId: number; servicioNombre: string; servicioTanda: string | null; servicioActivo: boolean;
  periodoId: number;
}
interface Concepto { id: number; nombre: string; tipo: string; activo: boolean; productId?: number | null }

/** Lo que contesta la ruta de generar, al revisar y al crear. */
interface Generacion {
  creados: number;
  omitidos: number;
  total: number;
  detalles: DetalleRevisado[];
}
/**
 * La revisión que se enseña: la respuesta, el grupo por el que se preguntó con
 * el nombre de ESE momento (`null` es todo el colegio) y el pedido exacto que
 * se mandó.
 *
 * Van aquí y no se leen de los campos: la lista tiene que decir de quién es y
 * qué se va a cobrar por sí sola. De este objeto salen la frase de la barra, la
 * del diálogo y el cuerpo de «crear»; si cada cosa leyera lo que hay escrito
 * arriba, serían tres lecturas de algo que se puede mover entre medias.
 */
interface Revision extends Generacion { grupo: string | null; pedido: PedidoRevisado }

/** Lo que se acaba de crear, con el pedido de ESE momento. */
interface Resultado {
  creados: number;
  omitidos: number;
  /** A quiénes se les creó. */
  detalles: DetalleRevisado[];
  pedido: PedidoRevisado;
  grupo: string | null;
  /** Nombres de los marcados que el servidor ya no encontró en el grupo. */
  noEncontrados: string[];
  /** La respuesta de crear se perdió y esto se supo volviendo a mirar la lista. */
  comprobado?: boolean;
  /** Tras comprobar: nombres de los marcados que ya no salen en el grupo. */
  sinComprobar?: string[];
}

interface Formulario {
  periodoId: string;
  /** Hasta dónde se acotó: un servicio, un grado o una sección. */
  grupo: FiltroGrupo;
  /** `null` = todavía no ha dicho a quién. */
  quien: Quien;
  conceptoId: string;
  /** Mes y año de la mensualidad. Vacíos si el cobro no es una mensualidad. */
  mes: string;
  anio: string;
  monto: string;
  origenMonto: OrigenMonto;
  fechaVencimiento: string;
}

/**
 * La pantalla como se abre. Es una función y no una constante para que la fecha
 * se calcule al entrar y no al cargar el archivo.
 *
 * Nadie viene elegido en «a quién»: el valor de entrada de antes era el colegio
 * entero, y bastaba no tocar nada para revisar a 146 alumnos creyendo que eran
 * 12. La fecha límite viene a una semana: puesta en hoy, el cargo nacía ya
 * atrasado al día siguiente. Y «hoy» es el de República Dominicana, no el de
 * UTC, que a las ocho de la noche ya es mañana.
 */
function formVacio(): Formulario {
  return {
    periodoId: '',
    grupo: TODOS_LOS_CURSOS,
    quien: null,
    conceptoId: '',
    mes: '',
    anio: '',
    monto: '',
    origenMonto: null,
    fechaVencimiento: sumarDias(hoyRD(), 7),
  };
}

/** El mes que viene puesto al elegir una mensualidad: el de hoy si cae en el año escolar. */
function mesInicial(periodo: Periodo | undefined): MesDelPeriodo | null {
  if (!periodo) return null;
  const meses = mesesDelPeriodo(periodo.fechaInicio, periodo.fechaFin);
  const [anio, mes] = hoyRD().split('-').map(Number);
  return meses.find((m) => m.mes === mes && m.anio === anio) ?? meses[0] ?? null;
}

function perteneceMes(periodo: Periodo | undefined, mes: string, anio: string) {
  if (!periodo) return false;
  return mesesDelPeriodo(periodo.fechaInicio, periodo.fechaFin)
    .some((m) => m.mes === Number(mes) && m.anio === Number(anio));
}

/** Pone el cursor en un campo después de pintar: puede no existir todavía. */
function enfocar(selector: string) {
  setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
}

/** Vuelve a leer los cobros del colegio. `null` si no se pudo. */
async function leerCobros(): Promise<Concepto[] | null> {
  try {
    const r = await fetch('/api/administracion-escolar/conceptos', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d?.conceptos) ? (d.conceptos as Concepto[]) : null;
  } catch {
    return null;
  }
}

/** Hasta cuántas páginas de cargos de un cobro se leen: 25 de 200 son cinco mil. */
const PAGINAS_DE_CARGOS = 25;

/**
 * Los alumnos que ya tienen un cargo sin anular de ese cobro en ese año
 * escolar, SEA DEL MES QUE SEA.
 *
 * La revisión del servidor no basta para un cobro suelto: lo pregunta sin mes y
 * entonces solo ve los cargos sin mes (ver `marcarLosQueYaLoTienen`). Esto lo
 * completa con la ruta que ya lista los cargos de un cobro; no se toca el
 * servidor.
 *
 * Si no se puede saber no devuelve una lista a medias: dice por qué, y quien
 * llama no enseña a nadie. Una lista incompleta dejaría marcado a quien ya lo
 * tiene, que es justo lo que se quiere evitar.
 */
async function alumnosConEseCobro(
  conceptoId: number, periodoId: number,
): Promise<number[] | keyof typeof ERRORES_AL_COMPROBAR_EL_COBRO> {
  const pagina = async (n: number) => {
    const r = await fetch(
      `/api/administracion-escolar/cargos?conceptoId=${conceptoId}&periodoId=${periodoId}&porPagina=200&pagina=${n}`,
    );
    if (!r.ok) throw new Error('cargos');
    return (await r.json()) as { cargos?: { estudianteId: number; estado: string }[]; paginas?: number };
  };
  try {
    const primera = await pagina(1);
    const paginas = Number(primera.paginas) || 1;
    if (paginas > PAGINAS_DE_CARGOS) return 'demasiados';
    // Casi siempre es una sola página; si hay más, salen todas a la vez.
    const resto = await Promise.all(Array.from({ length: paginas - 1 }, (_, i) => pagina(i + 2)));
    return alumnosConCargoVivo([primera, ...resto].flatMap((p) => p.cargos ?? []));
  } catch {
    return 'sin-respuesta';
  }
}

const ENLACE = 'rounded text-sm font-medium text-zero-600 hover:text-zero-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500';
const AVISO_AZUL = 'rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-sm text-zero-800';

export default function CargoLoteClient() {
  // `isLoading` importa: mientras llegan los permisos la lista viene vacía, y
  // sin distinguirlo la pantalla enseñaba «No tienes permiso» medio segundo a
  // quien sí lo tiene.
  const { permissions, isLoading: cargandoPermisos } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  // Crear un cobro toca el CATÁLOGO del colegio, no solo la deuda de este mes:
  // va con el permiso de configurar, que la secretaria normalmente no tiene.
  const puedeConfigurar = permissions.includes('administracion-escolar:configurar');

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [cargandoCat, setCargandoCat] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  /** Cada «Intentar otra vez» lo sube, y con eso se vuelven a pedir los catálogos. */
  const [intentoCarga, setIntentoCarga] = useState(0);

  const [form, setForm] = useState(formVacio);
  /** Cuál de las tres preguntas está abierta. */
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [errores, setErrores] = useState<ErroresPaso1>({});
  /**
   * Lo escrito en «Un cobro nuevo». `null` = esa opción no está elegida.
   *
   * El cobro NO se crea al escribir: se crea al pulsar «Continuar». Lo que se
   * cobra de esto no está en ningún catálogo cuando hace falta —«día de cine,
   * cien pesos», decidido el lunes para el viernes—, y mandar a alguien a
   * Configuración a darlo de alta y volver es el motivo por el que estos cobros
   * terminaban en una libreta.
   */
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null);
  const [creandoConcepto, setCreandoConcepto] = useState(false);
  /** Nombre del cobro que ya existía y quedó elegido en vez de crear un gemelo. */
  const [notaCobro, setNotaCobro] = useState<string | null>(null);
  /**
   * El cobro que se creó en esta visita y con el que todavía no se ha cobrado.
   *
   * Mientras siga así se le puede corregir el nombre desde el paso 1. El cobro
   * se guarda en el catálogo al pulsar «Continuar», y la errata («Dia de cien»)
   * se descubre dos pasos después, en la frase grande: sin esto solo quedaba
   * crear otro y dejar el mal escrito en la lista de todas las semanas.
   */
  const [cobroDeEstaVisita, setCobroDeEstaVisita] = useState<number | null>(null);
  /** El nombre corregido de ese cobro, a medio escribir. `null` = no lo ha tocado. */
  const [nombreCorregido, setNombreCorregido] = useState<string | null>(null);
  /** El último cargo válido de un cobro en un año escolar: «ya se cobró» y a cuánto. */
  const [pista, setPista] = useState<{ cobroId: string; periodoId: string; montoCentavos: number } | null>(null);

  const [cambiandoAnio, setCambiandoAnio] = useState(false);
  const [avisoAnio, setAvisoAnio] = useState(false);
  /** Las matrículas activas de un año escolar, para contar y para decir el curso de cada alumno. */
  const [alumnos, setAlumnos] = useState<{ periodoId: number; matriculas: MatriculaActiva[] } | null>(null);

  /**
   * La revisión antes de crear: quién recibe el cargo y quién ya lo tiene.
   *
   * «Continuar» en el paso 2 solo lee (`dryRun`); lo que escribe es el «Sí» del
   * diálogo, y escribe exactamente lo que quedó marcado.
   */
  const [revision, setRevision] = useState<Revision | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [revisando, setRevisando] = useState(false);
  const [errorPaso2, setErrorPaso2] = useState<string | null>(null);
  /** Las marcas vienen de antes: se corrigió el monto o la fecha y se volvió. */
  const [avisoMarcas, setAvisoMarcas] = useState(false);
  /** Lo que se supo al volver a mirar tras un «crear» sin respuesta, si no estaba todo creado. */
  const [avisoComprobado, setAvisoComprobado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const cargarCatalogos = useCallback(async () => {
    setCargandoCat(true);
    setErrorCarga(false);
    try {
      // Una respuesta que no es 200 también es un fallo. Sin mirarlo, un 500 se
      // leía como «el colegio no tiene años escolares» y la pantalla salía
      // vacía y sin explicación.
      const leer = async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(url);
        return r.json();
      };
      const [p, c, k] = await Promise.all([
        leer('/api/administracion-escolar/periodos'),
        leer('/api/administracion-escolar/cursos'),
        leer('/api/administracion-escolar/conceptos'),
      ]);
      const listaPeriodos: Periodo[] = p.periodos ?? [];
      setPeriodos(listaPeriodos);
      setCursos(c.cursos ?? []);
      setConceptos(k.conceptos ?? []);

      // El año en curso viene puesto: es el que se va a elegir casi siempre.
      //
      // De entrada y nada más. Con un año ya elegido no se toca: esto reponía
      // el año en curso por debajo de quien estaba cobrando otro, y con el año
      // se caía el grupo.
      const activo = listaPeriodos.find((x) => x.activo);
      setForm((f) => (f.periodoId ? f : {
        ...f,
        periodoId: activo ? String(activo.id) : '',
      }));
    } catch {
      setErrorCarga(true);
    } finally {
      setCargandoCat(false);
    }
  }, []);

  useEffect(() => { void cargarCatalogos(); }, [cargarCatalogos, intentoCarga]);

  const cursosActivos = useMemo(
    () => cursos.filter((c) => c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );
  const conceptosActivos = useMemo(() => conceptos.filter((c) => c.activo !== false), [conceptos]);
  const conceptoSeleccionado = conceptos.find((c) => String(c.id) === form.conceptoId) ?? null;
  const esMensualidad = conceptoSeleccionado?.tipo === 'mensualidad';
  const periodoForm = periodos.find((p) => String(p.id) === form.periodoId);
  const mesesForm = mesesDelPeriodo(periodoForm?.fechaInicio, periodoForm?.fechaFin);
  const hoy = hoyRD();

  /**
   * El grupo elegido, leído siempre a través del catálogo del año escolar.
   *
   * De aquí salen las opciones que se enseñan Y la lista de secciones que se
   * manda: si cada cosa leyera lo guardado por su lado, podría verse un grupo
   * de este año mientras se cobra a un servicio del año pasado.
   */
  const periodoNum = Number(form.periodoId) || null;
  const grupo = useMemo(
    () => normalizarFiltro(cursosActivos, periodoNum, form.grupo),
    [cursosActivos, periodoNum, form.grupo],
  );
  /**
   * Las secciones del grupo. `null` es todo el colegio: no se manda lista.
   *
   * Salen del catálogo ENTERO, no solo de las activas que se ofrecen: una
   * sección se puede desactivar con alumnos dentro (borrarla es lo que está
   * bloqueado), y esos alumnos siguen siendo de Primaria. Con solo las activas
   * saldrían en todo el colegio y en ningún servicio, y «cobrarle a toda
   * Primaria» se los saltaría sin avisar.
   */
  const secciones = useMemo(
    () => seccionesDelFiltro(cursos, periodoNum, grupo),
    [cursos, periodoNum, grupo],
  );
  const grupoNombre = nombreDelGrupo(cursosActivos, periodoNum, grupo);
  const hayCursosEsteAnio = cursosActivos.some((c) => c.periodoId === periodoNum);

  /**
   * Cuántos alumnos hay en cada grupo y de qué curso es cada uno.
   *
   * Es solo una pista para elegir sin equivocarse: si no llega, las filas salen
   * sin número y la lista sin curso, y todo lo demás funciona. La frase de
   * cobrar NUNCA usa estos números; usa la lista que devuelve la revisión.
   */
  useEffect(() => {
    if (!periodoNum) return;
    let vigente = true;
    void (async () => {
      try {
        const todas: MatriculaActiva[] = [];
        let paginas = 1;
        // La ruta da 200 por página como mucho. Diez páginas son dos mil
        // alumnos: más que eso no es el colegio para el que está hecho esto, y
        // un número a medias sería peor que ninguno.
        for (let pagina = 1; pagina <= paginas; pagina += 1) {
          if (pagina > 10) throw new Error('demasiadas');
          const r = await fetch(
            `/api/administracion-escolar/matriculas?periodoId=${periodoNum}&estado=activa&porPagina=200&pagina=${pagina}`,
          );
          if (!r.ok) throw new Error('matriculas');
          const d = await r.json();
          todas.push(...((d.matriculas ?? []) as MatriculaActiva[]));
          paginas = Number(d.paginas) || 1;
        }
        if (vigente) setAlumnos({ periodoId: periodoNum, matriculas: todas });
      } catch {
        if (vigente) setAlumnos(null);
      }
    })();
    return () => { vigente = false; };
  }, [periodoNum]);

  // Las de otro año no valen: mientras llegan las de este, no hay números.
  const matriculasDelAnio = alumnos !== null && alumnos.periodoId === periodoNum ? alumnos.matriculas : null;
  const conteo = useMemo(
    () => (matriculasDelAnio ? contarAlumnos(cursos, periodoNum, matriculasDelAnio) : null),
    [cursos, periodoNum, matriculasDelAnio],
  );
  const cursoPorAlumno = useMemo(
    () => (matriculasDelAnio ? cursoDeCadaAlumno(matriculasDelAnio) : new Map<number, string>()),
    [matriculasDelAnio],
  );

  /**
   * ¿Este cobro ya se le puso a alguien este año escolar, y a cuánto?
   *
   * El servidor no le pone dos veces el mismo cobro a un alumno en el mismo año
   * escolar, lo haya pagado o no. El segundo «día de cine», cobrado con el
   * mismo nombre, se salta a quien fue al primero: se avisa en el paso 1, antes
   * de elegir a quién. De paso, si el monto está vacío se rellena con lo que se
   * cobró la última vez. Si la consulta falla no se enseña nada: es una ayuda.
   *
   * No tira lo revisado: solo escribe con el monto vacío, y con el monto vacío
   * no se pudo pasar del paso 1. Y solo escribe si la persona no está ya
   * escribiendo ahí.
   */
  const cobroConPista = conceptoSeleccionado !== null && !esCobroFijo(conceptoSeleccionado.tipo);
  useEffect(() => {
    const cobroId = form.conceptoId;
    const periodoId = form.periodoId;
    if (!cobroConPista || !cobroId || !periodoId) return;
    let vigente = true;
    fetch(`/api/administracion-escolar/cargos?conceptoId=${cobroId}&periodoId=${periodoId}&porPagina=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente || !d) return;
        const cargos = (d.cargos ?? []) as { estado: string; montoCentavos: number }[];
        const ultimo = cargos.find((c) => c.estado !== 'anulado');
        if (!ultimo) return;
        setPista({ cobroId, periodoId, montoCentavos: ultimo.montoCentavos });
        // Con el cursor ya dentro del campo no se escribe nada. La consulta
        // tarda lo que se tarda en ir del cobro al campo: si llegaba entre el
        // clic y la primera tecla, «75» se pegaba detrás del «50» que vino solo
        // y quedaban RD$5,075. En ese caso el monto se ofrece debajo, con un
        // botón, y la persona decide.
        if (document.activeElement?.id === 'lote-monto') return;
        setForm((f) => (f.conceptoId === cobroId && f.periodoId === periodoId && f.monto.trim() === ''
          ? { ...f, monto: String(ultimo.montoCentavos / 100), origenMonto: 'ultima-vez' }
          : f));
      })
      .catch(() => { /* Sin pista: no se avisa de nada. */ });
    return () => { vigente = false; };
  }, [cobroConPista, form.conceptoId, form.periodoId]);
  const yaCobrado = pista !== null && pista.cobroId === form.conceptoId && pista.periodoId === form.periodoId;

  /**
   * Cuántas veces se ha invalidado la revisión. Con esto se reconoce la
   * respuesta de una pregunta que ya no es la que hay en pantalla.
   *
   * Revisar tarda —la base a veces está dormida— y mientras tanto todo sigue
   * vivo. Sin la cuenta, cambiar de todo el colegio a «Sala de tareas» con la
   * revisión en camino dejaba elegida la sala y, debajo, la lista del colegio
   * entero lista para cobrar.
   */
  const revisionPedida = useRef(0);
  /** Las marcas que dejó la persona, con la pregunta a la que pertenecen. */
  const memoriaMarcas = useRef<MemoriaDeMarcas | null>(null);
  /** Un segundo clic en «Sí, cobrar» antes de que se apague el botón no crea dos veces. */
  const enviando = useRef(false);
  /**
   * El «crear» que se quedó sin respuesta, hasta que se sepa qué pasó con él.
   *
   * No lo borra cambiar un dato: lo borra la siguiente revisión de ESA misma
   * pregunta (misma clave), que es la que puede contestar si se creó. Aunque
   * entre medias se corrija el monto, lo que se intentó sigue siendo lo que se
   * intentó.
   */
  const intentoSinRespuesta = useRef<IntentoSinRespuesta | null>(null);
  /** Guardar el cobro nuevo se quedó sin respuesta y ni siquiera se pudo mirar si se guardó. */
  const dudaAlCrearCobro = useRef(false);

  /** Cambiar cualquier dato del cargo invalida lo revisado: se vuelve a pedir. */
  const limpiarRevision = useCallback(() => {
    revisionPedida.current += 1;
    setRevision(null);
    setSeleccion(new Set());
    setErrorPaso2(null);
    setAvisoMarcas(false);
    setAvisoComprobado(null);
    // Lo que venga de camino ya no se va a pintar: el botón vuelve a «Continuar».
    setRevisando(false);
  }, []);

  /**
   * Lo que se le va a preguntar al servidor, entero. `null` si falta algo del
   * paso 1 (no debería: «Continuar» ya lo valida).
   *
   * El mes solo viaja con una mensualidad. Antes viajaba el que hubiera
   * guardado aunque el campo no estuviera a la vista: se elegía una
   * mensualidad, luego «Excursión», y la excursión salía con mes — y con mes,
   * «ya lo tiene» se decide distinto. El año ya no se teclea: es el del mes de
   * la mensualidad o, para lo demás, el de hoy.
   */
  function armarPedido(): PedidoRevisado | null {
    const { centavos, problema } = leerMonto(form.monto);
    if (!periodoForm || !conceptoSeleccionado || problema !== null) return null;
    if (esMensualidad && !form.mes) return null;
    const aMano = form.quien === 'a-mano';
    const cuerpo: CuerpoGenerar = {
      periodoId: periodoForm.id,
      // El grupo va como lista de secciones, que es lo único con lo que se
      // puede decir «toda Primaria». Con todo el colegio no va nada.
      ...(secciones === null ? {} : { cursoIds: secciones }),
      conceptoId: conceptoSeleccionado.id,
      mes: esMensualidad && form.mes ? Number.parseInt(form.mes) : null,
      anio: esMensualidad && form.anio ? Number.parseInt(form.anio) : Number(hoyRD().slice(0, 4)),
      montoCentavos: centavos,
      fechaVencimiento: form.fechaVencimiento || null,
    };
    return {
      cuerpo,
      cobro: conceptoSeleccionado.nombre,
      mesTexto: cuerpo.mes ? mesEnLetras(cuerpo.mes, cuerpo.anio) : null,
      aMano,
      clave: claveDeQuienes(cuerpo, aMano),
      anioEscolar: periodoForm.nombre,
      anioEnCurso: periodoForm.activo,
    };
  }

  /**
   * Elegir un cobro que ya existe. `extra.precioCentavos` llega cuando se trae
   * un producto del catálogo: su precio pasa al monto si la persona no había
   * escrito el suyo.
   *
   * Un monto que «vino solo» (el de la última vez, el del catálogo) era de
   * OTRO cobro y se vacía al cambiar; el que tecleó la persona se queda.
   */
  function elegirCobro(id: string, extra?: { precioCentavos?: number }) {
    limpiarRevision();
    const cobro = conceptos.find((c) => String(c.id) === id);
    const esDeMes = cobro?.tipo === 'mensualidad';
    const primerMes = esDeMes ? mesInicial(periodoForm) : null;
    const precio = extra?.precioCentavos;
    setNombreNuevo(null);
    setNombreCorregido(null);
    setNotaCobro(null);
    setErrores((e) => ({ ...e, cobro: undefined, nombre: undefined, mes: undefined }));
    setForm((f) => {
      const vinoSolo = f.origenMonto !== null;
      const ponerPrecio = precio != null && precio > 0 && (vinoSolo || f.monto.trim() === '');
      return {
        ...f,
        conceptoId: id,
        ...(esDeMes
          ? (perteneceMes(periodoForm, f.mes, f.anio)
            ? {}
            : { mes: String(primerMes?.mes ?? ''), anio: String(primerMes?.anio ?? '') })
          : { mes: '', anio: '' }),
        ...(ponerPrecio
          ? { monto: String((precio as number) / 100), origenMonto: 'catalogo' as const }
          : vinoSolo ? { monto: '', origenMonto: null } : {}),
      };
    });
  }

  /** Elegir «Un cobro nuevo»: todavía no hay cobro, hay un nombre por escribir. */
  function elegirCobroNuevo() {
    limpiarRevision();
    setNombreNuevo((n) => n ?? '');
    setNombreCorregido(null);
    setNotaCobro(null);
    setErrores((e) => ({ ...e, cobro: undefined, mes: undefined }));
    setForm((f) => ({
      ...f,
      conceptoId: '',
      mes: '',
      anio: '',
      ...(f.origenMonto !== null ? { monto: '', origenMonto: null } : {}),
    }));
  }

  function cambiarMes(key: string) {
    const elegido = mesesForm.find((m) => m.key === key);
    if (!elegido) return;
    limpiarRevision();
    setErrores((e) => ({ ...e, mes: undefined }));
    setForm((f) => ({ ...f, mes: String(elegido.mes), anio: String(elegido.anio) }));
  }

  function cambiarMonto(texto: string) {
    limpiarRevision();
    setErrores((e) => ({ ...e, monto: undefined }));
    // Lo tecleó la persona: ya no «vino solo».
    setForm((f) => ({ ...f, monto: texto, origenMonto: null }));
  }

  function cambiarFecha(iso: string) {
    limpiarRevision();
    setErrores((e) => ({ ...e, fecha: undefined }));
    setForm((f) => ({ ...f, fechaVencimiento: iso }));
  }

  /** «Usar ese monto»: lo que se cobró la última vez, puesto porque la persona lo pidió. */
  function usarMontoDeLaUltimaVez() {
    if (!pista || !yaCobrado) return;
    const centavos = pista.montoCentavos;
    limpiarRevision();
    setErrores((e) => ({ ...e, monto: undefined }));
    setForm((f) => ({ ...f, monto: String(centavos / 100), origenMonto: 'ultima-vez' }));
  }

  /**
   * Deja elegido un cobro que resultó estar guardado. Dice si con él se puede
   * seguir sin más (un cobro suelto) o si hay que pararse a mirarlo.
   */
  function adoptarCobro(cobro: Concepto): 'creado' | 'ya-existia' {
    limpiarRevision();
    setNombreNuevo(null);
    setNombreCorregido(null);
    setForm((f) => ({ ...f, conceptoId: String(cobro.id), mes: '', anio: '' }));
    if (cobro.tipo === 'otro') return 'creado';
    setNotaCobro(cobro.nombre);
    return 'ya-existia';
  }

  /**
   * Lee otra vez los cobros del colegio y busca uno con ese nombre.
   * `'no-se-pudo'` si ni siquiera se pudo leer.
   */
  async function buscarCobroGuardado(nombre: string): Promise<Concepto | null | 'no-se-pudo'> {
    const lista = await leerCobros();
    if (!lista) return 'no-se-pudo';
    // Solo los cobros: no se recargan los catálogos, que devolvían el año
    // escolar al que está en curso.
    setConceptos(lista);
    return cobroConEseNombre(lista, nombre);
  }

  /**
   * Guarda el cobro nuevo y lo deja elegido.
   *
   * Si el nombre ya es el de un cobro del colegio no se crea un gemelo: queda
   * elegido el que hay y se dice. Dos cobros iguales en el catálogo no se ven
   * el uno al otro, y el segundo no sabría a quién se le cobró el primero.
   *
   * Por lo mismo, si guardar se queda SIN RESPUESTA (se cortó la red, un 5xx)
   * no se deja repetir a ciegas: el cobro pudo guardarse, y «pulsa Continuar
   * otra vez» creaba el gemelo. Antes de volver a guardar se leen los cobros
   * y, si ya está, se usa ese.
   */
  async function crearConcepto(): Promise<'creado' | 'ya-existia' | 'fallo'> {
    const nombre = (nombreNuevo ?? '').trim();
    const gemelo = cobroConEseNombre(conceptos, nombre);
    if (gemelo) {
      elegirCobro(String(gemelo.id));
      setNotaCobro(gemelo.nombre);
      return 'ya-existia';
    }
    setCreandoConcepto(true);
    try {
      if (dudaAlCrearCobro.current) {
        const guardado = await buscarCobroGuardado(nombre);
        if (guardado === 'no-se-pudo') {
          setErrores((e) => ({ ...e, nombre: ERRORES_PASO_1.crear }));
          return 'fallo';
        }
        dudaAlCrearCobro.current = false;
        if (guardado) return adoptarCobro(guardado);
      }

      let res: Response | null = null;
      let data: { concepto?: Concepto } | null = null;
      try {
        res = await fetch('/api/administracion-escolar/conceptos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // 'otro' y no 'mensualidad': esto es un cobro suelto. El tipo decide la
          // frecuencia —la mensualidad nace mensual y generaría once cuotas— y
          // decide también en qué pestaña de la ficha aparece el cargo.
          body: JSON.stringify({ nombre, tipo: 'otro' }),
        });
        data = await res.json().catch(() => null);
      } catch {
        res = null;
      }
      const creado = data?.concepto;
      if (res?.ok && creado) {
        // Se añade a la lista y ya: recargar los catálogos devolvía el año
        // escolar al que está en curso.
        setConceptos((lista) => [...lista, { ...creado, activo: creado.activo !== false }]);
        limpiarRevision();
        setNombreNuevo(null);
        setNombreCorregido(null);
        // Es de esta visita: se le puede corregir el nombre mientras no se cobre con él.
        setCobroDeEstaVisita(creado.id);
        setForm((f) => ({ ...f, conceptoId: String(creado.id), mes: '', anio: '' }));
        return 'creado';
      }
      // Un «no» claro del servidor: no se guardó.
      if (res && res.status >= 400 && res.status < 500) {
        const texto = res.status === 403 ? ERRORES_PASO_1.crear403 : ERRORES_PASO_1.crear;
        setErrores((e) => ({ ...e, nombre: texto }));
        return 'fallo';
      }
      // Sin respuesta, un 5xx o una respuesta ilegible: pudo guardarse. Se mira
      // ahora; si tampoco se puede mirar, se mira antes del próximo intento.
      const guardado = await buscarCobroGuardado(nombre);
      if (guardado === 'no-se-pudo') dudaAlCrearCobro.current = true;
      else if (guardado) return adoptarCobro(guardado);
      setErrores((e) => ({ ...e, nombre: ERRORES_PASO_1.crear }));
      return 'fallo';
    } finally {
      setCreandoConcepto(false);
    }
  }

  /**
   * Guarda el nombre corregido del cobro de esta visita. Va por la ruta que ya
   * edita un cobro en Configuración; el permiso es el mismo con el que se creó.
   */
  async function renombrarCobro(id: number, nombre: string): Promise<boolean> {
    if (cobroConEseNombre(conceptos.filter((c) => c.id !== id), nombre)) {
      setErrores((e) => ({ ...e, nombre: ERRORES_PASO_1.nombreRepetido }));
      return false;
    }
    setCreandoConcepto(true);
    try {
      const res = await fetch(`/api/administracion-escolar/conceptos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json().catch(() => null);
      const guardado: Concepto | undefined = data?.concepto;
      if (!res.ok || !guardado) {
        setErrores((e) => ({ ...e, nombre: ERRORES_PASO_1.renombrar }));
        return false;
      }
      setConceptos((lista) => lista.map((c) => (c.id === guardado.id ? { ...c, nombre: guardado.nombre } : c)));
      setNombreCorregido(null);
      // El nombre va en la frase de cobrar: lo revisado con el nombre viejo ya no vale.
      limpiarRevision();
      return true;
    } catch {
      setErrores((e) => ({ ...e, nombre: ERRORES_PASO_1.renombrar }));
      return false;
    } finally {
      setCreandoConcepto(false);
    }
  }

  /**
   * «Continuar» del paso 1. Cada cosa que falta se dice debajo de SU campo y el
   * cursor va al primero: un único aviso arriba («cobro, año y monto son
   * obligatorios») obligaba a buscar cuál de los cuatro era.
   */
  async function continuarPaso1() {
    if (creandoConcepto) return;
    const esNuevo = nombreNuevo !== null;
    // ¿Se corrigió el nombre del cobro creado en esta visita? `null` = no.
    const corregido = !esNuevo && conceptoSeleccionado !== null && nombreCorregido !== null
      && conceptoSeleccionado.id === cobroDeEstaVisita
      && nombreCorregido.trim() !== conceptoSeleccionado.nombre
      ? nombreCorregido.trim()
      : null;
    const faltan: ErroresPaso1 = {};
    if (!esNuevo && !conceptoSeleccionado) faltan.cobro = ERRORES_PASO_1.cobro;
    if (esNuevo && !nombreNuevo.trim()) faltan.nombre = ERRORES_PASO_1.nombre;
    if (corregido === '') faltan.nombre = ERRORES_PASO_1.nombre;
    const { problema } = leerMonto(form.monto);
    if (problema !== null) faltan.monto = ERRORES_PASO_1.monto[problema];
    if (esMensualidad && !form.mes) faltan.mes = ERRORES_PASO_1.mes;
    if (form.fechaVencimiento && !esFechaValida(form.fechaVencimiento)) faltan.fecha = ERRORES_PASO_1.fecha;
    setErrores(faltan);

    const primero = faltan.cobro ? 'input[name="lote-cobro"]'
      : faltan.nombre ? '#lote-nombre'
      // Un año escolar sin fechas no tiene meses que elegir: no hay selector, y
      // el foco va al párrafo que lo explica. Va antes que el monto porque con
      // ese cobro no se puede seguir se escriba lo que se escriba. Sin esto
      // «Continuar» no hacía nada a la vista.
      : faltan.mes && mesesForm.length === 0 ? '#lote-mes-sin-fechas'
      : faltan.monto ? '#lote-monto'
      : faltan.mes ? '#lote-mes'
      : faltan.fecha ? '#lote-fecha'
      : null;
    if (primero) { enfocar(primero); return; }

    if (esNuevo) {
      const hecho = await crearConcepto();
      // Si ya existía no se avanza: tiene que verse cuál quedó elegido y, si
      // toca, el aviso de que ese cobro ya se le puso a alguien este año.
      if (hecho === 'fallo') enfocar('#lote-nombre');
      if (hecho !== 'creado') return;
    } else if (corregido !== null && conceptoSeleccionado) {
      const guardado = await renombrarCobro(conceptoSeleccionado.id, corregido);
      if (!guardado) { enfocar('#lote-nombre'); return; }
    }
    setPaso(2);
  }

  async function revisar() {
    const pedido = armarPedido();
    // No debería faltar nada: al paso 2 solo se llega con el paso 1 validado.
    if (!pedido) { setPaso(1); return; }
    // Un grupo sin secciones no tiene a nadie, y no hace falta preguntarlo: se
    // sabe aquí.
    if (secciones?.length === 0) {
      setErrorPaso2(null);
      setRevision({ creados: 0, omitidos: 0, total: 0, detalles: [], grupo: grupoNombre, pedido });
      setSeleccion(new Set());
      return;
    }
    setRevisando(true);
    setErrorPaso2(null);
    const estaVez = revisionPedida.current;
    // De un cobro suelto se mira además quién lo tiene ya guardado CON mes, que
    // el servidor no ve al preguntarle sin mes. Sale a la vez que la revisión
    // para no hacer esperar el doble. Una mensualidad no lo necesita: ahí «ya
    // lo tiene» es, a propósito, por mes.
    const quienesLoTienen = pedido.cuerpo.mes === null
      ? alumnosConEseCobro(pedido.cuerpo.conceptoId, pedido.cuerpo.periodoId)
      : Promise.resolve<number[]>([]);
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pedido.cuerpo, dryRun: true }),
      });
      let data = await res.json().catch(() => null);
      // Se tocó algo mientras viajaba: esta lista es de otra pregunta y no se
      // pinta. Queda el paso 2 con su «Continuar», que es la verdad.
      if (estaVez !== revisionPedida.current) return;
      if (!res.ok || !data || !Array.isArray(data.detalles)) {
        // El texto del servidor está escrito para quien programa: se traduce.
        setErrorPaso2(mensajeDeError('revisar', res.ok ? 500 : res.status, data?.error).texto);
        return;
      }
      const conEseCobro = await quienesLoTienen;
      if (estaVez !== revisionPedida.current) return;
      if (!Array.isArray(conEseCobro)) {
        // Sin saber quién lo tiene no se enseña la lista: saldría marcado
        // alguien a quien ya se le cobró.
        setErrorPaso2(ERRORES_AL_COMPROBAR_EL_COBRO[conEseCobro]);
        return;
      }
      data = marcarLosQueYaLoTienen(data as Generacion, new Set(conEseCobro));

      // ¿Se viene de un «crear» que se quedó sin respuesta? Entonces esta lista
      // contesta lo único que la persona quiere saber: si se crearon o no.
      const intento = intentoSinRespuesta.current;
      let comprobado: string | null = null;
      if (intento && intento.pedido.clave === pedido.clave) {
        intentoSinRespuesta.current = null;
        const enviados = intento.marcados.map((m) => m.estudianteId);
        const comprobacion = comprobarIntento(enviados, (data as Generacion).detalles);
        // Estaban creados: se enseña el «Listo», no una lista de casillas
        // bloqueadas con un botón de «Crear un cobro nuevo» al lado.
        if (comprobacion.veredicto === 'se-crearon') { darPorCreado(intento, comprobacion); return; }
        comprobado = avisoDeComprobacion(comprobacion);
        // No estaban (todos) creados: la lista vuelve con las marcas que se
        // mandaron —quien ya lo tenga se cae solo de ellas—, no con todo el
        // grupo marcado otra vez ni invitando a marcar a los que se quitaron.
        if (comprobado !== null) memoriaMarcas.current = { clave: pedido.clave, ids: enviados };
      }

      // El grupo y el pedido van con la lista: son los de esta respuesta, se
      // mueva lo que se mueva después.
      setRevision({ ...(data as Generacion), grupo: grupoNombre, pedido });
      // En un grupo vienen marcados los que pueden recibirlo; marcando a mano,
      // nadie. Y si la persona ya había marcado sobre esta misma pregunta
      // (volvió a corregir el monto), se conservan sus marcas.
      const marcas = marcasTrasRevisar(
        (data as Generacion).detalles, pedido.aMano, memoriaMarcas.current, pedido.clave,
      );
      // Las marcas de otra pregunta no vuelven nunca, ni aunque se regrese a ella.
      if (!marcas.recordadas) memoriaMarcas.current = null;
      setSeleccion(new Set(marcas.ids));
      setAvisoComprobado(comprobado);
      // Lo comprobado ya dice qué pasó con las marcas: no se repite.
      setAvisoMarcas(marcas.recordadas && comprobado === null);
      // Solo se abre el paso 3 si hay a quién cobrarle, y solo si la persona
      // sigue en el 2: si mientras tanto abrió el paso 1 para mirar algo, no se
      // la saca de ahí.
      if (data.creados > 0) setPaso((p) => (p === 2 ? 3 : p));
    } catch {
      // El fallo de una pregunta que ya no está en pantalla tampoco se enseña.
      if (estaVez === revisionPedida.current) setErrorPaso2(mensajeDeError('revisar', 0, null).texto);
    } finally {
      // Solo la pregunta vigente apaga el «Buscando…»: una respuesta vieja que
      // llega tarde no puede apagar el de la nueva.
      if (estaVez === revisionPedida.current) setRevisando(false);
    }
  }

  /**
   * El «crear» que se quedó sin respuesta resultó creado: se enseña el mismo
   * «Listo» que habría salido, con lo que se intentó (su cobro, su monto) y con
   * una línea que dice que se comprobó.
   */
  function darPorCreado(intento: IntentoSinRespuesta, comprobacion: Comprobacion) {
    const { pedido } = intento;
    const monto = pedido.cuerpo.montoCentavos;
    const creados = comprobacion.conCargo.length;
    const idos = new Set(comprobacion.desaparecidos);
    setResultado({
      creados,
      omitidos: 0,
      detalles: comprobacion.conCargo,
      pedido,
      grupo: intento.grupo,
      noEncontrados: [],
      comprobado: true,
      sinComprobar: intento.marcados.filter((m) => idos.has(m.estudianteId)).map((m) => m.nombre),
    });
    setPista({
      cobroId: String(pedido.cuerpo.conceptoId),
      periodoId: String(pedido.cuerpo.periodoId),
      montoCentavos: monto,
    });
    memoriaMarcas.current = null;
    limpiarRevision();
    toast.success(
      `Comprobado: ${creados === 1 ? 'sí se creó 1 cargo' : `sí se crearon ${creados} cargos`} de «${pedido.cobro}»`,
      { description: `${fmtDOP(monto)} a cada uno · ${fmtDOP(creados * monto)} en total` },
    );
  }

  /** «Continuar» del paso 2: es lo que antes era el botón «Revisar». */
  function continuarPaso2() {
    if (revisando) return;
    if (form.quien === null) {
      setErrorPaso2(ERROR_SIN_ELEGIR_A_QUIEN);
      enfocar('input[name="lote-quien"]');
      return;
    }
    // Se volvió del paso 3 sin cambiar nada: la lista y las marcas siguen
    // valiendo, y no se le pregunta otra vez al servidor.
    if (revision && revision.creados > 0) { setPaso(3); return; }
    void revisar();
  }

  /**
   * Crea los cargos. Manda lo REVISADO —el pedido que guardó la revisión— más
   * la lista de marcados; no vuelve a leer nada de lo que hay escrito arriba.
   *
   * Con la lista vacía no hace nada: el servidor lee «sin lista» como «a todos
   * los del grupo», y quitarle la marca a todos acabaría cobrándoles a todos.
   */
  async function crear() {
    if (!revision || seleccion.size === 0) return;
    if (enviando.current) return;
    enviando.current = true;
    const { pedido, grupo: grupoRevisado, detalles: revisados } = revision;
    const marcados = new Set(seleccion);
    setCreando(true);
    setErrorCrear(null);
    try {
      let status = 0;
      let data: (Generacion & { error?: string }) | null = null;
      try {
        const res = await fetch('/api/administracion-escolar/cargos/generar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...revision.pedido.cuerpo, dryRun: false, estudianteIds: [...seleccion] }),
        });
        status = res.status;
        data = await res.json().catch(() => null);
      } catch {
        status = 0;
      }

      const respondio = status >= 200 && status < 300 && data !== null && Array.isArray(data.detalles);
      if (!respondio || data === null) {
        const fallo = mensajeDeError('crear', status, data?.error);
        if (fallo.seSabeQueNoSeCreo) {
          // Un «no» claro del servidor: no se creó nada. El aviso se queda
          // junto al botón y las marcas siguen como estaban.
          setErrorCrear(fallo.texto);
          return;
        }
        // Sin respuesta no se sabe si se crearon. Se apunta lo que se intentó
        // —a quiénes y con qué pedido—, se tira lo revisado y se vuelve al
        // paso 2: al mirar la lista otra vez se CONTESTA si se crearon (ver
        // `revisar`), y si resulta que no, vuelve con las mismas marcas.
        intentoSinRespuesta.current = {
          pedido,
          grupo: grupoRevisado,
          marcados: revisados
            .filter((d) => marcados.has(d.estudianteId))
            .map((d) => ({ estudianteId: d.estudianteId, nombre: d.nombre })),
        };
        // Puede que ya se haya cobrado con el cobro nuevo: su nombre ya no se toca.
        setCobroDeEstaVisita(null);
        setConfirmando(false);
        limpiarRevision();
        setPaso(2);
        setErrorPaso2(fallo.texto);
        return;
      }

      // A quién se marcó y el servidor ya no encontró en el grupo: se guardan
      // sus nombres ahora, que la revisión se borra a continuación.
      const respondidos = new Set(data.detalles.map((d) => d.estudianteId));
      const noEncontrados = revisados
        .filter((d) => marcados.has(d.estudianteId) && !respondidos.has(d.estudianteId))
        .map((d) => d.nombre);
      const monto = pedido.cuerpo.montoCentavos;
      setResultado({
        creados: data.creados,
        omitidos: data.omitidos,
        detalles: data.detalles.filter((d) => d.resultado === 'creado'),
        pedido,
        grupo: grupoRevisado,
        noEncontrados,
      });
      if (data.creados > 0) {
        // Desde ahora este cobro «ya se cobró este año»: si se vuelve al paso 1
        // tiene que avisarlo sin esperar a otra consulta.
        setPista({
          cobroId: String(pedido.cuerpo.conceptoId),
          periodoId: String(pedido.cuerpo.periodoId),
          montoCentavos: monto,
        });
        // Con el cobro ya puesto en la cuenta de alguien, su nombre no se corrige desde aquí.
        setCobroDeEstaVisita((id) => (id === pedido.cuerpo.conceptoId ? null : id));
        // Un intento anterior de ESTE MISMO cobro que seguía en duda (era de
        // otro grupo) ya no se puede contestar mirando la lista: quien lo
        // tenga ahora puede tenerlo por lo que se acaba de crear.
        const enDuda = intentoSinRespuesta.current?.pedido.cuerpo;
        if (enDuda && enDuda.conceptoId === pedido.cuerpo.conceptoId
          && enDuda.periodoId === pedido.cuerpo.periodoId && enDuda.mes === pedido.cuerpo.mes) {
          intentoSinRespuesta.current = null;
        }
      }
      memoriaMarcas.current = null;
      setConfirmando(false);
      limpiarRevision();
      // Se dice dos veces —aquí, que salta a la vista, y en el resultado, que
      // se queda—: crear ciento y pico de deudas no puede pasar en silencio.
      if (data.creados > 0) {
        toast.success(
          `${data.creados === 1 ? 'Se creó 1 cargo' : `Se crearon ${data.creados} cargos`} de «${pedido.cobro}»`,
          { description: `${fmtDOP(monto)} a cada uno · ${fmtDOP(data.creados * monto)} en total` },
        );
      } else {
        toast.warning('No se creó ningún cargo', {
          description: data.omitidos > 0
            ? 'Todos los marcados ya lo tenían.'
            : 'Los marcados ya no están matriculados en ese grupo.',
        });
      }
    } finally {
      enviando.current = false;
      setCreando(false);
    }
  }

  /** «Cobrar lo mismo a otro grupo»: se conserva el paso 1 y se pregunta otra vez a quién. */
  function otroGrupo() {
    limpiarRevision();
    setResultado(null);
    setAvisoAnio(false);
    setForm((f) => ({ ...f, grupo: TODOS_LOS_CURSOS, quien: null }));
    setPaso(2);
  }

  /** «Hacer otro cargo»: todo como al entrar, salvo el año escolar. */
  function otroCargo() {
    limpiarRevision();
    setResultado(null);
    setAvisoAnio(false);
    setNombreNuevo(null);
    setNotaCobro(null);
    setErrores({});
    setForm((f) => ({ ...formVacio(), periodoId: f.periodoId }));
    setPaso(1);
  }

  /**
   * Guarda las marcas y las apunta con la pregunta a la que pertenecen: si la
   * persona vuelve a corregir el monto, al regresar siguen como las dejó.
   */
  function guardarMarcas(siguiente: Set<number>) {
    setSeleccion(siguiente);
    if (revision) memoriaMarcas.current = { clave: revision.pedido.clave, ids: [...siguiente] };
  }

  function alternar(id: number) {
    const siguiente = new Set(seleccion);
    if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
    guardarMarcas(siguiente);
  }

  function marcarVarios(ids: number[], marcar: boolean) {
    const siguiente = new Set(seleccion);
    for (const id of ids) {
      if (marcar) siguiente.add(id); else siguiente.delete(id);
    }
    guardarMarcas(siguiente);
  }

  // Estar en el paso 3 sin lista no es un estado: se enseña el 2.
  const pasoVisible: 1 | 2 | 3 = paso === 3 && !revision ? 2 : paso;
  const estadoDe = (i: 1 | 2 | 3) => (i === pasoVisible ? 'abierto' : i < pasoVisible ? 'contestado' : 'pendiente');
  const hayResultado = resultado !== null;

  /**
   * Al cambiar de paso, el foco va a su título: quien usa teclado o lector de
   * pantalla tiene que enterarse de que la pregunta es otra, y seguir desde
   * ahí. No en la primera pintura, que le robaría el foco a la página.
   */
  const focoPendiente = useRef<string | null>(null);
  const primeraPintura = useRef(true);
  useEffect(() => {
    if (primeraPintura.current) { primeraPintura.current = false; return; }
    const id = focoPendiente.current ?? (hayResultado ? 'lote-resultado' : `lote-paso-${pasoVisible}`);
    focoPendiente.current = null;
    const destino = document.getElementById(id);
    if (!destino) return;
    destino.focus({ preventScroll: true });
    const sinAnimar = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    destino.scrollIntoView({ block: 'nearest', behavior: sinAnimar ? 'auto' : 'smooth' });
  }, [pasoVisible, hayResultado]);

  /**
   * Lo que va a pasar al confirmar. Sale de lo REVISADO y de las marcas, que es
   * exactamente lo que manda `crear`: la barra y el diálogo pintan este mismo
   * objeto, así que no pueden decir una cosa y cobrarse otra.
   */
  const frase = revision ? fraseDelCobro({
    montoCentavos: revision.pedido.cuerpo.montoCentavos,
    cobro: revision.pedido.cobro,
    mesTexto: revision.pedido.mesTexto,
    aMano: revision.pedido.aMano,
    grupo: revision.grupo,
    marcados: seleccion.size,
    enLaLista: revision.total,
    fechaVencimiento: revision.pedido.cuerpo.fechaVencimiento,
    hoy,
  }) : null;
  // A quién se le quitó la marca. Marcando a mano no se dice: ahí lo normal es
  // que casi nadie esté marcado.
  const quitados = revision && !revision.pedido.aMano
    ? revision.detalles
      .filter((d) => d.resultado !== 'duplicado' && !seleccion.has(d.estudianteId))
      .map((d) => d.nombre)
    : [];

  /**
   * A quién sí y a quién no, con nombres, debajo de la frase. Marcando uno por
   * uno se dice a quiénes se marcó —la frase ahí solo dice cuántos, y ocho es
   * el número esperado aunque uno sea el alumno de la fila de al lado—; en un
   * grupo, a quién se le quitó la marca. El diálogo enseña más nombres que la
   * barra porque ahí no tapa la lista.
   */
  const notasDeLaFrase = (topeMarcados: number): string[] => (revision && frase?.principal ? [
    revision.pedido.aMano
      ? fraseDeMarcados(nombresMarcados(revision.detalles, seleccion), topeMarcados)
      : null,
    quitados.length > 0 ? fraseDeQuitados(quitados) : null,
    revision.omitidos > 0 ? fraseDeDuplicados(revision.omitidos) : null,
  ].filter((nota): nota is string => nota !== null) : []);
  const notasBarra = notasDeLaFrase(5);

  /** Qué hacer cuando todos los del grupo tienen ya el cobro: otro mes, otro cobro u otro grupo. */
  const consejoSinNadie = revision
    ? consejoTodosLoTienen({ mesTexto: revision.pedido.mesTexto, puedeCrear: puedeConfigurar })
    : null;

  const montoLeido = leerMonto(form.monto);
  const resumenPaso1 = conceptoSeleccionado && montoLeido.problema === null
    ? resumenQueSeCobra({
      montoCentavos: montoLeido.centavos,
      cobro: conceptoSeleccionado.nombre,
      mesTexto: esMensualidad && form.mes && form.anio ? mesEnLetras(Number(form.mes), Number(form.anio)) : null,
      fechaVencimiento: form.fechaVencimiento || null,
    })
    : '';
  const resumenPaso2 = revision
    ? resumenAQuien({ aMano: revision.pedido.aMano, grupo: revision.grupo, total: revision.total })
    : '';

  if (cargandoPermisos) {
    return (
      <section className="p-4 sm:p-6">
        <div className="max-w-3xl space-y-5">
          <Volver />
          <Cargando />
        </div>
      </section>
    );
  }

  if (!puedeGestionar) {
    return (
      <section className="p-4 sm:p-6">
        <Volver />
        <p className="mt-6 text-gray-500">
          No tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.
        </p>
      </section>
    );
  }

  const catalogosListos = !cargandoCat && !errorCarga;
  const selectorAbierto = cambiandoAnio || !periodoForm;

  return (
    <section className="p-4 sm:p-6">
      <div className="max-w-3xl space-y-5">
        <Volver />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cargo a varios alumnos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cóbrales lo mismo a varios alumnos de una vez: el día de cine, la excursión, la foto del curso.
            Son tres pasos y no se le cobra a nadie hasta que confirmes al final.
          </p>

          {/* El año escolar no es una pregunta: casi nunca cambia y viene
              puesto. Se dice en una línea y quien necesite otro lo cambia. */}
          {catalogosListos && periodoForm && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
              <span>
                Año escolar: <span className="font-medium text-gray-900">{periodoForm.nombre}</span>
              </span>
              {!periodoForm.activo && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  No es el año en curso
                </span>
              )}
              {periodos.length > 1 && !hayResultado && (
                // Abre y cierra: quien lo abrió por mirar tiene que poder
                // dejarlo como estaba sin elegir nada.
                <button type="button" className={ENLACE} aria-expanded={selectorAbierto}
                  aria-controls="lote-anio-escolar" onClick={() => setCambiandoAnio((a) => !a)}>
                  Cambiar
                </button>
              )}
            </div>
          )}

          {catalogosListos && periodos.length > 0 && !periodoForm && (
            <p className="mt-3 text-sm text-amber-800">
              Tu colegio no tiene un año escolar en curso. Elige con cuál vas a trabajar.
            </p>
          )}

          {catalogosListos && periodos.length > 0 && selectorAbierto && !hayResultado && (
            // El aire entre la etiqueta y el campo sale del hueco de la rejilla:
            // la etiqueta es de MUI y no respeta un margen puesto por clase.
            <div className="mt-3 grid max-w-xs gap-1.5">
              <Label htmlFor="lote-anio-escolar">Año escolar</Label>
              <NativeSelect id="lote-anio-escolar" value={form.periodoId} onChange={(e) => {
                const periodo = periodos.find((p) => String(p.id) === e.target.value);
                const siguiente = mesInicial(periodo);
                limpiarRevision();
                setForm((f) => ({
                  ...f,
                  periodoId: e.target.value,
                  grupo: TODOS_LOS_CURSOS,
                  quien: null,
                  // El mes solo se recoloca si lo que se cobra es una
                  // mensualidad; lo demás no tiene mes que mover.
                  ...(esMensualidad && !perteneceMes(periodo, f.mes, f.anio)
                    ? { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? '') }
                    : {}),
                }));
                setCambiandoAnio(false);
                // «Di otra vez a quién» solo tiene sentido si ya lo había dicho.
                setAvisoAnio((a) => a || form.quien !== null);
                setPaso((p) => (p === 3 ? 2 : p));
              }}>
                <option value="" disabled>Elige un año escolar</option>
                {periodos.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.nombre}{p.activo ? ' (en curso)' : ''}</option>
                ))}
              </NativeSelect>
              <p className="text-xs text-gray-500">
                Si lo cambias, tendrás que decir otra vez a quién se le cobra.
              </p>
            </div>
          )}
        </div>

        {cargandoCat ? (
          <Cargando />
        ) : errorCarga ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-semibold text-red-800">No se pudieron cargar los datos de tu colegio.</p>
            <p className="mt-1 text-sm text-red-700">No se ha creado nada. Revisa tu conexión e inténtalo otra vez.</p>
            <div className="mt-3">
              <Button variant="outline" onClick={() => setIntentoCarga((n) => n + 1)}>Intentar otra vez</Button>
            </div>
          </div>
        ) : periodos.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-700">
              Tu colegio todavía no tiene un año escolar. Créalo en Configuración y vuelve.
            </p>
            <div className="mt-3">
              <Button asChild variant="outline">
                <Link href="/escolar/configuracion/estructura">Ir a Configuración</Link>
              </Button>
            </div>
          </div>
        ) : !periodoForm ? null : resultado ? (
          <ResultadoLote
            creados={resultado.creados}
            omitidos={resultado.omitidos}
            detalles={resultado.detalles}
            pedido={resultado.pedido}
            grupo={resultado.grupo}
            noEncontrados={resultado.noEncontrados}
            comprobado={resultado.comprobado}
            sinComprobar={resultado.sinComprobar}
            hoy={hoy}
            onOtroGrupo={otroGrupo}
            onOtroCargo={otroCargo}
          />
        ) : (
          <div className="space-y-3">
            <PasoLote numero={1} titulo="Qué se cobra" estado={estadoDe(1)}
              resumen={resumenPaso1} onCambiar={() => setPaso(1)}>
              <QueSeCobra
                cobros={conceptosActivos}
                puedeCrear={puedeConfigurar}
                cobroId={form.conceptoId}
                nombreNuevo={nombreNuevo}
                cobroCorregibleId={cobroDeEstaVisita}
                nombreCorregido={nombreCorregido}
                esMensualidad={esMensualidad}
                meses={mesesForm}
                mesKey={form.mes && form.anio ? `${form.anio}-${String(form.mes).padStart(2, '0')}` : ''}
                monto={form.monto}
                origenMonto={form.origenMonto}
                montoUltimaVez={yaCobrado && pista ? pista.montoCentavos : null}
                fecha={form.fechaVencimiento}
                hoy={hoy}
                // Si el monto llegó solo después de avisar de que faltaba (la
                // consulta de «la última vez» tarda), el aviso ya no es verdad.
                errores={form.origenMonto !== null ? { ...errores, monto: undefined } : errores}
                notaRepetido={notaCobro}
                yaCobrado={yaCobrado}
                guardando={creandoConcepto}
                onElegirCobro={elegirCobro}
                onElegirNuevo={elegirCobroNuevo}
                onNombreNuevo={(texto) => {
                  setNombreNuevo(texto);
                  setErrores((e) => ({ ...e, nombre: undefined }));
                }}
                onNombreCorregido={(texto) => {
                  setNombreCorregido(texto);
                  setErrores((e) => ({ ...e, nombre: undefined }));
                }}
                onUsarUltimaVez={usarMontoDeLaUltimaVez}
                onMes={cambiarMes}
                onMonto={cambiarMonto}
                onFecha={cambiarFecha}
                // El cobro que se trae del catálogo de productos se añade a la
                // lista y ya. Antes se recargaban los tres catálogos, y esa
                // recarga devolvía el año escolar al que está en curso: quien
                // cobraba la reinscripción del año que viene acababa, sin tocar
                // nada más, con el colegio entero de este año en la lista.
                onConceptoCreado={(creado) => setConceptos((lista) => (
                  lista.some((c) => c.id === creado.id)
                    ? lista
                    : [...lista, { ...creado, activo: creado.activo !== false }]
                ))}
                onContinuar={() => void continuarPaso1()}
              />
            </PasoLote>

            <PasoLote numero={2} titulo="A quién se le cobra" estado={estadoDe(2)}
              resumen={resumenPaso2} onCambiar={() => setPaso(2)}>
              <form noValidate className="space-y-4 px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
                onSubmit={(e) => { e.preventDefault(); continuarPaso2(); }}>
                <p className="text-sm text-gray-500">
                  Elige un grupo. En el paso siguiente ves la lista y le quitas la marca a quien no le toca.
                </p>

                {avisoAnio && form.quien === null && (
                  <p className={AVISO_AZUL}>Cambiaste el año escolar. Di otra vez a quién se le cobra.</p>
                )}

                {/* Un grupo, todo el colegio o los alumnos uno por uno. Nadie
                    viene elegido. Acota a quién se le pregunta; quién lo recibe
                    se termina de decidir marcando en la lista. */}
                <FiltroCurso
                  cursos={cursosActivos}
                  periodoId={periodoNum}
                  valor={grupo}
                  onChange={(elegido) => { limpiarRevision(); setForm((f) => ({ ...f, grupo: elegido, quien: 'grupo' })); }}
                  elegido={form.quien === 'grupo'}
                  conteo={conteo}
                  nombre="lote-quien"
                  etiquetadoPor="lote-paso-2"
                  filasExtra={[{
                    id: 'a-mano',
                    titulo: 'Solo algunos alumnos',
                    detalle: 'Los marcas tú, uno por uno, en el paso siguiente.',
                    puesta: form.quien === 'a-mano',
                    onElegir: () => {
                      limpiarRevision();
                      setForm((f) => ({ ...f, grupo: TODOS_LOS_CURSOS, quien: 'a-mano' }));
                    },
                  }]}
                />

                {!hayCursosEsteAnio && (
                  <p className="text-xs text-gray-500">
                    Este año escolar todavía no tiene cursos creados, por eso solo puedes elegir a todo el
                    colegio o marcar a los alumnos uno por uno.
                  </p>
                )}

                {conteo?.total === 0 && (
                  <p className="text-xs text-amber-700">
                    No hay alumnos matriculados en este año escolar. Los cargos se les crean a alumnos
                    matriculados: matricúlalos primero o cambia el año escolar arriba.{' '}
                    <Link href="/escolar/matriculas" className="font-medium underline hover:text-amber-900">
                      Ir a Matrículas
                    </Link>
                  </p>
                )}

                {/* El grupo no tiene a nadie. En ámbar y con titular: pintado
                    como una lista vacía parecía que «Continuar» no había hecho
                    nada. No se abre el paso 3: no hay nada que revisar. */}
                {revision && revision.total === 0 && (
                  <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-amber-900">
                        {revision.grupo
                          ? `No hay nadie matriculado en «${revision.grupo}»`
                          : 'No hay nadie matriculado en este año escolar'}
                      </p>
                      <p className="mt-0.5 text-sm text-amber-900">
                        {revision.grupo
                          ? 'Elige otro grupo.'
                          : 'Los cargos se les crean a alumnos matriculados. Matricúlalos primero o cambia el año escolar arriba.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Hay alumnos, pero todos tienen ya este cobro. Tampoco se
                    abre el paso 3: sería una lista entera de casillas bloqueadas. */}
                {revision && consejoSinNadie && revision.total > 0 && revision.creados === 0 && (
                  <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-amber-900">
                        {tituloTodosLoTienen(
                          revision.total, revision.grupo, revision.pedido.cobro, revision.pedido.mesTexto,
                        )}
                      </p>
                      {/* Una mensualidad se repite cada mes: lo que toca es
                          otro mes, no «un cobro nuevo con otro nombre». */}
                      <p className="mt-0.5 text-sm text-amber-900">{consejoSinNadie.texto}</p>
                      {consejoSinNadie.accion === 'otro-mes' && (
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            focoPendiente.current = 'lote-mes';
                            setPaso(1);
                          }}>
                            Elegir otro mes
                          </Button>
                        </div>
                      )}
                      {consejoSinNadie.accion === 'cobro-nuevo' && (
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            focoPendiente.current = 'lote-nombre';
                            elegirCobroNuevo();
                            setPaso(1);
                          }}>
                            Crear un cobro nuevo
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {errorPaso2 && (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {errorPaso2}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="submit" className="w-full sm:w-auto bg-zero-600 hover:bg-zero-700" disabled={revisando}>
                    {revisando
                      ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />Buscando a los alumnos…</>
                      : 'Continuar'}
                  </Button>
                </div>
              </form>
            </PasoLote>

            <PasoLote numero={3} titulo="Revisa y confirma" estado={estadoDe(3)}>
              {revision && frase && (
                <>
                  <div className="space-y-3 px-4 pt-3 sm:px-5">
                    <p className="text-sm text-gray-600">
                      {revision.pedido.aMano
                        ? 'Marca a los alumnos que les toca. Puedes buscarlos por nombre o por curso.'
                        : 'Estos son los alumnos. Quítale la marca a quien no le toca.'}
                    </p>
                    {/* Se viene de un «crear» sin respuesta y no estaba (todo)
                        creado: se dice antes que nada, porque es la pregunta
                        con la que la persona llega aquí. */}
                    {avisoComprobado && <p role="status" className={AVISO_AZUL}>{avisoComprobado}</p>}
                    {avisoMarcas && (
                      <p className={AVISO_AZUL}>
                        Se volvió a comprobar la lista y tus marcas siguen como las dejaste.
                      </p>
                    )}
                    <ListaAlumnosLote
                      detalles={revision.detalles}
                      seleccion={seleccion}
                      cursoPorAlumno={cursoPorAlumno}
                      aMano={revision.pedido.aMano}
                      onAlternar={alternar}
                      onMarcarVarios={marcarVarios}
                    />
                  </div>

                  {/* En el teléfono lo que acompaña a la frase —el plazo, a
                      quién sí y a quién no— va aquí, al final de la lista, y NO
                      pegado abajo: con todo dentro, la barra tapaba media
                      pantalla y crecía con cada marca que se quitaba. Desde el
                      portátil va dentro de la barra, donde cabe. */}
                  {frase.principal && (
                    <div className="space-y-1 px-4 pt-3 text-sm text-gray-600 sm:hidden">
                      <p>{frase.plazo}</p>
                      {notasBarra.map((nota) => <p key={nota} className="break-words">{nota}</p>)}
                    </div>
                  )}

                  {/* La barra de cobrar va pegada al borde de abajo de la
                      pantalla: con ciento cincuenta nombres, un botón al final
                      de la lista queda a seis pantallas de lo que se acaba de
                      marcar. Y lleva la frase entera, no un número suelto: es
                      lo que se lee justo antes de pulsar. */}
                  <div className="sticky bottom-0 z-10 mt-4 rounded-b-xl border-t border-zero-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(15,17,24,.18)] backdrop-blur sm:flex sm:items-center sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1" aria-live="polite">
                      {frase.principal ? (
                        <>
                          <p className="break-words text-base font-semibold leading-snug text-gray-900 sm:text-lg">
                            {frase.principal}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">
                            <span className="font-semibold tabular-nums text-gray-900">{frase.total}</span>
                            <span className="hidden sm:inline">{' · '}{frase.plazo}</span>
                          </p>
                          {notasBarra.length > 0 && (
                            <p className="mt-0.5 hidden break-words text-sm text-gray-600 sm:block">
                              {notasBarra.join(' ')}
                            </p>
                          )}
                        </>
                      ) : (
                        // Sin nadie marcado no hay botón apagado que adivinar:
                        // en su sitio se dice qué falta.
                        <p className="text-sm font-medium text-gray-700">
                          {revision.pedido.aMano
                            ? 'Todavía no has marcado a nadie. Busca a cada alumno y márcalo.'
                            : 'No hay ningún alumno marcado. Marca al menos uno para poder cobrar.'}
                        </p>
                      )}
                    </div>
                    {frase.principal && (
                      <div className="mt-3 sm:mt-0 sm:shrink-0">
                        {/* Abre la confirmación; no escribe nada. */}
                        <Button size="lg" className="w-full sm:w-auto bg-zero-600 hover:bg-zero-700"
                          onClick={() => { setErrorCrear(null); setConfirmando(true); }}>
                          <Check className="mr-1.5 h-4 w-4" aria-hidden />Cobrar a {alumnosEnLetras(seleccion.size)}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </PasoLote>
          </div>
        )}
      </div>

      <ConfirmarCobroDialog
        abierto={confirmando}
        frase={frase}
        marcados={seleccion.size}
        notas={notasDeLaFrase(12)}
        avisos={revision ? avisosDeConfirmar({
          pedido: revision.pedido, grupo: revision.grupo, marcados: seleccion.size, enLaLista: revision.total,
        }) : []}
        creando={creando}
        error={errorCrear}
        onCerrar={() => { setConfirmando(false); setErrorCrear(null); }}
        onConfirmar={() => void crear()}
      />
    </section>
  );
}

function Volver() {
  return (
    <Link href="/escolar/cargos"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" aria-hidden />Volver a cargos
    </Link>
  );
}

/** Mientras llegan los permisos o los catálogos: ni pasos ni «no tienes permiso» hasta saberlo. */
function Cargando() {
  return (
    <div role="status" className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-zero-600" aria-hidden />
      <p className="mt-3 text-sm text-gray-500">Cargando los datos de tu colegio…</p>
    </div>
  );
}
