/**
 * /api/admin/equipo/:id — una cuenta del equipo de Zero. SOLO EL DUEÑO.
 *
 *   DELETE  { confirmado: true }  quita el acceso de administrador (la cuenta
 *                                 se queda como usuario normal). Nunca al
 *                                 último administrador, a un dueño ni a uno
 *                                 mismo.
 *   POST                          manda un enlace nuevo para poner la
 *                                 contraseña, anulando los anteriores.
 *
 * Cada handler pide ser administrador él mismo, a la vista: así quien lea o
 * escanee el archivo ve la compuerta sin seguir llamadas. La comprobación de
 * dueño y la regla del último admin las hace `lib/auth/equipo-zero.ts` dentro
 * de la transacción.
 */

import { NextRequest, NextResponse } from 'next/server';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { nuevoEnlaceDeAcceso, quitarAdministrador } from '@/lib/auth/equipo-zero';
import { avisarAccesoDeAdministrador } from '@/lib/auth/equipo-zero-correo';
import { getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

const respuesta = (cuerpo: object, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

/** El `:id` de la URL como entero positivo, o `null`. */
async function idDe(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return respuesta({ error: 'Origen no permitido' }, 403);
  if (!(await rateLimitDb(`equipo-zero:${a.user.id}`, 20, 60_000)).allowed) {
    return respuesta({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  }
  const objetivoId = await idDe(ctx);
  if (!objetivoId) return respuesta({ error: 'Id inválido' }, 400);
  const body = await req.json().catch(() => null) as { confirmado?: unknown } | null;

  const r = await quitarAdministrador({
    actorId: a.user.id, objetivoId, confirmado: body?.confirmado === true, ip: getIp(req),
  });
  if (!r.ok) return respuesta({ error: r.mensaje, codigo: r.codigo }, r.status);
  return respuesta({ ok: true, adminsDespues: r.adminsDespues });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return respuesta({ error: 'Origen no permitido' }, 403);
  if (!(await rateLimitDb(`equipo-zero:${a.user.id}`, 20, 60_000)).allowed) {
    return respuesta({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  }
  const objetivoId = await idDe(ctx);
  if (!objetivoId) return respuesta({ error: 'Id inválido' }, 400);

  const r = await nuevoEnlaceDeAcceso({ actorId: a.user.id, objetivoId, ip: getIp(req) });
  if (!r.ok) return respuesta({ error: r.mensaje, codigo: r.codigo }, r.status);

  const correo = await avisarAccesoDeAdministrador(
    { email: r.objetivo.email, nombre: r.objetivo.nombre },
    { token: r.token, otorgadoPor: a.user.name ?? a.user.email },
  );
  return respuesta({ ok: true, correo });
}
