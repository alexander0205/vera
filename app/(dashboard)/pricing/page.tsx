import { notFound } from 'next/navigation';
import { checkoutAction } from '@/lib/payments/actions';
import { BILLING_ENABLED } from '@/lib/config/billing';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AlertCircle } from 'lucide-react';
import {
  PLANS, LINEAS_PRODUCTO, planesDeLinea, getPlanPriceId,
} from '@/lib/config/plans';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';
import { SiteHeader } from '@/components/site-header';
import { Lineas, type PlanDeLinea } from './_lineas';

export default function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; welcome?: string; new_company?: string }>;
}) {
  // Producto en desarrollo: no se le muestra pricing a nadie. Ver lib/config/billing.
  if (!BILLING_ENABLED) notFound();
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

  // Los precios y los priceId se resuelven AQUÍ, en el servidor: getPlanPriceId
  // lee process.env, que en el cliente no existe. Antes cada tarjeta lo pedía
  // por su cuenta y por eso la parrilla tenía que ser un Server Component.
  const porLinea: Record<string, PlanDeLinea[]> = Object.fromEntries(
    LINEAS_PRODUCTO.map(linea => [
      linea.key,
      planesDeLinea(linea.key).map(({ plan, precio }) => ({
        plan, precio, priceId: getPlanPriceId(plan.key),
      })),
    ]),
  );

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
                Cada empresa tiene su propio plan. Todos incluyen <strong>prueba gratis</strong>: {diasDePrueba('ecf')} días en facturación y {diasDePrueba('colegio')} en colegios.
              </Typography>
            </Box>
          </Box>
        )}

        {isNew && (
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eef2fe', border: '1px solid #c7d2fc', borderRadius: '12px', px: 2.5, py: 2 }}>
            <Typography sx={{ fontSize: '1.5rem' }}>🎉</Typography>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#2a45c4' }}>¡Cuenta creada! Elige tu plan para empezar</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#3658e1', mt: 0.25 }}>
                Todos los planes incluyen <strong>prueba gratis</strong> — {diasDePrueba('ecf')} días en facturación, {diasDePrueba('colegio')} en colegios. Cancela cuando quieras.
              </Typography>
            </Box>
          </Box>
        )}

        {noPlan && (
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', px: 2.5, py: 2 }}>
            <AlertCircle size={20} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>Necesitas un plan para acceder al dashboard</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#b45309', mt: 0.25 }}>Elige un plan y empieza con tu prueba gratis: {diasDePrueba('ecf')} días en facturación, {diasDePrueba('colegio')} en colegios.</Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>Planes y precios</Typography>
          <Typography sx={{ color: '#6b7280', fontSize: '1.125rem' }}>
            Precios en dólares (USD). Prueba gratis de {diasDePrueba('ecf')} días, {diasDePrueba('colegio')} en colegios. Sin contratos. Cancela cuando quieras.
          </Typography>
        </Box>

        <Lineas porLinea={porLinea} checkoutAction={checkoutAction} />

        <Box sx={{ textAlign: 'center', mt: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            ✓ Prueba gratis en todos los planes: {diasDePrueba('ecf')} días, {diasDePrueba('colegio')} en colegios
            {PRUEBA.pideTarjeta ? '' : ' — sin tarjeta de crédito'}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            ¿Tu colegio pasa de {topeEstudiantesMaximo()} estudiantes, o necesitas una integración a medida?{' '}
            <Box component="a" href="mailto:hola@zero.com.do" sx={{ color: '#3658e1', textDecoration: 'underline' }}>Contáctanos</Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/** El tramo escolar más alto del catálogo. Arriba de ahí se cotiza a mano. */
function topeEstudiantesMaximo(): number {
  return Math.max(...PLANS.map(p => p.limits.estudiantes));
}
