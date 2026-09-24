/**
 * Avisa a los buscadores de que hay páginas nuevas o cambiadas.
 *
 *   node scripts/indexnow.mjs            → manda todas las URLs del sitemap
 *   node scripts/indexnow.mjs /guias     → manda solo esas
 *
 * IndexNow lo usan Bing, Yandex, Naver y Seznam; lo que se le manda a uno lo
 * reciben los demás. Google NO participa: ahí el camino es Search Console, y
 * eso pide una cuenta.
 *
 * Cómo funciona la autenticación: el buscador pide `https://dominio/<clave>.txt`
 * y comprueba que dentro esté la misma clave. Por eso el archivo vive en
 * `public/` y tiene que estar DESPLEGADO antes de llamar a este script —si no,
 * la petición se acepta y luego se descarta en silencio—.
 */

const SITIO = 'https://www.zero.com.do';
const CLAVE = process.env.INDEXNOW_CLAVE;

if (!CLAVE) {
  console.error('✗ Falta INDEXNOW_CLAVE (el nombre del archivo .txt que está en public/, sin extensión).');
  process.exit(1);
}

// Comprobar que la clave está publicada antes de mandar nada.
const prueba = await fetch(`${SITIO}/${CLAVE}.txt`);
if (!prueba.ok) {
  console.error(`✗ ${SITIO}/${CLAVE}.txt responde ${prueba.status}. Despliega primero: sin eso, el aviso se descarta.`);
  process.exit(1);
}

const urls = process.argv.length > 2
  ? process.argv.slice(2).map(r => new URL(r, SITIO).toString())
  : await (async () => {
    const xml = await (await fetch(`${SITIO}/sitemap.xml`)).text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  })();

console.log(`→ ${urls.length} URLs`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITIO).host,
    key: CLAVE,
    keyLocation: `${SITIO}/${CLAVE}.txt`,
    urlList: urls,
  }),
});

// 200 y 202 son las dos respuestas buenas: aceptado, o aceptado y en cola.
console.log(res.ok ? `✓ aceptado (${res.status})` : `✗ ${res.status} ${await res.text()}`);
