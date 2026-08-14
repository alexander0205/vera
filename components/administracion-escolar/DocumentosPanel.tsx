'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileCheck, Loader2, Plus, Trash2, AlertTriangle, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Qué papeles pide el colegio al matricular.
 *
 * UNA lista de documentos, y en cada renglón dónde se pide. Antes eran dos
 * columnas —nuevo ingreso y reinscripción— multiplicadas por las pestañas de
 * nivel: seis niveles daban DOCE listas que llenar, y pedir el acta de
 * nacimiento en todo el colegio obligaba a escribirla doce veces. Peor: para
 * saber qué se pide en Primaria había que ir pestaña por pestaña comparando a
 * ojo.
 *
 * El colegio piensa en papeles («yo pido acta, foto y récord»), no en cruces de
 * una matriz. Así que el papel es la fila, y a quién se le pide son dos casillas
 * a su derecha. La diferencia entre lo que se pide una vez y lo que se repite
 * cada año se ve de un vistazo.
 *
 * Se configura por NIVEL y no por curso a propósito. Los servicios cuelgan de
 * un período —hay un "Primario · Matutina" por año escolar, con id distinto—,
 * así que atar la lista a un id obligaría a rehacerla cada agosto. El nivel por
 * nombre sobrevive al cambio de año.
 */

interface DocumentoRequerido {
  id: number;
  nivel: string | null;
  tipoInscripcion: 'nuevo' | 'reinscripcion';
  nombre: string;
  exigencia: 'requerido' | 'si_aplica';
  cantidad: number;
  orden: number;
  activo: boolean;
}

interface Respuesta { documentos: DocumentoRequerido[]; niveles: string[] }

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());
const API = '/api/administracion-escolar/documentos/requeridos';

const TIPOS = [
  { tipo: 'nuevo' as const,         etiqueta: 'Nuevo ingreso', corto: 'Nuevo',        ayuda: 'La primera vez que entra al colegio' },
  { tipo: 'reinscripcion' as const, etiqueta: 'Reinscripción', corto: 'Reinscrip.',   ayuda: 'Cada año que vuelve' },
];

const TODOS = '__todos__';

/**
 * Un papel del colegio, con sus dos posibles filas detrás.
 *
 * En la base cada combinación papel×momento es una fila propia; aquí se juntan
 * porque para el colegio «Acta de nacimiento» es UN documento que se pide en
 * uno o en los dos momentos, no dos documentos distintos que se llaman igual.
 */
interface Papel {
  clave: string;
  nombre: string;
  nivel: string | null;
  /** La fila activa de cada momento, si existe. */
  filas: Partial<Record<'nuevo' | 'reinscripcion', DocumentoRequerido>>;
  /** También las inactivas: reactivar una es mejor que crear una gemela. */
  dormidas: Partial<Record<'nuevo' | 'reinscripcion', DocumentoRequerido>>;
  orden: number;
}

/** Mismo papel = mismo nombre y mismo nivel. El nombre se normaliza para que
 *  «Acta» y «acta » no se separen en dos renglones. */
function claveDe(d: DocumentoRequerido): string {
  return `${d.nombre.trim().toLowerCase()}||${d.nivel ?? ''}`;
}

function agrupar(documentos: DocumentoRequerido[]): Papel[] {
  const mapa = new Map<string, Papel>();
  for (const d of documentos) {
    const clave = claveDe(d);
    const papel = mapa.get(clave) ?? {
      clave, nombre: d.nombre, nivel: d.nivel, filas: {}, dormidas: {}, orden: d.orden,
    };
    if (d.activo) {
      papel.filas[d.tipoInscripcion] = d;
      // El nombre visible sale de una fila viva: si una se renombró y la otra
      // no, manda la que se está pidiendo.
      papel.nombre = d.nombre;
      papel.orden = Math.min(papel.orden, d.orden);
    } else {
      papel.dormidas[d.tipoInscripcion] = d;
    }
    mapa.set(clave, papel);
  }
  // Los que no tienen ninguna fila viva no se enseñan: son papeles retirados.
  return [...mapa.values()]
    .filter((p) => Object.keys(p.filas).length > 0)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

export function DocumentosPanel() {
  const { data, isLoading, mutate } = useSWR<Respuesta>(API, fetcher, { revalidateOnFocus: false });
  const [filtroNivel, setFiltroNivel] = useState<string>(TODOS);
  const [porBorrar, setPorBorrar] = useState<Papel | null>(null);
  const [sembrando, setSembrando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [nivelNuevo, setNivelNuevo] = useState<string>(TODOS);
  const [guardando, setGuardando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const documentos = useMemo(() => data?.documentos ?? [], [data]);
  const niveles = data?.niveles ?? [];

  const papeles = useMemo(() => agrupar(documentos), [documentos]);

  // El filtro enseña lo del nivel MÁS lo que vale para todos: un alumno de
  // Primaria tiene que entregar las dos cosas, así que verlas juntas es lo
  // que se parece a la realidad.
  const visibles = useMemo(
    () => (filtroNivel === TODOS
      ? papeles
      : papeles.filter((p) => p.nivel == null || p.nivel === filtroNivel)),
    [papeles, filtroNivel],
  );

  async function llamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? 'No se pudo guardar');
    return json as Record<string, unknown>;
  }

  /**
   * Encender o apagar un momento.
   *
   * Apagar NO borra: deja la fila dormida. Así el historial de lo ya entregado
   * sigue apuntando a algo, y volver a pedirlo el año que viene es un clic —no
   * una fila nueva que duplica el nombre en los listados.
   */
  async function alternar(p: Papel, tipo: 'nuevo' | 'reinscripcion', encender: boolean) {
    setOcupada(`${p.clave}:${tipo}`);
    try {
      if (!encender) {
        await llamar(`${API}/${p.filas[tipo]!.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: false }),
        });
      } else if (p.dormidas[tipo]) {
        await llamar(`${API}/${p.dormidas[tipo]!.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: true }),
        });
      } else {
        // Nace copiando al gemelo: si el acta se pide por duplicado y «si
        // aplica» al entrar, al pedirla también en la reinscripción se pide
        // igual. Volver a elegirlo sería trabajo repetido.
        const gemelo = p.filas.nuevo ?? p.filas.reinscripcion;
        await llamar(API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: p.nombre, nivel: p.nivel, tipoInscripcion: tipo,
            exigencia: gemelo?.exigencia ?? 'requerido',
            cantidad: gemelo?.cantidad ?? 1,
          }),
        });
      }
      await mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setOcupada(null); }
  }

  /** Un cambio en el papel vale para sus dos momentos: es el mismo documento. */
  async function cambiarPapel(p: Papel, parche: Record<string, unknown>) {
    const filas = Object.values(p.filas);
    try {
      await Promise.all(filas.map((f) => llamar(`${API}/${f.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parche),
      })));
      await mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      // Nace pidiéndose al entrar, que es el caso de casi todos los papeles.
      // Marcar la reinscripción es un clic en la casilla de al lado.
      await llamar(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          nivel: nivelNuevo === TODOS ? null : nivelNuevo,
          tipoInscripcion: 'nuevo',
          exigencia: 'requerido',
        }),
      });
      setNuevo('');
      await mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo añadir');
    } finally { setGuardando(false); }
  }

  async function sembrar() {
    setSembrando(true);
    try {
      const json = await llamar(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembrar: true }),
      });
      await mutate();
      toast.success(json.creados === 0
        ? 'Ya estaban todos: no se creó nada.'
        : `${json.creados} documento(s) añadidos.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo');
    } finally { setSembrando(false); }
  }

  /** Quitar el papel entero: sus dos filas de una vez. */
  async function borrar() {
    if (!porBorrar) return;
    const filas = [...Object.values(porBorrar.filas), ...Object.values(porBorrar.dormidas)];
    try {
      const avisos = await Promise.all(
        filas.map((f) => llamar(`${API}/${f.id}`, { method: 'DELETE' })),
      );
      await mutate();
      // El servidor decide si borra o desactiva —él sabe en cuántas matrículas
      // se entregó ya— y su aviso es el que vale.
      toast.success(
        (avisos.find((a) => typeof a.aviso === 'string')?.aviso as string) ?? 'Documento quitado.',
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar');
    } finally { setPorBorrar(null); }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-zero-600" /></div>;
  }

  if (niveles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <FileCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-600">Primero hace falta la estructura</p>
        <p className="mt-1 text-sm text-gray-400">
          Los documentos se piden por nivel, y todavía no hay ningún servicio creado.
        </p>
      </div>
    );
  }

  const sinNada = visibles.length === 0;

  return (
    <div className="space-y-4">
      {/* El nivel es un FILTRO, no doce cajones que llenar. Por defecto se ven
          todos los papeles del colegio. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[{ v: TODOS, t: 'Todos los niveles' }, ...niveles.map((n) => ({ v: n, t: n }))].map((o) => (
            <button key={o.v} type="button" onClick={() => setFiltroNivel(o.v)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                o.v === filtroNivel
                  ? 'bg-zero-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {o.t}
            </button>
          ))}
        </div>
        {documentos.length === 0 && (
          <Button variant="outline" size="sm" onClick={sembrar} disabled={sembrando}>
            {sembrando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Cargar las listas del colegio
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="hidden items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:flex">
          <span className="min-w-0 flex-1">Documento</span>
          {TIPOS.map((t) => (
            <span key={t.tipo} className="w-24 shrink-0 text-center" title={t.ayuda}>{t.corto}</span>
          ))}
          <span className="w-40 shrink-0">Nivel</span>
          <span className="w-32 shrink-0">Exigencia</span>
          <span className="w-16 shrink-0 text-center">Cant.</span>
          <span className="w-8 shrink-0" />
        </div>

        {/* Una lista vacía tiene que gritar, no esconderse: sin documentos se
            puede matricular sin pedir un solo papel. */}
        {sinNada ? (
          <div className="flex items-start gap-2.5 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900">
              {filtroNivel === TODOS
                ? 'Sin documentos. Ahora mismo se puede matricular sin entregar nada.'
                : `Sin documentos para ${filtroNivel}. Se puede matricular ahí sin entregar nada.`}
            </p>
          </div>
        ) : (
          <ul>
            {visibles.map((p) => (
              <li key={p.clave}
                className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50/60">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900" title={p.nombre}>
                  {p.nombre}
                </span>

                {TIPOS.map((t) => (
                  <div key={t.tipo} className="w-24 shrink-0 text-center">
                    <Casilla
                      marcada={p.filas[t.tipo] != null}
                      ocupada={ocupada === `${p.clave}:${t.tipo}`}
                      etiqueta={`${p.nombre} · ${t.etiqueta}`}
                      onCambiar={(v) => void alternar(p, t.tipo, v)}
                    />
                  </div>
                ))}

                <div className="w-40 shrink-0">
                  <NativeSelect
                    value={p.nivel ?? TODOS}
                    aria-label={`Nivel de ${p.nombre}`}
                    onChange={(e) => void cambiarPapel(p, {
                      nivel: e.target.value === TODOS ? null : e.target.value,
                    })}
                    className="text-xs">
                    <option value={TODOS}>Todos los niveles</option>
                    {niveles.map((n) => <option key={n} value={n}>{n}</option>)}
                  </NativeSelect>
                </div>

                <div className="w-32 shrink-0">
                  <NativeSelect
                    value={Object.values(p.filas)[0]?.exigencia ?? 'requerido'}
                    aria-label={`Exigencia de ${p.nombre}`}
                    onChange={(e) => void cambiarPapel(p, { exigencia: e.target.value })}
                    className="text-xs">
                    <option value="requerido">Requerido</option>
                    <option value="si_aplica">Si aplica</option>
                  </NativeSelect>
                </div>

                {/* `Input` lleva `fullWidth` de MUI, que gana a cualquier `w-*`
                    de Tailwind: envuelto en una caja, llena la caja y no la
                    fila —sin esto el nombre se quedaba sin sitio. */}
                <div className="w-16 shrink-0">
                  <Input type="number" min={1} max={20}
                    value={Object.values(p.filas)[0]?.cantidad ?? 1}
                    aria-label={`Cantidad de ${p.nombre}`}
                    onChange={(e) => void cambiarPapel(p, { cantidad: Number(e.target.value) || 1 })}
                    className="text-center text-xs" />
                </div>

                <button type="button" aria-label={`Quitar ${p.nombre}`} title="Quitar del catálogo"
                  onClick={() => setPorBorrar(p)}
                  className="w-8 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-gray-100 p-3">
          <Input placeholder="Añadir documento…" value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregar(); } }}
            className="h-9 min-w-[12rem] flex-1 text-sm" />
          <div className="w-44 shrink-0">
            <NativeSelect value={nivelNuevo} aria-label="Nivel del documento nuevo"
              onChange={(e) => setNivelNuevo(e.target.value)} className="text-xs">
              <option value={TODOS}>Todos los niveles</option>
              {niveles.map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
          </div>
          <Button size="sm" variant="outline" onClick={() => void agregar()}
            disabled={guardando || !nuevo.trim()} className="shrink-0">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Se añade pidiéndose en el <b>nuevo ingreso</b>. Marca la casilla de reinscripción
        si también hay que entregarlo cada año. <b>Si aplica</b> no es opcional: hay que
        resolverlo (por ejemplo, el acta de divorcio solo si los padres lo están).
      </p>

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o) => { if (!o) setPorBorrar(null); }}
        title="Quitar documento"
        description={porBorrar
          ? `«${porBorrar.nombre}» deja de pedirse, en los dos momentos. Si ya se entregó en alguna matrícula no se borra: se desactiva, y lo escaneado se conserva.`
          : ''}
        confirmLabel="Quitar"
        destructive
        onConfirm={borrar}
      />
    </div>
  );
}

/**
 * La casilla de «se pide aquí».
 *
 * Cuadro grande y no un checkbox del sistema: es el control que más se toca en
 * esta pantalla y se usa desde la tableta de secretaría.
 */
function Casilla({ marcada, ocupada, etiqueta, onCambiar }: {
  marcada: boolean; ocupada: boolean; etiqueta: string; onCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcada}
      aria-label={etiqueta}
      title={marcada ? `Se pide en ${etiqueta}` : `No se pide en ${etiqueta}`}
      disabled={ocupada}
      onClick={() => onCambiar(!marcada)}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
        marcada
          ? 'border-zero-600 bg-zero-600 text-white hover:bg-zero-700'
          : 'border-gray-200 bg-white text-transparent hover:border-gray-300 hover:bg-gray-50'
      } ${ocupada ? 'opacity-50' : ''}`}
    >
      {ocupada
        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        : <Check className="h-4 w-4" />}
    </button>
  );
}

/** Etiqueta suelta, por si hace falta fuera de la lista. */
export function ExigenciaBadge({ exigencia }: { exigencia: 'requerido' | 'si_aplica' }) {
  return exigencia === 'requerido'
    ? <span className="rounded bg-zero-50 px-1.5 py-0.5 text-[11px] font-medium text-zero-700">Requerido</span>
    : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Si aplica</span>;
}

export { Label };
