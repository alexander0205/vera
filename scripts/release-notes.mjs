#!/usr/bin/env node
/**
 * Genera la nota de versión a partir de los commits desde el último tag.
 *
 * Lo corre .github/workflows/release.yml en cada push a main: calcula el salto
 * de versión, redacta las notas y las deja listas para CHANGELOG.md y para la
 * release de GitHub.
 *
 * ── Por qué un script propio y no semantic-release ──
 * Necesitamos un paso que no trae ninguna herramienta estándar: REDACTAR. El
 * changelog es público y los commits de este repo mencionan colegios, correos y
 * RNC reales. Un generador que copia el subject tal cual publicaría eso.
 *
 * ── Contrato ──
 *   node scripts/release-notes.mjs            → imprime JSON {version, bump, notas, avisos}
 *   node scripts/release-notes.mjs --write    → además escribe CHANGELOG.md y package.json
 *
 * El salto sale de Conventional Commits:
 *   BREAKING CHANGE / feat! → major
 *   feat                    → minor
 *   cualquier otra cosa     → patch
 * Un push sin commits convencionales igual saca patch: la regla es que TODO push
 * a main queda publicado, aunque el mensaje no siga el formato.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

// ─── Redacción ───────────────────────────────────────────────────────────────
// El changelog es público. Los commits internos mencionan clientes reales; nada
// de eso puede salir. Ante la duda se redacta: perder detalle en una nota es
// barato, publicar el nombre de un colegio o el correo de una cajera no.

// OJO con el flag `i`: hace que \p{Lu} matchee minúsculas, así que el patrón se
// come la palabra siguiente. "colegio Amisadai no cerraba" salía como
// "[cliente] cerraba" — invirtiendo el sentido de la nota. El nombre propio se
// matchea SIEMPRE case-sensitive; la palabra clave lista sus variantes a mano.
const KW = '(?:[Cc]olegio|COLEGIO|[Cc]entro|CENTRO|[Ee]scuela|ESCUELA|[Ii]nstituto|INSTITUTO|[Ll]iceo|LICEO|[Aa]cademia|ACADEMIA)';
const SUF = '(?:SRL|EIRL|SAS|S\\.?A\\.?)';

const REGLAS_REDACCION = [
  // Correos → [correo]
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[correo]'],
  // Razón social con sufijo: "COLEGIO ANDRES BELLO SRL"
  [new RegExp(`\\b${KW}\\s+\\p{Lu}[\\p{L}.]*(?:\\s+\\p{Lu}[\\p{L}.]*){0,4}\\s+${SUF}`, 'gu'), '[cliente]'],
  // Sufijo societario sin palabra clave: "ANDRES BELLO SRL"
  [new RegExp(`\\b\\p{Lu}[\\p{L}]+(?:\\s+\\p{Lu}[\\p{L}]+){1,3}\\s+${SUF}\\b`, 'gu'), '[cliente]'],
  // Palabra clave + nombre propio, sin sufijo: "colegio Amisadai"
  [new RegExp(`\\b${KW}\\s+\\p{Lu}[\\p{L}]*(?:\\s+\\p{Lu}[\\p{L}]*){0,2}`, 'gu'), '[cliente]'],
  // RNC (9) y cédula (11), con o sin guiones
  [/\b\d{3}-?\d{5}-?\d{1}\b|\b\d{3}-?\d{7}-?\d{1}\b|\b\d{9}\b|\b\d{11}\b/g, '[documento]'],
  // e-NCF
  [/\bE\d{10,13}\b/g, '[e-NCF]'],
  // URLs internas
  [/\bhttps?:\/\/[^\s)]+/g, '[enlace]'],
];

/** Aplica las reglas y reporta si tocó algo, para poder avisar en el log del CI. */
export function redactar(texto) {
  let out = texto;
  const tocadas = [];
  for (const [re, reemplazo] of REGLAS_REDACCION) {
    if (re.test(out)) tocadas.push(reemplazo);
    re.lastIndex = 0;
    out = out.replace(re, reemplazo);
  }
  return { texto: out, tocadas: [...new Set(tocadas)] };
}

// ─── Parseo de commits ───────────────────────────────────────────────────────

const SECCIONES = [
  { tipo: 'feat',     titulo: 'Nuevo' },
  { tipo: 'fix',      titulo: 'Arreglado' },
  { tipo: 'perf',     titulo: 'Rendimiento' },
  { tipo: 'refactor', titulo: 'Cambios internos' },
  { tipo: 'docs',     titulo: 'Documentación' },
];
// Ruido de mantenimiento: no aporta al lector del changelog.
const TIPOS_OCULTOS = new Set(['chore', 'ci', 'test', 'style', 'build']);

const RE_CONV = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

/**
 * @param registros Cada uno: hash \x1f subject \x1f body
 *
 * Del cuerpo se rescatan las viñetas. El subject dice QUÉ se hizo en 8 palabras;
 * el porqué y el detalle viven en el cuerpo, y tirarlos deja un changelog de
 * titulares que no le sirve a nadie.
 */
export function parsearCommits(registros) {
  const commits = [];
  for (const registro of registros) {
    const [hash, subject, body = ''] = registro.split('\x1f');
    if (!subject) continue;
    // Los merges no describen nada que el commit real no diga ya.
    if (/^Merge (branch|pull request)/i.test(subject)) continue;

    // Viñetas del cuerpo. Los cuerpos vienen envueltos a ~80 columnas, así que
    // una viñeta ocupa varias líneas: hay que reunirlas o el changelog publica
    // frases cortadas a la mitad.
    const detalles = [];
    let enVineta = false;
    for (const linea of body.split('\n')) {
      const t = linea.trim();
      if (/^[-*]\s+/.test(t)) {
        detalles.push(t.replace(/^[-*]\s+/, ''));
        enVineta = true;
      } else if (!t) {
        enVineta = false;                     // línea en blanco cierra la viñeta
      } else if (t.endsWith(':')) {
        enVineta = false;                     // encabezado de sección del cuerpo
      } else if (enVineta) {
        detalles[detalles.length - 1] += ' ' + t;   // continuación envuelta
      }
      // Párrafos sueltos del cuerpo se ignoran: el changelog lista viñetas.
    }
    const limpios = detalles
      .map(d => d.trim())
      .filter(Boolean)
      .filter(d => !/^(Co-Authored-By|Signed-off-by|Refs?):/i.test(d));

    const m = subject.match(RE_CONV);
    if (m) {
      commits.push({ hash, tipo: m[1].toLowerCase(), scope: m[2] ?? null, breaking: !!m[3], desc: m[4], detalles: limpios });
    } else {
      // Sin formato convencional. No se descarta: se publica igual bajo "Otros".
      commits.push({ hash, tipo: 'otro', scope: null, breaking: false, desc: subject, detalles: limpios });
    }
  }
  return commits;
}

export function calcularBump(commits, cuerpos = '') {
  if (commits.some(c => c.breaking) || /BREAKING CHANGE/.test(cuerpos)) return 'major';
  if (commits.some(c => c.tipo === 'feat')) return 'minor';
  return 'patch';
}

export function siguienteVersion(actual, bump) {
  const [ma, mi, pa] = actual.split('.').map(Number);
  if (bump === 'major') return `${ma + 1}.0.0`;
  if (bump === 'minor') return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

export function construirNotas(commits) {
  const avisos = new Set();
  const limpiar = (s) => {
    const { texto, tocadas } = redactar(s);
    tocadas.forEach(t => avisos.add(t));
    return texto;
  };

  const item = (c) => {
    const scope = c.scope ? `**${limpiar(c.scope)}**: ` : '';
    let s = `- ${scope}${limpiar(c.desc)}\n`;
    // Detalle del cuerpo, anidado. Es lo que convierte un titular en algo que
    // se entiende sin abrir el commit.
    for (const d of c.detalles ?? []) s += `  - ${limpiar(d)}\n`;
    return s;
  };

  let md = '';
  for (const { tipo, titulo } of SECCIONES) {
    const items = commits.filter(c => c.tipo === tipo);
    if (!items.length) continue;
    md += `### ${titulo}\n\n`;
    for (const c of items) md += item(c);
    md += '\n';
  }
  const otros = commits.filter(c => c.tipo === 'otro');
  if (otros.length) {
    md += `### Otros\n\n`;
    for (const c of otros) md += item(c);
    md += '\n';
  }
  const ocultos = commits.filter(c => TIPOS_OCULTOS.has(c.tipo)).length;
  if (ocultos) md += `_${ocultos} commit(s) de mantenimiento no listados._\n\n`;

  return { md: md.trim() || '_Sin cambios visibles para el usuario._', avisos: [...avisos] };
}

// ─── Novedades para el cliente ───────────────────────────────────────────────

const RUTA_NOVEDADES = 'content/novedades.json';

/**
 * Promueve `pendiente` a una versión con número y fecha.
 *
 * FALLA si no hay novedades escritas. Es a propósito: sin esto, la regla "toda
 * subida le explica al cliente qué cambió" dura tres semanas. El único lugar
 * donde se puede hacer cumplir es aquí, donde duele — el release no sale.
 *
 * El autor no elige el número: cuando escribe la novedad todavía no se sabe si
 * el push será patch o minor. Escribe en `pendiente` y el número se asigna solo.
 */
export function promoverNovedades(doc, version, fecha) {
  const pend = doc.pendiente ?? { titulo: '', cambios: [] };
  const cambios = pend.cambios ?? [];

  if (cambios.length === 0) {
    throw new Error(
      `Falta la novedad para v${version}.\n\n` +
      `Toda subida a producción tiene que decirle al cliente qué cambió.\n` +
      `Agrega al menos una entrada en ${RUTA_NOVEDADES} → "pendiente.cambios":\n\n` +
      `  {\n` +
      `    "tipo": "nuevo",            // nuevo | mejora | arreglo\n` +
      `    "titulo": "Qué gana el cliente, en sus palabras",\n` +
      `    "detalle": "Qué pasaba antes y qué pasa ahora."\n` +
      `  }\n\n` +
      `Si el cambio no se ve (refactor, dependencias), escribe igual una línea\n` +
      `honesta: "Mejoras internas de rendimiento".`
    );
  }

  const sinTitulo = !pend.titulo || !pend.titulo.trim();
  const nueva = {
    version,
    fecha,
    // Sin título propio, el de la única novedad sirve; con varias, uno genérico.
    titulo: sinTitulo
      ? (cambios.length === 1 ? cambios[0].titulo : 'Mejoras del sistema')
      : pend.titulo.trim(),
    cambios,
  };

  return {
    ...doc,
    pendiente: { titulo: '', cambios: [] },
    versiones: [nueva, ...(doc.versiones ?? [])],
  };
}

/** Las notas del cliente no pasan por el redactor de commits, pero igual se revisan. */
function validarNovedades(cambios) {
  const problemas = [];
  for (const c of cambios) {
    const texto = `${c.titulo} ${c.detalle}`;
    const { tocadas } = redactar(texto);
    if (tocadas.length) {
      problemas.push(`"${c.titulo}" contiene datos que no pueden publicarse (${tocadas.join(', ')})`);
    }
    if (!['nuevo', 'mejora', 'arreglo'].includes(c.tipo)) {
      problemas.push(`"${c.titulo}" tiene tipo inválido: "${c.tipo}" (usa nuevo | mejora | arreglo)`);
    }
  }
  return problemas;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const escribir = process.argv.includes('--write');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  let rango;
  try {
    const ultimoTag = sh('git describe --tags --abbrev=0');
    rango = `${ultimoTag}..HEAD`;
  } catch {
    rango = '';  // sin tags aún: primera release
  }

  // \x1e separa commits, \x1f separa campos — el cuerpo trae saltos de línea, así
  // que \n no sirve de separador.
  const raw = sh(`git log ${rango} --no-merges --format=%h%x1f%s%x1f%b%x1e`);
  const registros = raw ? raw.split('\x1e').map(r => r.trim()).filter(Boolean) : [];
  const cuerpos = rango ? sh(`git log ${rango} --format=%b`) : '';
  const commits = parsearCommits(registros);

  if (!commits.length) {
    console.log(JSON.stringify({ vacio: true, motivo: 'sin commits nuevos desde el último tag' }));
    return;
  }

  const bump = calcularBump(commits, cuerpos);
  const version = siguienteVersion(pkg.version, bump);
  const { md, avisos } = construirNotas(commits);
  const fecha = new Date().toISOString().slice(0, 10);
  const entrada = `## v${version} — ${fecha}\n\n${md}\n`;

  // Novedades del cliente: se valida SIEMPRE, aunque no se escriba. Así el error
  // sale en el dry-run y en el CI antes de tocar un archivo — no a medio release
  // con el package.json ya bumpeado.
  const docNov = JSON.parse(readFileSync(RUTA_NOVEDADES, 'utf8'));
  const novedadesPromovidas = promoverNovedades(docNov, version, fecha);
  const problemas = validarNovedades(novedadesPromovidas.versiones[0].cambios);
  if (problemas.length) {
    throw new Error(`Las novedades no pueden publicarse:\n  - ${problemas.join('\n  - ')}`);
  }

  if (escribir) {
    pkg.version = version;
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    writeFileSync(RUTA_NOVEDADES, JSON.stringify(novedadesPromovidas, null, 2) + '\n');

    const cabecera = `# Changelog\n\nTodos los cambios publicados en producción. Una entrada por cada push a main.\nNo se publican nombres de clientes, correos ni documentos: las notas se redactan\nautomáticamente (ver scripts/release-notes.mjs).\n\n`;
    const previo = existsSync('CHANGELOG.md')
      ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\n\n[\s\S]*?\n\n(?=## )/, '')
      : '';
    writeFileSync('CHANGELOG.md', cabecera + entrada + '\n' + previo.trim() + '\n');
    writeFileSync('.release-notes.md', md + '\n');
  }

  console.log(JSON.stringify({ version, bump, commits: commits.length, avisos, notas: md }, null, 2));
}

// Solo corre si se invoca directo — así los tests pueden importar las funciones.
if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) main();
