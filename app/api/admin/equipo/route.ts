/**
 * /api/admin/equipo — el equipo de Zero.
 *
 *   GET            → los administradores de la plataforma y si quien pregunta es
 *                    dueño. Cualquier administrador puede mirar.
 *   GET ?email=x   → además, qué cuenta tiene ese correo (para enseñarla en el
 *                    diálogo de confirmación antes de darle acceso).
 *   POST           → { email, nombre?, confirmado: true } da acceso de
 *                    administrador a ese correo: promueve la cuenta si existe, o
 *                    crea una nueva y le manda el enlace para poner su
 *                    contraseña. SOLO EL DUEÑO.
 *
 * La comprobación de dueño, la regla del último admin y la auditoría las hace
 * `lib/auth/equipo-zero.ts` dentro de la transacción; aquí solo se filtra quién
 * llama y se valida lo que llega. Ver lib/auth/equipo-zero-reglas.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { agregarAdministrador, buscarCuenta, esDuenoDePlataforma, listarEquipo } from '@/lib/auth/equipo-zero';
import { avisarAccesoDeAdministrador } from '@/lib/auth/equipo-zero-correo';
import { normalizarCorreo, normalizarNombre } from '@/lib/auth/equipo-zero-reglas';
import { getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const respuesta = (cuerpo: object, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;

  const pedido = req.nextUrl.searchParams.get('email');
  if (pedido !== null) {
    const email = normalizarCorreo(pedido);
    if (!email) return respuesta({ error: 'Escribe un correo válido.', codigo: 'correo_invalido' }, 400);
    return respuesta({ email, cuenta: await buscarCuenta(email) });
  }

  const [equipo, esDueno] = await Promise.all([listarEquipo(), esDuenoDePlataforma(a.user.id)]);
  return respuesta({
    esDueno,
    migracionPendiente: equipo.migracionPendiente,
    miembros: equipo.miembros.map((m) => ({
      ...m,
      creadoEn: m.creadoEn.toISOString(),
      enlacePendienteHasta: m.enlacePendienteHasta?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return respuesta({ error: 'Origen no permitido' }, 403);
  if (!(await rateLimitDb(`equipo-zero:${a.user.id}`, 20, 60_000)).allowed) {
    return respuesta({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  }

  const body = await req.json().catch(() => null) as { email?: unknown; nombre?: unknown; confirmado?: unknown } | null;
  const email = normalizarCorreo(body?.email);
  if (!email) return respuesta({ error: 'Escribe un correo válido.', codigo: 'correo_invalido' }, 400);

  const r = await agregarAdministrador({
    actorId: a.user.id,
    email,
    nombre: normalizarNombre(body?.nombre),
    confirmado: body?.confirmado === true,
    ip: getIp(req),
  });
  if (!r.ok) return respuesta({ error: r.mensaje, codigo: r.codigo }, r.status);

  const correo = await avisarAccesoDeAdministrador(
    { email: r.objetivo.email, nombre: r.objetivo.nombre },
    { token: r.token, otorgadoPor: a.user.name ?? a.user.email },
  );
  return respuesta({
    ok: true,
    cuentaNueva: r.cuentaNueva,
    miembro: { id: r.objetivo.id, email: r.objetivo.email },
    correo,
  }, r.cuentaNueva ? 201 : 200);
}
