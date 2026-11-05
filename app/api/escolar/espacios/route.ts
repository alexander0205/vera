/**
 * Planta física del colegio: los espacios (aulas, laboratorio, oficinas…).
 *
 *   GET  /api/escolar/espacios   → espacios (con sus secciones), secciones del colegio y personal.
 *                                   Requiere `administracion-escolar:ver`.
 *   POST /api/escolar/espacios   → crea un espacio { nombre, tipo?, capacidad?, responsableId? }.
 *                                   Requiere `administracion-escolar:configurar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { crearEspacio, listarEspacios, listarSecciones, personalParaResponsable } from '@/lib/escolar/inventario-aula-db';
import { responderError, enteroPositivo } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  try {
    const [espacios, secciones, personal] = await Promise.all([
      listarEspacios(auth.teamId, { incluirInactivos: true }),
      listarSecciones(auth.teamId),
      personalParaResponsable(auth.teamId),
    ]);
    return NextResponse.json({ espacios, secciones, personal });
  } catch (e) {
    return responderError(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  try {
    const id = await crearEspacio(auth.teamId, {
      nombre: String(b.nombre ?? ''),
      tipo: typeof b.tipo === 'string' ? b.tipo : undefined,
      capacidad: b.capacidad == null || b.capacidad === '' ? null : Number(b.capacidad),
      responsableId: enteroPositivo(b.responsableId),
    });
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: `espacio:${id}`, ip: getIp(req), meta: { cambio: 'creado' } });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return responderError(e);
  }
}
