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
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCuentasBanco } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';

export interface CuentaBancoOpcion {
  id: number;
  banco: string;
  tipoCuenta: string | null;
  /** Últimos 4 del número, para distinguir dos cuentas del mismo banco. */
  ultimos4: string | null;
  titular: string | null;
  /** Ya armada para pintar: «Banco Popular · Ahorros ····4821». */
  etiqueta: string;
}

/** Los últimos 4 dígitos, ignorando guiones y espacios. */
function ultimos4(numero: string): string | null {
  const digitos = numero.replace(/\D/g, '');
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

/**
 * La etiqueta se GUARDA en `pagos_recibidos.cuenta`, que es `varchar(100)`,
 * mientras que `banco` es `varchar(120)`. Un nombre de banco largo desbordaría
 * la columna al registrar el cobro, así que se acota aquí —en el único sitio
 * donde se arma— y no en cada pantalla que la pinte.
 */
const MAX_ETIQUETA = 100;

function etiquetaDe(banco: string, tipo: string | null, fin: string | null): string {
  const cola = [tipo?.trim(), fin ? `····${fin}` : null].filter(Boolean).join(' ');
  const completa = cola ? `${banco.trim()} · ${cola}` : banco.trim();
  if (completa.length <= MAX_ETIQUETA) return completa;

  // Se recorta el NOMBRE, nunca la cola: los últimos cuatro dígitos son lo que
  // distingue dos cuentas del mismo banco, y sin ellos la etiqueta no sirve.
  const sitio = MAX_ETIQUETA - (cola ? cola.length + 3 : 0) - 1;
  return cola
    ? `${banco.trim().slice(0, Math.max(1, sitio))}… · ${cola}`
    : banco.trim().slice(0, MAX_ETIQUETA);
}

export async function GET() {
  // Quien registra un cobro necesita decir a qué cuenta entró. Es el mismo
  // permiso con el que se ve un pago, no uno de configuración: el cajero elige
  // la cuenta, no la administra.
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select({
      id: adminEscolarCuentasBanco.id,
      banco: adminEscolarCuentasBanco.banco,
      tipoCuenta: adminEscolarCuentasBanco.tipoCuenta,
      numeroCuenta: adminEscolarCuentasBanco.numeroCuenta,
      titular: adminEscolarCuentasBanco.titular,
    })
    .from(adminEscolarCuentasBanco)
    .where(and(
      eq(adminEscolarCuentasBanco.teamId, auth.teamId),
      eq(adminEscolarCuentasBanco.activa, true),
    ))
    .orderBy(adminEscolarCuentasBanco.orden, adminEscolarCuentasBanco.id);

  const cuentas: CuentaBancoOpcion[] = filas.map((f) => {
    const fin = ultimos4(f.numeroCuenta);
    return {
      id: f.id,
      banco: f.banco,
      tipoCuenta: f.tipoCuenta,
      ultimos4: fin,
      titular: f.titular,
      etiqueta: etiquetaDe(f.banco, f.tipoCuenta, fin),
    };
  });

  return NextResponse.json({ cuentas });
}
