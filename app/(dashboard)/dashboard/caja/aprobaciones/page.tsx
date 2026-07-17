'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Printer, ChevronDown } from 'lucide-react';
import { DetalleTurno } from '@/components/caja/DetalleTurno';
import { toast } from 'sonner';
import { fmtDOP } from '@/lib/utils/format';

interface Pendiente {
  id: number;
  numeroCierre: string | null;
  cajero: string | null;
  cajeroEmail: string;
  montoAperturaCentavos: number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  cierreObs: string | null;
  aperturaAt: string;
  cierreSolicitadoAt: string | null;
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return null;
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function ModalAccion({ tipo, onConfirm, onClose }: {
  tipo: 'aprobar' | 'rechazar';
  onConfirm: (obs: string) => void;
  onClose: () => void;
}) {
  const [obs, setObs] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          {tipo === 'aprobar' ? 'Aprobar cierre' : 'Rechazar cierre'}
        </h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observaciones {tipo === 'rechazar' && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder={tipo === 'rechazar' ? 'Motivo del rechazo…' : 'Opcional'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (tipo === 'rechazar' && !obs.trim()) { toast.error('Ingresa el motivo del rechazo'); return; }
              onConfirm(obs);
            }}
            className={`text-sm px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              tipo === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AprobacionesPage() {
  const [loading, setLoading]               = useState(true);
  const [pendientes, setPendientes]         = useState<Pendiente[]>([]);
  const [modal, setModal]                   = useState<{ id: number; tipo: 'aprobar' | 'rechazar' } | null>(null);
  /** Qué turnos tienen el detalle desplegado, por id. */
  const [abierto, setAbierto]               = useState<Record<number, boolean>>({});
  const [procesando, setProcesando]         = useState<number | null>(null);

  const fetchPendientes = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/caja/aprobaciones').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setPendientes(data.pendientes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPendientes(); }, [fetchPendientes]);

  async function handleAccion(turnoId: number, tipo: 'aprobar' | 'rechazar', obs: string) {
    setProcesando(turnoId);
    setModal(null);
    const endpoint = tipo === 'aprobar' ? 'aprobar' : 'rechazar';
    const body = tipo === 'aprobar'
      ? { observaciones: obs || undefined }
      : { motivo: obs };

    const res = await fetch(`/api/caja/turnos/${turnoId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setProcesando(null);

    if (res.ok) {
      toast.success(tipo === 'aprobar' ? 'Cierre aprobado' : 'Cierre rechazado — turno reabierto');
      fetchPendientes();
    } else {
      toast.error(data.error ?? `Error al ${tipo}`);
    }
  }

  return (
    <section className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aprobaciones de cierre</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cierres con descuadre pendientes de revisión</p>
        </div>
        <button onClick={fetchPendientes}
          className="text-sm text-teal-600 hover:underline">
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : pendientes.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-12 text-center space-y-2">
          <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto" />
          <p className="font-semibold text-gray-700">Sin cierres pendientes</p>
          <p className="text-sm text-gray-500">Todos los turnos están al día.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.map(p => {
            const diferencia  = p.diferenciaCentavos ?? 0;
            // Tres casos, no dos: sin el caso "cuadra" un cierre exacto caía en
            // el else y se pintaba "Faltante: RD$0.00" en rojo con alerta. Un
            // rojo que miente cuando todo está bien enseña a ignorar el rojo.
            const isSobrante  = diferencia > 0;
            const cuadra      = diferencia === 0;
            const dur         = duracion(p.aperturaAt, p.cierreSolicitadoAt);

            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {p.cajero ?? p.cajeroEmail}
                      </p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        <Clock className="h-3 w-3" /> Pendiente
                      </span>
                    </div>
                    {p.numeroCierre && (
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{p.numeroCierre}</p>
                    )}
                  </div>
                  {dur && <span className="text-xs text-gray-400 shrink-0">{dur}</span>}
                </div>

                {/* Montos */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">Apertura</p>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtDOP(p.montoAperturaCentavos)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">Esperado</p>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtDOP(p.montoEsperadoCentavos ?? 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">Contado</p>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtDOP(p.efectivoContadoCentavos ?? 0)}</p>
                  </div>
                </div>

                {/* Diferencia */}
                <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                  cuadra     ? 'bg-emerald-50 text-emerald-800'
                  : isSobrante ? 'bg-sky-50 text-sky-800'
                             : 'bg-red-50 text-red-800'
                }`}>
                  {cuadra
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold">
                      {cuadra
                        ? 'Cuadra exacto'
                        : `${isSobrante ? 'Sobrante' : 'Faltante'}: ${isSobrante ? '+' : ''}${fmtDOP(diferencia)}`}
                    </p>
                    {p.cierreObs && (
                      <p className="text-xs opacity-80 mt-1">"{p.cierreObs}"</p>
                    )}
                  </div>
                </div>

                {/* Detalle — lo que se hizo en el turno. Colapsado por defecto:
                    quien solo mira la diferencia no paga las consultas. */}
                <div>
                  <button
                    type="button"
                    onClick={() => setAbierto(a => ({ ...a, [p.id]: !a[p.id] }))}
                    aria-expanded={!!abierto[p.id]}
                    className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${abierto[p.id] ? 'rotate-180' : ''}`} />
                    {abierto[p.id] ? 'Ocultar detalle' : 'Ver qué se hizo en el turno'}
                  </button>
                  {abierto[p.id] && <DetalleTurno turnoId={p.id} />}
                </div>

                {/* Acciones */}
                <div className="flex gap-3 pt-1 flex-wrap">
                  <button
                    onClick={() => window.open(`/caja/imprimir/${p.id}`, '_blank')}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <button
                    disabled={procesando === p.id}
                    onClick={() => setModal({ id: p.id, tipo: 'rechazar' })}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Rechazar
                  </button>
                  <button
                    disabled={procesando === p.id}
                    onClick={() => setModal({ id: p.id, tipo: 'aprobar' })}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50"
                  >
                    {procesando === p.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CheckCircle className="h-4 w-4" />}
                    Aprobar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ModalAccion
          tipo={modal.tipo}
          onConfirm={obs => handleAccion(modal.id, modal.tipo, obs)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
