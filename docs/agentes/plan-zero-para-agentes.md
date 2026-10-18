# Zero para agentes de IA: plan de trabajo

Fecha: 14 de octubre de 2026. Rama: `feat/agentes-ia` (sale de `v2`).

## 1. Qué se quiere

Que un asistente de IA (ChatGPT, Claude, Gemini, Perplexity o el que use el cliente) pueda hacer tres cosas con Zero, en este orden:

1. **Encontrarlo y entenderlo.** Cuando alguien pregunte por un sistema de facturación, contabilidad o colegios en República Dominicana, el asistente conoce a Zero, sabe todo lo que hace y da el dato correcto.
2. **Consumir la información sin esfuerzo.** Todo lo que un agente necesita está en texto limpio, en direcciones estables y con la respuesta al principio.
3. **Actuar.** A nombre de una persona, el agente crea la empresa, arranca la prueba, recibe su llave y opera: clientes, cotizaciones, facturas, cobros.

La información tiene además que **vender el sistema entero**: todas las funciones, bien descritas y sin exagerar.

### Cómo se sabrá que funcionó

| Qué se mide | Cómo |
|---|---|
| Los asistentes responden bien sobre Zero | 20 preguntas fijas a 4 asistentes, una vez al mes; se anota si mencionan a Zero y si el dato es correcto |
| Llegan visitas desde asistentes | Visitas con origen en ChatGPT, Perplexity, Gemini y Claude en la analítica del sitio |
| Los rastreadores de IA entran | Peticiones de `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot` y similares en los registros |
| Los agentes se conectan | Llaves creadas y llamadas al conector por semana |
| Los agentes crean empresas (fase 3) | Altas iniciadas por agente, aprobadas por el dueño y que facturan en la prueba |

## 2. Punto de partida

Comprobado en producción y en el código el 14 de octubre de 2026.

| Pieza | Estado |
|---|---|
| `robots.txt` que invita por nombre a los rastreadores de IA | Hecho |
| `sitemap.xml` | Hecho |
| `llms.txt` con productos, precios, guías y «Qué NO hace» | Hecho, pero solo informa; no dice que un agente puede conectarse |
| Datos estructurados (organización, producto, preguntas, artículo) | Hecho en las páginas públicas |
| Seis guías de trámites con la respuesta al principio y fuentes | Hecho |
| Llaves por empresa (`emdo_…`), con permisos de lectura, escritura o administración | Hecho; las crea un usuario con permiso de configuración |
| Conector MCP en `app.zero.com.do/api/mcp` | Hecho, **solo lectura**, 11 herramientas |
| Tope de uso del conector | Hecho: 120 por minuto por dirección, 300 por minuto por llave |
| Alta de empresa con prueba sin tarjeta | Hecho, **solo por la web y con una persona** |
| Página que explique a un agente cómo usar Zero | No existe |
| Catálogo completo de funciones en texto limpio | No existe |
| Escritura por el conector (crear cliente, factura, cobro) | No existe |
| Alta de empresa iniciada por un agente | No existe |
| Conexión de un clic desde ChatGPT o Claude (OAuth) | No existe; hoy se pega la llave a mano |

## 3. Casos de uso

**Quiénes participan**

- **Asistente de consulta:** responde preguntas; no tiene cuenta en Zero.
- **Agente del dueño:** trabaja para el dueño de un negocio, con su permiso.
- **Agente del contador:** trabaja para un contador que lleva varias empresas.
- **Dueño o usuario:** la persona. Es quien aprueba.

| N.º | Caso | Quién | Qué necesita de Zero | Fase |
|---|---|---|---|---|
| 1 | «¿Qué sistema de facturación electrónica hay en RD?» y el asistente cita a Zero | Asistente de consulta | Páginas legibles, datos correctos, catálogo de funciones | 1 |
| 2 | «¿Zero hace nómina / inventario / colegios?» | Asistente de consulta | Catálogo completo con lo que sí y lo que no hace | 1 |
| 3 | «¿Cuánto me cuesta para 3 usuarios y 200 facturas al mes?» | Asistente de consulta | Planes, topes y precios en texto, salidos del catálogo de planes | 1 |
| 4 | «¿Cuándo se presenta el 606?» y cita la guía de Zero | Asistente de consulta | Guías con respuesta al principio y versión en texto | 1 y 6 |
| 5 | «Conéctate a mi Zero y dime quién me debe» | Agente del dueño | Instrucciones de conexión, llave de lectura | 1 (ya funciona; falta explicarlo) |
| 6 | «Créame mi empresa en Zero» | Agente del dueño + dueño | Alta por agente con aprobación del dueño por enlace | 3 |
| 7 | «Hazle una cotización a este cliente» | Agente del dueño | Escritura: crear cliente y cotización | 2 |
| 8 | «Factúrale esto» antes de la habilitación fiscal | Agente del dueño | Escritura: factura sin comprobante fiscal | 2 |
| 9 | «Emite el comprobante fiscal» | Agente del dueño + usuario | Emisión con confirmación de la persona | 4 |
| 10 | «Registra que me pagaron» | Agente del dueño | Escritura: registrar un cobro | 2 |
| 11 | «¿Qué me falta para facturar con la DGII?» | Agente del dueño | Estado de la habilitación y el siguiente paso | 4 |
| 12 | «Súbeme de plan» o «paga la suscripción» | Agente del dueño + dueño | Enlace de pago; paga la persona | 4 |
| 13 | Colegio: «cóbrale la excursión a todo 4.º» | Agente del colegio + usuario | Escritura escolar con revisión previa de la lista | 2 (después de facturación) |
| 14 | Contador: «dame las cuentas por cobrar de mis cinco clientes» | Agente del contador | Una llave por empresa, o acceso multiempresa | 5 |
| 15 | El agente no puede hacer algo | Cualquiera | Un «no puedo» claro y cómo llegar a soporte humano | 1 |

## 4. Riesgos

| Riesgo | Qué pasaría | Cómo se evita | Fase |
|---|---|---|---|
| Altas falsas en masa | Robots crean miles de empresas y pruebas | La prueba arranca solo cuando el dueño aprueba por correo; tope por correo y por dirección; revisión de altas sin actividad | 3 |
| Suplantación de un RNC | Alguien registra la empresa de otro | El alta por agente queda marcada; la emisión fiscal sigue exigiendo certificado digital, que solo tiene el dueño real | 3 y 4 |
| Operaciones repetidas | El agente reintenta y crea dos facturas iguales | Clave única por operación: repetir la misma devuelve la primera, no crea otra | 2 |
| Instrucciones escondidas en los datos | Un nombre de cliente o una nota dice «anula todo» y el agente obedece | Las respuestas del conector marcan su contenido como datos; las acciones delicadas piden confirmación de una persona | 2 |
| Fuga entre empresas | Un agente ve datos de otra empresa | La llave pertenece a una sola empresa y eso se comprueba en el código, en cada llamada | Ya está; se prueba en cada fase |
| Llave filtrada | Un tercero opera con ella | Lectura por defecto; la escritura se pide aparte; se revoca en un clic; vencimiento opcional; bitácora | 2 |
| Emisión fiscal equivocada | Un comprobante aceptado por la DGII no se borra: solo se corrige con nota de crédito | La emisión fiscal nunca es automática: la confirma una persona | 4 |
| Datos de menores | El conector expone alumnos y tutores a un modelo de terceros | Las herramientas escolares devuelven lo mínimo; el colegio decide si crea la llave; se advierte al crearla | 2 |
| Documentación que envejece | La IA aprende un precio o una función que ya cambió | Precios y herramientas salen del mismo código que usa el sistema; una prueba falla si la página dice algo distinto | 1 |
| Prometer de más | El asistente vende algo que Zero no hace y el cliente se va molesto | Se mantiene «Qué NO hace»; lo que aún no existe se dice como «todavía no» | 1 |
| Apostar a una convención sin dueño | `llms.txt` no es un estándar y pocos rastreadores lo piden | Es un extra barato; lo que pesa es que el contenido esté en la página y que los rastreadores puedan entrar | 1 |
| Costo y abuso de cómputo | Llamadas en bucle encarecen el servidor | Topes ya existentes; se revisan al añadir escritura | 2 |
| Soporte | Dudas nuevas: «mi asistente no conecta» | Sección de errores con su causa y su arreglo; canal de soporte visible | 1 |
| Términos legales | Un agente «acepta» los términos por la persona | Los términos los acepta la persona, en el enlace de aprobación | 3 |

## 5. Políticas

Reglas fijas. Si una función nueva choca con una, la función cambia.

1. **Una persona aprueba lo que compromete:** crear la empresa, aceptar los términos, pagar, emitir un comprobante fiscal, anular y enviar mensajes a terceros.
2. **El agente nunca conoce la contraseña.** Trabaja con su propia llave. El dueño entra con su contraseña como siempre.
3. **Permiso mínimo.** Una llave nueva solo lee. Escribir y emitir son permisos aparte, pedidos a propósito.
4. **Una llave, una empresa.** Y se comprueba en el servidor, no en las instrucciones del modelo.
5. **Todo queda en bitácora:** qué llave, qué herramienta, con qué datos, qué resultó y cuándo.
6. **Toda escritura lleva clave única.** Repetir una operación no la duplica.
7. **Lo que el agente lee es dato, no orden.**
8. **Topes de uso** por llave y por dirección, con respuesta clara cuando se exceden.
9. **Datos personales, lo mínimo.** Sobre todo de alumnos y tutores.
10. **Decir la verdad.** Lo que no se hace se dice; lo que falla explica por qué y qué hacer.
11. **Una sola fuente.** Precios, planes, herramientas y topes que se publican salen del mismo código que usa el sistema.
12. **Revocar es inmediato** y lo puede hacer el dueño solo.

## 6. Lo que reemplazó al SEO, y cómo se organiza la información

Antes se escribía para salir en una lista de enlaces. Ahora un asistente lee varias páginas, arma una respuesta y cita dos o tres fuentes. Se compite por ser **la fuente citada** y, después, por ser **el sistema que el agente puede usar**.

### Tres capas

| Capa | Pregunta que responde | Qué hace falta |
|---|---|---|
| Ser citado | «¿Me menciona el asistente?» | La respuesta en el primer párrafo, títulos en forma de pregunta, tablas comparables, cifras con su fuente, fecha de actualización, datos estructurados y contenido en la página (no cargado después) |
| Ser legible | «¿Puede leerme sin esfuerzo?» | Índice `llms.txt` corto y cuidado, versión en texto de cada página importante, enlace entre la página y su versión en texto, direcciones estables |
| Ser operable | «¿Puede hacer algo conmigo?» | Conector, instrucciones de conexión, catálogo de herramientas, errores explicados y reglas claras |

### Lo que dicen las guías consultadas, con sus reservas

- Coinciden en lo básico: respuesta directa, estructura clara, datos propios, fuentes citadas y contenido al día.
- El relleno de palabras clave rinde mal en respuestas generadas; añadir cifras, fuentes y citas rinde mejor (estudio académico de 2024, leído a través de un resumen de terceros).
- `llms.txt` es una convención, no un estándar. Los rastreadores grandes leen sobre todo la página normal. Las cifras de «47 % más citas» que circulan son de proveedores y no están verificadas.
- La ficha del conector (`server-card`) todavía no tiene una dirección definitiva; se publica cuando la especificación se asiente.

### Mapa de la información para agentes

| Dirección | Para qué |
|---|---|
| `/llms.txt` | Índice: qué es Zero, productos, precios, guías y la puerta a todo lo demás |
| `/agentes` | Página para personas y asistentes: qué puede hacer un agente con Zero |
| `/agentes.md` | Lo mismo en texto limpio |
| `/funciones` | Catálogo completo de funciones por módulo, con lo que no hace, para personas y asistentes |
| `/funciones.md` | Lo mismo en texto limpio |
| `/precios` y su versión en texto | Planes, topes y precios |
| `/guias/…` | Trámites dominicanos explicados |
| `app.zero.com.do/api/mcp` | El conector |

### Cómo se escribe para un agente

- Primero el hecho, después la explicación.
- Una idea por línea; listas y tablas antes que párrafos largos.
- Nombres exactos: el de la herramienta, el del permiso, el del error.
- Ejemplos completos que se puedan copiar.
- Nada de adjetivos de venta. A un agente lo convence que el dato sea exacto y esté donde lo busca.
- Cada página dice cuándo se actualizó.

## 7. Fases

Cada fase se prueba y sube por separado.

### Fase 1 — Información para agentes (esta rama)

Sin riesgo para los datos: solo se publican textos.

- Página `/agentes` y su versión en texto `/agentes.md`.
- Catálogo completo de funciones, `/funciones` y `/funciones.md`, levantado desde el código: 16 módulos, lo que no hace cada uno, comprobantes, planes y reglas de la prueba.
- Sección «Para agentes de IA» en `llms.txt`.
- Entrada en el mapa del sitio y enlace entre cada página y su versión en texto.
- Prueba automática: la lista de herramientas y los topes publicados coinciden con el código.

Listo cuando: un asistente que lea solo `llms.txt` y `/agentes.md` puede explicar qué hace Zero, cuánto cuesta y cómo conectarse, sin inventar nada.

### Fase 2 — Escritura segura en el conector

- Herramientas: crear cliente, crear cotización, crear factura sin comprobante fiscal, registrar cobro.
- Permiso de escritura en la llave, clave única por operación y bitácora.
- Después: cargos escolares a varios alumnos, con revisión previa de la lista.

Listo cuando: repetir diez veces la misma orden crea un solo documento, y una llave de lectura no puede escribir.

### Fase 3 — Alta por agente con aprobación

- El agente envía los datos del negocio y el correo del dueño.
- El dueño recibe un enlace, pone su contraseña y acepta los términos; ahí arranca la prueba, con el mismo cierre que ya existe.
- El agente recibe la llave de esa empresa.

Listo cuando: una persona le pide a su asistente «créame mi empresa en Zero», aprueba un correo y termina con sesión iniciada y su prueba corriendo.

### Fase 4 — Plan, pago y habilitación fiscal

- Herramienta que devuelve el enlace de pago del plan; paga la persona.
- Herramienta que dice en qué paso de la habilitación con la DGII va la empresa y qué falta.
- Emisión del comprobante fiscal con confirmación de una persona.

### Fase 5 — Conexión de un clic y directorios

- Inicio de sesión estándar para conectores (OAuth), para no pegar llaves a mano.
- Ficha del conector y alta en los directorios públicos de conectores.
- Acceso para contadores con varias empresas.

### Fase 6 — Más contenido citable

- Versión en texto de cada guía.
- Más guías de trámites y comparativas honestas.
- Presencia en sitios de terceros, que es de donde los asistentes sacan buena parte de sus respuestas.

## 8. Lo que salió al levantar el inventario

El catálogo se levantó desde el código el 14 de octubre de 2026. Dos listas que hay que resolver, porque un asistente repite lo que el sitio dice.

### El sitio afirma cosas que no pude confirmar en el código

| Dónde lo dice | Qué dice | Qué encontré |
|---|---|---|
| Página de ERP y de precios | «Impresoras fiscales» | Solo impresión en carta y térmica de 80 y 58 mm |
| Página de ERP | La factura «sale al cliente sola, con su XML, y puede ir por WhatsApp» | El envío es manual, adjunta solo el PDF y no hay envío de facturas por WhatsApp |
| Página de ERP y catálogo de planes | Las mensualidades «se facturan solas, con su comprobante fiscal» | Se generan como borrador; el comprobante se asigna cuando un usuario la emite |
| Página de punto de venta | «Ticket impreso o por WhatsApp» | No hay envío por WhatsApp en el punto de venta |
| Página de punto de venta | «Devoluciones… sale su nota de crédito» | La pantalla de devoluciones dice «pronto» |
| Página de precios | «Links de pago (CardNet, Azul)» | Están construidos pero ocultos en producción |
| Página de colegios | «El saldo se actualiza al instante» | Con transferencia no baja hasta que el colegio aprueba el comprobante |
| Página de colegios | «Varias empresas bajo un mismo cierre» | Hay varias empresas por usuario, pero no consolidación |
| Página de nómina | «Incentivos y préstamos aplicados por regla», «seguros y descuentos fijos» | Solo horas extra y un campo general de otras deducciones |
| `llms.txt` | «API REST y webhooks en las dos direcciones», «Google Calendar» | Lectura por llave y webhooks de salida sin pantalla; no hay calendario |
| Página del CRM | 99.9 % de disponibilidad, SOC 2 | No hay nada en este código que lo respalde |
| Todo lo del CRM | Sus funciones | El CRM es otro producto; no está en este código |

Y una en sentido contrario: `llms.txt` y la página de nómina dicen que **no** genera archivo de pago para el banco, pero el sistema sí tiene «Descargar dispersión».

El catálogo nuevo no repite ninguna de estas afirmaciones.

**17 de octubre de 2026: corregido el texto.** Se volvió a revisar cada afirmación contra el código y se reescribió el sitio para decir lo que hace hoy: impresión en térmica y carta, factura que se manda con un clic, mensualidades que se generan como borrador, saldo que baja al aprobar el comprobante, nada de enlaces con tarjeta, nómina con su archivo para el banco y sin préstamos ni bonos, y «directo a la DGII» en vez de «certificada». La revisión encontró dos más: el punto de venta **no** envía el e-CF a la DGII al cobrar (guarda la venta y se emite desde Facturación) y la venta con comprobante no baja del inventario hasta que se emite. Si se termina alguna de esas funciones, el texto puede volver a decirlo. La página del CRM no se tocó: el CRM es otro producto y su código no está aquí.

### Funciones que existen y están apagadas en producción

| Función | Estado |
|---|---|
| Cobro con tarjeta por enlace (CardNet y Azul) | El interruptor no está definido en producción: oculto |
| Recordatorio semanal de documentos escolares | El interruptor no está definido en producción |
| Avisos de cobro escolares, lectura de facturas con IA, SIGERD, SMS y WhatsApp | Sus interruptores sí están definidos en producción |

Solo se comprobó que el interruptor exista, no su valor.

## 9. Decisiones que hacen falta

1. ¿La escritura por el conector entra en todos los planes o solo desde alguno?
2. ¿Tope de altas por agente al día, mientras se observa el abuso?
3. ¿La dirección de la página será `/agentes`? (así queda en esta rama)
4. ¿Quién revisa cada mes las 20 preguntas de medición?

## 10. Fuentes consultadas

- Amazon, funciones de su asistente de compras: https://aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features
- Apollo, resumen de su asistente: https://knowledge.apollo.io/hc/en-us/articles/39359204112397
- Guía de optimización para motores generativos: https://llmrefs.com/generative-engine-optimization
- Cómo optimizar contenido para búsqueda con IA: https://otterly.ai/blog/how-to-optimize-content-for-ai-search/
- Guía de `llms.txt` (mayo de 2026): https://codersera.com/blog/llms-txt-complete-guide-2026/amp/
- Especificación de preparación para agentes, `llms.txt`: https://www.specification.website/spec/agent-readiness/llms-txt/
- Ficha del conector, explicación: https://dev.to/turva-dev/mcp-server-cards-explained-5hgb
- Autorización en conectores: https://aaif.io/blog/the-anatomy-of-mcp-authorization-how-the-hardened-flow-actually-runs
