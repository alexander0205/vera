'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowUp, ArrowDown, Loader2, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanDef } from '@/lib/config/plans';

interface PendingPlan {
  name:          string;
  effectiveDate: string; // ISO
}

interface Props {
  plans:           PlanDef[];
  currentPlan:     PlanDef;
  /** Map de planKey → Stripe priceId (enviados desde el server) */
  priceIds:        Record<string, string>;
  pendingPlan?:    PendingPlan | null;
}

export function ChangePlan({ plans, currentPlan, priceIds, pendingPlan }: Props) {
  const router = useRouter();
  const [loading, setLoading]   = useState<string | null>(null); // planKey en curso
  const [canceling, setCanceling] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  async function handleChange(plan: PlanDef, type: 'upgrade' | 'downgrade') {
    const priceId = priceIds[plan.key];
    if (!priceId) { setError('Price ID no configurado para este plan.'); return; }

    setError(null);
    setSuccess(null);
    setLoading(plan.key);
    try {
      const res  = await fetch('/api/stripe/change-plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newPriceId: priceId }),
      });
      const data = await res.json() as { error?: string; effectiveDate?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al cambiar plan');

      if (type === 'upgrade') {
        setSuccess(`Cambiaste a ${plan.name}. Tu tarjeta fue cobrada por la diferencia prorateada.`);
      } else {
        const date = new Date(data.effectiveDate!).toLocaleDateString('es-DO', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        setSuccess(`Downgrade a ${plan.name} programado para el ${date}. Conservas tu plan actual hasta entonces.`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(null);
    }
  }

  async function handleCancelDowngrade() {
    setError(null);
    setSuccess(null);
    setCanceling(true);
    try {
      const res  = await fetch('/api/stripe/change-plan', { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al cancelar');
      setSuccess('Cambio de plan cancelado. Continúas con tu plan actual.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setCanceling(false);
    }
  }

  const busy = !!loading || canceling;

  return (
    <div className="space-y-4">

      {/* Downgrade pendiente */}
      {pendingPlan && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Calendar className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Cambio de plan programado</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Cambiarás a <strong>{pendingPlan.name}</strong> el{' '}
              {new Date(pendingPlan.effectiveDate).toLocaleDateString('es-DO', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}. Hasta entonces conservas todas las funciones de tu plan actual.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
            onClick={handleCancelDowngrade}
            disabled={busy}
          >
            {canceling
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <><X className="h-3 w-3 mr-1" />Cancelar</>
            }
          </Button>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">
          {success}
        </div>
      )}

      {/* Lista de planes */}
      <div className="grid gap-3">
        {plans.map(plan => {
          const isCurrent   = plan.key === currentPlan.key;
          const isPending   = pendingPlan?.name.toLowerCase() === plan.key;
          const isUpgrade   = plan.price > currentPlan.price;
          const isDowngrade = plan.price < currentPlan.price;
          const isLoading   = loading === plan.key;

          return (
            <div
              key={plan.key}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                isCurrent
                  ? 'border-teal-500 bg-teal-50/50'
                  : isPending
                    ? 'border-amber-300 bg-amber-50/30'
                    : 'border-gray-200 bg-white'
              }`}
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
                      <Check className="h-3 w-3" /> Plan actual
                    </span>
                  )}
                  {isPending && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      Programado
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{plan.ui.description}</p>
              </div>

              {/* Precio */}
              <p className="font-bold text-gray-900 shrink-0">
                ${plan.price}
                <span className="text-xs font-normal text-gray-400">/mes</span>
              </p>

              {/* Acción */}
              <div className="shrink-0 w-40">
                {isCurrent ? (
                  <Button size="sm" variant="outline" disabled className="w-full text-xs">
                    Plan actual
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    size="sm"
                    className="w-full text-xs bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={() => handleChange(plan, 'upgrade')}
                    disabled={busy}
                  >
                    {isLoading
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><ArrowUp className="h-3 w-3 mr-1" />Actualizar ahora</>
                    }
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => handleChange(plan, 'downgrade')}
                    disabled={busy || isPending}
                  >
                    {isLoading
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : isPending
                        ? 'Ya programado'
                        : <><ArrowDown className="h-3 w-3 mr-1" />Reducir al fin del ciclo</>
                    }
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notas */}
      <div className="space-y-1 text-xs text-gray-400 pt-1 border-t border-gray-100">
        <p><strong className="text-gray-500">Upgrade</strong> — se cobra la diferencia prorateada del período restante de inmediato.</p>
        <p><strong className="text-gray-500">Downgrade</strong> — el cambio entra en vigor al terminar tu ciclo de facturación. Conservas el plan actual hasta entonces.</p>
      </div>
    </div>
  );
}
