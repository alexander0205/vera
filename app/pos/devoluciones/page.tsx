import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Undo2 } from 'lucide-react';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devoluciones — Zero POS' };

/** Devoluciones del POS. La lógica de restauración de inventario existe
 *  (lib/inventario/devolucion.ts); la UI de dos vías (devolución de dinero /
 *  crédito a factura, como Alegra) llega en una próxima iteración. */
export default async function PosDevolucionesPage() {
  await requirePermission('pos:vender');
  await requireModule('pos', '/dashboard');

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Box sx={{ maxWidth: 460, textAlign: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '18px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Undo2 style={{ width: 30, height: 30, color: '#0d9488' }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>Devoluciones</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Pronto podrás registrar devoluciones desde el POS en dos vías:
          <b> devolución de dinero</b> (sale de la caja) o <b>crédito a factura</b>
          {' '}(nota de crédito). Mientras tanto, las notas de crédito se gestionan
          desde el módulo de Facturación.
        </Typography>
      </Box>
    </Box>
  );
}
