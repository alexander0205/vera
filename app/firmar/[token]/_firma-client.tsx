'use client';

import { useEffect, useRef, useState } from 'react';

interface Contrato {
  titulo: string;
  cuerpo: string;
  empresa: string;
  estado: string;
  firmanteNombre: string | null;
  firmadoEn: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FirmaClient({ token }: { token: string }) {
  const [data, setData] = useState<Contrato | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [firmado, setFirmado] = useState(false);
  const [hayTrazo, setHayTrazo] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  useEffect(() => {
    fetcher(`/api/firma/${token}`)
      .then((j) => {
        if (j.error) { setError(j.error); return; }
        setData(j);
        if (j.estado === 'firmado') setFirmado(true);
      })
      .catch(() => setError('No se pudo cargar el contrato'))
      .finally(() => setCargando(false));
  }, [token]);

  // ── Pad de firma ──
  function ctx() {
    const c = canvasRef.current;
    if (!c) return null;
    const g = c.getContext('2d');
    if (g) { g.lineWidth = 2.2; g.lineCap = 'round'; g.strokeStyle = '#111827'; }
    return g;
  }
  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function abajo(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const g = ctx(); if (!g) return;
    dibujando.current = true;
    const p = punto(e);
    g.beginPath(); g.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function mueve(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const g = ctx(); if (!g) return;
    const p = punto(e);
    g.lineTo(p.x, p.y); g.stroke();
    setHayTrazo(true);
  }
  function arriba() { dibujando.current = false; }
  function limpiar() {
    const c = canvasRef.current, g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setHayTrazo(false);
  }

  async function firmar() {
    if (nombre.trim().length < 3) { setError('Escribe tu nombre completo'); return; }
    if (!hayTrazo) { setError('Dibuja tu firma en el recuadro'); return; }
    setEnviando(true); setError(null);
    try {
      const firma = canvasRef.current!.toDataURL('image/png');
      const res = await fetch(`/api/firma/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmanteNombre: nombre.trim(), firma }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo firmar');
      setFirmado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setEnviando(false);
    }
  }

  const wrap = 'min-h-screen bg-slate-100 px-4 py-8 flex justify-center';

  if (cargando) {
    return <div className={wrap}><p className="mt-20 text-slate-500">Cargando…</p></div>;
  }
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

  if (firmado) {
    return (
      <div className={wrap}>
        <div className="mt-16 max-w-md rounded-xl bg-white p-8 text-center shadow">
          <div className="mb-2 text-4xl">✅</div>
          <h1 className="text-lg font-semibold text-slate-800">Contrato firmado</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.firmanteNombre ? `Firmado por ${data.firmanteNombre}.` : 'Tu firma quedó registrada.'} Ya puedes cerrar esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className="w-full max-w-2xl space-y-4">
        <div className="rounded-xl bg-white p-6 shadow">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{data.empresa}</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-800">{data.titulo}</h1>
          <div className="mt-4 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {data.cuerpo}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-sm font-semibold text-slate-800">Firma del contrato</h2>
          <p className="mt-0.5 text-xs text-slate-500">Escribe tu nombre y dibuja tu firma para aceptar.</p>

          <label className="mt-4 block text-xs font-medium text-slate-600">Nombre completo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre completo"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />

          <label className="mt-4 block text-xs font-medium text-slate-600">Firma</label>
          <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white">
            <canvas
              ref={canvasRef}
              width={640}
              height={200}
              className="w-full touch-none"
              style={{ touchAction: 'none' }}
              onPointerDown={abajo}
              onPointerMove={mueve}
              onPointerUp={arriba}
              onPointerLeave={arriba}
            />
          </div>
          <button onClick={limpiar} className="mt-1 text-xs text-slate-500 underline">Borrar firma</button>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={firmar}
            disabled={enviando}
            className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {enviando ? 'Firmando…' : 'Acepto y firmo'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Al firmar aceptas el contenido de este contrato. Se registra la fecha, hora y tu firma.
          </p>
        </div>
      </div>
    </div>
  );
}
