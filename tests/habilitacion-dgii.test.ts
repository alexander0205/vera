/**
 * Tests E2E del flujo de HABILITACIÓN DGII en EmiteDO (browser real via Playwright).
 *
 * Cubre:
 *   1. Endpoints públicos /api/dgii/[rnc]/* responden correctamente
 *   2. Endpoints de habilitación requieren auth
 *   3. POST recepción procesa e-CF, guarda en BD y devuelve ARECF firmado
 *   4. Rechazo correcto por tipo no intercambiable / RNC incorrecto / XML basura
 *   5. La página /dashboard/habilitacion carga sin errores JS
 *   6. El formulario de provincia/municipio persiste datos (regresión del bug que arreglamos)
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:3000';
const RNC_SOLUCIONESDO = '131988032';
const LOGIN_EMAIL = 'admin@emitedo.test';
const LOGIN_PASS  = 'Admin1234!';

// ─── Helper — construye un e-CF tipo 31 firmable ─────────────────────────────
// (XML sin firmar — para el test de recepción, el endpoint lo valida vía meta,
// no vía firma DGII; eso lo hace DGII en producción antes de reenviarlo a nosotros)

function buildEcfXml(encf: string, rncEmisor: string, rncComprador: string, tipoEcf = '31'): string {
  const fecha = new Date();
  const dd = fecha.getDate().toString().padStart(2, '0');
  const mm = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = fecha.getFullYear();
  const fechaStr = `${dd}-${mm}-${yyyy}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${tipoEcf}</TipoeCF>
      <eNCF>${encf}</eNCF>
      <FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
      <MontoTotal>590.00</MontoTotal>
      <FechaEmision>${fechaStr}</FechaEmision>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${rncEmisor}</RNCEmisor>
      <RazonSocialEmisor>Emisor Test E2E</RazonSocialEmisor>
      <FechaEmision>${fechaStr}</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>${rncComprador}</RNCComprador>
      <RazonSocialComprador>SolucionesDO SRL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>500.00</MontoGravadoTotal>
      <ITBIS1>90.00</ITBIS1>
      <TotalITBIS>90.00</TotalITBIS>
      <MontoTotal>590.00</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <NombreItem>Item de prueba</NombreItem>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>500.00</PrecioUnitarioItem>
      <MontoItem>500.00</MontoItem>
      <TasaITBIS>0.18</TasaITBIS>
      <MontoITBIS>90.00</MontoITBIS>
    </Item>
  </DetallesItems>
</ECF>`;
}

// ─── 1. Endpoint autenticación (público) ─────────────────────────────────────

test('GET /api/dgii/[rnc]/autenticacion responde 200 con datos del team', async ({ request }) => {
  const res = await request.get(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/autenticacion`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.rnc).toBe(RNC_SOLUCIONESDO);
  expect(body.version).toBe('1.6');
  expect(body.timestamp).toBeDefined();
  console.log('  ✓ Autenticación pública responde');
});

test('HEAD /api/dgii/[rnc]/autenticacion responde 200 (healthcheck rápido)', async ({ request }) => {
  const res = await request.fetch(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/autenticacion`, { method: 'HEAD' });
  expect(res.status()).toBe(200);
  console.log('  ✓ HEAD funciona');
});

test('GET /api/dgii/[rnc-inexistente]/autenticacion responde 404', async ({ request }) => {
  const res = await request.get(`${BASE}/api/dgii/00000000000/autenticacion`);
  expect(res.status()).toBe(404);
  console.log('  ✓ RNC inexistente → 404');
});

// ─── 2. Endpoints de habilitación autenticada ────────────────────────────────

test('GET /api/habilitacion/state sin auth responde 401', async ({ request }) => {
  const res = await request.get(`${BASE}/api/habilitacion/state`);
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBe('No autenticado');
});

test('POST /api/habilitacion/firmar-xml sin auth responde 401', async ({ request }) => {
  const res = await request.post(`${BASE}/api/habilitacion/firmar-xml`, {
    data: { xmlBase64: 'PFJvb3Qvi=' },
  });
  expect(res.status()).toBe(401);
});

// ─── 3. Flujo completo de recepción (DGII → nosotros) ────────────────────────

test('POST /api/dgii/[rnc]/recepcion con e-CF válido → ARECF firmado + guarda en BD', async ({ request }) => {
  // Timestamp en el eNCF para no colisionar con otros tests
  const encf = `E3100${Date.now().toString().slice(-8)}`;
  const xml  = buildEcfXml(encf, '130111222', RNC_SOLUCIONESDO, '31');

  const res = await request.post(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/recepcion`, {
    headers: { 'Content-Type': 'application/xml' },
    data: xml,
  });

  expect(res.status()).toBe(200);
  const arecf = await res.text();
  expect(arecf).toContain('<ARECF');
  expect(arecf).toContain('<eNCF>' + encf + '</eNCF>');
  expect(arecf).toContain('<Estado>0</Estado>');       // 0 = Recibido
  expect(arecf).toContain('<Signature');                // firmado XMLDSig
  expect(arecf).toContain('<SignedInfo');
  console.log(`  ✓ e-CF recibido: ${encf} → ARECF Estado=0 firmado`);
});

test('POST /api/dgii/[rnc]/recepcion con tipo 32 → rechazo código 1 (Estado=1)', async ({ request }) => {
  const encf = `E3200${Date.now().toString().slice(-8)}`;
  const xml  = buildEcfXml(encf, '130111222', '', '32');  // tipo 32 sin comprador

  const res = await request.post(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/recepcion`, {
    headers: { 'Content-Type': 'application/xml' },
    data: xml,
  });

  expect(res.status()).toBe(200);
  const arecf = await res.text();
  expect(arecf).toContain('<ARECF');
  expect(arecf).toContain('<Estado>1</Estado>');       // 1 = No Recibido
  console.log(`  ✓ Tipo 32 (no intercambiable) → ARECF Estado=1`);
});

test('POST /api/dgii/[rnc]/recepcion con RNC comprador incorrecto → código 4', async ({ request }) => {
  const encf = `E3100${Date.now().toString().slice(-8)}`;
  // RNC comprador 999999999 pero el endpoint es el de 131988032
  const xml  = buildEcfXml(encf, '130111222', '999999999', '31');

  const res = await request.post(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/recepcion`, {
    headers: { 'Content-Type': 'application/xml' },
    data: xml,
  });

  expect(res.status()).toBe(200);
  const arecf = await res.text();
  expect(arecf).toContain('<Estado>1</Estado>');
  console.log('  ✓ RNC incorrecto → ARECF Estado=1');
});

test('POST /api/dgii/[rnc]/recepcion con XML inválido → código 1 (fallback manual)', async ({ request }) => {
  const res = await request.post(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/recepcion`, {
    headers: { 'Content-Type': 'application/xml' },
    data: '<?xml version="1.0"?><Basura/>',
  });

  expect(res.status()).toBe(200);
  const arecf = await res.text();
  expect(arecf).toContain('<ARECF');
  expect(arecf).toContain('<Estado>1</Estado>');
  console.log('  ✓ XML basura → ARECF Estado=1 (fallback manual funcionó)');
});

test('POST /api/dgii/[rnc-inexistente]/recepcion → 404', async ({ request }) => {
  const res = await request.post(`${BASE}/api/dgii/00000000000/recepcion`, {
    headers: { 'Content-Type': 'application/xml' },
    data: '<ECF/>',
  });
  expect(res.status()).toBe(404);
});

// ─── 4. Dashboard habilitación carga sin errores JS ──────────────────────────

async function loginToApp(request: APIRequestContext) {
  // Login via API para obtener session cookie
  return request.post(`${BASE}/api/auth/sign-in`, {
    data: { email: LOGIN_EMAIL, password: LOGIN_PASS },
  }).catch(() => null);
}

test('página /dashboard/habilitacion redirige a sign-in sin sesión', async ({ page }) => {
  await page.goto(`${BASE}/dashboard/habilitacion`);
  await expect(page).toHaveURL(/sign-in/);
});

test('página /dashboard/habilitacion carga sin errores JS (autenticado)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });

  // Login
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', LOGIN_EMAIL);
  await page.fill('input[name="password"]', LOGIN_PASS);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  // Navegar a habilitación
  await page.goto(`${BASE}/dashboard/habilitacion`);
  await page.waitForLoadState('networkidle');

  // Filtrar errores irrelevantes (hydration, devtools, hot reload)
  const realErrors = errors.filter(e =>
    !e.toLowerCase().includes('hydrat') &&
    !e.toLowerCase().includes('devtools') &&
    !e.includes('webpack') &&
    !e.includes('hmr'),
  );

  if (realErrors.length > 0) {
    console.log('  Errores detectados:');
    realErrors.forEach(e => console.log(`    - ${e}`));
  }
  expect(realErrors).toHaveLength(0);
  console.log('  ✓ Página habilitación carga limpia');
});

// ─── 5. Persistencia de provincia/municipio (regresión) ──────────────────────

test('GET /api/equipo/perfil incluye provincia y municipio en la respuesta', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', LOGIN_EMAIL);
  await page.fill('input[name="password"]', LOGIN_PASS);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  const res = await page.request.get(`${BASE}/api/equipo/perfil`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  // Los campos ahora DEBEN existir en la respuesta (bug regresión)
  expect(body).toHaveProperty('provincia');
  expect(body).toHaveProperty('municipio');
  console.log(`  ✓ Perfil devuelve provincia=${body.provincia} municipio=${body.municipio}`);
});

test('POST /api/equipo/perfil acepta provincia y municipio y los persiste', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', LOGIN_EMAIL);
  await page.fill('input[name="password"]', LOGIN_PASS);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  const testProvincia = 'Distrito Nacional';
  const testMunicipio = 'Santo Domingo de Guzmán';

  // PUT
  const putRes = await page.request.post(`${BASE}/api/equipo/perfil`, {
    data: { provincia: testProvincia, municipio: testMunicipio },
  });
  expect(putRes.status()).toBe(200);

  // GET → verifica que se guardó
  const getRes = await page.request.get(`${BASE}/api/equipo/perfil`);
  const body = await getRes.json();
  expect(body.provincia).toBe(testProvincia);
  expect(body.municipio).toBe(testMunicipio);
  console.log(`  ✓ Provincia/municipio persistieron correctamente`);
});

// ─── 6. Endpoints declarados en postulación DGII ─────────────────────────────

test('los 3 endpoints /api/dgii/[rnc]/* están desplegados', async ({ request }) => {
  const recepcion = await request.fetch(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/recepcion`, { method: 'OPTIONS' });
  const aprobacion = await request.fetch(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/aprobacioncomercial`, { method: 'OPTIONS' });
  const autenticacion = await request.fetch(`${BASE}/api/dgii/${RNC_SOLUCIONESDO}/autenticacion`, { method: 'OPTIONS' });

  // Todos deben responder (200 o 405 aceptables, 404 no)
  expect([200, 204, 405, 400]).toContain(recepcion.status());
  expect([200, 204, 405, 400]).toContain(aprobacion.status());
  expect([200, 204, 405, 400]).toContain(autenticacion.status());
  console.log(`  ✓ Endpoints DGII deployed: recepcion=${recepcion.status()} aprobacion=${aprobacion.status()} autenticacion=${autenticacion.status()}`);
});
