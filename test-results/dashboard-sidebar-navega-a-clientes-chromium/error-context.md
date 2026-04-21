# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.test.ts >> sidebar navega a clientes
- Location: tests/dashboard.test.ts:60:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('3 clientes')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('3 clientes')

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
              - heading "Clientes" [level=1] [ref=e89]
              - paragraph [ref=e90]: Directorio de compradores y contactos
            - button "Nuevo cliente" [ref=e91]:
              - img
              - text: Nuevo cliente
          - generic [ref=e92]:
            - img [ref=e93]
            - textbox "Buscar por nombre, RNC o email…" [ref=e96]
          - generic [ref=e97]:
            - generic [ref=e99]:
              - img [ref=e100]
              - text: 7 clientes
            - table [ref=e107]:
              - rowgroup [ref=e108]:
                - row "Nombre / Razón Social RNC / Cédula Email Teléfono Acciones" [ref=e109]:
                  - columnheader "Nombre / Razón Social" [ref=e110]
                  - columnheader "RNC / Cédula" [ref=e111]
                  - columnheader "Email" [ref=e112]
                  - columnheader "Teléfono" [ref=e113]
                  - columnheader "Acciones" [ref=e114]
              - rowgroup [ref=e115]:
                - row "Consumidor Final 001456789 — —" [ref=e116] [cursor=pointer]:
                  - cell "Consumidor Final" [ref=e117]
                  - cell "001456789" [ref=e118]
                  - cell "—" [ref=e119]
                  - cell "—" [ref=e120]
                  - cell [ref=e121]:
                    - generic [ref=e122]:
                      - button [ref=e123]:
                        - img
                      - button [ref=e124]:
                        - img
                - row "Distribuidora González SRL 101123456 gonzalez@test.com 809-555-0001" [ref=e125] [cursor=pointer]:
                  - cell "Distribuidora González SRL" [ref=e126]
                  - cell "101123456" [ref=e127]
                  - cell "gonzalez@test.com" [ref=e128]
                  - cell "809-555-0001" [ref=e129]
                  - cell [ref=e130]:
                    - generic [ref=e131]:
                      - button [ref=e132]:
                        - img
                      - button [ref=e133]:
                        - img
                - row "Importadora del Este SA 131234567 impeste@test.com 809-555-0002" [ref=e134] [cursor=pointer]:
                  - cell "Importadora del Este SA" [ref=e135]
                  - cell "131234567" [ref=e136]
                  - cell "impeste@test.com" [ref=e137]
                  - cell "809-555-0002" [ref=e138]
                  - cell [ref=e139]:
                    - generic [ref=e140]:
                      - button [ref=e141]:
                        - img
                      - button [ref=e142]:
                        - img
                - row "S J & T VISION MULTISERVICES SRL 131025692 sara@aa.com 29299222" [ref=e143] [cursor=pointer]:
                  - cell "S J & T VISION MULTISERVICES SRL" [ref=e144]
                  - cell "131025692" [ref=e145]
                  - cell "sara@aa.com" [ref=e146]
                  - cell "29299222" [ref=e147]
                  - cell [ref=e148]:
                    - generic [ref=e149]:
                      - button [ref=e150]:
                        - img
                      - button [ref=e151]:
                        - img
                - row "YISRAEL KIDS SCHOOL SRL 131988032 ferrerasalexander@gmail.com —" [ref=e152] [cursor=pointer]:
                  - cell "YISRAEL KIDS SCHOOL SRL" [ref=e153]
                  - cell "131988032" [ref=e154]
                  - cell "ferrerasalexander@gmail.com" [ref=e155]
                  - cell "—" [ref=e156]
                  - cell [ref=e157]:
                    - generic [ref=e158]:
                      - button [ref=e159]:
                        - img
                      - button [ref=e160]:
                        - img
                - row "alexander 402-2300723-4 — —" [ref=e161] [cursor=pointer]:
                  - cell "alexander" [ref=e162]
                  - cell "402-2300723-4" [ref=e163]
                  - cell "—" [ref=e164]
                  - cell "—" [ref=e165]
                  - cell [ref=e166]:
                    - generic [ref=e167]:
                      - button [ref=e168]:
                        - img
                      - button [ref=e169]:
                        - img
                - row "ferreras 402-2300823-4 — 99900090999" [ref=e170] [cursor=pointer]:
                  - cell "ferreras" [ref=e171]
                  - cell "402-2300823-4" [ref=e172]
                  - cell "—" [ref=e173]
                  - cell "99900090999" [ref=e174]
                  - cell [ref=e175]:
                    - generic [ref=e176]:
                      - button [ref=e177]:
                        - img
                      - button [ref=e178]:
                        - img
  - region "Notifications alt+T"
  - alert [ref=e179]
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
  26  |   await expect(page.getByText('Este mes')).toBeVisible();
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
> 66  |   await expect(page.getByText('3 clientes')).toBeVisible();
      |                                              ^ Error: expect(locator).toBeVisible() failed
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
  127 | 
  128 | test('botón Emitir está deshabilitado sin items válidos', async ({ page }) => {
  129 |   await login(page);
  130 |   await page.goto(`${BASE}/dashboard/facturas/nueva`);
  131 | 
  132 |   const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  133 |   // Sin nombre de item, el botón está deshabilitado
  134 |   await expect(submitBtn).toBeDisabled();
  135 |   console.log('✓ Botón Emitir deshabilitado sin items válidos');
  136 | });
  137 | 
  138 | test('página Facturas carga correctamente', async ({ page }) => {
  139 |   await login(page);
  140 |   await page.goto(`${BASE}/dashboard/facturas`);
  141 |   await expect(page.getByRole('heading', { name: 'Comprobantes Fiscales' })).toBeVisible();
  142 |   // Muestra el estado vacío O la tabla, ambos son válidos
  143 |   const empty = page.getByText('Sin comprobantes aún');
  144 |   const table = page.getByRole('table');
  145 |   const countText = page.getByText(/comprobante/);
  146 |   await expect(empty.or(table).or(countText).first()).toBeVisible({ timeout: 5000 });
  147 |   console.log('✓ Página Facturas carga correctamente');
  148 | });
  149 | 
  150 | // ─── API de emisión (sin certificado = error esperado) ────────────────────────
  151 | test('API /api/ecf/emitir retorna 422 sin certificado configurado', async ({ page }) => {
  152 |   await login(page);
  153 | 
  154 |   // Llamar directamente a la API
  155 |   const res = await page.evaluate(async () => {
  156 |     const r = await fetch('/api/ecf/emitir', {
  157 |       method: 'POST',
  158 |       headers: { 'Content-Type': 'application/json' },
  159 |       body: JSON.stringify({
  160 |         tipoEcf: '32',
  161 |         tipoPago: 1,
  162 |         items: [{ nombreItem: 'Test', cantidadItem: 1, precioUnitarioItem: 100 }],
  163 |       }),
  164 |     });
  165 |     return { status: r.status, body: await r.json() };
  166 |   });
```