# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.test.ts >> pricing page muestra los 4 planes en DOP
- Location: tests/auth.test.ts:23:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Gratis' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Gratis' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e5]:
        - generic [ref=e6]: Facturación electrónica certificada por la DGII
        - generic [ref=e7]:
          - link "Iniciar sesión" [ref=e8] [cursor=pointer]:
            - /url: /sign-in
          - link "Crear cuenta" [ref=e9] [cursor=pointer]:
            - /url: /sign-up
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
          - generic [ref=e21]:
            - link "Iniciar sesión" [ref=e22] [cursor=pointer]:
              - /url: /sign-in
            - link "Empezar gratis →" [ref=e23] [cursor=pointer]:
              - /url: /sign-up
    - generic [ref=e24]:
      - generic [ref=e25]:
        - heading "Planes y precios" [level=1] [ref=e26]
        - paragraph [ref=e27]: Precios en dólares (USD). Prueba 15 días gratis. Sin contratos. Cancela cuando quieras.
      - generic [ref=e28]:
        - generic [ref=e29]:
          - generic [ref=e30]:
            - heading "Starter" [level=2] [ref=e31]
            - paragraph [ref=e32]: Para freelancers y negocios unipersonales
            - generic [ref=e33]:
              - generic [ref=e34]: $15
              - generic [ref=e35]: USD/mes
            - paragraph [ref=e36]: 15 días gratis, luego $15/mes
          - list [ref=e37]:
            - listitem [ref=e38]:
              - img [ref=e39]
              - generic [ref=e41]: 200 comprobantes/mes
            - listitem [ref=e42]:
              - img [ref=e43]
              - generic [ref=e45]: 1 usuario
            - listitem [ref=e46]:
              - img [ref=e47]
              - generic [ref=e49]: Facturas electrónicas (e-CF)
            - listitem [ref=e50]:
              - img [ref=e51]
              - generic [ref=e53]: Notas de crédito
            - listitem [ref=e54]:
              - img [ref=e55]
              - generic [ref=e57]: Gestión de empresa
            - listitem [ref=e58]:
              - img [ref=e59]
              - generic [ref=e61]: Soporte por email
          - button "Empezar prueba gratis" [ref=e63]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e64]:
          - generic [ref=e65]:
            - heading "Invoice" [level=2] [ref=e66]
            - paragraph [ref=e67]: Solo facturación electrónica ilimitada
            - generic [ref=e68]:
              - generic [ref=e69]: $17
              - generic [ref=e70]: USD/mes
            - paragraph [ref=e71]: 15 días gratis, luego $17/mes
          - list [ref=e72]:
            - listitem [ref=e73]:
              - img [ref=e74]
              - generic [ref=e76]: Comprobantes ilimitados
            - listitem [ref=e77]:
              - img [ref=e78]
              - generic [ref=e80]: Hasta 2 usuarios
            - listitem [ref=e81]:
              - img [ref=e82]
              - generic [ref=e84]: Facturas electrónicas (e-CF)
            - listitem [ref=e85]:
              - img [ref=e86]
              - generic [ref=e88]: Notas de crédito
            - listitem [ref=e89]:
              - img [ref=e90]
              - generic [ref=e92]: Gestión de clientes y productos
            - listitem [ref=e93]:
              - img [ref=e94]
              - generic [ref=e96]: Configuración de empresa
            - listitem [ref=e97]:
              - img [ref=e98]
              - generic [ref=e100]: Soporte por email
          - button "Empezar prueba gratis" [ref=e102]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e103]:
          - generic [ref=e104]: Más popular
          - generic [ref=e105]:
            - heading "Business" [level=2] [ref=e106]
            - paragraph [ref=e107]: Para PyMEs en crecimiento
            - generic [ref=e108]:
              - generic [ref=e109]: $35
              - generic [ref=e110]: USD/mes
            - paragraph [ref=e111]: 15 días gratis, luego $35/mes
          - list [ref=e112]:
            - listitem [ref=e113]:
              - img [ref=e114]
              - generic [ref=e116]: 800 comprobantes/mes
            - listitem [ref=e117]:
              - img [ref=e118]
              - generic [ref=e120]: Hasta 3 usuarios
            - listitem [ref=e121]:
              - img [ref=e122]
              - generic [ref=e124]: Todo lo de Starter +
            - listitem [ref=e125]:
              - img [ref=e126]
              - generic [ref=e128]: Clientes y productos
            - listitem [ref=e129]:
              - img [ref=e130]
              - generic [ref=e132]: Cotizaciones
            - listitem [ref=e133]:
              - img [ref=e134]
              - generic [ref=e136]: Facturas recurrentes
            - listitem [ref=e137]:
              - img [ref=e138]
              - generic [ref=e140]: Inventario (almacenes, categorías, listas de precios)
            - listitem [ref=e141]:
              - img [ref=e142]
              - generic [ref=e144]: Reportes DGII (606, 607, 608, 609)
            - listitem [ref=e145]:
              - img [ref=e146]
              - generic [ref=e148]: Registro de actividad
          - button "Empezar prueba gratis" [ref=e150]:
            - text: Empezar prueba gratis
            - img
        - generic [ref=e151]:
          - generic [ref=e152]:
            - heading "Pro" [level=2] [ref=e153]
            - paragraph [ref=e154]: Para empresas con alto volumen
            - generic [ref=e155]:
              - generic [ref=e156]: $65
              - generic [ref=e157]: USD/mes
            - paragraph [ref=e158]: 15 días gratis, luego $65/mes
          - list [ref=e159]:
            - listitem [ref=e160]:
              - img [ref=e161]
              - generic [ref=e163]: Comprobantes ilimitados
            - listitem [ref=e164]:
              - img [ref=e165]
              - generic [ref=e167]: Usuarios ilimitados
            - listitem [ref=e168]:
              - img [ref=e169]
              - generic [ref=e171]: Todo lo de Business +
            - listitem [ref=e172]:
              - img [ref=e173]
              - generic [ref=e175]: API REST
            - listitem [ref=e176]:
              - img [ref=e177]
              - generic [ref=e179]: Webhooks
            - listitem [ref=e180]:
              - img [ref=e181]
              - generic [ref=e183]: Integración con impresoras fiscales
            - listitem [ref=e184]:
              - img [ref=e185]
              - generic [ref=e187]: Soporte prioritario
          - button "Empezar prueba gratis" [ref=e189]:
            - text: Empezar prueba gratis
            - img
      - generic [ref=e190]:
        - paragraph [ref=e191]: ✓ 15 días de prueba gratis en todos los planes — sin tarjeta de crédito
        - paragraph [ref=e192]:
          - text: ¿Necesitas más de 800 comprobantes o integración personalizada?
          - link "Contáctanos" [ref=e193] [cursor=pointer]:
            - /url: mailto:hola@emitedo.com
  - region "Notifications alt+T"
  - alert [ref=e194]
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
> 26  |   await expect(page.getByRole('heading', { name: 'Gratis' })).toBeVisible();
      |                                                               ^ Error: expect(locator).toBeVisible() failed
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
  49  |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
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
```