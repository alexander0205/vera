/**
 * GET  /api/pos/terminales — lista terminales (pos:vender, el cajero las ve para entrar).
 * POST /api/pos/terminales — crea terminal (pos:configurar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { listarTerminales, crearTerminal } from '@/lib/pos/terminales';
import { getAmbienteTenant, mensajeAmbienteNoProduccion } from '@/lib/ecf-api/ambiente';
import { esTipoVentaFiscal } from '@/lib/ecf/categorias';

export async function GET() {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const terminales = await listarTerminales(auth.teamId);
  return NextResponse.json({ terminales });
}

const terminalSchema = z.object({
  nombre:         z.string().min(1).max(100),
  almacenId:      z.number().int().positive(),
  impresoraId:    z.number().int().positive().nullable().optional(),
  listaPreciosId: z.number().int().positive().nullable().optional(),
  // Enum, no string libre: antes cualquier valor de 10 chars pasaba y el
  // terminal se lo heredaba a todas sus ventas.
  tipoEcf:        z.enum(['sin-ncf', '31', '32']).optional(),
  activo:         z.boolean().optional(),
  mesas:          z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = terminalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.tipoEcf && esTipoVentaFiscal(parsed.data.tipoEcf)) {
    const ambiente = await getAmbienteTenant(teamId);
    if (ambiente !== 'Produccion') {
      return NextResponse.json({ error: mensajeAmbienteNoProduccion(ambiente), ambiente }, { status: 403 });
    }
  }

  try {
    const terminal = await crearTerminal(teamId, parsed.data);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_TERMINAL_CREAR', resource: `terminal:${terminal.id}`,
      ip: getIp(req), meta: { nombre: terminal.nombre, almacenId: terminal.almacenId },
    });
    return NextResponse.json({ ok: true, terminal }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al crear terminal';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
