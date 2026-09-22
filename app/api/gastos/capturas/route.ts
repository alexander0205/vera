import { NextRequest, NextResponse } from 'next/server';
import { autorizarCapturas } from '@/lib/compras/captura/autorizar';
import { listarCapturas, type EstadoCaptura } from '@/lib/compras/captura/consultas';

export const dynamic = 'force-dynamic';

const GRUPOS: Record<string, EstadoCaptura[]> = {
  pendientes: ['procesando', 'por_revisar'],
  registradas: ['registrada'],
  descartadas: ['descartada'],
};

/** GET /api/gastos/capturas?estado=pendientes|registradas|descartadas */
export async function GET(req: NextRequest) {
  const auth = await autorizarCapturas(false);
  if (!auth.ok) return auth.response;
  const estados = GRUPOS[req.nextUrl.searchParams.get('estado') ?? 'pendientes'] ?? GRUPOS.pendientes;
  return NextResponse.json({ capturas: await listarCapturas(auth.teamId, estados) });
}
