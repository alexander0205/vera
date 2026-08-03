import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Zap, FileText, Store, GraduationCap } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import { getTeamIdForUser } from '@/lib/db/queries';
import {
  getModuleRows,
  getMonthlyFacturadoCents,
  trialDaysLeft,
} from '@/lib/payments/module-subscriptions';
import { MODULES, MODULE_LABELS, MODULE_DESCRIPTIONS, type ModuleKey } from '@/lib/config/modules';
import { getTier, statusGrantsAccess, type ModuleStatus } from '@/lib/config/module-plans';

const ICONS: Record<ModuleKey, React.ComponentType<{ style?: React.CSSProperties }>> = {
  facturacion: FileText,
  pos: Store,
  escolar: GraduationCap,
};

const STATUS_CHIP: Record<string, { label: string; bgcolor: string; color: string }> = {
  active:        { label: 'Activo',        bgcolor: '#ecfdf5', color: '#065f46' },
  trialing:      { label: 'En prueba',     bgcolor: '#eff6ff', color: '#1e40af' },
  past_due:      { label: 'Pago vencido',  bgcolor: '#fff7ed', color: '#9a3412' },
  trial_expired: { label: 'Prueba vencida', bgcolor: '#fef2f2', color: '#991b1b' },
  canceled:      { label: 'Cancelado',     bgcolor: '#fef2f2', color: '#991b1b' },
};

const dop = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });

export default async function SuscripcionPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [rows, facturadoCents] = await Promise.all([
    getModuleRows(teamId),
    getMonthlyFacturadoCents(teamId),
  ]);

  const byModule = new Map(rows.map(r => [r.modulo as ModuleKey, r]));
  const algunoActivo = rows.some(r => statusGrantsAccess(r.status as ModuleStatus));

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Suscripción</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Activa solo los módulos que necesitas. Cada uno se cobra por separado.
          </Typography>
        </Box>
        <Link href="/pricing" style={{ textDecoration: 'none' }}>
          <MuiButton variant={algunoActivo ? 'outlined' : 'contained'} color="primary" disableElevation
            startIcon={<Zap style={{ width: 16, height: 16 }} />}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {algunoActivo ? 'Gestionar módulos' : 'Ver planes'}
          </MuiButton>
        </Link>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {MODULES.map(modulo => {
          const row = byModule.get(modulo);
          const tier = getTier(row?.tier);
          const status = (row?.status as ModuleStatus | undefined) ?? null;
          const activo = statusGrantsAccess(status ?? undefined);
          const chip = status ? STATUS_CHIP[status] : null;
          const dias = row ? trialDaysLeft(row) : null;
          const Icon = ICONS[modulo];

          // Facturación: uso de monto vs tope (DOP) del tier contratado.
          const topeCents = modulo === 'facturacion' ? tier?.topeMontoCents ?? null : null;
          const usoPct = topeCents ? Math.min(100, Math.round((facturadoCents / topeCents) * 100)) : 0;

          return (
            <Card key={modulo} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', opacity: activo ? 1 : 0.85 }}>
              <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Icon style={{ width: 18, height: 18, color: '#0d9488' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {MODULE_LABELS[modulo]}
                      {modulo === 'facturacion' && <Chip label="Base" size="small" sx={{ ml: 1, height: 20, fontSize: '0.6875rem', bgcolor: '#f0fdfa', color: '#0f766e' }} />}
                    </Typography>
                    {chip && (
                      <Chip label={chip.label} size="small"
                        sx={{ bgcolor: chip.bgcolor, color: chip.color, fontWeight: 600, height: 22, fontSize: '0.6875rem', '& .MuiChip-label': { px: 1.25 } }} />
                    )}
                  </Box>
                  {tier && activo && (
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      ${tier.price} <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 400, color: 'text.secondary' }}>USD/mes</Box>
                    </Typography>
                  )}
                </Box>

                {activo && tier ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {tier.label}
                    {status === 'trialing' && dias != null && ` — quedan ${dias} día${dias === 1 ? '' : 's'} de prueba`}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {MODULE_DESCRIPTIONS[modulo]}
                  </Typography>
                )}

                {/* Facturación: barra de uso por monto facturado del mes */}
                {activo && topeCents && (
                  <Box sx={{ mt: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Facturado este mes</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: usoPct >= 90 ? 'error.main' : 'text.primary' }}>
                        {dop.format(facturadoCents / 100)} / {dop.format(topeCents / 100)}
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={usoPct}
                      sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.100',
                        '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: usoPct >= 90 ? 'error.main' : usoPct >= 70 ? 'warning.main' : '#0d9488' } }} />
                  </Box>
                )}

                {/* CTA por módulo cuando no está activo */}
                {!activo && (
                  <Box>
                    <Link href="/pricing" style={{ textDecoration: 'none' }}>
                      <MuiButton size="small" variant="outlined" color="primary"
                        startIcon={<CreditCard style={{ width: 14, height: 14 }} />}
                        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                        {status === 'trial_expired' || status === 'canceled' ? 'Reactivar' : 'Activar módulo'}
                      </MuiButton>
                    </Link>
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
