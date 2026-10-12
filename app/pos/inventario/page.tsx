import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { InventarioPageClient } from '@/app/(dashboard)/dashboard/inventario/_page-client';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getTurnoAbierto } from '@/lib/caja/core';
import { getTerminal } from '@/lib/pos/terminales';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventario — Zero POS' };

/**
 * Inventario (movimientos de stock) dentro del módulo POS. Misma pantalla y
 * mismas tablas que Facturación — no se duplica nada.
 *
 * La diferencia es el alcance: acá se muestra SOLO el almacén de la terminal
 * donde el cajero tiene el turno abierto. Es el mismo almacén con el que ya se
 * arma el catálogo de venta, así que lo que ve en la grilla y lo que ve en el
 * inventario coinciden.
 *
 * Sin turno abierto no hay terminal, y por lo tanto no hay almacén que fijar:
 * se cae al comportamiento de Facturación (todos los movimientos).
 */
export default async function PosInventarioPage() {
  await requirePermission('productos:ver');
  await requireModule('pos', '/dashboard');

  const user   = await getUser();
  const teamId = await getTeamIdForUser();

  let almacenId: number | null = null;
  if (user && teamId) {
    const turno = await getTurnoAbierto(teamId, user.id);
    if (turno?.terminalId) {
      const terminal = await getTerminal(teamId, turno.terminalId);
      almacenId = terminal?.almacenId ?? null;
    }
  }

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <InventarioPageClient almacenId={almacenId} />
    </Box>
  );
}
