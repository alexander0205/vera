# Datos necesarios para poner en marcha la Gobernanza de Colegios

**Sistema:** Zero — Gobernanza de Colegios
**Dirigido a:** Dirección y Administración del centro educativo
**Año escolar a cargar:** 2026–2027

---

## Por qué les pedimos esto

Zero emite las facturas, cobra y avisa a las familias **por sí solo**. Para que lo haga bien necesita saber tres cosas: **a quién** se le cobra, **qué** se le cobra y **cuándo**. Este documento es la lista completa de lo que hace falta para configurarlo.

Vale la pena hacerlo con calma una sola vez: cada dato que llegue incompleto se convierte después en una factura mal emitida, en un aviso que no sale, o en un padre al que se le cobra algo que ya pagó.

**Lo que ya está cargado en Zero no hay que volver a enviarlo.** Ya tenemos el padrón que se trajo desde SIGERD —estudiantes, tutores, grados y secciones— y lo vamos a usar tal cual. Solo necesitamos lo que falta, lo que haya cambiado y lo que SIGERD no contiene (que es, básicamente, todo lo económico).

---

## Cómo enviarlo

- **Formato:** Excel (`.xlsx`) o Google Sheets. Una hoja por cada sección de este documento.
- **Si ya lo tienen en otro sistema:** mándenlo como salga de ahí, en crudo. Nosotros lo ordenamos. No pierdan tiempo dándole formato.
- **Si es poco:** puede venir en el cuerpo de un correo o en un mensaje. Los precios de una lista de veinte conceptos no necesitan una plantilla.
- **Confidencialidad:** el listado contiene datos de menores de edad y de sus familias. Se maneja bajo acuerdo de confidencialidad, se usa exclusivamente para operar el sistema del centro y no se comparte con terceros.

---

## 1. Padrón: estudiantes y sus familias

Esto es la base de todo. Lo tenemos parcialmente desde SIGERD; lo que falta casi siempre es **el contacto de la familia y quién paga**.

### 1.1 Estudiantes

| Columna | Obligatorio | Notas |
|---|---|---|
| Código / matrícula del estudiante | Sí | El que usa el colegio internamente |
| Nombres y apellidos | Sí | Completos, como aparecen en el acta |
| Cédula o RNE | Deseable | |
| Fecha de nacimiento | Deseable | |
| Sexo | Deseable | |
| Nivel | **Sí** | Inicial / Primario / Secundario |
| Tanda | **Sí** | Matutina / Vespertina / Jornada extendida |
| Grado | **Sí** | Ej.: 3ro de Primaria |
| Sección o curso | **Sí** | Ej.: A, B, C |
| Estado | Sí | Activo / Retirado / Egresado |

### 1.2 Padres, madres y tutores

Un estudiante puede tener varios tutores. Pónganlos todos, pero **marquen cuál es el responsable de pago**: es al que se le emite la factura y al que le llegan los avisos.

| Columna | Obligatorio | Notas |
|---|---|---|
| Código del estudiante al que pertenece | Sí | Para poder amarrarlo |
| Nombres y apellidos del tutor | Sí | |
| Relación | Sí | Padre / Madre / Tutor / Abuelo… |
| **Cédula o RNC** | **Sí, si es el responsable de pago** | Sin esto no se le puede emitir factura fiscal |
| **Celular / WhatsApp** | **Sí** | Por aquí salen los avisos de cobro |
| Teléfono de casa u oficina | Opcional | |
| **Correo electrónico** | **Sí** | Por aquí sale la factura en PDF |
| Dirección | Deseable | Para la factura |
| ¿Es el responsable de pago? | **Sí** | Sí / No |

> **Sobre el celular y el WhatsApp:** son el dato más importante de esta hoja y el que más falta. Un responsable sin celular ni correo es un responsable al que el sistema **no le puede avisar nada** — ni la factura, ni el vencimiento, ni el recargo. En la base que tenemos ahora mismo, la gran mayoría de las familias está en esa situación.

> **Hermanos:** si un mismo padre tiene varios hijos en el colegio, pongan el **mismo tutor con la misma cédula** en todos. Así el sistema los reconoce como una sola familia, le arma **una sola factura con los dos hijos** y le manda **un solo aviso** en lugar de dos.

---

## 2. Estructura académica

Necesitamos la lista de lo que el colegio ofrece, porque de ahí cuelgan los precios.

Por cada combinación que exista en el centro:

| Nivel | Tanda | Grado | Secciones | Cupo |
|---|---|---|---|---|
| Primario | Matutina | 1ro | A, B | 30 |
| Primario | Matutina | 2do | A | 28 |
| Secundario | Vespertina | 4to | A | 25 |
| … | | | | |

Si en Secundaria hay **modalidades** (Académica, Técnico-Profesional, Artes), indíquenlo también: los precios suelen diferir.

---

## 3. Tarifario: todo lo que se cobra y cuánto

**Esta es la sección más importante del documento.** Necesitamos absolutamente **todos** los conceptos que el colegio cobra durante el año, con su precio. No omitan nada por parecer menor: lo que no esté aquí, el sistema no lo va a cobrar.

Para cada concepto:

| Columna | Notas |
|---|---|
| Concepto | Nombre tal como quieren que aparezca en la factura del padre |
| Precio | En RD$ |
| ¿El precio cambia por grado o nivel? | Sí / No. Si es sí, dennos el precio de cada uno |
| ¿Cada cuánto se cobra? | Una sola vez / Mensual / Por período |
| ¿Cuándo se cobra? | Mes o fecha |
| ¿Es obligatorio o voluntario? | Los voluntarios no se le cargan a todo el mundo |
| ¿Lleva ITBIS? | Sí / No |

### Conceptos que esperamos ver — úsenlo como recordatorio

- **Inscripción / Reinscripción** — precio y fecha en que se cobra
- **Mensualidad o colegiatura** — **precio por grado** (es lo normal que cambie)
- **Materiales gastables** — precio por grado
- **Libros y textos** — por grado, o por materia si se venden sueltos
- **Uniformes** — polo shirts, camisas, pantalones, falda, educación física, suéter. Precio por talla si varía
- **Cena navideña / actividad de fin de año**
- **Cuota de graduación** — solo los grados que gradúan
- **Seguro escolar**
- **Carnet estudiantil**
- **Cuota de la Asociación de Padres (APMAE)**
- **Excursiones y actividades**
- **Certificaciones, récord de notas, cartas** — lo que se cobra en secretaría
- **Transporte escolar** — si el colegio lo da, y si el precio varía por ruta o zona
- **Cualquier otra cosa que se cobre.** Si un padre lo paga, va aquí.

### Ejemplo de cómo queremos verlo

| Concepto | Grado | Precio | Frecuencia | Cuándo | Obligatorio |
|---|---|---|---|---|---|
| Inscripción | Todos | RD$2,000 | Una vez | Julio | Sí |
| Mensualidad | 1ro Primaria | RD$2,000 | Mensual | Sep–Jun | Sí |
| Mensualidad | 6to Primaria | RD$2,500 | Mensual | Sep–Jun | Sí |
| Materiales gastables | 1ro Primaria | RD$1,500 | Una vez | Agosto | Sí |
| Cena navideña | Todos | RD$800 | Una vez | Noviembre | No |
| Polo shirt | Todos | RD$650 | Por unidad | Todo el año | No |

---

## 4. Calendario de facturación

El sistema emite las mensualidades solo. Necesitamos saber exactamente cuándo:

1. **¿En qué mes se emite la PRIMERA factura de mensualidad?** (ej.: septiembre 2026)
2. **¿En qué mes se emite la ÚLTIMA?** (ej.: junio 2027) — o sea, **cuántas mensualidades tiene el año**: 10, 11 o 12
3. **¿Qué día del mes se emite la factura?** (ej.: el 1)
4. **¿Qué día del mes vence?** (ej.: el 10)
5. **¿Cuándo se cobra la inscripción**, y si es aparte de la primera mensualidad o junto con ella

---

## 5. Descuentos y becas

| Columna | Notas |
|---|---|
| Nombre del descuento | Ej.: Pago adelantado del año |
| Cuánto | % o monto fijo en RD$ |
| Sobre qué aplica | Solo mensualidad / todo / un concepto específico |
| Quién lo recibe | Todos los que cumplan una condición, o una lista de estudiantes |
| Condición | Ej.: pagar el año completo antes de agosto |

Los que ya sabemos que existen, para confirmar:

- **Pago adelantado del año completo: 10% de descuento.** Falta definir: ¿el 10% aplica solo sobre las mensualidades o también sobre inscripción y materiales? ¿Hasta qué fecha hay que pagar para tener derecho?
- **Descuento por hermanos**, si lo hay: cuánto y a partir de cuál hijo.
- **Becas y medias becas:** necesitamos la **lista de estudiantes becados** con el porcentaje o el monto de cada uno.
- **Descuentos a hijos de empleados**, si aplica.

---

## 6. Recargo por atraso (mora)

Si el colegio cobra recargo:

- **¿Cuánto?** Monto fijo (ej.: RD$300) o porcentaje (ej.: 5%)
- **¿A los cuántos días de vencida se aplica?** (ej.: a los 5 días)
- **¿Se aplica una sola vez o cada mes que siga sin pagarse?**
- **¿Se le avisa al padre antes de aplicarlo?** (recomendado: sí, y el sistema puede hacerlo automáticamente)

Si no cobran recargo, díganlo también: es una configuración, no un olvido.

---

## 7. Lo ya cobrado del año 2026–2027

**Esto evita el peor error posible del arranque: cobrarle a un padre algo que ya pagó.**

Necesitamos todo lo que las familias ya pagaron de este año escolar — inscripciones, mensualidades adelantadas, polo shirts, uniformes, materiales, libros, todo.

| Columna | Notas |
|---|---|
| Fecha del pago | |
| Código del estudiante | O el nombre, si no tienen el código |
| Concepto pagado | Ej.: Inscripción, Mensualidad septiembre, 2 polo shirts |
| Monto pagado | RD$ |
| Forma de pago | Efectivo / Transferencia / Tarjeta / Cheque |
| Referencia | Número de recibo, transferencia o factura |
| ¿Quedó algo pendiente de ese concepto? | Si fue un abono parcial |

Si lo llevan en un cuaderno, en un Excel o en recibos sueltos, **mándenlo como esté**. Es preferible recibirlo desordenado que no recibirlo.

> **Años anteriores (2025–2026 y hacia atrás):** los dejamos para una segunda fase, una vez que el año en curso esté funcionando. **La excepción son las deudas viejas que aún están vivas:** si hay familias que deben dinero de años pasados y el colegio todavía piensa cobrarlo, mándenlo ahora junto con el punto 7 — si no, esa deuda desaparece del sistema.

---

## 8. Datos del colegio para facturar y para cobrar

### Para la factura

- Razón social exacta y RNC
- Nombre comercial, si es distinto
- Dirección, teléfono y correo del centro
- Logo en buena calidad (PNG o JPG)
- Si emiten **comprobante fiscal electrónico (e-CF)** ante la DGII, indíquenlo: hay un proceso de habilitación aparte que coordinamos nosotros

### Para que el padre pueda pagar

Zero le muestra al padre un enlace donde ve lo que debe y sube el comprobante de su transferencia. Para eso necesitamos las cuentas:

| Columna | Notas |
|---|---|
| Banco | |
| Tipo de cuenta | Ahorros / Corriente |
| Número de cuenta | |
| Nombre del titular | Tal como aparece en el banco |
| RNC o cédula del titular | **Puede ser distinto en cada cuenta** — pónganlo por cuenta |

Pueden darnos **varias cuentas** de bancos distintos; todas se le muestran al padre.

### Quién usa el sistema

Lista del personal que va a entrar a Zero, con:

- Nombre completo
- Correo electrónico (será su usuario)
- Qué debe poder hacer: **ver nada más**, **cobrar**, o **administrar todo**

---

## Resumen de lo que hay que enviar

- [ ] **1.** Estudiantes con nivel, tanda, grado y sección
- [ ] **1.2** Tutores con **cédula, celular/WhatsApp y correo**, marcando el responsable de pago
- [ ] **2.** Niveles, tandas, grados y secciones que ofrece el centro
- [ ] **3.** Tarifario completo con precios por grado
- [ ] **4.** Mes de la primera y de la última mensualidad, día de emisión y día de vencimiento
- [ ] **5.** Descuentos, condiciones del 10% por año adelantado, y lista de becados
- [ ] **6.** Recargo por atraso: cuánto y a los cuántos días
- [ ] **7.** Todo lo ya cobrado del 2026–2027, más las deudas vivas de años anteriores
- [ ] **8.** RNC y logo del colegio, cuentas de banco, y usuarios con su nivel de acceso

---

## Qué pasa después

1. **Ustedes envían.** Como puedan, en el formato que tengan.
2. **Nosotros cargamos y configuramos** el tarifario, el calendario y los descuentos.
3. **Revisamos juntos** una muestra: tomamos tres o cuatro familias reales y comprobamos que lo que el sistema dice que deben es exactamente lo que deben. Aquí es donde se atrapan los errores, antes de que le lleguen a nadie.
4. **Prueba en frío:** se emiten las facturas de un mes **sin enviarlas**, para revisarlas.
5. **Arranque:** se activan los avisos automáticos y las familias empiezan a recibir su factura y su enlace de pago.

Los puntos 1, 2, 3 y 4 son los que nos permiten empezar. Los demás se pueden ir completando mientras tanto — pero el **punto 7 tiene que estar antes de emitir la primera factura**, porque es lo único que impide cobrar dos veces.

Cualquier duda sobre un punto concreto, escríbannos y lo resolvemos por teléfono en cinco minutos. Es preferible una llamada a un dato asumido.
