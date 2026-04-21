# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.test.ts >> sign-up crea cuenta nueva y redirige al dashboard
- Location: tests/auth.test.ts:40:5

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation to "http://localhost:3000/dashboard" until "load"
  navigated to "http://localhost:3000/pricing?welcome=1"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e5]:
        - generic [ref=e6]: Facturación electrónica certificada por la DGII
        - generic [ref=e7]:
          - generic [ref=e8]: test_1776546224805@emitedo.test
          - link "Ir al dashboard →" [ref=e9] [cursor=pointer]:
            - /url: /dashboard
      - navigation [ref=e10]:
        - generic [ref=e11]:
          - link "E EmiteDO" [ref=e12] [cursor=pointer]:
            - /url: /
            - generic [ref=e14]: E
            - generic [ref=e15]: EmiteDO
          - generic [ref=e16]:
            - link "Características" [ref=e17] [cursor=pointer]:
              - /url: /#caracteristicas
            - link "Precios" [ref=e18] [cursor=pointer]:
              - /url: /pricing
            - link "Cómo funciona" [ref=e19] [cursor=pointer]:
              - /url: /#como-funciona
            - link "Contacto" [ref=e20] [cursor=pointer]:
              - /url: /#contacto
          - link "Ir al dashboard" [ref=e22] [cursor=pointer]:
            - /url: /dashboard
    - generic [ref=e23]:
      - generic [ref=e24]:
        - generic [ref=e25]: 🎉
        - generic [ref=e26]:
          - paragraph [ref=e27]: ¡Cuenta creada! Elige tu plan para empezar
          - paragraph [ref=e28]:
            - text: Todos los planes incluyen
            - strong [ref=e29]: 15 días de prueba gratis
            - text: . Cancela cuando quieras.
      - generic [ref=e30]:
        - heading "Planes y precios" [level=1] [ref=e31]
        - paragraph [ref=e32]: Precios en dólares (USD). Prueba 15 días gratis. Sin contratos. Cancela cuando quieras.
      - generic [ref=e33]:
        - generic [ref=e34]:
          - generic [ref=e35]:
            - heading "Starter" [level=2] [ref=e36]
            - paragraph [ref=e37]: Para freelancers y negocios unipersonales
            - generic [ref=e38]:
              - generic [ref=e39]: $15
              - generic [ref=e40]: USD/mes
            - paragraph [ref=e41]: 15 días gratis, luego $15/mes
          - list [ref=e42]:
            - listitem [ref=e43]:
              - img [ref=e44]
              - generic [ref=e46]: 200 comprobantes/mes
            - listitem [ref=e47]:
              - img [ref=e48]
              - generic [ref=e50]: 1 usuario
            - listitem [ref=e51]:
              - img [ref=e52]
              - generic [ref=e54]: Facturas electrónicas (e-CF)
            - listitem [ref=e55]:
              - img [ref=e56]
              - generic [ref=e58]: Notas de crédito
            - listitem [ref=e59]:
              - img [ref=e60]
              - generic [ref=e62]: Gestión de empresa
            - listitem [ref=e63]:
              - img [ref=e64]
              - generic [ref=e66]: Soporte por email
          - button "Empezar prueba gratis" [ref=e68]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e69]:
          - generic [ref=e70]:
            - heading "Invoice" [level=2] [ref=e71]
            - paragraph [ref=e72]: Solo facturación electrónica ilimitada
            - generic [ref=e73]:
              - generic [ref=e74]: $17
              - generic [ref=e75]: USD/mes
            - paragraph [ref=e76]: 15 días gratis, luego $17/mes
          - list [ref=e77]:
            - listitem [ref=e78]:
              - img [ref=e79]
              - generic [ref=e81]: Comprobantes ilimitados
            - listitem [ref=e82]:
              - img [ref=e83]
              - generic [ref=e85]: Hasta 2 usuarios
            - listitem [ref=e86]:
              - img [ref=e87]
              - generic [ref=e89]: Facturas electrónicas (e-CF)
            - listitem [ref=e90]:
              - img [ref=e91]
              - generic [ref=e93]: Notas de crédito
            - listitem [ref=e94]:
              - img [ref=e95]
              - generic [ref=e97]: Gestión de clientes y productos
            - listitem [ref=e98]:
              - img [ref=e99]
              - generic [ref=e101]: Configuración de empresa
            - listitem [ref=e102]:
              - img [ref=e103]
              - generic [ref=e105]: Soporte por email
          - button "Empezar prueba gratis" [ref=e107]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e108]:
          - generic [ref=e109]: Más popular
          - generic [ref=e110]:
            - heading "Business" [level=2] [ref=e111]
            - paragraph [ref=e112]: Para PyMEs en crecimiento
            - generic [ref=e113]:
              - generic [ref=e114]: $35
              - generic [ref=e115]: USD/mes
            - paragraph [ref=e116]: 15 días gratis, luego $35/mes
          - list [ref=e117]:
            - listitem [ref=e118]:
              - img [ref=e119]
              - generic [ref=e121]: 800 comprobantes/mes
            - listitem [ref=e122]:
              - img [ref=e123]
              - generic [ref=e125]: Hasta 3 usuarios
            - listitem [ref=e126]:
              - img [ref=e127]
              - generic [ref=e129]: Todo lo de Starter +
            - listitem [ref=e130]:
              - img [ref=e131]
              - generic [ref=e133]: Clientes y productos
            - listitem [ref=e134]:
              - img [ref=e135]
              - generic [ref=e137]: Cotizaciones
            - listitem [ref=e138]:
              - img [ref=e139]
              - generic [ref=e141]: Facturas recurrentes
            - listitem [ref=e142]:
              - img [ref=e143]
              - generic [ref=e145]: Inventario (almacenes, categorías, listas de precios)
            - listitem [ref=e146]:
              - img [ref=e147]
              - generic [ref=e149]: Reportes DGII (606, 607, 608, 609)
            - listitem [ref=e150]:
              - img [ref=e151]
              - generic [ref=e153]: Registro de actividad
          - button "Empezar prueba gratis" [ref=e155]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e156]:
          - generic [ref=e157]:
            - heading "Pro" [level=2] [ref=e158]
            - paragraph [ref=e159]: Para empresas con alto volumen
            - generic [ref=e160]:
              - generic [ref=e161]: $65
              - generic [ref=e162]: USD/mes
            - paragraph [ref=e163]: 15 días gratis, luego $65/mes
          - list [ref=e164]:
            - listitem [ref=e165]:
              - img [ref=e166]
              - generic [ref=e168]: Comprobantes ilimitados
            - listitem [ref=e169]:
              - img [ref=e170]
              - generic [ref=e172]: Usuarios ilimitados
            - listitem [ref=e173]:
              - img [ref=e174]
              - generic [ref=e176]: Todo lo de Business +
            - listitem [ref=e177]:
              - img [ref=e178]
              - generic [ref=e180]: API REST
            - listitem [ref=e181]:
              - img [ref=e182]
              - generic [ref=e184]: Webhooks
            - listitem [ref=e185]:
              - img [ref=e186]
              - generic [ref=e188]: Integración con impresoras fiscales
            - listitem [ref=e189]:
              - img [ref=e190]
              - generic [ref=e192]: Soporte prioritario
          - button "Empezar prueba gratis" [ref=e194]:
            - text: Empezar prueba gratis
            - img
      - generic [ref=e195]:
        - paragraph [ref=e196]: ✓ 15 días de prueba gratis en todos los planes — sin tarjeta de crédito
        - paragraph [ref=e197]:
          - text: ¿Necesitas más de 800 comprobantes o integración personalizada?
          - link "Contáctanos" [ref=e198] [cursor=pointer]:
            - /url: mailto:hola@emitedo.com
  - region "Notifications alt+T"
  - alert [ref=e199]
```

# Test source

```ts
  1   | /**
  2   |  * Tests E2E del flujo de autenticación de EmiteDO
  3   |  * Prueba: sign-up, sign-in, acceso al dashboard, logout
  4   |  */
  5   | 
  6   | import { test, expect } from '@playwright/test';
  7   | 
  8   | const BASE = 'http://localhost:3000';
  9   | const TEST_EMAIL = `test_${Date.now()}@emitedo.test`;
  10  | const TEST_PASS = 'TestPass123!';
  11  | 
  12  | // ─── Landing page ─────────────────────────────────────────────────────────────
  13  | test('landing page carga con branding EmiteDO', async ({ page }) => {
  14  |   await page.goto(BASE);
  15  |   await expect(page).toHaveTitle(/EmiteDO/);
  16  |   await expect(page.locator('text=EmiteDO').first()).toBeVisible();
  17  |   await expect(page.locator('text=Ley 32-23').first()).toBeVisible();
  18  |   await expect(page.locator('text=DGII').first()).toBeVisible();
  19  |   await expect(page.locator('text=e-CF').first()).toBeVisible();
  20  | });
  21  | 
  22  | // ─── Pricing page ─────────────────────────────────────────────────────────────
  23  | test('pricing page muestra los 4 planes en DOP', async ({ page }) => {
  24  |   await page.goto(`${BASE}/pricing`);
  25  |   // Verificar los headings de los planes (h2)
  26  |   await expect(page.getByRole('heading', { name: 'Gratis' })).toBeVisible();
  27  |   await expect(page.getByRole('heading', { name: 'Básico' })).toBeVisible();
  28  |   await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
  29  |   await expect(page.getByRole('heading', { name: 'Business' })).toBeVisible();
  30  |   await expect(page.locator('text=DOP').first()).toBeVisible();
  31  | });
  32  | 
  33  | // ─── Rutas protegidas ─────────────────────────────────────────────────────────
  34  | test('dashboard redirige a sign-in sin sesión', async ({ page }) => {
  35  |   await page.goto(`${BASE}/dashboard`);
  36  |   await expect(page).toHaveURL(/sign-in/);
  37  | });
  38  | 
  39  | // ─── Sign-up ──────────────────────────────────────────────────────────────────
  40  | test('sign-up crea cuenta nueva y redirige al dashboard', async ({ page }) => {
  41  |   await page.goto(`${BASE}/sign-up`);
  42  | 
  43  |   // Llenar el formulario
  44  |   await page.fill('input[name="email"]', TEST_EMAIL);
  45  |   await page.fill('input[name="password"]', TEST_PASS);
  46  | 
  47  |   // Submit y esperar redirect
  48  |   await Promise.all([
> 49  |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
      |          ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  50  |     page.click('button[type="submit"]'),
  51  |   ]);
  52  | 
  53  |   // Verificar que estamos en el dashboard
  54  |   await expect(page).toHaveURL(/dashboard/);
  55  |   console.log(`✓ Sign-up exitoso: ${TEST_EMAIL}`);
  56  | });
  57  | 
  58  | // ─── Dashboard accesible post-auth ────────────────────────────────────────────
  59  | test('dashboard carga correctamente con sesión activa', async ({ page }) => {
  60  |   // Sign-in primero
  61  |   await page.goto(`${BASE}/sign-in`);
  62  |   await page.fill('input[name="email"]', 'admin@emitedo.test');
  63  |   await page.fill('input[name="password"]', 'Admin1234!');
  64  | 
  65  |   await Promise.all([
  66  |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
  67  |     page.click('button[type="submit"]'),
  68  |   ]);
  69  | 
  70  |   await expect(page).toHaveURL(/dashboard/);
  71  | 
  72  |   // Verificar que el dashboard tiene contenido
  73  |   const body = await page.textContent('body');
  74  |   expect(body).toBeTruthy();
  75  |   console.log('✓ Dashboard accesible después de sign-in');
  76  | });
  77  | 
  78  | // ─── Sign-in con credenciales del seed ────────────────────────────────────────
  79  | test('sign-in con credenciales de prueba funciona', async ({ page }) => {
  80  |   await page.goto(`${BASE}/sign-in`);
  81  | 
  82  |   await page.fill('input[name="email"]', 'admin@emitedo.test');
  83  |   await page.fill('input[name="password"]', 'Admin1234!');
  84  | 
  85  |   await Promise.all([
  86  |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
  87  |     page.click('button[type="submit"]'),
  88  |   ]);
  89  | 
  90  |   await expect(page).toHaveURL(/dashboard/);
  91  |   console.log('✓ Sign-in con admin@emitedo.test exitoso');
  92  | });
  93  | 
  94  | // ─── Sign-in con credenciales incorrectas ────────────────────────────────────
  95  | test('sign-in muestra error con contraseña incorrecta', async ({ page }) => {
  96  |   await page.goto(`${BASE}/sign-in`);
  97  | 
  98  |   await page.fill('input[name="email"]', 'admin@emitedo.test');
  99  |   await page.fill('input[name="password"]', 'ContraseñaMal123!');
  100 |   await page.click('button[type="submit"]');
  101 | 
  102 |   // Esperar el mensaje de error (no redirect)
  103 |   await page.waitForSelector('.text-red-500', { timeout: 5000 });
  104 |   const errorText = await page.textContent('.text-red-500');
  105 |   expect(errorText).toContain('Invalid');
  106 |   console.log('✓ Error de credenciales mostrado correctamente:', errorText);
  107 | });
  108 | 
  109 | // ─── Logout ───────────────────────────────────────────────────────────────────
  110 | test('logout cierra sesión y redirige al home', async ({ page }) => {
  111 |   // Login primero
  112 |   await page.goto(`${BASE}/sign-in`);
  113 |   await page.fill('input[name="email"]', 'admin@emitedo.test');
  114 |   await page.fill('input[name="password"]', 'Admin1234!');
  115 | 
  116 |   await Promise.all([
  117 |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
  118 |     page.click('button[type="submit"]'),
  119 |   ]);
  120 | 
  121 |   await expect(page).toHaveURL(/dashboard/);
  122 | 
  123 |   // Abrir el menú de usuario (avatar en el header)
  124 |   await page.locator('button[aria-haspopup]').first().click();
  125 |   // Click en "Sign out" en el dropdown
  126 |   await page.getByText('Sign out').click();
  127 | 
  128 |   // Esperar a que la cookie se borre
  129 |   await page.waitForTimeout(500);
  130 | 
  131 |   // Después del logout, /dashboard debe redirigir a sign-in
  132 |   await page.goto(`${BASE}/dashboard`);
  133 |   await expect(page).toHaveURL(/sign-in/);
  134 |   console.log('✓ Logout funciona correctamente');
  135 | });
  136 | 
```