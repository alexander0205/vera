/**
 * Corre un .sql de lib/db/migrations por el MISMO driver que usa la app.
 *
 * Existe porque `psql` dejó de autenticar contra la rama de Neon con la
 * cadena de .env.local, mientras que el driver serverless de la app sigue
 * conectando con esa misma cadena. Hasta aclarar por qué, esto desbloquea.
 *
 * OJO con el orden de --env-file: Node deja ganar al ÚLTIMO.
 *   npx tsx --env-file=.env --env-file=.env.local scripts/correr-migracion.ts 0121_formularios_escolares.sql
 * Invertido apuntaría a PRODUCCIÓN.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../lib/db/drizzle';
import { sql } from 'drizzle-orm';

async function main() {
  const archivo = process.argv[2];
  if (!archivo) { console.error('Falta el nombre del .sql'); process.exit(1); }

  const ruta = join(process.cwd(), 'lib/db/migrations', archivo);
  const texto = readFileSync(ruta, 'utf8');

  const host = (process.env.POSTGRES_URL ?? '').replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`base: ${host}`);
  console.log(`archivo: ${archivo}\n`);

  // Se manda entero: las sentencias van separadas por ';' pero hay funciones y
  // CHECKs con ';' dentro de paréntesis, y partir por ';' a ciegas los rompería.
  await db.execute(sql.raw(texto));
  console.log('OK — migración aplicada');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
