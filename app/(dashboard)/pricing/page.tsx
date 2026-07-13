import { checkoutAction } from '@/lib/payments/actions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { Check, AlertCircle } from 'lucide-react';
import { SubmitButton } from './submit-button';
import { PLANS, getPlanPriceId, type PlanDef } from '@/lib/config/plans';
import { SiteHeader } from '@/components/site-header';
import Link from 'next/link';

export default function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; welcome?: string; new_company?: string }>;
}) {
  return <PricingPageInner searchParams={searchParams} />;
}

async function PricingPageInner({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; welcome?: string; new_company?: string }>;
}) {
  const { reason, welcome, new_company } = await searchParams;
  const noPlan       = reason === 'no-plan';
  const isNew        = welcome === '1';
  const isNewCompany = new_company === '1';

  return (
    <Box component="main">
      <SiteHeader />
      <Box sx={{ maxWidth: 1152, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 8 }}>

        {isNewCompany && (
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', px: 2.5, py: 2 }}>
            <Typography sx={{ fontSize: '1.5rem' }}>🏢</Typography>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>Empresa creada — elige su plan</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#1d4ed8', mt: 0.25 }}>
                Cada empresa tiene su propio plan. Todos incluyen <strong>15 días de prueba gratis</strong>.
              </Typography>
            </Box>
          </Box>
        )}

        {isNew && (
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '12px', px: 2.5, py: 2 }}>
            <Typography sx={{ fontSize: '1.5rem' }}>🎉</Typography>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f766e' }}>¡Cuenta creada! Elige tu plan para empezar</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#0d9488', mt: 0.25 }}>
                Todos los planes incluyen <strong>15 días de prueba gratis</strong>. Cancela cuando quieras.
              </Typography>
            </Box>
          </Box>
        )}

        {noPlan && (
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', px: 2.5, py: 2 }}>
            <AlertCircle size={20} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>Necesitas un plan para acceder al dashboard</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#b45309', mt: 0.25 }}>Elige un plan y empieza con 15 días de prueba gratis.</Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>Planes y precios</Typography>
          <Typography sx={{ color: '#6b7280', fontSize: '1.125rem' }}>
            Precios en dólares (USD). Prueba 15 días gratis. Sin contratos. Cancela cuando quieras.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
          {PLANS.map(plan => <PricingCard key={plan.key} plan={plan} />)}
        </Box>

        <Box sx={{ textAlign: 'center', mt: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            ✓ 15 días de prueba gratis en todos los planes — sin tarjeta de crédito
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            ¿Necesitas más de 800 comprobantes o integración personalizada?{' '}
            <Box component="a" href="mailto:hola@emitedo.com" sx={{ color: '#0d9488', textDecoration: 'underline' }}>Contáctanos</Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function PricingCard({ plan }: { plan: PlanDef }) {
  const priceId  = getPlanPriceId(plan.key);
  const destacado = plan.ui.highlighted;

  return (
    <Box sx={{
      position: 'relative', display: 'flex', flexDirection: 'column', p: 4,
      borderRadius: '16px', border: '1px solid',
      ...(destacado
        ? { borderColor: '#0d9488', bgcolor: '#0d9488', color: '#fff', boxShadow: '0 20px 40px rgba(13,148,136,0.3)' }
        : { borderColor: '#e5e7eb', bgcolor: '#fff' }),
    }}>
      {destacado && (
        <Box sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', bgcolor: '#f97316', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '99px', whiteSpace: 'nowrap' }}>
          Más popular
        </Box>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 0.5, color: destacado ? '#fff' : '#111827' }}>{plan.name}</Typography>
        <Typography sx={{ fontSize: '0.875rem', mb: 2, color: destacado ? '#ccfbf1' : '#6b7280' }}>{plan.ui.description}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography sx={{ fontSize: '2.25rem', fontWeight: 700, color: destacado ? '#fff' : '#111827' }}>${plan.price}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: destacado ? '#ccfbf1' : '#6b7280' }}>USD/mes</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.75rem', mt: 0.5, color: destacado ? '#ccfbf1' : '#9ca3af' }}>
          15 días gratis, luego ${plan.price}/mes
        </Typography>
      </Box>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4, flex: 1 }}>
        {plan.ui.marketingFeatures.map((feature, i) => (
          <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Check size={16} color={destacado ? '#ccfbf1' : '#0d9488'} style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.875rem', color: destacado ? '#f0fdfa' : '#4b5563' }}>{feature}</Typography>
          </Box>
        ))}
      </Box>

      {priceId ? (
        <form action={checkoutAction}>
          <input type="hidden" name="priceId" value={priceId} />
          <SubmitButton destacado={destacado} label="Empezar prueba gratis" />
        </form>
      ) : (
        <Link href="/sign-up" style={{ textDecoration: 'none' }}>
          <Box sx={{
            display: 'block', textAlign: 'center', py: 1.25, px: 2, borderRadius: '99px', fontSize: '0.875rem', fontWeight: 500, transition: 'background 0.15s',
            ...(destacado
              ? { bgcolor: '#fff', color: '#0f766e', '&:hover': { bgcolor: '#f0fdfa' } }
              : { bgcolor: '#0d9488', color: '#fff', '&:hover': { bgcolor: '#0f766e' } }),
          }}>
            Empezar prueba gratis
          </Box>
        </Link>
      )}
    </Box>
  );
}
