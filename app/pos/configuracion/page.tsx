import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MonitorSmartphone, Warehouse, Tags, CreditCard, Users, Percent } from 'lucide-react';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configuración — Zero POS' };

// Cards de configuración del POS (estilo Alegra). Las entidades compartidas
// (almacenes, listas, métodos) viven en Facturación; terminales es propia del POS.
const CARDS = [
  { href: '/pos/terminales',              title: 'Terminales',      desc: 'Cajas físicas: almacén, impresora, lista y comprobante por defecto.', icon: MonitorSmartphone },
  { href: '/dashboard/almacenes',         title: 'Almacenes',       desc: 'Depósitos desde donde vende y descuenta stock cada terminal.',        icon: Warehouse },
  { href: '/dashboard/listas-precios',    title: 'Listas de precios', desc: 'Precios alternativos aplicables por terminal o cliente.',           icon: Tags },
  { href: '/dashboard/configuracion',     title: 'Métodos de pago', desc: 'Formas de cobro y cuáles obligan emisión a la DGII.',                icon: CreditCard },
  { href: '/dashboard/vendedores',        title: 'Vendedores',      desc: 'Personas que atienden y quedan registradas en cada venta.',          icon: Users },
  { href: '/dashboard/configuracion',     title: 'Impuestos',       desc: 'ITBIS y tasas aplicadas a los productos del catálogo.',              icon: Percent },
];

export default async function PosConfiguracionPage() {
  await requirePermission('pos:configurar');
  await requireModule('pos', '/dashboard');

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Configuración del punto de venta</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 3 }}>
        Ajusta terminales, almacenes, precios y métodos de pago de tu POS.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
        {CARDS.map(c => (
          <Link key={c.title} href={c.href} style={{ textDecoration: 'none' }}>
            <Box
              sx={{
                display: 'flex', flexDirection: 'column', gap: 1, p: 2.5, borderRadius: '14px',
                border: '1px solid #e5e7eb', bgcolor: '#fff', height: '100%',
                transition: 'all 0.15s', '&:hover': { borderColor: '#2dd4bf', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
              }}
            >
              <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <c.icon style={{ width: 22, height: 22, color: '#0d9488' }} />
              </Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', mt: 0.5 }}>{c.title}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{c.desc}</Typography>
            </Box>
          </Link>
        ))}
      </Box>
    </Box>
  );
}
