/**
 * GET  /api/pos/meseros           — lista meseros activos (pos:vender).
 * POST /api/pos/meseros           — crea mesero con PIN (pos:configurar).
 * POST /api/pos/meseros?verificar — verifica PIN y devuelve el mesero (pos:vender).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { listarMeseros, crearMesero, meseroPorPin } from '@/lib/pos/restaurante';

export async function GET() {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const meseros = await listarMeseros(auth.teamId);
  // No exponer el PIN al listar.
  return NextResponse.json({ meseros: meseros.map((m) => ({ id: m.id, nombre: m.nombre })) });
}

const crearSchema = z.object({ nombre: z.string().min(1).max(80), pin: z.string().regex(/^\d{4,6}$/) });
const pinSchema   = z.object({ pin: z.string().regex(/^\d{4,6}$/) });

export async function POST(req: NextRequest) {
  const verificar = new URL(req.url).searchParams.has('verificar');
  const body = await req.json().catch(() => null);

  if (verificar) {
    const auth = await requireModuleAndPermission('pos', 'pos:vender');
    if (!auth.ok) return auth.response;
    const parsed = pinSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'PIN inválido' }, { status: 400 });
    const mesero = await meseroPorPin(auth.teamId, parsed.data.pin);
    if (!mesero) return NextResponse.json({ error: 'PIN no reconocido' }, { status: 404 });
    return NextResponse.json({ mesero: { id: mesero.id, nombre: mesero.nombre } });
  }

  const auth = await requireModuleAndPermission('pos', 'pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const mesero = await crearMesero(teamId, parsed.data.nombre, parsed.data.pin);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_MESERO_CREAR', resource: `mesero:${mesero.id}`,
      ip: getIp(req), meta: { nombre: mesero.nombre },
    });
    return NextResponse.json({ ok: true, mesero: { id: mesero.id, nombre: mesero.nombre } }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al crear mesero';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
