'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import useSWR from 'swr';
import { FileMinus, FilePlus, FileText, GraduationCap, User, Users } from 'lucide-react';
import {
  consultaAntesDelCursor, DEBOUNCE_MENCIONES_MS, enlaceDeMencion, GRUPOS_MENCION, MAX_POR_GRUPO, MIN_BUSQUEDA, partirMenciones,
  tokenizar, type Mencion, type TipoMencion,
} from '@/lib/administracion-escolar/tareas-menciones';

/**
 * Las menciones con «@» en la conversación de una tarea.
 *
 * Escribir «@» abre un menú agrupado (Personas, Padres, Estudiantes, Facturas,
 * Notas de crédito y Notas de débito). Las personas son una lista corta: se
 * piden UNA vez por tarea y se filtran aquí. Lo demás se busca en el servidor
 * con 2 letras o más, esperando 250 ms y cancelando la búsqueda anterior.
 * La caja muestra `@Etiqueta`; los tokens se arman al enviar (`tokenizar`).
 */

const ICONO: Record<TipoMencion, typeof User> = {
  persona: User, padre: Users, estudiante: GraduationCap, factura: FileText, nc: FileMinus, nd: FilePlus,
};

const COLOR: Record<TipoMencion, string> = {
  persona: 'bg-violet-50 text-violet-800 ring-violet-200', padre: 'bg-amber-50 text-amber-900 ring-amber-200',
  estudiante: 'bg-sky-50 text-sky-800 ring-sky-200', factura: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  nc: 'bg-rose-50 text-rose-800 ring-rose-200', nd: 'bg-orange-50 text-orange-800 ring-orange-200',
};

const buscar = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar'))));

type Resultados = Partial<Record<Exclude<TipoMencion, 'persona'>, Mencion[]>>;
interface Personal extends Mencion { zero?: boolean }

/** Una mención ya guardada, como chip. Con enlace si tiene pantalla; la persona, no. Nunca HTML crudo. */
export function ChipMencion({ mencion, sobreOscuro = false }: { mencion: Mencion; sobreOscuro?: boolean }) {
  const href = enlaceDeMencion(mencion);
  const Icono = ICONO[mencion.tipo];
  const clase = `mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 align-baseline text-[0.8125rem] font-semibold ring-1 ring-inset ${
    sobreOscuro ? 'bg-white/90 text-zero-800 ring-white/40' : COLOR[mencion.tipo]}`;
  const dentro = (<><Icono className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{mencion.etiqueta}</span></>);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${clase} hover:underline`}
      title={`Abrir ${mencion.etiqueta}`}>{dentro}</a>
    : <span className={clase}>{dentro}</span>;
}

/** El texto de un mensaje con sus menciones como chips (elementos de React, no HTML). */
export function TextoConMenciones({ texto, sobreOscuro = false }: { texto: string; sobreOscuro?: boolean }) {
  const trozos = partirMenciones(texto);
  if (trozos.length === 1 && 'texto' in trozos[0]) return <>{texto}</>;
  return (
    <>
      {trozos.map((t, i) => ('mencion' in t
        ? <ChipMencion key={i} mencion={t.mencion} sobreOscuro={sobreOscuro} />
        : <span key={i}>{t.texto}</span>))}
    </>
  );
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function useMencionesCaja({ tareaId, texto, setTexto, areaRef, activo }: {
  tareaId: number; texto: string; setTexto: (t: string) => void; areaRef: RefObject<HTMLTextAreaElement | null>; activo: boolean;
}) {
  const base = `/api/administracion-escolar/tareas/${tareaId}/menciones`;
  const [cursor, setCursor] = useState(0);
  const [cerrado, setCerrado] = useState(false);
  const [indice, setIndice] = useState(0);
  const [elegidas, setElegidas] = useState<Mencion[]>([]);
  const [encontrados, setEncontrados] = useState<{ q: string; datos: Resultados } | null>(null);

  const consulta = activo && !cerrado ? consultaAntesDelCursor(texto, cursor) : null;
  const q = (consulta?.consulta ?? '').trim();

  // Las personas: una consulta por tarea, guardada en el cliente.
  const { data: dp } = useSWR<{ personas: Personal[] }>(consulta ? `${base}?personas=1` : null, buscar, {
    revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false, dedupingInterval: 10 * 60_000,
  });

  // Lo demás, buscado con 2 letras o más: 250 ms de espera y cancelando la búsqueda vieja.
  useEffect(() => {
    if (q.length < MIN_BUSQUEDA) return;
    const ctrl = new AbortController();
    const espera = setTimeout(() => {
      fetch(`${base}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((datos: Resultados | null) => { if (datos) setEncontrados({ q, datos }); })
        .catch(() => { /* cancelada o sin red: el menú se queda con lo que había */ });
    }, DEBOUNCE_MENCIONES_MS);
    return () => { clearTimeout(espera); ctrl.abort(); };
  }, [q, base]);

  const grupos = useMemo(() => {
    if (!consulta) return [];
    const n = normalizar(q);
    const personas = (dp?.personas ?? []).filter((p) => !n || normalizar(p.etiqueta).includes(n)).slice(0, MAX_POR_GRUPO);
    const datos = q.length >= MIN_BUSQUEDA && encontrados?.q === q ? encontrados.datos : {};
    return GRUPOS_MENCION.map((g) => ({
      ...g,
      items: (g.tipo === 'persona' ? personas : (datos[g.tipo as Exclude<TipoMencion, 'persona'>] ?? [])).slice(0, MAX_POR_GRUPO),
    })).filter((g) => g.items.length > 0);
  }, [consulta, q, dp, encontrados]);

  const planos = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const abierto = consulta != null && planos.length > 0;

  function elegir(m: Mencion) {
    if (!consulta) return;
    const despues = texto.slice(cursor);
    const insertado = `@${m.etiqueta} `;
    const nuevo = `${texto.slice(0, consulta.desde)}${insertado}${despues}`;
    const pos = consulta.desde + insertado.length;
    setTexto(nuevo);
    setElegidas((e) => [...e, { tipo: m.tipo, id: m.id, etiqueta: m.etiqueta }]);
    setCursor(pos);
    setIndice(0);
    setTimeout(() => { areaRef.current?.focus(); areaRef.current?.setSelectionRange(pos, pos); }, 0);
  }

  /** `true` si la tecla era del menú y ya se atendió. */
  function onTecla(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!abierto) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => (i + 1) % planos.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => (i - 1 + planos.length) % planos.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); elegir(planos[Math.min(indice, planos.length - 1)]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); setCerrado(true); return true; }
    return false;
  }

  return {
    abierto, grupos, planos, indice: Math.min(indice, Math.max(planos.length - 1, 0)), elegir, onTecla,
    /** Al escribir. */
    alEscribir: (valor: string, pos: number) => { setTexto(valor); setCursor(pos); setCerrado(false); setIndice(0); },
    /** Al mover el cursor con flechas o con el ratón. */
    alMoverCursor: (pos: number) => { setCursor(pos); setCerrado(false); },
    /** El texto con sus `@Etiqueta` pasados a tokens. */
    tokenizar: (t: string) => tokenizar(t, elegidas),
    reiniciar: () => { setElegidas([]); setEncontrados(null); },
  };
}

/** El menú flotante sobre la caja. */
export function MenuMenciones({ m }: { m: Pick<ReturnType<typeof useMencionesCaja>, 'abierto' | 'grupos' | 'indice' | 'elegir'> }): ReactNode {
  const activa = useRef<HTMLButtonElement>(null);
  useEffect(() => { activa.current?.scrollIntoView({ block: 'nearest' }); }, [m.indice]);
  if (!m.abierto) return null;
  let n = -1;
  return (
    <div role="listbox" aria-label="Mencionar"
      className="absolute inset-x-0 bottom-full z-30 mb-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      {m.grupos.map((g) => (
        <div key={g.tipo} role="group" aria-label={g.titulo}>
          <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{g.titulo}</p>
          {g.items.map((it) => {
            n += 1;
            const sel = n === m.indice;
            const Icono = ICONO[it.tipo];
            return (
              <button key={`${it.tipo}:${it.id}`} type="button" role="option" aria-selected={sel} ref={sel ? activa : undefined}
                onMouseDown={(e) => { e.preventDefault(); m.elegir(it); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${sel ? 'bg-zero-50 text-zero-900' : 'text-gray-800 hover:bg-gray-50'}`}>
                <Icono className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                <span className={`min-w-0 flex-1 truncate ${it.tipo === 'factura' || it.tipo === 'nc' || it.tipo === 'nd' ? 'font-mono text-xs' : ''}`}>{it.etiqueta}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
