'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { SelectorCurso, type CursoOpcion } from '@/components/administracion-escolar/SelectorCurso';
import { PlanCobroSelector } from '@/components/administracion-escolar/PlanCobroSelector';
import { Loader2, Search, ArrowLeft, ArrowRight, Check, AlertTriangle, Users } from 'lucide-react';

/**
 * Matricular en lote: varios alumnos de la MISMA sección en una pasada.
 *
 * Tres pasos. (1) Se define el grupo una sola vez —período, sección y plan de
 * cobro—. (2) Se eligen los estudiantes. (3) Se revisa quién se puede matricular
 * y quién choca con una matrícula activa, y se confirma. Alumnos de grados
 * distintos se hacen en lotes distintos, porque el plan de cobro es el de la
 * sección.
 */

interface Periodo { id: number; nombre: string; activo: boolean }
interface Curso extends CursoOpcion { activo: boolean; gradoActivo: boolean; servicioActivo: boolean }
interface EstudianteOpcion { id: number; nombres: string; apellidos: string; codigo: string | null; estado: string }
interface ListaDoc { id: number; nombre: string; documentos: number }

interface ResultadoLote {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  resultado: 'crear' | 'creada' | 'conflicto' | 'invalido' | 'error';
  motivo?: string;
}
interface RespuestaLote {
  dryRun: boolean;
  resumen: { total: number; crear: number; conflicto: number; invalido: number; error: number };
  cargoTotalCentavos: number;
  cargoCount: number;
  resultados: ResultadoLote[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const fmtRD = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MatriculaLoteDialog({ open, onClose, onSaved }: Props) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteOpcion[]>([]);
  const [listasDoc, setListasDoc] = useState<ListaDoc[]>([]);

  const [periodoId, setPeriodoId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [documentoListaId, setDocumentoListaId] = useState('');
  const [notas, setNotas] = useState('');
  const [conceptos, setConceptos] = useState<number[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  const [revisando, setRevisando] = useState(false);
  const [revision, setRevision] = useState<RespuestaLote | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaLote | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: catálogos frescos y todo el wizard reiniciado.
  useEffect(() => {
    if (!open) return;
    setPaso(1);
    setPeriodoId(''); setCursoId(''); setFecha(hoy());
    setDocumentoListaId(''); setNotas(''); setConceptos([]);
    setBusqueda(''); setSeleccion(new Set());
    setRevision(null); setResultado(null); setError(null);

    void (async () => {
      const [p, c, e, l] = await Promise.all([
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
        fetch('/api/administracion-escolar/estudiantes/opciones').then((r) => r.json()),
        fetch('/api/administracion-escolar/documentos/listas')
          .then((r) => (r.ok ? r.json() : { listas: [] })).catch(() => ({ listas: [] })),
      ]);
      const lista: Periodo[] = p.periodos ?? [];
      setPeriodos(lista);
      setCursos(c.cursos ?? []);
      setEstudiantes(e.estudiantes ?? []);
      setListasDoc(l.listas ?? []);
      // Se matricula al año que va a empezar: el período activo queda puesto.
      const activo = lista.find((x) => x.activo);
      if (activo) setPeriodoId((v) => v || String(activo.id));
    })();
  }, [open]);

  const cursosActivos = useMemo(
    () => cursos.filter((c) => c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );

  const estudiantesActivos = useMemo(
    () => estudiantes.filter((e) => e.estado === 'activo'),
    [estudiantes],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es-DO');
    if (!q) return estudiantesActivos;
    return estudiantesActivos.filter((e) =>
      `${e.nombres} ${e.apellidos}`.toLocaleLowerCase('es-DO').includes(q)
      || (e.codigo ?? '').toLocaleLowerCase('es-DO').includes(q));
  }, [estudiantesActivos, busqueda]);

  function toggle(id: number) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // Selecciona/limpia SOLO lo que hay filtrado a la vista, para poder "marcar
  // todos los de 1.º" buscando "1" sin arrastrar al resto del colegio.
  const todosVisiblesMarcados = filtrados.length > 0 && filtrados.every((e) => seleccion.has(e.id));
  function marcarVisibles() {
    setSeleccion((s) => {
      const n = new Set(s);
      if (todosVisiblesMarcados) filtrados.forEach((e) => n.delete(e.id));
      else filtrados.forEach((e) => n.add(e.id));
      return n;
    });
  }

  const pedir = useCallback(async (dryRun: boolean): Promise<RespuestaLote | null> => {
    const res = await fetch('/api/administracion-escolar/matriculas/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodoId: Number(periodoId),
        cursoId: Number(cursoId),
        fechaInscripcion: fecha || null,
        documentoListaId: documentoListaId ? Number(documentoListaId) : null,
        notas: notas || null,
        conceptos,
        estudianteIds: [...seleccion],
        dryRun,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Error procesando el lote'); return null; }
    return data as RespuestaLote;
  }, [periodoId, cursoId, fecha, documentoListaId, notas, conceptos, seleccion]);

  async function irARevision() {
    setError(null); setRevisando(true);
    const data = await pedir(true);
    setRevisando(false);
    if (data) { setRevision(data); setPaso(3); }
  }

  async function confirmar() {
    setError(null); setConfirmando(true);
    const data = await pedir(false);
    setConfirmando(false);
    if (data) {
      setResultado(data);
      // La lista de matrículas de la pantalla de atrás ya no está al día.
      if (data.resumen.crear > 0) onSaved();
    }
  }

  const puedeSeguir1 = Boolean(periodoId && cursoId);
  const puedeSeguir2 = seleccion.size > 0;
  const cursoNombre = cursosActivos.find((c) => String(c.id) === cursoId)?.nombre ?? '';

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent maxWidth={false} className="flex !h-[78vh] !w-[70vw] !max-w-none flex-col">
        <ModalHeader
          title="Matricular en lote"
          subtitle={
            resultado ? 'Resultado del lote.'
            : paso === 1 ? 'Paso 1 de 3 · Define el grupo: período, sección y plan de cobro.'
            : paso === 2 ? 'Paso 2 de 3 · Elige los estudiantes de esta sección.'
            : 'Paso 3 de 3 · Revisa y confirma.'} />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── Resultado final ───────────────────────────────────────── */}
          {resultado ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Tarjeta n={resultado.resumen.crear} label="Matriculados" tono="verde" />
                <Tarjeta n={resultado.resumen.conflicto} label="Ya matriculados" tono="ambar" />
                {resultado.resumen.invalido > 0 && <Tarjeta n={resultado.resumen.invalido} label="No válidos" tono="gris" />}
                {resultado.resumen.error > 0 && <Tarjeta n={resultado.resumen.error} label="Con error" tono="rojo" />}
              </div>
              <TablaResultados filas={resultado.resultados} />
            </div>

          /* ── Paso 1: grupo ─────────────────────────────────────────── */
          ) : paso === 1 ? (
            <div className="gap-6 md:grid md:grid-cols-2 md:items-start">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Período *</Label>
                  <NativeSelect value={periodoId}
                    onChange={(e) => { setPeriodoId(e.target.value); setCursoId(''); }}>
                    <option value="" disabled>Seleccionar</option>
                    {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                  </NativeSelect>
                </div>

                <SelectorCurso
                  cursos={cursosActivos}
                  periodoId={Number(periodoId) || null}
                  valor={cursoId}
                  onChange={setCursoId}
                />

                {listasDoc.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Documentos que se les piden</Label>
                    <NativeSelect value={documentoListaId} onChange={(e) => setDocumentoListaId(e.target.value)}>
                      <option value="">Ninguno por ahora</option>
                      {listasDoc.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.nombre}{l.documentos === 0 ? ' — vacío' : ` (${l.documentos})`}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Fecha inscripción</Label>
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Input placeholder="Opcional · se aplica a todos" value={notas}
                    onChange={(e) => setNotas(e.target.value)} />
                </div>
              </div>

              <div className="mt-4 md:mt-0">
                {cursoId ? (
                  <PlanCobroSelector periodoId={periodoId} cursoId={cursoId} desde={fecha || hoy()} onCambio={setConceptos} />
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center">
                    <p className="text-sm text-gray-500">Elige la sección</p>
                    <p className="mt-0.5 text-xs text-gray-400">Aquí sale lo que se le cobrará a cada alumno del grupo.</p>
                  </div>
                )}
              </div>
            </div>

          /* ── Paso 2: estudiantes ───────────────────────────────────── */
          ) : paso === 2 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input className="pl-8" placeholder="Buscar por nombre o código…"
                    value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={marcarVisibles} disabled={filtrados.length === 0}>
                  {todosVisiblesMarcados ? 'Quitar visibles' : 'Marcar visibles'}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {seleccion.size} seleccionado(s){cursoNombre ? ` · sección ${cursoNombre}` : ''}
              </p>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {filtrados.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-gray-400">Ningún estudiante activo con ese nombre</p>
                ) : filtrados.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-zero-600 focus:ring-zero-500"
                      checked={seleccion.has(e.id)} onChange={() => toggle(e.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900">{e.nombres} {e.apellidos}</span>
                      {e.codigo && <span className="block text-xs text-gray-400">{e.codigo}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

          /* ── Paso 3: revisión ──────────────────────────────────────── */
          ) : (
            <div className="space-y-4">
              {revision && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Tarjeta n={revision.resumen.crear} label="Se matriculan" tono="verde" />
                    <Tarjeta n={revision.resumen.conflicto} label="Ya matriculados" tono="ambar" />
                    {revision.resumen.invalido > 0 && <Tarjeta n={revision.resumen.invalido} label="No válidos" tono="gris" />}
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                    A cada alumno que se matricule se le crean <b>{revision.cargoCount}</b> cargo(s) ya vigentes
                    por <b>{fmtRD(revision.cargoTotalCentavos)}</b>. Las mensualidades futuras se generan cada mes.
                  </div>
                  <TablaResultados filas={revision.resultados} />
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {resultado ? (
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={onClose}>Cerrar</Button>
          ) : (
            <div className="flex w-full items-center justify-between">
              <div>
                {paso > 1 && (
                  <Button variant="outline" onClick={() => setPaso((p) => (p - 1) as 1 | 2)} disabled={revisando || confirmando}>
                    <ArrowLeft className="mr-1 h-4 w-4" />Atrás
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={revisando || confirmando}>Cancelar</Button>
                {paso === 1 && (
                  <Button className="bg-zero-600 hover:bg-zero-700" onClick={() => setPaso(2)} disabled={!puedeSeguir1}>
                    Siguiente<ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
                {paso === 2 && (
                  <Button className="bg-zero-600 hover:bg-zero-700" onClick={irARevision} disabled={!puedeSeguir2 || revisando}>
                    {revisando ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Revisando…</> : <>Revisar<ArrowRight className="ml-1 h-4 w-4" /></>}
                  </Button>
                )}
                {paso === 3 && (
                  <Button className="bg-zero-600 hover:bg-zero-700" onClick={confirmar}
                    disabled={confirmando || !revision || revision.resumen.crear === 0}>
                    {confirmando
                      ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Matriculando…</>
                      : <><Check className="mr-1 h-4 w-4" />Matricular {revision?.resumen.crear ?? 0}</>}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Tarjeta({ n, label, tono }: { n: number; label: string; tono: 'verde' | 'ambar' | 'gris' | 'rojo' }) {
  const clase = {
    verde: 'border-green-200 bg-green-50 text-green-800',
    ambar: 'border-amber-200 bg-amber-50 text-amber-800',
    gris:  'border-gray-200 bg-gray-50 text-gray-700',
    rojo:  'border-red-200 bg-red-50 text-red-700',
  }[tono];
  return (
    <div className={`flex items-baseline gap-2 rounded-lg border px-3 py-2 ${clase}`}>
      <span className="text-lg font-semibold">{n}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function TablaResultados({ filas }: { filas: ResultadoLote[] }) {
  const icono = (r: ResultadoLote['resultado']) =>
    r === 'crear' || r === 'creada' ? <Check className="h-4 w-4 text-green-600" />
    : r === 'conflicto' ? <AlertTriangle className="h-4 w-4 text-amber-500" />
    : r === 'invalido' ? <Users className="h-4 w-4 text-gray-400" />
    : <AlertTriangle className="h-4 w-4 text-red-500" />;
  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
      {filas.map((f) => (
        <div key={f.estudianteId} className="flex items-center gap-3 px-3 py-2">
          {icono(f.resultado)}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-gray-900">{f.nombre}</span>
            {f.motivo && <span className="block text-xs text-gray-500">{f.motivo}</span>}
          </span>
          {f.codigo && <span className="shrink-0 text-xs text-gray-400">{f.codigo}</span>}
        </div>
      ))}
    </div>
  );
}
