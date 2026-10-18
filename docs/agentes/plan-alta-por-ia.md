# Que una IA dé de alta una empresa completa en Zero

18 de octubre de 2026. Continúa `plan-zero-para-agentes.md` (fase 1 en producción desde hoy).

## La meta

Una persona le dice a su asistente (ChatGPT, Claude, Gemini, Copilot): «créame mi empresa en Zero y déjala lista para facturar». El asistente hace todo; la persona solo hace lo que por ley o por seguridad tiene que hacer ella, y casi siempre con un clic en un enlace.

## Lo que la persona tiene que hacer sí o sí

Son cinco momentos. Todo lo demás lo hace el asistente.

| # | Momento | Por qué es de la persona | Cómo se le facilita |
|---|---|---|---|
| 1 | Entrar o crear su cuenta, verificar su correo y aceptar los términos | Es su identidad y su contrato | Una sola pantalla de Zero (la del conector): «Entrar con Google» o correo, y ahí mismo acepta. Con Google no hay correo que verificar |
| 2 | Subir el certificado digital (.p12) y su clave | Es su firma fiscal; nunca debe pasar por el chat | El asistente le da un enlace a una página de Zero para subirlo |
| 3 | Los pasos en el portal de la DGII (postulación, URLs, declaración jurada, rangos de e-NCF) | Se hacen con su usuario de la DGII, fuera de Zero | El asistente le dice qué hacer, paso a paso, y Zero hace todo lo que se puede hacer dentro (pruebas, firmas, PDFs) |
| 4 | Pagar el plan | Ni Claude ni ChatGPT permiten que el conector cobre | La prueba arranca sin tarjeta; para pagar, el asistente le da el enlace de su suscripción en zero.com.do |
| 5 | Aprobar lo que no se puede deshacer: emitir un e-CF, registrar un cobro, aprobar la nómina, anular | Son actos fiscales o de dinero | Enlace de aprobación de un solo uso, atado a la persona y a lo que se aprueba, que vence |

## Cómo está hoy (18-10-2026)

- El conector (`app.zero.com.do/api/mcp`) tiene 11 herramientas, todas de lectura. Entra con una llave `emdo_` que el dueño crea a mano y que la pantalla solo deja de lectura.
- Todo lo que crea o cambia algo (registro, alta, perfil, certificado, clientes, facturas, colegio, nómina) funciona solo con la sesión del navegador. Ninguna ruta acepta la llave.
- El registro y el alta son formularios (server actions), no API.
- No hay inicio de sesión estándar para conectores (OAuth). **ChatGPT no acepta llaves fijas**: sin OAuth, Zero no puede estar en ChatGPT.
- No hay claves de idempotencia en ninguna ruta propia (repetir una orden puede duplicar), ni bitácora de lo que hace la llave.

## Antes de abrir el alta a agentes: seguridad

La revisión del registro encontró fallas que un agente que crea cuentas en cantidad volvería graves. Van primero (tarea aparte):

1. Entrar con Google se une a una cuenta que otra persona registró con ese correo sin verificarlo, y esa persona conserva su contraseña.
2. Una segunda empresa que escriba el RNC de otra queda conectada, en el servicio de facturación electrónica, a lo que ya existe con ese RNC.
3. Cualquier miembro puede subir o quitar el certificado.
4. El regreso de Stripe inicia sesión a quien tenga el enlace.
5. La verificación del correo se consume al abrir el enlace (los antivirus del correo la «abren» solos).

## El orden

### Fase A — `mcp.zero.com.do` (documentación + conector)

- En la raíz, la documentación; en `/mcp`, el conector (como Sentry).
- Generada desde la lista de herramientas del propio conector, para que nunca diga algo que el conector no hace.
- Contenido: qué es, cómo conectarlo en Claude, ChatGPT, Cursor y VS Code, cada herramienta por módulo (qué hace, qué pide, qué devuelve, si es de lectura o escritura y si pide aprobación), seguridad, ejemplos de órdenes, novedades. Versión `.md` de cada página, `llms.txt` propio y el `server.json` del registro de MCP.
- Requiere un registro en el DNS de zero.com.do (lo maneja midominio.do).

### Fase B — Base para escribir sin riesgo

- La llave se convierte en un «quién» completo: empresa, persona que la creó y permisos reales (lectura, escritura, administración).
- Una tabla de idempotencia: cada orden de escritura lleva su clave; repetirla devuelve lo mismo, no crea otro.
- Bitácora de cada llamada (quién, qué herramienta, resultado).
- Anotaciones en cada herramienta (solo lectura, destructiva, idempotente) y respuesta estructurada.
- Las reglas del muro (correo verificado, alta terminada, suscripción) aplicadas también a las llamadas por llave.

### Fase C — Inicio de sesión estándar (OAuth)

- Zero pasa a ser su propio servidor de autorización: metadatos en `/.well-known/…`, registro de clientes (CIMD y, de respaldo, DCR), PKCE.
- La pantalla de autorización es la de entrar a Zero, con «Entrar con Google», crear cuenta y aceptar términos. Una persona sin empresa todavía es un estado válido: de ahí sigue el alta.
- Permisos por pasos: empieza con lectura y alta; pide escritura cuando hace falta.
- Con esto Zero puede estar en ChatGPT, y en Claude se conecta sin pegar llaves.

### Fase D — Herramientas del alta

El alta como una máquina de estados, con una herramienta que siempre dice qué falta:

- `get_onboarding_status`: verificado, datos de la empresa, prueba, perfil fiscal, certificado, habilitación DGII, secuencias, ambiente. Con el siguiente paso y quién lo hace.
- `lookup_rnc`, `set_company` (del RNC salen la razón social y el resto), `set_company_size`, `start_trial`.
- `update_company_profile` (dirección, provincia, municipio, correo de facturación).
- `create_certificate_upload_link`: enlace para que la persona suba su .p12 (nunca por el chat).
- `get_dgii_habilitation_status`: en qué fase va y qué hacer en el portal; Zero corre solo las pruebas que se hacen dentro.
- `add_ncf_sequence`, con vista previa y aprobación.
- Colegio: periodo, cursos, conceptos y tarifas con vista previa; importar de SIGERD (las credenciales de SIGERD por enlace, nunca por chat).
- Nómina: empleados y calendario.

### Fase E — Trabajo diario por módulo

En tres niveles:

- **Lectura** (sin aprobación): reportes de ventas, 606/607/608/609, cuentas por cobrar, nómina, contabilidad.
- **Escritura que se puede deshacer**: clientes, productos, cotizaciones, borradores de factura, cargos escolares, matrículas con vista previa.
- **Lo que no se deshace** (con enlace de aprobación): emitir e-CF, registrar cobros, aprobar comprobantes de padres, aprobar nómina, anular, enviar correos a terceros.

### Fase F — Directorios

1. Directorio de conectores de Claude (el más fácil).
2. Copilot Studio y Gemini Enterprise.
3. ChatGPT: verificación de la organización, cuenta de demostración sin códigos por correo, archivo de verificación del dominio y ninguna herramienta de compra.
4. Registro oficial de MCP, con el espacio `do.com.zero` verificado por DNS.

## Lo que no hacemos

- El conector no cobra ni devuelve enlaces de pago de suscripción (lo prohíben Claude y ChatGPT).
- Contraseñas de la DGII, de SIGERD o del certificado nunca pasan por el chat ni por una herramienta.
- No se promete en la documentación una herramienta que no esté en el conector.
- Nada de protocolos de pago por agentes (ACP, AP2) por ahora.

## Fuentes

- Especificación MCP 2026-07-28 (autorización, elicitación, anotaciones): modelcontextprotocol.io/specification/2026-07-28
- Claude, envío al directorio y autenticación: claude.com/docs/connectors/building/submission, …/authentication, …/lazy-authentication
- ChatGPT, Apps SDK (autenticación y envío): developers.openai.com/apps-sdk/build/auth, …/deploy/submission, …/app-submission-guidelines
- Aprobación por enlace: docs.stripe.com/mcp; compras confirmadas por la persona: vercel.com/changelog/vercel-mcp-now-supports-purchases
- Documentación en subdominio: mcp.sentry.dev
