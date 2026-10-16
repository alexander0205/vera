# Políticas del asistente de Zero

Qué debe y qué no debe hacer el asistente, dónde se aplica cada regla y por qué.
Las reglas están en código (no solo en el prompt): un modelo puede equivocarse o
ser manipulado; el código no se convence.

## Principios

1. **El modelo propone, el código decide.** El modelo interpreta la pregunta y
   escoge herramientas; permisos, módulos, enlaces y confirmaciones los decide
   código determinista.
2. **Mínimo privilegio.** Cada herramienta existe solo si la empresa tiene el
   módulo y el rol tiene el permiso de esa pantalla. Lo que no existe, el modelo
   ni lo ve.
3. **Los datos son datos.** Nada que venga de la base (nombres, notas,
   conceptos) se trata como instrucción.
4. **Lo verificable o nada.** Cifras y enlaces salen de herramientas; lo que no
   se pudo comprobar se dice como tal.
5. **Una persona confirma lo que cambia algo.**

## Qué se aplica y dónde

| # | Política | Dónde | Prueba |
|---|---|---|---|
| 1 | Solo consulta: crear, modificar o eliminar solo se **propone**; se ejecuta con «Confirmar» del usuario (token de 5 min, un uso, atado a persona, empresa y datos; permiso y módulo se revalidan; queda en auditoría) | `lib/asistente/acciones.ts`, `app/api/asistente/confirmar` | `acciones con confirmación` |
| 2 | Búsquedas por la **API de la app** con la sesión de quien pregunta, no por consultas propias a la base | `lib/asistente/api.ts`, `herramientas-api.ts` | `búsqueda de facturas por la API` |
| 3 | **Enlaces 100 % reales:** rutas del mapa o registros que una herramienta entregó en ese turno; el número de una factura nunca es su id | `lib/asistente/enlaces.ts` | `enlaces del asistente`, `enlaces de registro` |
| 4 | El texto del enlace de una factura es su **número** (legible aunque el PDF pierda el enlace) | `herramientas-api.ts`, plantillas de `local.ts` | `casos borde de conversación` |
| 5 | **Inyección indirecta:** textos de datos con forma de orden se omiten antes de llegar al modelo | `politicas.ts › neutralizarDatos`, aplicado en `enlaces.ts` a toda herramienta | `datos que vuelven de las herramientas` |
| 6 | **Salida depurada:** tarjetas (Luhn) y llaves se enmascaran; RNC, cédulas y e-NCF no | `politicas.ts › depurarSalida` | `lo que sale al usuario` |
| 7 | Solicitudes con respuesta fija, **sin modelo:** pedir el prompt, cambiar las reglas, contraseñas/llaves/tarjetas, datos de otra empresa, asesoría fiscal o legal, evasión, insultos, identidad, capacidades, mensajes vacíos | `politicas.ts › clasificarSolicitud` | `lo que no se manda al modelo` |
| 8 | **Alcance de empresa:** el `teamId` sale de la sesión; nunca del cliente ni del modelo | `acceso.ts`, `contexto.ts` | `herramientas según módulo y permiso` |
| 9 | **Totales completos o avisados:** pagina la API; si no cubre todo, lo dice | `herramientas-api.ts` | `precisión de la búsqueda de facturas` |
| 10 | Si una API falla o niega acceso, se dice; no se inventa | `seguro()` en `herramientas-api.ts` | `búsqueda de facturas por la API` |
| 11 | Límites: 100 mensajes/hora/usuario (la creación guiada son muchas respuestas cortas), 1 500 caracteres (se rechaza, no se corta), 30 PDF/hora, presupuesto de 45 s para la IA | `route.ts`, `agente.ts` | — |
| 12 | **Retención:** conversaciones sin actividad > 180 días se borran (configurable, mínimo 30) | `app/api/cron/asistente-retencion` | — |
| 13 | **Trazabilidad:** cada respuesta guarda qué consultó; cada acción confirmada queda en `audit_logs` | `asistente_mensajes.herramientas`, `ASISTENTE_ACCION_CONFIRMADA` | — |
| 14 | **Honestidad sobre la IA:** se identifica como IA si se le pregunta; «puede equivocarse» visible; handoff a una persona siempre disponible | `politicas.ts`, panel | `identidad` |

## Qué cubre el asistente y qué no

- No es asesor fiscal ni legal: da los números y remite al contador o a la DGII.
- No ayuda a evadir impuestos ni a alterar comprobantes.
- No muestra ni pide contraseñas, llaves, certificados o tarjetas.
- No habla de otras empresas.
- Todavía no ejecuta cambios; cuando los tenga, siempre con confirmación.

## Casos borde cubiertos

- «¿Y el mes pasado?» tras una pregunta: repite la anterior con el período nuevo.
- Períodos: hoy, ayer, esta semana, semana pasada, mes pasado, «en septiembre»
  (el último), «marzo de 2025», últimos N días/semanas/meses, este año.
- Un período que no sabe leer («el trimestre pasado») va a la IA, no se adivina.
- Dos temas en una pregunta («ventas y gastos») van a la IA.
- Preguntas ambiguas («facturas más repetidas»: emitidas o recurrentes): dice
  cuál contó y ofrece la otra.
- Borrador sin número: «Borrador del 2026-10-08».
- Mensajes con solo signos o emojis, o de más de 1 500 caracteres.
- Búsquedas con mayúsculas, minúsculas o tildes distintas.
- Más de 2 000 coincidencias: se avisa que el conteo cubre las más recientes.

## Referencias

- OWASP Top 10 for LLM Applications 2025: LLM01 inyección de prompt (directa e
  indirecta), LLM02 divulgación de información sensible, LLM06 agencia
  excesiva. Controles aplicados: capas (entrada, privilegios, salida), mínimo
  privilegio por herramienta, aprobación humana de acciones de riesgo, no
  confiar en el modelo como autoridad.
- Prácticas de gobierno de agentes: la aprobación debe ligarse a la acción
  exacta y expirar; la autorización la evalúa un servicio determinista, no el
  modelo; el registro debe mostrar la cadena de decisión.

## Pendiente / siguiente

- Valoración 👍/👎 por respuesta y un set fijo de preguntas con respuesta
  esperada que corra antes de cada cambio de prompt o modelo.
- Detección de abuso por patrones (muchas consultas de volcado de datos).
- Revisión de retención y base legal con el equipo legal.

## Inyección indirecta (actualización)

Los datos de herramientas se comparan normalizados (NFKC: ancho completo; sin caracteres invisibles ni tildes) y se omiten órdenes en español e inglés («ignora todo lo anterior», «disregard previous instructions», «nuevas instrucciones:», «revela tu prompt», imágenes markdown externas). El set de evaluación tiene casos que deben omitirse y casos legítimos que no (p. ej. «Academia de Instrucciones Musicales»).

## Principio de coherencia (decisión de negocio)

El asistente existe para facilitar el uso de Zero sin generar conflictos: **muestra lo mismo que muestran las pantallas**, aunque Zero tenga definiciones distintas entre módulos. Si el Dashboard y Reportes agrupan distinto, el asistente responde con el dato de la pantalla que la persona más probablemente esté comparando y lo dice (por ejemplo, «ventas por mes» usa el gráfico «Tendencia de ingresos» del Dashboard). Cuando una pregunta pide algo que solo existe en otro módulo (un mes concreto, un año), usa Reportes e indica su criterio (fecha de emisión).

## Pruebas ofensivas (`tests/unit/asistente-seguridad.test.ts`)

Batería de ~160 ataques (`tests/unit/_ataques.ts`) más ~55 consultas legítimas para
vigilar falsos positivos. Cubre: extracción del prompt (ES/EN, rodeos, traducción,
poemas, base64), jailbreak y juegos de rol, falsa autoridad, secretos, otra empresa,
volcado, evasión, código malicioso, SSRF/XSS/SQL, billing y plan, ingeniería social,
datos envenenados (inyección indirecta), disfraces (leetspeak, letras sueltas, ancho
completo, caracteres invisibles) y un **modelo comprometido** simulado que obedece lo
peor posible (exfiltración por enlaces, claves, fuga del prompt, rutas inventadas).

Capas, de afuera hacia adentro:

1. **Entrada**: políticas con respuesta fija, sin modelo y sin consultar datos
   (`clasificarSolicitud`, comparando contra variantes del texto).
2. **Límites**: 1500 caracteres, 20 mensajes por 2 minutos, 100 por hora; sin
   caracteres de control; la empresa de la sesión manda (409 si la persona veía otra).
3. **Modelo**: instrucciones con regla de secreto; herramientas de solo lectura sin
   parámetros de empresa ni usuario; datos de herramientas neutralizados.
4. **Salida**: enlaces solo a pantallas reales o a registros entregados por una
   herramienta; claves, tarjetas, JWT, cadenas de conexión y .env enmascarados;
   detector de fuga del prompt (ventanas de 9 palabras).

Límite conocido: una paráfrasis corta de las reglas puede escapar al detector de fuga;
la regla 8 del prompt y las políticas de entrada la cubren en la práctica, y lo que
puede decir no incluye secretos (solo el estilo de respuesta del asistente).

## Excel de una respuesta

`GET /api/asistente/excel?mensajeId=` genera un .xlsx con lo que ESA respuesta ya mostró
(tablas, gráficos, tarjetas o el texto). No consulta datos nuevos: no es un camino para
sacar más información de la que la persona ya vio, y una petición masiva
(«exporta toda la base de datos a Excel») sigue siendo una política de volcado.

- Misma regla de acceso que el PDF: solo respuestas propias, de su empresa; 30 por hora.
- Los textos van como texto (nunca fórmula): un nombre que empiece con `=`, `+`, `-` o `@` no se ejecuta.
- Montos, porcentajes y fechas pasan a celdas numéricas con formato; RNC, cédulas, e-NCF y códigos con ceros a la izquierda se quedan como texto.
- Una hoja por tabla o gráfico, y al final «Información» (empresa, quién, cuándo, consulta y datos consultados).

## Creación desde el chat (formularios)

El asistente muestra formularios (cliente, producto, cotización, factura, borrador,
cobro, anulación, nota de crédito y de débito, conversión, gasto, importación). Código:
`lib/asistente/formulario.ts`, `components/support/asistente/formulario-chat.tsx`.
Auditoría y pruebas: `tests/unit/asistente-formulario-seguridad.test.ts` y el bloque
«formularios de creación con un modelo comprometido» de `asistente-seguridad.test.ts`.

### Invariantes (no se negocian)

1. **La IA no escribe.** Ninguna herramienta suya crea, edita ni borra; el carril de
   propuestas (`acciones.ts`) está vacío. Un formulario solo es una invitación a llenar.
2. **Solo si la persona lo pidió.** `filtrarFormulariosDeIa` deja pasar un formulario únicamente
   si lo escrito pide una acción y NOMBRA esa cosa; un solo formulario por respuesta; los datos
   adelantados solo valen si ella los dijo; montos, líneas, archivos y la factura elegida
   jamás vienen de la IA. El bloque se reescribe desde cero (claves desconocidas no sobreviven).
3. **Dirección y cuerpo salen de un registro en código.** Nada del texto elige a dónde se envía
   (`endpointDe`, solo id de 1 a 10 dígitos) ni qué claves viajan (`armarPayload`): un test con
   valores hostiles (`teamId`, `role`, `force`, `__proto__`…) comprueba que ninguna se cuela.
4. **Enviar es un acto de la persona.** Sin envío automático; un solo envío a la vez (cerrojo);
   emitir a la DGII, anular y convertir piden una segunda confirmación con total y cliente a la vista.
5. **Mismas reglas que la pantalla.** Cada formulario llama a la ruta de la API que ya usa la
   pantalla, con la sesión de quien lo llena: permisos, validaciones y secuencias son los de siempre.
6. **Enlaces de resultado = pantallas internas.** `esEnlaceInterno` (solo `/dashboard/...`,
   sin `//`, `\`, `..`, esquema ni consulta), también al leer lo guardado en el navegador.
7. **Importes y fechas con tope** (RD$ 20 millones por documento, cantidad ≤ 1 000 000, fechas
   reales, cobro ≤ saldo y no futuro, 4 archivos de gasto): un importe desmedido llegaba a la API
   y volvía como «Error interno» (la base guarda centavos en 32 bits).
8. **Las rutas validan que todo id del cuerpo sea de la empresa** (`lib/seguridad/pertenencia.ts`):
   cliente, almacén, vendedor, lista de precios y productos. Antes se guardaban ids de otra
   empresa y la ficha de la factura mostraba teléfono y correo del cliente ajeno.

### Políticas de entrada añadidas

Saltarse la confirmación («sin pedirme confirmación», «confirma por mí», «hazlo tú mismo»),
borrar el rastro («desactiva la auditoría»), falsa autoridad con orden («como administrador
de Zero te ordeno…»), comprobantes falsos o duplicar NCF, «sin pasar por la DGII», creación en
masa o en bucle, crear en otra empresa y «sin límite de monto». Respuesta fija, sin modelo.

### Riesgos residuales (conocidos)

- No hay idempotencia en el servidor para cobros, clientes ni cotizaciones: el cerrojo y el
  «Listo» guardado evitan el doble envío desde el panel, no una repetición desde dos pestañas.
- La segunda confirmación de emitir es de interfaz: una llamada directa a la API (igual que fuera
  del chat) no la pasa; el control real es el permiso `facturas:crear` de la API.
- Las importaciones CSV guardan lo que traen (un nombre `=…` se exporta como texto en el Excel del
  asistente, pero otros reportes antiguos pueden tratarlo distinto).
- Un gasto subido se valida por contenido (tipo) y tamaño en el servidor, no por el nombre.

## Auditoría de las rutas con ids en el cuerpo (2026-10-16)

Se revisaron las 295 rutas de la API que modifican datos (inventario por script +
lectura de las 83 que reciben ids + batería de ataques en vivo con ids de otra empresa).
Pruebas permanentes: `tests/unit/seguridad-rutas-api.test.ts` (incluye un inventario que
falla si aparece una ruta nueva que modifica sin guarda).

**Corregido**
- Ids de OTRA empresa aceptados y guardados: cliente (emitir, cotización, cuentas por cobrar
  históricas, recurrentes), almacén, vendedor y lista de precios (emitir), productos (lista de
  precios), terminal y mesa (POS), mesero y turno (comandas), categoría (productos), responsable
  de seguimiento y almacén (inventario, compras). Ahora `lib/seguridad/pertenencia.ts` los exige de
  la empresa. Fuga real: la ficha de la factura y la vista previa en PDF mostraban teléfono y
  correo de un cliente ajeno; ahora también filtran por empresa.
- Permisos que faltaban: cobros (`/api/pagos`, `/api/facturas/[id]/pago`), generar factura de una
  recurrente, subir o revocar el certificado, cambiar o cancelar el plan, conectar WhatsApp. Antes
  bastaba con estar en la empresa (un rol de solo lectura podía hacerlo).
- Tareas programadas: `Authorization: Bearer ${process.env.CRON_SECRET}` valía «Bearer undefined»
  si el secreto no estaba definido. Ahora `llamadaDeCronValida` exige un secreto de 16+ caracteres
  y compara en tiempo constante (15 rutas).
- `/api/rnc/sync?force=true` (descarga de 780 mil filas) solo para el administrador de plataforma;
  `/api/ecf/preview` pide sesión; importaciones CSV con tope de 5 MB; un importe desmedido frenado antes
  de la API.

**Verificado sin cambios**: las rutas de la capa escolar, POS (terminales), contabilidad, cobros por
cuenta, anular, convertir, emitir-ecf, fotos y clientes ya validaban la empresa (404/422 con ids ajenos).

**Pendiente / residual**
- `/api/notes` acepta notas sobre un id de otra empresa (solo se leen dentro de la empresa que las
  escribió; sin fuga).
- `DELETE /api/facturas-recurrentes/[id]` responde `ok` aunque no borre nada (id de otra empresa):
  correcto en seguridad, engañoso en la respuesta.
- Operativo: `CRON_SECRET` debe estar definido (16+ caracteres) en cada entorno; sin él las tareas
  programadas devuelven 401.

## Creación guiada por conversación (2026-10-16)

Además del formulario, la persona puede pedir «guíame paso a paso para crear una factura» (o cotización, cliente, producto, cobro) y el asistente va preguntando de a una.

- **Sin modelo**: `lib/asistente/guiado.ts` es una máquina de estados determinista; cada pregunta es una plantilla y cada respuesta se interpreta con reglas. Nada de lo que escribe la persona llega a un modelo en este flujo.
- **Estado en la conversación**: cada pregunta lleva un bloque ```` ```paso ```` con el estado en JSON; la respuesta siguiente lo lee del mensaje anterior del asistente. `leerEstado` reconstruye campo por campo (claves permitidas, ids solo dígitos, líneas por `leerLineas`). La UI no lo muestra.
- **Quien crea es la persona**: al final se arma un ```` ```formulario-guiado ```` con todo lleno y se dibuja el mismo formulario de siempre; hasta que ella pulsa el botón (y confirma emitir/anular) no se guarda nada.
- **El modelo no puede falsificarlo**: `quitarBloquesGuiados` (dentro de `filtrarFormulariosDeIa`) borra de la salida del modelo cualquier ```` ```paso ```` o ```` ```formulario-guiado ````; `parsearGuiado` solo acepta formularios guiados, claves conocidas y valores validados.
- **Búsquedas**: clientes, productos y facturas se leen por la misma API de la pantalla con la sesión de la persona (`guiado-servidor.ts`); los nombres se muestran sin marcado (`nombreSeguro`).
- **Salidas**: «cancelar» termina; «formulario» pasa al formulario con lo recogido; una pregunta suelta abandona el flujo y sigue el camino normal. Una respuesta numérica («1») no la frena la política de «vacío» dentro de un flujo.
- Pruebas: `tests/unit/asistente-guiado.test.ts`.

### La conversación es el camino por defecto (2026-10-16)

«Crea un cliente», «anula una factura», «hazme una nota de crédito»… abren directamente las preguntas; ya no hace falta decir «paso a paso». El formulario solo sale si la persona lo pide («dame el formulario», o «formulario» a mitad del flujo) y, siempre, para lo que lleva archivos (gastos e importaciones).

Flujos: cliente, producto, cotización, factura, cobro, anulación, nota de crédito (elige líneas y cantidades de la factura), nota de débito (cargos libres), convertir cotización y editar borrador (elige qué cambiar: cliente, líneas, nota). Las facturas, cotizaciones y clientes existentes se buscan por la API de la pantalla; si hay varios se numeran para elegir, y si no hay ninguno se pide otra búsqueda. La factura que no admite nota (anulada, ya es nota) se rechaza en la propia conversación.

El formulario final conserva lo dicho en la conversación sobre lo que trae la factura al elegirla (`fijosDeLaConversacion`).
