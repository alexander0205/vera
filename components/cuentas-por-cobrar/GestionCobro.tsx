'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Phone, StickyNote, HandCoins, Check, XCircle, UserRound, CalendarClock,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import type {
  GestionCuenta, TipoEventoCobranza, CanalContacto,
} from '@/lib/cobranza/seguimiento';

const CANAL_LABEL: Record<CanalContacto, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo',
  presencial: 'Presencial', otro: 'Otro',
};

const TIPO_UI: Record<TipoEventoCobranza, {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>; label: string; punto: string;
}> = {
  contacto: { Icon: Phone,      label: 'Contacto',        punto: '#6366f1' },
  nota:     { Icon: StickyNote, label: 'Nota interna',    punto: '#9ca3af' },
  promesa:  { Icon: HandCoins,  label: 'Promesa de pago', punto: '#8b5cf6' },
};

const ESTADO_PROMESA_UI: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  pendiente:  { label: 'Pendiente',  bg: '#ede9fe', fg: '#6d28d9', border: '#ddd6fe' },
  cumplida:   { label: 'Cumplida',   bg: '#d1fae5', fg: '#047857', border: '#a7f3d0' },
  incumplida: { label: 'Incumplida', bg: '#fee2e2', fg: '#b91c1c', border: '#fecaca' },
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
    <Box component="section" sx={{ px: 2, py: 1.5, borderTop: '1px solid #f3f4f6' }}>
      <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
        Gestión de cobro
      </Typography>

      {error && <Typography sx={{ fontSize: '0.875rem', color: '#dc2626', mb: 1 }}>{error}</Typography>}

      {loading ? (
        <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: '#9ca3af', py: 1 }}>
          <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Cargando…
        </Typography>
      ) : (
        <>
          {/* Estado: responsable y próxima acción */}
          <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', p: 1.5, mb: 1.5 }}>
            {editSeg ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  size="small" fullWidth
                  value={proxAccion}
                  onChange={e => setProxAccion(e.target.value)}
                  placeholder="Próxima acción (ej. llamar al encargado)"
                />
                <TextField
                  size="small" fullWidth type="date"
                  value={proxFecha}
                  onChange={e => setProxFecha(e.target.value)}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained" size="small"
                    disabled={guardando}
                    onClick={async () => {
                      const ok = await enviar({
                        accion: 'seguimiento',
                        proximaAccion: proxAccion.trim() || null,
                        proximaAccionFecha: proxFecha || null,
                      });
                      if (ok) setEditSeg(false);
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    variant="outlined" color="inherit" size="small"
                    onClick={() => setEditSeg(false)}
                    sx={{ color: '#374151', borderColor: '#d1d5db' }}
                  >
                    Cancelar
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: '#374151' }}>
                    <CalendarClock style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
                    {seg?.proximaAccion
                      ? <span>{seg.proximaAccion}{seg.proximaAccionFecha && ` · ${fmtFechaCorta(seg.proximaAccionFecha)}`}</span>
                      : <Box component="span" sx={{ color: '#9ca3af' }}>Sin próxima acción definida</Box>}
                  </Typography>
                  <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: '#6b7280' }}>
                    <UserRound style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
                    {seg?.responsableNombre ?? 'Sin responsable asignado'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Último contacto: {data?.ultimoContacto ? fmtFechaCorta(data.ultimoContacto) : '—'}
                  </Typography>
                </Box>
                <Box
                  component="button"
                  onClick={() => setEditSeg(true)}
                  sx={{
                    fontSize: '0.75rem', color: '#0d9488', flexShrink: 0, bgcolor: 'transparent',
                    border: 0, cursor: 'pointer', p: 0, '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  Editar
                </Box>
              </Box>
            )}
          </Box>

          {/* Promesa vigente, destacada */}
          {data?.promesaActiva && (
            <Box sx={{ border: '1px solid #ddd6fe', bgcolor: '#f5f3ff', borderRadius: '8px', p: 1.5, mb: 1.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#5b21b6' }}>
                Prometió pagar el {fmtFechaCorta(data.promesaActiva.promesaFecha!)}
                {data.promesaActiva.promesaMonto ? ` · ${fmtDOP(data.promesaActiva.promesaMonto)}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  variant="contained" size="small" color="success"
                  disabled={guardando}
                  onClick={() => enviar({ accion: 'cerrar-promesa', eventoId: data.promesaActiva!.id, estado: 'cumplida' })}
                  startIcon={<Check style={{ width: 12, height: 12 }} />}
                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                >
                  Cumplida
                </Button>
                <Button
                  variant="outlined" size="small" color="error"
                  disabled={guardando}
                  onClick={() => enviar({ accion: 'cerrar-promesa', eventoId: data.promesaActiva!.id, estado: 'incumplida' })}
                  startIcon={<XCircle style={{ width: 12, height: 12 }} />}
                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                >
                  Incumplida
                </Button>
              </Box>
            </Box>
          )}

          {/* Registrar gestión */}
          <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', p: 1.5, mb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {(['contacto', 'nota', 'promesa'] as TipoEventoCobranza[]).map(t => {
                const ui = TIPO_UI[t];
                const activo = tipo === t;
                return (
                  <Box
                    component="button"
                    key={t}
                    onClick={() => setTipo(t)}
                    sx={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      gap: 0.5, px: 1, py: 0.75, fontSize: '0.75rem', borderRadius: '6px',
                      cursor: 'pointer', transition: 'border-color .15s',
                      ...(activo
                        ? { border: '1px solid #14b8a6', bgcolor: '#f0fdfa', color: '#0f766e', fontWeight: 500 }
                        : { border: '1px solid #e5e7eb', bgcolor: 'transparent', color: '#4b5563', '&:hover': { borderColor: '#d1d5db' } }),
                    }}
                  >
                    <ui.Icon style={{ width: 14, height: 14 }} /> {ui.label}
                  </Box>
                );
              })}
            </Box>

            {tipo === 'contacto' && (
              <TextField
                select size="small" fullWidth
                value={canal}
                onChange={e => setCanal(e.target.value as CanalContacto)}
              >
                {(Object.keys(CANAL_LABEL) as CanalContacto[]).map(c => (
                  <MenuItem key={c} value={c}>{CANAL_LABEL[c]}</MenuItem>
                ))}
              </TextField>
            )}

            {tipo === 'promesa' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField
                  size="small" type="date" label="Fecha prometida"
                  value={promesaFecha}
                  onChange={e => setPromesaFecha(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small" type="number" label="Monto (opcional)"
                  value={promesaMonto}
                  onChange={e => setPromesaMonto(e.target.value)}
                  placeholder="0.00"
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                />
              </Box>
            )}

            <TextField
              size="small" fullWidth multiline rows={2}
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Comentario interno (no lo ve el cliente)"
            />

            <Button
              variant="contained" size="small" fullWidth
              onClick={registrar}
              disabled={guardando}
              startIcon={guardando ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : undefined}
              sx={{ bgcolor: '#111827', '&:hover': { bgcolor: '#1f2937' }, fontSize: '0.75rem' }}
            >
              Registrar {TIPO_UI[tipo].label.toLowerCase()}
            </Button>
          </Box>

          {/* Historial de gestión */}
          {data && data.eventos.length > 0 && (
            <Box component="ol" sx={{ position: 'relative', m: 0, p: 0, pl: 2.5, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box component="span" aria-hidden sx={{ position: 'absolute', left: '5px', top: 6, bottom: 6, width: '1px', bgcolor: '#e5e7eb' }} />
              {data.eventos.map(ev => {
                const ui = TIPO_UI[ev.tipo];
                const est = ev.promesaEstado ? ESTADO_PROMESA_UI[ev.promesaEstado] : null;
                return (
                  <Box component="li" key={ev.id} sx={{ position: 'relative' }}>
                    <Box
                      component="span" aria-hidden
                      sx={{
                        position: 'absolute', left: -20, top: 6, height: 11, width: 11,
                        borderRadius: '9999px', bgcolor: ui.punto, boxShadow: '0 0 0 2px #fff',
                      }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <ui.Icon style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
                        {ui.label}
                        {ev.canal && <Box component="span" sx={{ color: '#9ca3af' }}>· {CANAL_LABEL[ev.canal]}</Box>}
                      </Typography>
                      {est && (
                        <Box component="span" sx={{
                          fontSize: '10px', px: 0.75, py: 0.25, borderRadius: '9999px',
                          bgcolor: est.bg, color: est.fg, border: `1px solid ${est.border}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {est.label}
                        </Box>
                      )}
                    </Box>
                    {ev.tipo === 'promesa' && ev.promesaFecha && (
                      <Typography sx={{ fontSize: '0.75rem', color: '#6d28d9', mt: 0.25 }}>
                        Prometió el {fmtFechaCorta(ev.promesaFecha)}
                        {ev.promesaMonto ? ` · ${fmtDOP(ev.promesaMonto)}` : ''}
                      </Typography>
                    )}
                    {ev.comentario && (
                      <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', mt: 0.25, whiteSpace: 'pre-wrap' }}>{ev.comentario}</Typography>
                    )}
                    <Typography sx={{ fontSize: '11px', color: '#9ca3af', mt: 0.25 }}>
                      {fmtFechaCorta(ev.fecha)}{ev.usuario && ` · ${ev.usuario}`}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
          {data && data.eventos.length === 0 && (
            <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>Sin gestión registrada.</Typography>
          )}
        </>
      )}
    </Box>
  );
}
