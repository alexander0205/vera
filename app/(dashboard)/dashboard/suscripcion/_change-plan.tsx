'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { Check, ArrowUp, ArrowDown, Calendar, X } from 'lucide-react';
import type { PlanDef } from '@/lib/config/plans';

interface PendingPlan {
  name:          string;
  effectiveDate: string;
}

interface Props {
  plans:        PlanDef[];
  currentPlan:  PlanDef;
  priceIds:     Record<string, string>;
  pendingPlan?: PendingPlan | null;
}

export function ChangePlan({ plans, currentPlan, priceIds, pendingPlan }: Props) {
  const router = useRouter();
  const [loading, setCanceling]   = useState<string | null>(null);
  const [canceling, setSetCanceling] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  async function handleChange(plan: PlanDef, type: 'upgrade' | 'downgrade') {
    const priceId = priceIds[plan.key];
    if (!priceId) { setError('Price ID no configurado para este plan.'); return; }
    setError(null); setSuccess(null); setCanceling(plan.key);
    try {
      const res  = await fetch('/api/stripe/change-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPriceId: priceId }),
      });
      const data = await res.json() as { error?: string; effectiveDate?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al cambiar plan');
      if (type === 'upgrade') {
        setSuccess(`Cambiaste a ${plan.name}. Tu tarjeta fue cobrada por la diferencia prorateada.`);
      } else {
        const date = new Date(data.effectiveDate!).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
        setSuccess(`Downgrade a ${plan.name} programado para el ${date}. Conservas tu plan actual hasta entonces.`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally { setCanceling(null); }
  }

  async function handleCancelDowngrade() {
    setError(null); setSuccess(null); setSetCanceling(true);
    try {
      const res  = await fetch('/api/stripe/change-plan', { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al cancelar');
      setSuccess('Cambio de plan cancelado. Continúas con tu plan actual.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally { setSetCanceling(false); }
  }

  const busy = !!loading || canceling;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Downgrade pendiente */}
      {pendingPlan && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', p: 2 }}>
          <Calendar size={16} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>Cambio de plan programado</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#b45309', mt: 0.5 }}>
              Cambiarás a <strong>{pendingPlan.name}</strong> el{' '}
              {new Date(pendingPlan.effectiveDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}.
              Hasta entonces conservas todas las funciones de tu plan actual.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={handleCancelDowngrade}
            disabled={busy}
            startIcon={canceling ? <CircularProgress size={12} /> : <X size={12} />}
            sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#fcd34d', color: '#92400e', '&:hover': { bgcolor: '#fef3c7' }, flexShrink: 0 }}
          >
            {canceling ? '' : 'Cancelar'}
          </Button>
        </Box>
      )}

      {error   && <Alert severity="error"   sx={{ borderRadius: '8px' }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ borderRadius: '8px' }}>{success}</Alert>}

      {/* Lista de planes */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {plans.map(plan => {
          const isCurrent   = plan.key === currentPlan.key;
          const isPending   = pendingPlan?.name.toLowerCase() === plan.key;
          const isUpgrade   = plan.price > currentPlan.price;
          const isLoading   = loading === plan.key;

          return (
            <Box key={plan.key} sx={{
              display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: '12px', border: '1px solid',
              borderColor: isCurrent ? '#3658e1' : isPending ? '#fcd34d' : '#e5e7eb',
              bgcolor: isCurrent ? '#eef2fe80' : isPending ? '#fffbeb80' : '#fff',
              transition: 'all 0.15s',
            }}>
              {/* Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{plan.name}</Typography>
                  {isCurrent && (
                    <Chip
                      label="Plan actual"
                      size="small"
                      icon={<Check size={10} />}
                      sx={{ bgcolor: '#eef2fe', color: '#2a45c4', border: '1px solid #c7d2fc', fontSize: '0.625rem', height: 20, fontWeight: 600 }}
                    />
                  )}
                  {isPending && (
                    <Chip label="Programado" size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.625rem', height: 20 }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>{plan.ui.description}</Typography>
              </Box>

              {/* Precio */}
              <Typography sx={{ fontWeight: 700, color: '#111827', flexShrink: 0 }}>
                ${plan.price}<Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af' }}>/mes</Box>
              </Typography>

              {/* Acción */}
              <Box sx={{ flexShrink: 0, width: 160 }}>
                {isCurrent ? (
                  <Button fullWidth size="small" variant="outlined" disabled
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem' }}>
                    Plan actual
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    fullWidth size="small" variant="contained" disableElevation
                    onClick={() => handleChange(plan, 'upgrade')} disabled={busy}
                    startIcon={isLoading ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <ArrowUp size={12} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
                  >
                    {isLoading ? 'Actualizando…' : 'Actualizar ahora'}
                  </Button>
                ) : (
                  <Button
                    fullWidth size="small" variant="outlined"
                    onClick={() => handleChange(plan, 'downgrade')} disabled={busy || isPending}
                    startIcon={isLoading ? <CircularProgress size={12} /> : isPending ? undefined : <ArrowDown size={12} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#d1d5db', color: '#374151' }}
                  >
                    {isLoading ? 'Procesando…' : isPending ? 'Ya programado' : 'Reducir al fin del ciclo'}
                  </Button>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Notas */}
      <Box sx={{ pt: 1, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          <Box component="span" sx={{ fontWeight: 600, color: '#6b7280' }}>Upgrade</Box> — se cobra la diferencia prorateada del período restante de inmediato.
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          <Box component="span" sx={{ fontWeight: 600, color: '#6b7280' }}>Downgrade</Box> — el cambio entra en vigor al terminar tu ciclo de facturación. Conservas el plan actual hasta entonces.
        </Typography>
      </Box>
    </Box>
  );
}
