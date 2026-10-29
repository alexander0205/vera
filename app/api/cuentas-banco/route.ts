/**
 * Las cuentas bancarias de la empresa, para elegir a cuál entró un cobro.
 *
 *   GET → { cuentas: [{ id, banco, tipoCuenta, ultimos4, titular, etiqueta }] }
 *
 * Existe aparte de `/api/administracion-escolar/datos-pago` —que lee la misma
 * tabla— por dos razones que no se pueden juntar en un endpoint:
 *
 *   1. Aquel exige el módulo escolar. Una empresa que solo factura, o que cobra
 *      por el POS, tiene bancos igual y no puede leer nada de `escolar`.
 *   2. Aquel devuelve el número de cuenta COMPLETO, porque el padre lo teclea en
 *      la app del banco para transferir. Aquí no hace falta: el desplegable solo
 *      necesita distinguir una cuenta de otra, así que sale con los últimos
 *      cuatro dígitos. Un número de cuenta es dato sensible y no se reparte a
 *      quien no lo va a usar.
 *
 * La tabla se llama `admin_escolar_cuentas_banco` por dónde nació, pero no tiene
 * nada de escolar: solo `team_id`. Es la cuenta de la EMPRESA.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { cuentasBancoActivas } from '@/lib/pagos/cuentas-banco';
import type { CuentaBancoOpcion } from '@/lib/pagos/bancos';

// El tipo vive en lib/pagos/bancos.ts (lo comparte la aprobación de
// comprobantes); se reexporta aquí porque `useCuentasBanco` lo importa de esta ruta.
export type { CuentaBancoOpcion };

export async function GET() {
  // Quien registra un cobro necesita decir a qué cuenta entró. Es el mismo
  // permiso con el que se ve un pago, no uno de configuración: el cajero elige
  // la cuenta, no la administra.
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;

  return NextResponse.json({ cuentas: await cuentasBancoActivas(auth.teamId) });
}
