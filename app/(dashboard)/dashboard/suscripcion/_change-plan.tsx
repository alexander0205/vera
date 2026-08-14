'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { Check, ArrowUp, ArrowDown, Calendar, X, AlertTriangle, Info } from 'lucide-react';
import type { PlanDef } from '@/lib/config/plans';
import type { MotivoCambio } from '@/lib/config/suscripcion';

interface PendingPlan {
  name:          string;
  effectiveDate: string;
}

/** Lo que responde /api/stripe/change-plan cuando el cambio no es directo. */
interface RespuestaCambio {
  error?:  string;
  code?:   'CAMBIO_BLOQUEADO' | 'REQUIERE_CONFIRMACION';
  bloqueos?: MotivoCambio[];
  avisos?:   MotivoCambio[];
  modulosQueSePierden?: string[];
  effectiveDate?: string;
}

/** El cambio quedó esperando a que el usuario diga que sí. */
interface PorConfirmar {
  plan:   PlanDef;
  tipo:   'upgrade' | 'downgrade';
  avisos: MotivoCambio[];
}

interface Props {
  plans:        PlanDef[];
  currentPlan:  PlanDef;
  priceIds:     Record<string, string>;
  pendingPlan?: PendingPlan | null;
  /**
   * ¿Hay una suscripción viva en Stripe?
   *
   * Cambia lo que hace cada botón, no solo su texto. Con suscripción se
   * modifica la que existe (prorrateo al subir, fin de ciclo al bajar); sin
   * ella no hay nada que modificar y hay que pasar por el checkout. Es el
   * caso de quien tiene el plan asignado por nosotros y el de quien nunca
   * compró.
   */
  tieneSuscripcion: boolean;
  /** Server Action del checkout. Solo se usa cuando no hay suscripción. */
  checkoutAction: (formData: FormData) => void;
}

export function ChangePlan({
  plans, currentPlan, priceIds, pendingPlan, tieneSuscripcion, checkoutAction,
}: Props) {
  const router = useRouter();
  const [loading, setLoading]     = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  // El cambio no procede hasta resolver esto.
  const [bloqueos, setBloqueos]   = useState<MotivoCambio[] | null>(null);
  // El cambio procede, pero hay que enseñarle qué pierde antes de aplicarlo.
  const [porConfirmar, setPorConfirmar] = useState<PorConfirmar | null>(null);

  function limpiar() {
    setError(null); setSuccess(null); setBloqueos(null); setPorConfirmar(null);
  }

  /**
   * @param confirmado El usuario ya vio la lista de consecuencias y sigue
   *   adelante. Sin esto, la API devuelve 409 con los avisos en vez de
   *   aplicar el cambio — es lo que impide enterarse de que perdiste el
   *   módulo escolar el lunes por la mañana.
   */
  async function handleChange(
    plan: PlanDef,
    type: 'upgrade' | 'downgrade',
    confirmado = false,
  ) {
    const priceId = priceIds[plan.key];
    if (!priceId) { setError('Price ID no configurado para este plan.'); return; }
    limpiar(); setLoading(plan.key);
    try {
      const res  = await fetch('/api/stripe/change-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPriceId: priceId, confirmado }),
      });
      const data = await res.json() as RespuestaCambio;

      // Hay algo que resolver antes: estudiantes por encima del tramo, un
      // módulo con datos dentro, un turno de caja abierto.
      if (data.code === 'CAMBIO_BLOQUEADO') {
        setBloqueos(data.bloqueos ?? []);
        return;
      }

      // Se puede, pero pierde cosas. Se le enseñan y decide él.
      if (data.code === 'REQUIERE_CONFIRMACION') {
        setPorConfirmar({ plan, tipo: type, avisos: data.avisos ?? [] });
        return;
      }

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
    } finally { setLoading(null); }
  }

  async function handleCancelDowngrade() {
    limpiar(); setCanceling(true);
    try {
      const res  = await fetch('/api/stripe/change-plan', { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al cancelar');
      setSuccess('Cambio de plan cancelado. Continúas con tu plan actual.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally { setCanceling(false); }
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

      {/* Bloqueos — hay que resolverlos antes. Cada uno trae CÓMO resolverlo:
          decirle «no se puede» sin decirle qué hacer lo manda a soporte. */}
      {bloqueos && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', p: 2 }}>
          <AlertTriangle size={16} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#991b1b' }}>
              Este cambio no se puede aplicar todavía
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {bloqueos.map(b => (
                <Box component="li" key={b.clave} sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                  {b.mensaje}
                  {b.comoResolver && (
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#991b1b', opacity: 0.75, mt: 0.25 }}>
                      {b.comoResolver}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
          <Button size="small" onClick={() => setBloqueos(null)}
            sx={{ minWidth: 0, p: 0.5, color: '#991b1b', flexShrink: 0 }}>
            <X size={14} />
          </Button>
        </Box>
      )}

      {/* Confirmación — se puede, pero pierde cosas. Se le enseñan ANTES de
          tocar Stripe; enterarse después es enterarse el lunes por la mañana. */}
      {porConfirmar && (
        <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Info size={16} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
                Antes de cambiar a {porConfirmar.plan.name}
              </Typography>
              <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {porConfirmar.avisos.map(a => (
                  <Box component="li" key={a.clave} sx={{ fontSize: '0.75rem', color: '#b45309' }}>
                    {a.mensaje}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
            <Button size="small" variant="outlined" onClick={() => setPorConfirmar(null)} disabled={busy}
              sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#fcd34d', color: '#92400e' }}>
              Mejor no
            </Button>
            <Button
              size="small" variant="contained" disableElevation disabled={busy}
              onClick={() => handleChange(porConfirmar.plan, porConfirmar.tipo, true)}
              startIcon={busy ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : undefined}
              sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}>
              Entiendo, cambiar de todos modos
            </Button>
          </Box>
        </Box>
      )}

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
                ) : !tieneSuscripcion ? (
                  // Sin suscripción no hay nada que modificar: se contrata.
                  // El checkout es de Stripe y sale de un form propio, no del
                  // fetch de arriba, porque termina en una redirección fuera
                  // del sistema.
                  <Box component="form" action={checkoutAction}>
                    <input type="hidden" name="priceId" value={priceIds[plan.key] ?? ''} />
                    <Button
                      type="submit" fullWidth size="small"
                      variant={isUpgrade ? 'contained' : 'outlined'} disableElevation
                      disabled={!priceIds[plan.key]}
                      sx={{
                        borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem',
                        ...(isUpgrade
                          ? { bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }
                          : { borderColor: '#d1d5db', color: '#374151' }),
                      }}
                    >
                      Contratar
                    </Button>
                  </Box>
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

      {/* Notas — las de la suscripción no aplican a quien todavía no la tiene:
          hablarle de prorrateo antes de contratar es explicarle una mecánica
          que no le va a pasar. */}
      <Box sx={{ pt: 1, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {tieneSuscripcion ? (
          <>
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              <Box component="span" sx={{ fontWeight: 600, color: '#6b7280' }}>Subir de plan</Box> — se cobra de inmediato solo la diferencia del período que queda.
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              <Box component="span" sx={{ fontWeight: 600, color: '#6b7280' }}>Bajar de plan</Box> — entra en vigor al terminar tu ciclo de facturación. Conservas el plan actual hasta entonces.
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Tu plan actual está activo sin cobro automático. Al contratar uno,
            la facturación pasa a ser mensual por tarjeta y puedes cambiarlo o
            cancelarlo cuando quieras.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
