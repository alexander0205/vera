'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  Loader2, Mail, Check, AlertTriangle, Search, MailWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import type { ResumenSeguimiento, FilaSeguimiento } from '@/lib/administracion-escolar/documentos-seguimiento';

/**
 * Quién tiene el expediente incompleto, en todo el colegio.
 *
 * La pantalla que faltaba: hasta ahora los documentos solo se veían entrando en
 * la ficha de cada alumno, así que con cuatrocientas matrículas nadie sabía a
 * quién reclamarle sin abrirlas una por una.
 *
 * Abre por lo más incompleto, no alfabético: el orden de la lista es el orden
 * en que hay que reclamar.
 */

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

interface Previsualizacion {
  seEnviaran: { matriculaId: number; estudiante: string; email: string; pendientes: string[] }[];
  sinCorreo: { matriculaId: number; estudiante: string }[];
  yaCompletas: { matriculaId: number; estudiante: string }[];
}

export function SeguimientoDocumentos() {
  const { data, isLoading, mutate } = useSWR<ResumenSeguimiento>(
    '/api/administracion-escolar/documentos/seguimiento', fetcher, { revalidateOnFocus: false },
  );

  const [busca, setBusca] = useState('');
  const [curso, setCurso] = useState('');
  const [soloIncompletas, setSoloIncompletas] = useState(true);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [previa, setPrevia] = useState<Previsualizacion | null>(null);
  const [mandando, setMandando] = useState(false);

  const cursos = useMemo(
    () => [...new Set((data?.filas ?? []).map((f) => f.curso).filter(Boolean))].sort() as string[],
    [data],
  );

  const filas = useMemo(() => {
    let r = data?.filas ?? [];
    if (soloIncompletas) r = r.filter((f) => !f.completa);
    if (curso) r = r.filter((f) => f.curso === curso);
    const q = busca.trim().toLowerCase();
    if (q) r = r.filter((f) => f.estudiante.toLowerCase().includes(q));
    return r;
  }, [data, soloIncompletas, curso, busca]);

  const seleccionables = filas.filter((f) => !f.completa);
  const todasElegidas = seleccionables.length > 0 && seleccionables.every((f) => elegidas.has(f.matriculaId));

  function alternar(id: number) {
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function pedirPrevia() {
    try {
      const res = await fetch('/api/administracion-escolar/documentos/reclamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matriculaIds: [...elegidas] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo preparar el envío');
      setPrevia(json);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo preparar el envío');
    }
  }

  async function enviar() {
    setMandando(true);
    try {
      const res = await fetch('/api/administracion-escolar/documentos/reclamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matriculaIds: [...elegidas], confirmar: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar');
      toast.success(
        json.enviados === 1 ? 'Enviado a 1 familia.' : `Enviado a ${json.enviados} familias.`,
      );
      if (json.fallos?.length) {
        toast.error(`${json.fallos.length} no salieron: ${json.fallos[0].motivo}`);
      }
      setPrevia(null);
      setElegidas(new Set());
      await mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setMandando(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>;
  }

  if (!data?.periodoId) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-500">No hay un período escolar activo.</p>
      </div>
    );
  }

  const t = data.totales;

  return (
    <div className="space-y-4">
      {/* El estado del colegio de un vistazo, no cuatro píldoras de colores. */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <p className="text-sm text-gray-900">
            <span className="font-semibold">{t.completas}</span>
            <span className="text-gray-400"> / {t.matriculas}</span>
            <span className="ml-1.5 text-gray-500">expedientes completos</span>
            <span className="ml-2 text-xs text-gray-400">· {data.periodoNombre}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-zero-500 transition-all"
              style={{ width: `${t.matriculas === 0 ? 0 : Math.round((t.completas / t.matriculas) * 100)}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {t.porAprobar > 0 && (
              <span className="font-medium text-amber-700">{t.porAprobar} esperando tu revisión</span>
            )}
            {t.conPendientes > 0 && <span className="text-gray-500">{t.conPendientes} con algo pendiente</span>}
            {t.sinCorreo > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <MailWarning className="h-3.5 w-3.5" />{t.sinCorreo} sin correo al que escribir
              </span>
            )}
          </p>
        </div>

        <Button
          disabled={elegidas.size === 0}
          onClick={() => void pedirPrevia()}
        >
          <Mail className="mr-1.5 h-4 w-4" />
          {elegidas.size === 0
            ? 'Reclamar por correo'
            : `Reclamar a ${elegidas.size}`}
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar alumno…" className="h-9 pl-9 text-sm" />
        </div>
        <div className="w-44">
          <NativeSelect value={curso} onChange={(e) => setCurso(e.target.value)}
            aria-label="Filtrar por curso" className="text-sm">
            <option value="">Todos los cursos</option>
            {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={soloIncompletas}
            onChange={(e) => setSoloIncompletas(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-zero-600" />
          Solo los incompletos
        </label>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <Check className="mx-auto mb-2 h-8 w-8 text-zero-300" />
          <p className="text-sm text-gray-500">
            {soloIncompletas
              ? 'Nadie tiene documentos pendientes con estos filtros.'
              : 'No hay matrículas con estos filtros.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label="Elegir todos"
                    checked={todasElegidas}
                    onChange={(e) => setElegidas(e.target.checked
                      ? new Set(seleccionables.map((f) => f.matriculaId))
                      : new Set())}
                    className="h-4 w-4 rounded border-gray-300 text-zero-600" />
                </th>
                <th className="px-3 py-2 font-medium">Alumno</th>
                <th className="px-3 py-2 font-medium">Curso</th>
                <th className="px-3 py-2 font-medium">Le falta</th>
                <th className="px-3 py-2 text-right font-medium">Avance</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => <Fila key={f.matriculaId} f={f} elegida={elegidas.has(f.matriculaId)} onElegir={alternar} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Previsualización: mandar cien correos no se deshace. */}
      <Dialog open={previa !== null} onOpenChange={(o) => { if (!o) setPrevia(null); }}>
        <DialogContent className="max-w-lg">
          <ModalHeader
            title="Antes de mandarlo"
            subtitle={previa
              ? `Cada familia recibe su propio enlace con lo que le falta. ${previa.seEnviaran.length} saldrá${previa.seEnviaran.length === 1 ? '' : 'n'}.`
              : undefined}
          />
          <div className="max-h-[50vh] space-y-3 overflow-y-auto px-6 py-4">
            {previa?.seEnviaran.length === 0 && (
              <p className="text-sm text-gray-500">No hay a quién mandárselo con lo elegido.</p>
            )}
            {previa && previa.seEnviaran.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {previa.seEnviaran.slice(0, 8).map((e) => (
                  <li key={e.matriculaId} className="px-3 py-2">
                    <p className="text-sm text-gray-900">{e.estudiante}</p>
                    <p className="text-xs text-gray-500">{e.email} · le faltan {e.pendientes.length}</p>
                  </li>
                ))}
                {previa.seEnviaran.length > 8 && (
                  <li className="px-3 py-2 text-xs text-gray-500">
                    y {previa.seEnviaran.length - 8} más…
                  </li>
                )}
              </ul>
            )}

            {previa && previa.sinCorreo.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-900">
                  {previa.sinCorreo.length} se quedan fuera porque su responsable no tiene correo:{' '}
                  {previa.sinCorreo.slice(0, 3).map((s) => s.estudiante).join(', ')}
                  {previa.sinCorreo.length > 3 && '…'}
                </p>
              </div>
            )}

            {previa && previa.yaCompletas.length > 0 && (
              <p className="text-xs text-gray-500">
                {previa.yaCompletas.length} ya tienen todo entregado y no se les molesta.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={mandando}>Cancelar</Button>
            <Button onClick={() => void enviar()}
              disabled={mandando || !previa || previa.seEnviaran.length === 0}>
              {mandando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fila({ f, elegida, onElegir }: {
  f: FilaSeguimiento; elegida: boolean; onElegir: (id: number) => void;
}) {
  const pct = f.total === 0 ? 100 : Math.round((f.aprobados / f.total) * 100);
  return (
    <tr className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
      <td className="px-3 py-2.5">
        {!f.completa && (
          <input type="checkbox" checked={elegida} onChange={() => onElegir(f.matriculaId)}
            aria-label={`Elegir ${f.estudiante}`}
            className="h-4 w-4 rounded border-gray-300 text-zero-600" />
        )}
      </td>
      <td className="px-3 py-2.5">
        <Link href={`/escolar/estudiantes/${f.estudianteId}?tab=documentos`}
          className="font-medium text-gray-900 hover:text-zero-700 hover:underline">
          {f.estudiante}
        </Link>
        {/* Sin correo no hay a quién reclamarle: se dice aquí y no solo en el
            resumen, porque es lo que explica por qué esa fila no se mueve. */}
        {!f.completa && !f.email && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700">
            <MailWarning className="h-3 w-3" />sin correo
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-gray-600">{f.curso ?? '—'}</td>
      <td className="px-3 py-2.5">
        {f.completa
          ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-zero-600" />Completo
            </span>
          : <span className="text-xs text-gray-600" title={f.pendientes.join(', ')}>
              {f.pendientes.slice(0, 2).join(', ')}
              {f.pendientes.length > 2 && ` y ${f.pendientes.length - 2} más`}
            </span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          {f.porAprobar > 0 && (
            <span className="text-[11px] font-medium text-amber-700">{f.porAprobar} por revisar</span>
          )}
          <span className="w-10 text-right text-xs tabular-nums text-gray-500">{pct}%</span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${f.completa ? 'bg-zero-600' : 'bg-zero-400'}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </td>
    </tr>
  );
}
