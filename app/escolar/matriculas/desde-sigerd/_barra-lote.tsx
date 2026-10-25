'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { rdCorto } from './_compartido';

/** Un concepto visto desde los alumnos marcados: cuántos pueden llevarlo y cuántos lo llevan. */
export interface ConceptoDelLote {
  conceptoId: number;
  nombre: string;
  /** Marcados cuya sección tiene tarifa de este concepto. */
  aplican: number;
  /** De esos, los que ya lo llevan. */
  tienen: number;
  /** Cómo se escribe su precio, igual que en «Cambiar precio» del alumno. */
  modo: 'cuota' | 'total';
  /** Cuántas cuotas tiene en el año. */
  cuotas: number;
  /** La tarifa escrita en ese modo, si es la misma en todas sus secciones; `null` si varía. */
  tarifaEscrita: number | null;
}

const BOTON = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/25 px-3 text-[13px] text-white transition-colors hover:bg-white/10 disabled:opacity-40';

/**
 * Lo que se le puede hacer de una vez a los alumnos marcados en la vista por
 * alumno: dar o quitar un concepto, ponerles un paquete o un precio, y
 * sacarlos (o volverlos a meter) de esta matriculación.
 */
export function BarraLote({
  n, conceptos, conceptosPrecio, paquetes, puedePrecios, hayDentro, hayPorMatricular, hayFuera,
  onAgregar, onQuitar, onPaquete, onPrecio, onSacar, onIncluir, onLimpiar,
}: {
  n: number;
  conceptos: ConceptoDelLote[];
  /** Los de los marcados que faltan por matricular: a esos se les pone precio. */
  conceptosPrecio: ConceptoDelLote[];
  paquetes: { id: number; nombre: string; conceptosIds: number[] }[];
  puedePrecios: boolean;
  hayDentro: boolean;
  /** Hay marcados sin matrícula: a esos se les puede poner precio o sacar. */
  hayPorMatricular: boolean;
  hayFuera: boolean;
  onAgregar: (conceptoId: number) => void;
  onQuitar: (conceptoId: number) => void;
  onPaquete: (conceptosIds: number[]) => void;
  /** El precio como se escribió: lo de cada cuota, o el total si `modo` es 'total'. */
  onPrecio: (conceptoId: number, escritoCentavos: number) => void;
  onSacar: () => void;
  onIncluir: () => void;
  onLimpiar: () => void;
}) {
  const [precioAbierto, setPrecioAbierto] = useState(false);
  const paraAgregar = conceptos.filter((c) => c.tienen < c.aplican);
  const paraQuitar = conceptos.filter((c) => c.tienen > 0);
  const paraPrecio = conceptosPrecio.filter((c) => c.tienen > 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#1f2a5a] py-2 pl-4 pr-2 text-white shadow-sm">
      <span className="mr-1 text-sm font-semibold">
        {n === 1 ? '1 alumno marcado' : `${n} alumnos marcados`}
      </span>

      {hayDentro && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={BOTON} disabled={paraAgregar.length === 0}
                title="Darles un concepto a todos los marcados">
                Agregar concepto<ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80">
              <DropdownMenuLabel>Agregar a los marcados</DropdownMenuLabel>
              {paraAgregar.map((c) => (
                <DropdownMenuItem key={c.conceptoId} onSelect={() => onAgregar(c.conceptoId)}>
                  <span className="flex-1 truncate">{c.nombre}</span>
                  <span className="ml-3 shrink-0 text-xs tabular-nums text-gray-500">
                    {c.tienen > 0 ? `${c.tienen} de ${c.aplican} ya lo llevan` : `a ${c.aplican}`}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={BOTON} disabled={paraQuitar.length === 0}
                title="Quitarles un concepto a todos los marcados">
                Quitar concepto<ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80">
              <DropdownMenuLabel>Quitar a los marcados</DropdownMenuLabel>
              {paraQuitar.map((c) => (
                <DropdownMenuItem key={c.conceptoId} onSelect={() => onQuitar(c.conceptoId)}>
                  <span className="flex-1 truncate">{c.nombre}</span>
                  <span className="ml-3 shrink-0 text-xs tabular-nums text-gray-500">lo llevan {c.tienen}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {paquetes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={BOTON}
                  title="Cobrarles justo los conceptos de un paquete">
                  Aplicar paquete<ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72">
                <DropdownMenuLabel>Llevan justo lo del paquete</DropdownMenuLabel>
                {paquetes.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => onPaquete(p.conceptosIds)}>{p.nombre}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {puedePrecios && hayPorMatricular && (
            <button type="button" className={BOTON} disabled={paraPrecio.length === 0}
              onClick={() => setPrecioAbierto(true)}
              title="Ponerles un precio propio en un concepto a los marcados que faltan por matricular">
              Cambiar precio
            </button>
          )}

          {hayPorMatricular && (
            <button type="button" className={BOTON} onClick={onSacar}
              title="Los marcados que faltan por matricular no se matriculan ahora">
              No matricular
            </button>
          )}
        </>
      )}

      {hayFuera && (
        <button type="button" className={BOTON} onClick={onIncluir}
          title="Volver a matricular a los marcados que se habían sacado">
          Incluir
        </button>
      )}

      <button type="button" onClick={onLimpiar}
        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-zero-200 hover:bg-white/10">
        <X className="h-3.5 w-3.5" />Quitar marcas
      </button>

      {precioAbierto && (
        <DialogoPrecio conceptos={paraPrecio} n={n}
          onCerrar={() => setPrecioAbierto(false)}
          onAplicar={(id, monto) => { onPrecio(id, monto); setPrecioAbierto(false); }} />
      )}
    </div>
  );
}

function DialogoPrecio({ conceptos, n, onCerrar, onAplicar }: {
  conceptos: ConceptoDelLote[];
  n: number;
  onCerrar: () => void;
  onAplicar: (conceptoId: number, montoCentavos: number) => void;
}) {
  const [conceptoId, setConceptoId] = useState(conceptos[0]?.conceptoId ?? 0);
  const [monto, setMonto] = useState('');
  const c = conceptos.find((x) => x.conceptoId === conceptoId);
  const porCuota = c?.modo === 'cuota' && c.cuotas > 1;
  const centavos = Math.round(Number(monto.replace(/,/g, '')) * 100);
  const valido = monto.trim() !== '' && Number.isFinite(centavos) && centavos >= 0;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar precio</DialogTitle>
          <DialogDescription>
            Se les pone a los marcados que faltan por matricular y llevan el concepto ({c?.tienen ?? 0}). Escribir el de la tarifa quita el precio propio.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Concepto</span>
            <select value={conceptoId} onChange={(e) => setConceptoId(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100">
              {conceptos.map((x) => <option key={x.conceptoId} value={x.conceptoId}>{x.nombre}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">
              {porCuota ? 'Precio de cada cuota (RD$)' : c && c.cuotas > 1 ? 'Precio del año entero (RD$)' : 'Precio (RD$)'}
            </span>
            <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus
              placeholder={c?.tarifaEscrita != null ? String(c.tarifaEscrita / 100) : ''}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm tabular-nums focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
            <span className="mt-1 block text-xs text-gray-500">
              {c?.tarifaEscrita != null
                ? `La tarifa es ${rdCorto(c.tarifaEscrita)}${porCuota ? ` por cuota (${c.cuotas} cuotas)` : ''}.`
                : 'La tarifa cambia de una sección a otra.'}
            </span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" disabled={!valido || !c}
            onClick={() => onAplicar(conceptoId, centavos)}>
            Poner precio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
