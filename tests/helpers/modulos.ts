/**
 * Activación de módulos para los e2e.
 *
 * El POS se enciende con el toggle self-service (`POST /api/equipo/perfil`),
 * pero Administración Escolar es opt-in y no se vende por Stripe: su única vía
 * real es el panel de admin de plataforma. Un test no tiene ese rol, así que
 * escribe en la DB lo mismo que haría el panel — módulo + permisos del rol —
 * replicando scripts/activar-modulo-escolar.ts.
 *
 * Solo para tests: usa POSTGRES_URL, la misma DB contra la que corre el server.
 */

import postgres from 'postgres';

const REPARTO: Record<string, string[]> = {
  admin: [
    'administracion-escolar:ver',
    'administracion-escolar:gestionar',
    'administracion-escolar:configurar',
    'administracion-escolar:pagos',
    'modulo:escolar',
  ],
  lector: ['administracion-escolar:ver'],
};

/**
 * Enciende el módulo escolar para la empresa del usuario `email`.
 * Devuelve el teamId afectado.
 */
export async function activarEscolarParaUsuario(email: string): Promise<number> {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL no definida: el helper de módulos la necesita');
  const sql = postgres(url, { max: 1 });

  try {
    const [row] = await sql<{ team_id: number }[]>`
      SELECT tm.team_id
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE u.email = ${email}
      ORDER BY tm.id
      LIMIT 1
    `;
    if (!row) throw new Error(`No se encontró empresa para ${email}`);
    const teamId = row.team_id;

    // El propietario entra por bypass de owner; los demás roles necesitan el
    // permiso sembrado. Escolar arrastra facturación (cobra con facturas).
    await sql`
      UPDATE teams
      SET modulos_override = '["facturacion","pos","escolar"]'::jsonb, updated_at = now()
      WHERE id = ${teamId}
    `;

    for (const [rol, permisos] of Object.entries(REPARTO)) {
      await sql`
        INSERT INTO team_role_permissions (team_role_id, permission)
        SELECT tr.id, p.permission
        FROM team_roles tr
        CROSS JOIN unnest(${permisos}::text[]) AS p(permission)
        WHERE tr.team_id = ${teamId} AND tr.key = ${rol}
        ON CONFLICT DO NOTHING
      `;
    }

    return teamId;
  } finally {
    await sql.end();
  }
}
