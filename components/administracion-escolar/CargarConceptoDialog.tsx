'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtDOP } from '@/lib/utils/format';

interface Alumno {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  resultado: 'crear' | 'duplicado' | 'sin-tarifa';
}

/** Asigna el concepto entero; cada cuota se cobra en su fecha. */
export function CargarConceptoDialog({
  concepto, grupoNombre, montoCentavos, periodo, cursoIds, onCerrar, onCreado,
}: {
  concepto: { id: number; nombre: string; tipo: string };
  grupoNombre: string;
  montoCentavos: number;
  periodo: { id: number; nombre: string; activo: boolean };
  cursoIds: number[];
  onCerrar: () => void;
  onCreado?: (asignados: number) => void;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[] | null>(null);
  const [cuotas, setCuotas] = useState<{ id: number; etiqueta: string; fechaEmision: string; activo: boolean }[] | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mirando, setMirando] = useState(false);

  const revisar = useCallback(async () => {
    setMirando(true);
    setError(null);
    setAlumnos(null);
    try {
      const [r, c] = await Promise.all([
        fetch('/api/administracion-escolar/conceptos/asignar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodoId: periodo.id, conceptoId: concepto.id, cursoIds, revisar: true }),
        }),
        fetch(`/api/administracion-escolar/conceptos/${concepto.id}/cuotas?periodoId=${periodo.id}`),
      ]);
      const [datos, calendario] = await Promise.all([r.json(), c.json()]);
      if (!r.ok || !c.ok) throw new Error(datos?.error ?? calendario?.error ?? 'No se pudo revisar el concepto.');
      const lista: Alumno[] = datos.detalles ?? [];
      setAlumnos(lista);
      setCuotas((calendario.cuotas ?? []).filter((q: { activo: boolean }) => q.activo));
      setSeleccion(new Set(lista.filter((a) => a.resultado === 'crear').map((a) => a.estudianteId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar el concepto.');
    } finally {
      setMirando(false);
    }
  }, [concepto.id, cursoIds, periodo.id]);

  useEffect(() => { void revisar(); }, [revisar]);

  async function asignar() {
    if (guardando || seleccion.size === 0) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/conceptos/asignar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodoId: periodo.id, conceptoId: concepto.id, cursoIds, estudianteIds: [...seleccion] }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? 'No se pudo asignar el concepto.');
      toast.success(`«${concepto.nombre}» asignado a ${datos.asignados} alumnos`, {
        description: datos.devengoPendiente
          ? 'El plan quedó guardado. Los cargos cuya fecha ya llegó se generarán en la próxima revisión automática.'
          : undefined,
      });
      onCreado?.(datos.asignados);
      onCerrar();
    } catch (e) {
      setConfirmando(false);
      setError(e instanceof Error ? e.message : 'No se pudo confirmar. Vuelve a revisar la lista.');
      // La respuesta pudo perderse tras guardar. Solo una revisión permite reintentar.
      setAlumnos(null);
      setSeleccion(new Set());
    } finally {
      setGuardando(false);
    }
  }

  const pendientes = alumnos?.filter((a) => a.resultado === 'crear') ?? [];
  const asociados = alumnos?.filter((a) => a.resultado === 'duplicado').length ?? 0;
  const sinTarifa = alumnos?.filter((a) => a.resultado === 'sin-tarifa').length ?? 0;
  const montoPorEvaluacion = /^evaluaci[oó]n\s+(inicial|primaria)$/i.test(concepto.nombre)
    && cuotas?.length && montoCentavos % cuotas.length === 0
    ? montoCentavos / cuotas.length : null;
  const visibles = (alumnos ?? []).filter((a) =>
    `${a.nombre} ${a.codigo ?? ''}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')));
  const marcables = visibles.filter((a) => a.resultado === 'crear');

  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !guardando) onCerrar(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-zero-600" />
            {`Asignar «${concepto.nombre}» a los alumnos de ${grupoNombre}`}
          </DialogTitle>
          <p className="text-sm text-gray-500">
            {montoPorEvaluacion != null
              ? `${fmtDOP(montoPorEvaluacion)} por evaluación · ${fmtDOP(montoCentavos)} en el año escolar ${periodo.nombre}`
              : `Tarifa de esta fila: ${fmtDOP(montoCentavos)} · Año escolar ${periodo.nombre}`}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Se asigna el concepto completo. Sus pagos previstos aparecerán en la ficha del alumno
            y serán cargos pendientes cuando llegue su fecha de emisión.
          </p>
          {cuotas && cuotas.length > 0 && <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <p className="font-medium">Pagos del calendario</p>
            <ul className="mt-1 space-y-1 text-gray-600">
              {cuotas.map((q) => <li key={q.id}>
                {q.etiqueta} · {q.fechaEmision}{montoPorEvaluacion != null && ` · ${fmtDOP(montoPorEvaluacion)}`}
              </li>)}
            </ul>
          </div>}
          {cuotas?.length === 0 && <p className="text-sm text-gray-600">Este concepto tiene un solo pago, sin calendario de cuotas.</p>}
          {mirando && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando alumnos…</p>}
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error} <Button type="button" size="sm" variant="outline" onClick={() => void revisar()}>Volver a revisar</Button>
          </div>}
          {alumnos && <>
            <p className="text-sm text-gray-600">{pendientes.length} sin asignar · {asociados} ya asociados{sinTarifa > 0 ? ` · ${sinTarifa} sin tarifa válida` : ''}</p>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-8" placeholder="Buscar por nombre…" aria-label="Buscar alumno" /></div>
              <Button type="button" size="sm" variant="outline" disabled={!marcables.length} onClick={() => setSeleccion((s) => {
                const n = new Set(s); marcables.forEach((a) => n.delete(a.estudianteId)); return n;
              })}>Quitar marcas visibles</Button>
              <Button type="button" size="sm" variant="outline" disabled={!marcables.length} onClick={() => setSeleccion((s) => {
                const n = new Set(s); marcables.forEach((a) => n.add(a.estudianteId)); return n;
              })}>Marcar visibles</Button>
            </div>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {visibles.map((a) => <li key={a.estudianteId}>
                <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${a.resultado === 'crear' ? 'cursor-pointer' : 'bg-gray-50 text-gray-500'}`}>
                  <input type="checkbox" disabled={a.resultado !== 'crear'} checked={seleccion.has(a.estudianteId)}
                    onChange={() => setSeleccion((s) => { const n = new Set(s); if (!n.delete(a.estudianteId)) n.add(a.estudianteId); return n; })} />
                  <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                  {a.resultado === 'duplicado' && <span className="text-xs">Ya asociado</span>}
                  {a.resultado === 'sin-tarifa' && <span className="text-xs">Sin tarifa</span>}
                </label>
              </li>)}
            </ul>
          </>}
        </div>
        <DialogFooter className="border-t border-gray-100 px-5 py-3">
          <p className="mr-auto text-sm text-gray-600">{seleccion.size} alumnos recibirán todos los pagos previstos.</p>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="button" onClick={() => setConfirmando(true)} disabled={!alumnos || seleccion.size === 0 || guardando}>Asignar concepto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmando} onOpenChange={(open) => { if (!open && !guardando) setConfirmando(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>¿Asignar el concepto completo?</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-700">{`«${concepto.nombre}» se añadirá al plan de ${seleccion.size} alumnos de ${grupoNombre}. Sus pagos seguirán las fechas del calendario; no se crearán todas las deudas hoy.`}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmando(false)} disabled={guardando}>Volver</Button>
          <Button type="button" onClick={() => void asignar()} disabled={guardando}>{guardando ? 'Asignando…' : 'Sí, asignar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
