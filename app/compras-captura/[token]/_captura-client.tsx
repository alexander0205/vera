'use client';

import { useRef, useState } from 'react';

interface Datos {
  proveedorNombre: string | null;
  proveedorRnc: string | null;
  ncf: string | null;
  fecha: string | null;
  totalCents: number | null;
}
interface Resultado {
  origen: 'qr' | 'ia';
  datos: Datos;
  avisos: string[];
  duplicado: boolean;
}

const money = (c: number | null) =>
  c == null ? '—' : `RD$${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Intenta leer un QR de la imagen con el detector nativo del navegador
 * (BarcodeDetector, presente en Chrome/Android). Sin él, devuelve null y el
 * servidor cae a la IA. Cero dependencias.
 */
async function leerQr(file: File): Promise<string | null> {
  try {
    const BD = (globalThis as unknown as { BarcodeDetector?: new (o?: unknown) => { detect(img: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) return null;
    const det = new BD({ formats: ['qr_code'] });
    const bmp = await createImageBitmap(file);
    const codigos = await det.detect(bmp);
    return codigos[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

export default function CapturaClient({ token, negocio }: { token: string; negocio: { nombre: string; logo: string | null } }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'ok' | 'error'>('idle');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permitir re-elegir la misma foto
    if (!file) return;

    setEstado('procesando');
    setError(null);
    setResultado(null);

    const qr = await leerQr(file);
    const fd = new FormData();
    fd.append('foto', file);
    if (qr) fd.append('qr', qr);

    try {
      const res = await fetch(`/api/compras-captura/${token}`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo enviar la foto');
        setEstado('error');
        return;
      }
      setResultado(json as Resultado);
      setEstado('ok');
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      setEstado('error');
    }
  }

  const tomarFoto = () => inputRef.current?.click();

  return (
    <main style={{ minHeight: '100dvh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFoto} style={{ display: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ textAlign: 'center', paddingTop: 12 }}>
          {negocio.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={negocio.logo} alt="" style={{ height: 44, marginBottom: 8, objectFit: 'contain' }} />
          )}
          <div style={{ fontSize: 13, color: '#6b7280' }}>Registrar compra en</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>{negocio.nombre}</h1>
        </header>

        {estado === 'idle' && (
          <section style={cardStyle}>
            <div style={{ fontSize: 48, textAlign: 'center' }}>📄</div>
            <p style={{ color: '#4b5563', fontSize: 14, textAlign: 'center', margin: '4px 0 16px' }}>
              Toma una foto de la factura o el ticket. Centra el documento y que se lea bien.
            </p>
            <button onClick={tomarFoto} style={btnPrimary}>📷 Tomar foto</button>
          </section>
        )}

        {estado === 'procesando' && (
          <section style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={spinner} />
            <p style={{ color: '#4b5563', fontSize: 14, marginTop: 12 }}>Leyendo la factura…</p>
          </section>
        )}

        {estado === 'error' && (
          <section style={cardStyle}>
            <div style={{ fontSize: 40, textAlign: 'center' }}>⚠️</div>
            <p style={{ color: '#b91c1c', fontSize: 14, textAlign: 'center', margin: '8px 0 16px' }}>{error}</p>
            <button onClick={tomarFoto} style={btnPrimary}>Reintentar</button>
          </section>
        )}

        {estado === 'ok' && resultado && (
          <>
            <section style={{ ...cardStyle, borderColor: '#6ee7b7', background: '#f0fdf4' }}>
              <div style={{ fontSize: 40, textAlign: 'center' }}>✅</div>
              <p style={{ color: '#065f46', fontSize: 15, fontWeight: 600, textAlign: 'center', margin: '4px 0 2px' }}>
                Factura recibida
              </p>
              <p style={{ color: '#047857', fontSize: 13, textAlign: 'center', margin: 0 }}>
                {negocio.nombre} la revisará y la registrará.
              </p>
            </section>

            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Lo que leímos</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#3658e1', background: '#eef2fe', padding: '2px 8px', borderRadius: 999 }}>
                  {resultado.origen === 'qr' ? 'QR DGII' : 'IA'}
                </span>
              </div>
              <Fila k="Proveedor" v={resultado.datos.proveedorNombre ?? '—'} />
              <Fila k="RNC/Cédula" v={resultado.datos.proveedorRnc ?? '—'} />
              <Fila k="NCF" v={resultado.datos.ncf ?? '—'} />
              <Fila k="Fecha" v={resultado.datos.fecha ?? '—'} />
              <Fila k="Total" v={money(resultado.datos.totalCents)} destacado />

              {resultado.duplicado && (
                <p style={avisoBox('#fef2f2', '#991b1b')}>⚠️ Esta factura (NCF) ya fue enviada antes.</p>
              )}
              {resultado.avisos.map((a, i) => (
                <p key={i} style={avisoBox('#fffbeb', '#92400e')}>• {a}</p>
              ))}
            </section>

            <button onClick={tomarFoto} style={btnPrimary}>📷 Enviar otra factura</button>
          </>
        )}

        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
          Los datos son una lectura automática; el negocio verifica antes de registrar.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  );
}

function Fila({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>{k}</span>
      <span style={{ fontSize: destacado ? 15 : 13, fontWeight: destacado ? 700 : 500, color: '#111827', fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 };
const btnPrimary: React.CSSProperties = { width: '100%', padding: '14px 16px', background: '#3658e1', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' };
const spinner: React.CSSProperties = { width: 36, height: 36, margin: '0 auto', border: '3px solid #e5e7eb', borderTopColor: '#3658e1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' };
const avisoBox = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, fontSize: 12, padding: '8px 10px', borderRadius: 8, margin: '8px 0 0' });
