import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0089_zero_tickets.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0089 ejecutada.');

  for (const table of ['tickets', 'ticket_messages', 'ticket_attachments', 'agent_presence']) {
    const cols = await sql`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_name = ${table}
       ORDER BY column_name`;
    console.log(`\n${table}:`);
    console.table(cols);
  }

  await sql.end();
})();
