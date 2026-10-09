/**
 * Las cuentas del colegio y su contacto.
 *
 *   GET → { datos, cuentas }
 *   PUT → guarda las dos cosas de un golpe
 *
 * Sin ninguna cuenta activa, la página del padre no ofrece transferencia:
 * enseñar una tabla de guiones y pedir un comprobante es peor que decir «llama
 * al colegio».
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDatosPago, adminEscolarCuentasBanco } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/** Tope por colegio. Más de eso no es un colegio con bancos, es un dedo pegado. */
const MAX_CUENTAS = 10;

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const [datos, cuentas] = await Promise.all([
    db.select().from(adminEscolarDatosPago)
      .where(eq(adminEscolarDatosPago.teamId, auth.teamId)).limit(1),
    db.select().from(adminEscolarCuentasBanco)
      .where(and(
        eq(adminEscolarCuentasBanco.teamId, auth.teamId),
        eq(adminEscolarCuentasBanco.activa, true),
      ))
      .orderBy(adminEscolarCuentasBanco.orden, adminEscolarCuentasBanco.id),
  ]);

  return NextResponse.json({ datos: datos[0] ?? null, cuentas });
}

interface CuentaEntrante {
  id?: number | null;
  banco?: string;
  tipoCuenta?: string;
  numeroCuenta?: string;
  titular?: string;
  documento?: string;
}

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => null);
  const texto = (v: unknown, max: number) => {
    const s = String(v ?? '').trim().slice(0, max);
    return s || null;
  };

  // ─── El contacto: uno solo ───
  const datos = {
    documento:           texto(b?.documento, 20),
    telefonoAyuda:       texto(b?.telefonoAyuda, 40),
    horarioAyuda:        texto(b?.horarioAyuda, 120),
    instrucciones:       texto(b?.instrucciones, 500),
    aceptaTransferencia: b?.aceptaTransferencia !== false,
    actualizadoEn:       new Date(),
  };

  // ─── Las cuentas: varias ───
  const entrantes: CuentaEntrante[] = Array.isArray(b?.cuentas) ? b.cuentas : [];
  const limpias = entrantes
    .map((c) => ({
      id: Number.isInteger(c.id) ? Number(c.id) : null,
      banco: String(c.banco ?? '').trim().slice(0, 120),
      tipoCuenta: texto(c.tipoCuenta, 40),
      // Solo dígitos y guiones: un número de cuenta con espacios se copia mal.
      numeroCuenta: String(c.numeroCuenta ?? '').replace(/[^\w-]/g, '').slice(0, 60),
      titular: texto(c.titular, 200),
      // Vacío = hereda el del colegio. Se guarda vacío, no copiado: si mañana
      // cambia el del colegio, la cuenta que no dijo nada debe seguirlo.
      documento: texto(c.documento, 20),
    }))
    .filter((c) => c.banco && c.numeroCuenta)
    .slice(0, MAX_CUENTAS);

  // El mismo banco con el mismo número dos veces es un error de dedo, y el
  // índice único lo rebotaría con un 500 poco explicativo.
  const vistas = new Set<string>();
  for (const c of limpias) {
    const clave = `${c.banco.toLowerCase()}|${c.numeroCuenta}`;
    if (vistas.has(clave)) {
      return NextResponse.json(
        { error: `La cuenta ${c.numeroCuenta} de ${c.banco} está repetida.` },
        { status: 400 },
      );
    }
    vistas.add(clave);
  }

  await db.transaction(async (tx) => {
    await tx.insert(adminEscolarDatosPago)
      .values({ teamId: auth.teamId, ...datos })
      .onConflictDoUpdate({ target: adminEscolarDatosPago.teamId, set: datos });

    /**
     * Las que ya no vienen se APAGAN, no se borran.
     *
     * Una cuenta cerrada sigue apareciendo en comprobantes de hace meses, y
     * borrarla dejaría al colegio mirando un número que no sabe de dónde salió.
     */
    const conservados = limpias.map((c) => c.id).filter((x): x is number => x != null);
    await tx.update(adminEscolarCuentasBanco)
      .set({ activa: false, actualizadoEn: new Date() })
      .where(and(
        eq(adminEscolarCuentasBanco.teamId, auth.teamId),
        eq(adminEscolarCuentasBanco.activa, true),
        ...(conservados.length > 0
          ? [notInArray(adminEscolarCuentasBanco.id, conservados)]
          : []),
      ));

    for (const [orden, c] of limpias.entries()) {
      const fila = {
        banco: c.banco, tipoCuenta: c.tipoCuenta, numeroCuenta: c.numeroCuenta,
        titular: c.titular, documento: c.documento,
        orden, activa: true, actualizadoEn: new Date(),
      };
      if (c.id != null) {
        await tx.update(adminEscolarCuentasBanco).set(fila)
          .where(and(
            eq(adminEscolarCuentasBanco.id, c.id),
            eq(adminEscolarCuentasBanco.teamId, auth.teamId),
          ));
      } else {
        // Reactivar por (banco, número) en vez de insertar: volver a escribir
        // una cuenta que se había quitado no debe reventar contra el único.
        await tx.insert(adminEscolarCuentasBanco)
          .values({ teamId: auth.teamId, ...fila })
          .onConflictDoUpdate({
            target: [
              adminEscolarCuentasBanco.teamId,
              adminEscolarCuentasBanco.banco,
              adminEscolarCuentasBanco.numeroCuenta,
            ],
            set: fila,
          });
      }
    }
  });

  const cuentas = await db.select().from(adminEscolarCuentasBanco)
    .where(and(
      eq(adminEscolarCuentasBanco.teamId, auth.teamId),
      eq(adminEscolarCuentasBanco.activa, true),
    ))
    .orderBy(adminEscolarCuentasBanco.orden, adminEscolarCuentasBanco.id);

  return NextResponse.json({ ok: true, cuentas });
}
