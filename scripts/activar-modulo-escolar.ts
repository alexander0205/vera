/**
 * Activa el módulo Administración Escolar para UNA empresa.
 *
 *   npx tsx scripts/activar-modulo-escolar.ts <teamId>
 *   npx tsx scripts/activar-modulo-escolar.ts <teamId> --off
 *
 * El módulo es opt-in y no se vende por Stripe (no tiene price), así que no
 * llega por webhook: se enciende a mano aquí o desde el panel admin. Este
 * script hace los dos pasos que el acceso necesita, porque uno sin el otro no
 * sirve de nada:
 *
 *   1. módulo activo en la empresa  → teams.modulos_override
 *   2. permiso del rol              → team_role_permissions
 *
 * (acceso efectivo = módulo de la empresa ∩ permiso del rol, ver
 * lib/auth/modules.ts). Escolar cobra con facturas, así que arrastra
 * 'facturacion' — igual que MODULE_DEPENDENCIES en lib/config/modules.ts.
 *
 * Idempotente: correrlo dos veces deja el mismo estado.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const teamId = Number(process.argv[2]);
const apagar = process.argv.includes('--off');

if (!Number.isInteger(teamId) || teamId <= 0) {
  console.error('Uso: npx tsx scripts/activar-modulo-escolar.ts <teamId> [--off]');
  process.exit(1);
}

// Permisos que recibe cada rol de sistema. Espeja ROLES en lib/config/roles.ts:
// un vendedor no matricula estudiantes, el auditor solo mira.
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

// La DB local de desarrollo (docker) no habla SSL; las remotas sí lo exigen.
const esLocal = /localhost|127\.0\.0\.1/.test(process.env.POSTGRES_URL ?? '');
const sql = postgres(process.env.POSTGRES_URL!, { ssl: esLocal ? false : 'require', max: 1 });

(async () => {
  const [team] = await sql<{ id: number; name: string; modulos: string[] | null }[]>`
    SELECT id, name, coalesce(modulos_override, modulos_habilitados) AS modulos
    FROM teams WHERE id = ${teamId}
  `;
  if (!team) {
    console.error(`✗ No existe la empresa ${teamId}.`);
    await sql.end();
    process.exit(1);
  }

  const actuales = new Set(team.modulos ?? []);
  if (apagar) {
    actuales.delete('escolar');
  } else {
    actuales.add('escolar');
    actuales.add('facturacion'); // dependencia dura: los cargos se cobran con facturas
  }
  const modulos = ['facturacion', 'pos', 'escolar'].filter(m => actuales.has(m));

  await sql.begin(async tx => {
    // sql.json y no JSON.stringify: pasar la cadena hace que postgres.js la
    // mande como jsonb ya serializado y el ::jsonb quede de adorno, guardando
    // la CADENA '["facturacion"]' en vez del array. Al releerla, sanitizeModules
    // ve algo que no es array y devuelve [] — la empresa se queda sin módulos.
    await tx`
      UPDATE teams
      SET modulos_override = ${sql.json(modulos)}, updated_at = now()
      WHERE id = ${teamId}
    `;

    if (apagar) {
      // Se retira el acceso al módulo, NO los permisos granulares ni los datos:
      // si mañana se reactiva, el colegio queda como estaba.
      await tx`
        DELETE FROM team_role_permissions
        WHERE permission = 'modulo:escolar'
          AND team_role_id IN (SELECT id FROM team_roles WHERE team_id = ${teamId})
      `;
      return;
    }

    for (const [rol, permisos] of Object.entries(REPARTO)) {
      await tx`
        INSERT INTO team_role_permissions (team_role_id, permission)
        SELECT tr.id, p.permission
        FROM team_roles tr
        CROSS JOIN unnest(${permisos}::text[]) AS p(permission)
        WHERE tr.team_id = ${teamId} AND tr.key = ${rol}
        ON CONFLICT DO NOTHING
      `;
    }
  });

  console.log(
    apagar
      ? `✓ Módulo escolar DESACTIVADO para "${team.name}" (#${teamId}). Módulos: ${modulos.join(', ') || '—'}`
      : `✓ Módulo escolar activado para "${team.name}" (#${teamId}). Módulos: ${modulos.join(', ')}`,
  );
  console.log('  El rol "Personal del colegio" lo siembra la app sola en el próximo acceso.');
  await sql.end();
})();
