'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import { cuotasYaEmitidas } from '@/lib/administracion-escolar/cargo-desde-tarifa';
import { cuotasDeLaTarifa, montosPorCuota } from '@/lib/administracion-escolar/repartir';

interface Alumno {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  resultado: 'crear' | 'duplicado' | 'cargo-suelto' | 'sin-tarifa';
  /** Otra colegiatura que ya tiene en su plan, si lo que se asigna es una colegiatura. */
  otraColegiatura: string | null;
}

interface Cuota {
  id: number;
  etiqueta: string;
  fechaEmision: string;
  porcentajeMilesimas: number;
  activo: boolean;
}

/** Asigna el concepto entero; cada cuota se cobra en su fecha. */
export function CargarConceptoDialog({
  concepto, grupoNombre, montoCentavos, cuotasTarifa, periodo, cursoIds, onCerrar, onCreado,
}: {
  concepto: { id: number; nombre: string; tipo: string; precioPorCuota?: boolean | null };
  grupoNombre: string;
  montoCentavos: number;
  /** Cuántas cuotas del calendario cobra la tarifa de la fila (las primeras N). */
  cuotasTarifa?: number | null;
  periodo: { id: number; nombre: string; activo: boolean };
  cursoIds: number[];
  onCerrar: () => void;
  onCreado?: (asignados: number) => void;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[] | null>(null);
  const [cuotas, setCuotas] = useState<Cuota[] | null>(null);
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
      // Quien ya tiene otra colegiatura no se marca solo: asignársela a todos
      // les pondría dos al mes. Se puede marcar a mano (sala de tareas,
      // guardería), pero tiene que ser una decisión.
      setSeleccion(new Set(lista
        .filter((a) => a.resultado === 'crear' && !a.otraColegiatura)
        .map((a) => a.estudianteId)));
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
  const conCargoSuelto = alumnos?.filter((a) => a.resultado === 'cargo-suelto').length ?? 0;
  const conOtraColegiatura = pendientes.filter((a) => a.otraColegiatura).length;
  const marcadosConOtra = pendientes.filter((a) => a.otraColegiatura && seleccion.has(a.estudianteId)).length;
  const esColegiatura = concepto.tipo === 'mensualidad';
  // Lo que sale en cada pago con la tarifa de la fila, con la misma regla que
  // el plan del año. Un alumno con beca o precio propio paga distinto.
  const deLaTarifa = cuotas ? cuotasDeLaTarifa(cuotas, cuotasTarifa) : null;
  const montos = deLaTarifa && deLaTarifa.length > 0
    ? montosPorCuota(concepto.tipo, montoCentavos, deLaTarifa.map((q) => q.porcentajeMilesimas), concepto.precioPorCuota)
    : null;
  const todosIguales = montos != null && montos.every((m) => m === montos[0]);
  const yaEmitidas = cuotas ? cuotasYaEmitidas(cuotas, hoyRD()) : 0;
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
            {montos && montos.length > 1 && todosIguales
              ? `${fmtDOP(montos[0])} por pago · ${montos.length} pagos · ${fmtDOP(montos.reduce((a, b) => a + b, 0))} en el año escolar ${periodo.nombre}`
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
              {cuotas.map((q, i) => <li key={q.id}>
                {q.etiqueta} · {q.fechaEmision}{montos && ` · ${fmtDOP(montos[i])}`}
              </li>)}
            </ul>
          </div>}
          {esColegiatura && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Es una colegiatura: cada pago cobra la tarifa entera.
            {conOtraColegiatura > 0 && ` ${conOtraColegiatura === 1 ? '1 alumno ya tiene' : `${conOtraColegiatura} alumnos ya tienen`} otra colegiatura en su plan y no se marcan solos: asignarles esta les cobraría dos cada mes.`}
          </p>}
          {yaEmitidas > 0 && <p className="text-sm text-gray-600">
            {yaEmitidas === 1
              ? 'Un pago ya tiene su fecha pasada: se crea como cargo al confirmar.'
              : `${yaEmitidas} pagos ya tienen su fecha pasada: se crean como cargo al confirmar.`}
          </p>}
          {cuotas?.length === 0 && <p className="text-sm text-gray-600">Este concepto tiene un solo pago, sin calendario de cuotas.</p>}
          {mirando && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando alumnos…</p>}
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error} <Button type="button" size="sm" variant="outline" onClick={() => void revisar()}>Volver a revisar</Button>
          </div>}
          {alumnos && <>
            <p className="text-sm text-gray-600">
              {pendientes.length} sin asignar · {asociados} ya asociados
              {conCargoSuelto > 0 ? ` · ${conCargoSuelto} con un cargo suelto de este concepto` : ''}
              {sinTarifa > 0 ? ` · ${sinTarifa} sin tarifa válida` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-8" placeholder="Buscar por nombre…" aria-label="Buscar alumno" /></div>
              <Tooltip text="Desmarca a los alumnos que se ven en esta lista"><Button type="button" size="sm" variant="outline" disabled={!marcables.length} onClick={() => setSeleccion((s) => {
                const n = new Set(s); marcables.forEach((a) => n.delete(a.estudianteId)); return n;
              })}>Quitar marcas visibles</Button></Tooltip>
              <Tooltip text="Marca a todos los alumnos que se ven en esta lista"><Button type="button" size="sm" variant="outline" disabled={!marcables.length} onClick={() => setSeleccion((s) => {
                const n = new Set(s); marcables.forEach((a) => n.add(a.estudianteId)); return n;
              })}>Marcar visibles</Button></Tooltip>
            </div>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {visibles.map((a) => <li key={a.estudianteId}>
                <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${a.resultado === 'crear' ? 'cursor-pointer' : 'bg-gray-50 text-gray-500'}`}>
                  <input type="checkbox" disabled={a.resultado !== 'crear'} checked={seleccion.has(a.estudianteId)}
                    onChange={() => setSeleccion((s) => { const n = new Set(s); if (!n.delete(a.estudianteId)) n.add(a.estudianteId); return n; })} />
                  <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                  {a.resultado === 'crear' && a.otraColegiatura && (
                    <span className="shrink-0 text-xs text-amber-700">Ya tiene «{a.otraColegiatura}»</span>
                  )}
                  {a.resultado === 'duplicado' && <span className="text-xs">Ya asociado</span>}
                  {a.resultado === 'cargo-suelto' && <span className="text-xs" title="Tiene un cargo de este concepto puesto a mano, sin mes. Asignarle el calendario se lo cobraría otra vez.">Tiene un cargo suelto</span>}
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
        <p className="text-sm text-gray-700">{`«${concepto.nombre}» se añadirá al plan de ${seleccion.size} alumnos de ${grupoNombre}. Sus pagos seguirán las fechas del calendario.`}</p>
        {yaEmitidas > 0 && <p className="text-sm text-gray-700">
          {yaEmitidas === 1
            ? 'El pago con fecha ya pasada se crea hoy como cargo pendiente.'
            : `Los ${yaEmitidas} pagos con fecha ya pasada se crean hoy como cargos pendientes.`}
        </p>}
        {marcadosConOtra > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {marcadosConOtra === 1
            ? '1 de ellos ya tiene otra colegiatura: pagará las dos cada mes.'
            : `${marcadosConOtra} de ellos ya tienen otra colegiatura: pagarán las dos cada mes.`}
        </p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmando(false)} disabled={guardando}>Volver</Button>
          <Button type="button" onClick={() => void asignar()} disabled={guardando}>{guardando ? 'Asignando…' : 'Sí, asignar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
