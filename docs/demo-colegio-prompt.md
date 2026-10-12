# Prompt — Montar la cuenta demo "Colegio Demo Zero"

## Contexto

Construir, **enteramente por la UI de producción** (`https://zero.com.do`), una empresa
demo completa que sirva para **presentarle Zero a colegios dominicanos**. No es una
prueba de QA: es el material con el que se vende. Cada pantalla que se abra delante de
un director de colegio tiene que verse como un colegio de verdad que lleva meses
operando — no como una base recién sembrada con "Producto 1" y "Cliente de prueba".

La cuenta cubre las tres líneas del producto a la vez, porque el plan `colegio-basico`
las incluye todas: **Facturación electrónica + Punto de venta + Administración escolar**.

Se construye en ese orden y **una a la vez**: se termina Facturación completa antes de
empezar POS, y se termina POS completo antes de empezar Colegio. Colegio va de último
porque es el clímax de la demo y porque se alimenta de lo que ya quedó montado antes.

## Reglas duras (no negociables)

1. **No crear cuentas ni escribir contraseñas.** Los usuarios se suman por invitación
   por correo; quien acepta y define su contraseña es el humano, siempre. Aplica también
   a iniciar sesión.
2. **Nada se manda a la DGII.** La empresa no está habilitada en ambiente `Produccion`,
   así que `lib/ecf/readiness.ts` degrada todo comprobante fiscal a `sin-ncf`. Si en
   algún punto una pantalla ofrece emitir de verdad a la DGII, **detenerse y preguntar**.
3. **No meter tarjetas de crédito.** El alta va por el panel de plataforma
   (`/admin/empresas/nueva`), que asigna el plan a mano con `subscriptionStatus: 'admin'`
   y **no toca Stripe**. Si algún flujo pide tarjeta, detenerse y preguntar.
4. **Imágenes con licencia libre.** Es material comercial. Usar Unsplash / Pexels /
   Wikimedia Commons u otra fuente explícitamente libre para uso comercial. No arrastrar
   fotos de catálogos ajenos, ni logos de marcas reales, ni fotos de personas
   identificables. Las fotos de estudiantes y tutores: usar avatares generados o
   ilustraciones, **nunca** la cara de una persona real.
5. **Ningún dato de un cliente real.** Ni RNC, ni nombres, ni teléfonos, ni montos
   copiados de los 5 colegios que hoy usan Zero. La demo se inventa completa.
6. **El único teléfono real permitido** es `829-359-6602` (del dueño del proyecto), y
   solo para comprobar que un SMS llega de verdad. Todo otro teléfono es ficticio.
7. **Documentar cada fricción.** Cada vez que un paso tarde de más, obligue a algo raro,
   o rompa: anotarlo con la pantalla y el detalle. Ese registro es la segunda entrega,
   tan valiosa como la cuenta misma.

## Fase 0 — Alta de la empresa

Desde `/admin/empresas/nueva` (requiere `platform_role = 'admin'`, que hoy solo tiene
`alexander.ferreras@yisraeltech.com`):

| Campo | Valor |
|---|---|
| Razón social | `Colegio Demo Zero` |
| Nombre comercial | `Colegio Demo Zero` |
| RNC | **decisión pendiente — ver "Decisiones" al final** |
| Dirección | Av. Winston Churchill 1099, Piantini |
| Provincia / Municipio | Distrito Nacional / Santo Domingo de Guzmán |
| Teléfono | 809-555-0100 |
| Email facturación | facturacion@colegiodemozero.edu.do |
| Plan | `colegio-basico` (Colegio · Básico · hasta 150 estudiantes) |
| Invitar | `ferrerasalexander@gmail.com` — rol `owner` |

El alta siembra sola: roles de sistema, y 10 secuencias e-NCF (tipos 31, 32, 33, 34, 41,
43, 44–47) con vencimiento 2027-12-31.

Después, ya dentro del team, invitar por correo a:
- `alexander.ferreras@yisraeltech.com`
- `ferrerasalexander@hotmail.com`

Subir un **logo** al team — no un placeholder: algo que parezca el escudo de un colegio.
Sale en las facturas y en los PDF que verá el director.

## Fase 1 — Facturación electrónica

### 1.1 Contactos (~14)

Mezcla que demuestre que el sistema maneja los tres tipos de contribuyente:

- **4 empresas con RNC de 9 dígitos** — proveedores y clientes institucionales
  (una editorial de libros de texto, una empresa de transporte escolar, una imprenta,
  una distribuidora de suministros).
- **8 personas físicas con cédula de 11 dígitos** — padres/responsables. Estos son los
  mismos que después serán tutores en el módulo escolar: **crearlos aquí una sola vez y
  reutilizarlos**, que es justo el puente `desde-dependiente` ("Traer de Contactos").
- **2 consumidores finales sin identificación** — para el caso del que compra en la
  cafetería y no da datos.

Nombres dominicanos verosímiles. Teléfonos ficticios en formato 809/829/849. A los 8
padres, ponerles correo — porque el módulo escolar los va a necesitar para los avisos.

### 1.2 Productos y servicios (~28)

Dos grupos, porque en la demo cumplen papeles distintos:

**Servicios escolares** (no visibles en POS, sí en facturación) — colegiatura por nivel,
inscripción, cuota de graduación, transporte, seguro escolar, examen extraordinario.
Referencias con el mismo estilo que usan los colegios reales: `PC-K-2026-2027`,
`INS-2026-2027`, `1P-2026-2027`, `TRANS-01`.

**Bienes** (visibles en POS, con imagen — ver Fase 2) — uniformes, útiles, libros,
cafetería.

Cada producto con: precio, tasa de ITBIS correcta (**los servicios educativos son
exentos** — ojo con esto, es un detalle que un director nota), tipo bien/servicio,
unidad de medida, y costo donde aplique.

### 1.3 Comprobantes (~18, repartidos en 3 meses)

**No** fechar todo hoy. La demo tiene que mostrar tendencia — el dashboard trae gráfica
de ingresos por mes y "top clientes del mes". Repartir entre junio, julio y agosto 2026.

Cubrir estos casos, cada uno al menos una vez:

- Factura de crédito fiscal (31) a una empresa con RNC
- Factura de consumo (32) a persona física
- Varias facturas pagadas de contado
- Una **a crédito, con vencimiento ya pasado** → cae en cuentas por cobrar vencidas
- Una **con abono parcial** → saldo pendiente visible
- Una **nota de crédito (34)** que anula/descuenta una factura anterior
- Una **nota de débito (33)** por un cargo adicional
- Una **cotización** que después se convierte en factura
- Una **factura recurrente** configurada (la colegiatura mensual)
- Un cobro **con comprobante de pago adjunto** (imagen de transferencia) — el flujo de S3

Al terminar la fase, el dashboard principal debe verse poblado y coherente: ingresos del
mes, tendencia de 3 meses, cartera con vencidos, top clientes, últimos comprobantes.

## Fase 2 — Punto de venta

La tienda del colegio: uniformes, útiles, libros y cafetería. Es lo que hace que un
director diga "ah, esto me resuelve la cooperativa".

### 2.1 Catálogo con imágenes (~20 productos, todos con foto)

`products.imagen` es un **data URL base64**, con tope de ~800KB del lado del cliente. Se
sube desde `/dashboard/productos`. Cada producto de POS lleva su foto — **este es un
requisito explícito, no un extra**: una grilla de POS sin imágenes se ve a medio hacer,
y la grilla es literalmente la primera pantalla que se enseña.

Categorías sugeridas:

- **Uniformes** (con variantes de talla — el sistema soporta ejes de variante por
  producto): polo institucional, pantalón, falda, chaleco, camiseta de educación física.
  Referencias tipo `TS-6`, `TS-8`, `TS-10`.
- **Útiles**: paquete de material gastable 1er ciclo / 2do ciclo, cuadernos, set de
  geometría, mochila.
- **Libros**: 3–4 títulos por nivel.
- **Cafetería**: agua, jugo, sándwich, empanada, galletas, fruta.

Para cada uno: precio, código de barras (para que el lector funcione en la demo), ITBIS,
**control de inventario encendido** con stock inicial y stock mínimo, `visible_pos`,
y **marcar 6–8 como favoritos** (`pos_favorito`) para que la grilla abra ordenada.

Dejar **al menos un producto bajo el mínimo**, para que la alerta de stock bajo se vea.

### 2.2 Ventas (~12)

- Ventas de contado en efectivo
- Ventas con tarjeta
- Una venta **a crédito** → confirmar que cae sola en cuentas por cobrar
- Una venta con **varias líneas y descuento**
- Una venta de uniforme **con selección de talla** (variantes)
- Una **devolución / nota de crédito** desde POS
- Un **cierre de caja** al final del día, con su cuadre

Repartir también en el tiempo, no todas hoy.

## Fase 3 — Administración escolar (el cierre)

Aquí va el peso de la demo. El orden importa: `configurado.ts` exige período + grados +
conceptos **antes** de poder matricular a nadie.

### 3.1 Estructura (`/escolar/configuracion/estructura`)

- **Período académico**: `2026-2027`, con fecha de inicio (agosto 2026) y fin (junio 2027)
- **Niveles y grados** completos del sistema dominicano:
  - Inicial: Pre-Kinder, Kinder, Pre-Primario
  - Primaria: 1ro a 6to
  - Secundaria: 1ro a 6to
- **Secciones** A y B en los grados donde tenga sentido
- **Cursos** por grado

### 3.2 Conceptos de cobro (`/escolar/configuracion/conceptos`)

Los que cobran los colegios de verdad, con nombres limpios y sin duplicados:

| Concepto | Tipo | Notas |
|---|---|---|
| Inscripción | Anual | Una vez al año |
| Colegiatura | Mensual | 10 cuotas, ago–may |
| Material gastable | Anual | Distinto por ciclo |
| Uniforme | Eventual | Se cruza con POS |
| Transporte | Mensual | Opcional por estudiante |
| Seguro escolar | Anual | |
| Actividades y excursiones | Eventual | |
| Graduación | Anual | Solo 6to de secundaria |

### 3.3 Tarifas por grado (`/escolar/configuracion/tarifas`)

Precios **diferenciados por nivel** — un colegio nunca cobra igual en Kinder que en
Secundaria. Rango realista para un colegio privado de clase media en Santo Domingo:
colegiatura mensual entre RD$4,500 (Inicial) y RD$8,500 (Secundaria); inscripción entre
RD$8,000 y RD$15,000.

### 3.4 Cuotas y calendario de cobro (`/escolar/configuracion/cobros`)

- 10 cuotas mensuales de colegiatura, con día de vencimiento (ej. día 5 de cada mes)
- Regla de **mora**: porcentaje o monto fijo después de X días de vencido
- Inscripción con su propia fecha

### 3.5 Estudiantes, responsables y matrículas

**~40 estudiantes** repartidos por todos los grados (no 150 — la demo necesita variedad
visible, no volumen). Con:

- Nombre completo dominicano, fecha de nacimiento coherente con el grado
- Foto (avatar/ilustración, **nunca** cara de persona real)
- Grado y sección
- **Responsables**: reutilizar los 8 padres ya creados en Contactos vía "Traer de
  Contactos", y crear el resto. Varios casos deliberados:
  - Un responsable con **3 hijos en el colegio** (para mostrar el estado de cuenta
    familiar consolidado)
  - Un estudiante con **dos responsables** (padre y madre separados)
  - Al menos uno con el teléfono `829-359-6602` y el correo
    `ferrerasalexander@hotmail.com`, para la prueba real de notificación
- **Matrículas** del período 2026-2027 para todos

### 3.6 Cargos y pagos — el corazón de la demo

Generar los cargos del período y **dejar la cartera en un estado realista**, no toda
pagada ni toda vencida:

- **~60%** de las familias al día
- **~25%** con al menos una cuota vencida y **mora aplicada** (nota de débito automática)
- **~10%** con **pago parcial** (abono, saldo pendiente)
- **~5%** con varias cuotas atrasadas — el caso que el director quiere ver resuelto

Cubrir además:

- Un pago recibido **por link de pago del padre** (`/pagar/[token]`) con **comprobante
  adjunto**, y su **aprobación** desde el lado del colegio
- Una **nota de crédito** por una beca o descuento aplicado a una familia
- Una **nota de débito** manual por un cargo extra (excursión)
- Un **descuento por hermanos** si el sistema lo soporta

### 3.7 Documentos e inscripción

- Configurar la **lista de documentos requeridos** (acta de nacimiento, récord de notas,
  certificado médico, foto 2x2, copia de cédula del tutor)
- Crear al menos un **formulario de inscripción** en el editor
- Dejar **algunos estudiantes con documentos completos y otros pendientes**, para que la
  pantalla de seguimiento tenga algo que mostrar

### 3.8 Avisos (`/escolar/configuracion/avisos`)

- Configurar los avisos de cobro (recordatorio antes de vencer, aviso de vencido, aviso
  de mora)
- **Encender `aviso_sms`** en al menos un concepto
- **Disparar un SMS real** al `829-359-6602` y confirmar que llega
- Enviar un **correo real** a `ferrerasalexander@hotmail.com` y confirmar que llega
- WhatsApp queda **fuera de alcance**: falta `CRM_ZERO_PARTNER_KEY` en producción, así
  que crear el canal para un team nuevo devuelve 503. Anotarlo, no intentar resolverlo.

## Criterios de aceptación

La cuenta está lista cuando, abriendo la app en frío delante de un director:

- [ ] El **dashboard de facturación** muestra ingresos con tendencia de 3 meses, cartera
      con vencidos y top clientes — todo con montos creíbles
- [ ] El **POS** abre con una grilla de productos **con fotos**, favoritos ordenados, y
      el lector de código de barras funciona
- [ ] El **dashboard escolar** muestra estudiantes matriculados, cobrado vs pendiente,
      y morosos
- [ ] Se puede abrir el **estado de cuenta de una familia con 3 hijos** y se entiende de
      un vistazo
- [ ] Hay un **link de pago** que se puede abrir en el teléfono, en vivo, durante la demo
- [ ] Un **PDF de factura** sale con el logo del colegio y se ve profesional
- [ ] Existe la **prueba de que un SMS y un correo llegaron de verdad**
- [ ] Ninguna pantalla muestra estado vacío, "Producto 1", ni fechas todas iguales

## Entregable secundario: el registro de fricción

Tan importante como la cuenta. Documentar, paso por paso:

- **Cuánto tomó cada fase** en tiempo real
- **Cuántas filas hubo que crear a mano** en total
- **Qué pantalla obligó a algo que un colegio no haría solo**
- **Qué se rompió**, con el error exacto
- **Qué faltó** — el campo que se necesitaba y no existía

Ese registro es la evidencia directa para el diagnóstico del módulo escolar: hoy tiene
**cero filas en producción**, y la hipótesis es que el problema no son las funciones sino
la entrada. Montar esto de punta a punta la confirma o la tumba con números.

## Decisiones pendientes antes de arrancar

1. **RNC de la demo.** Aparece impreso en cada factura y PDF que verá un director. Tres
   caminos, hay que elegir uno:
   - Un RNC **obviamente falso** (`000000001`) — honesto, pero se ve improvisado en la
     presentación
   - El **RNC real de Yisrael Technology** en RD, si existe — coherente, ya que es la
     empresa que presenta
   - Un RNC con formato válido pero **no asignado a nadie** — hay que verificar contra el
     padrón que de verdad esté libre

2. **Nombre definitivo.** `Colegio Demo Zero` deja claro que es demo. Si se prefiere algo
   que suene a colegio real durante la presentación, decidirlo ahora — cambiarlo después
   obliga a rehacer logo, correos y PDFs.
