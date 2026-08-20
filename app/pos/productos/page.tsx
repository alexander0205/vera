import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import ProductosPage from '@/app/(dashboard)/dashboard/productos/_page-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Productos y servicios — Zero POS' };

/**
 * El catálogo de la caja.
 *
 * Es la MISMA pantalla de Facturación con un filtro fijo: solo los ítems
 * marcados como Punto de venta. No se duplica nada — misma tabla, mismo
 * formulario, mismos permisos.
 *
 * Faltaba, y se notaba: dentro del POS lo único que había era «Inventario»,
 * que muestra movimientos de stock y por eso sale vacía en un colegio que
 * vende servicios. Quien quería ver o crear lo que se despacha en el mostrador
 * tenía que salirse al módulo de Facturación, donde además le aparecían las
 * mensualidades y las matrículas mezcladas con la merienda.
 *
 * El filtro NO es cambiable a propósito: quien entra por el POS quiere el
 * catálogo del POS. Para ver todo está la pantalla de Facturación.
 */
export default async function PosProductosPage() {
  await requirePermission('productos:ver');
  await requireModule('pos', '/dashboard');

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <ProductosPage canal="pos" />
    </Box>
  );
}
