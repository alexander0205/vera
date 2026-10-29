'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { mutate as revalidar } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { BuscadorSelect, type OpcionBuscador } from '@/components/ui/buscador-select';
import { SelectorCurso, type CursoOpcion } from '@/components/administracion-escolar/SelectorCurso';
import { PlanCobroSelector } from '@/components/administracion-escolar/PlanCobroSelector';
import { Loader2, Plus, X } from 'lucide-react';
import { hoyRD } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { Frecuencia } from '@/lib/administracion-escolar/calendario';
import type { CargoDeMatricula } from '@/lib/administracion-escolar/cobros-matricula';
import { ConceptosDeLaMatricula } from '@/components/administracion-escolar/ConceptosDeLaMatricula';
import { claveFichaEstudiante } from '@/lib/administracion-escolar/matricula-pantalla';

/**
 * Matricular a un alumno y editar su matrícula: el ÚNICO formulario que lo hace.
 *
 * Había dos, y hacían lo mismo con distinto resultado. El de la ficha del
 * alumno mandaba los conceptos marcados en `conceptosIds`, pero la API los lee
 * en `conceptos`: la matrícula se creaba sin un solo cargo y el alumno quedaba
 * inscrito sin deber nada. Nadie se enteraba hasta que no llegaba la factura
 * que no llegaba.
 *
 * Se quedó la forma del de Matriculación —dos columnas: la inscripción a la
 * izquierda, el dinero a la derecha— porque el plan de cobro es lo que hay que
 * revisar ANTES de aceptar, y en una sola columna quedaba mil píxeles más abajo.
 *
 * Era un diálogo que se abría encima de la ficha del alumno o del listado. Con
 * los cobros automáticos arriba y la cuenta entera debajo ya no cabía: la
 * cuenta de un año vivía en una caja con su propia barra de desplazamiento.
 * Ahora es el cuerpo de dos pantallas —`/escolar/matriculas/nueva` y
 * `/escolar/matriculas/[id]/editar`—, que ponen la cabecera, cargan lo que
 * antes pasaba quien abría el diálogo y deciden a dónde se vuelve. Aquí no hay
 * marco: los campos, las dos tarjetas del dinero y la barra de guardar.
 */

interface Periodo { id: number; nombre: string; activo: boolean }

/** La sección con su grado y servicio: lo que necesita `SelectorCurso`. */
interface Curso extends CursoOpcion {
  activo: boolean; gradoActivo: boolean; servicioActivo: boolean;
}

interface EstudianteOpcion {
  id: number; nombres: string; apellidos: string; codigo: string | null; estado: string;
}

/**
 * Un concepto de pago del colegio, para elegir cuáles se le cobran.
 *
 * `frecuencia` ya venía en la respuesta del catálogo y no se leía: es lo que
 * deja decir «cada mes» o «una sola vez» al lado de cada uno.
 */
interface Concepto {
  id: number; nombre: string; tipo: string; activo?: boolean; frecuencia?: Frecuencia;
  /** Días para pagar desde que nace el cargo. `null` = sin fecha límite. */
  diasParaPago?: number | null;
}

/** Cómo va la petición de los cobros automáticos de la matrícula que se edita. */
type CargaDeCobros = 'cargando' | 'lista' | 'fallo';

export interface MatriculaEditable {
  id: number;
  /** Opcional: quien monta el formulario puede decir quién es con `estudianteFijoId`. */
  estudianteId?: number;
  /** Para enseñar de quién es al editar; el alumno no se cambia. */
  estudianteNombre?: string | null;
  periodoId: number;
  cursoId: number;
  documentoListaId?: number | null;
  fechaInscripcion: string | null;
  estado: string;
  codigoMatricula: string | null;
  notas: string | null;
}

const ESTADOS = [
  { value: 'activa', label: 'Activa' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'anulada', label: 'Anulada' },
];

// Hoy en República Dominicana. Con la fecha UTC, de 8 p. m. a medianoche se
// proponía el día siguiente como fecha de inscripción.
const hoy = () => hoyRD();

const fmtRD = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  /**
   * La matrícula que se edita. `null` = se crea una nueva.
   *
   * Tiene que ser el MISMO objeto entre pintados (estado de quien lo monta, no
   * un literal en el JSX): de él cuelga el efecto que rellena el formulario, y
   * uno nuevo cada vez borraría lo que se está escribiendo.
   */
  matricula?: MatriculaEditable | null;
  /**
   * El alumno ya está decidido (se llega desde su ficha, o la matrícula que se
   * edita es suya): no se ofrece elegirlo. Sin esto el formulario trae la lista
   * de alumnos y enseña el buscador, que es lo que hace falta al matricular
   * desde Matriculación.
   *
   * Dos props sueltas y no un objeto: un `{id, nombre}` escrito en el JSX es
   * otro objeto en cada pintado, y como de él cuelga el efecto que carga los
   * catálogos, el formulario se quedaría pidiéndolos en bucle.
   */
  estudianteFijoId?: number | null;
  estudianteFijoNombre?: string | null;
  /**
   * Períodos en los que el alumno YA tiene una matrícula activa.
   *
   * No se pueden elegir: no se puede estar matriculado dos veces en el mismo
   * año. La base lo impide igual —índice único parcial— pero enterarse al
   * guardar, con el formulario lleno, es la peor forma de enterarse.
   */
  periodosOcupados?: number[];
  /**
   * Código con el que arrancar el campo. Sale del alumno —su RNE, o el que ya
   * tenga— porque es el número con el que el colegio lo maneja en papel.
   */
  codigoSugerido?: string;
  /** Salir sin guardar. A dónde se va lo decide la pantalla. */
  onCancelar: () => void;
  /**
   * La matrícula quedó guardada. Lleva de quién es: al matricular desde
   * Matriculación el alumno se elige aquí dentro y la pantalla no lo conoce.
   */
  onGuardado: (estudianteId: number) => void;
}

export function MatriculaFormulario({
  matricula = null,
  estudianteFijoId = null, estudianteFijoNombre = null,
  periodosOcupados = [], codigoSugerido,
  onCancelar, onGuardado,
}: Props) {
  const editando = matricula != null;
  const { permissions } = usePermissions();
  const puedeConfigurar = permissions.includes('administracion-escolar:configurar');
  // Corregir el alumno, los conceptos o el monto de un cargo es gestión, no
  // configuración del catálogo: quien solo consulta ve la matrícula pero no la
  // toca.
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  // El período de la matrícula que se edita no cuenta como ocupado: lo ocupa
  // ella misma, y sin esto no se podría ni abrir para cambiarle el curso.
  //
  // Se depende del CONTENIDO de la lista y no de la lista: un `[]` escrito en
  // el JSX (o el valor por defecto de esta misma prop) es un array nuevo en
  // cada pintado, y de este Set cuelga el efecto que trae los catálogos — el
  // diálogo se quedaba pidiéndolos en bucle hasta tumbar al navegador con
  // ERR_INSUFFICIENT_RESOURCES.
  const ocupadosClave = periodosOcupados.join(',');
  const ocupados = useMemo(
    () => new Set(ocupadosClave.split(',').map(Number).filter((n) => n && n !== matricula?.periodoId)),
    [ocupadosClave, matricula?.periodoId],
  );

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteOpcion[]>([]);
  /** Los listados de documentos que el colegio tenga configurados. */
  const [listasDoc, setListasDoc] = useState<{ id: number; nombre: string; documentos: number }[]>([]);
  const [form, setForm] = useState({
    estudianteId: '', periodoId: '', cursoId: '', documentoListaId: '',
    codigoMatricula: '', fechaInscripcion: hoy(), notas: '', estado: 'activa',
  });
  /**
   * Los conceptos que se le van a cargar. Solo al crear: en una matrícula que
   * ya existe los cargos están hechos y volver a ofrecerlos invita a duplicarlos.
   */
  const [conceptos, setConceptos] = useState<number[]>([]);
  /**
   * Los conceptos cuyo precio se escribió a mano para ESTE alumno, al
   * matricularlo. Se guardan como tarifa personal ANTES de crear la matrícula
   * —ver `guardar()`— porque el alta recalcula el plan en el servidor.
   */
  const [preciosPropios, setPreciosPropios] = useState<
    { conceptoId: number; montoCentavos: number; productId: number | null }[]
  >([]);
  const [cargosActuales, setCargosActuales] = useState<CargoDeMatricula[]>([]);
  const [cargosCargando, setCargosCargando] = useState(false);
  /** Hay más cargos de los que cupieron en la respuesta: no se puede operar sobre una parte. */
  const [cargosIncompletos, setCargosIncompletos] = useState(false);
  /**
   * Los conceptos recurrentes de la matrícula que se edita, y el catálogo del
   * colegio para poder añadirle otro. Se piden aparte: el listado de matrículas
   * no trae «conceptosIds» y sin ellos no se sabe qué se le está cobrando.
   */
  const [conceptosMatricula, setConceptosMatricula] = useState<number[]>([]);
  /** La generación (colegiatura) de la matrícula: su precio se cambia como en «Configuración mensual». */
  const [generacionId, setGeneracionId] = useState<number | null>(null);
  /**
   * Cómo va la petición de la lista de arriba. Una lista vacía porque todavía
   * no ha vuelto, o porque falló, no es lo mismo que una matrícula sin cobros
   * automáticos: sin distinguirlas la tarjeta afirmaba «no tiene ninguno»
   * mientras cargaba, y cada cargo de abajo salía marcado como «aparte».
   *
   * Solo decide qué se PINTA. No entra en nada de lo que se guarda.
   */
  const [conceptosCarga, setConceptosCarga] = useState<CargaDeCobros>('cargando');
  const [conceptosCatalogo, setConceptosCatalogo] = useState<Concepto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nuevoPeriodo, setNuevoPeriodo] = useState<string | null>(null);
  const [guardandoCat, setGuardandoCat] = useState(false);

  /**
   * Devuelve los períodos, y de paso el activo — que es el que hay que dejar
   * puesto al matricular. Se matricula SIEMPRE al año que va a empezar; dejar
   * el campo vacío obligaba a elegir a mano lo que ya se sabe.
   */
  const cargarCat = useCallback(async (): Promise<Periodo | null> => {
    // Sin períodos ni cursos no hay nada que elegir: si no llegan se dice, en
    // vez de dejar los desplegables vacíos y culpar luego a quien guarda.
    const obligatorio = (r: Response) => {
      if (!r.ok) throw new Error('catálogo');
      return r.json();
    };
    try {
    const pide = [
      fetch('/api/administracion-escolar/periodos').then(obligatorio),
      fetch('/api/administracion-escolar/cursos').then(obligatorio),
      // La lista de alumnos solo cuando hay que elegir uno: son cientos de
      // filas que la ficha del alumno no necesita para nada.
      estudianteFijoId != null ? Promise.resolve({ estudiantes: [] }) :
        fetch('/api/administracion-escolar/estudiantes/opciones').then((r) => r.json()),
    ];
    const [p, c, e, l] = await Promise.all([
      ...pide,
      // Si el colegio no configuró ninguno, el selector no se enseña: un
      // desplegable con una sola opción vacía solo confunde.
      fetch('/api/administracion-escolar/documentos/listas')
        .then((r) => (r.ok ? r.json() : { listas: [] }))
        .catch(() => ({ listas: [] })),
    ]);
    const lista: Periodo[] = p.periodos ?? [];
    setPeriodos(lista);
    setCursos(c.cursos ?? []);
    setEstudiantes(e.estudiantes ?? []);
    setListasDoc(l.listas ?? []);
    return lista.find((x) => x.activo) ?? null;
    } catch {
      setError('No se pudieron cargar los períodos y los cursos. Recarga la página.');
      return null;
    }
  }, [estudianteFijoId]);

  /**
   * Rellena el formulario al montarse.
   *
   * Vuelve a correr —y REESCRIBE lo escrito— si cambia la matrícula, el alumno
   * o el contenido de sus períodos ocupados. Por eso la pantalla no lo monta
   * hasta tener todo eso cargado, y se lo pasa desde su estado.
   */
  useEffect(() => {
    setError(null);
    setNuevoPeriodo(null);
    setConceptos([]);
    if (matricula) {
      // Al editar manda lo que ya tiene la matrícula. De la sección salen solos
      // el servicio y el grado: los deduce `SelectorCurso`.
      setForm({
        estudianteId: String(matricula.estudianteId ?? estudianteFijoId ?? ''),
        periodoId: String(matricula.periodoId),
        cursoId: String(matricula.cursoId),
        documentoListaId: matricula.documentoListaId ? String(matricula.documentoListaId) : '',
        fechaInscripcion: matricula.fechaInscripcion ?? hoy(),
        estado: matricula.estado,
        codigoMatricula: matricula.codigoMatricula ?? '',
        notas: matricula.notas ?? '',
      });
      void cargarCat();
    } else {
      setForm({
        estudianteId: estudianteFijoId != null ? String(estudianteFijoId) : '',
        periodoId: '', cursoId: '', documentoListaId: '',
        fechaInscripcion: hoy(), estado: 'activa',
        codigoMatricula: codigoSugerido ?? '', notas: '',
      });
      // El período activo queda puesto en cuanto llega el catálogo, salvo que
      // el alumno ya esté matriculado en él: entonces el campo se queda vacío
      // en vez de arrancar con una opción que no se puede guardar.
      void cargarCat().then((activo) => {
        if (activo && !ocupados.has(activo.id)) {
          setForm((f) => (f.periodoId ? f : { ...f, periodoId: String(activo.id) }));
        }
      });
    }
  }, [matricula, estudianteFijoId, cargarCat, ocupados, codigoSugerido]);

  /**
   * Al editar se traen los cargos REALES de la matrícula.
   *
   * No el plan: el plan dice lo que tocaría cobrar hoy según la configuración,
   * y eso ya no describe a un alumno matriculado hace meses —le han podido
   * anular una cuota o facturarle a mano. Lo que hay que enseñar al editar es
   * su cuenta, no la teoría.
   */
  const matriculaId = matricula?.id ?? null;
  /**
   * Vuelve a pedir los cargos. Lo llama la lista de conceptos después de cada
   * cambio (un precio, un concepto que se quita o se agrega): lo que se enseña
   * es siempre lo que quedó en el servidor, no lo que se cree que quedó.
   *
   * Si falla NO se vacía la lista: una cuenta en blanco se leería como «ya no
   * debe nada».
   */
  const recargarCargos = useCallback(async () => {
    if (matriculaId == null) return;
    try {
      const res = await fetch(`/api/administracion-escolar/cargos?matriculaId=${matriculaId}&porPagina=200`);
      if (!res.ok) return;
      const data = await res.json();
      const lista: CargoDeMatricula[] = data.cargos ?? [];
      setCargosActuales(lista);
      // La ruta pagina de 200 en 200. Con una parte, un cambio de monto o un
      // «quitar» dejaría fuera cargos sin que nadie lo viera.
      setCargosIncompletos(Number(data.total ?? lista.length) > lista.length);
    } catch { /* se queda lo que había */ }
  }, [matriculaId]);

  useEffect(() => {
    if (matriculaId == null) return;
    let vigente = true;
    setCargosCargando(true);
    void recargarCargos().finally(() => { if (vigente) setCargosCargando(false); });
    return () => { vigente = false; };
  }, [matriculaId, recargarCargos]);

  /**
   * Qué le carga el sistema por su cuenta a ESTA matrícula, y qué más podría
   * cargarle.
   *
   * Los dos en la misma espera para que la tarjeta no se pinte a medias: sin el
   * catálogo, los conceptos elegidos saldrían como «Concepto 31».
   */
  useEffect(() => {
    if (!matricula) return;
    let vigente = true;
    void Promise.all([
      fetch(`/api/administracion-escolar/matriculas/${matricula.id}`)
        .then((r) => (r.ok ? r.json() : { matricula: null })).catch(() => ({ matricula: null })),
      fetch('/api/administracion-escolar/conceptos')
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([m, c]) => {
      if (!vigente) return;
      const tenia = ((m.matricula?.conceptosIds ?? []) as unknown[]).map(Number);
      setConceptosMatricula(tenia);
      setGeneracionId(m.matricula?.conceptoMensualidadId != null ? Number(m.matricula.conceptoMensualidadId) : null);
      setConceptosCatalogo(c?.conceptos ?? []);
      setConceptosCarga(m.matricula != null && c != null ? 'lista' : 'fallo');
    });
    return () => { vigente = false; };
  }, [matricula]);

  // Una sección de un grado o servicio dado de baja no se ofrece: matricular
  // ahí deja al alumno colgando de una estructura que ya nadie mantiene.
  const cursosActivos = useMemo(
    () => cursos.filter((c) => c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );

  /** Los alumnos, con el código debajo para separar a los que se llaman igual. */
  const opcionesEstudiante = useMemo<OpcionBuscador[]>(
    () => estudiantes.filter((e) => e.estado === 'activo').map((e) => ({
      valor: String(e.id),
      etiqueta: `${e.nombres} ${e.apellidos}`,
      detalle: e.codigo ?? undefined,
    })),
    [estudiantes],
  );

  async function crearPeriodoInline() {
    if (!nuevoPeriodo?.trim()) return;
    setGuardandoCat(true); setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/periodos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoPeriodo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando período');
      await cargarCat();
      setForm((f) => ({ ...f, periodoId: String(data.periodo.id) }));
      setNuevoPeriodo(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando período');
    } finally { setGuardandoCat(false); }
  }

  /**
   * Deshace los precios propios que se alcanzaron a escribir.
   *
   * Silencioso: ya se le va a enseñar al usuario el error de verdad —el que
   * impidió matricular— y encadenarle un segundo mensaje sobre una limpieza
   * interna no le dice nada que pueda hacer. Para un precio de alumno el
   * borrado solo quita la tarifa, no toca cargos.
   */
  async function revertirPrecios(ids: number[]) {
    for (const id of ids) {
      try {
        await fetch(`/api/administracion-escolar/concepto-precios?id=${id}`, { method: 'DELETE' });
      } catch { /* el error que importa es el otro */ }
    }
  }

  /**
   * Lo que se guarda aquí cambia la ficha del alumno, que está en otra pantalla.
   *
   * Cuando esto era un diálogo encima de la ficha, bastaba con decirle
   * «recarga» al cerrarse. Ahora la ficha no está montada, y al volver a ella
   * no pide lo que pidió hace menos de 30 segundos: enseñaría la matrícula o
   * el monto de antes. Marcar su clave como vieja le obliga a pedirla.
   *
   * Se llama en CADA escritura, no solo al guardar la matrícula: el monto de un
   * cargo se guarda al momento, y de ahí se puede salir con «Cancelar».
   */
  function avisarALaFicha(estudianteId: number) {
    void revalidar(claveFichaEstudiante(estudianteId));
  }

  async function guardar() {
    if (!form.estudianteId || !form.periodoId || !form.cursoId) {
      setError('Estudiante, período y curso son obligatorios'); return;
    }
    setSaving(true); setError(null);
    try {
      /**
       * Los precios propios van PRIMERO, antes de crear la matrícula.
       *
       * El alta no se fía de los montos que mande el navegador: recalcula el
       * plan en el servidor (ver app/api/administracion-escolar/matriculas).
       * Si el precio personal se guardara después, los cargos ya estarían
       * hechos con la tarifa del grado y habría que corregirlos uno a uno —
       * justo el paseo que esto venía a quitar. Guardándolo antes, el servidor
       * lo resuelve él solo: la tarifa de alumno gana en la cadena.
       *
       * `devengar: false` porque la deuda la crea el alta un instante después;
       * pedirla aquí la duplicaría.
       */
      /**
       * Los precios ya escritos, para poder deshacerlos.
       *
       * Van antes que la matrícula, así que si la matrícula falla —el alumno ya
       * tenía una, el curso cambió— el precio se quedaría puesto sobre un
       * estudiante que nadie acabó de matricular, cambiándole lo que paga sin
       * que nadie lo decidiera. Se revierten.
       */
      const preciosEscritos: number[] = [];
      if (!editando && preciosPropios.length > 0) {
        for (const p of preciosPropios) {
          const r = await fetch('/api/administracion-escolar/concepto-precios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conceptoId:   p.conceptoId,
              periodoId:    Number(form.periodoId),
              objetivoTipo: 'estudiante',
              objetivoId:   Number(form.estudianteId),
              monto:        p.montoCentavos / 100,
              // El producto del plan, explícito: sin matrícula todavía, el
              // servidor no puede heredarlo de la tarifa que cubre al alumno y
              // rechazaría la tarifa por nacer sin producto. El plan ya lo trae
              // resuelto por la misma cadena, así que se manda tal cual.
              ...(p.productId != null ? { productId: p.productId } : {}),
              devengar:     false,
            }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            // Se corta aquí a propósito: seguir crearía la matrícula con la
            // tarifa del grado y el precio escrito se perdería en silencio.
            await revertirPrecios(preciosEscritos);
            throw new Error(d.error ?? 'No se pudo guardar el precio propio del alumno');
          }
          if (d.precio?.id) preciosEscritos.push(d.precio.id as number);
        }
      }

      const res = await fetch(
        editando
          ? `/api/administracion-escolar/matriculas/${matricula.id}`
          : '/api/administracion-escolar/matriculas',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // El estudiante no se manda al editar: cambiar de alumno una
            // matrícula ya creada no es una corrección, es otra matrícula.
            ...(editando ? {} : { estudianteId: Number(form.estudianteId) }),
            periodoId: Number(form.periodoId),
            cursoId: Number(form.cursoId),
            documentoListaId: form.documentoListaId ? Number(form.documentoListaId) : null,
            codigoMatricula: form.codigoMatricula || null,
            fechaInscripcion: form.fechaInscripcion || null,
            notas: form.notas || null,
            // `conceptos`, que es como lo lee la API. Con otro nombre la
            // matrícula nacía sin cargos y sin decirlo.
            // Al editar NO viaja la lista de conceptos: la guarda la tarjeta
            // «Lo que se le cobra», en el acto. Si este botón la mandara otra
            // vez, lo haría con la copia que tuviera esta pantalla, y pisaría
            // lo que se hubiera cambiado desde otra pestaña mientras tanto.
            // Al crear va como `conceptos`, que es como lo lee el alta.
            ...(editando ? { estado: form.estado } : { conceptos }),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        await revertirPrecios(preciosEscritos);
        throw new Error(data.error ?? 'Error guardando la matrícula');
      }
      const estudianteId = Number(form.estudianteId);
      avisarALaFicha(estudianteId);
      // El botón NO se suelta: la pantalla se va de aquí, y en lo que tarda en
      // llegar la siguiente un segundo clic mandaría la matrícula otra vez.
      onGuardado(estudianteId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando la matrícula');
      setSaving(false);
    }
  }

  const nombreFijo = estudianteFijoNombre ?? matricula?.estudianteNombre ?? null;

  return (
    <div className="space-y-4">
      {/* En dos columnas desde la tableta: los datos de la inscripción a la
          izquierda y lo que se le va a cobrar a la derecha. En el teléfono, una
          debajo de la otra. Sin alto fijo ni desplazamiento propio: desplaza la
          página, que es para lo que esto dejó de ser un diálogo. */}
      <div className="gap-6 md:grid md:grid-cols-2 md:items-start [&_button]:scroll-mb-24 [&_input]:scroll-mb-24 [&_select]:scroll-mb-24 [&_textarea]:scroll-mb-24">
        {/* Los campos van en su tarjeta blanca: la pantalla es gris, y sueltos
            sobre ese fondo no se distinguían de él. */}
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <div className="space-y-1.5">
            <Label>Estudiante *</Label>
            {editando || estudianteFijoId != null ? (
              <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                {nombreFijo ?? 'Este estudiante'}
              </div>
            ) : (
              <BuscadorSelect
                value={form.estudianteId}
                onChange={(v) => setForm((f) => ({ ...f, estudianteId: v }))}
                opciones={opcionesEstudiante}
                placeholder="Escribe el nombre o el código…"
                vacio="Ningún alumno con ese nombre"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Período *</Label>
            {nuevoPeriodo !== null ? (
              <InlineCrear value={nuevoPeriodo} onChange={setNuevoPeriodo} onGuardar={crearPeriodoInline}
                onCancelar={() => setNuevoPeriodo(null)} saving={guardandoCat} placeholder="Ej: 2026-2027" />
            ) : (
              <div className="flex gap-2">
                {/* Al cambiar de período se suelta el curso: las secciones son
                    de otro año escolar y la elegida ya no está en la lista. */}
                <NativeSelect className="flex-1" value={form.periodoId}
                  onChange={(e) => setForm((f) => ({ ...f, periodoId: e.target.value, cursoId: '' }))}>
                  <option value="" disabled>Seleccionar</option>
                  {periodos.map((p) => (
                    <option key={p.id} value={String(p.id)} disabled={ocupados.has(p.id)}>
                      {p.nombre}{ocupados.has(p.id) ? ' — ya está matriculado' : ''}
                    </option>
                  ))}
                </NativeSelect>
                {puedeConfigurar && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setNuevoPeriodo('')} title="Nuevo período">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Servicio → grado → sección, en tres campos. Antes era un solo
              desplegable con TODAS las secciones aplanadas, y como una sección
              se llama solo "A", la lista era «A, A, A, B…» sin saber cuál. */}
          <SelectorCurso
            cursos={cursosActivos}
            periodoId={Number(form.periodoId) || null}
            valor={form.cursoId}
            onChange={(v) => setForm((f) => ({ ...f, cursoId: v }))}
          />

          {/* Qué papeles se le piden a esta familia. Se elige a mano porque
              el colegio sabe cuál toca —«este viene de traslado»— y ninguna
              regla automática acierta en los casos raros, que son justo los
              que se atascan en recepción. */}
          {listasDoc.length > 0 && (
            <div className="space-y-1.5">
              <Label>Documentos que se le piden</Label>
              <NativeSelect value={form.documentoListaId}
                onChange={(e) => setForm((f) => ({ ...f, documentoListaId: e.target.value }))}>
                <option value="">Ninguno por ahora</option>
                {listasDoc.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.nombre}{l.documentos === 0 ? ' — vacío' : ` (${l.documentos})`}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código matrícula</Label>
              <Input placeholder="Opcional" value={form.codigoMatricula}
                onChange={(e) => setForm((f) => ({ ...f, codigoMatricula: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha inscripción</Label>
              <Input type="date" value={form.fechaInscripcion}
                onChange={(e) => setForm((f) => ({ ...f, fechaInscripcion: e.target.value }))} />
            </div>
          </div>

          {editando && (
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <NativeSelect value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                {ESTADOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </NativeSelect>
              <p className="text-xs text-gray-500">
                Retirada o anulada conservan el historial; solo una puede estar activa por año.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input placeholder="Opcional" value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </div>
        </div>

        {/* Columna derecha: el dinero. */}
        <div className="mt-4 flex flex-col gap-4 md:mt-0">
          {/* Al editar: UNA lista, un renglón por concepto, desde la que se le
              cambia el precio, se le quita o se le agrega otro. Eran dos
              tarjetas —lo que el sistema le carga por su cuenta y, debajo,
              los cargos mes por mes— y se pidió dejar solo los conceptos. El
              mes por mes vive en la ficha del estudiante.

              Recibe la fecha y el estado GUARDADOS, no los del formulario:
              lo que hace se aplica en el acto, sobre la matrícula tal como
              está en el servidor. */}
          {editando && (
            <ConceptosDeLaMatricula
              matriculaId={matricula.id}
              estudianteId={Number(form.estudianteId)}
              periodoId={matricula.periodoId}
              alumno={nombreFijo}
              inscritoDesde={matricula.fechaInscripcion}
              estado={matricula.estado}
              catalogo={conceptosCatalogo}
              automaticos={conceptosMatricula}
              carga={conceptosCarga}
              cargos={cargosActuales}
              cargosCargando={cargosCargando}
              cargosIncompletos={cargosIncompletos}
              editable={puedeGestionar}
              onAutomaticos={setConceptosMatricula}
              generacionId={generacionId}
              recargarCargos={recargarCargos}
              onCambio={() => {
                // Ya está guardado, se pulse «Guardar cambios» o no.
                const estudianteId = Number(form.estudianteId);
                if (estudianteId) avisarALaFicha(estudianteId);
              }}
            />
          )}

          {/* Al crear: lo que va a deber el alumno. No se cobra nada aquí:
              los cargos nacen pendientes y salen en su estado de cuenta.
              El envoltorio solo le pone el fondo blanco: la tarjeta es del
              selector, que también vive dentro de un diálogo. */}
          {!editando && form.cursoId && (
            <div className="rounded-lg bg-white">
              <PlanCobroSelector
                periodoId={form.periodoId}
                cursoId={form.cursoId}
                desde={form.fechaInscripcion || hoy()}
                // Para que la vista previa aplique la tarifa PERSONAL del
                // alumno, si ya tenía una de un año anterior.
                estudianteId={Number(form.estudianteId) || null}
                onCambio={setConceptos}
                // Poner el precio propio es configurar tarifas, no matricular:
                // sin ese permiso la fila se enseña igual, pero sin editor.
                onPrecios={puedeGestionar ? setPreciosPropios : undefined}
                // «Ver más»: lo de otros grados, que se guarda como su
                // tarifa propia con el resto de precios, antes de matricular.
                conOtros
              />
            </div>
          )}

          {/* Sin sección elegida no hay nada que calcular; se dice, para que
              la columna no parezca rota. */}
          {!editando && !form.cursoId && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-8 text-center">
              <p className="text-sm text-gray-500">Elige la sección</p>
              <p className="mt-0.5 text-xs text-gray-400">Aquí sale lo que se le va a cobrar en el año.</p>
            </div>
          )}
        </div>
      </div>

      {/* Cancelar y guardar, pegados al borde de abajo de la pantalla: con la
          cuenta de un año entero a la derecha, al final de la página quedaban
          a varias pantallas de lo que se acaba de cambiar. El error de guardar
          va aquí dentro por lo mismo: arriba del formulario no se vería.

          Ningún contenedor de aquí hasta el que desplaza la página (el del
          armazón del módulo) puede llevar `overflow`: la despegaría. */}
      <div className="sticky bottom-0 z-10 rounded-xl border border-zero-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(15,17,24,.18)] backdrop-blur sm:flex sm:items-center sm:gap-4 sm:px-5">
        <div className="min-w-0 flex-1">
          {error && (
            <p role="alert" className="mb-3 break-words text-sm font-medium text-red-700 sm:mb-0">{error}</p>
          )}
        </div>
        {/* En el teléfono «Cancelar» ocupa lo suyo y guardar se queda con el
            resto de la fila; desde la tableta, los dos a la derecha. */}
        <div className="flex items-center gap-2 sm:shrink-0">
          <Button variant="outline" onClick={onCancelar} disabled={saving}>Cancelar</Button>
          <div className="flex-1 sm:flex-none">
            <Button className="w-full sm:w-auto" onClick={guardar} disabled={saving}>
              {saving
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</>
                : (editando ? 'Guardar cambios' : 'Crear matrícula')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineCrear({ value, onChange, onGuardar, onCancelar, saving, placeholder }: {
  value: string; onChange: (v: string) => void; onGuardar: () => void; onCancelar: () => void;
  saving: boolean; placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <Input autoFocus placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      <Button type="button" size="icon" className="bg-zero-600 hover:bg-zero-700" onClick={onGuardar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={onCancelar} disabled={saving}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
