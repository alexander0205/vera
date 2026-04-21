# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.test.ts >> página Facturas carga correctamente
- Location: tests/dashboard.test.ts:138:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Comprobantes Fiscales' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Comprobantes Fiscales' })

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
        - generic [ref=e99]:
          - generic [ref=e100]:
            - heading "Facturas" [level=1] [ref=e101]
            - generic [ref=e102]:
              - button "CSV" [ref=e103]:
                - img [ref=e104]
                - text: CSV
              - link "Nueva Factura" [ref=e107] [cursor=pointer]:
                - /url: /dashboard/facturas/nueva
                - img [ref=e108]
                - text: Nueva Factura
          - generic [ref=e109]:
            - generic [ref=e110]:
              - img [ref=e111]
              - textbox "Buscar por e-NCF o cliente..." [ref=e114]
            - combobox [ref=e115]:
              - option "Todos los estados" [selected]
              - option "BORRADOR"
              - option "EN_PROCESO"
              - option "ACEPTADO"
              - option "ACEPTADO_CONDICIONAL"
              - option "RECHAZADO"
              - option "ANULADO"
            - button "Fechas" [ref=e116]:
              - img [ref=e117]
              - text: Fechas
          - table [ref=e121]:
            - rowgroup [ref=e122]:
              - row "e-NCF Tipo Cliente Monto Estado Fecha" [ref=e123]:
                - columnheader [ref=e124]:
                  - checkbox [ref=e125]
                - columnheader "e-NCF" [ref=e126]
                - columnheader "Tipo" [ref=e127]
                - columnheader "Cliente" [ref=e128]
                - columnheader "Monto" [ref=e129]
                - columnheader "Estado" [ref=e130]
                - columnheader "Fecha" [ref=e131]
                - columnheader [ref=e132]
            - rowgroup [ref=e133]:
              - row "BOR-31-MO1R1HYP Créd. Fiscal Consumidor Final 118.00 BORRADOR 16/4/2026 Editar" [ref=e134]:
                - cell [ref=e135]:
                  - checkbox [ref=e136]
                - cell "BOR-31-MO1R1HYP" [ref=e137]:
                  - link "BOR-31-MO1R1HYP" [ref=e138] [cursor=pointer]:
                    - /url: /dashboard/facturas/3
                - cell "Créd. Fiscal" [ref=e139]
                - cell "Consumidor Final" [ref=e140]:
                  - paragraph [ref=e141]: Consumidor Final
                - cell "118.00" [ref=e142]
                - cell "BORRADOR" [ref=e143]:
                  - generic [ref=e144]: BORRADOR
                - cell "16/4/2026" [ref=e145]
                - cell "Editar" [ref=e146]:
                  - generic [ref=e147]:
                    - link "Editar" [ref=e148] [cursor=pointer]:
                      - /url: /dashboard/facturas/3/editar
                    - button "Enviar por email" [ref=e149]:
                      - img [ref=e150]
              - row "BOR-31-MO0GWW93 Créd. Fiscal Consumidor Final 118.00 BORRADOR 15/4/2026 Editar" [ref=e153]:
                - cell [ref=e154]:
                  - checkbox [ref=e155]
                - cell "BOR-31-MO0GWW93" [ref=e156]:
                  - link "BOR-31-MO0GWW93" [ref=e157] [cursor=pointer]:
                    - /url: /dashboard/facturas/2
                - cell "Créd. Fiscal" [ref=e158]
                - cell "Consumidor Final" [ref=e159]:
                  - paragraph [ref=e160]: Consumidor Final
                - cell "118.00" [ref=e161]
                - cell "BORRADOR" [ref=e162]:
                  - generic [ref=e163]: BORRADOR
                - cell "15/4/2026" [ref=e164]
                - cell "Editar" [ref=e165]:
                  - generic [ref=e166]:
                    - link "Editar" [ref=e167] [cursor=pointer]:
                      - /url: /dashboard/facturas/2/editar
                    - button "Enviar por email" [ref=e168]:
                      - img [ref=e169]
              - row "E320000000001 Consumo Empresa Ejemplo SRL 2,950.00 ACEPTADO 9/4/2026" [ref=e172]:
                - cell [ref=e173]:
                  - checkbox [ref=e174]
                - cell "E320000000001" [ref=e175]:
                  - link "E320000000001" [ref=e176] [cursor=pointer]:
                    - /url: /dashboard/facturas/1
                - cell "Consumo" [ref=e177]
                - cell "Empresa Ejemplo SRL" [ref=e178]:
                  - paragraph [ref=e179]: Empresa Ejemplo SRL
                - cell "2,950.00" [ref=e180]
                - cell "ACEPTADO" [ref=e181]:
                  - generic [ref=e182]: ACEPTADO
                - cell "9/4/2026" [ref=e183]
                - cell [ref=e184]:
                  - generic [ref=e185]:
                    - link "Ver PDF" [ref=e186] [cursor=pointer]:
                      - /url: /api/pdf/factura/1
                      - img [ref=e187]
                    - button "Enviar por email" [ref=e190]:
                      - img [ref=e191]
  - region "Notifications alt+T"
  - alert [ref=e194]
```

# Test source

```ts
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
> 141 |   await expect(page.getByRole('heading', { name: 'Comprobantes Fiscales' })).toBeVisible();
      |                                                                              ^ Error: expect(locator).toBeVisible() failed
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