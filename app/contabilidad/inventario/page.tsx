import { redirect } from 'next/navigation';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { getConfig, catalogoImputable } from '@/lib/contabilidad/config';
import { asentarPendientesInventario } from '@/lib/contabilidad/inventario-asientos';
import { valorInventario } from '@/lib/contabilidad/inventario-valuacion';
import { CODIGO } from '@/lib/contabilidad/catalogo-base';
import { InventarioValorClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Valor del inventario: existencia × costo promedio de cada producto, contra el
 * saldo de la cuenta 1105. Al abrir se asientan antes los movimientos recientes
 * (ventas, mermas) para no comparar contra un libro atrasado.
 */
export default async function InventarioValorPage() {
  await requirePermission('contabilidad:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [cfg, user, puedeGestionar] = await Promise.all([getConfig(teamId), getUser(), hasPermission('contabilidad:gestionar')]);
  if (cfg.activa && puedeGestionar) await asentarPendientesInventario(teamId, user?.id ?? null).catch(() => undefined);

  const [valor, catalogo] = await Promise.all([valorInventario(db, teamId), catalogoImputable(teamId)]);
  const cuentas = [...catalogo.imputables.values()].map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }));

  return (
    <InventarioValorClient
      valor={valor}
      cuentas={cuentas}
      contraSobraId={catalogo.porCodigo.get(CODIGO.resultadosAcumulados)?.id ?? null}
      contraFaltaId={catalogo.porCodigo.get(CODIGO.costoVentas)?.id ?? null}
      activa={cfg.activa}
      puedeGestionar={puedeGestionar}
    />
  );
}
