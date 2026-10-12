import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0090_zero_tickets_agents_ratings.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0090 ejecutada.');

  for (const table of ['support_agents', 'ticket_ratings', 'canned_responses']) {
    const cols = await sql`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_name = ${table}
       ORDER BY column_name`;
    console.log(`\n${table}:`);
    console.table(cols);
  }

  const ticketsCols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'on_hold'`;
  console.log('\ntickets.on_hold:');
  console.table(ticketsCols);

  await sql.end();
})();
