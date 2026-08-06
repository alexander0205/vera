import 'server-only';
import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { ENTIDADES_FOTO, esEntidadValida, type EntidadFoto } from '@/lib/fotos/entidades';

/**
 * Puerta común de las rutas de fotos con sesión de usuario.
 *
 * Encadena las tres comprobaciones que ninguna ruta debe poder saltarse:
 *   1. la entidad existe en el registro,
 *   2. el usuario tiene el módulo y el permiso que esa entidad exige,
 *   3. la fila pertenece al team activo (lo resuelve el `cargar` de la entidad).
 *
 * El paso 3 es el que impide que un usuario del colegio A pida la foto de un
 * alumno del colegio B: aunque tenga el permiso, el SELECT filtra por teamId.
 */
export interface EntidadAutorizada {
  ok: true;
  teamId: number;
  usuarioId: number;
  entidad: EntidadFoto;
  entidadId: number;
  nombre: string;
}

export async function autorizarEntidad(
  entidadRaw: string | null,
  entidadIdRaw: string | null,
  accion: 'ver' | 'gestionar',
): Promise<EntidadAutorizada | { ok: false; response: NextResponse }> {
  if (!esEntidadValida(entidadRaw)) {
    return { ok: false, response: NextResponse.json({ error: 'Entidad no válida' }, { status: 400 }) };
  }
  const entidadId = Number(entidadIdRaw);
  if (!Number.isInteger(entidadId) || entidadId <= 0) {
    return { ok: false, response: NextResponse.json({ error: 'Id no válido' }, { status: 400 }) };
  }

  const def = ENTIDADES_FOTO[entidadRaw];
  const permiso = accion === 'ver' ? def.permisoVer : def.permisoGestionar;
  const auth = await requireModuleAndPermission(def.modulo, permiso);
  if (!auth.ok) return auth;

  const nombre = await def.cargar(auth.teamId, entidadId);
  if (nombre === null) {
    return { ok: false, response: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  }

  return { ok: true, teamId: auth.teamId, usuarioId: auth.user.id, entidad: entidadRaw, entidadId, nombre };
}
