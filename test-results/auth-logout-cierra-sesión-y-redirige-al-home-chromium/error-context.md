# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.test.ts >> logout cierra sesión y redirige al home
- Location: tests/auth.test.ts:110:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button[aria-haspopup]').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e6]:
          - generic [ref=e8]: e
          - generic [ref=e9]: EmiteDO
        - navigation [ref=e10]:
          - link "Nueva Factura" [ref=e11] [cursor=pointer]:
            - /url: /dashboard/facturas/nueva
            - img [ref=e12]
            - text: Nueva Factura
          - button "Buscar... ⌘K" [ref=e13]:
            - img [ref=e14]
            - generic [ref=e17]: Buscar...
            - generic [ref=e18]: ⌘K
          - link "Activar facturación e-CF" [ref=e19] [cursor=pointer]:
            - /url: /dashboard/habilitacion
            - img [ref=e20]
            - generic [ref=e22]: Activar facturación e-CF
          - link "Inicio" [ref=e23] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e24]
            - text: Inicio
          - link "Contactos" [ref=e29] [cursor=pointer]:
            - /url: /dashboard/clientes
            - img [ref=e30]
            - text: Contactos
          - link "Reportes" [ref=e35] [cursor=pointer]:
            - /url: /dashboard/reportes
            - img [ref=e36]
            - text: Reportes
          - button "Ingresos" [ref=e40]:
            - img [ref=e41]
            - generic [ref=e44]: Ingresos
            - img [ref=e45]
          - button "Inventario" [ref=e48]:
            - img [ref=e49]
            - generic [ref=e53]: Inventario
            - img [ref=e54]
          - button "Configuración" [ref=e57]:
            - img [ref=e58]
            - generic [ref=e61]: Configuración
            - img [ref=e62]
    - generic [ref=e64]:
      - banner [ref=e65]:
        - button "Yisrael Kid School Yisrael Kid School Business" [ref=e67]:
          - img "Yisrael Kid School" [ref=e68]
          - generic [ref=e69]: Yisrael Kid School
          - generic [ref=e70]: Business
          - img [ref=e71]
        - button "Buscar ⌘K" [ref=e73]:
          - img [ref=e74]
          - generic [ref=e77]: Buscar
          - generic [ref=e78]: ⌘K
        - button "AE" [ref=e80]:
          - generic [ref=e82]: AE
          - img [ref=e83]
      - main [ref=e85]:
        - generic [ref=e86]:
          - generic [ref=e87]:
            - generic [ref=e88]:
              - heading "Panel Principal" [level=1] [ref=e89]
              - paragraph [ref=e90]: "RNC: 131988032"
            - link "Nueva Factura" [ref=e91] [cursor=pointer]:
              - /url: /dashboard/facturas/nueva
              - img
              - text: Nueva Factura
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e95]:
                - img [ref=e96]
                - text: Ingresos del mes
              - generic [ref=e99]:
                - paragraph [ref=e100]: 3,186.00
                - paragraph [ref=e101]: DOP · 3 comprobantes
            - generic [ref=e102]:
              - generic [ref=e104]:
                - img [ref=e105]
                - text: Total histórico
              - generic [ref=e108]:
                - paragraph [ref=e109]: "3"
                - paragraph [ref=e110]: documentos e-CF
            - generic [ref=e111]:
              - generic [ref=e113]:
                - img [ref=e114]
                - text: Secuencias
              - generic [ref=e117]:
                - paragraph [ref=e118]: 7,689
                - paragraph [ref=e119]: disponibles en total
            - generic [ref=e120]:
              - generic [ref=e122]:
                - img [ref=e123]
                - text: Certificado
              - generic [ref=e126]:
                - generic [ref=e127]:
                  - img [ref=e128]
                  - generic [ref=e131]: Activo
                - paragraph [ref=e132]: firma digital INDOTEL
          - generic [ref=e133]:
            - generic [ref=e134]:
              - generic [ref=e135]: Últimos comprobantes
              - link "Ver todos →" [ref=e136] [cursor=pointer]:
                - /url: /dashboard/facturas
            - generic [ref=e138]:
              - generic [ref=e139]:
                - generic [ref=e140]:
                  - paragraph [ref=e141]: BOR-31-MO1R1HYP
                  - paragraph [ref=e142]: Factura de Crédito Fiscal Electrónica · Consumidor Final
                - generic [ref=e143]:
                  - generic [ref=e144]: DOP 118.00
                  - generic [ref=e145]: Borrador
              - generic [ref=e146]:
                - generic [ref=e147]:
                  - paragraph [ref=e148]: BOR-31-MO0GWW93
                  - paragraph [ref=e149]: Factura de Crédito Fiscal Electrónica · Consumidor Final
                - generic [ref=e150]:
                  - generic [ref=e151]: DOP 118.00
                  - generic [ref=e152]: Borrador
              - generic [ref=e153]:
                - generic [ref=e154]:
                  - paragraph [ref=e155]: E320000000001
                  - paragraph [ref=e156]: Factura de Consumo Electrónica · Empresa Ejemplo SRL
                - generic [ref=e157]:
                  - generic [ref=e158]: DOP 2,950.00
                  - generic [ref=e159]: Aceptado
          - generic [ref=e160]:
            - link "Nueva Factura" [ref=e161] [cursor=pointer]:
              - /url: /dashboard/facturas/nueva
              - generic [ref=e162]:
                - img [ref=e163]
                - generic [ref=e164]: Nueva Factura
            - link "Clientes" [ref=e165] [cursor=pointer]:
              - /url: /dashboard/clientes
              - generic [ref=e166]:
                - img [ref=e167]
                - generic [ref=e172]: Clientes
            - link "Productos" [ref=e173] [cursor=pointer]:
              - /url: /dashboard/productos
              - generic [ref=e174]:
                - img [ref=e175]
                - generic [ref=e179]: Productos
            - link "Secuencias" [ref=e180] [cursor=pointer]:
              - /url: /dashboard/secuencias
              - generic [ref=e181]:
                - img [ref=e182]
                - generic [ref=e185]: Secuencias
  - region "Notifications alt+T"
  - alert [ref=e186]
```

# Test source

```ts
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
> 124 |   await page.locator('button[aria-haspopup]').first().click();
      |                                                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
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