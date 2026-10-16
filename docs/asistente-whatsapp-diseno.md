# Asistente por WhatsApp — diseño (sin implementar)

Estado: **diseño**. No hay código. Se retoma cuando haya credenciales del
proveedor y un número de prueba verificado.

## Objetivo

Que el dueño o administrador le escriba al asistente desde WhatsApp y reciba
la misma respuesta que en el chat de Zero: consultas de solo lectura y guía.
Sin acciones que cambien datos (decisión del negocio: el asistente es de
solo lectura).

## Lo que ya existe y se reutiliza

| Pieza | Dónde | Para qué |
|---|---|---|
| Conexión de WhatsApp por empresa | `lib/whatsapp/client.ts`, `app/api/whatsapp/conectar`, `estado` | Una empresa ya enlaza su número con crm-escolar |
| Webhook firmado | `app/api/whatsapp/webhook/[teamId]`, `lib/whatsapp/signature.ts` | Recibir mensajes con `x-crm-signature: sha256=…` |
| Envío de texto | `enviarMensaje(apiKey, to, text)` | Responder |
| Contestador local + políticas | `lib/asistente/local.ts`, `politicas.ts` | Responder sin IA y con las mismas reglas |
| Gate de acceso | `lib/asistente/acceso.ts` | Solo quien administra y ve reportes |

## Decisiones que hay que tomar antes de construir

1. **Identidad del remitente.** El teléfono por sí solo no prueba quién es.
   Propuesta: vincular un número a un usuario con un código de un solo uso
   que se genera dentro de Zero (sesión iniciada) y se escribe por WhatsApp.
   Un número sin vincular no recibe datos, solo la instrucción de vincularse.
2. **Qué usuarios.** Los mismos que hoy pueden usar el asistente
   (`configuracion:gestionar` + `reportes:ver`). El permiso se revalida en
   cada mensaje, no al vincular.
3. **Qué canal de envío.** El proveedor actual cobra por conversación y fuera
   de la ventana de 24 h solo permite plantillas aprobadas. Para el asistente
   basta responder dentro de la ventana (la persona escribe primero).

## Flujo

1. Llega un mensaje al webhook de la empresa. Se verifica la firma HMAC; si
   no coincide, 401 sin más.
2. Se busca el número en la tabla de vínculos (`asistente_whatsapp_vinculos`):
   - sin vínculo → responder cómo vincularlo; **no** consultar nada;
   - con vínculo → cargar el usuario y su rol en esa empresa.
3. Rate limit por número (más estricto que el web: 20/hora).
4. Mismo pipeline que el chat: políticas → contestador local → IA.
5. La respuesta se adapta a WhatsApp (ver abajo) y se envía.
6. Se guarda en la misma tabla de conversaciones, con `canal = 'whatsapp'`.

## Adaptaciones de formato

| En el chat | En WhatsApp |
|---|---|
| Tablas markdown | Lista de hasta 8 líneas («Cliente — RD$ 1,000.00») |
| Gráfico de barras | Se omite; la tabla ya trae los números |
| Enlaces `/dashboard/…` | URL completa de la app (`baseDeEnlaces()`) |
| Respuesta grande | «Te lo mando en PDF» + documento adjunto |
| Negritas `**x**` | `*x*` |

## Seguridad

- **Firma del webhook obligatoria**, comparación en tiempo constante (ya existe).
- **Sin datos a un número sin vincular.** Ni siquiera «existe una cuenta».
- **Datos sensibles**: WhatsApp no es un canal confiable (otros dispositivos,
  capturas). Solo cifras agregadas y listas cortas; nada de RNC completos,
  teléfonos ni correos de clientes (`anonimizar()` de `lib/asistente/casos.ts`
  como punto de partida).
- **Cambio de número / robo**: poder desvincular desde Zero, y desvincular
  automáticamente si el usuario pierde el permiso.
- **Inyección**: el texto entrante es entrada de usuario como cualquier otra;
  pasa por `clasificarSolicitud` y `neutralizarDatos`.
- **Auditoría**: cada consulta queda en `asistente_mensajes` con el canal.

## Modelo de datos (propuesta, migración futura)

```sql
CREATE TABLE asistente_whatsapp_vinculos (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  telefono    VARCHAR(20) NOT NULL,       -- E.164
  verificado  BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, telefono)
);
ALTER TABLE asistente_conversaciones ADD COLUMN canal VARCHAR(12) NOT NULL DEFAULT 'web';
```

## Pruebas necesarias antes de activarlo

- Firma inválida o ausente → 401, sin tocar la base.
- Número sin vincular → nunca recibe datos.
- Usuario que pierde el permiso → deja de recibir respuestas.
- Mismo mensaje dos veces (reintento del proveedor) → una sola respuesta.
- Formato: ninguna respuesta con tabla markdown ni enlace relativo.
- Límite de longitud de WhatsApp (4096 caracteres) → se parte o va como PDF.

## Qué falta para empezar

- Credenciales y número de prueba del proveedor.
- Confirmar si el webhook actual (`[teamId]`) entrega mensajes entrantes de
  texto o solo estados; hoy está pensado para el CRM escolar.
- Decisión del negocio sobre el costo por conversación.
