'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Phone, StickyNote, HandCoins, Check, XCircle, UserRound, CalendarClock,
} from 'lucide-react';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import type {
  GestionCuenta, TipoEventoCobranza, CanalContacto,
} from '@/lib/cobranza/seguimiento';

const CANAL_LABEL: Record<CanalContacto, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo',
  presencial: 'Presencial', otro: 'Otro',
};

const TIPO_UI: Record<TipoEventoCobranza, {
  Icon: React.ComponentType<{ className?: string }>; label: string; punto: string;
}> = {
  contacto: { Icon: Phone,      label: 'Contacto',        punto: 'bg-indigo-500' },
  nota:     { Icon: StickyNote, label: 'Nota interna',    punto: 'bg-gray-400'   },
  promesa:  { Icon: HandCoins,  label: 'Promesa de pago', punto: 'bg-violet-500' },
};

const ESTADO_PROMESA_UI: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  cumplida:   { label: 'Cumplida',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  incumplida: { label: 'Incumplida', cls: 'bg-red-100 text-red-700 border-red-200' },
};

export function GestionCobro({ docId, onCambio }: { docId: number; onCambio?: () => void }) {
  const [data, setData]       = useState<GestionCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [tipo, setTipo]             = useState<TipoEventoCobranza>('contacto');
  const [canal, setCanal]           = useState<CanalContacto>('llamada');
  const [comentario, setComentario] = useState('');
  const [promesaFecha, setPromesaFecha] = useState('');
  const [promesaMonto, setPromesaMonto] = useState('');

  const [editSeg, setEditSeg]     = useState(false);
  const [proxAccion, setProxAccion] = useState('');
  const [proxFecha, setProxFecha]   = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/cuentas-por-cobrar/${docId}/gestion`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error cargando la gestión');
      setData(j);
      setProxAccion(j.seguimiento?.proximaAccion ?? '');
      setProxFecha(j.seguimiento?.proximaAccionFecha ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function enviar(body: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/cuentas-por-cobrar/${docId}/gestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await cargar();
      onCambio?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function registrar() {
    if (tipo === 'promesa' && !promesaFecha) {
      setError('Indica la fecha en que el cliente prometió pagar.');
      return;
    }
    const ok = await enviar({
      accion: 'evento',
      tipo,
      fecha: hoyRD(),
      ...(tipo === 'contacto' && { canal }),
      ...(comentario.trim() && { comentario: comentario.trim() }),
      ...(tipo === 'promesa' && { promesaFecha }),
      ...(tipo === 'promesa' && promesaMonto && { promesaMontoDOP: Number(promesaMonto) }),
    });
    if (ok) { setComentario(''); setPromesaFecha(''); setPromesaMonto(''); }
  }

  const seg = data?.seguimiento;

  return (
    <section className="px-4 py-3 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Gestión de cobro
      </h3>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      ) : (
        <>
          {/* Estado: responsable y próxima acción */}
          <div className="rounded-lg border border-gray-200 p-3 mb-3 text-sm">
            {editSeg ? (
              <div className="space-y-2">
                <input
                  value={proxAccion}
                  onChange={e => setProxAccion(e.target.value)}
                  placeholder="Próxima acción (ej. llamar al encargado)"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
                <input
                  type="date"
                  value={proxFecha}
                  onChange={e => setProxFecha(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
                <div className="flex gap-2">
                  <button
                    disabled={guardando}
                    onClick={async () => {
                      const ok = await enviar({
                        accion: 'seguimiento',
                        proximaAccion: proxAccion.trim() || null,
                        proximaAccionFecha: proxFecha || null,
                      });
                      if (ok) setEditSeg(false);
                    }}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditSeg(false)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-gray-700">
                    <CalendarClock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    {seg?.proximaAccion
                      ? <span>{seg.proximaAccion}{seg.proximaAccionFecha && ` · ${fmtFechaCorta(seg.proximaAccionFecha)}`}</span>
                      : <span className="text-gray-400">Sin próxima acción definida</span>}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <UserRound className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    {seg?.responsableNombre ?? 'Sin responsable asignado'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Último contacto: {data?.ultimoContacto ? fmtFechaCorta(data.ultimoContacto) : '—'}
                  </p>
                </div>
                <button
                  onClick={() => setEditSeg(true)}
                  className="text-xs text-teal-600 hover:underline shrink-0"
                >
                  Editar
                </button>
              </div>
            )}
          </div>

          {/* Promesa vigente, destacada */}
          {data?.promesaActiva && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 mb-3">
              <p className="text-sm text-violet-900">
                Prometió pagar el {fmtFechaCorta(data.promesaActiva.promesaFecha!)}
                {data.promesaActiva.promesaMonto ? ` · ${fmtDOP(data.promesaActiva.promesaMonto)}` : ''}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  disabled={guardando}
                  onClick={() => enviar({ accion: 'cerrar-promesa', eventoId: data.promesaActiva!.id, estado: 'cumplida' })}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs rounded"
                >
                  <Check className="h-3 w-3" /> Cumplida
                </button>
                <button
                  disabled={guardando}
                  onClick={() => enviar({ accion: 'cerrar-promesa', eventoId: data.promesaActiva!.id, estado: 'incumplida' })}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 text-xs rounded"
                >
                  <XCircle className="h-3 w-3" /> Incumplida
                </button>
              </div>
            </div>
          )}

          {/* Registrar gestión */}
          <div className="rounded-lg border border-gray-200 p-3 mb-3 space-y-2">
            <div className="flex gap-1">
              {(['contacto', 'nota', 'promesa'] as TipoEventoCobranza[]).map(t => {
                const ui = TIPO_UI[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                      tipo === t
                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <ui.Icon className="h-3.5 w-3.5" /> {ui.label}
                  </button>
                );
              })}
            </div>

            {tipo === 'contacto' && (
              <select
                value={canal}
                onChange={e => setCanal(e.target.value as CanalContacto)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                {(Object.keys(CANAL_LABEL) as CanalContacto[]).map(c => (
                  <option key={c} value={c}>{CANAL_LABEL[c]}</option>
                ))}
              </select>
            )}

            {tipo === 'promesa' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">
                  Fecha prometida
                  <input
                    type="date"
                    value={promesaFecha}
                    onChange={e => setPromesaFecha(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Monto (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promesaMonto}
                    onChange={e => setPromesaMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full mt-0.5 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </label>
              </div>
            )}

            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={2}
              placeholder="Comentario interno (no lo ve el cliente)"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none"
            />

            <button
              onClick={registrar}
              disabled={guardando}
              className="w-full px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-medium rounded inline-flex items-center justify-center gap-2"
            >
              {guardando && <Loader2 className="h-3 w-3 animate-spin" />}
              Registrar {TIPO_UI[tipo].label.toLowerCase()}
            </button>
          </div>

          {/* Historial de gestión */}
          {data && data.eventos.length > 0 && (
            <ol className="relative space-y-3 pl-5">
              <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-gray-200" aria-hidden />
              {data.eventos.map(ev => {
                const ui = TIPO_UI[ev.tipo];
                const est = ev.promesaEstado ? ESTADO_PROMESA_UI[ev.promesaEstado] : null;
                return (
                  <li key={ev.id} className="relative">
                    <span
                      className={`absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-white ${ui.punto}`}
                      aria-hidden
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm text-gray-900 flex items-center gap-1.5">
                        <ui.Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        {ui.label}
                        {ev.canal && <span className="text-gray-400">· {CANAL_LABEL[ev.canal]}</span>}
                      </p>
                      {est && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${est.cls}`}>
                          {est.label}
                        </span>
                      )}
                    </div>
                    {ev.tipo === 'promesa' && ev.promesaFecha && (
                      <p className="text-xs text-violet-700 mt-0.5">
                        Prometió el {fmtFechaCorta(ev.promesaFecha)}
                        {ev.promesaMonto ? ` · ${fmtDOP(ev.promesaMonto)}` : ''}
                      </p>
                    )}
                    {ev.comentario && (
                      <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{ev.comentario}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fmtFechaCorta(ev.fecha)}{ev.usuario && ` · ${ev.usuario}`}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {data && data.eventos.length === 0 && (
            <p className="text-sm text-gray-400">Sin gestión registrada.</p>
          )}
        </>
      )}
    </section>
  );
}
