'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, DownloadCloud, GraduationCap,
  Loader2, Search, UserCheck, UserX,
} from 'lucide-react';

/**
 * «Tienes X alumnos de SIGERD sin matricular. ¿Matricularlos a todos?»
 *
 * Aviso + diálogo. Sale en Matriculación y en Configuración › SIGERD, y solo
 * cuando hay alguien que matricular: con cero no dice nada.
 *
 * El diálogo responde tres preguntas antes de tocar nada: a quién va a
 * matricular, en qué sección lo pone SIGERD, y a quién deja fuera y por qué.
 * Los alumnos salen agrupados por grado → sección, que es como el colegio los
 * piensa, y se pueden buscar por nombre para comprobar uno concreto.
 */

interface Grupo {
  cursoId: number;
  curso: string;
  grado: string;
  seccion: string;
  tanda: string | null;
  estudiantes: Array<{ id: number; nombre: string }>;
}
interface Omitido { nombre: string; ubicacion: string }
interface Pendientes {
  disponible: boolean;
  motivo?: string;
  periodo: { id: number; nombre: string } | null;
  grupos: Grupo[];
  porMatricular: number;
  yaMatriculados: number;
  sinEstudiante: Omitido[];
  sinSeccion: Omitido[];
}
interface Resultado {
  creadas: number;
  conflicto: number;
  error: number;
  secciones: Array<{ curso: string; esperadas: number; creadas: number; conflicto: number; error: number }>;
  fallos: Array<{ curso: string; motivo: string }>;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-DO');

const iniciales = (nombre: string) => {
  const p = nombre.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ''}${p[p.length > 2 ? 2 : 1]?.[0] ?? ''}`.toUpperCase() || '—';
};

export function MatricularSigerdAviso({ onSaved }: { onSaved?: () => void }) {
  const [datos, setDatos] = useState<Pendientes | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [verOmitidos, setVerOmitidos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [matriculando, setMatriculando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd');
    // Sin permiso o sin SIGERD el aviso simplemente no sale.
    if (!res.ok) { setDatos(null); return; }
    setDatos(await res.json());
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Con la búsqueda, solo quedan los alumnos que coinciden y sus secciones; las
  // secciones con coincidencias se abren solas para que se vea al alumno.
  const q = norm(busqueda.trim());
  const grupos = useMemo(() => {
    if (!datos) return [];
    if (!q) return datos.grupos;
    return datos.grupos
      .map((g) => ({ ...g, estudiantes: g.estudiantes.filter((e) => norm(e.nombre).includes(q)) }))
      .filter((g) => g.estudiantes.length > 0);
  }, [datos, q]);

  // Por grado, que es como se piensa el colegio; dentro, sus secciones.
  const porGrado = useMemo(() => {
    const m = new Map<string, Grupo[]>();
    for (const g of grupos) m.set(g.grado, [...(m.get(g.grado) ?? []), g]);
    return [...m.entries()];
  }, [grupos]);

  async function matricular() {
    setMatriculando(true); setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo matricular');
      setResultado(data);
      if (data.creadas > 0) onSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo matricular');
    } finally {
      setMatriculando(false);
    }
  }

  function abrir() {
    setBusqueda(''); setVerOmitidos(false); setError(null); setResultado(null);
    // Pocas secciones: se ven abiertas de entrada. Muchas: cerradas, para no
    // abrir con un muro de 400 nombres.
    setExpandidos(new Set(datos && datos.grupos.length <= 3 ? datos.grupos.map((g) => g.cursoId) : []));
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    // Tras matricular, el aviso se recalcula: normalmente desaparece.
    if (resultado) { setResultado(null); void cargar(); }
  }

  function alternar(id: number) {
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (!datos?.disponible || datos.porMatricular === 0) return null;

  const n = datos.porMatricular;
  const nSecciones = datos.grupos.length;
  const omitidos = datos.sinEstudiante.length + datos.sinSeccion.length;
  const todosAbiertos = grupos.length > 0 && grupos.every((g) => expandidos.has(g.cursoId));
  const visibles = grupos.reduce((t, g) => t + g.estudiantes.length, 0);

  return (
    <>
      {/* ── Aviso ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-zero-200 bg-gradient-to-r from-zero-50 to-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zero-100 text-zero-700">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Tienes {n} alumno{n !== 1 ? 's' : ''} de SIGERD sin matricular
              <span className="font-normal text-gray-500"> · {datos.periodo?.nombre}</span>
            </p>
            <p className="text-xs text-gray-600">
              SIGERD ya dice en qué grado y sección está cada uno ({nSecciones} sección{nSecciones !== 1 ? 'es' : ''}).
              ¿Quieres matricularlos a todos?
            </p>
          </div>
        </div>
        <Button className="shrink-0 bg-zero-600 hover:bg-zero-700" onClick={abrir}>
          <GraduationCap className="mr-2 h-4 w-4" />Ver y matricular
        </Button>
      </div>

      <Dialog open={abierto} onOpenChange={(o: boolean) => { if (!o && !matriculando) cerrar(); }}>
        <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
          <ModalHeader
            title="Matricular desde SIGERD"
            subtitle={resultado
              ? 'Así quedó.'
              : `Cada alumno entra en el grado y la sección que tiene en SIGERD · ${datos.periodo?.nombre}`} />

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {resultado ? (
              /* ── Resultado ──────────────────────────────────────────── */
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Tarjeta n={resultado.creadas} label="Matriculados" tono="verde" icono={<UserCheck className="h-4 w-4" />} />
                  <Tarjeta n={resultado.conflicto} label="Ya tenían matrícula" tono="ambar" icono={<AlertTriangle className="h-4 w-4" />} />
                  <Tarjeta n={resultado.error} label="Con error" tono={resultado.error > 0 ? 'rojo' : 'gris'} icono={<UserX className="h-4 w-4" />} />
                </div>

                <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                  {resultado.secciones.map((s) => {
                    const completo = s.creadas === s.esperadas;
                    return (
                      <div key={s.curso} className="flex items-center gap-3 px-3 py-2.5">
                        {completo
                          ? <Check className="h-4 w-4 shrink-0 text-green-600" />
                          : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{s.curso}</span>
                        <span className="shrink-0 text-xs tabular-nums text-gray-500">
                          {s.creadas} de {s.esperadas}
                          {s.conflicto > 0 && ` · ${s.conflicto} ya estaban`}
                          {s.error > 0 && <span className="text-red-600"> · {s.error} con error</span>}
                        </span>
                      </div>
                    );
                  })}
                  {resultado.fallos.map((f) => (
                    <div key={f.curso} className="flex items-center gap-3 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{f.curso}</span>
                      <span className="shrink-0 text-xs">{f.motivo}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-500">
                  Cada matrícula quedó con los conceptos que tienen tarifa en su sección. Las becas y los
                  precios especiales se ajustan después, en la ficha de la matrícula.
                </p>
              </div>
            ) : (
              <>
                {/* ── Resumen ───────────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Tarjeta n={n} label="Se matriculan" tono="verde" icono={<UserCheck className="h-4 w-4" />} />
                  <Tarjeta n={nSecciones} label="Secciones" tono="azul" icono={<GraduationCap className="h-4 w-4" />} />
                  <Tarjeta n={datos.yaMatriculados} label="Ya inscritos" tono="gris" icono={<Check className="h-4 w-4" />} />
                  <Tarjeta n={omitidos} label="Quedan fuera" tono={omitidos > 0 ? 'ambar' : 'gris'} icono={<AlertTriangle className="h-4 w-4" />} />
                </div>

                {/* ── Buscador + expandir ───────────────────────────────── */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input className="pl-8" placeholder="Buscar un alumno para ver en qué sección entra…"
                      value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" disabled={grupos.length === 0}
                    onClick={() => setExpandidos(todosAbiertos ? new Set() : new Set(grupos.map((g) => g.cursoId)))}>
                    {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
                  </Button>
                </div>
                {q && (
                  <p className="text-xs text-gray-500">
                    {visibles} alumno{visibles !== 1 ? 's' : ''} con «{busqueda.trim()}»
                  </p>
                )}

                {/* ── Grado → sección → alumnos ─────────────────────────── */}
                {porGrado.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-sm text-gray-400">
                    Ningún alumno pendiente con ese nombre.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {porGrado.map(([grado, secciones]) => (
                      <div key={grado} className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{grado}</span>
                          <span className="text-xs tabular-nums text-gray-400">
                            {secciones.reduce((t, g) => t + g.estudiantes.length, 0)}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {secciones.map((g) => {
                            const abiertoG = expandidos.has(g.cursoId) || q !== '';
                            return (
                              <div key={g.cursoId}>
                                <button type="button" onClick={() => alternar(g.cursoId)}
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50">
                                  {abiertoG
                                    ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                                    : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                                  <span className="text-sm font-medium text-gray-900">Sección {g.seccion}</span>
                                  {g.tanda && (
                                    <span className="rounded-full bg-zero-50 px-2 py-0.5 text-[11px] font-medium text-zero-700">{g.tanda}</span>
                                  )}
                                  <span className="ml-auto rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium tabular-nums text-green-700">
                                    {g.estudiantes.length}
                                  </span>
                                </button>
                                {abiertoG && (
                                  <ul className="grid grid-cols-1 gap-x-4 gap-y-1 bg-gray-50/50 px-4 pb-3 pt-1 sm:grid-cols-2">
                                    {g.estudiantes.map((e) => (
                                      <li key={e.id} className="flex items-center gap-2 py-0.5">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zero-100 text-[10px] font-semibold text-zero-700">
                                          {iniciales(e.nombre)}
                                        </span>
                                        <span className="truncate text-xs text-gray-700">{e.nombre}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Los que quedan fuera, con nombre y motivo ─────────── */}
                {omitidos > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60">
                    <button type="button" onClick={() => setVerOmitidos((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                      {verOmitidos ? <ChevronDown className="h-4 w-4 text-amber-700" /> : <ChevronRight className="h-4 w-4 text-amber-700" />}
                      <span className="text-sm font-medium text-amber-900">
                        {omitidos} alumno{omitidos !== 1 ? 's' : ''} de SIGERD quedan fuera
                      </span>
                    </button>
                    {verOmitidos && (
                      <div className="space-y-3 px-4 pb-3 text-xs text-amber-900">
                        <OmitidosLista titulo="Sin ficha de estudiante activa" ayuda="Cruza los estudiantes en Configuración › SIGERD, o reactívalos."
                          lista={datos.sinEstudiante} />
                        <OmitidosLista titulo="Su sección de SIGERD no está en tu estructura de este año" ayuda="Importa la estructura en Configuración › SIGERD."
                          lista={datos.sinSeccion} />
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Entran con todos los conceptos que tienen tarifa en su sección, igual que «Nueva matrícula».
                  {datos.yaMatriculados > 0 && ` Los ${datos.yaMatriculados} que ya tienen matrícula este año no se tocan.`}
                </p>
              </>
            )}
          </div>

          <DialogFooter>
            {resultado ? (
              <div className="flex w-full items-center justify-between">
                <Link href="/escolar/matriculas" onClick={cerrar} className="text-sm font-medium text-zero-600 hover:underline">
                  Ver las matrículas
                </Link>
                <Button className="bg-zero-600 hover:bg-zero-700" onClick={cerrar}>Cerrar</Button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-xs text-gray-500">
                  {matriculando ? `Matriculando ${n} alumnos en ${nSecciones} secciones…` : ''}
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={cerrar} disabled={matriculando}>Cancelar</Button>
                  <Button className="bg-zero-600 hover:bg-zero-700" onClick={matricular} disabled={matriculando}>
                    {matriculando
                      ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Matriculando…</>
                      : <><Check className="mr-1 h-4 w-4" />Matricular a todos ({n})</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Tarjeta({ n, label, tono, icono }: {
  n: number; label: string; icono: React.ReactNode;
  tono: 'verde' | 'ambar' | 'gris' | 'rojo' | 'azul';
}) {
  const clase = {
    verde: 'border-green-200 bg-green-50 text-green-800',
    ambar: 'border-amber-200 bg-amber-50 text-amber-800',
    gris:  'border-gray-200 bg-gray-50 text-gray-600',
    rojo:  'border-red-200 bg-red-50 text-red-700',
    azul:  'border-zero-200 bg-zero-50 text-zero-700',
  }[tono];
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${clase}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
        {icono}{label}
      </div>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{n}</p>
    </div>
  );
}

function OmitidosLista({ titulo, ayuda, lista }: { titulo: string; ayuda: string; lista: Omitido[] }) {
  if (lista.length === 0) return null;
  return (
    <div>
      <p className="font-semibold">{titulo} ({lista.length})</p>
      <p className="mb-1 text-amber-800/80">{ayuda}</p>
      <ul className="max-h-32 space-y-0.5 overflow-y-auto">
        {lista.map((o, i) => (
          <li key={`${o.nombre}-${i}`} className="flex justify-between gap-3">
            <span className="truncate">{o.nombre}</span>
            <span className="shrink-0 text-amber-800/70">{o.ubicacion}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
