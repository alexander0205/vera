'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle, Send } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Modal de recordatorios de pago por correo.
 *
 * Refleja el contrato de dos pasos de `/api/cuentas-por-cobrar/recordatorios`:
 * primero una llamada SIN `confirmar` que solo previsualiza (a quién iría, con
 * qué saldo, y quién queda fuera), y recién con la confirmación explícita del
 * usuario una segunda llamada con `confirmar: true` que envía de verdad.
 *
 * El doble paso es deliberado: esto le escribe a clientes reales y un envío
 * masivo disparado por error no se puede deshacer. El botón de enviar dice
 * cuántos correos van a salir, no un "Confirmar" genérico.
 */

const MAX_POR_LOTE = 50;

interface Enviable {
  id: number; codigo: string; cliente: string; email: string;
  saldoCents: number; diasVencido: number;
}
interface Omitido { id: number; codigo: string; cliente: string }

interface Preview {
  enviables: Enviable[];
  omitidos:  { sinCorreo: Omitido[]; sinSaldo: Omitido[] };
}
interface Resultado {
  enviados: number;
  fallidos: { id: number; error: string }[];
  omitidos: { sinCorreo: number; sinSaldo: number };
}

export function RecordatoriosModal({
  docIds, onClose, onEnviado,
}: {
  docIds:     number[];
  onClose:    () => void;
  /** Se llama tras un envío con al menos un correo entregado (para refrescar). */
  onEnviado:  () => void;
}) {
  const [preview, setPreview]   = useState<Preview | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Paso 1: previsualizar. No envía nada.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/cuentas-por-cobrar/recordatorios', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ docIds }),
        });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) throw new Error(j.error ?? 'No se pudo previsualizar');
        setPreview(j);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [docIds]);

  // Paso 2: enviar de verdad.
  const enviar = useCallback(async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/cuentas-por-cobrar/recordatorios', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ docIds, confirmar: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudieron enviar');
      setResultado(j);
      if (j.enviados > 0) onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setEnviando(false);
    }
  }, [docIds, onEnviado]);

  const enviables = preview?.enviables ?? [];
  const sinCorreo = preview?.omitidos.sinCorreo ?? [];
  const sinSaldo  = preview?.omitidos.sinSaldo ?? [];

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            {resultado ? 'Recordatorios enviados' : 'Enviar recordatorio de pago'}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>
            {resultado
              ? 'Queda registrado en el historial de gestión de cada cuenta.'
              : `${docIds.length} cuenta${docIds.length !== 1 ? 's' : ''} seleccionada${docIds.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9ca3af' }}>
          <X style={{ width: 16, height: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {cargando && (
          <Typography sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 4, fontSize: '0.875rem', color: '#6b7280' }}>
            <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
            Preparando la previsualización…
          </Typography>
        )}

        {error && (
          <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
            {error}
          </Alert>
        )}

        {/* ── Resultado del envío ─────────────────────────────────────────── */}
        {resultado && (
          <>
            <Alert severity="success" icon={<CheckCircle style={{ width: 16, height: 16 }} />}>
              {resultado.enviados} correo{resultado.enviados !== 1 ? 's' : ''} enviado
              {resultado.enviados !== 1 ? 's' : ''}.
            </Alert>
            {resultado.fallidos.length > 0 && (
              <Alert severity="error">
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 0.5 }}>
                  {resultado.fallidos.length} fallaron:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {resultado.fallidos.map(f => (
                    <Box component="li" key={f.id} sx={{ fontSize: '0.75rem' }}>
                      Cuenta #{f.id} — {f.error}
                    </Box>
                  ))}
                </Box>
              </Alert>
            )}
          </>
        )}

        {/* ── Previsualización ────────────────────────────────────────────── */}
        {preview && !resultado && (
          <>
            {enviables.length === 0 ? (
              <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
                Ninguna de las cuentas seleccionadas se puede notificar. Necesitan
                un correo registrado y saldo pendiente.
              </Alert>
            ) : (
              <Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                  Se enviará a {enviables.length} destinatario{enviables.length !== 1 ? 's' : ''}
                </Typography>
                <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', '& > div + div': { borderTop: '1px solid #f3f4f6' } }}>
                  {enviables.map(e => (
                    <Box key={e.id} sx={{ px: 1.5, py: 1.25, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{e.cliente}</Typography>
                        <Typography noWrap sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{e.email}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{e.codigo}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{fmtDOP(e.saldoCents)}</Typography>
                        {e.diasVencido > 0 && (
                          <Typography sx={{ fontSize: '0.75rem', color: '#dc2626' }}>{e.diasVencido} días de atraso</Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {(sinCorreo.length > 0 || sinSaldo.length > 0) && (
              <Box sx={{ border: '1px solid #e5e7eb', bgcolor: '#f9fafb', borderRadius: '8px', px: 1.5, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {sinCorreo.length > 0 && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>
                    <strong>{sinCorreo.length}</strong> sin correo
                    registrado: {sinCorreo.map(o => o.codigo).join(', ')}
                  </Typography>
                )}
                {sinSaldo.length > 0 && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>
                    <strong>{sinSaldo.length}</strong> sin saldo
                    pendiente: {sinSaldo.map(o => o.codigo).join(', ')}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Estas quedan fuera del envío.</Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          color="inherit"
          onClick={onClose}
          sx={{ color: '#374151' }}
        >
          {resultado ? 'Cerrar' : 'Cancelar'}
        </Button>
        {!resultado && (
          <Button
            variant="contained"
            onClick={enviar}
            disabled={enviando || cargando || enviables.length === 0}
            startIcon={enviando
              ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
              : <Send style={{ width: 16, height: 16 }} />}
          >
            {enviando
              ? 'Enviando…'
              : `Enviar ${enviables.length} correo${enviables.length !== 1 ? 's' : ''}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export { MAX_POR_LOTE };
