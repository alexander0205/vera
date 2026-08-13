/**
 * ¿Cuántos alumnos de este colegio tienen padres cargados en SIGERD?
 *
 * Es LA medición que decide si la migración de padres vale la pena. Si el
 * portal no los tiene, traer 465 reportes no sirve para los avisos y hay que
 * capturar los contactos por otro lado.
 *
 * Usa `ReporteFichaEstudiantePDF`, que es la única vía que los trae. Detalles
 * que costaron encontrar y conviene no volver a descubrir:
 *
 *  - El endpoint NO devuelve binario: serializa el PDF como un array JSON de
 *    bytes. Hay que reconstruirlo con `Buffer.from(array)`.
 *  - Exige `X-Requested-With`, `Origin` y `Referer`; sin ellos responde una
 *    página de error.
 *  - El contenido de página va SIN comprimir: el texto se saca con `(...) Tj`
 *    directamente del PDF crudo, sin librería de PDF.
 *  - No todos los alumnos tienen reporte; los que no, devuelven HTML.
 *
 * NO imprime datos personales: cuenta cuántos traen cada campo.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/sigerd-medir-padres.ts [n]
 */
import { SigerdClient } from '../lib/sigerd/client';

const TEAM = Number(process.env.TEAM_ID ?? 9);
const N = Number(process.argv[2] ?? 20);
const BASE = 'https://sigerd.minerd.gob.do';

async function creds() {
  const { db } = await import('../lib/db/drizzle');
  const { sigerdCredenciales } = await import('../lib/db/schema');
  const { decryptField } = await import('../lib/crypto/cert');
  const { eq } = await import('drizzle-orm');
  const [r] = await db.select().from(sigerdCredenciales).where(eq(sigerdCredenciales.teamId, TEAM)).limit(1);
  if (!r) throw new Error('sin credenciales');
  return { usuario: r.usuario, clave: decryptField({ ciphered: r.claveCifrada, iv: r.claveIv, authTag: r.claveTag }) };
}

/** Repartida entre secciones: medir un solo curso no dice nada del colegio. */
async function muestra(n: number) {
  const { db } = await import('../lib/db/drizzle');
  const { sigerdImportaciones } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [imp] = await db.select().from(sigerdImportaciones).where(eq(sigerdImportaciones.teamId, TEAM)).limit(1);
  const arbol = (imp?.dump as any)?.estructura;
  const porSeccion: Array<Array<{ id: number; donde: string }>> = [];
  for (const sv of arbol?.servicios ?? []) {
    for (const g of sv.grados) {
      for (const s of g.secciones) {
        porSeccion.push((s.estudiantes ?? []).map((e: any) => ({ id: e.id, donde: `${g.nombre} ${s.nombre}` })));
      }
    }
  }
  const out: Array<{ id: number; donde: string }> = [];
  for (let i = 0; out.length < n; i++) {
    let hubo = false;
    for (const sec of porSeccion) {
      if (sec[i] && out.length < n) { out.push(sec[i]); hubo = true; }
    }
    if (!hubo) break;
  }
  return out;
}

async function main() {
  const { usuario, clave } = await creds();
  const lista = await muestra(N);
  const cli = new SigerdClient();
  const login = await cli.iniciarSesion(usuario, clave);
  if (login.estado === 'seleccion-perfil') await cli.seleccionarPerfil(login.perfiles[0]);
  await cli.abrirModulo('/modulo-registro/inscripcion');
  console.log(`Midiendo ${lista.length} estudiantes de ${new Set(lista.map((x) => x.donde)).size} secciones.\n`);

  let sinReporte = 0, conCedula = 0, conTelefono = 0, conCorreo = 0;

  for (const { id, donde } of lista) {
    const r = await cli.fetch(`/ModuloReportes/Estudiantes/ReporteFichaEstudiantePDF?id=${id}`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: BASE,
        Referer: `${BASE}/modulo-registro/inscripcion`,
        Accept: '*/*',
      },
    });
    const texto = await r.text();
    let pdf: Buffer | null = null;
    try {
      const arr = JSON.parse(texto);
      if (Array.isArray(arr)) pdf = Buffer.from(arr as number[]);
    } catch { /* devolvió HTML */ }

    if (!pdf || pdf.subarray(0, 5).toString() !== '%PDF-') {
      sinReporte++;
      console.log(`  ${String(id).padEnd(10)} ${donde.padEnd(14)} sin reporte`);
      continue;
    }

    const crudo = pdf.toString('latin1');
    const i = crudo.indexOf('Parientes');
    const trozo = i >= 0 ? crudo.slice(i, i + 6000) : '';
    const textos = [...trozo.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1].trim()).filter(Boolean);
    const cedula = /\d{3}-\d{7}-\d/.test(trozo);
    const telefono = /\d{3}-\d{3}-\d{4}/.test(trozo);
    const correo = /@/.test(trozo);
    if (cedula) conCedula++;
    if (telefono) conTelefono++;
    if (correo) conCorreo++;
    console.log(`  ${String(id).padEnd(10)} ${donde.padEnd(14)} ${String(textos.length).padStart(3)} textos`
      + ` · cédula:${cedula ? 'SÍ' : 'no'} tel:${telefono ? 'SÍ' : 'no'} correo:${correo ? 'SÍ' : 'no'}`);
  }

  const conReporte = lista.length - sinReporte;
  console.log(`\n── Resultado sobre ${lista.length} alumnos ──`);
  console.log(`  con reporte:            ${conReporte}`);
  console.log(`  sin reporte:            ${sinReporte}`);
  console.log(`  con cédula de pariente: ${conCedula}`);
  console.log(`  con teléfono:           ${conTelefono}`);
  console.log(`  con correo:             ${conCorreo}`);
  await cli.cerrarSesion();
}
main().then(() => process.exit(0)).catch((e) => {
  console.error('FALLÓ:', e instanceof Error ? e.message : e);
  process.exit(1);
});
