/**
 * GET /api/escolar/inventario-aula — el inventario por aula: tarjetas, una fila por
 * aula y lo que no tiene aula. Requiere `administracion-escolar:ver`.
 *
 * Si la empresa no tiene espacios ni activos con aula, responde 404: la pantalla
 * no existe para ella (solo queda «Planta física» en la configuración).
 */
import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { cargarInventario } from '@/lib/escolar/inventario-aula-db';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { inventarioAulaVisible } from '@/lib/escolar/inventario-aula';
import { responderError } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  if (!inventarioAulaVisible(await estadoPlantaDe(auth.teamId))) return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  try {
    return NextResponse.json(await cargarInventario(auth.teamId));
  } catch (e) {
    return responderError(e);
  }
}
