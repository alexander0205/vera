'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Database, GraduationCap,
  KeyRound, Loader2, Lock, Trash2, Users, UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EstadoFila, PlanMigracion } from '@/lib/sigerd/plan-migracion';

/**
 * Asistente para traer a nuestro sistema lo que SIGERD ya nos dio.
 *
 * Va paso a paso y en el orden en que las cosas dependen unas de otras: sin
 * estructura no hay dónde matricular, sin estudiantes no hay a quién colgarle un
 * padre. Cada paso enseña una tabla de lo que trajo el portal, marcando qué es
 * nuevo y qué ya está, y el colegio decide con casillas qué cruza.
 *
 * La idea que lo sostiene: TRAER NO ES CREAR. La descarga deja las cosas en una
 * zona de espera (`sigerd_importaciones`) y nada toca las tablas del colegio
 * hasta que se pulsa. Por eso se puede revisar, cerrar el navegador y volver, o
 * cruzar otra vez con otras casillas sin llamar al portal ni una vez.
 */

// Sin `no-store`: el plan se sirve del caché por etiqueta del servidor, que se
// invalida solo al descargar o al cruzar. Forzar `no-store` aquí obligaba a
// releer un JSONB de 190 KB y a cruzarlo contra cinco tablas en cada cambio de
// paso, para devolver siempre lo mismo.
const traer = (u: string) => fetch(u).then((r) => r.json());

interface EstadoCredenciales {
  configurado: boolean;
  usuario: string | null;
  centroNombre: string | null;
  verificadoEn: string | null;
  ultimoError: string | null;
}

type Paso = 'conectar' | 'plan' | 'estructura' | 'estudiantes' | 'padres' | 'personal';

/**
 * Padres y Personal quedan fuera por ahora: los módulos que los consumen no se
 * van a usar todavía, y en SIGERD los padres ni siquiera están cargados para
 * este colegio. Un paso que no lleva a nada es peor que no tenerlo.
 *
 * Se ocultan, no se borran: el cruce de personal funciona y está probado, así
 * que volver a enseñarlo es vaciar esta lista.
 */
const PASOS_OCULTOS: Paso[] = ['padres', 'personal'];

const TODOS_LOS_PASOS: { id: Paso; titulo: string; icono: typeof Users }[] = [
  { id: 'conectar',    titulo: 'Conectar',    icono: KeyRound },
  { id: 'plan',        titulo: 'Plan',        icono: Database },
  { id: 'estructura',  titulo: 'Estructura',  icono: GraduationCap },
  { id: 'estudiantes', titulo: 'Estudiantes', icono: Users },
  { id: 'padres',      titulo: 'Padres',      icono: UsersRound },
  { id: 'personal',    titulo: 'Personal',    icono: UsersRound },
];

const PASOS = TODOS_LOS_PASOS.filter((p) => !PASOS_OCULTOS.includes(p.id));

/** El último paso visible no ofrece "seguir": no hay adónde. */
const ULTIMO_PASO = PASOS[PASOS.length - 1].id;

/** Píldora de estado. El color lleva la mitad del mensaje. */
function Estado({ estado, motivo }: { estado: EstadoFila; motivo?: string }) {
  const estilo = estado === 'existe'
    ? 'border-gray-200 bg-gray-50 text-gray-600'
    : estado === 'dudoso'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const texto = estado === 'existe' ? 'Ya existe' : estado === 'dudoso' ? 'Revisar' : 'Nuevo';
  return (
    <span title={motivo}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${estilo}`}>
      {texto}
    </span>
  );
}

function Casilla({ marcado, onCambiar, disabled }: {
  marcado: boolean; onCambiar: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <input type="checkbox" checked={marcado} disabled={disabled}
      onChange={(e) => onCambiar(e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer accent-zero-600 disabled:cursor-not-allowed disabled:opacity-40" />
  );
}

export function MigrarSigerd() {
  const [paso, setPaso] = useState<Paso>('conectar');
  const { data: cred, mutate: recargarCred } =
    useSWR<EstadoCredenciales>('/api/sigerd/credenciales', traer);
  const { data: planResp, isLoading: cargandoPlan } =
    useSWR<{ hayDatos: boolean; plan?: PlanMigracion }>('/api/sigerd/plan', traer);

  const plan = planResp?.plan ?? null;
  const idx = PASOS.findIndex((p) => p.id === paso);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Traer datos de SIGERD</h1>
        <p className="text-sm text-muted-foreground">
          Paso a paso. En cada uno ves qué trajo el portal y marcas qué entra a tu sistema.
        </p>
      </div>

      {/* ── Barra de pasos ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2">
        {PASOS.map((p, i) => {
          const activo = p.id === paso;
          const hecho = i < idx;
          return (
            <button key={p.id} type="button" onClick={() => setPaso(p.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                activo ? 'bg-zero-600 text-white'
                  : hecho ? 'text-zero-700 hover:bg-zero-50'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                activo ? 'bg-white/20' : hecho ? 'bg-zero-100 text-zero-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {hecho ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {p.titulo}
            </button>
          );
        })}
      </div>

      {paso === 'conectar' && <PasoConectar cred={cred} onCambio={() => void recargarCred()} onSeguir={() => setPaso('plan')} />}

      {paso !== 'conectar' && cargandoPlan && (
        <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo lo que se descargó…
        </p>
      )}

      {paso !== 'conectar' && !cargandoPlan && !plan && <SinDatos />}

      {plan && paso === 'plan' && <PasoPlan plan={plan} onSeguir={() => setPaso('estructura')} />}
      {plan && paso === 'estructura' && <PasoEstructura plan={plan} onSeguir={() => setPaso('estudiantes')} />}
      {plan && paso === 'estudiantes' && (
        <PasoEstudiantes plan={plan}
          final={ULTIMO_PASO === 'estudiantes'}
          onSeguir={() => setPaso('padres')} />
      )}
      {plan && paso === 'padres' && <PasoPadres plan={plan} onSeguir={() => setPaso('personal')} />}
      {plan && paso === 'personal' && <PasoPersonal plan={plan} />}
    </div>
  );
}

// ── 1 · Conectar ────────────────────────────────────────────────────────────

function PasoConectar({ cred, onCambio, onSeguir }: {
  cred: EstadoCredenciales | undefined;
  onCambio: () => void;
  onSeguir: () => void;
}) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch('/api/sigerd/credenciales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'No se pudieron guardar.'); return; }
      setUsuario(''); setClave('');
      onCambio();
    } finally { setGuardando(false); }
  }

  async function olvidar() {
    setGuardando(true);
    try {
      await fetch('/api/sigerd/credenciales', { method: 'DELETE' });
      onCambio();
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Credenciales de SIGERD</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Hacen falta para que la descarga larga pueda reconectarse sola: son ~25 minutos
          y la sesión del portal dura menos.
        </p>
      </div>

      {cred?.configurado ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-emerald-900">Guardadas y cifradas</p>
            <p className="text-emerald-800">
              Usuario {cred.usuario}
              {cred.centroNombre ? ` · ${cred.centroNombre}` : ''}
              {cred.verificadoEn
                ? ` · verificadas el ${new Date(cred.verificadoEn).toLocaleDateString('es-DO')}`
                : ' · todavía sin probar contra el portal'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void olvidar()} disabled={guardando}
            className="shrink-0 text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Olvidar
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sig-usuario">Usuario (cédula)</Label>
            <Input id="sig-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
              placeholder="001-0000000-0" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-clave">Contraseña</Label>
            <Input id="sig-clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)}
              autoComplete="new-password" />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Se dice antes de guardar, no en la letra pequeña de después. */}
      <p className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span>
          Se guarda cifrada con AES-256-GCM y la llave vive fuera de la base de datos.
          <b> No se puede volver a leer</b>, ni por ti ni por nosotros: para cambiarla se
          escribe de nuevo. Olvidarla no borra nada de lo ya importado.
        </span>
      </p>

      <div className="flex justify-end gap-2">
        {!cred?.configurado && (
          <Button onClick={() => void guardar()} disabled={guardando || !usuario.trim() || !clave}
            className="bg-zero-600 hover:bg-zero-700">
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Guardar
          </Button>
        )}
        <Button variant={cred?.configurado ? 'default' : 'outline'} onClick={onSeguir}
          className={cred?.configurado ? 'bg-zero-600 hover:bg-zero-700' : ''}>
          {cred?.configurado ? 'Seguir' : 'Seguir sin guardar'}
        </Button>
      </div>

      {!cred?.configurado && (
        <p className="text-right text-xs text-gray-400">
          Los pasos de Estructura y Estudiantes funcionan sin credenciales: usan lo ya descargado.
        </p>
      )}
    </div>
  );
}

function SinDatos() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <Database className="mx-auto h-8 w-8 text-gray-300" />
      <p className="mt-3 text-sm font-medium text-gray-900">Todavía no hay nada descargado</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
        Corre primero «Obtener información» en la pantalla de SIGERD. Esto solo cruza a tu
        sistema lo que el portal ya nos dio; no vuelve a pedírselo.
      </p>
    </div>
  );
}

// ── 2 · Plan ────────────────────────────────────────────────────────────────

function PasoPlan({ plan, onSeguir }: { plan: PlanMigracion; onSeguir: () => void }) {
  const t = plan.totales;
  const faltanFichas = t.estudiantes - t.estudiantesConFicha;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Esto es lo que hay descargado</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Año académico {plan.anoAcademico ?? '—'}
          {plan.bajadoEn ? ` · bajado el ${new Date(plan.bajadoEn).toLocaleDateString('es-DO')}` : ''}
        </p>
      </div>

      {/* Solo lo que el asistente va a traer. Padres y Personal existen en la
          descarga, pero anunciarlos aquí prometería pasos que ahora no están. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta n={t.servicios} label="Servicios" pie={`${t.grados} grados · ${t.secciones} secciones`} />
        <Tarjeta n={t.estudiantes} label="Estudiantes" pie={
          t.estudiantesConFicha > 0 ? `${t.estudiantesConFicha} con ficha completa` : 'solo nombre y sección'} />
      </div>

      {faltanFichas > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">A {faltanFichas} estudiantes solo les tenemos el nombre</p>
            <p className="mt-0.5 text-amber-800">
              La descarga trajo la estructura completa, pero no los expedientes. Sin ellos no
              hay RNE, ni fecha de nacimiento, ni dirección. Puedes cruzar lo que hay ahora,
              traer los expedientes después, o llenar esos datos a mano en la ficha de cada
              estudiante.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onSeguir} className="bg-zero-600 hover:bg-zero-700">Empezar</Button>
      </div>
    </div>
  );
}

function Tarjeta({ n, label, pie }: { n: number; label: string; pie: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-2xl font-semibold text-gray-900">{n}</p>
      <p className="text-sm text-gray-700">{label}</p>
      {pie && <p className="mt-0.5 text-xs text-gray-400">{pie}</p>}
    </div>
  );
}

interface Resultado {
  creados: number; omitidos: number;
  fallos: Array<{ que: string; motivo: string }>;
  avisos: Array<{ que: string; motivo: string }>;
}

/**
 * Cabecera de un paso con tabla: cuenta, botón de cruzar y el parte de lo que
 * pasó. El botón crea Y avanza; si el cruce falla, no avanza — quedarse en el
 * paso es la única forma de que el error se lea.
 */
function Cabecera({ titulo, ayuda, nuevos, marcados, paso, excluir, onSeguir, etiquetaBoton }: {
  titulo: string; ayuda: string; nuevos: number; marcados: number;
  paso: 'estructura' | 'estudiantes' | 'personal';
  excluir: number[];
  onSeguir: () => void; etiquetaBoton: string;
}) {
  const [corriendo, setCorriendo] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cruzar() {
    if (nuevos === 0 || marcados === 0) { onSeguir(); return; }
    setCorriendo(true); setError(null); setRes(null);
    try {
      const r = await fetch('/api/sigerd/cruzar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso, excluir }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'No se pudo.'); return; }
      setRes(j as Resultado);
      // Con fallos NO se avanza: el parte hay que leerlo aquí.
      if ((j.fallos ?? []).length === 0) setTimeout(onSeguir, 1200);
    } catch {
      setError('Se cortó la conexión. Lo que ya entró se queda.');
    } finally { setCorriendo(false); }
  }

  return (
    <div className="border-b border-gray-100">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{ayuda}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-gray-500">
            {nuevos === 0 ? 'nada nuevo' : `${marcados} de ${nuevos} nuevos`}
          </span>
          <Button onClick={() => void cruzar()} disabled={corriendo}
            className="bg-zero-600 hover:bg-zero-700">
            {corriendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {corriendo ? 'Creando…' : etiquetaBoton}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {res && (
        <div className="mx-4 mb-3 space-y-2">
          <p className={`rounded-lg border px-3 py-2 text-sm ${
            res.fallos.length ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <b>{res.creados}</b> creados · <b>{res.omitidos}</b> ya estaban
            {res.fallos.length > 0 && <> · <b>{res.fallos.length}</b> fallaron</>}
          </p>
          {/* Los fallos primero y sin recortar: son los que exigen actuar. */}
          {res.fallos.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {res.fallos.map((f, i) => <li key={i}><b>{f.que}</b> — {f.motivo}</li>)}
            </ul>
          )}
          {res.avisos.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <summary className="cursor-pointer font-medium">
                {res.avisos.length} para revisar
              </summary>
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {res.avisos.slice(0, 100).map((a, i) => <li key={i}><b>{a.que}</b> — {a.motivo}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── 3 · Estructura ──────────────────────────────────────────────────────────

function PasoEstructura({ plan, onSeguir }: { plan: PlanMigracion; onSeguir: () => void }) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [quitados, setQuitados] = useState<Set<string>>(new Set());

  // Lo nuevo entra marcado; lo que ya existe, no. `quitados` guarda solo las
  // excepciones para que el estado no crezca con las 28 secciones.
  const marcado = (k: string, estado: EstadoFila) => estado === 'nuevo' && !quitados.has(k);
  const alternar = (k: string, v: boolean) =>
    setQuitados((s) => { const n = new Set(s); if (v) n.delete(k); else n.add(k); return n; });

  const nuevos = plan.estructura.reduce((n, sv) =>
    n + (sv.estado === 'nuevo' ? 1 : 0)
      + sv.grados.reduce((m, g) => m + (g.estado === 'nuevo' ? 1 : 0)
        + g.secciones.filter((s) => s.estado === 'nuevo').length, 0), 0);
  const marcados = nuevos - quitados.size;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <Cabecera titulo="Estructura" nuevos={nuevos} marcados={marcados}
        paso="estructura" excluir={[...quitados].map((k) => Number(k.split(':')[1]))}
        ayuda="Servicios, grados y secciones. Lo que ya existe se empareja, no se duplica."
        onSeguir={onSeguir} etiquetaBoton={nuevos === 0 ? 'Seguir' : 'Crear y seguir'} />

      <div className="divide-y divide-gray-100">
        {plan.estructura.map((sv) => {
          const abierto = abiertos.has(sv.idSigerd);
          const kSv = `sv:${sv.idSigerd}`;
          return (
            <div key={sv.idSigerd}>
              <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50/60">
                <Casilla marcado={marcado(kSv, sv.estado)} disabled={sv.estado !== 'nuevo'}
                  onCambiar={(v) => alternar(kSv, v)} />
                <button type="button" onClick={() => setAbiertos((s) => {
                  const n = new Set(s); n.has(sv.idSigerd) ? n.delete(sv.idSigerd) : n.add(sv.idSigerd); return n;
                })} className="shrink-0 rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                  {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{sv.nombre}</span>
                <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">
                  {sv.grados.length} grados · {sv.grados.reduce((n, g) => n + g.secciones.length, 0)} secciones
                </span>
                <Estado estado={sv.estado} motivo={sv.motivo} />
              </div>

              {abierto && sv.grados.map((g) => (
                <div key={g.idSigerd}>
                  <div className="flex items-center gap-2 py-1.5 pl-11 pr-4 hover:bg-gray-50/60">
                    <Casilla marcado={marcado(`gr:${g.idSigerd}`, g.estado)} disabled={g.estado !== 'nuevo'}
                      onCambiar={(v) => alternar(`gr:${g.idSigerd}`, v)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{g.nombre}</span>
                    <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">
                      {g.secciones.map((s) => s.nombre).join(', ')}
                    </span>
                    <Estado estado={g.estado} motivo={g.motivo} />
                  </div>
                  {g.secciones.map((s) => (
                    <div key={s.idSigerd} className="flex items-center gap-2 py-1 pl-[4.5rem] pr-4 hover:bg-gray-50/60">
                      <Casilla marcado={marcado(`se:${s.idSigerd}`, s.estado)} disabled={s.estado !== 'nuevo'}
                        onCambiar={(v) => alternar(`se:${s.idSigerd}`, v)} />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-600">Sección {s.nombre}</span>
                      <span className="shrink-0 text-xs text-gray-400">{s.estudiantes} alumnos</span>
                      <Estado estado={s.estado} motivo={s.motivo} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4 · Estudiantes ─────────────────────────────────────────────────────────

type Filtro = 'todos' | 'nuevos' | 'revisar';

function PasoEstudiantes({ plan, onSeguir, final }: {
  plan: PlanMigracion; onSeguir: () => void;
  /** Cuando es el último paso visible, el botón crea y se queda: no hay adónde ir. */
  final?: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('nuevos');
  const [quitados, setQuitados] = useState<Set<number>>(new Set());
  const [tope, setTope] = useState(50);

  const lista = useMemo(() => plan.estudiantes.filter((e) =>
    filtro === 'todos' ? true : filtro === 'nuevos' ? e.estado === 'nuevo' : e.estado === 'dudoso',
  ), [plan.estudiantes, filtro]);

  const nuevos = plan.estudiantes.filter((e) => e.estado === 'nuevo').length;
  const existen = plan.estudiantes.filter((e) => e.estado === 'existe').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <Cabecera titulo="Estudiantes" nuevos={nuevos} marcados={nuevos - quitados.size}
        paso="estudiantes" excluir={[...quitados]}
        // Entran SIN matrícula: matricular es una decisión del colegio, curso
        // por curso, y no un efecto secundario de importar de SIGERD.
        ayuda={`${nuevos} nuevos · ${existen} ya están. Entran a la ficha de estudiantes, sin matricular.`}
        onSeguir={final ? () => {} : onSeguir}
        etiquetaBoton={nuevos === 0 ? (final ? 'Listo' : 'Seguir') : (final ? 'Crear' : 'Crear y seguir')} />

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
        {(['nuevos', 'revisar', 'todos'] as Filtro[]).map((f) => (
          <button key={f} type="button" onClick={() => { setFiltro(f); setTope(50); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filtro === f ? 'bg-zero-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'nuevos' ? 'Solo nuevos' : f === 'revisar' ? 'Para revisar' : 'Todos'}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{lista.length} filas</span>
      </div>

      {plan.totales.estudiantesConFicha === 0 && (
        <p className="flex items-start gap-2 border-b border-gray-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            De estos solo tenemos nombre y sección: la descarga no trajo los expedientes.
            Si los creas ahora, entran sin RNE ni fecha de nacimiento y habrá que completarlos.
          </span>
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {lista.slice(0, tope).map((e) => (
          <div key={e.idSigerd} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50/60">
            <Casilla marcado={e.estado === 'nuevo' && !quitados.has(e.idSigerd)}
              disabled={e.estado === 'existe'}
              onCambiar={(v) => setQuitados((s) => {
                const n = new Set(s); v ? n.delete(e.idSigerd) : n.add(e.idSigerd); return n;
              })} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{e.nombre}</span>
            <span className="hidden min-w-0 shrink-0 truncate text-xs text-gray-400 md:block md:max-w-[16rem]">
              {e.ubicacion}
            </span>
            <Estado estado={e.estado} motivo={e.motivo} />
          </div>
        ))}
        {lista.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Nada que enseñar con este filtro.</p>
        )}
      </div>

      {lista.length > tope && (
        <button type="button" onClick={() => setTope((n) => n + 100)}
          className="w-full border-t border-gray-100 py-2.5 text-sm text-zero-700 hover:bg-gray-50">
          Ver 100 más ({lista.length - tope} restantes)
        </button>
      )}
    </div>
  );
}

// ── 5 · Padres ──────────────────────────────────────────────────────────────

function PasoPadres({ plan, onSeguir }: { plan: PlanMigracion; onSeguir: () => void }) {
  if (plan.padresDisponibles) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Aquí irá la tabla de padres y madres.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <Cabecera titulo="Padres y madres" nuevos={0} marcados={0}
        paso="personal" excluir={[]}
        ayuda="No están en SIGERD para este colegio: se midieron 32 alumnos por dos vías distintas."
        onSeguir={onSeguir} etiquetaBoton="Seguir" />
      <div className="p-8 text-center">
        <UsersRound className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-900">Todavía no se han descargado</p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-gray-500">
          En SIGERD los padres no vienen con el listado: cuelgan del expediente de cada
          alumno, en tres ranuras —padre, madre y tutor— que se piden una por una. Son
          tres llamadas por estudiante, y por eso van dentro de la descarga larga junto
          con los expedientes.
        </p>
      </div>
    </div>
  );
}

// ── 6 · Personal ────────────────────────────────────────────────────────────

function PasoPersonal({ plan }: { plan: PlanMigracion }) {
  const [quitados, setQuitados] = useState<Set<number>>(new Set());
  const nuevos = plan.personal.filter((p) => p.estado === 'nuevo').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <Cabecera titulo="Personal" nuevos={nuevos} marcados={nuevos - quitados.size}
        paso="personal" excluir={[...quitados]}
        ayuda="Se comparan por id de SIGERD y por cédula. El portal repite a quien tiene dos cargos; aquí sale una vez."
        onSeguir={() => {}} etiquetaBoton={nuevos === 0 ? 'Terminar' : 'Crear y terminar'} />

      <div className="divide-y divide-gray-100">
        {plan.personal.map((p, i) => (
          <div key={p.idSigerd ?? `sin-id-${i}`} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50/60">
            <Casilla marcado={p.estado === 'nuevo' && !quitados.has(p.idSigerd ?? -i)}
              disabled={p.estado === 'existe'}
              onCambiar={(v) => setQuitados((s) => {
                const n = new Set(s); const k = p.idSigerd ?? -i; v ? n.delete(k) : n.add(k); return n;
              })} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{p.nombre}</span>
            <span className="hidden shrink-0 font-mono text-xs text-gray-400 sm:inline">{p.cedula ?? '—'}</span>
            <span className="hidden min-w-0 shrink-0 truncate text-xs text-gray-500 md:block md:max-w-[14rem]">
              {p.cargo ?? '—'}
            </span>
            <Estado estado={p.estado} motivo={p.motivo} />
          </div>
        ))}
      </div>
    </div>
  );
}
