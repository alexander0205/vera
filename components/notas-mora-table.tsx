'use client';

/**
 * Subtabla de notas de débito por mora que cuelgan de una factura.
 *
 * Una sola implementación para las dos pantallas donde aparece —Facturas y
 * Cuentas por cobrar—: son el mismo dato y tenerlas con dos diseños distintos
 * obligaba a reaprender la lectura al cambiar de pantalla.
 */

import Link from 'next/link';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

export interface NotaMoraFila {
  id:            number;
  codigo:        string | null;
  montoTotal:    number;
  saldo:         number;
  estado:        'PENDIENTE' | 'PARCIAL' | 'PAGADA';
  fechaEmision?: string | Date | null;
  periodo?:      string | Date | null;
}

const ESTADO: Record<string, { label: string; clase: string }> = {
  // Un acento —el rojo— para lo que falta cobrar; lo demás en gris. El verde
  // sobraba: una nota pagada no necesita celebrarse, necesita dejar de llamar
  // la atención.
  PENDIENTE: { label: 'Pendiente', clase: 'bg-red-50 text-red-700 ring-red-200' },
  PARCIAL:   { label: 'Parcial',   clase: 'bg-red-50/60 text-red-600 ring-red-100' },
  PAGADA:    { label: 'Pagada',    clase: 'bg-gray-100 text-gray-500 ring-gray-200' },
};

export function NotasMoraTable({
  notas, conEstado = true,
}: {
  notas: NotaMoraFila[];
  /**
   * Cuentas por cobrar solo lista notas con saldo, así que la columna diría
   * "Pendiente" en todas las filas: ahí se apaga. En Facturas sí entran las
   * pagadas y el estado es lo que las distingue.
   */
  conEstado?: boolean;
}) {
  if (notas.length === 0) return null;

  const recargo = notas.reduce((s, n) => s + n.montoTotal, 0);
  const saldo   = notas.reduce((s, n) => s + n.saldo, 0);
  const pagado  = recargo - saldo;

  return (
    <div className="py-1">
      {/* Franja teal a la izquierda: se lee como algo que cuelga de la fila de
          arriba, no como una tabla independiente. */}
      <div className="border-l-2 border-teal-300 pl-3 sm:ml-12">
        <div className="overflow-hidden rounded-md border border-gray-300">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                {/* "Mora" y no "Nota de débito": son notas de débito, sí, pero
                    aquí solo cuelgan las del recargo automático. Con el rótulo
                    genérico uno esperaba encontrar también los cargos manuales
                    —un flete, un ajuste— que van por otro camino. */}
                <th className="px-4 py-2 text-left font-semibold">Mora</th>
                <th className="px-3 py-2 text-left font-semibold">Emitida</th>
                <th className="px-3 py-2 text-left font-semibold">Período</th>
                <th className="px-3 py-2 text-right font-semibold">Recargo</th>
                <th className="px-3 py-2 text-right font-semibold">Pagado</th>
                <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                {conEstado && <th className="px-4 py-2 text-right font-semibold">Estado</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {notas.map(nd => {
                const est = ESTADO[nd.estado] ?? ESTADO.PENDIENTE;
                return (
                  <tr key={nd.id} className="bg-white">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/facturas/${nd.id}`}
                        className="whitespace-nowrap font-mono text-xs text-teal-700 underline decoration-teal-200 underline-offset-2 hover:decoration-teal-600"
                      >
                        {nd.codigo ?? `ND #${nd.id}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">
                      {nd.fechaEmision ? fmtFechaCorta(nd.fechaEmision as string) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">
                      {nd.periodo ? fmtFechaCorta(nd.periodo as string) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{fmtDOP(nd.montoTotal)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${nd.montoTotal - nd.saldo > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                      {fmtDOP(nd.montoTotal - nd.saldo)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${nd.saldo > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {fmtDOP(nd.saldo)}
                    </td>
                    {conEstado && (
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${est.clase}`}>
                          {est.label}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {/* El total solo aparece cuando hay más de un recargo: con uno
                solo repetiría cifra por cifra la fila de arriba. Sin rótulos
                ni enlaces — el código de la nota ya lleva al documento. */}
            {notas.length > 1 && (
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 text-xs">
                  <td className="px-4 py-2.5 font-medium text-gray-500" colSpan={3}>Total</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{fmtDOP(recargo)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${pagado > 0 ? 'text-gray-600' : 'text-gray-300'}`}>{fmtDOP(pagado)}</td>
                  <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${saldo > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtDOP(saldo)}</td>
                  {conEstado && <td className="px-4 py-2.5" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
