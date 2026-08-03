import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getModuleRows } from '@/lib/payments/module-subscriptions';
import { MODULES, type ModuleKey } from '@/lib/config/modules';
import { PricingClient, type ModuleState } from './_pricing-client';

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
  const { welcome, new_company } = await searchParams;
  const isNew = welcome === '1' || new_company === '1';

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/onboarding/negocio');

  const rows = await getModuleRows(teamId);
  const current = Object.fromEntries(
    MODULES.map(m => {
      const row = rows.find(r => r.modulo === m);
      return [m, { status: row?.status ?? null, tier: row?.tier ?? null } as ModuleState];
    }),
  ) as Record<ModuleKey, ModuleState>;

  return (
    <Box component="main">
      <SiteHeader />
      <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 5, sm: 8 } }}>
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', mb: 1.5 }}>Módulos y precios</Typography>
          <Typography sx={{ color: '#6b7280', fontSize: '1.0625rem' }}>
            Activa solo lo que necesitas. Precios en USD. 15 días de prueba gratis por módulo, sin tarjeta.
          </Typography>
        </Box>

        <PricingClient current={current} isNew={isNew} />
      </Box>
    </Box>
  );
}
