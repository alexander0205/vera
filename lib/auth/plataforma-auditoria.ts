/**
 * Rastro de lo que hace el equipo de Zero DENTRO de una empresa de un cliente.
 *
 * Un administrador de la plataforma entra a cualquier empresa sin ser miembro.
 * Eso es para poder ayudar y ver todo, no para actuar sin dejar huella: cada
 * acción que cambia algo queda en `audit_logs` con el usuario real (id y correo)
 * y la empresa donde la hizo. No hay impersonación: nunca se actúa «como» otra
 * persona.
 *
 * Una fila por (empresa, permiso) por petición: una ruta que comprueba el mismo
 * permiso dos veces no duplica el rastro.
 */

import 'server-only';
import { cache } from 'react';
import { logAudit } from '@/lib/audit';
import { esAdminPlataforma, permisoEsDeLectura, type ConRolDePlataforma } from '@/lib/auth/plataforma';

const yaAuditado = cache(() => new Set<string>());

export function auditarAccionPlataforma(
  user: (ConRolDePlataforma & { id: number; email: string }) | null | undefined,
  teamId: number,
  permiso: string,
  detalle?: Record<string, unknown>,
): void {
  if (!user || !esAdminPlataforma(user) || permisoEsDeLectura(permiso)) return;
  try {
    const llave = `${teamId}:${permiso}`;
    const vistos = yaAuditado();
    if (vistos.has(llave)) return;
    vistos.add(llave);
  } catch {
    // Fuera de una petición (scripts, pruebas) no hay caché por petición: se registra igual.
  }
  logAudit({
    teamId,
    userId: user.id,
    actor: user.email,
    action: 'ADMIN_PLATAFORMA_EN_EMPRESA',
    resource: `permiso:${permiso}`,
    meta: detalle ?? null,
  });
}
