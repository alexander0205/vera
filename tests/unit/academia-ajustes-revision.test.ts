import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buscarVideos, ofertaAsistente, type VideoBuscable } from '@/lib/academia/busqueda';
import { MAX_GLOBAL_POR_DIA, puedeLlamarAlModelo, type Limitador } from '@/lib/academia/limite';
import { pieDeMenu } from '@/lib/academia/menu';
import { MAX_TOKENS_SALIDA, opcionesSinRazonamiento } from '@/lib/academia/respuesta';
import { filtrarPorModulos } from '@/lib/academia/reglas';
import { puedeOfrecerPrimeraVez } from '@/lib/academia/tarjeta';
import { MODELOS_IA, USOS_IA, elegirModelos, usosIa } from '@/lib/ia/modelos';

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

const CATALOGO: VideoBuscable[] = [
  { id: 1, slug: 'cobrar', titulo: 'Cobrar una cuenta', descripcion: 'Registrar un abono.', capitulos: [], transcripcion: [] },
];

describe('1. el asistente solo cuando hace falta', () => {
  it('sin nada escrito o sin ningún video que citar, no se ofrece', () => {
    assert.equal(ofertaAsistente('', []), 'ninguna');
    assert.equal(ofertaAsistente('cómo timbro un cheque', buscarVideos(CATALOGO, 'cómo timbro un cheque')), 'ninguna');
  });
  it('con buenos resultados es un botón disponible, no una llamada automática', () => {
    assert.equal(ofertaAsistente('cobrar una cuenta', buscarVideos(CATALOGO, 'cobrar una cuenta')), 'disponible');
  });
  it('con una pregunta y resultados flojos se sugiere', () => {
    const q = 'cómo hago para ver la lista de proveedores';
    const r = buscarVideos([{ ...CATALOGO[0], transcripcion: [{ t: 9, texto: 'Aquí ves la lista de proveedores.' }] }], q);
    assert.ok(r.length > 0);
    assert.equal(ofertaAsistente(q, r), 'sugerida');
  });
  it('el inicio no llama al modelo con Enter ni con las sugerencias: solo el botón explícito', () => {
    const s = leer('components', 'academia', 'AcademiaInicio.tsx');
    // Un solo sitio llama al POST del asistente: la función `preguntar`, que cuelga del botón.
    assert.equal(s.split("method: 'POST'").length - 1, 1);
    assert.match(s, /onSubmit=\{\(e\) => \{ e\.preventDefault\(\); \}\}/);
    assert.match(s, /onClick=\{\(\) => setQ\(s\)\}/);
    assert.match(s, /Preguntarle al asistente/);
    assert.ok(!s.includes('promete'));
    assert.ok(!/pulsa «Preguntar»/.test(s));
  });
});

describe('2. costo de la IA', () => {
  it('la Academia es un uso aparte, con un modelo barato por defecto', () => {
    assert.ok(USOS_IA.includes('academia'));
    const u = usosIa().find((x) => x.uso === 'academia')!;
    assert.equal(u.principal, 'google/gemini-2.5-flash-lite');
    const precio = (id: string) => MODELOS_IA.find((m) => m.id === id)!;
    assert.ok(precio(u.principal).salidaUsd <= precio('google/gemini-2.5-flash').salidaUsd);
    assert.deepEqual(elegirModelos(null, 'academia'), { principal: u.principal, respaldo: u.respaldo });
  });
  it('el asistente de la Academia usa SU uso, no el del chat', () => {
    const s = leer('lib', 'academia', 'asistente.ts');
    assert.match(s, /modelosDe\('academia'\)/);
    assert.match(s, /uso: 'academia'/);
    assert.ok(!s.includes("modelosDe('asistente')"));
  });
  it('se apaga el razonamiento de Gemini y la salida deja margen', () => {
    assert.deepEqual(opcionesSinRazonamiento('google/gemini-2.5-flash'), { google: { thinkingConfig: { thinkingBudget: 0 } } });
    assert.deepEqual(opcionesSinRazonamiento('google/gemini-2.5-flash-lite'), { google: { thinkingConfig: { thinkingBudget: 0 } } });
    assert.deepEqual(opcionesSinRazonamiento('google/gemini-3-flash'), { google: { thinkingConfig: { thinkingLevel: 'low' } } });
    assert.equal(opcionesSinRazonamiento('anthropic/claude-haiku-5.5'), undefined);
    assert.ok(MAX_TOKENS_SALIDA >= 800);
    assert.match(leer('lib', 'academia', 'asistente.ts'), /opcionesSinRazonamiento\(id\)/);
  });
  it('hay un tope TOTAL por día para toda la plataforma', async () => {
    const cuentas = new Map<string, number>();
    const limitar: Limitador = async (clave, max) => {
      const n = (cuentas.get(clave) ?? 0) + 1;
      cuentas.set(clave, n);
      return { allowed: n <= max };
    };
    // Muchas personas distintas, cada una con poco uso: el total acaba cortando.
    let pasaron = 0;
    for (let i = 0; i < MAX_GLOBAL_POR_DIA + 20; i++) if (await puedeLlamarAlModelo(1000 + i, limitar)) pasaron++;
    assert.equal(pasaron, MAX_GLOBAL_POR_DIA);
  });
  it('el POST de buscar tiene el mismo tope en memoria que el GET', () => {
    const s = leer('app', 'api', 'academia', 'buscar', 'route.ts');
    const post = s.slice(s.indexOf('export async function POST'));
    assert.match(post, /rateLimit\(`academia-buscar:/);
    assert.match(post, /puedeLlamarAlModelo\(user\.id, rateLimitDb\)/);
  });
});

describe('3. la tarjeta no reaparece y el «visto» se propaga', () => {
  const s = leer('components', 'academia', 'TutorialDePantalla.tsx');
  it('al descartar o deshacer se borra la respuesta guardada de 3 s', () => {
    const enviar = s.slice(s.indexOf('async function enviar'), s.indexOf('// Los dos modos'));
    assert.match(enviar, /enVuelo\.delete\(pantalla\)/);
  });
  it('el cuadro del video avisa cuando se vio y la tarjeta y el panel lo reflejan', () => {
    assert.match(s, /alVisto=\{marcarVisto\}/);
    assert.match(s, /EVENTO_VISTO/);
    assert.match(s, /todoVisto/);
    assert.match(leer('components', 'academia', 'VideoDialogo.tsx'), /alVisto=\{\(\) => alVisto\?\.\(video\)\}/);
  });
});

describe('4. Facturas: la tarjeta de primera vez', () => {
  const ok = { cargando: false, cargaOk: true, total: 0, filtros: {} };
  it('solo con respuesta correcta de 0 facturas y sin filtros', () => {
    assert.equal(puedeOfrecerPrimeraVez(ok), true);
  });
  it('si la carga falló, no', () => {
    assert.equal(puedeOfrecerPrimeraVez({ ...ok, cargaOk: false }), false);
  });
  it('mientras carga, con facturas o con algún filtro, no', () => {
    assert.equal(puedeOfrecerPrimeraVez({ ...ok, cargando: true }), false);
    assert.equal(puedeOfrecerPrimeraVez({ ...ok, total: 3 }), false);
    assert.equal(puedeOfrecerPrimeraVez({ ...ok, filtros: { estado: 'ANULADA' } }), false);
  });
  it('la página marca la carga como mala cuando /api/facturas no responde bien', () => {
    const s = leer('app', '(dashboard)', 'dashboard', 'facturas', 'page.tsx');
    assert.match(s, /setCargaOk\(false\)/);
    assert.match(s, /puedeOfrecerPrimeraVez\(/);
  });
});

describe('5. pie de los menús', () => {
  it('con otros módulos: bloque «Módulos» y la Academia SIN separador propio (nunca dos líneas)', () => {
    assert.deepEqual(pieDeMenu(2, false), { bloqueModulos: true, academia: true, separadorPropioAcademia: false });
  });
  it('con un solo módulo: no hay bloque «Módulos»; la Academia trae su separador', () => {
    assert.deepEqual(pieDeMenu(0, false), { bloqueModulos: false, academia: true, separadorPropioAcademia: true });
  });
  it('en el menú de la propia Academia no se repite', () => {
    assert.equal(pieDeMenu(3, true).academia, false);
    assert.equal(pieDeMenu(0, true).separadorPropioAcademia, false);
  });
  it('el armazón lo aplica y el enlace anuncia el cambio como los demás', () => {
    assert.match(leer('components', 'rail', 'RailArmazon.tsx'), /esMenuDeLaAcademia=\{modulo === null\}/);
    const s = leer('components', 'rail-modulos.tsx');
    assert.match(s, /anunciarCambioDeModulo\('Academia'\)/);
    assert.match(s, /pieDeMenu\(/);
  });
});

describe('6. la Academia muestra los módulos de la empresa', () => {
  const v = (modulo: string) => ({ modulo });
  it('los de sus módulos más «General»', () => {
    const r = filtrarPorModulos([v('facturacion'), v('escolar'), v('general'), v('pos')], ['facturacion', 'contabilidad']);
    assert.deepEqual(r.map((x) => x.modulo), ['facturacion', 'general']);
  });
  it('sin módulos, solo «General»', () => {
    assert.deepEqual(filtrarPorModulos([v('pos'), v('general')], []).map((x) => x.modulo), ['general']);
  });
  it('null = sin filtro (administrador de la plataforma)', () => {
    assert.equal(filtrarPorModulos([v('pos'), v('general')], null).length, 2);
  });
  it('la página y el buscador lo aplican', () => {
    assert.match(leer('app', 'academia', 'page.tsx'), /filtrarPorModulos\(/);
    assert.match(leer('app', 'api', 'academia', 'buscar', 'route.ts'), /filtrarPorModulos\(/);
  });
});

describe('7. el cuadro y el panel se bajan solo al abrirlos', () => {
  const s = leer('components', 'academia', 'TutorialDePantalla.tsx');
  it('van con dynamic() y se montan solo abiertos', () => {
    assert.match(s, /VideoDialogo = dynamic\(/);
    assert.match(s, /PanelAprender = dynamic\(/);
    assert.match(s, /\{viendo && <VideoDialogo/);
    assert.match(s, /\{panel && \(\s*<PanelAprender/);
  });
  it('la pantalla ya no importa MUI Drawer ni el reproductor directamente', () => {
    assert.ok(!s.includes('@mui/material/Drawer'));
    assert.ok(!/from '\.\/(VideoDialogo|PanelAprender|PlayerVideo)'/.test(s));
  });
});
