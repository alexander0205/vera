'use client';

/**
 * /caja/imprimir/[id] — Hoja de cuadre de caja imprimible.
 *
 * - Sin sidebar (usa el layout (print) minimalista).
 * - Abre el diálogo de impresión automáticamente al cargar.
 * - Muestra desglose de cobros por método (efectivo, tarjeta, transferencia, etc.)
 *   más el cuadre de efectivo y los movimientos del turno.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, ArrowLeft, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Turno {
  id: number;
  numeroCierre:            string | null;
  estado:                  string;
  montoAperturaCentavos:   number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos:   number | null;
  diferenciaCentavos:      number | null;
  cierreObs:               string | null;
  aprobacionObs:           string | null;
  aperturaObs:             string | null;
  aperturaAt:              string;
  cierreSolicitadoAt:      string | null;
  aprobadoAt:              string | null;
}
interface Persona { name: string | null; email: string }
interface PagoMetodo { metodo: string; totalCentavos: number }
interface Movimiento {
  id: number;
  tipo: string;
  montoCentavos: number;
  metodo: string;
  descripcion: string | null;
  motivo: string | null;
  createdAt: string;
}
interface Detalle {
  turno:                Turno;
  cajero:               Persona | null;
  aprobador:            Persona | null;
  teamName:             string;
  pagos:                PagoMetodo[];
  totalCobrosCentavos:  number;
  movimientos:          Movimiento[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centavos: number) {
  return (centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return '—';
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada', SALIDA: 'Salida', GASTO: 'Gasto',
  RETIRO: 'Retiro', AJUSTE: 'Ajuste',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ImprimirCajaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]     = useState<Detalle | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    fetch(`/api/caja/turnos/${id}/detalle`)
      .then(r => {
        if (!r.ok) throw new Error('No autorizado o turno no encontrado');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message));
  }, [id]);

  // Auto-print una sola vez cuando los datos están listos
  useEffect(() => {
    if (data && !printed) {
      setPrinted(true);
      setTimeout(() => window.print(), 400);
    }
  }, [data, printed]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-3 p-8">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <p className="text-lg font-semibold text-gray-800">{error}</p>
          <button onClick={() => window.close()}
            className="text-sm text-teal-600 hover:underline">Cerrar ventana</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const { turno, cajero, aprobador, teamName, pagos, totalCobrosCentavos, movimientos } = data;
  const diff = turno.diferenciaCentavos ?? 0;
  const cuadra = diff === 0;

  // Ventas efectivo = total cobros en efectivo
  const ventasEfectivoTotal = pagos
    .filter(p => p.metodo.toLowerCase().includes('efectivo'))
    .reduce((s, p) => s + p.totalCentavos, 0);

  // Movimientos: sumas / restas
  const SUMAN  = new Set(['ENTRADA', 'AJUSTE']);
  const RESTAN = new Set(['SALIDA', 'GASTO', 'RETIRO']);
  const entradas = movimientos.filter(m => SUMAN.has(m.tipo)).reduce((s, m) => s + m.montoCentavos, 0);
  const salidas  = movimientos.filter(m => RESTAN.has(m.tipo)).reduce((s, m) => s + m.montoCentavos, 0);

  return (
    <>
      {/* ── Estilos de impresión ── */}
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* ── Barra de acciones (solo pantalla) ── */}
      <div className="no-print fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between shadow-sm">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700 font-medium"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      {/* ── Contenido imprimible ── */}
      <div className="min-h-screen bg-white pt-14 print:pt-0 print-area">
        <div className="max-w-2xl mx-auto p-6 print:p-0 space-y-5">

          {/* ENCABEZADO */}
          <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Zero</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{teamName}</h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-widest">Cuadre de Caja</p>
              <p className="text-lg font-mono font-bold text-gray-900 mt-0.5">
                {turno.numeroCierre ?? `Turno #${turno.id}`}
              </p>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${
                turno.estado === 'CERRADO'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {turno.estado === 'CERRADO'
                  ? <><CheckCircle className="h-3 w-3" /> Aprobado</>
                  : 'Pendiente'}
              </span>
            </div>
          </div>

          {/* DATOS DEL TURNO */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <div>
              <span className="text-gray-500">Cajero:</span>{' '}
              <span className="font-medium">{cajero?.name ?? cajero?.email ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Apertura:</span>{' '}
              <span className="font-medium">{fmtDatetime(turno.aperturaAt)}</span>
            </div>
            {cajero?.email && (
              <div>
                <span className="text-gray-500">Email:</span>{' '}
                <span className="text-gray-700">{cajero.email}</span>
              </div>
            )}
            {turno.cierreSolicitadoAt && (
              <div>
                <span className="text-gray-500">Cierre enviado:</span>{' '}
                <span className="font-medium">{fmtDatetime(turno.cierreSolicitadoAt)}</span>
              </div>
            )}
            {turno.aprobadoAt && (
              <>
                <div>
                  <span className="text-gray-500">Aprobado por:</span>{' '}
                  <span className="font-medium">{aprobador?.name ?? aprobador?.email ?? '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Aprobado el:</span>{' '}
                  <span className="font-medium">{fmtDatetime(turno.aprobadoAt)}</span>
                </div>
              </>
            )}
            <div>
              <span className="text-gray-500">Duración:</span>{' '}
              <span className="font-medium">{duracion(turno.aperturaAt, turno.aprobadoAt ?? turno.cierreSolicitadoAt)}</span>
            </div>
          </div>

          {/* COBROS POR MÉTODO */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Cobros del turno por método
            </h2>
            {pagos.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin cobros registrados en este turno.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Método</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagos.map(p => (
                    <tr key={p.metodo}>
                      <td className="px-4 py-2 text-gray-700">{p.metodo}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">
                        DOP {fmt(p.totalCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                    <td className="px-4 py-2.5 font-bold text-gray-900 text-sm">Total cobros</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900 text-sm">
                      DOP {fmt(totalCobrosCentavos)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* CUADRE DE EFECTIVO */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Cuadre de efectivo
            </h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <div className="divide-y divide-gray-100">
                <div className="flex justify-between px-4 py-2 bg-gray-50">
                  <span className="text-gray-600">Monto de apertura</span>
                  <span className="tabular-nums font-medium">DOP {fmt(turno.montoAperturaCentavos)}</span>
                </div>
                <div className="flex justify-between px-4 py-2">
                  <span className="text-gray-600">+ Ventas en efectivo</span>
                  <span className="tabular-nums font-medium text-emerald-700">DOP {fmt(ventasEfectivoTotal)}</span>
                </div>
                {entradas > 0 && (
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-gray-600">+ Entradas / ajustes</span>
                    <span className="tabular-nums font-medium text-emerald-700">DOP {fmt(entradas)}</span>
                  </div>
                )}
                {salidas > 0 && (
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-gray-600">− Salidas / gastos</span>
                    <span className="tabular-nums font-medium text-red-700">DOP {fmt(salidas)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-2.5 bg-gray-50 font-bold border-t-2 border-gray-300">
                  <span>Efectivo esperado</span>
                  <span className="tabular-nums">DOP {fmt(turno.montoEsperadoCentavos ?? 0)}</span>
                </div>
                <div className="flex justify-between px-4 py-2">
                  <span className="text-gray-600">Efectivo contado</span>
                  <span className="tabular-nums font-semibold">DOP {fmt(turno.efectivoContadoCentavos ?? 0)}</span>
                </div>
                <div className={`flex justify-between px-4 py-2.5 font-bold ${
                  cuadra ? 'bg-emerald-50' : diff > 0 ? 'bg-sky-50' : 'bg-red-50'
                }`}>
                  <span className={cuadra ? 'text-emerald-800' : diff > 0 ? 'text-sky-800' : 'text-red-800'}>
                    {cuadra ? '✓ Diferencia (cuadra)' : diff > 0 ? 'Sobrante' : 'Faltante'}
                  </span>
                  <span className={`tabular-nums ${cuadra ? 'text-emerald-800' : diff > 0 ? 'text-sky-800' : 'text-red-800'}`}>
                    {diff > 0 ? '+' : ''} DOP {fmt(diff)}
                  </span>
                </div>
              </div>
            </div>

            {/* Justificación del cajero */}
            {turno.cierreObs && (
              <div className="mt-2 border border-amber-200 bg-amber-50 rounded-lg px-4 py-2.5 text-sm">
                <p className="text-xs text-amber-600 font-medium mb-0.5">Justificación del cajero</p>
                <p className="text-gray-800 italic">"{turno.cierreObs}"</p>
              </div>
            )}
            {turno.aprobacionObs && (
              <div className="mt-2 border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                <p className="text-xs text-gray-500 font-medium mb-0.5">Nota del aprobador</p>
                <p className="text-gray-800 italic">"{turno.aprobacionObs}"</p>
              </div>
            )}
          </div>

          {/* MOVIMIENTOS */}
          {movimientos.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Movimientos del turno ({movimientos.length})
              </h2>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Hora</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movimientos.map(m => {
                    const suma = SUMAN.has(m.tipo);
                    return (
                      <tr key={m.id}>
                        <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{m.descripcion ?? m.motivo ?? '—'}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${suma ? 'text-emerald-700' : 'text-red-700'}`}>
                          {suma ? '+' : '−'} DOP {fmt(m.montoCentavos)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* FIRMAS */}
          <div className="border-t-2 border-gray-800 pt-5 mt-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5">
              Firmas y conformidad
            </h2>
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="border-b border-gray-400 pb-1">
                  <p className="text-sm font-semibold text-gray-800">{cajero?.name ?? '___________________________'}</p>
                </div>
                <p className="text-xs text-gray-500">Cajero — firma y fecha</p>
              </div>
              <div className="space-y-6">
                <div className="border-b border-gray-400 pb-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {aprobador?.name ?? '___________________________'}
                  </p>
                </div>
                <p className="text-xs text-gray-500">Administrador — firma y fecha</p>
              </div>
            </div>
          </div>

          {/* Pie de página */}
          <p className="text-center text-xs text-gray-400 border-t border-gray-100 pt-3 mt-4">
            Zero · Cuadre generado el {fmtDatetime(new Date().toISOString())}
          </p>

        </div>
      </div>
    </>
  );
}
