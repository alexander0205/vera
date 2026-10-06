'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { BuscadorSelect, type OpcionBuscador } from '@/components/ui/buscador-select';
import { SelectorCurso, type CursoOpcion } from '@/components/administracion-escolar/SelectorCurso';
import { PlanCobroSelector } from '@/components/administracion-escolar/PlanCobroSelector';
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';

/**
 * Matricular a un alumno: el ÚNICO diálogo que lo hace.
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
 */

interface Periodo { id: number; nombre: string; activo: boolean }

/** La sección con su grado y servicio: lo que necesita `SelectorCurso`. */
interface Curso extends CursoOpcion {
  activo: boolean; gradoActivo: boolean; servicioActivo: boolean;
}

interface EstudianteOpcion {
  id: number; nombres: string; apellidos: string; codigo: string | null; estado: string;
}

/** Un concepto de pago del colegio, para elegir cuáles se le cobran. */
interface Concepto { id: number; nombre: string; tipo: string; activo?: boolean }

/** Un cargo ya creado, tal como está en la cuenta del alumno. */
interface CargoMatricula {
  id: number;
  concepto: string | null;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
  /** Con factura detrás el monto ya no se corrige aquí: manda el e-CF. */
  ecfDocumentId?: number | null;
}

export interface MatriculaEditable {
  id: number;
  /** Opcional: desde la ficha del alumno ya se sabe quién es (`estudianteFijoId`). */
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

const hoy = () => new Date().toISOString().slice(0, 10);

const fmtRD = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** La matrícula que se edita. `null` = se crea una nueva. */
  matricula?: MatriculaEditable | null;
  /**
   * El alumno ya está decidido (se abre desde su ficha): no se ofrece elegirlo.
   * Sin esto el diálogo trae la lista de alumnos y enseña el buscador, que es
   * lo que hace falta en la pantalla de Matriculación.
   *
   * Dos props sueltas y no un objeto: un `{id, nombre}` escrito en el JSX es
   * otro objeto en cada pintado, y como de él cuelga el efecto que carga los
   * catálogos, el diálogo se quedaría pidiéndolos en bucle.
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
   * Es la PRIMERA matrícula del alumno. Cambia solo el texto, pero importa:
   * «Reinscribir» delante de alguien que nunca estuvo matriculado se lee como
   * si te hubieras equivocado de botón.
   */
  esPrimera?: boolean;
  /**
   * Código con el que arrancar el campo. Sale del alumno —su RNE, o el que ya
   * tenga— porque es el número con el que el colegio lo maneja en papel.
   */
  codigoSugerido?: string;
}

export function MatriculaDialog({
  open, onClose, onSaved, matricula = null,
  estudianteFijoId = null, estudianteFijoNombre = null,
  periodosOcupados = [], esPrimera = false, codigoSugerido,
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
  const [cargosActuales, setCargosActuales] = useState<CargoMatricula[]>([]);
  const [cargosCargando, setCargosCargando] = useState(false);
  /**
   * Los conceptos recurrentes de la matrícula que se edita, y el catálogo del
   * colegio para poder añadirle otro. Se piden aparte: el listado de matrículas
   * no trae «conceptosIds» y sin ellos no se sabe qué se le está cobrando.
   */
  const [conceptosMatricula, setConceptosMatricula] = useState<number[]>([]);
  const [conceptosCatalogo, setConceptosCatalogo] = useState<Concepto[]>([]);
  /** Se pidió cambiar de alumno: hasta entonces el campo solo enseña quién es. */
  const [cambiandoAlumno, setCambiandoAlumno] = useState(false);
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
    const pide = [
      fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
      fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
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
  }, [estudianteFijoId]);

  /**
   * Los alumnos, pedidos solo cuando hacen falta.
   *
   * Al editar no se bajan de entrada —son cientos de filas para enseñar un
   * nombre que ya se sabe—, pero sí en cuanto alguien pulsa «Cambiar».
   */
  const cargarEstudiantes = useCallback(async () => {
    const data = await fetch('/api/administracion-escolar/estudiantes/opciones')
      .then((r) => (r.ok ? r.json() : { estudiantes: [] }))
      .catch(() => ({ estudiantes: [] }));
    setEstudiantes((previos) => (previos.length > 0 ? previos : data.estudiantes ?? []));
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNuevoPeriodo(null);
    setConceptos([]);
    setCambiandoAlumno(false);
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
  }, [open, matricula, estudianteFijoId, cargarCat, ocupados, codigoSugerido]);

  /**
   * Al editar se traen los cargos REALES de la matrícula.
   *
   * No el plan: el plan dice lo que tocaría cobrar hoy según la configuración,
   * y eso ya no describe a un alumno matriculado hace meses —le han podido
   * anular una cuota o facturarle a mano. Lo que hay que enseñar al editar es
   * su cuenta, no la teoría.
   */
  useEffect(() => {
    if (!open || !matricula) { setCargosActuales([]); return; }
    let vigente = true;
    setCargosCargando(true);
    fetch(`/api/administracion-escolar/cargos?matriculaId=${matricula.id}&porPagina=200`)
      .then((res) => res.json())
      .then((data) => { if (vigente) setCargosActuales(data.cargos ?? []); })
      .catch(() => { if (vigente) setCargosActuales([]); })
      .finally(() => { if (vigente) setCargosCargando(false); });
    return () => { vigente = false; };
  }, [open, matricula]);

  /**
   * Qué se le cobra todos los meses a ESTA matrícula, y qué más podría cobrársele.
   *
   * Los dos en la misma espera para que la tarjeta no se pinte a medias: sin el
   * catálogo, los conceptos elegidos saldrían como «Concepto 31».
   */
  useEffect(() => {
    if (!open || !matricula) { setConceptosMatricula([]); setConceptosCatalogo([]); return; }
    let vigente = true;
    void Promise.all([
      fetch(`/api/administracion-escolar/matriculas/${matricula.id}`)
        .then((r) => (r.ok ? r.json() : { matricula: null })).catch(() => ({ matricula: null })),
      fetch('/api/administracion-escolar/conceptos')
        .then((r) => (r.ok ? r.json() : { conceptos: [] })).catch(() => ({ conceptos: [] })),
    ]).then(([m, c]) => {
      if (!vigente) return;
      setConceptosMatricula(((m.matricula?.conceptosIds ?? []) as unknown[]).map(Number));
      setConceptosCatalogo(c.conceptos ?? []);
    });
    return () => { vigente = false; };
  }, [open, matricula]);

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

  async function guardar() {
    if (!form.estudianteId || !form.periodoId || !form.cursoId) {
      setError('Estudiante, período y curso son obligatorios'); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(
        editando
          ? `/api/administracion-escolar/matriculas/${matricula.id}`
          : '/api/administracion-escolar/matriculas',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estudianteId: Number(form.estudianteId),
            periodoId: Number(form.periodoId),
            cursoId: Number(form.cursoId),
            documentoListaId: form.documentoListaId ? Number(form.documentoListaId) : null,
            codigoMatricula: form.codigoMatricula || null,
            fechaInscripcion: form.fechaInscripcion || null,
            notas: form.notas || null,
            // `conceptos`, que es como lo lee la API. Con otro nombre la
            // matrícula nacía sin cargos y sin decirlo.
            // Al editar viaja la lista de conceptos recurrentes: es lo que lee
            // el devengo para saber qué cargarle cada mes. Al crear va como
            // `conceptos`, que es como lo lee el alta.
            ...(editando ? { estado: form.estado, conceptosIds: conceptosMatricula } : { conceptos }),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando la matrícula');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando la matrícula');
    } finally { setSaving(false); }
  }

  const nombreFijo = estudianteFijoNombre ?? matricula?.estudianteNombre ?? null;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      {/* Ancho y en dos columnas: los datos de la inscripción a la izquierda y
          lo que se le va a cobrar a la derecha. */}
      <DialogContent maxWidth={false} className="flex !h-[85vh] !w-[80vw] !max-w-none flex-col">
        <ModalHeader
          title={editando ? 'Editar matrícula' : esPrimera ? 'Matricular estudiante' : 'Nueva matrícula'}
          subtitle={editando
            ? 'Corrige el curso, la fecha o el estado de esta inscripción.'
            : esPrimera
              ? 'Elige el período y el curso. De aquí sale su código de matrícula.'
              : 'Inscribe un estudiante en un período y curso.'} />

        <div className="flex-1 gap-6 overflow-y-auto px-6 py-4 md:grid md:grid-cols-2 md:items-start">
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-1.5">
              <Label>Estudiante *</Label>
              {/* Al editar se puede cambiar, pero no de un clic: el campo
                  arranca enseñando de quién es la matrícula y hay que pedir
                  «Cambiar». Cambiar de alumno mueve con él toda su deuda, y la
                  API lo niega en cuanto hay una factura o un pago detrás. */}
              {(editando || estudianteFijoId != null) && !cambiandoAlumno ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-10 flex-1 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                    {nombreFijo ?? 'Este estudiante'}
                  </div>
                  {editando && puedeGestionar && (
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => { setCambiandoAlumno(true); void cargarEstudiantes(); }}>
                      Cambiar
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <BuscadorSelect
                    value={form.estudianteId}
                    onChange={(v) => setForm((f) => ({ ...f, estudianteId: v }))}
                    opciones={opcionesEstudiante}
                    placeholder="Escribe el nombre o el código…"
                    vacio="Ningún alumno con ese nombre"
                  />
                  {editando && (
                    <p className="text-xs text-amber-700">
                      La deuda de esta matrícula se va con el alumno que elijas. No se puede si ya tiene facturas o pagos.
                    </p>
                  )}
                </>
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
          <div className="mt-4 flex min-h-0 flex-col gap-4 md:mt-0">
            {/* Al editar: lo que se le cobra todos los meses, y lo que ya se le
                cargó de verdad. Lo primero se cambia aquí —es la lista que lee
                el devengo—; lo segundo se corrige cargo a cargo. */}
            {editando && (
              <ConceptosRecurrentes
                catalogo={conceptosCatalogo}
                elegidos={conceptosMatricula}
                onCambio={setConceptosMatricula}
                editable={puedeGestionar}
              />
            )}

            {editando && (
              <CargosDeLaMatricula
                cargos={cargosActuales}
                cargando={cargosCargando}
                editable={puedeGestionar}
                onGuardado={(cargo) => setCargosActuales((lista) =>
                  lista.map((c) => (c.id === cargo.id ? { ...c, ...cargo } : c)))}
              />
            )}

            {/* Al crear: lo que va a deber el alumno. No se cobra nada aquí:
                los cargos nacen pendientes y salen en su estado de cuenta. */}
            {!editando && form.cursoId && (
              <PlanCobroSelector
                periodoId={form.periodoId}
                cursoId={form.cursoId}
                desde={form.fechaInscripcion || hoy()}
                onCambio={setConceptos}
              />
            )}

            {/* Sin sección elegida no hay nada que calcular; se dice, para que
                la columna no parezca rota. */}
            {!editando && !form.cursoId && (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center">
                <p className="text-sm text-gray-500">Elige la sección</p>
                <p className="mt-0.5 text-xs text-gray-400">Aquí sale lo que se le va a cobrar en el año.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={guardar} disabled={saving}>
            {saving
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</>
              : (editando ? 'Guardar cambios' : 'Crear matrícula')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/**
 * Los conceptos que esta matrícula paga TODOS LOS MESES.
 *
 * Es la lista que lee el devengo: lo que está marcado aquí se convierte en
 * cargo cuando llega su mes. Solo se podía elegir al matricular, así que al
 * alumno que empieza la sala de tareas en noviembre no había dónde apuntárselo
 * —se le creaban los cargos a mano, mes a mes, y en enero ya nadie se acordaba.
 *
 * Quitar uno no borra nada de lo ya cargado: deja de generarse hacia adelante.
 * Lo viejo se anula desde los cargos, que es donde se ve lo que se debe.
 */
function ConceptosRecurrentes({ catalogo, elegidos, onCambio, editable }: {
  catalogo: Concepto[];
  elegidos: number[];
  onCambio: (ids: number[]) => void;
  editable: boolean;
}) {
  const porId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);
  // Lo que todavía se le puede añadir: los conceptos vivos del colegio que no
  // tenga ya. Un concepto dado de baja no se ofrece, pero si lo tiene puesto se
  // sigue enseñando: esconderlo haría creer que no se le cobra.
  const disponibles = catalogo.filter((c) => c.activo !== false && !elegidos.includes(c.id));

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-sm font-medium text-gray-900">Conceptos de esta matrícula</span>
        <span className="text-xs text-gray-500">{elegidos.length} concepto(s)</span>
      </div>

      {elegidos.length === 0 ? (
        <p className="px-3 py-3 text-sm text-gray-500">
          No tiene ninguno marcado: se le cobrará lo que su grado pague por defecto.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
          {elegidos.map((id) => {
            const c = porId.get(id);
            return (
              <span key={id}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                {c?.nombre ?? `Concepto ${id}`}
                {editable && (
                  <button type="button" title="Quitar de esta matrícula"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => onCambio(elegidos.filter((x) => x !== id))}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {editable && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <NativeSelect
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) onCambio([...elegidos, id]);
            }}
          >
            <option value="">Agregar un concepto…</option>
            {disponibles.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre}{c.tipo === 'mensualidad' ? ' — mensualidad' : ''}
              </option>
            ))}
          </NativeSelect>
          <p className="mt-1.5 text-xs text-gray-500">
            Se cobra cada mes según su tarifa. Quitar uno no borra los cargos que ya tiene.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Los cargos REALES de la matrícula, con su precio corregible.
 *
 * No el plan: el plan dice lo que tocaría cobrar hoy según la configuración, y
 * eso ya no describe a un alumno matriculado hace meses —le han podido anular
 * una cuota o facturarle a mano—. Lo que hay que enseñar al editar es su
 * cuenta.
 *
 * El monto se edita aquí porque es donde se mira: el precio se escribe mal al
 * matricular, se ve mal al revisar la matrícula, y hasta ahora había que anular
 * el cargo y rehacerlo —perdiendo su mes y su cuota— para cambiar una cifra. Un
 * cargo ya facturado no se toca: manda la factura.
 */
function CargosDeLaMatricula({ cargos, cargando, editable, onGuardado }: {
  cargos: CargoMatricula[];
  cargando: boolean;
  editable: boolean;
  onGuardado: (cargo: Partial<CargoMatricula> & { id: number }) => void;
}) {
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir(c: CargoMatricula) {
    setEditandoId(c.id);
    setValor((c.montoCentavos / 100).toFixed(2));
    setError(null);
  }

  async function guardar(c: CargoMatricula) {
    const centavos = Math.round(Number(valor.replace(',', '.')) * 100);
    if (!Number.isFinite(centavos) || centavos < 0) { setError('Escribe un monto válido'); return; }
    if (centavos === c.montoCentavos) { setEditandoId(null); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/cargos/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montoCentavos: centavos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el monto');
      onGuardado({
        id: c.id,
        montoCentavos: data.cargo?.montoCentavos ?? centavos,
        saldoCentavos: data.cargo?.saldoCentavos ?? centavos,
        estado: data.cargo?.estado ?? c.estado,
      });
      setEditandoId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el monto');
    } finally { setGuardando(false); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200">
      <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-sm font-medium text-gray-900">Cargos de esta matrícula</span>
        <span className="text-xs text-gray-500">{cargos.length} cargo(s)</span>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {cargando ? (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />Cargando…
        </p>
      ) : cargos.length === 0 ? (
        <p className="px-3 py-4 text-sm text-gray-500">
          Todavía no tiene cargos. Se irán generando cada mes según el calendario.
        </p>
      ) : (
        <>
          {/* Ocupa lo que quede de alto en vez de 192px fijos: con doce meses
              había que arrastrar una lista de cuatro filas dentro de un diálogo
              medio vacío. */}
          <div className="min-h-[14rem] flex-1 overflow-y-auto">
            {cargos.map((c) => {
              const anulado = c.estado === 'anulado';
              const facturado = c.ecfDocumentId != null;
              const bloqueado = anulado || facturado;
              const editandoEste = editandoId === c.id;
              return (
                <div key={c.id}
                  className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {c.concepto ?? 'Sin concepto'}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {c.fechaVencimiento ? `vence ${fmtFechaCorta(c.fechaVencimiento)}` : 'sin vencimiento'}
                      {' · '}{anulado ? 'anulado' : c.saldoCentavos === 0 ? 'pagado' : 'pendiente'}
                      {facturado ? ' · facturado' : ''}
                    </span>
                  </span>

                  {editandoEste ? (
                    <span className="flex items-center gap-1">
                      <Input autoFocus type="number" step="0.01" min="0" value={valor} className="h-8 w-28 text-right"
                        onChange={(e) => setValor(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void guardar(c); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditandoId(null); }
                        }} />
                      <Button type="button" size="icon" className="h-8 w-8 bg-zero-600 hover:bg-zero-700"
                        disabled={guardando} onClick={() => void guardar(c)}>
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button type="button" size="icon" variant="outline" className="h-8 w-8"
                        disabled={guardando} onClick={() => setEditandoId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </span>
                  ) : (
                    <button type="button"
                      disabled={!editable || bloqueado}
                      onClick={() => abrir(c)}
                      title={facturado
                        ? 'Ya está en una factura: corrige la factura, no el cargo'
                        : anulado ? 'Cargo anulado'
                        : editable ? 'Cambiar el monto' : 'No tienes permiso para cambiarlo'}
                      className={`group flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
                        anulado ? 'text-gray-400 line-through'
                          : bloqueado || !editable ? 'font-medium text-gray-900'
                          : 'font-medium text-gray-900 hover:bg-gray-100'}`}>
                      <span className="whitespace-nowrap">{fmtRD(c.montoCentavos)}</span>
                      {editable && !bloqueado && (
                        <Pencil className="h-3 w-3 text-gray-400 group-hover:text-gray-700" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-baseline justify-between bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">Pendiente de pago</span>
            <span className="text-base font-semibold text-gray-900">
              {fmtRD(cargos
                .filter((c) => c.estado !== 'anulado')
                .reduce((a, c) => a + c.saldoCentavos, 0))}
            </span>
          </div>
          <p className="px-3 pb-2.5 pt-2 text-xs text-gray-500">
            Toca el monto para corregirlo. Para quitar un cargo, anúlalo desde la ficha del estudiante.
            Cambiar el curso aquí no recalcula los cargos ya creados.
          </p>
        </>
      )}
    </div>
  );
}
