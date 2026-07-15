import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  FileText, Plus, Hash, AlertTriangle, TrendingUp, Package, Users,
} from 'lucide-react';
import { getTeamIdForUser, getDashboardStats, getEcfDocuments, getCuentasPorCobrar } from '@/lib/db/queries';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';

const ESTADO_CHIP: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' | 'primary' | 'secondary'; variant?: 'filled' | 'outlined' }> = {
  ACEPTADO:             { label: 'Aceptado',    color: 'success'  },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', color: 'warning'  },
  EN_PROCESO:           { label: 'En proceso',  color: 'info',    variant: 'outlined' },
  RECHAZADO:            { label: 'Rechazado',   color: 'error'    },
  BORRADOR:             { label: 'Sin comprobante', color: 'default', variant: 'outlined' },
  ANULADO:              { label: 'Anulado',     color: 'default'  },
};

export default async function DashboardPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [stats, recentDocs, ar] = await Promise.all([
    getDashboardStats(teamId),
    getEcfDocuments(teamId, 5),
    getCuentasPorCobrar(teamId),
  ]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Panel Principal
          </Typography>
          {stats.rnc && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
              RNC: {stats.rnc}
            </Typography>
          )}
        </Box>
        <Link href="/dashboard/facturas/nueva" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
          <MuiButton
            variant="contained"
            color="primary"
            disableElevation
            startIcon={<Plus style={{ width: 16, height: 16 }} />}
            sx={{ borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Nueva Factura
          </MuiButton>
        </Link>
      </Box>

      <OnboardingChecklist />

      {/* Alert: no sequences */}
      {stats.secuenciasDisponibles === 0 && (
        <Alert
          severity="error"
          sx={{ borderRadius: '12px', mb: 2.5 }}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        >
          <AlertTitle sx={{ fontWeight: 600 }}>Sin secuencias disponibles</AlertTitle>
          Solicita nuevas secuencias en la Oficina Virtual de la DGII y regístralas en{' '}
          <Box
            component="a"
            href="/dashboard/secuencias"
            sx={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}
          >
            Secuencias NCF
          </Box>
          .
        </Alert>
      )}

      {/* Alert: overdue AR */}
      {ar.totales.countVencidas > 0 && (
        <Link href="/dashboard/cuentas-por-cobrar" style={{ textDecoration: 'none', display: 'block', marginBottom: '20px' }}>
          <Alert
            severity="warning"
            sx={{ borderRadius: '12px', cursor: 'pointer', '&:hover': { opacity: 0.9 } }}
            icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
          >
            <AlertTitle sx={{ fontWeight: 600 }}>
              {ar.totales.countVencidas} factura{ar.totales.countVencidas !== 1 ? 's' : ''} vencida{ar.totales.countVencidas !== 1 ? 's' : ''}
            </AlertTitle>
            RD${(ar.totales.vencido / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })} pendiente de cobro vencido · Ver cuentas por cobrar →
          </Alert>
        </Link>
      )}

      {/* Stats grid */}
      <Box
        sx={{
          display:             'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(3, 1fr)' },
          gap:                 2,
          mb:                  3,
        }}
      >
        {[
          {
            label: 'Ingresos del mes',
            icon:  TrendingUp,
            value: `RD$${(stats.montoMesCentavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
            sub:   `${stats.facturasMes} comprobante${stats.facturasMes !== 1 ? 's' : ''}`,
            color: '#0d9488',
            bg:    '#f0fdfa',
          },
          {
            label: 'Total histórico',
            icon:  FileText,
            value: stats.facturasTotal.toLocaleString('es-DO'),
            sub:   'documentos e-CF',
            color: '#7c3aed',
            bg:    '#faf5ff',
          },
          {
            label: 'Secuencias',
            icon:  Hash,
            value: stats.secuenciasDisponibles.toLocaleString('es-DO'),
            sub:   'disponibles',
            color: '#0369a1',
            bg:    '#f0f9ff',
          },
        ].map(stat => (
          <Card
            key={stat.label}
            elevation={0}
            sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stat.label}
                </Typography>
                <Box
                  sx={{
                    width:          32,
                    height:         32,
                    borderRadius:   '8px',
                    bgcolor:        stat.bg,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}
                >
                  <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
                {stat.value}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                {stat.sub}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Recent invoices */}
      <Card
        elevation={0}
        sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 3, overflow: 'hidden' }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Últimos comprobantes
          </Typography>
          <Link href="/dashboard/facturas" style={{ textDecoration: 'none' }}>
            <MuiButton
              variant="text"
              size="small"
              sx={{ color: 'primary.main', fontWeight: 600 }}
            >
              Ver todos →
            </MuiButton>
          </Link>
        </Box>
        <Divider />

        {recentDocs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Box sx={{ width: 48, height: 48, bgcolor: 'grey.100', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <FileText style={{ width: 24, height: 24, color: '#9ca3af' }} />
            </Box>
            <Typography variant="body2" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
              Aún no has emitido comprobantes
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
              Emite tu primer comprobante electrónico fiscal
            </Typography>
            <Link href="/dashboard/facturas/nueva" style={{ textDecoration: 'none' }}>
              <MuiButton
                variant="contained"
                color="primary"
                disableElevation
                size="small"
                startIcon={<Plus style={{ width: 14, height: 14 }} />}
                sx={{ borderRadius: '8px' }}
              >
                Emitir primer comprobante
              </MuiButton>
            </Link>
          </Box>
        ) : (
          <Box>
            {recentDocs.map((doc, i) => {
              const chip = ESTADO_CHIP[doc.estado] ?? { label: doc.estado, color: 'default' as const };
              return (
                <Link
                  key={doc.id}
                  href={`/dashboard/facturas/${doc.id}`}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <Box
                    sx={{
                      display:        'flex',
                      alignItems:     'center',
                      px:             3,
                      py:             1.75,
                      borderBottom:   i < recentDocs.length - 1 ? '1px solid #f3f4f6' : 'none',
                      transition:     'background-color 0.15s',
                      '&:hover':      { bgcolor: 'grey.50' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {doc.encf}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block' }}>
                        {TIPOS_ECF[doc.tipoEcf as keyof typeof TIPOS_ECF] ?? doc.tipoEcf}
                        {doc.razonSocialComprador && ` · ${doc.razonSocialComprador}`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 2, flexShrink: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        RD${(doc.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </Typography>
                      <Chip
                        label={chip.label}
                        color={chip.color}
                        variant={chip.variant ?? 'filled'}
                        size="small"
                        sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }}
                      />
                    </Box>
                  </Box>
                </Link>
              );
            })}
          </Box>
        )}
      </Card>

      {/* Quick actions */}
      <Box
        sx={{
          display:             'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap:                 1.5,
        }}
      >
        {[
          { href: '/dashboard/facturas/nueva', icon: Plus,    label: 'Nueva Factura', primary: true  },
          { href: '/dashboard/clientes',       icon: Users,   label: 'Contactos',     primary: false },
          { href: '/dashboard/productos',      icon: Package, label: 'Productos',     primary: false },
          { href: '/dashboard/secuencias',     icon: Hash,    label: 'Secuencias',    primary: false },
        ].map(action => (
          <Link key={action.href} href={action.href} style={{ textDecoration: 'none' }}>
            <Paper
              elevation={0}
              sx={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            1,
                p:              2,
                borderRadius:   '12px',
                border:         '1px solid',
                borderColor:    action.primary ? 'primary.main' : 'divider',
                bgcolor:        action.primary ? 'primary.main' : 'background.paper',
                color:          action.primary ? '#fff' : 'text.primary',
                cursor:         'pointer',
                transition:     'all 0.15s',
                '&:hover': {
                  bgcolor:     action.primary ? 'primary.dark' : 'grey.50',
                  borderColor: action.primary ? 'primary.dark' : 'grey.300',
                  transform:   'translateY(-1px)',
                  boxShadow:   action.primary
                    ? '0 4px 12px rgba(13,148,136,0.3)'
                    : '0 2px 8px rgba(0,0,0,0.08)',
                },
              }}
            >
              <action.icon style={{ width: 20, height: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {action.label}
              </Typography>
            </Paper>
          </Link>
        ))}
      </Box>
    </Box>
  );
}
