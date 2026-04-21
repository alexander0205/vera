# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.test.ts >> dashboard home carga con stats
- Location: tests/dashboard.test.ts:21:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Este mes')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Este mes')

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
  1   | /**
  2   |  * Tests E2E del dashboard y páginas de EmiteDO
  3   |  */
  4   | 
  5   | import { test, expect, type Page } from '@playwright/test';
  6   | 
  7   | const BASE = 'http://localhost:3000';
  8   | 
  9   | // Helper: login con el usuario del seed
  10  | async function login(page: Page) {
  11  |   await page.goto(`${BASE}/sign-in`);
  12  |   await page.fill('input[name="email"]', 'admin@emitedo.test');
  13  |   await page.fill('input[name="password"]', 'Admin1234!');
  14  |   await Promise.all([
  15  |     page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
  16  |     page.click('button[type="submit"]'),
  17  |   ]);
  18  | }
  19  | 
  20  | // ─── Dashboard home ───────────────────────────────────────────────────────────
  21  | test('dashboard home carga con stats', async ({ page }) => {
  22  |   await login(page);
  23  |   await expect(page).toHaveURL(/dashboard/);
  24  | 
  25  |   // Stats cards - usar los títulos exactos de CardTitle
> 26  |   await expect(page.getByText('Este mes')).toBeVisible();
      |                                            ^ Error: expect(locator).toBeVisible() failed
  27  |   await expect(page.getByText('Total histórico')).toBeVisible();
  28  |   await expect(page.getByText('disponibles en total')).toBeVisible();
  29  |   await expect(page.getByText('firma digital INDOTEL')).toBeVisible();
  30  | 
  31  |   // Botón Nueva Factura en el header
  32  |   await expect(page.getByRole('link', { name: 'Nueva Factura' }).first()).toBeVisible();
  33  |   console.log('✓ Dashboard home con stats carga correctamente');
  34  | });
  35  | 
  36  | test('dashboard muestra alerta de certificado pendiente', async ({ page }) => {
  37  |   await login(page);
  38  |   // El usuario del seed no tiene certificado
  39  |   await expect(page.getByText('Certificado digital no configurado')).toBeVisible();
  40  |   console.log('✓ Alerta de certificado pendiente visible');
  41  | });
  42  | 
  43  | test('dashboard muestra secuencias disponibles', async ({ page }) => {
  44  |   await login(page);
  45  |   // Hay secuencias del seed (31,32,33,34,41,43)
  46  |   const seqCard = page.locator('text=Secuencias').first();
  47  |   await expect(seqCard).toBeVisible();
  48  |   console.log('✓ Card de secuencias visible');
  49  | });
  50  | 
  51  | // ─── Nav sidebar ─────────────────────────────────────────────────────────────
  52  | test('sidebar navega a facturas', async ({ page }) => {
  53  |   await login(page);
  54  |   await page.click('text=Facturas');
  55  |   await expect(page).toHaveURL(/dashboard\/facturas/);
  56  |   await expect(page.getByText('Comprobantes Fiscales')).toBeVisible();
  57  |   console.log('✓ Navegación a Facturas funciona');
  58  | });
  59  | 
  60  | test('sidebar navega a clientes', async ({ page }) => {
  61  |   await login(page);
  62  |   await page.goto(`${BASE}/dashboard/clientes`);
  63  |   await expect(page).toHaveURL(/dashboard\/clientes/);
  64  |   await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  65  |   // Los 3 clientes del seed deben aparecer
  66  |   await expect(page.getByText('3 clientes')).toBeVisible();
  67  |   console.log('✓ Navegación a Clientes funciona');
  68  | });
  69  | 
  70  | test('sidebar navega a secuencias', async ({ page }) => {
  71  |   await login(page);
  72  |   await page.click('text=Secuencias NCF');
  73  |   await expect(page).toHaveURL(/dashboard\/secuencias/);
  74  |   // Las secuencias del seed deben verse
  75  |   await expect(page.getByText('e-31')).toBeVisible();
  76  |   await expect(page.getByText('e-32')).toBeVisible();
  77  |   console.log('✓ Página Secuencias muestra tipos del seed');
  78  | });
  79  | 
  80  | test('sidebar navega a certificado', async ({ page }) => {
  81  |   await login(page);
  82  |   await page.click('text=Certificado');
  83  |   await expect(page).toHaveURL(/dashboard\/certificado/);
  84  |   await expect(page.getByText('Certificado Digital')).toBeVisible();
  85  |   await expect(page.getByText('Subir certificado P12')).toBeVisible();
  86  |   console.log('✓ Página Certificado carga correctamente');
  87  | });
  88  | 
  89  | // ─── Nueva Factura ────────────────────────────────────────────────────────────
  90  | test('página Nueva Factura carga el formulario', async ({ page }) => {
  91  |   await login(page);
  92  |   await page.goto(`${BASE}/dashboard/facturas/nueva`);
  93  |   await expect(page).toHaveURL(/facturas\/nueva/);
  94  | 
  95  |   // Sincronizar sobre el botón submit (sabemos que funciona en otros tests).
  96  |   // No usar networkidle: el streaming de PPR en Next 15 nunca cierra la red.
  97  |   const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  98  |   await expect(submitBtn).toBeVisible({ timeout: 15000 });
  99  | 
  100 |   await expect(page.getByText('Tipo de comprobante')).toBeVisible();
  101 |   await expect(page.getByText('Productos / Servicios')).toBeVisible();
  102 |   console.log('✓ Formulario Nueva Factura carga correctamente');
  103 | });
  104 | 
  105 | test('formulario calcula totales en tiempo real', async ({ page }) => {
  106 |   await login(page);
  107 |   await page.goto(`${BASE}/dashboard/facturas/nueva`);
  108 | 
  109 |   // Esperar a que el botón esté listo (sincronización PPR-safe)
  110 |   const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  111 |   await expect(submitBtn).toBeVisible({ timeout: 15000 });
  112 | 
  113 |   // Rellenar nombre del item
  114 |   const nombreInput = page.locator('input[placeholder="Servicio de diseño web"]');
  115 |   await nombreInput.waitFor({ state: 'visible', timeout: 5000 });
  116 |   await nombreInput.fill('Desarrollo web');
  117 | 
  118 |   // Precio unitario — segundo input numérico de la fila (cantidad=idx 0, precio=idx 1)
  119 |   const precioInput = page.locator('input[type="number"]').nth(1);
  120 |   await precioInput.fill('10000');
  121 | 
  122 |   // El total debe reflejar 10000 + 18% ITBIS = 11800
  123 |   await page.waitForTimeout(300);
  124 |   await expect(page.getByText('11,800.00').first()).toBeVisible({ timeout: 5000 });
  125 |   console.log('✓ Cálculo de totales funciona: 10000 + ITBIS 18% = 11800');
  126 | });
```