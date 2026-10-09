import { redirect } from 'next/navigation';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { listarCuentasPorPagar } from '@/lib/contabilidad/cuentas-por-pagar';
import { cuentasDeSalida } from '@/lib/contabilidad/config';
import { CuentasPorPagarClient } from './_client';
export const dynamic='force-dynamic';
export default async function Page(){await requirePermission('contabilidad:ver');const teamId=await getTeamIdForUser();if(!teamId)redirect('/sign-in');const [data,puedeGestionar,salida]=await Promise.all([listarCuentasPorPagar(teamId),hasPermission('contabilidad:gestionar'),cuentasDeSalida(teamId)]);return <CuentasPorPagarClient {...data} puedeGestionar={puedeGestionar} cuentasSalida={salida.cuentas} cuentaSalidaPorMetodo={salida.porMetodo}/>;}
