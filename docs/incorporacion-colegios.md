# Incorporación de colegios — procedimiento manual (Etapa 1)

> Origen: `transcripciones/audio_message_3.md`.
> Alcance de esta etapa: el **equipo** monta cada colegio a mano y lo deja listo
> para operar y facturar. La automatización de autoservicio se analiza **después**
> (no entra aquí).

## Objetivo

Dejar la cuenta de un colegio (`team`) con:

- estructura del año escolar cargada,
- conceptos, tarifas y métodos de pago listos,
- estudiantes, padres y responsables de pago registrados con su contacto,
- canales de aviso (WhatsApp / SMS / correo) definidos.

De modo que al terminar el colegio pueda **matricular, generar cargos y facturar**
sin tocar configuración.

## Modelo actual (cómo se configura hoy)

Todo cuelga del `teamId` (un `team` = un colegio). Superficie de configuración en
`/escolar/configuracion/*` (solo administradores):

| Área | Ruta | Tablas | Qué guarda |
|---|---|---|---|
| Estructura | `configuracion/estructura` | `adminEscolarPeriodos` → `adminEscolarServicios` (tandas) → `adminEscolarGrados` → `adminEscolarCursos` (secciones) | El armazón del año escolar. Cada nivel cuelga del anterior. |
| Conceptos | `configuracion/conceptos` | `adminEscolarConceptosPago` | Qué se cobra: `tipo` (inscripcion/mensualidad/uniforme/actividad/otro), `frecuencia` (mensual/unico), ciclo de cobro (día emisión, días para pago, gracia de mora), avisos por concepto, `admiteBeca`, `descuentoAdelantoPct`, y enlace opcional a `productId`. |
| Tarifas | `configuracion/tarifas` | `adminEscolarConceptoPrecios` | Cuánto cuesta: `concepto × objetivo (servicio/grado/sección) × período` → `montoCentavos`. Puede crear el producto de facturación al vuelo (servicio exento de ITBIS, no visible en POS). |
| Avisos | `configuracion/avisos` | `canales` (correo/whatsapp/sms) vía `lib/administracion-escolar/canales.ts` | Interruptor maestro de cada canal. Estado de la integración de WhatsApp en el endpoint `whatsapp-salud`. |
| Cobros | `configuracion/cobros` | `adminEscolarDatosPago` + `adminEscolarCuentasBanco` | Cuentas a las que las familias transfieren (hasta 10) + contacto de ayuda e instrucciones. Alimenta el enlace de pago (`link-pago`). |
| SIGERD | `configuracion/sigerd` | import 2-fase (`importar-sigerd.ts`) | Trae estructura y estudiantes del MINERD. Reconcilia por `codigo` (RNE). No duplica ni sobrescribe lo que ya existe. |

**Gente:**

- Estudiantes: `/escolar/estudiantes` (alta manual en `/nuevo`) o importados de SIGERD.
  Se atan a curso+período con una matrícula (`adminEscolarMatriculas`).
- Tutores / responsables de pago: `/escolar/responsables` y tutores del estudiante.
  El responsable lleva el contacto (teléfono/correo) que usan SMS y WhatsApp.

**Puerta "listo" (`lib/administracion-escolar/configurado.ts`):** un colegio se
considera operable cuando tiene `período > 0 && grados > 0 && conceptos > 0`. Los
estudiantes se cuentan aparte. La pantalla de bienvenida muestra qué falta.

## Punto que requiere revisión conjunta (NO se toca en esta etapa)

El **vínculo factura ↔ concepto/tarifa** lo marca el audio como "hay que sentarse
a revisarlo". Hoy funciona así:

- concepto → `productId`, tarifa → `productId`;
- el cargo se convierte en factura vía `cargos/[id]/prefill-factura` y
  `cargos/[id]/saldar-con-factura`;
- `plan-cobro.ts` genera los cargos y `devengar.ts` los devenga.

Esto es exactamente lo que está tocando la rama `feat/tarifas-conceptos-lifecycle`
(ciclo de vida de borrado concepto/tarifa/producto/factura). **Dejar el detalle
del vínculo para revisión conjunta con Alex antes de definir cambios**, como pide
el audio.

---

## Checklist de incorporación manual

Orden importante: cada bloque depende del anterior. Marcar por colegio.

### 0. Alta de la cuenta

- [ ] Crear el `team` del colegio y activar el módulo **escolar** (addon/plan).
- [ ] Cargar datos de la empresa: razón social, RNC, representante legal, logo.
- [ ] Crear el usuario administrador del colegio y asignar permisos
      `administracion-escolar:ver` y `administracion-escolar:configurar`.

### 1. Estructura del año escolar (`configuracion/estructura`)

- [ ] Crear el **período** (año escolar, p. ej. 2026–2027) y marcarlo activo.
- [ ] Crear los **servicios/tandas** (matutina, vespertina, etc.).
- [ ] Crear los **grados** dentro de cada servicio.
- [ ] Crear las **secciones/cursos** dentro de cada grado.
- [ ] *Alternativa:* importar la estructura desde **SIGERD** si el colegio la tiene ahí.

### 2. Conceptos de cobro (`configuracion/conceptos`)

Por cada cosa que el colegio cobra (inscripción, mensualidad, uniforme, etc.):

- [ ] Nombre y **tipo**.
- [ ] **Frecuencia** (mensualidad = mensual; el resto normalmente único).
- [ ] Ciclo de cobro: día de emisión, días para pagar, días de gracia de mora,
      si **cobra mora**.
- [ ] `admiteBeca` (por defecto solo mensualidad).
- [ ] Descuento por pago adelantado si aplica.
- [ ] Avisos del concepto (correo/WhatsApp/SMS y sus días).
- [ ] Enlazar/crear el **producto** de facturación (o dejar que Tarifas lo cree).

### 3. Tarifas / precios (`configuracion/tarifas`)

- [ ] Para cada concepto, fijar el **monto** por servicio, grado o sección del período.
- [ ] Confirmar que cada tarifa tiene su **producto** de facturación (se puede crear
      al vuelo: servicio exento de ITBIS, no visible en POS).
- [ ] Revisar que no falten combinaciones (grados sin tarifa = no se puede facturar).

### 4. Métodos de pago (`configuracion/cobros`)

- [ ] Cargar las **cuentas bancarias** del colegio (banco, tipo, número, titular, RNC/cédula).
- [ ] Datos de ayuda: teléfono, horario, instrucciones para la familia.
- [ ] Confirmar que `aceptaTransferencia` refleja la realidad (sin cuenta activa el
      enlace de pago no ofrece transferencia).

### 5. Canales de aviso (`configuracion/avisos`)

- [ ] Activar los canales reales: **correo**, **WhatsApp**, **SMS**.
- [ ] Verificar la salud de la integración de WhatsApp (`whatsapp-salud`).
      **`[por confirmar]` con Alex:** si hay proveedor real conectado o es solo el toggle.

### 6. Comunidad escolar (estudiantes, padres, responsables)

- [ ] Importar **estudiantes** desde SIGERD (recomendado) o darlos de alta a mano.
- [ ] **Matricular** cada estudiante en su curso del período.
- [ ] Registrar **tutores** y el **responsable de pago** de cada estudiante.
- [ ] Cargar **teléfono/correo** del responsable (obligatorio para SMS/WhatsApp).
- [ ] Confirmar becas/descuentos por estudiante si aplica.

### 7. Verificación final (colegio "listo")

- [ ] `configurado.ts` da `listo = true` (período + grados + conceptos).
- [ ] Generar un **cargo de prueba** y convertirlo en factura → cuadra.
- [ ] Enviar un **aviso de prueba** por cada canal activo.
- [ ] Probar el **enlace de pago** de un responsable (muestra cuentas + instrucciones).
- [ ] Entregar la cuenta al colegio.

---

## Pendientes / preguntas para Alex

1. **Vínculo factura ↔ concepto/tarifa**: definir el detalle en revisión conjunta
   (relacionado con `feat/tarifas-conceptos-lifecycle`).
2. **WhatsApp `[por confirmar]`**: ¿proveedor real conectado o solo interruptor?
3. **Automatización de autoservicio** (que el colegio se configure solo al
   inscribirse): fuera de esta etapa; analizar flujo y plan por colegio antes.
4. ¿Existe un colegio de referencia ya montado (p. ej. `Mi Casita` en prod) para
   copiar su configuración como plantilla?
