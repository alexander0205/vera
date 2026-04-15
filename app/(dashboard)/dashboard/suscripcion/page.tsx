import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Zap, AlertCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getTeamIdForUser, getTeamProfile, getMonthlyEcfCount, getPlanLimit } from '@/lib/db/queries';
import { getPlan, PLANS, getPlanPriceId } from '@/lib/config/plans';
import { customerPortalAction } from '@/lib/payments/actions';
import { stripe } from '@/lib/payments/stripe';
import { count, eq, and, gte } from 'drizzle-orm';
import { ecfDocuments } from '@/lib/db/schema';
import { db } from '@/lib/db/drizzle';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { PlanSwitcher } from './_plan-switcher';
import { ChangePlan } from './_change-plan';

export default async function SuscripcionPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [team, usadoEsteMes, usagePorTipo] = await Promise.all([
    getTeamProfile(teamId),
    getMonthlyEcfCount(teamId),
    db
      .select({ tipoEcf: ecfDocuments.tipoEcf, total: count() })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, startOfMonth)))
      .groupBy(ecfDocuments.tipoEcf),
  ]);

  // Buscar si hay un downgrade programado via Subscription Schedule
  let pendingPlan: { name: string; effectiveDate: string } | null = null;
  if (team?.stripeCustomerId && team?.stripeSubscriptionId) {
    try {
      const schedules = await stripe.subscriptionSchedules.list({
        customer: team.stripeCustomerId,
      });
      const schedule = schedules.data.find(s => {
        const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
        return subId === team.stripeSubscriptionId && s.status === 'active';
      });
      if (schedule && schedule.phases.length >= 2) {
        const nextPhase   = schedule.phases[schedule.phases.length - 1];
        const nextPriceId = typeof nextPhase.items[0]?.price === 'string'
          ? nextPhase.items[0].price
          : (nextPhase.items[0]?.price as { id: string } | null)?.id ?? '';
        const nextPlanDef = getPlan(
          PLANS.find(p => p.priceEnvKey && process.env[p.priceEnvKey] === nextPriceId)?.key ?? ''
        );
        const endDate = schedule.phases[0]?.end_date;
        if (nextPlanDef.key !== 'free' && endDate) {
          pendingPlan = {
            name:          nextPlanDef.name,
            effectiveDate: new Date(endDate * 1000).toISOString(),
          };
        }
      }
    } catch {
      // Si Stripe falla, continuamos sin info de pending
    }
  }

  // Price IDs para pasar al cliente (leer env vars solo en server)
  const priceIds = Object.fromEntries(
    PLANS.map(p => [p.key, getPlanPriceId(p.key)])
  );

  if (!team) redirect('/sign-in');

  const planName   = team.planName ?? 'Sin plan';
  const planKey    = planName.toLowerCase();
  const subStatus  = team.subscriptionStatus ?? null;
  const isPaid     = ['starter', 'business', 'pro'].includes(planKey);
  const isTrialing = subStatus === 'trialing';
  const limite     = getPlanLimit(planName, subStatus);
  const isIlimitado = limite < 0;
  const usoPct     = isIlimitado ? 0 : limite > 0 ? Math.min(100, Math.round((usadoEsteMes / limite) * 100)) : 100;

  const planDef   = getPlan(planKey);
  const planPrice = planDef.price > 0 ? `$${planDef.price} USD/mes` : 'Gratis';

  const statusLabel: Record<string, { label: string; color: string }> = {
    active:   { label: 'Activa',    color: 'bg-green-100 text-green-700' },
    trialing: { label: '15 días gratis', color: 'bg-blue-100 text-blue-700' },
    canceled: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
    unpaid:   { label: 'Sin pago',  color: 'bg-red-100 text-red-700' },
    past_due: { label: 'Vencida',   color: 'bg-orange-100 text-orange-700' },
  };

  const statusInfo = subStatus
    ? (statusLabel[subStatus] ?? { label: subStatus, color: 'bg-gray-100 text-gray-700' })
    : null;

  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suscripción</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona tu plan y uso mensual de comprobantes.</p>
      </div>

      {/* Dev switcher */}
      <PlanSwitcher currentPlan={planKey} />

      {/* Plan actual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-teal-600" />
            Plan actual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900">{planName}</span>
              {statusInfo && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>
            {isPaid && (
              <span className="text-lg font-semibold text-gray-700">
                {isTrialing ? `Gratis → ${planPrice}` : planPrice}
              </span>
            )}
          </div>

          {team.stripeSubscriptionId && (
            <p className="text-xs text-gray-400">
              ID suscripción: <span className="font-mono">{team.stripeSubscriptionId}</span>
            </p>
          )}

          {/* Barra de uso */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Comprobantes este mes
              </span>
              <span className={`font-semibold ${!isIlimitado && usoPct >= 90 ? 'text-red-600' : 'text-gray-900'}`}>
                {usadoEsteMes} {isIlimitado ? '/ ∞' : `/ ${isTrialing ? '30 (trial)' : limite}`}
              </span>
            </div>
            {isIlimitado ? (
              <div className="w-full bg-teal-100 rounded-full h-2">
                <div className="h-2 rounded-full bg-teal-400 w-full opacity-40" />
              </div>
            ) : (
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usoPct >= 90 ? 'bg-red-500' : usoPct >= 70 ? 'bg-orange-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${usoPct}%` }}
                />
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {isIlimitado
                ? 'Comprobantes ilimitados en tu plan.'
                : limite > 0 && usadoEsteMes < limite
                  ? `Quedan ${limite - usadoEsteMes} comprobantes disponibles este mes.`
                  : 'Has alcanzado el límite mensual de tu plan.'}
            </p>
          </div>

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            {isPaid && team.stripeCustomerId ? (
              <form action={customerPortalAction}>
                <Button type="submit" variant="outline" className="border-teal-600 text-teal-700 hover:bg-teal-50">
                  Gestionar suscripción
                </Button>
              </form>
            ) : (
              <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
                <Link href="/pricing">
                  <Zap className="h-4 w-4 mr-2" />
                  Ver planes — desde $15/mes
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cambiar plan — solo si hay suscripción activa en Stripe */}
      {isPaid && team.stripeSubscriptionId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-600" />
              Cambiar plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePlan
              plans={PLANS}
              currentPlan={planDef}
              priceIds={priceIds}
              pendingPlan={pendingPlan}
            />
          </CardContent>
        </Card>
      )}

      {/* Tabla comparativa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparativa de planes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {[
              { feature: 'Comprobantes/mes', starter: '200',    business: '800',    pro: 'Ilimitados' },
              { feature: 'Usuarios',          starter: '1',      business: '3',      pro: 'Ilimitados' },
              { feature: 'Facturas e-CF',     starter: '✓',      business: '✓',      pro: '✓' },
              { feature: 'Clientes y prods.', starter: '—',      business: '✓',      pro: '✓' },
              { feature: 'Cotizaciones',      starter: '—',      business: '✓',      pro: '✓' },
              { feature: 'Reportes DGII',     starter: '—',      business: '✓',      pro: '✓' },
              { feature: 'API REST',          starter: '—',      business: '—',      pro: '✓' },
              { feature: 'Webhooks',          starter: '—',      business: '—',      pro: '✓' },
              { feature: 'Precio/mes',        starter: '$15',    business: '$35',    pro: '$65' },
            ].map((row) => (
              <div key={row.feature} className="flex items-center py-2.5 text-sm">
                <span className="flex-1 text-gray-600">{row.feature}</span>
                <span className={`w-20 text-center text-xs ${planKey === 'starter'  ? 'font-semibold text-teal-700' : 'text-gray-400'}`}>{row.starter}</span>
                <span className={`w-20 text-center text-xs ${planKey === 'business' ? 'font-semibold text-teal-700' : 'text-gray-400'}`}>{row.business}</span>
                <span className={`w-20 text-center text-xs ${planKey === 'pro'      ? 'font-semibold text-teal-700' : 'text-gray-400'}`}>{row.pro}</span>
              </div>
            ))}
          </div>
          <div className="flex text-xs text-gray-400 mt-1 border-t pt-2">
            <span className="flex-1" />
            <span className="w-20 text-center font-medium">Starter</span>
            <span className="w-20 text-center font-medium">Business</span>
            <span className="w-20 text-center font-medium">Pro</span>
          </div>
        </CardContent>
      </Card>

      {/* Uso por tipo */}
      {usagePorTipo.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Uso por tipo este mes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {usagePorTipo.map(u => (
                <div key={u.tipoEcf} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{TIPOS_ECF[u.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${u.tipoEcf}`}</span>
                  <span className="font-medium text-gray-900">{u.total}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerta límite */}
      {!isIlimitado && limite > 0 && usadoEsteMes >= limite && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Has alcanzado el límite de {isTrialing ? '30 (trial)' : limite} comprobantes
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {planKey === 'pro' ? 'Contacta soporte para un plan Enterprise.' : 'Actualiza tu plan para emitir más comprobantes.'}
            </p>
            {planKey !== 'pro' && (
              <Link href="/pricing" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-700 underline">
                <Zap className="h-3 w-3" />Ver planes →
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
