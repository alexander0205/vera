/**
 * POST /api/pagos/[token]/simular — gateway INTERNO de pruebas.
 * Solo válido para links con provider='simulador'. Permite demostrar el flujo
 * completo (pago → registro en pagos_recibidos → estado_pago) sin credenciales
 * reales de la pasarela. En prod los links usan cardnet/azul; esto no aplica.
 *
 * Body: { aprobar: boolean }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLinkByToken, marcarLinkPagado } from '@/lib/pagos/links';

const schema = z.object({ aprobar: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Blindaje: este endpoint marca un pago como recibido SIN dinero real. Es
  // público (solo requiere el token), así que en producción queda deshabilitado
  // aunque alguien active el simulador por error — evita cobros falsos.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Simulador deshabilitado en producción' }, { status: 403 });
  }

  const { token } = await params;
  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: 'Link no encontrado' }, { status: 404 });
  if (link.provider !== 'simulador') {
    return NextResponse.json({ error: 'Este link no usa el simulador' }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const ref = 'SIM' + Date.now().toString().slice(-8);
  const result = await marcarLinkPagado(token, {
    aprobado:    parsed.data.aprobar,
    providerRef: parsed.data.aprobar ? ref : null,
    cardMask:    parsed.data.aprobar ? '**** **** **** 0000' : null,
  });

  return NextResponse.json(result);
}
