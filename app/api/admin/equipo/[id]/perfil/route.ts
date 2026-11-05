/**
 * /api/admin/equipo/:id/perfil — la foto y el cargo de alguien del equipo de
 * Zero. Lo cambia la propia persona o el dueño de la plataforma.
 *
 *   PATCH { cargo?: string | null, foto?: string | null }
 *     · `cargo`: texto (vacío o `null` lo quita). Sin la clave, no cambia.
 *     · `foto`: la imagen en base64 (JPG, PNG o WebP, ya recortada por el
 *       navegador); `null` la quita. Sin la clave, no cambia.
 *
 * El permiso y que el objetivo siga siendo administrador se comprueban dentro
 * de la transacción (`lib/auth/equipo-zero-perfil.ts`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { guardarPerfil } from '@/lib/auth/equipo-zero-perfil';
import { normalizarCargo, urlFotoEquipo, validarFoto } from '@/lib/auth/equipo-zero-perfil-reglas';
import { getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

const respuesta = (cuerpo: object, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function idDe(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return respuesta({ error: 'Origen no permitido' }, 403);
  if (!(await rateLimitDb(`equipo-zero-perfil:${a.user.id}`, 20, 60_000)).allowed) {
    return respuesta({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  }
  const objetivoId = await idDe(ctx);
  if (!objetivoId) return respuesta({ error: 'Id inválido' }, 400);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return respuesta({ error: 'Datos inválidos' }, 400);

  let cargo: string | null | undefined;
  if ('cargo' in body) {
    cargo = normalizarCargo(body.cargo);
    if (cargo === undefined) return respuesta({ error: 'El cargo tiene que ser texto.' }, 400);
  }

  let foto: { bytes: Buffer; tipo: 'image/jpeg' | 'image/png' | 'image/webp' } | null | undefined;
  if ('foto' in body) {
    if (body.foto === null) foto = null;
    else {
      const v = validarFoto(body.foto);
      if (!v.ok) return respuesta({ error: v.mensaje }, 400);
      foto = { bytes: v.bytes, tipo: v.tipo };
    }
  }

  const r = await guardarPerfil({ actorId: a.user.id, objetivoId, cargo, foto, ip: getIp(req) });
  if (!r.ok) return respuesta({ error: r.mensaje }, r.status);
  return respuesta({
    ok: true,
    cargo: r.perfil.cargo,
    fotoUrl: r.perfil.fotoVersion === null ? null : urlFotoEquipo(objetivoId, r.perfil.fotoVersion),
  });
}
