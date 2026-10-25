/**
 * GET /api/admin/ia  → qué modelo usa cada parte de Zero y entre cuáles se escoge.
 * PUT /api/admin/ia  { asistente: { principal, respaldo }, plantillas: …, captura: … }
 *
 * Solo el administrador de la plataforma. Ver lib/ia/modelos.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { MODELOS_IA, USOS_IA, elegirModelos, usosIa, validarAjusteModelos } from '@/lib/ia/modelos';
import { guardarAjusteModelos, leerAjusteModelos, porGateway } from '@/lib/ia/modelo-servidor';

async function estado() {
  const guardado = await leerAjusteModelos();
  return {
    modelos: MODELOS_IA,
    usos: usosIa(process.env).map((u) => ({ ...u, actual: elegirModelos(guardado, u.uso, process.env) })),
    gateway: porGateway(),
  };
}

export async function GET() {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  return NextResponse.json(await estado());
}

export async function PUT(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  const v = validarAjusteModelos(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // Se guarda completo: lo que no vino se queda como estaba.
  const guardado = (await leerAjusteModelos()) ?? {};
  const valor = Object.fromEntries(USOS_IA.map((uso) => [uso, v.valor[uso] ?? guardado[uso]]).filter(([, x]) => x));
  try {
    await guardarAjusteModelos(valor, { id: a.user.id, email: a.user.email });
  } catch (e) {
    console.error('[admin ia] no se pudo guardar', e);
    return NextResponse.json({ error: 'No se pudo guardar. ¿Se corrió la migración 0199?' }, { status: 500 });
  }
  return NextResponse.json(await estado());
}
