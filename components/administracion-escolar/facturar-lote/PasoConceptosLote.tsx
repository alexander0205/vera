'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { esFechaValida, fechaEnLetras } from '@/lib/administracion-escolar/cargo-lote';
import { marcarVarios, type ConceptoCatalogo } from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Paso 2 de «Facturar por lote»: qué se factura.
 *
 * Tres respuestas, todas aquí para que se lean juntas:
 *
 *  - **Los conceptos**: solo se ofrecen los que tienen algo sin factura este
 *    año, con cuántos cargos y cuánto suman. Marcar uno sin pendientes no haría
 *    nada, y con quince conceptos en el catálogo taparía los que importan.
 *  - **«Cuotas emitidas hasta»**: el corte. Entra lo que ya se emitió en esa
 *    fecha o antes; viene puesto en hoy, así que lo que todavía no toca no se
 *    factura por descuido. Subirlo es una decisión que se toma a propósito.
 *  - **«Juntar hermanos»**: apagado, una factura por alumno — como lo pidió el
 *    colegio. Encendido, una por responsable de pago, que es lo que hace la
 *    facturación automática.
 */

const CASILLA = 'h-4 w-4 shrink-0 accent-zero-600';

export function PasoConceptosLote({
  conceptos, seleccionados, onConceptos, hasta, onHasta, juntar, onJuntar,
}: {
  conceptos: ConceptoCatalogo[];
  seleccionados: Set<number>;
  onConceptos: (siguiente: Set<number>) => void;
  hasta: string;
  onHasta: (fecha: string) => void;
  juntar: boolean;
  onJuntar: (juntar: boolean) => void;
}) {
  const todos = conceptos.length > 0 && conceptos.every((c) => seleccionados.has(c.id));
  const fechaOk = esFechaValida(hasta);

  return (
    <div className="space-y-5 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <fieldset>
        <legend className="sr-only">Conceptos a facturar</legend>
        {conceptos.length === 0 ? (
          <p className="rounded-lg border border-gray-200 px-3 py-4 text-sm text-gray-600">
            No hay ningún concepto con cargos sin factura en este año escolar.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <label className="flex cursor-pointer items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              <input type="checkbox" className={CASILLA} checked={todos}
                onChange={() => onConceptos(marcarVarios(seleccionados, conceptos.map((c) => c.id), !todos))} />
              Todos los conceptos ({conceptos.length})
            </label>
            <ul className="divide-y divide-gray-100">
              {conceptos.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-gray-50 sm:py-2.5">
                    <input type="checkbox" className={CASILLA} checked={seleccionados.has(c.id)}
                      onChange={() => onConceptos(marcarVarios(seleccionados, [c.id], !seleccionados.has(c.id)))} />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{c.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-600">
                      {c.sinFactura > 0
                        ? <>{c.sinFactura} {c.sinFactura === 1 ? 'cargo' : 'cargos'} · {fmtDOP(c.sinFacturaCentavos)}</>
                        // Nada sin facturar (o aún sin cargos): se puede igual
                        // adelantando sus cuotas hasta la fecha de corte de abajo.
                        : <span className="text-gray-400">Nada pendiente</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor="facturar-lote-hasta">Cuotas emitidas hasta</Label>
        <Input id="facturar-lote-hasta" type="date" value={hasta} error={!fechaOk}
          onChange={(e) => onHasta(e.target.value)} />
        <p className="text-xs text-gray-500">
          {fechaOk
            ? <>Entra lo que se emite el {fechaEnLetras(hasta)} o antes. Para facturar por adelantado (la cuota del mes que viene), pon una fecha más adelante: al crear las facturas se generan esas cuotas, y el cobro automático no las repite.</>
            : 'Escribe una fecha válida.'}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3">
        <input type="checkbox" className={`${CASILLA} mt-0.5`} checked={juntar}
          onChange={(e) => onJuntar(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium text-gray-900">Juntar hermanos en una sola factura</span>
          <span className="block text-xs text-gray-500">
            {juntar
              ? 'Una factura por responsable de pago, con una línea por hijo.'
              : 'Apagado: una factura por cada alumno, aunque tengan el mismo responsable.'}
          </span>
        </span>
      </label>
    </div>
  );
}
