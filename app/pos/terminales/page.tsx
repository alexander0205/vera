import { redirect } from 'next/navigation';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { almacenes, impresoras, listasPrecios } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { listarTerminales } from '@/lib/pos/terminales';
import Box from '@mui/material/Box';
import TerminalesClient from '@/app/(dashboard)/dashboard/pos-terminales/_page-client';

export const dynamic = 'force-dynamic';

/**
 * Terminales DENTRO del módulo POS (no en el shell de Facturación). Reusa el
 * mismo TerminalesClient, pero renderiza bajo app/pos/layout (con PosNavRail),
 * así configurar terminales no te saca del punto de venta.
 */
export default async function PosTerminalesPage() {
  await requirePermission('pos:configurar');
  await requireModule('pos', '/dashboard');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const [terminales, alms, imps, listas] = await Promise.all([
    listarTerminales(teamId),
    db.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes).where(eq(almacenes.teamId, teamId)).orderBy(asc(almacenes.nombre)),
    db.select({ id: impresoras.id, nombre: impresoras.nombre }).from(impresoras).where(eq(impresoras.teamId, teamId)).orderBy(asc(impresoras.nombre)),
    db.select({ id: listasPrecios.id, nombre: listasPrecios.nombre }).from(listasPrecios).where(eq(listasPrecios.teamId, teamId)).orderBy(asc(listasPrecios.nombre)),
  ]);

  // El POS layout no tiene scroll propio en su columna; envolvemos para que la
  // gestión de terminales scrollee dentro del área de contenido del POS.
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <TerminalesClient
        terminalesIniciales={terminales}
        almacenes={alms}
        impresoras={imps}
        listas={listas}
      />
    </Box>
  );
}
