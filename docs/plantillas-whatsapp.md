# Plantillas de WhatsApp — para registrar en Meta

Cinco plantillas. Cubren los **tres avisos** que el sistema sabe mandar hoy
(`avisoDiaEmision`, `avisoDiaVencimiento`, `avisoAntesMoraDias`), y sirven
igual para un hijo que para varios, y salgan del número del colegio o del
nuestro.

Salen de los textos que ya escribe `redactar()` en
`lib/administracion-escolar/avisos.ts`: lo que hoy va como texto libre es lo
que hay que convertir en plantilla.

---

## Por qué hacen falta

WhatsApp solo deja escribir **texto libre dentro de las 24 horas** siguientes
al último mensaje del tutor. Fuera de esa ventana la API devuelve 422 y el
mensaje no sale. Una plantilla aprobada es la única forma de escribir siempre.

Y los avisos de cobro salen justamente cuando el tutor lleva semanas sin
escribirnos, así que **sin plantillas los tres avisos son inservibles**.

---

## Las tres decisiones de diseño

### 1 · El colegio va en el HEADER, no en el cuerpo

Meta admite un **header de texto con una variable**. Ahí va el nombre del
colegio.

Con eso las mismas cinco plantillas valen para los dos remitentes posibles: si
el mensaje sale del número del colegio, el header confirma quién escribe; si
sale del nuestro (cuando el colegio no ha conectado el suyo), el header es lo
que evita que parezca spam. Sin esto harían falta dos juegos de cinco.

De paso esquiva la regla de que **una variable no puede abrir el cuerpo**: el
cuerpo empieza siempre con texto fijo.

### 2 · Se habla de «el cobro», no de «la factura de Juan»

Es lo que evita duplicar las cinco en versión-un-hijo y versión-varios.

Los avisos se agrupan **por padre** —un padre con dos hijos recibe UN mensaje,
no dos— y con la redacción en neutro la misma plantilla lee bien en los dos
casos:

| hijos | `{{2}}` | `{{3}}` |
|---|---|---|
| 1 | `Juan Pérez` | `RD$3,000.00` |
| 2 | `Juan y María Pérez` | `RD$6,000.00` |

Una variable con nombres es **dato**, y eso Meta lo acepta. Lo que rechaza son
variables que cargan oraciones completas.

Sobre los 758 padres de los cinco colegios, agrupar ahorra **163 mensajes por
tanda** (un 18%) y —más importante— evita que 163 padres reciban el mismo
aviso dos veces seguidas, que es lo que hace que la gente bloquee el número.

### 3 · El aviso del vencimiento necesita TRES plantillas

`al-vencer` tiene tres finales según cómo esté configurada la mora del
concepto, y **una plantilla no puede ramificar**:

```
cobraMora && diasGracia > 0  → «Tienes N días antes de que se aplique el recargo.»
cobraMora && diasGracia == 0 → «Ya se aplicó el recargo por mora.»
!cobraMora                   → «Puedes pagarlo para ponerte al día.»
```

Meter la frase entera en una variable no sirve: Meta rechaza las variables que
cargan oraciones completas, precisamente porque sirven para colar textos que
nadie aprobó. Y `moraDiasGracia` es **del concepto**, no del colegio —la
colegiatura puede dar cinco días y la inscripción ninguno—, así que un mismo
colegio necesita las tres.

---

## Formato de registro

Los cinco comparten esto:

| campo | valor |
|---|---|
| **Categoría** | `UTILITY` — nunca `MARKETING` |
| **Idioma** | `Spanish (es)` — nunca `es_DO`, que no existe como locale y no se entrega |
| **Header** | Tipo **Texto**, contenido `{{1}}`, ejemplo `Colegio Andrés Bello` |
| **Footer** | vacío |
| **Botón** | **URL dinámica** — texto `Pagar ahora`, URL `https://zero.com.do/pay/{{1}}`, ejemplo `abc123` |

`UTILITY` porque son avisos transaccionales sobre una factura que el tutor ya
tiene. `MARKETING` exige opt-in explícito, se limita por calidad, el usuario lo
bloquea de un toque y Meta lo cobra más caro.

**El botón se registra desde ya aunque todavía no funcione.** Hoy le decimos al
padre cuánto debe y no dónde pagarlo; el link cuelga de un `ecf_document_id` y
los avisos escolares no lo generan. Pero **añadir un botón después obliga a
volver a aprobar la plantilla**: ponerlo ahora es gratis y después es caro.

---

## Las cinco

### 1 · `factura_lista` — el día que se emite

```
Ya está listo el cobro de {{1}} para {{2}}: {{3}}. Puedes pagarlo hasta el {{4}}.
```

| | ejemplo para el registro |
|---|---|
| `{{1}}` concepto | `Mensualidad de octubre` |
| `{{2}}` estudiante(s) | `Juan Pérez` |
| `{{3}}` monto | `RD$3,000.00` |
| `{{4}}` vencimiento | `10 de octubre` |

### 2 · `factura_vencio_hoy` — venció, con días de gracia

```
Hoy venció el cobro de {{1}} para {{2}}: {{3}}. Tienes {{4}} días antes de que se aplique el recargo.
```

`{{4}}` = `5`

### 3 · `factura_vencio_con_recargo` — venció y el recargo ya entró

```
Hoy venció el cobro de {{1}} para {{2}}: {{3}}. Ya se aplicó el recargo por mora.
```

### 4 · `factura_vencio_sin_recargo` — el concepto no cobra mora

```
Hoy venció el cobro de {{1}} para {{2}}: {{3}}. Puedes pagarlo para ponerte al día.
```

### 5 · `evita_el_recargo` — antes de que entre la mora

```
El cobro de {{1}} para {{2}} está vencido. Paga {{3}} antes del {{4}} y evita el recargo por mora.
```

`{{4}}` es la fecha del **recargo** (vencimiento + días de gracia), no la del
vencimiento. Decirle que pague «antes del 3» cuando el recargo entra el 8 le
quita cinco días que tiene.

Es el aviso que de verdad hace pagar, porque es el único que le ahorra dinero
al padre.

---

## Lo que hace que Meta rechace

- **Una variable no puede abrir ni cerrar el cuerpo.** Por eso las cinco
  empiezan con texto fijo.
- **Dos variables no pueden ir pegadas** sin nada en medio.
- **Hay que dar un ejemplo de cada variable**, y tiene que parecerse al dato
  real. Un `{{3}}` de ejemplo «XXX» se rechaza.
- **Sin emojis y sin mayúsculas de más.** Un «PAGA YA» dispara la
  reclasificación a marketing.
- Si Meta reclasifica una plantilla de utilidad como marketing, es señal de que
  el texto suena a promoción — casi siempre por un «aprovecha» o un «no te
  pierdas».

---

## Dónde se registran

`whatsapp_config` es **por `team_id`**: cada colegio tiene su propio número y
su propia cuenta de WhatsApp Business (ver `lib/whatsapp/config.ts`). Así que
lo normal es registrarlas **en la cuenta de cada colegio**, y cada colegio
nuevo necesita las cinco aprobadas antes de que sus avisos salgan fuera de la
ventana. La aprobación tarda de minutos a un día.

**Si el colegio no ha conectado su número**, hoy `enviarWhatsApp` lanza
`WhatsAppNoConectadoError` y el aviso no sale. La alternativa es mandarlo desde
el número de Zero, y por eso el colegio va en el header: la misma plantilla
sirve. Pero hay que saber lo que se acepta:

- **las respuestas llegan a nosotros**, no al colegio;
- **la calidad del número es compartida** — si los padres de un colegio
  reportan, Meta baja la calificación del número y se reducen los envíos de
  TODOS los colegios;
- **lo pagamos nosotros**, no cada colegio en su cuenta.

Recomendación: nuestro número como **respaldo para arrancar**, con un tope
mensual por colegio, y empujando a conectar el suyo desde el primer aviso.

---

## Lo que falta de nuestro lado

Ninguna de las dos es de Meta:

1. **`enviarMensaje` solo manda texto libre** (`{ to, text }`). Hay que
   extenderlo para mandar `template` con sus parámetros. Va después de que las
   plantillas estén aprobadas.
2. **Agrupar por padre** antes de enviar. Es lo que ahorra los 163 mensajes por
   tanda y lo que hace que la redacción en neutro tenga sentido.

## Volumen esperado

758 padres en los cinco colegios (Andrés Bello 364, Yisrael Kids 200, Mi Casita
139, Pérez Rivera 38, Yomalia 17). Con los tres avisos activos son ~2,270
conversaciones al mes. Conviene medirlo antes de decidir si van todas por un
solo número.
