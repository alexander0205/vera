'use client';

/**
 * usePermissions
 *
 * Hook cliente para gating de UI según los permisos del usuario en el team
 * activo. Hace SWR a GET /api/user, que devuelve `permissions: Permission[]`
 * (catálogo de lib/config/roles.ts) y `teamRole`.
 *
 * Uso:
 *   const { can, isLoading } = usePermissions();
 *   const canEdit = can('facturas:editar');
 *   {canAnular && <BotonAnular />}
 *
 * Notas:
 *  - Mientras carga, `can()` devuelve false (default deny). Usa `isLoading`
 *    si necesitas distinguir "cargando" de "sin permiso".
 *  - platform admin recibe todos los permisos desde el endpoint (espejo de
 *    userCan), así que no hay que tratarlo aparte aquí.
 *  - Comparte la SWR key '/api/user' con el resto de la app. Forzamos
 *    revalidación al montar porque el fallback de layout.tsx (getUser crudo)
 *    no incluye `permissions`.
 *
 * Otros agentes (p.ej. la tabla de facturas) pueden consumir este hook para
 * el gating de acciones bulk (Anular/Exportar).
 */

import useSWR from 'swr';
import type { Permission } from '@/lib/config/roles';

interface UserPermissionsResponse {
  teamRole?: string | null;
  permissions?: Permission[];
}

// Fetch siempre /api/user, pero bajo una SWR key PROPIA (array) que NO coincide
// con la key '/api/user' del fallback de app/layout.tsx. Ese fallback es
// getUser() crudo (sin `permissions`) y, al compartir key, ensombrecía la
// revalidación dejando `can()` en false aun para owner/admin. Con key propia
// SWR hace su propio fetch y siempre obtiene `permissions`.
const fetcher = ([url]: [string, string]) => fetch(url).then(r => (r.ok ? r.json() : null));

export interface UsePermissionsResult {
  /** ¿El usuario tiene este permiso en el team activo? */
  can: (permission: Permission) => boolean;
  /** Lista de permisos efectivos (vacía mientras carga o sin sesión). */
  permissions: Permission[];
  /** Rol del usuario en el team activo (null si no aplica). */
  teamRole: string | null;
  /** true mientras la primera carga está en curso. */
  isLoading: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { data, isLoading } = useSWR<UserPermissionsResponse | null>(
    ['/api/user', 'permissions'],
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );

  const permissions = data?.permissions ?? [];
  const teamRole = data?.teamRole ?? null;

  return {
    can: (permission: Permission) => permissions.includes(permission),
    permissions,
    teamRole,
    isLoading,
  };
}
