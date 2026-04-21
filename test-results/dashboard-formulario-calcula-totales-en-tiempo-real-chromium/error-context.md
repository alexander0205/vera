# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.test.ts >> formulario calcula totales en tiempo real
- Location: tests/dashboard.test.ts:105:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /emitir comprobante/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('button', { name: /emitir comprobante/i })

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
          - generic [ref=e39]:
            - button "Ingresos" [ref=e40]:
              - img [ref=e41]
              - generic [ref=e44]: Ingresos
              - img [ref=e45]
            - generic [ref=e47]:
              - generic [ref=e48]:
                - link "Facturas de venta" [ref=e49] [cursor=pointer]:
                  - /url: /dashboard/facturas
                - link "Nuevo" [ref=e50] [cursor=pointer]:
                  - /url: /dashboard/facturas/nueva
                  - img [ref=e51]
              - link "Notas de crédito" [ref=e53] [cursor=pointer]:
                - /url: /dashboard/notas-credito
              - generic [ref=e54]:
                - link "Cotizaciones" [ref=e55] [cursor=pointer]:
                  - /url: /dashboard/cotizaciones
                - link "Nuevo" [ref=e56] [cursor=pointer]:
                  - /url: /dashboard/cotizaciones/nueva
                  - img [ref=e57]
              - link "Facturas recurrentes" [ref=e59] [cursor=pointer]:
                - /url: /dashboard/facturas-recurrentes
          - button "Inventario" [ref=e61]:
            - img [ref=e62]
            - generic [ref=e66]: Inventario
            - img [ref=e67]
          - button "Configuración" [ref=e70]:
            - img [ref=e71]
            - generic [ref=e74]: Configuración
            - img [ref=e75]
    - generic [ref=e77]:
      - banner [ref=e78]:
        - button "Yisrael Kid School Yisrael Kid School Business" [ref=e80]:
          - img "Yisrael Kid School" [ref=e81]
          - generic [ref=e82]: Yisrael Kid School
          - generic [ref=e83]: Business
          - img [ref=e84]
        - button "Buscar ⌘K" [ref=e86]:
          - img [ref=e87]
          - generic [ref=e90]: Buscar
          - generic [ref=e91]: ⌘K
        - button "AE" [ref=e93]:
          - generic [ref=e95]: AE
          - img [ref=e96]
      - main [ref=e98]:
        - generic [ref=e100]:
          - generic [ref=e101]:
            - link "Volver" [ref=e102] [cursor=pointer]:
              - /url: /dashboard/facturas
              - img
              - text: Volver
            - heading "Nueva factura" [level=1] [ref=e103]
            - button "Personalizar opciones" [ref=e105]:
              - img
              - text: Personalizar opciones
              - img
          - generic [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]:
                  - img "Logo" [ref=e110]
                  - generic [ref=e111]:
                    - paragraph [ref=e112]: Centro educativo yisrael
                    - paragraph [ref=e113]: "RNC: 131988032"
                - generic [ref=e114]:
                  - combobox [ref=e115]:
                    - generic: Factura de venta
                    - img
                  - combobox [ref=e116]
                  - combobox [ref=e117]:
                    - generic: e31 — Crédito fiscal
                    - img
                  - combobox [ref=e118]
                  - generic [ref=e119]:
                    - generic [ref=e120]: NCF
                    - generic [ref=e121]: E310000000012
                    - button [ref=e122]:
                      - img [ref=e123]
              - generic [ref=e126]:
                - generic [ref=e127]:
                  - generic [ref=e128]:
                    - generic [ref=e131]:
                      - img [ref=e132]
                      - textbox "Buscar..." [ref=e135]
                    - button "Nuevo contacto" [ref=e136]:
                      - img [ref=e137]
                      - text: Nuevo contacto
                  - generic [ref=e138]:
                    - generic [ref=e139]:
                      - generic [ref=e140]:
                        - text: RNC o Cédula del comprador
                        - generic [ref=e141]: "*"
                      - generic [ref=e143]:
                        - img [ref=e144]
                        - textbox "Buscar RNC, Cédula o razón social…" [ref=e147]
                    - generic [ref=e148]:
                      - generic [ref=e149]: Teléfono
                      - textbox "___-___-____" [ref=e150]
                  - generic [ref=e151]:
                    - generic [ref=e152]: Email (para envío)
                    - textbox "facturacion@empresa.com" [ref=e153]
                - generic [ref=e154]:
                  - generic [ref=e155]:
                    - generic [ref=e156]:
                      - text: Fecha
                      - generic [ref=e157]: "*"
                    - textbox [ref=e158]: 2026-04-18
                  - generic [ref=e159]:
                    - generic [ref=e160]: Plazo de pago
                    - combobox [ref=e161]:
                      - generic: De contado
                      - img
                    - combobox [ref=e162]
              - generic [ref=e163]:
                - table [ref=e165]:
                  - rowgroup [ref=e166]:
                    - row "Producto Referencia Precio Desc % Impuesto Descripción Cantidad Total" [ref=e167]:
                      - columnheader "Producto" [ref=e168]
                      - columnheader "Referencia" [ref=e169]
                      - columnheader "Precio" [ref=e170]
                      - columnheader "Desc %" [ref=e171]
                      - columnheader "Impuesto" [ref=e172]
                      - columnheader "Descripción" [ref=e173]
                      - columnheader "Cantidad" [ref=e174]
                      - columnheader "Total" [ref=e175]
                      - columnheader [ref=e176]
                  - rowgroup [ref=e177]:
                    - row "% 1 RD$ 0.00" [ref=e178]:
                      - cell [ref=e179]:
                        - generic [ref=e181]:
                          - img [ref=e182]
                          - textbox "Buscar producto o servicio..." [ref=e185]
                      - cell [ref=e186]:
                        - textbox "Ref." [ref=e187]
                      - cell [ref=e188]:
                        - spinbutton [ref=e189]
                      - cell "%" [ref=e190]:
                        - generic [ref=e191]:
                          - spinbutton [ref=e192]
                          - generic [ref=e193]: "%"
                      - cell [ref=e194]:
                        - combobox [ref=e195]:
                          - generic: ITBIS 18%
                          - img
                        - combobox [ref=e196]
                      - cell [ref=e197]:
                        - textbox "Descripción..." [ref=e198]
                      - cell "1" [ref=e199]:
                        - spinbutton [ref=e200]: "1"
                      - cell "RD$ 0.00" [ref=e201]:
                        - generic [ref=e202]: RD$ 0.00
                      - cell [ref=e203]
                - generic [ref=e204]:
                  - button "+ Agregar línea" [ref=e205]
                  - button "+ Agregar Conduce" [ref=e207]
              - button "+ Agregar Retención" [ref=e209]
              - generic [ref=e210]:
                - img "Firma autorizada" [ref=e211]
                - generic [ref=e212]:
                  - generic [ref=e213]:
                    - generic [ref=e214]: Subtotal
                    - generic [ref=e215]: RD$ 0.00
                  - generic [ref=e216]:
                    - generic [ref=e217]: Total
                    - generic [ref=e218]: RD$ 0.00
              - generic [ref=e219]:
                - generic [ref=e220]:
                  - generic [ref=e221]: Términos y condiciones
                  - paragraph [ref=e222]: Visible en la impresión del documento
                  - 'textbox "Ej: Pago en cuenta corriente 000000001..." [ref=e223]'
                - generic [ref=e224]:
                  - generic [ref=e225]: Notas
                  - paragraph [ref=e226]
                  - textbox "Notas internas o para el cliente..." [ref=e227]
              - generic [ref=e228]:
                - generic [ref=e229]: Pie de factura
                - textbox "Visible en la impresión del documento" [ref=e230]
                - paragraph [ref=e231]: Los campos marcados con * son obligatorios
            - generic [ref=e233]:
              - generic [ref=e234]:
                - heading "Pago recibido" [level=3] [ref=e235]
                - paragraph [ref=e236]: Si te hicieron un pago asociado a esta venta puedes hacer aquí su registro.
              - button "Agregar pago" [ref=e237]:
                - img [ref=e238]
                - text: Agregar pago
            - generic [ref=e240]:
              - generic [ref=e242]:
                - img [ref=e243]
                - heading "Comentarios" [level=3] [ref=e245]
              - generic [ref=e246]:
                - textbox "Escribe un comentario" [ref=e247]
                - paragraph [ref=e249]: 0/280
            - generic [ref=e250]:
              - link "Cancelar" [ref=e251] [cursor=pointer]:
                - /url: /dashboard/facturas
              - generic [ref=e252]:
                - button "Vista previa" [ref=e253]
                - button "Guardar y crear nueva" [disabled]
                - generic [ref=e254]:
                  - button "Guardar" [disabled]
                  - button [ref=e255]:
                    - img [ref=e256]
  - region "Notifications alt+T"
  - alert [ref=e258]
```

# Test source

```ts
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
> 111 |   await expect(submitBtn).toBeVisible({ timeout: 15000 });
      |                           ^ Error: expect(locator).toBeVisible() failed
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
  167 | 
  168 |   expect(res.status).toBe(422);
  169 |   expect(res.body.error).toContain('Certificado');
  170 |   console.log('✓ API retorna 422 correctamente sin certificado:', res.body.error);
  171 | });
  172 | 
```