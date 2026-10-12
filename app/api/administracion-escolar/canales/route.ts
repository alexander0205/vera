/**
 * GET  /api/administracion-escolar/canales  → { correo, whatsapp, sms }
 * PUT  /api/administracion-escolar/canales  { correo?, whatsapp?, sms? }
 *
 * El interruptor maestro de cada canal de aviso del colegio. Lo que no venga en
 * el PUT se queda como estaba: la pantalla manda un canal a la vez.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { canalesDelColegio, guardarCanales } from '@/lib/administracion-escolar/canales';

export async function GET() {
  // 'ver' y no 'configurar': la pantalla de Conceptos también necesita saber si
  // el canal está vivo para no ofrecer un interruptor que no manda nada.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  return NextResponse.json(await canalesDelColegio(auth.teamId));
}

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const actuales = await canalesDelColegio(auth.teamId);

  // `undefined` = no se tocó. Cualquier otra cosa que no sea un booleano es un
  // error del cliente y no un "apágalo": callar un canal sin querer es
  // justamente lo que no se puede permitir aquí.
  for (const clave of ['correo', 'whatsapp', 'sms'] as const) {
    if (body[clave] !== undefined && typeof body[clave] !== 'boolean') {
      return NextResponse.json({ error: `«${clave}» debe ser true o false` }, { status: 400 });
    }
  }

  const nuevos = {
    correo:   body.correo   ?? actuales.correo,
    whatsapp: body.whatsapp ?? actuales.whatsapp,
    sms:      body.sms      ?? actuales.sms,
  };

  await guardarCanales(auth.teamId, nuevos);
  return NextResponse.json(nuevos);
}
