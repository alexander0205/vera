'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCheck, CheckCircle2, Clock, FilePlus2, Loader2, MessageCircle,
  Pencil, Send, Sparkles, Trash2, X, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pegasDeMeta, contarVariables, MAX_CUERPO } from '@/lib/whatsapp/plantillas-reglas';

/**
 * Plantillas de WhatsApp del colegio.
 *
 * Tres cosas en una pantalla, en el orden en que se piensan:
 *   1. Qué avisos salen (casos de uso) y qué plantilla usa cada uno.
 *   2. Mis plantillas: crearlas, mandarlas a aprobación, ver cómo van.
 *   3. El editor, con vista previa y un chat con IA al lado.
 *
 * Meta rellena las variables POR POSICIÓN. Por eso cada caso de uso enseña qué
 * es {{1}}, {{2}}… y solo deja asignar plantillas que tengan justo esas.
 */

interface Variable { pos: number; nombre: string; tipo: 'texto' | 'monto' | 'fecha'; ejemplo: string }
interface Boton { texto: string; url: string; ejemplo: string }

interface Plantilla {
  id: number;
  nombre: string;
  categoria: string;
  estado: string;
  aprobado: boolean;
  motivoRechazo: string | null;
  cuerpo: string;
  encabezado: string | null;
  pie: string | null;
  variables: Variable[];
  boton: Boton | null;
  esBorrador: boolean;
  propia: boolean;
}
interface Caso { clave: string; titulo: string; detalle: string; variables: Variable[] }
interface Asignacion { aviso: string; nombre: string; propia: boolean; conBoton: boolean }
interface Datos {
  plantillas: Plantilla[];
  casos: Caso[];
  asignaciones: Asignacion[];
  botonesActivos: boolean;
  canal: { disponible: boolean; propio: boolean; error: string | null };
}

interface Borrador {
  id: number | null;
  nombre: string;
  categoria: 'utility' | 'marketing';
  cuerpo: string;
  pie: string;
  variables: Variable[];
  boton: Boton | null;
  /** Para qué caso de uso se está escribiendo. Fija el orden de las variables. */
  aviso: string | null;
}

const VACIO: Borrador = {
  id: null, nombre: '', categoria: 'utility', cuerpo: '', pie: '', variables: [], boton: null, aviso: null,
};

const ESTADOS: Record<string, { texto: string; clase: string; icono: typeof Clock }> = {
  BORRADOR:       { texto: 'Borrador',    clase: 'bg-gray-100 text-gray-700',    icono: Pencil },
  PENDING:        { texto: 'En revisión', clase: 'bg-amber-50 text-amber-700',   icono: Clock },
  PENDING_REVIEW: { texto: 'En revisión', clase: 'bg-amber-50 text-amber-700',   icono: Clock },
  APPROVED:       { texto: 'Aprobada',    clase: 'bg-green-50 text-green-700',   icono: CheckCircle2 },
  REJECTED:       { texto: 'Rechazada',   clase: 'bg-red-50 text-red-700',       icono: XCircle },
  PAUSED:         { texto: 'Pausada',     clase: 'bg-orange-50 text-orange-700', icono: AlertTriangle },
  DISABLED:       { texto: 'Desactivada', clase: 'bg-red-50 text-red-700',       icono: XCircle },
};

function Estado({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { texto: estado, clase: 'bg-gray-100 text-gray-600', icono: Clock };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>
      <e.icono className="h-3 w-3" /> {e.texto}
    </span>
  );
}

/** Deduce las variables del cuerpo conservando lo que ya se sabía de cada una. */
function deducir(cuerpo: string, previas: Variable[], guia: Variable[] | null): Variable[] {
  const pos = [...new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  return pos.map((p) => previas.find((v) => v.pos === p)
    ?? guia?.find((v) => v.pos === p)
    ?? { pos: p, nombre: `variable ${p}`, tipo: 'texto' as const, ejemplo: '' });
}

function renderizar(cuerpo: string, variables: Variable[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (o, n) => {
    const v = variables.find((x) => x.pos === Number(n));
    return v?.ejemplo?.trim() ? v.ejemplo : o;
  });
}

function VistaPrevia({ cuerpo, pie, variables }: { cuerpo: string; pie: string; variables: Variable[] }) {
  return (
    <div className="rounded-xl bg-[#e5ded8] p-3">
      <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">
          {renderizar(cuerpo, variables) || <span className="text-gray-400">Escribe el mensaje…</span>}
        </p>
        {pie && <p className="mt-1 text-[11px] text-gray-400">{pie}</p>}
        <div className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-gray-400">
          11:30 <CheckCheck className="h-3 w-3 text-sky-400" />
        </div>
      </div>
    </div>
  );
}

/** La plantilla cabe en el caso si tiene justo las variables que ese aviso manda. */
const cabe = (p: Plantilla, c: Caso) => contarVariables(p.cuerpo) === c.variables.length;

export function PlantillasWhatsApp() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editor, setEditor] = useState<Borrador | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/administracion-escolar/whatsapp-plantillas');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudieron cargar las plantillas');
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function llamar(url: string, method: string, body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? 'Error');
    return d;
  }

  async function accion(clave: string, fn: () => Promise<string | void>) {
    setOcupado(clave); setError(null); setAviso(null);
    try {
      const msg = await fn();
      if (msg) setAviso(msg);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setOcupado(null);
    }
  }

  const base = '/api/administracion-escolar/whatsapp-plantillas';

  const guardar = (b: Borrador, publicarDespues: boolean) => accion('guardar', async () => {
    const payload = {
      id: b.id, nombre: b.nombre, categoria: b.categoria, cuerpo: b.cuerpo, pie: b.pie,
      variables: deducir(b.cuerpo, b.variables, null), boton: b.boton,
    };
    let id = b.id;
    let msg: string;
    if (id == null) {
      const d = await llamar(base, 'POST', payload);
      id = d.id;
      msg = 'Borrador guardado.';
    } else {
      const d = await llamar(base, 'PUT', payload);
      msg = d.estado === 'BORRADOR' ? 'Borrador actualizado.' : 'Cambios enviados a Meta: vuelve a revisión.';
    }
    const eraBorrador = b.id == null || (datos?.plantillas.find((p) => p.id === b.id)?.esBorrador ?? true);
    if (publicarDespues && eraBorrador) {
      await llamar(`${base}/publicar`, 'POST', { id });
      msg = 'Enviada a aprobación. Meta tarda de minutos a unas horas en responder.';
    }
    setEditor(null);
    return msg;
  });

  const publicar = (p: Plantilla) => {
    if (!confirm(`¿Enviar «${p.nombre}» a aprobación?\n\nMientras Meta la revisa, el texto no se puede cambiar.`)) return;
    void accion(`pub-${p.id}`, async () => {
      await llamar(`${base}/publicar`, 'POST', { id: p.id });
      return 'Enviada a aprobación. Meta tarda de minutos a unas horas en responder.';
    });
  };

  const borrar = (p: Plantilla) => {
    const t = p.esBorrador
      ? `¿Descartar el borrador «${p.nombre}»?`
      : `¿Borrar «${p.nombre}» de WhatsApp?\n\nSi algún aviso la usa, dejará de poder enviarse.`;
    if (!confirm(t)) return;
    void accion(`del-${p.id}`, async () => {
      await llamar(`${base}?id=${p.id}`, 'DELETE');
      return 'Plantilla borrada.';
    });
  };

  const asignar = (avisoClave: string, nombre: string) =>
    accion(`asig-${avisoClave}`, async () => {
      await llamar(`${base}/asignaciones`, 'PUT', { aviso: avisoClave, nombre });
      return nombre ? 'Plantilla asignada.' : 'Volvió a la plantilla por defecto.';
    });

  function nuevaPara(caso: Caso | null) {
    setError(null);
    setEditor({
      ...VACIO,
      aviso: caso?.clave ?? null,
      variables: caso ? caso.variables.map((v) => ({ ...v })) : [],
    });
  }

  function editar(p: Plantilla) {
    setError(null);
    setEditor({
      id: p.id, nombre: p.nombre, cuerpo: p.cuerpo, pie: p.pie ?? '',
      categoria: p.categoria === 'marketing' ? 'marketing' : 'utility',
      variables: p.variables, boton: p.boton, aviso: null,
    });
  }

  if (cargando) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }
  if (!datos) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error ?? 'No se pudo cargar.'}</p>;
  }

  const propias = datos.plantillas.filter((p) => p.propia);
  const usables = datos.plantillas.filter((p) => !p.esBorrador && (p.aprobado || p.estado === 'APPROVED'));

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {aviso && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{aviso}</p>}

      {!datos.canal.disponible && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {datos.canal.error ?? 'WhatsApp no está disponible.'} Puedes redactar borradores, pero no enviarlos a aprobación hasta que lo esté.
        </p>
      )}
      {datos.canal.error && datos.canal.disponible && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se pudo leer el estado en Meta ({datos.canal.error}). Lo que ves puede estar desactualizado.
        </p>
      )}

      {/* 1 · Casos de uso */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Qué avisos salen y con qué plantilla</h2>
          <p className="text-sm text-gray-500">
            Cada situación de cobro usa una plantilla aprobada. Si no eliges ninguna, se usa la de Zero.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {datos.casos.map((c) => {
            const a = datos.asignaciones.find((x) => x.aviso === c.clave);
            const opciones = usables.filter((p) => cabe(p, c));
            return (
              <div key={c.clave} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">{c.titulo}</p>
                <p className="mt-0.5 text-xs text-gray-500">{c.detalle}</p>

                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">Variables, en orden</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {c.variables.map((v) => (
                    <span key={v.pos} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                      {`{{${v.pos}}}`} {v.nombre}
                    </span>
                  ))}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={a?.propia ? a.nombre : ''}
                    disabled={ocupado === `asig-${c.clave}`}
                    onChange={(e) => void asignar(c.clave, e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-zero-600">
                    <option value="">{a && !a.propia && a.nombre ? `Por defecto (${a.nombre})` : 'Por defecto de Zero'}</option>
                    {opciones.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => nuevaPara(c)}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Crear
                  </Button>
                </div>
                {a?.propia && a.conBoton && !datos.botonesActivos && (
                  <p className="mt-2 text-xs text-amber-700">
                    Esta plantilla lleva botón y todavía no se puede enviar: el aviso se saltará.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2 · Mis plantillas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mis plantillas</h2>
            <p className="text-sm text-gray-500">Se escriben aquí y WhatsApp las aprueba antes de poder usarlas.</p>
          </div>
          <Button size="sm" onClick={() => nuevaPara(null)}>
            <FilePlus2 className="mr-1 h-4 w-4" /> Nueva plantilla
          </Button>
        </div>

        {propias.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Aún no has creado plantillas. Crea una desde un caso de uso de arriba, o con «Nueva plantilla».
          </div>
        ) : propias.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-900">{p.nombre}</span>
              <Estado estado={p.estado} />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {p.categoria === 'marketing' ? 'Marketing' : 'Utilidad'}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {p.esBorrador && (
                  <Button size="sm" variant="outline" disabled={!datos.canal.disponible || ocupado === `pub-${p.id}`}
                    onClick={() => publicar(p)}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Enviar a aprobación
                  </Button>
                )}
                {(p.esBorrador || p.estado === 'REJECTED' || p.estado === 'PAUSED' || p.estado === 'APPROVED') && (
                  <Button size="sm" variant="ghost" onClick={() => editar(p)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={ocupado === `del-${p.id}`} onClick={() => borrar(p)} aria-label="Borrar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{renderizar(p.cuerpo, p.variables)}</p>
            {p.estado === 'REJECTED' && p.motivoRechazo && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Meta la rechazó: {p.motivoRechazo}. Edítala y se envía de nuevo.
              </p>
            )}
          </div>
        ))}
      </section>

      {editor && (
        <Editor
          borrador={editor}
          casos={datos.casos}
          ocupado={ocupado === 'guardar'}
          puedePublicar={datos.canal.disponible}
          esBorradorEnMeta={editor.id == null || (datos.plantillas.find((p) => p.id === editor.id)?.esBorrador ?? true)}
          onCambiar={setEditor}
          onCerrar={() => setEditor(null)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}

// ─── Editor + chat ────────────────────────────────────────────────────────────

interface Mensaje { role: 'user' | 'assistant'; content: string; propuesta?: Propuesta | null }
interface Propuesta {
  nombre: string;
  categoria: 'utility' | 'marketing';
  cuerpo: string;
  pie: string | null;
  variables: Variable[];
  avisoSugerido: string | null;
}

function Editor({ borrador, casos, ocupado, puedePublicar, esBorradorEnMeta, onCambiar, onCerrar, onGuardar }: {
  borrador: Borrador;
  casos: Caso[];
  ocupado: boolean;
  puedePublicar: boolean;
  esBorradorEnMeta: boolean;
  onCambiar: (b: Borrador) => void;
  onCerrar: () => void;
  onGuardar: (b: Borrador, publicar: boolean) => void;
}) {
  const caso = casos.find((c) => c.clave === borrador.aviso) ?? null;
  const variables = useMemo(
    () => deducir(borrador.cuerpo, borrador.variables, caso?.variables ?? null),
    [borrador.cuerpo, borrador.variables, caso],
  );
  const pegas = pegasDeMeta({ cuerpo: borrador.cuerpo, pie: borrador.pie, variables, boton: borrador.boton });
  if (caso && contarVariables(borrador.cuerpo) !== caso.variables.length && borrador.cuerpo.trim()) {
    pegas.push(`Para «${caso.titulo}» la plantilla debe tener ${caso.variables.length} variables, en el orden indicado.`);
  }
  if (!borrador.nombre.trim()) pegas.unshift('Ponle un nombre.');

  const cambiar = (p: Partial<Borrador>) => onCambiar({ ...borrador, ...p });

  function setVar(pos: number, p: Partial<Variable>) {
    cambiar({ variables: variables.map((v) => (v.pos === pos ? { ...v, ...p } : v)) });
  }

  // ── Chat ──
  const [chat, setChat] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, pensando]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || pensando) return;
    const historial: Mensaje[] = [...chat, { role: 'user', content: t }];
    setChat(historial); setEntrada(''); setPensando(true); setErrorIa(null);
    try {
      const r = await fetch('/api/administracion-escolar/whatsapp-plantillas/ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes: historial.map(({ role, content }) => ({ role, content })),
          borrador: { nombre: borrador.nombre, cuerpo: borrador.cuerpo, avisoDestino: borrador.aviso },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'El asistente no respondió');
      setChat([...historial, { role: 'assistant', content: d.respuesta, propuesta: d.propuesta }]);
    } catch (e) {
      setErrorIa(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setPensando(false);
    }
  }

  function aplicar(p: Propuesta) {
    // Si el caso de uso ya está fijado, sus variables mandan: la IA solo pone el
    // texto. Si no, se toman las suyas.
    const sugerido = casos.find((c) => c.clave === p.avisoSugerido) ?? null;
    const destino = caso ?? sugerido;
    onCambiar({
      ...borrador,
      nombre: borrador.nombre.trim() || p.nombre,
      categoria: p.categoria,
      cuerpo: p.cuerpo,
      pie: p.pie ?? '',
      aviso: destino?.clave ?? null,
      variables: destino
        ? destino.variables.map((v) => ({ ...v }))
        : p.variables,
    });
  }

  const SUGERENCIAS = caso
    ? [`Escribe la plantilla para «${caso.titulo}»`, 'Hazla más cordial', 'Hazla más corta']
    : ['Recordatorio de mensualidad con tono amable', 'Aviso de reunión de padres', 'Hazla más corta'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            {borrador.id == null ? 'Nueva plantilla' : 'Editar plantilla'}
            {caso && <span className="ml-2 text-sm font-normal text-gray-500">· {caso.titulo}</span>}
          </h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
          {/* Formulario */}
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Nombre</span>
                <input value={borrador.nombre} disabled={borrador.id != null}
                  onChange={(e) => cambiar({ nombre: e.target.value })}
                  placeholder="Recordatorio de mensualidad"
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-zero-600 disabled:bg-gray-50" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Para qué se usa</span>
                <select value={borrador.aviso ?? ''}
                  onChange={(e) => {
                    const c = casos.find((x) => x.clave === e.target.value) ?? null;
                    cambiar({ aviso: c?.clave ?? null, variables: c ? c.variables.map((v) => ({ ...v })) : borrador.variables });
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-zero-600">
                  <option value="">Libre (mensajes que no son de cobro)</option>
                  {casos.map((c) => <option key={c.clave} value={c.clave}>{c.titulo}</option>)}
                </select>
              </label>
            </div>

            {caso && (
              <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <p className="font-medium">Este aviso manda estas variables, en este orden:</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {caso.variables.map((v) => (
                    <button key={v.pos} type="button"
                      onClick={() => cambiar({ cuerpo: `${borrador.cuerpo}{{${v.pos}}}` })}
                      className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] hover:bg-sky-100"
                      title="Insertar en el mensaje">
                      {`{{${v.pos}}}`} {v.nombre}
                    </button>
                  ))}
                </p>
              </div>
            )}

            <label className="block">
              <span className="flex justify-between text-xs font-medium text-gray-700">
                Mensaje <span className="font-normal text-gray-400">{borrador.cuerpo.length}/{MAX_CUERPO}</span>
              </span>
              <textarea value={borrador.cuerpo} rows={7}
                onChange={(e) => cambiar({ cuerpo: e.target.value })}
                placeholder={'Hola, te escribe {{1}}. La cuota de {{2}} de {{3}} por {{4}} …'}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-zero-600" />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-700">Pie (opcional)</span>
              <input value={borrador.pie} onChange={(e) => cambiar({ pie: e.target.value })}
                placeholder="Gracias por su puntualidad"
                className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-zero-600" />
            </label>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700">Tipo</span>
              {(['utility', 'marketing'] as const).map((c) => (
                <button key={c} type="button" onClick={() => cambiar({ categoria: c })}
                  className={`rounded-full border px-3 py-1 text-xs ${borrador.categoria === c
                    ? 'border-zero-600 bg-zero-50 text-zero-700' : 'border-gray-200 text-gray-600'}`}>
                  {c === 'utility' ? 'Utilidad (cobros, avisos)' : 'Marketing (promociones)'}
                </button>
              ))}
            </div>

            {variables.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700">Variables</p>
                <p className="text-xs text-gray-500">El ejemplo es lo que Meta ve al revisar; en el envío se pone el dato real.</p>
                <div className="mt-2 space-y-2">
                  {variables.map((v) => (
                    <div key={v.pos} className="grid grid-cols-[44px_1fr_90px_1fr] items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{`{{${v.pos}}}`}</span>
                      <input value={v.nombre} onChange={(e) => setVar(v.pos, { nombre: e.target.value })}
                        disabled={!!caso} aria-label={`Nombre de la variable ${v.pos}`}
                        className="h-8 min-w-0 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-zero-600 disabled:bg-gray-50" />
                      <select value={v.tipo} onChange={(e) => setVar(v.pos, { tipo: e.target.value as Variable['tipo'] })}
                        disabled={!!caso} aria-label={`Tipo de la variable ${v.pos}`}
                        className="h-8 rounded-lg border border-gray-200 bg-white px-1 text-xs disabled:bg-gray-50">
                        <option value="texto">Texto</option>
                        <option value="monto">Monto</option>
                        <option value="fecha">Fecha</option>
                      </select>
                      <input value={v.ejemplo} onChange={(e) => setVar(v.pos, { ejemplo: e.target.value })}
                        placeholder="Ejemplo" aria-label={`Ejemplo de la variable ${v.pos}`}
                        className="h-8 min-w-0 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-zero-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pegas.length > 0 && borrador.cuerpo.trim() && (
              <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {pegas.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{p}</li>)}
              </ul>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">Así la verá la familia</p>
              <VistaPrevia cuerpo={borrador.cuerpo} pie={borrador.pie} variables={variables} />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
              <Button variant="outline" disabled={ocupado || !borrador.nombre.trim() || !borrador.cuerpo.trim()}
                onClick={() => onGuardar({ ...borrador, variables }, false)}>
                {ocupado ? 'Guardando…' : borrador.id != null && !esBorradorEnMeta ? 'Guardar y reenviar a Meta' : 'Guardar borrador'}
              </Button>
              {esBorradorEnMeta && (
                <Button disabled={ocupado || pegas.length > 0 || !puedePublicar}
                  onClick={() => onGuardar({ ...borrador, variables }, true)}
                  title={pegas.length > 0 ? 'Corrige lo que marca en amarillo' : undefined}>
                  <Send className="mr-1 h-4 w-4" /> Guardar y enviar a aprobación
                </Button>
              )}
            </div>
          </div>

          {/* Chat con IA */}
          <aside className="flex h-[560px] min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50 lg:sticky lg:top-4">
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
              <Sparkles className="h-4 w-4 text-zero-600" />
              <p className="text-sm font-medium text-gray-900">Asistente de plantillas</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {chat.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Cuéntame qué quieres avisar y lo redacto con las reglas de Meta. También puedo mejorar lo que ya escribiste.
                  </p>
                  {SUGERENCIAS.map((s) => (
                    <button key={s} onClick={() => void enviar(s)}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 hover:border-zero-600">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {chat.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user' ? 'bg-zero-600 text-white' : 'border border-gray-200 bg-white text-gray-800'}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.propuesta && (
                      <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2">
                        <p className="whitespace-pre-wrap text-gray-700">{m.propuesta.cuerpo}</p>
                        <Button size="sm" onClick={() => aplicar(m.propuesta!)}>
                          <MessageCircle className="mr-1 h-3.5 w-3.5" /> Usar en el editor
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pensando && (
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Redactando…
                </p>
              )}
              {errorIa && <p className="text-xs text-red-600">{errorIa}</p>}
              <div ref={finRef} />
            </div>

            <form className="flex gap-2 border-t border-gray-200 p-2"
              onSubmit={(e) => { e.preventDefault(); void enviar(entrada); }}>
              <input value={entrada} onChange={(e) => setEntrada(e.target.value)}
                placeholder="Escribe aquí…" disabled={pensando}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-zero-600" />
              <Button type="submit" size="sm" disabled={pensando || !entrada.trim()} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
