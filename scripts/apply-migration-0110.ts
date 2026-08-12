import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

(async () => {
  const migration = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0110_team_member_pos_pin.sql'),
    'utf-8',
  );
  await sql.unsafe(migration);
  console.log('✓ Migración 0110 aplicada (team_members.pos_pin — PIN de autorización POS).');
  await sql.end();
})();
