import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: false });

(async () => {
  const [team] = await sql<{ id: number }[]>`SELECT id FROM teams LIMIT 1`;
  if (!team) {
    console.log('no teams'); await sql.end(); return;
  }

  await sql`SELECT set_config('app.user_id', '0', false)`;
  await sql`SELECT set_config('app.team_id', ${String(team.id)}, false)`;
  await sql`SELECT set_config('app.actor', 'audit-smoke-test', false)`;

  const [c] = await sql<{ id: number }[]>`
    INSERT INTO clients (team_id, razon_social, rnc)
    VALUES (${team.id}, 'AUDIT-TEST', '00000000000')
    RETURNING id
  `;
  await sql`UPDATE clients SET razon_social = 'AUDIT-TEST-MOD' WHERE id = ${c.id}`;
  await sql`DELETE FROM clients WHERE id = ${c.id}`;

  const rows = await sql`
    SELECT operation, table_name, row_pk, changed_cols, actor, team_id
      FROM row_audit_log
     WHERE table_name = 'clients' AND row_pk = ${String(c.id)}
     ORDER BY id
  `;
  console.log('Captured rows:', JSON.stringify(rows, null, 2));
  await sql.end();
})();
