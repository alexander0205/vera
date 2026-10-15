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
| 11 | Límites: 40 preguntas/hora/usuario, 1 500 caracteres (se rechaza, no se corta), 30 PDF/hora, presupuesto de 45 s para la IA | `route.ts`, `agente.ts` | — |
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
2. **Límites**: 1500 caracteres, 12 preguntas por 2 minutos, 40 por hora; sin
   caracteres de control; la empresa de la sesión manda (409 si la persona veía otra).
3. **Modelo**: instrucciones con regla de secreto; herramientas de solo lectura sin
   parámetros de empresa ni usuario; datos de herramientas neutralizados.
4. **Salida**: enlaces solo a pantallas reales o a registros entregados por una
   herramienta; claves, tarjetas, JWT, cadenas de conexión y .env enmascarados;
   detector de fuga del prompt (ventanas de 9 palabras).

Límite conocido: una paráfrasis corta de las reglas puede escapar al detector de fuga;
la regla 8 del prompt y las políticas de entrada la cubren en la práctica, y lo que
puede decir no incluye secretos (solo el estilo de respuesta del asistente).
