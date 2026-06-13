'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, Clock, ArrowDownCircle, ArrowUpCircle, Plus, CheckCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { METODO_PAGO_LABELS as METODO_LABELS } from '@/lib/pagos/metodos';

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoTurno = 'ABIERTO' | 'CIERRE_SOLICITADO' | 'CERRADO';

interface Turno {
  id: number;
  estado: EstadoTurno;
  montoAperturaCentavos: number;
  aperturaAt: string;
  numeroCierre: string | null;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  cierreObs: string | null;
}

interface Desglose {
  montoApertura: number;
  ventasEfectivo: number;
  entradas: number;
  salidas: number;
  esperado: number;
}

interface VentaPorMetodo {
  metodo: string;
  total: number;  // centavos
}

interface Movimiento {
  id: number;
  tipo: string;
  montoCentavos: number;
  metodo: string;
  descripcion: string | null;
  motivo: string | null;
  createdAt: string;
}

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA:  'Salida',
  GASTO:   'Gasto',
  RETIRO:  'Retiro',
  AJUSTE:  'Ajuste',
};

const TIPO_COLORS: Record<string, string> = {
  ENTRADA: 'text-emerald-700 bg-emerald-50',
  SALIDA:  'text-red-700 bg-red-50',
  GASTO:   'text-red-700 bg-red-50',
  RETIRO:  'text-amber-700 bg-amber-50',
  AJUSTE:  'text-sky-700 bg-sky-50',
};

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string; sub?: string; color?: 'gray' | 'emerald' | 'red' | 'amber';
}) {
  const colors = {
    gray:    'bg-white border-gray-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    red:     'bg-red-50 border-red-200',
    amber:   'bg-amber-50 border-amber-200',
  };
  const textColors = {
    gray: 'text-gray-900', emerald: 'text-emerald-800', red: 'text-red-800', amber: 'text-amber-800',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Modal de movimiento ──────────────────────────────────────────────────────

function ModalMovimiento({ turnoId, onClose, onCreated }: {
  turnoId: number; onClose: () => void; onCreated: () => void;
}) {
  const [tipo, setTipo]           = useState('ENTRADA');
  const [monto, setMonto]         = useState('');
  const [descripcion, setDesc]    = useState('');
  const [motivo, setMotivo]       = useState('');
  const [loading, setLoading]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = parseFloat(monto.replace(',', '.'));
    if (!montoNum || montoNum <= 0) { toast.error('Monto inválido'); return; }

    setLoading(true);
    const res = await fetch('/api/caja/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnoId,
        tipo,
        monto: montoNum,
        descripcion: descripcion || undefined,
        motivo: motivo || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      toast.success('Movimiento registrado');
      onCreated();
      onClose();
    } else {
      toast.error(data.error ?? 'Error al registrar movimiento');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Registrar movimiento</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monto (RD$)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <input
            type="text"
            value={descripcion}
            onChange={e => setDesc(e.target.value)}
            maxLength={200}
            placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {tipo === 'AJUSTE' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Requerido para ajustes"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              required
            />
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Registrar
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal de cierre ──────────────────────────────────────────────────────────

function ModalCierre({ turno, desglose, ventasPorMetodo, onClose, onCerrado }: {
  turno: Turno; desglose: Desglose; ventasPorMetodo: VentaPorMetodo[]; onClose: () => void; onCerrado: () => void;
}) {
  const [contado, setContado]   = useState('');
  const [obs, setObs]           = useState('');
  const [loading, setLoading]   = useState(false);

  const contadoNum  = parseFloat(contado.replace(',', '.')) || 0;
  const esperadoDOP = desglose.esperado / 100;
  const diferencia  = contadoNum - esperadoDOP;
  const hasDiff     = contado !== '' && Math.abs(Math.round(diferencia * 100)) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (contadoNum < 0) { toast.error('El conteo no puede ser negativo'); return; }
    if (hasDiff && !obs.trim()) { toast.error('Hay una diferencia: ingresa la justificación'); return; }

    setLoading(true);
    const res = await fetch(`/api/caja/turnos/${turno.id}/cierre`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efectivoContado: contadoNum, observaciones: obs || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      toast.success('Cuadre firmado — pendiente de aprobación del administrador');
      onCerrado();
      onClose();
    } else {
      toast.error(data.error ?? 'Error al cerrar');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Cuadre de caja</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            El administrador recibirá una notificación para aprobar el cierre.
          </p>
        </div>

        {/* Desglose esperado */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Apertura</span>
            <span className="tabular-nums">{fmtDOP(desglose.montoApertura)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Ventas efectivo</span>
            <span className="tabular-nums text-emerald-700">+{fmtDOP(desglose.ventasEfectivo)}</span>
          </div>
          {desglose.entradas > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Entradas</span>
              <span className="tabular-nums text-emerald-700">+{fmtDOP(desglose.entradas)}</span>
            </div>
          )}
          {desglose.salidas > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Salidas / gastos</span>
              <span className="tabular-nums text-red-700">−{fmtDOP(desglose.salidas)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
            <span>Esperado en caja</span>
            <span className="tabular-nums">{fmtDOP(desglose.esperado)}</span>
          </div>
        </div>

        {/* Ventas del turno por método (informativo — solo efectivo afecta la gaveta) */}
        {ventasPorMetodo.length > 0 && (
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Ventas del turno por método</span>
              <span className="tabular-nums font-semibold text-gray-900">
                {fmtDOP(ventasPorMetodo.reduce((s, v) => s + v.total, 0))}
              </span>
            </div>
            {ventasPorMetodo.map(v => {
              const esEfectivo = v.metodo === 'efectivo' || v.metodo === 'cash';
              return (
                <div key={v.metodo} className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1.5">
                    {METODO_LABELS[v.metodo] ?? v.metodo}
                    {!esEfectivo && (
                      <span className="text-[10px] text-gray-400">(no afecta caja)</span>
                    )}
                  </span>
                  <span className="tabular-nums">{fmtDOP(v.total)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Conteo físico */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Efectivo contado (RD$)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={contado}
            onChange={e => setContado(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 tabular-nums"
            required
            autoFocus
          />
        </div>

        {/* Diferencia live */}
        {contado !== '' && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
            hasDiff ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          }`}>
            {hasDiff
              ? <AlertTriangle className="h-4 w-4 shrink-0" />
              : <CheckCircle className="h-4 w-4 shrink-0" />}
            <span>
              {hasDiff
                ? `Diferencia: ${diferencia > 0 ? '+' : ''}${fmtDOP(Math.round(diferencia * 100))} — se requiere justificación`
                : 'Caja cuadrada — el admin revisará el cuadre'}
            </span>
          </div>
        )}

        {/* Observaciones (obligatorio si hay diferencia, opcional si no) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observaciones {hasDiff && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={hasDiff ? 'Explica el descuadre…' : 'Opcional — ej: novedades del turno'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>

        {/* Declaración de firma */}
        {contado !== '' && (
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Al firmar confirmas que el conteo físico es correcto y que la información
            es veraz. El cuadre quedará pendiente de aprobación del administrador.
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={loading || !contado}
            className="text-sm px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 font-medium">
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
              : <><CheckCircle className="h-3.5 w-3.5" /> Firmar y enviar cierre</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CajaPage() {
  const [loading, setLoading]         = useState(true);
  const [turno, setTurno]             = useState<Turno | null>(null);
  const [desglose, setDesglose]       = useState<Desglose | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ventasPorMetodo, setVentasPorMetodo] = useState<VentaPorMetodo[]>([]);

  // Apertura form
  const [montoApertura, setMontoApertura] = useState('');
  const [aperObs, setAperObs]             = useState('');
  const [abriendo, setAbriendo]           = useState(false);

  // Modals
  const [showMovimiento, setShowMovimiento] = useState(false);
  const [showCierre, setShowCierre]         = useState(false);
  const [showMovs, setShowMovs]             = useState(false);

  // Rastrea el estado anterior para detectar transiciones y mostrar toasts
  const prevEstado = useRef<EstadoTurno | null>(null);

  const fetchTurno = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/caja/turnos').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTurno(data.turno ?? null);
      setDesglose(data.desglose ?? null);
      setMovimientos(data.movimientos ?? []);
      setVentasPorMetodo(data.ventasPorMetodo ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTurno(); }, [fetchTurno]);

  // Polling mientras hay cierre pendiente — revisa cada 15 s
  useEffect(() => {
    if (turno?.estado !== 'CIERRE_SOLICITADO') return;
    const iv = setInterval(fetchTurno, 15_000);
    return () => clearInterval(iv);
  }, [turno?.estado, fetchTurno]);

  // Detecta transiciones de estado y muestra toast al cajero
  useEffect(() => {
    const prev = prevEstado.current;
    const curr = turno?.estado ?? null;
    if (prev === 'CIERRE_SOLICITADO') {
      if (curr === 'CERRADO') {
        toast.success('✓ Tu cuadre fue aprobado por el administrador', { duration: 6000 });
      } else if (curr === 'ABIERTO') {
        toast.error('Tu cuadre fue rechazado — revisa el motivo y vuelve a contar', { duration: 8000 });
      }
    }
    prevEstado.current = curr;
  }, [turno?.estado]);

  async function abrirTurno(e: React.FormEvent) {
    e.preventDefault();
    const monto = parseFloat(montoApertura.replace(',', '.'));
    if (isNaN(monto) || monto < 0) { toast.error('Monto inválido'); return; }

    setAbriendo(true);
    const res = await fetch('/api/caja/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montoApertura: monto, observaciones: aperObs || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setAbriendo(false);

    if (res.ok) {
      toast.success('Turno de caja abierto');
      setMontoApertura('');
      setAperObs('');
      fetchTurno();
    } else {
      toast.error(data.error ?? 'Error al abrir caja');
    }
  }

  if (loading) {
    return (
      <section className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </section>
    );
  }

  // ── Sin turno: formulario de apertura ────────────────────────────────────────
  if (!turno) {
    return (
      <section className="p-4 sm:p-6 max-w-md mx-auto mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Apertura de caja</h1>
            <p className="text-sm text-gray-500">No tienes un turno activo</p>
          </div>
        </div>

        <form onSubmit={abrirTurno} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Monto de apertura (RD$)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={montoApertura}
              onChange={e => setMontoApertura(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Efectivo físico que estás depositando en la caja para iniciar el turno.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Observaciones <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={aperObs}
              onChange={e => setAperObs(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej: Turno de la mañana"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={abriendo || !montoApertura}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white font-semibold py-3 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {abriendo
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Abriendo...</>
              : <><Wallet className="h-4 w-4" /> Confirmar apertura</>}
          </button>
        </form>
      </section>
    );
  }

  // ── Turno CIERRE_SOLICITADO ──────────────────────────────────────────────────
  if (turno.estado === 'CIERRE_SOLICITADO') {
    const tieneDiff = turno.diferenciaCentavos !== null && turno.diferenciaCentavos !== 0;
    return (
      <section className="p-4 sm:p-6 max-w-lg mx-auto mt-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-base font-bold text-amber-900">Cuadre enviado — pendiente de aprobación</h1>
              <p className="text-xs text-amber-600 mt-0.5 font-mono">{turno.numeroCierre}</p>
            </div>
          </div>

          <p className="text-sm text-amber-700">
            Tu cuadre fue firmado y enviado al administrador para su revisión.
            Recibirás una notificación cuando sea aprobado o rechazado.
          </p>

          {/* Cifras */}
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-white rounded-xl border border-amber-200 p-3">
              <p className="text-xs text-gray-500">Esperado</p>
              <p className="font-bold text-gray-900 tabular-nums text-sm">
                {fmtDOP(turno.montoEsperadoCentavos ?? 0)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-3">
              <p className="text-xs text-gray-500">Contado</p>
              <p className="font-bold text-gray-900 tabular-nums text-sm">
                {fmtDOP(turno.efectivoContadoCentavos ?? 0)}
              </p>
            </div>
          </div>

          {/* Estado del cuadre */}
          {tieneDiff ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700">
                Descuadre: {turno.diferenciaCentavos! > 0 ? '+' : ''}{fmtDOP(turno.diferenciaCentavos!)}
              </p>
              {turno.cierreObs && (
                <p className="text-xs text-red-600 mt-1 italic">"{turno.cierreObs}"</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-medium text-emerald-700">Caja cuadrada — sin diferencias</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Turno ABIERTO ────────────────────────────────────────────────────────────
  const esperadoDOP = (desglose?.esperado ?? turno.montoAperturaCentavos);

  return (
    <section className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mi caja</h1>
            <p className="text-sm text-gray-500">
              Abierta a las {fmtHora(turno.aperturaAt)}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Abierta
        </span>
      </div>

      {/* Desglose */}
      {desglose && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Apertura"      value={fmtDOP(desglose.montoApertura)}  />
          <StatCard label="Ventas efect." value={fmtDOP(desglose.ventasEfectivo)} color="emerald" />
          <StatCard
            label="Entradas netas"
            value={fmtDOP(desglose.entradas - desglose.salidas)}
            color={desglose.entradas >= desglose.salidas ? 'gray' : 'red'}
          />
          <StatCard label="Total esperado" value={fmtDOP(desglose.esperado)} color="emerald"
            sub="Efectivo estimado en caja" />
        </div>
      )}

      {/* Ventas del turno por método (efectivo afecta caja; los demás informativos) */}
      {ventasPorMetodo.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Ventas del turno por método</h2>
            <span className="tabular-nums text-sm font-semibold text-gray-900">
              {fmtDOP(ventasPorMetodo.reduce((s, v) => s + v.total, 0))}
            </span>
          </div>
          <div className="space-y-1.5">
            {ventasPorMetodo.map(v => {
              const esEfectivo = v.metodo === 'efectivo' || v.metodo === 'cash';
              return (
                <div key={v.metodo} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    {METODO_LABELS[v.metodo] ?? v.metodo}
                    {!esEfectivo && <span className="text-[10px] text-gray-400">(no afecta caja)</span>}
                  </span>
                  <span className={`tabular-nums ${esEfectivo ? 'text-emerald-700 font-medium' : 'text-gray-600'}`}>
                    {fmtDOP(v.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowMovimiento(true)}
          className="flex items-center gap-2 text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Movimiento
        </button>
        <button
          onClick={() => setShowCierre(true)}
          className="flex items-center gap-2 text-sm bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium transition-colors"
        >
          <CheckCircle className="h-4 w-4" /> Solicitar cierre
        </button>
      </div>

      {/* Movimientos */}
      {movimientos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowMovs(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>Movimientos del turno ({movimientos.length})</span>
            {showMovs ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>

          {showMovs && (
            <div className="divide-y divide-gray-100">
              {movimientos.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIPO_COLORS[m.tipo] ?? 'text-gray-600 bg-gray-100'}`}>
                    {['ENTRADA'].includes(m.tipo)
                      ? <ArrowDownCircle className="h-3 w-3" />
                      : <ArrowUpCircle className="h-3 w-3" />}
                    {TIPO_LABELS[m.tipo] ?? m.tipo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{m.descripcion ?? m.motivo ?? '—'}</p>
                    <p className="text-xs text-gray-400">{fmtHora(m.createdAt)}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${
                    ['ENTRADA', 'AJUSTE'].includes(m.tipo) ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {['ENTRADA', 'AJUSTE'].includes(m.tipo) ? '+' : '−'}{fmtDOP(m.montoCentavos)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {movimientos.length === 0 && (
        <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm text-gray-500">
          <Info className="h-4 w-4 text-gray-400 shrink-0" />
          Sin movimientos en este turno aún.
        </div>
      )}

      {/* Modals */}
      {showMovimiento && (
        <ModalMovimiento
          turnoId={turno.id}
          onClose={() => setShowMovimiento(false)}
          onCreated={fetchTurno}
        />
      )}

      {showCierre && desglose && (
        <ModalCierre
          turno={turno}
          desglose={desglose}
          ventasPorMetodo={ventasPorMetodo}
          onClose={() => setShowCierre(false)}
          onCerrado={fetchTurno}
        />
      )}
    </section>
  );
}
