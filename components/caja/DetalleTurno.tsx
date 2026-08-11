'use client';

/**
 * Detalle de lo que pasó en un turno, para revisar un cierre sin salir de la
 * pantalla de aprobaciones.
 *
 * Antes, el owner aprobaba viendo solo apertura/esperado/contado: para saber qué
 * se hizo tenía que abrir la hoja de impresión en otra pestaña, así que en la
 * práctica se aprobaba a ciegas.
 *
 * Se carga bajo demanda (al desplegar) — son dos consultas que no valen la pena
 * si el owner solo va a mirar la diferencia.
 *
 * Reusa GET /api/caja/turnos/[id]/detalle, el mismo que imprime la hoja: una
 * sola fuente para los dos sitios, y lo que se aprueba es lo que se imprime.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { labelMetodo, esEfectivo } from '@/lib/pagos/metodos';

/** Comprobante que amerita revisión: anulado, o con saldo sin cobrar. */
interface Excepcion {
  id: number;
  codigo: string | null;
  encf: string | null;
  estado: string;
  cliente: string | null;
  totalCentavos: number;
  pagadoCentavos: number;
  pendienteCentavos: number;
}
interface Resumen {
  cantidadCobros: number;
  cantidadComprobantes: number;
  cantidadAnulados: number;
  cantidadConPendiente: number;
}
interface Movimiento {
  id: number;
  tipo: string;
  montoCentavos: number;
  metodo: string | null;
  descripcion: string | null;
  motivo: string | null;
}
interface PagoMetodo {
  metodo: string;
  totalCentavos: number;
  /** Sólo el efectivo llega a la gaveta y entra en el cuadre. */
  esEfectivo: boolean;
}
interface Detalle {
  pagos: PagoMetodo[];
  movimientos: Movimiento[];
  resumen: Resumen;
  excepciones: Excepcion[];
  hayMasExcepciones: boolean;
  totalCobrosCentavos: number;
  efectivoCentavos: number;
  otrosMetodosCentavos: number;
  totalFacturadoCentavos: number;
  totalPendienteCentavos: number;
}

const fmt = (c: number) =>
  (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DetalleTurno({ turnoId }: { turnoId: number }) {
  const [data, setData] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/caja/turnos/${turnoId}/detalle`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar el detalle'))))
      .then(d => { if (vivo) setData(d); })
      .catch(e => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [turnoId]);

  if (error) return <p className="px-1 py-3 text-sm text-red-600">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 px-1 py-3 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle…
      </p>
    );
  }

  const { pagos, movimientos, resumen, excepciones } = data;

  return (
    <div className="space-y-4 pt-1">
      {/* Cobrado por método — de todo lo cobrado, cuánto debería estar en la
          gaveta. Sólo el efectivo entra al cuadre. */}
      {pagos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Cobrado por método ({resumen.cantidadCobros} cobros)
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {pagos.map(p => (
              <div
                key={p.metodo}
                className={`rounded-xl p-3 ${p.esEfectivo ? 'bg-emerald-50' : 'bg-gray-50'}`}
              >
                <p className={`text-xs ${p.esEfectivo ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {p.metodo}
                  {p.esEfectivo && <span className="ml-1 text-[10px]">· en gaveta</span>}
                </p>
                <p className={`text-sm font-bold tabular-nums ${p.esEfectivo ? 'text-emerald-900' : 'text-gray-900'}`}>
                  RD$ {fmt(p.totalCentavos)}
                </p>
              </div>
            ))}
            <div className="rounded-xl bg-gray-100 p-3">
              <p className="text-xs text-gray-600">Total cobrado</p>
              <p className="text-sm font-bold tabular-nums text-gray-900">
                RD$ {fmt(data.totalCobrosCentavos)}
              </p>
            </div>
          </div>
          {data.otrosMetodosCentavos > 0 && (
            <p className="mt-1.5 text-xs text-gray-500">
              De los RD$ {fmt(data.totalCobrosCentavos)} cobrados, sólo RD$ {fmt(data.efectivoCentavos)}{' '}
              en efectivo entran al cuadre. Los otros RD$ {fmt(data.otrosMetodosCentavos)} no pasaron
              por la gaveta.
            </p>
          )}
        </div>
      )}

      {/* Facturado vs cobrado — en números, no en listas: un turno puede tener
          cientos de comprobantes y volcarlos no ayuda a nadie. */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Comprobantes del turno ({resumen.cantidadComprobantes})
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Facturado</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">
              RD$ {fmt(data.totalFacturadoCentavos)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Anulados</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{resumen.cantidadAnulados}</p>
          </div>
          <div className={`rounded-xl p-3 ${data.totalPendienteCentavos > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className={`text-xs ${data.totalPendienteCentavos > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
              Sin cobrar ({resumen.cantidadConPendiente})
            </p>
            <p className={`text-sm font-bold tabular-nums ${data.totalPendienteCentavos > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
              RD$ {fmt(data.totalPendienteCentavos)}
            </p>
          </div>
        </div>
        {data.totalPendienteCentavos > 0 && (
          <p className="mt-1.5 text-xs text-gray-500">
            Se facturó RD$ {fmt(data.totalFacturadoCentavos)} y quedaron RD$ {fmt(data.totalPendienteCentavos)}{' '}
            sin cobrar. No afectan el cuadre de efectivo: ahí solo entra el dinero recibido.
          </p>
        )}
      </div>

      {/* Excepciones — lo único que se lista fila por fila. Las ventas cobradas
          completas son la mayoría y no dicen nada; están en el resumen de arriba. */}
      {excepciones.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Requieren revisión ({resumen.cantidadAnulados + resumen.cantidadConPendiente})
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase text-gray-500">
                  <th className="px-3 py-1.5 text-left font-semibold">Comprobante</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Cliente</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Cobrado</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Sin cobrar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {excepciones.map(d => {
                  const anulado = d.estado === 'ANULADO';
                  return (
                    <tr key={d.id} className={anulado ? 'text-gray-400' : ''}>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        <span className={anulado ? 'line-through' : 'text-gray-500'}>
                          {(d.encf || d.codigo || '—').slice(-10)}
                        </span>
                        {anulado && (
                          <span className="ml-1 rounded bg-red-50 px-1 text-[10px] font-sans text-red-700">
                            anulado
                          </span>
                        )}
                      </td>
                      <td className="truncate px-3 py-1.5">{d.cliente || '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.totalCentavos)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.pagadoCentavos)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${
                        !anulado && d.pendienteCentavos > 0 ? 'font-semibold text-amber-700' : ''
                      }`}>
                        {d.pendienteCentavos > 0 ? fmt(d.pendienteCentavos) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.hayMasExcepciones && (
            <p className="mt-1.5 text-xs text-gray-500">
              Se muestran las {excepciones.length} de mayor monto. Hay más — revísalas en Facturas.
            </p>
          )}
        </div>
      )}

      {/* Movimientos — entradas/salidas de caja que no son ventas */}
      {movimientos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Movimientos de caja ({movimientos.length})
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {movimientos.map(m => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 text-xs font-medium text-gray-500 align-top">{m.tipo}</td>
                    <td className="px-3 py-1.5 text-gray-700">
                      <div className="truncate">{m.descripcion || m.motivo || '—'}</div>
                      {/* Método + si toca o no el efectivo en caja */}
                      <div className="text-[11px] text-gray-400">
                        {labelMetodo(m.metodo)}
                        {esEfectivo(m.metodo) ? ' · afecta caja' : ' · no afecta caja'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 align-top">
                      {fmt(m.montoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
