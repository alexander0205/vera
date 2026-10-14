import 'server-only';
import type { Permission } from '@/lib/config/roles';
import type { ModuleKey } from '@/lib/config/modules';
import { getTeamModules } from '@/lib/auth/modules';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { apiFalsa, type ClienteApi } from './api';

/**
 * Con qué cuenta el asistente para esta persona en esta empresa: qué módulos
 * tiene contratados y qué permisos tiene su rol. Cada herramienta y cada
 * entrada del mapa se filtra con esto, así que el asistente no lee ni guía
 * hacia algo que la persona no puede abrir.
 *
 * Sale de la sesión, nunca del cliente ni del modelo.
 */
export interface ContextoAsistente {
  teamId: number;
  /** La API de la app, con la sesión de quien pregunta: de aquí sale toda búsqueda. */
  api: ClienteApi;
  modulos: ReadonlySet<ModuleKey>;
  tieneModulo: (m: ModuleKey) => boolean;
  puede: (p: Permission) => boolean;
}

export async function construirContexto(
  teamId: number,
  platformRole: string | null | undefined,
  teamRole: string | null | undefined,
  api: ClienteApi,
): Promise<ContextoAsistente> {
  const [modulos, permisos] = await Promise.all([
    getTeamModules(teamId),
    getEffectivePermissions(teamId, teamRole),
  ]);
  const mods = new Set<ModuleKey>(modulos);
  const todo = platformRole === 'admin';
  const perms = new Set<Permission>(permisos as Permission[]);
  return {
    teamId,
    api,
    modulos: mods,
    tieneModulo: (m) => mods.has(m),
    puede: (p) => todo || perms.has(p),
  };
}

/** Contexto fijo para pruebas: todo habilitado salvo lo que se quite. */
export function contextoDePrueba(
  teamId: number,
  opts: { modulos?: ModuleKey[]; permisos?: Permission[] | 'todos'; api?: ClienteApi } = {},
): ContextoAsistente {
  const mods = new Set<ModuleKey>(opts.modulos ?? ['facturacion', 'administracion', 'pos', 'escolar', 'nomina', 'contabilidad']);
  const perms = opts.permisos === undefined || opts.permisos === 'todos' ? null : new Set<Permission>(opts.permisos);
  return {
    teamId,
    api: opts.api ?? apiFalsa({}).api,
    modulos: mods,
    tieneModulo: (m) => mods.has(m),
    puede: (p) => (perms ? perms.has(p) : true),
  };
}
