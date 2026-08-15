# Plantillas de WhatsApp — propuesta

Para registrar en la API de WhatsApp Business. Salen de los textos que ya manda
`redactar()` en `lib/administracion-escolar/avisos.ts`, no de cero: lo que hoy
se envía como texto libre es lo que hay que convertir en plantilla.

---

## Por qué hacen falta

WhatsApp solo deja escribir **texto libre dentro de las 24 horas** siguientes al
último mensaje del tutor. Fuera de esa ventana la API devuelve 422 y el mensaje
no sale. Una plantilla aprobada es la única forma de escribir siempre.

Hoy `enviarMensaje` manda `{ to, text }` y nada más: **el cliente habrá que
extenderlo** para mandar `template` con sus parámetros. Eso es trabajo nuestro,
no de Meta, y va después de que las plantillas estén aprobadas.

## Lo primero, y lo que más rechazos causa

**Categoría: `UTILITY`.** No `MARKETING`.

Son avisos transaccionales sobre una factura que el tutor ya tiene. `MARKETING`
exige opt-in explícito, se limita por calidad y el usuario puede bloquearlo de
un toque; además Meta lo cobra más caro. Si al enviar una plantilla de utilidad
Meta la reclasifica como marketing, es señal de que el texto suena a promoción —
casi siempre por un «aprovecha», un «no te pierdas» o un emoji de oferta.

**Idioma: `es`.** No `es_DO`: la variante dominicana no existe como locale en
WhatsApp y una plantilla registrada en un locale que el teléfono no tiene no se
entrega.

---

## Las tres plantillas

Los nombres van en minúscula con guiones bajos, que es lo que la API acepta.

### 1 · `factura_lista`

Sale el día que se emite. Es el que hoy ya va por WhatsApp.

```
Cuerpo:
Hola. Ya está lista la factura de {{1}} de {{2}}: {{3}}.
Tienes hasta el {{4}} para pagarla.

Pie:
{{5}}
```

| | ejemplo |
|---|---|
| `{{1}}` concepto | Mensualidad de octubre |
| `{{2}}` estudiante | Juan Pérez |
| `{{3}}` monto | RD$3,000.00 |
| `{{4}}` fecha de vencimiento | 10 de octubre |
| `{{5}}` colegio | Colegio Andrés Bello |

### 2 · `factura_vencio_hoy`

El día del vencimiento.

```
Cuerpo:
Hoy venció la factura de {{1}} de {{2}}: {{3}}.
Tienes {{4}} días antes de que se le aplique el recargo.

Pie:
{{5}}
```

### 3 · `evita_el_recargo`

Antes de que entre la mora. Es el que le ahorra dinero al tutor.

```
Cuerpo:
La factura de {{1}} de {{2}} está vencida.
Paga {{3}} antes del {{4}} y evita el recargo por mora.

Pie:
{{5}}
```

---

## El problema del aviso del vencimiento

`al-vencer` hoy tiene **tres finales distintos** según el colegio:

```
cobraMora && diasGracia > 0  → «Tienes N día(s) antes de que se le aplique el recargo.»
cobraMora && diasGracia == 0 → «Ya se le aplicó el recargo por mora.»
!cobraMora                   → «Págala para ponerte al día.»
```

**Una plantilla no puede ramificar.** Y meter la frase entera en una variable no
sirve: Meta rechaza las variables que cargan oraciones completas, precisamente
porque sirven para colar textos que nadie aprobó.

Así que hacen falta **tres plantillas**, no una:

| nombre | cuándo |
|---|---|
| `factura_vencio_hoy` | cobra mora y quedan días de gracia |
| `factura_vencio_con_recargo` | cobra mora sin gracia — el recargo ya entró |
| `factura_vencio_sin_recargo` | el colegio no cobra mora |

Son cinco plantillas en total, no tres. Es tedioso pero es la forma correcta:
la alternativa es un texto genérico que no dice lo que el tutor necesita saber.

**Texto de las dos variantes:**

```
factura_vencio_con_recargo
Hoy venció la factura de {{1}} de {{2}}: {{3}}.
Ya se le aplicó el recargo por mora.

factura_vencio_sin_recargo
Hoy venció la factura de {{1}} de {{2}}: {{3}}.
Págala para ponerte al día.
```

---

## Las trampas que hacen que Meta rechace

- **Una variable no puede abrir ni cerrar el cuerpo.** `{{1}}, ya está lista tu
  factura` se rechaza. Por eso los tres empiezan por texto fijo.
- **Dos variables no pueden ir pegadas.** `{{1}} {{2}}` sin nada en medio, no.
- **Hay que dar un ejemplo de cada variable** al registrarla, y tiene que
  parecerse al dato real. Un `{{3}}` de ejemplo «XXX» se rechaza.
- **Sin emojis y sin mayúsculas de más.** «PAGA YA» es lo que dispara la
  reclasificación a marketing.
- **El pie no admite variables** en algunas versiones de la API. Si el registro
  del colegio falla por eso, el nombre pasa al cuerpo:
  `«{{5}}: hoy venció la factura de…»` — pero entonces la variable abre el
  cuerpo, que es lo que no se puede. La salida es un **header de texto fijo con
  el nombre del colegio**, y eso obliga a una plantilla por colegio.

**Esa última es la decisión de fondo, y conviene tomarla ahora:** ¿las plantillas
son de Zero o de cada colegio? Cada colegio tiene su propio número y su propia
cuenta de WhatsApp Business (ver `lib/whatsapp/config.ts`), así que **las
plantillas se registran en la cuenta del colegio, no en la nuestra**. Eso
significa que cada colegio nuevo necesita las cinco aprobadas antes de que sus
avisos salgan fuera de la ventana — y la aprobación tarda de minutos a un día.

Si es así, el nombre del colegio **sobra en la plantilla**: el tutor ya ve de
qué número le escriben. Con eso caen a cuatro variables y desaparece el problema
del pie.

---

## Lo que yo registraría

Cinco plantillas, `UTILITY`, `es`, **sin el nombre del colegio** (lo aporta el
remitente):

```
factura_lista
Hola. Ya está lista la factura de {{1}} de {{2}}: {{3}}. Tienes hasta el {{4}} para pagarla.

factura_vencio_hoy
Hoy venció la factura de {{1}} de {{2}}: {{3}}. Tienes {{4}} días antes de que se le aplique el recargo.

factura_vencio_con_recargo
Hoy venció la factura de {{1}} de {{2}}: {{3}}. Ya se le aplicó el recargo por mora.

factura_vencio_sin_recargo
Hoy venció la factura de {{1}} de {{2}}: {{3}}. Págala para ponerte al día.

evita_el_recargo
La factura de {{1}} de {{2}} está vencida. Paga {{3}} antes del {{4}} y evita el recargo por mora.
```

## Lo que vendría después, y vale la pena

Un **botón de URL** «Pagar ahora» con la parte variable del enlace. Cierra el
aviso: hoy le decimos al tutor cuánto debe y no le damos dónde pagarlo.

No se puede todavía. `payment_links` cuelga de un `ecf_document_id`, y los
avisos escolares no generan el link — habría que crearlo al emitir el cargo. Es
trabajo de nuestro lado, no de Meta, pero conviene **dejar el botón previsto en
la plantilla desde el registro**: añadirlo después obliga a volver a aprobarla.
