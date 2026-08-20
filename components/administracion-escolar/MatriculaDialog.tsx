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
import { Loader2, Plus, X } from 'lucide-react';
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

/** Un cargo ya creado, tal como está en la cuenta del alumno. */
interface CargoMatricula {
  id: number;
  concepto: string | null;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
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

  useEffect(() => {
    if (!open) return;
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
      // El estudiante no se manda al editar: cambiar de alumno una matrícula ya
      // creada no es una corrección, es otra matrícula.
      const res = await fetch(
        editando
          ? `/api/administracion-escolar/matriculas/${matricula.id}`
          : '/api/administracion-escolar/matriculas',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(editando ? {} : { estudianteId: Number(form.estudianteId) }),
            periodoId: Number(form.periodoId),
            cursoId: Number(form.cursoId),
            documentoListaId: form.documentoListaId ? Number(form.documentoListaId) : null,
            codigoMatricula: form.codigoMatricula || null,
            fechaInscripcion: form.fechaInscripcion || null,
            notas: form.notas || null,
            // `conceptos`, que es como lo lee la API. Con otro nombre la
            // matrícula nacía sin cargos y sin decirlo.
            ...(editando ? { estado: form.estado } : { conceptos }),
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
      <DialogContent maxWidth={false} className="flex !h-[70vh] !w-[70vw] !max-w-none flex-col">
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
          <div className="mt-4 space-y-4 md:mt-0">
            {/* Al editar: lo que ya se le está cobrando de verdad. Se enseña
                para que quien corrige una matrícula vea las consecuencias — si
                le cambia el curso, estos montos ya no corresponden. */}
            {editando && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-sm font-medium text-gray-900">Cargos de esta matrícula</span>
                  <span className="text-xs text-gray-500">{cargosActuales.length} cargo(s)</span>
                </div>
                {cargosCargando ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />Cargando…
                  </p>
                ) : cargosActuales.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">
                    Todavía no tiene cargos. Se irán generando cada mes según el calendario.
                  </p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto">
                      {cargosActuales.map((c) => {
                        const anulado = c.estado === 'anulado';
                        return (
                          <div key={c.id}
                            className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0">
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {c.concepto ?? 'Sin concepto'}
                              </span>
                              <span className="block text-xs text-gray-500">
                                {c.fechaVencimiento ? `vence ${fmtFechaCorta(c.fechaVencimiento)}` : 'sin vencimiento'}
                                {' · '}{anulado ? 'anulado' : c.saldoCentavos === 0 ? 'pagado' : 'pendiente'}
                              </span>
                            </span>
                            <span className={`whitespace-nowrap text-sm ${anulado ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}`}>
                              {fmtRD(c.montoCentavos)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-baseline justify-between bg-gray-50 px-3 py-2.5">
                      <span className="text-sm font-medium text-gray-900">Pendiente de pago</span>
                      <span className="text-base font-semibold text-gray-900">
                        {fmtRD(cargosActuales
                          .filter((c) => c.estado !== 'anulado')
                          .reduce((a, c) => a + c.saldoCentavos, 0))}
                      </span>
                    </div>
                    <p className="px-3 pb-2.5 pt-2 text-xs text-gray-500">
                      Para quitar uno, anúlalo desde Cargos o desde la ficha del estudiante.
                      Cambiar el curso aquí no recalcula los cargos ya creados.
                    </p>
                  </>
                )}
              </div>
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
