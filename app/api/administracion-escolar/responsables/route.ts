import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { listarResponsables, type FiltroResponsables } from '@/lib/administracion-escolar/responsables';

const FILTROS: FiltroResponsables[] = ['con-deuda', 'sin-contacto', 'todos'];

/**
 * Las familias que pagan, con su deuda y por dónde se les puede escribir.
 *
 * Permiso de VER del módulo escolar y no `clientes:ver`: quien lleva el cobro
 * del colegio no siempre tiene acceso a Contactos, y sin esto no podría ver a
 * quién le debe llamar.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const filtro = sp.get('filtro');

  const datos = await listarResponsables(auth.teamId, {
    q: sp.get('q') ?? undefined,
    filtro: FILTROS.includes(filtro as FiltroResponsables) ? (filtro as FiltroResponsables) : 'todos',
    limit: Number(sp.get('limit')) || 25,
    offset: Number(sp.get('offset')) || 0,
  });

  return NextResponse.json(datos);
}
