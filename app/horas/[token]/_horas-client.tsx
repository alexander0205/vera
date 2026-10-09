'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Registro {
  fecha: string;
  horas: number;
  horasNocturnas: number;
  feriado: boolean;
  nota: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  motivoRechazo: string | null;
}

interface Datos {
  empleado: string;
  empresa: string;
  activo: boolean;
  hoy: string;
  desde: string;
  registros: Registro[];
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaLarga(f: string) {
  const [y, m, d] = f.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${d} ${MESES[m - 1]}`;
}

const ESTADO: Record<Registro['estado'], { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  aprobada: { texto: 'Aprobada', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazada: { texto: 'Rechazada', clase: 'bg-red-50 text-red-700 border-red-200' },
};

/** El empleado sube las horas de un día; la empresa las aprueba antes de pagarlas. */
export default function HorasClient({ token }: { token: string }) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ocupado = useRef(false);
  const [form, setForm] = useState({ fecha: '', horas: '', horasNocturnas: '', feriado: false, nota: '' });

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/horas/${token}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'No se pudo cargar'); return; }
    setData(j);
    setForm((f) => (f.fecha ? f : { ...f, fecha: j.hoy }));
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  async function enviar() {
    if (ocupado.current) return;
    ocupado.current = true;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/horas/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      setAviso(`Enviadas ${form.horas} h del ${fechaLarga(form.fecha)}. Quedan pendientes de aprobar.`);
      setForm((f) => ({ ...f, horas: '', horasNocturnas: '', feriado: false, nota: '' }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  const wrap = 'flex min-h-screen justify-center bg-slate-100 px-4 py-8';
  if (error && !data) {
    return (
      <div className={wrap}>
        <div className="mt-16 max-w-md rounded-xl bg-white p-8 text-center shadow">
          <div className="mb-2 text-4xl">🔒</div>
          <h1 className="text-lg font-semibold text-slate-800">Enlace no válido</h1>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500';
  return (
    <div className={wrap}>
      <div className="w-full max-w-xl space-y-4">
        <div className="rounded-xl bg-white p-6 shadow">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{data.empresa}</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-800">Mis horas</h1>
          <p className="text-sm text-slate-500">{data.empleado}</p>
        </div>

        {data.activo ? (
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-sm font-semibold text-slate-800">Registrar un día</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Una entrada por día. Si te equivocas, vuelve a enviar el mismo día mientras no esté aprobado.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 block text-xs font-medium text-slate-600 sm:col-span-1">
                Fecha
                <input type="date" min={data.desde} max={data.hoy} value={form.fecha} className={campo}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Horas trabajadas
                <input inputMode="decimal" placeholder="8" value={form.horas} className={campo}
                  onChange={(e) => setForm({ ...form, horas: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                De ellas, nocturnas
                <input inputMode="decimal" placeholder="0" value={form.horasNocturnas} className={campo}
                  onChange={(e) => setForm({ ...form, horasNocturnas: e.target.value })} />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.feriado} onChange={(e) => setForm({ ...form, feriado: e.target.checked })} />
                Fue día feriado
              </label>
              <label className="col-span-2 block text-xs font-medium text-slate-600">
                Nota (opcional)
                <input value={form.nota} maxLength={300} placeholder="Ej. cubrí el turno de la tarde" className={campo}
                  onChange={(e) => setForm({ ...form, nota: e.target.value })} />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {aviso && <p className="mt-3 text-sm text-emerald-700">{aviso}</p>}
            <button
              onClick={enviar}
              disabled={enviando || !form.fecha || !form.horas}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar horas'}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Las horas nocturnas son las trabajadas entre las 9 de la noche y las 7 de la mañana.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow">Este enlace ya no admite horas nuevas.</div>
        )}

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-sm font-semibold text-slate-800">Lo que has enviado</h2>
          {data.registros.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Todavía no has enviado horas.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {data.registros.map((r) => (
                <li key={r.fecha} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium capitalize text-slate-800">{fechaLarga(r.fecha)}</div>
                    <div className="text-xs text-slate-500">
                      {r.horas} h{r.horasNocturnas > 0 ? ` · ${r.horasNocturnas} nocturnas` : ''}{r.feriado ? ' · feriado' : ''}
                      {r.nota ? ` · ${r.nota}` : ''}
                    </div>
                    {r.estado === 'rechazada' && r.motivoRechazo && (
                      <div className="text-xs text-red-600">Motivo: {r.motivoRechazo}. Corrígelo y vuelve a enviarlo.</div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${ESTADO[r.estado].clase}`}>
                    {ESTADO[r.estado].texto}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
