# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.test.ts >> API /api/ecf/emitir retorna 422 sin certificado configurado
- Location: tests/dashboard.test.ts:151:5

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "Certificado"
Received string:    "La DGII rechazó el comprobante: {\"codigo\":2,\"estado\":\"Rechazado\",\"mensajes\":[{\"codigo\":\"003\",\"valor\":\"La estructura del archivo XML no es válida, favor proveer un XML con una estructura válida, verificar el XSD correspondiente.\"}],\"encf\":null,\"secuenciaUtilizada\":false}"
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
  167 | 
  168 |   expect(res.status).toBe(422);
> 169 |   expect(res.body.error).toContain('Certificado');
      |                          ^ Error: expect(received).toContain(expected) // indexOf
  170 |   console.log('✓ API retorna 422 correctamente sin certificado:', res.body.error);
  171 | });
  172 | 
```