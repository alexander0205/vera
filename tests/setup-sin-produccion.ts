/**
 * Ninguna prueba toca la base de producción. Nunca.
 *
 * `lib/db/drizzle.ts` hace `dotenv.config()`, que carga `.env` — y `.env` de
 * este repo apunta a PRODUCCIÓN. Cualquier prueba que importe `db`, aunque sea
 * de rebote, se conectaba ahí sola si nadie le había pasado otra
 * `POSTGRES_URL`.
 *
 * No es teórico: una prueba de integración temporal quedó un rato en
 * `tests/unit/`, se corrió la suite entera sin variables, y creó un enlace de
 * pago de verdad —con su token público— para una familia real. Se descubrió de
 * casualidad, horas después, mirando otra cosa.
 *
 * El gancho es que `dotenv.config()` NO pisa una variable que ya está puesta.
 * Así que aquí se pone una URL que no lleva a ningún sitio, y `.env` deja de
 * poder imponerse. Las pruebas que no tocan la base ni se enteran; las que sí,
 * fallan al conectar con un error claro en vez de escribir donde no deben.
 *
 * Para correr algo contra datos reales se saca una rama de Neon y se pasa a
 * mano, que además deja dicho en el comando lo que se está haciendo:
 *
 *   POSTGRES_URL="postgresql://…rama-de-neon…" npx vitest run <archivo>
 */

/** El endpoint de Neon de la base de producción. */
const HOST_PRODUCCION = 'ep-raspy-mud-annawbag';

/**
 * Un destino que no existe. Dos cosas a la vez, y las dos importan:
 *
 *   - No es `undefined`: drizzle lanza «POSTGRES_URL environment variable is
 *     not set» nada más importarse, y eso tumbaría hasta las pruebas puras que
 *     solo rozan el módulo.
 *   - No dice `localhost` ni `127.0.0.1`: `db-provision-readiness.test.ts` se
 *     enciende con `runIf(url incluye localhost)` porque quiere un Postgres de
 *     Docker. Con un señuelo local se creía en casa y moría con ECONNREFUSED;
 *     con un host que no resuelve se sigue saltando, que es lo que hacía antes.
 */
const NINGUNA_PARTE = 'postgresql://tests:tests@db-de-pruebas-inexistente.invalid:5432/no-existe';

const url = process.env.POSTGRES_URL;

if (!url || url.includes(HOST_PRODUCCION)) {
  if (url) {
    console.error(
      '\n[tests] POSTGRES_URL apunta a PRODUCCIÓN. Se ignora.\n' +
      '        Para probar contra datos reales, saca una rama de Neon y pásala:\n' +
      '        POSTGRES_URL="postgresql://…" npx vitest run <archivo>\n',
    );
  }
  // Puesta ANTES de que nadie importe drizzle: `dotenv.config()` respeta lo que
  // ya existe, así que `.env` —producción— no vuelve a colarse.
  process.env.POSTGRES_URL = NINGUNA_PARTE;
}
