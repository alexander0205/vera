import { notFound, redirect } from 'next/navigation';
import { BILLING_ENABLED } from '@/lib/config/billing';
import Link from 'next/link';
import { CreditCard, Zap, AlertCircle, TrendingUp } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
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
  // Producto en desarrollo: planes y suscripción no se le muestran al usuario;
  // los módulos y límites los administramos desde /admin. Ver lib/config/billing.
  if (!BILLING_ENABLED) notFound();

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

  const statusLabel: Record<string, { label: string; bgcolor: string; color: string }> = {
    active:   { label: 'Activa',         bgcolor: '#ecfdf5', color: '#065f46' },
    trialing: { label: '15 días gratis', bgcolor: '#eff6ff', color: '#1e40af' },
    canceled: { label: 'Cancelada',      bgcolor: '#fef2f2', color: '#991b1b' },
    unpaid:   { label: 'Sin pago',       bgcolor: '#fef2f2', color: '#991b1b' },
    past_due: { label: 'Vencida',        bgcolor: '#fff7ed', color: '#9a3412' },
  };

  const statusInfo = subStatus
    ? (statusLabel[subStatus] ?? { label: subStatus, bgcolor: '#f3f4f6', color: '#374151' })
    : null;

  const COMPARE_ROWS = [
    { feature: 'Comprobantes/mes', starter: '200',      business: '800',      pro: 'Ilimitados' },
    { feature: 'Usuarios',          starter: '1',        business: '3',        pro: 'Ilimitados' },
    { feature: 'Facturas e-CF',     starter: '✓',        business: '✓',        pro: '✓' },
    { feature: 'Clientes y prods.', starter: '—',        business: '✓',        pro: '✓' },
    { feature: 'Cotizaciones',      starter: '—',        business: '✓',        pro: '✓' },
    { feature: 'Reportes DGII',     starter: '—',        business: '✓',        pro: '✓' },
    { feature: 'API REST',          starter: '—',        business: '—',        pro: '✓' },
    { feature: 'Webhooks',          starter: '—',        business: '—',        pro: '✓' },
    { feature: 'Precio/mes',        starter: '$15',      business: '$35',      pro: '$65' },
  ];

  return (
    // mx auto: con la columna de 800px anclada a la izquierda quedaba medio
    // viewport vacío en pantallas anchas. Centrada se lee como página de ajustes.
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Suscripción
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Gestiona tu plan y uso mensual de comprobantes.
        </Typography>
      </Box>

      {/* Dev switcher */}
      <PlanSwitcher currentPlan={planKey} />

      {/* Plan actual */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CreditCard style={{ width: 16, height: 16, color: '#0d9488' }} />
            Plan actual
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>{planName}</Typography>
              {statusInfo && (
                <Chip
                  label={statusInfo.label}
                  size="small"
                  sx={{ bgcolor: statusInfo.bgcolor, color: statusInfo.color, fontWeight: 600, height: 22, fontSize: '0.6875rem', '& .MuiChip-label': { px: 1.25 } }}
                />
              )}
            </Box>
            {isPaid && (
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {isTrialing ? `Gratis → ${planPrice}` : planPrice}
              </Typography>
            )}
          </Box>

          {team.stripeSubscriptionId && (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              ID suscripción: <Box component="span" sx={{ fontFamily: 'monospace' }}>{team.stripeSubscriptionId}</Box>
            </Typography>
          )}

          {/* Barra de uso */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingUp style={{ width: 14, height: 14 }} />
                Comprobantes este mes
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: !isIlimitado && usoPct >= 90 ? 'error.main' : 'text.primary' }}>
                {usadoEsteMes} {isIlimitado ? '/ ∞' : `/ ${isTrialing ? '30 (trial)' : limite}`}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={isIlimitado ? 40 : usoPct}
              sx={{
                height: 8, borderRadius: 4, bgcolor: 'grey.100',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  bgcolor: isIlimitado ? '#0d9488' : usoPct >= 90 ? 'error.main' : usoPct >= 70 ? 'warning.main' : '#0d9488',
                  opacity: isIlimitado ? 0.4 : 1,
                },
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
              {isIlimitado
                ? 'Comprobantes ilimitados en tu plan.'
                : limite > 0 && usadoEsteMes < limite
                  ? `Quedan ${limite - usadoEsteMes} comprobantes disponibles este mes.`
                  : 'Has alcanzado el límite mensual de tu plan.'}
            </Typography>
          </Box>

          {/* Acciones */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {isPaid && team.stripeCustomerId ? (
              <form action={customerPortalAction}>
                <MuiButton type="submit" variant="outlined" color="primary"
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                  Gestionar suscripción
                </MuiButton>
              </form>
            ) : (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <MuiButton variant="contained" color="primary" disableElevation
                  startIcon={<Zap style={{ width: 16, height: 16 }} />}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                  Ver planes — desde $15/mes
                </MuiButton>
              </Link>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Cambiar plan */}
      {isPaid && team.stripeSubscriptionId && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '20px !important' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TrendingUp style={{ width: 16, height: 16, color: '#0d9488' }} />
              Cambiar plan
            </Typography>
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
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
            Comparativa de planes
          </Typography>
          {/* Header */}
          <Box sx={{ display: 'flex', mb: 0.5 }}>
            <Box sx={{ flex: 1 }} />
            {['Starter', 'Business', 'Pro'].map((col, i) => (
              <Typography key={col} variant="caption" sx={{ width: 80, textAlign: 'center', fontWeight: 700, color: ['starter', 'business', 'pro'][i] === planKey ? 'primary.main' : 'text.secondary' }}>
                {col}
              </Typography>
            ))}
          </Box>
          <Divider />
          {COMPARE_ROWS.map((row, i) => (
            <Box key={row.feature}>
              <Box sx={{ display: 'flex', alignItems: 'center', py: 1.25 }}>
                <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>{row.feature}</Typography>
                {(['starter', 'business', 'pro'] as const).map(col => (
                  <Typography key={col} variant="caption" sx={{ width: 80, textAlign: 'center', fontWeight: col === planKey ? 700 : 400, color: col === planKey ? 'primary.main' : 'text.secondary' }}>
                    {row[col]}
                  </Typography>
                ))}
              </Box>
              {i < COMPARE_ROWS.length - 1 && <Divider />}
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Uso por tipo */}
      {usagePorTipo.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Uso por tipo este mes
            </Typography>
            {usagePorTipo.map(u => (
              <Box key={u.tipoEcf} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {TIPOS_ECF[u.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${u.tipoEcf}`}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>{u.total}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alerta límite */}
      {!isIlimitado && limite > 0 && usadoEsteMes >= limite && (
        <Alert
          severity="error"
          icon={<AlertCircle style={{ width: 18, height: 18 }} />}
          sx={{ borderRadius: '12px' }}
          action={planKey !== 'pro' ? (
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <MuiButton size="small" color="error" startIcon={<Zap style={{ width: 12, height: 12 }} />}
                sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Ver planes →
              </MuiButton>
            </Link>
          ) : undefined}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Has alcanzado el límite de {isTrialing ? '30 (trial)' : limite} comprobantes
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
            {planKey === 'pro' ? 'Contacta soporte para un plan Enterprise.' : 'Actualiza tu plan para emitir más comprobantes.'}
          </Typography>
        </Alert>
      )}
    </Box>
  );
}
