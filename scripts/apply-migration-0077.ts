import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

/**
 * Aplica LAS DOS migraciones que llevan el número 0077.
 *
 * El número está duplicado: la rama de facturación y la de gobernanza escolar
 * avanzaron en paralelo y ambas llegaron a 0077 con cambios distintos. Al
 * juntarlas no se renumeró ninguna porque las escolares se apoyan unas en
 * otras —0075 crea las tablas que 0109 modifica— y moverlas de sitio las
 * dejaría corriendo después de quien las necesita.
 *
 * Las dos son idempotentes, así que correr esto sobre una base que ya tenga
 * una de las dos no rompe nada.
 */
const MIGRACIONES = [
  '0077_administracion_escolar_tutor_imagen.sql',
  '0077_alerta_metodo_pago_toggle.sql',
];

(async () => {
  for (const archivo of MIGRACIONES) {
    const t = readFileSync(join(process.cwd(), 'lib/db/migrations', archivo), 'utf-8');
    await sql.unsafe(t);
    console.log(`✓ ${archivo}`);
  }
  await sql.end();
})();
