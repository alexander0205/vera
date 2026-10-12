import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { autorizarCapturas } from '@/lib/compras/captura/autorizar';
import { descartarCaptura, detalleCaptura, volverAProcesar } from '@/lib/compras/captura/consultas';
import { procesarCaptura } from '@/lib/compras/captura/procesar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const idDe = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizarCapturas(false);
  if (!auth.ok) return auth.response;
  const id = await idDe(params);
  const captura = id ? await detalleCaptura(auth.teamId, id) : null;
  if (!captura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  return NextResponse.json({ captura });
}

const accionSchema = z.object({ accion: z.enum(['descartar', 'volver-a-leer']) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizarCapturas(true);
  if (!auth.ok) return auth.response;
  const id = await idDe(params);
  const parsed = accionSchema.safeParse(await req.json().catch(() => null));
  if (!id || !parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  if (parsed.data.accion === 'descartar') {
    const ok = await descartarCaptura(auth.teamId, id, auth.user.id);
    return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: 'Esta factura ya no se puede descartar' }, { status: 409 });
  }
  const ok = await volverAProcesar(auth.teamId, id);
  if (!ok) return NextResponse.json({ error: 'Esta factura ya no está por revisar' }, { status: 409 });
  after(() => procesarCaptura(auth.teamId, id));
  return NextResponse.json({ ok });
}
