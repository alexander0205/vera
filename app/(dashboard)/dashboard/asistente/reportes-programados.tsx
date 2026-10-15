'use client';

import { useEffect, useState } from 'react';
import { Mail, Trash2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import {
  ETIQUETA_FRECUENCIA, ETIQUETA_TIPO, FRECUENCIAS_REPORTE, TIPOS_REPORTE,
  type FrecuenciaReporte, type TipoReporte,
} from '@/lib/asistente/reportes-programados';

interface Reporte {
  id: number; tipo: TipoReporte; frecuencia: FrecuenciaReporte; activo: boolean;
  ultimoEnvioEn: string | null; ultimoError: string | null;
}

/**
 * Reportes programados: cada día, lunes o día 1 le llega a la persona, en su
 * correo, el reporte elegido en PDF. Solo a su propio correo.
 */
export function ReportesProgramados() {
  const [reportes, setReportes] = useState<Reporte[] | null>(null);
  const [correo, setCorreo] = useState('');
  const [tipo, setTipo] = useState<TipoReporte>('ventas');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaReporte>('semanal');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const r = await fetch('/api/asistente/reportes', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setReportes(d.reportes ?? []);
      setCorreo(d.correo ?? '');
    } catch {
      setReportes([]);
      setError('No pude cargar tus reportes programados.');
    }
  }
  useEffect(() => { void cargar(); }, []);

  async function programar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch('/api/asistente/reportes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, frecuencia }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo programar');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo programar');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: number) {
    setError(null);
    const r = await fetch(`/api/asistente/reportes?id=${id}`, { method: 'DELETE' });
    if (!r.ok) setError('No se pudo quitar el reporte.');
    await cargar();
  }

  const campo = { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: 'transparent', color: 'inherit' } as const;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        Recibe en {correo ? <strong>{correo}</strong> : 'tu correo'} un PDF con el reporte que elijas, sin tener que pedirlo.
        Solo se envía a ti.
      </Typography>

      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2, alignItems: 'center' }}>
          <select aria-label="Reporte" value={tipo} onChange={(e) => setTipo(e.target.value as TipoReporte)} style={campo}>
            {TIPOS_REPORTE.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
          </select>
          <select aria-label="Frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaReporte)} style={campo}>
            {FRECUENCIAS_REPORTE.map((f) => <option key={f} value={f}>{ETIQUETA_FRECUENCIA[f]}</option>)}
          </select>
          <button
            type="button" onClick={programar} disabled={guardando}
            style={{ ...campo, background: '#3658e1', color: '#fff', border: '1px solid #3658e1', cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}
          >
            {guardando ? 'Guardando…' : 'Programar envío'}
          </button>
        </Box>
        {error && <Typography variant="body2" role="alert" sx={{ color: '#b91c1c', px: 2, pb: 1.5 }}>{error}</Typography>}

        {reportes === null ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, pb: 2 }}>Cargando…</Typography>
        ) : reportes.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, pb: 2 }}>No tienes reportes programados.</Typography>
        ) : reportes.map((r) => (
          <Box key={r.id}>
            <Divider />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
              <Mail size={16} color="#6b7280" aria-hidden />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 600 }}>
                  {ETIQUETA_TIPO[r.tipo] ?? r.tipo} · {ETIQUETA_FRECUENCIA[r.frecuencia] ?? r.frecuencia}
                </Typography>
                <Typography variant="caption" sx={{ color: r.ultimoError ? '#b91c1c' : 'text.secondary' }}>
                  {r.ultimoError
                    ? `No se pudo enviar: ${r.ultimoError}`
                    : r.ultimoEnvioEn
                      ? `Último envío: ${new Date(r.ultimoEnvioEn).toLocaleDateString('es-DO')}`
                      : 'Aún no se ha enviado'}
                  {!r.activo ? ' · Pausado' : ''}
                </Typography>
              </Box>
              <button
                type="button" onClick={() => quitar(r.id)} aria-label="Quitar este reporte" title="Quitar"
                style={{ border: 0, background: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <Trash2 size={16} />
              </button>
            </Box>
          </Box>
        ))}
      </Card>
    </Box>
  );
}
