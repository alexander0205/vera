/**
 * Las cuentas bancarias de la EMPRESA, leídas de la base.
 *
 * La tabla se llama `admin_escolar_cuentas_banco` por dónde nació, pero no tiene
 * nada de escolar: solo `team_id`. La leen el desplegable de cobro
 * (`/api/cuentas-banco`) y la aprobación de comprobantes, y las dos arman la
 * misma etiqueta —es la que se guarda en `pagos_recibidos.cuenta`—, de ahí que
 * viva en un solo sitio.
 */

import 'server-only';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCuentasBanco } from '@/lib/db/schema';
import { etiquetaDe, ultimos4, type CuentaBancoOpcion } from './bancos';

export type CuentaBancoDelEquipo = CuentaBancoOpcion & { activa: boolean };

/** Todas las cuentas del equipo, apagadas incluidas, en el orden que se le enseña al padre. */
export async function cuentasBancoDelEquipo(teamId: number): Promise<CuentaBancoDelEquipo[]> {
  const filas = await db
    .select({
      id: adminEscolarCuentasBanco.id,
      banco: adminEscolarCuentasBanco.banco,
      tipoCuenta: adminEscolarCuentasBanco.tipoCuenta,
      numeroCuenta: adminEscolarCuentasBanco.numeroCuenta,
      titular: adminEscolarCuentasBanco.titular,
      activa: adminEscolarCuentasBanco.activa,
    })
    .from(adminEscolarCuentasBanco)
    .where(eq(adminEscolarCuentasBanco.teamId, teamId))
    .orderBy(asc(adminEscolarCuentasBanco.orden), asc(adminEscolarCuentasBanco.id));

  return filas.map((f) => {
    const fin = ultimos4(f.numeroCuenta);
    return {
      id: f.id,
      banco: f.banco,
      tipoCuenta: f.tipoCuenta,
      ultimos4: fin,
      titular: f.titular,
      etiqueta: etiquetaDe(f.banco, f.tipoCuenta, fin),
      activa: f.activa,
    };
  });
}

/** Las que se ofrecen para elegir: las activas, sin el número completo (solo los últimos 4). */
export async function cuentasBancoActivas(teamId: number): Promise<CuentaBancoOpcion[]> {
  return (await cuentasBancoDelEquipo(teamId))
    .filter((c) => c.activa)
    .map(({ activa: _activa, ...opcion }) => opcion);
}
