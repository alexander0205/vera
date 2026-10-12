# Zero Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Adaptación a este repo:** este proyecto (Next.js App Router + Drizzle + Postgres/Neon) no tiene suite de tests automatizados (`pytest`, `vitest`, etc. no configurados). En vez de "run test, expect X", cada paso de verificación usa `curl` contra rutas ya corriendo en `pnpm dev` (el patrón que se usó en toda la sesión previa) más una lista de checks manuales en el navegador al final. No inventar un test runner nuevo — seguir la convención real del repo.

**Goal:** Reemplazar el inbox de soporte actual (`/admin/inbox`, tablas `support_conversations`/`support_messages`) por un sistema de tickets propio en `/zero-tickets`: cola con tiempo de espera según agentes disponibles, adjuntos (foto/archivo/video) con soporte de "pedir captura de pantalla", indicador de "escribiendo" y check de leído para ambos lados, todo fuera del panel de admin.

**Architecture:** Postgres/Drizzle (tablas nuevas: `tickets`, `ticket_messages`, `ticket_attachments`, `agent_presence`), polling rápido (1.5–2s) para tiempo real aproximado — sin WebSockets. Adjuntos van a S3 reusando el bucket ya configurado (`@aws-sdk/client-s3`, patrón de `lib/storage/comprobantes.ts`), con el mismo fallback a base64 en Postgres si no hay credenciales S3 en el entorno. El widget del cliente vive embebido en el dashboard (como hoy); la vista de agentes se muda a `/zero-tickets`, ruta standalone con su propio layout, gate `platformRole === 'admin'` (no anidada bajo `/admin`).

**Tech Stack:** Next.js App Router (route handlers), Drizzle ORM, Postgres (Neon), `@aws-sdk/client-s3`, React (client components, `fetch` + `setInterval` polling).

---

## Decisiones ya tomadas (no reabrir sin volver a preguntar)

1. **Tiempo real:** polling rápido, no WebSockets/Pusher.
2. **Agentes:** son los mismos `platformRole = 'admin'` — se agrega una tabla de presencia (`agent_presence`), no un rol nuevo.
3. **Storage de adjuntos:** el S3 que ya existe, prefix `tickets/` en vez de `preview/`. **Sin presigned URLs** — este repo tiene una decisión de seguridad explícita y documentada en `lib/storage/comprobantes.ts` (líneas 6–13): presigned URLs son un bearer token en query string, nunca se usan ni para subir ni para bajar. Todo pasa por rutas propias que validan sesión antes de tocar S3. `ticket-attachments` sigue el mismo patrón.
4. **Mongo:** fuera de alcance de este plan — es un ítem futuro. El modelo de datos acá es deliberadamente plano (sin relaciones Drizzle complejas más allá de FKs simples) para que portarlo después sea más fácil, pero no se abstrae detrás de una capa "database-agnostic" ahora — YAGNI.
5. **Se elimina** todo lo de `/admin/inbox`, `/api/admin/inbox/*`, `components/support/test-chat-widget.tsx`, y las tablas `support_conversations`/`support_messages` — no hay datos reales de producción ahí todavía (solo pruebas de esta sesión), así que la migración las **DROPea** en vez de migrar datos. Confirmar con el usuario antes de correr la migración si en el momento de ejecutar esto ya hay conversaciones reales que alguien necesita conservar.

## Modelo de datos

```
tickets
  id                    serial PK
  team_id               int NOT NULL FK teams.id
  user_id               int NOT NULL FK users.id          -- quien abrió el ticket
  assigned_agent_id     int FK users.id (nullable)         -- agente que lo tomó
  status                varchar(20) NOT NULL DEFAULT 'esperando'  -- esperando | abierto | cerrado
  last_message_at       timestamp NOT NULL DEFAULT now()
  last_read_by_user_at  timestamp (nullable)
  last_read_by_agent_at timestamp (nullable)
  user_typing_until     timestamp (nullable)
  agent_typing_until    timestamp (nullable)
  created_at            timestamp NOT NULL DEFAULT now()
  updated_at            timestamp NOT NULL DEFAULT now()
  closed_at             timestamp (nullable)

ticket_messages
  id            serial PK
  ticket_id     int NOT NULL FK tickets.id ON DELETE CASCADE
  sender_type   varchar(10) NOT NULL   -- user | agent | system
  sender_id     int FK users.id (nullable)
  message_type  varchar(20) NOT NULL DEFAULT 'text'  -- text | screenshot_request
  content       text (nullable — puede ser null si el mensaje es solo un adjunto)
  created_at    timestamp NOT NULL DEFAULT now()

ticket_attachments
  id              serial PK
  message_id      int NOT NULL FK ticket_messages.id ON DELETE CASCADE
  file_name       varchar(255) NOT NULL
  mime_type       varchar(100) NOT NULL
  file_size_bytes integer NOT NULL
  kind            varchar(10) NOT NULL   -- image | video | file
  storage         varchar(10) NOT NULL   -- s3 | db
  s3_key          varchar(500) (nullable)
  data_base64     text (nullable)        -- fallback si s3Disponible() es false
  created_at      timestamp NOT NULL DEFAULT now()

agent_presence
  user_id       int PRIMARY KEY FK users.id
  is_available  boolean NOT NULL DEFAULT false
  last_seen_at  timestamp NOT NULL DEFAULT now()
  updated_at    timestamp NOT NULL DEFAULT now()
```

**Heurística de tiempo de espera (v1, documentar como tal en el código):** `agentes_disponibles` = filas de `agent_presence` con `is_available = true` AND `last_seen_at` dentro de los últimos 2 minutos (evita que un agente que cerró la pestaña sin togglear "no disponible" siga contando). `tickets_en_cola` = count de `tickets.status = 'esperando'`. Si `agentes_disponibles = 0` → "esperando a que un agente esté disponible". Si no, `espera_estimada_min = ceil(tickets_en_cola / agentes_disponibles) * 5` (5 min = tiempo promedio fijo por ticket, hardcodeado — no hay datos históricos todavía para calcularlo real).

## File Structure

**Crear:**
- `lib/db/migrations/0089_zero_tickets.sql` — DROP de tablas viejas + CREATE de las 4 nuevas
- `scripts/apply-migration-0089.ts` — script para correrla (mismo patrón que 0087/0088)
- `lib/storage/tickets.ts` — S3 (o fallback DB) para adjuntos, mismo patrón que `lib/storage/comprobantes.ts`
- `app/api/zero-tickets/tickets/route.ts` — GET (mi ticket actual + cola) / POST (mandar mensaje, crea ticket si hace falta)
- `app/api/zero-tickets/tickets/typing/route.ts` — POST, marca "usuario escribiendo"
- `app/api/zero-tickets/tickets/attachments/route.ts` — POST multipart, sube adjunto a mi ticket actual
- `app/api/zero-tickets/attachments/[id]/route.ts` — GET, sirve el binario (valida que quien pide sea dueño del ticket o un agente)
- `app/api/zero-tickets/agent/tickets/route.ts` — GET, lista todo para el agente
- `app/api/zero-tickets/agent/tickets/[id]/messages/route.ts` — GET, thread completo (marca leído)
- `app/api/zero-tickets/agent/tickets/[id]/reply/route.ts` — POST, respuesta del agente
- `app/api/zero-tickets/agent/tickets/[id]/claim/route.ts` — POST, asignarme el ticket
- `app/api/zero-tickets/agent/tickets/[id]/status/route.ts` — POST, cerrar/reabrir
- `app/api/zero-tickets/agent/tickets/[id]/typing/route.ts` — POST, marca "agente escribiendo"
- `app/api/zero-tickets/agent/tickets/[id]/request-screenshot/route.ts` — POST, pide captura
- `app/api/zero-tickets/agent/presence/route.ts` — GET (mi estado + cuántos online) / POST (togglear disponible)
- `app/zero-tickets/layout.tsx` — gate admin + header propio, NO anidado bajo `/admin`
- `app/zero-tickets/page.tsx` — vista de agente completa
- `components/support/ticket-widget.tsx` — widget flotante del cliente (reemplaza `test-chat-widget.tsx`)

**Modificar:**
- `lib/db/schema.ts` — quitar `supportConversations`/`supportMessages`, agregar las 4 tablas nuevas
- `app/(dashboard)/layout.tsx` — importar `TicketWidget` en vez de `TestChatWidget`

**Eliminar:**
- `app/admin/inbox/` (carpeta completa)
- `app/api/admin/inbox/` (carpeta completa)
- `components/support/test-chat-widget.tsx`
- El link "Inbox" en `app/admin/layout.tsx`

---

### Task 1: Esquema y migración

**Files:**
- Create: `lib/db/migrations/0089_zero_tickets.sql`
- Create: `scripts/apply-migration-0089.ts`
- Modify: `lib/db/schema.ts:970-989` (bloque actual de `supportConversations`/`supportMessages`)

- [ ] **Step 1: Escribir la migración**

`lib/db/migrations/0089_zero_tickets.sql`:

```sql
-- Zero Tickets — reemplaza el inbox de soporte anterior (support_conversations/
-- support_messages). Sin datos reales de producción todavía: se dropean en vez
-- de migrarse. Si en el momento de correr esto ya hay tickets reales, PARAR y
-- migrar los datos a mano en vez de dropear.
DROP TABLE IF EXISTS support_messages;
DROP TABLE IF EXISTS support_conversations;

CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_agent_id INTEGER REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'esperando', -- esperando | abierto | cerrado
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_read_by_user_at TIMESTAMP,
  last_read_by_agent_at TIMESTAMP,
  user_typing_until TIMESTAMP,
  agent_typing_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL, -- user | agent | system
  sender_id INTEGER REFERENCES users(id),
  message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text | screenshot_request
  content TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_attachments (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  kind VARCHAR(10) NOT NULL, -- image | video | file
  storage VARCHAR(10) NOT NULL, -- s3 | db
  s3_key VARCHAR(500),
  data_base64 TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX tickets_team_id_idx ON tickets(team_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX ticket_messages_ticket_id_idx ON ticket_messages(ticket_id);
CREATE INDEX ticket_attachments_message_id_idx ON ticket_attachments(message_id);
```

- [ ] **Step 2: Script para aplicarla**

`scripts/apply-migration-0089.ts`:

```typescript
import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0089_zero_tickets.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0089 ejecutada.');

  for (const table of ['tickets', 'ticket_messages', 'ticket_attachments', 'agent_presence']) {
    const cols = await sql`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_name = ${table}
       ORDER BY column_name`;
    console.log(`\n${table}:`);
    console.table(cols);
  }

  await sql.end();
})();
```

- [ ] **Step 3: Actualizar `lib/db/schema.ts`**

Reemplazar el bloque de `supportConversations`/`supportMessages` (y sus relations, si las hubiera) por:

```typescript
// ─── Zero Tickets ───────────────────────────────────────────────────────────

export const tickets = pgTable('tickets', {
  id:                 serial('id').primaryKey(),
  teamId:             integer('team_id').notNull().references(() => teams.id),
  userId:             integer('user_id').notNull().references(() => users.id),
  assignedAgentId:    integer('assigned_agent_id').references(() => users.id),
  status:             varchar('status', { length: 20 }).notNull().default('esperando'), // esperando | abierto | cerrado
  lastMessageAt:      timestamp('last_message_at').notNull().defaultNow(),
  lastReadByUserAt:   timestamp('last_read_by_user_at'),
  lastReadByAgentAt:  timestamp('last_read_by_agent_at'),
  userTypingUntil:    timestamp('user_typing_until'),
  agentTypingUntil:   timestamp('agent_typing_until'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
  closedAt:           timestamp('closed_at'),
});

export const ticketMessages = pgTable('ticket_messages', {
  id:          serial('id').primaryKey(),
  ticketId:    integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  senderType:  varchar('sender_type', { length: 10 }).notNull(), // user | agent | system
  senderId:    integer('sender_id').references(() => users.id),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'), // text | screenshot_request
  content:     text('content'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export const ticketAttachments = pgTable('ticket_attachments', {
  id:            serial('id').primaryKey(),
  messageId:     integer('message_id').notNull().references(() => ticketMessages.id, { onDelete: 'cascade' }),
  fileName:      varchar('file_name', { length: 255 }).notNull(),
  mimeType:      varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  kind:          varchar('kind', { length: 10 }).notNull(), // image | video | file
  storage:       varchar('storage', { length: 10 }).notNull(), // s3 | db
  s3Key:         varchar('s3_key', { length: 500 }),
  dataBase64:    text('data_base64'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export const agentPresence = pgTable('agent_presence', {
  userId:      integer('user_id').primaryKey().references(() => users.id),
  isAvailable: boolean('is_available').notNull().default(false),
  lastSeenAt:  timestamp('last_seen_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  team: one(teams, { fields: [tickets.teamId], references: [teams.id] }),
  user: one(users, { fields: [tickets.userId], references: [users.id] }),
  assignedAgent: one(users, { fields: [tickets.assignedAgentId], references: [users.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one, many }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  sender: one(users, { fields: [ticketMessages.senderId], references: [users.id] }),
  attachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  message: one(ticketMessages, { fields: [ticketAttachments.messageId], references: [ticketMessages.id] }),
}));
```

`boolean` ya está importado en el bloque de imports de `drizzle-orm/pg-core` al inicio del archivo (se usa en otras tablas) — no hace falta agregar el import.

- [ ] **Step 4: Verificar que compila (sin correr la migración todavía)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard` con `pnpm dev` corriendo.
Expected: `307` (redirect a login, sin sesión) — **no** `500`. Si da 500, hay un error de sintaxis en el schema — revisar antes de seguir.

- [ ] **Step 5: Correr la migración (el usuario, no el agente — puerto 5432 puede estar bloqueado en sandboxes)**

```bash
npx tsx scripts/apply-migration-0089.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/0089_zero_tickets.sql scripts/apply-migration-0089.ts lib/db/schema.ts
git commit -m "feat(tickets): esquema de Zero Tickets, reemplaza support_conversations"
```

---

### Task 2: Storage de adjuntos

**Files:**
- Create: `lib/storage/tickets.ts`

- [ ] **Step 1: Escribir el helper, mismo patrón que `lib/storage/comprobantes.ts`**

`lib/storage/tickets.ts`:

```typescript
/**
 * Almacenamiento de adjuntos de tickets — mismo patrón de seguridad que
 * lib/storage/comprobantes.ts: sin presigned URLs, todo pasa por rutas propias
 * que validan sesión antes de tocar S3. Ver ese archivo para el razonamiento
 * completo. Sin credenciales (dev local), s3Disponible() da false y el
 * llamador debe guardar el archivo en base64 en la tabla ticket_attachments
 * (storage='db') en vez de subirlo.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const BUCKET = process.env.S3_COMPROBANTES_BUCKET; // mismo bucket, prefix distinto
const REGION = process.env.S3_COMPROBANTES_REGION ?? 'us-east-1';
const PREFIX = process.env.S3_TICKETS_PREFIX ?? 'tickets';
const KEY_ID = process.env.S3_COMPROBANTES_KEY_ID;
const SECRET = process.env.S3_COMPROBANTES_SECRET;

export function s3Disponible(): boolean {
  return Boolean(BUCKET && KEY_ID && SECRET);
}

let cliente: S3Client | null = null;
function getCliente(): S3Client {
  if (!cliente) {
    if (!s3Disponible()) throw new Error('S3 de tickets no configurado');
    cliente = new S3Client({
      region: REGION,
      credentials: { accessKeyId: KEY_ID!, secretAccessKey: SECRET! },
    });
  }
  return cliente;
}

/** `tickets/team_12/<uuid>.jpg` — el UUID hace la llave no adivinable. */
export function construirKeyTicket(teamId: number, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `${PREFIX}/team_${teamId}/${randomUUID()}.${ext}`;
}

export async function subirAdjuntoTicket(key: string, cuerpo: Buffer, mime: string): Promise<void> {
  await getCliente().send(new PutObjectCommand({
    Bucket: BUCKET!,
    Key: key,
    Body: cuerpo,
    ContentType: mime,
  }));
}

export async function leerAdjuntoTicket(key: string): Promise<Buffer> {
  const res = await getCliente().send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
  if (!res.Body) throw new Error('Objeto vacío en S3');
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function borrarAdjuntoTicket(key: string): Promise<void> {
  await getCliente().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
}
```

- [ ] **Step 2: Verificar que no rompe el build (import-only, no route lo usa todavía)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard`
Expected: `307`, no `500`.

- [ ] **Step 3: Commit**

```bash
git add lib/storage/tickets.ts
git commit -m "feat(tickets): storage de adjuntos, reusa bucket de comprobantes"
```

---

### Task 3: API del cliente — crear/enviar, cola, typing

**Files:**
- Create: `app/api/zero-tickets/tickets/route.ts`
- Create: `app/api/zero-tickets/tickets/typing/route.ts`

- [ ] **Step 1: `GET`/`POST` de tickets del cliente**

`app/api/zero-tickets/tickets/route.ts`:

```typescript
/**
 * API del cliente para Zero Tickets.
 * GET  → mi ticket más reciente (para restaurar historial) + info de cola.
 * POST → mandar un mensaje. Si no tengo ticket abierto/esperando, crea uno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc, desc, sql, gte } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, ticketAttachments, agentPresence, teams } from '@/lib/db/schema';
import { enviarAlertaSlackBlocks } from '@/lib/slack';

const AGENTE_STALE_MIN = 2;
const MIN_POR_TICKET = 5;

async function calcularEspera() {
  const staleSince = new Date(Date.now() - AGENTE_STALE_MIN * 60_000);
  const [{ count: disponibles }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentPresence)
    .where(and(eq(agentPresence.isAvailable, true), gte(agentPresence.lastSeenAt, staleSince)));

  const [{ count: enCola }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(eq(tickets.status, 'esperando'));

  if (disponibles === 0) return { agentesDisponibles: 0, enCola, esperaMinutos: null };
  return { agentesDisponibles: disponibles, enCola, esperaMinutos: Math.ceil(enCola / disponibles) * MIN_POR_TICKET };
}

async function notificarNuevoTicketSlack(teamId: number, remitente: string, contenido: string) {
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
  const preview = contenido.length > 300 ? `${contenido.slice(0, 300)}…` : contenido;
  const baseUrl = process.env.BASE_URL ?? '';
  const teamName = team?.name ?? `team ${teamId}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🎫 Nuevo ticket', emoji: true } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Colegio:*\n${teamName}` },
      { type: 'mrkdwn', text: `*De:*\n${remitente}` },
    ]},
    { type: 'section', text: { type: 'mrkdwn', text: `>${preview}` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Abrir Zero Tickets', emoji: true }, url: `${baseUrl}/zero-tickets`, style: 'primary' },
    ]},
  ];

  await enviarAlertaSlackBlocks(
    blocks,
    `Nuevo ticket de ${teamName} (${remitente}): ${preview}`,
    process.env.SUPPORT_SLACK_WEBHOOK_URL,
  );
}

async function getOrCreateTicket(teamId: number, userId: number) {
  const [existing] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, userId)))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (existing && existing.status !== 'cerrado') return { ticket: existing, isNew: false };

  if (existing && existing.status === 'cerrado') {
    const [reopened] = await db
      .update(tickets)
      .set({ status: 'esperando', assignedAgentId: null, closedAt: null })
      .where(eq(tickets.id, existing.id))
      .returning();
    return { ticket: reopened, isNew: true };
  }

  const [created] = await db.insert(tickets).values({ teamId, userId }).returning();
  return { ticket: created, isNew: true };
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const { content } = (await req.json()) as { content: string };
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  }

  try {
    const { ticket, isNew } = await getOrCreateTicket(teamId, user.id);

    await db.insert(ticketMessages).values({
      ticketId: ticket.id,
      senderType: 'user',
      senderId: user.id,
      content: content.trim(),
    });

    if (isNew) {
      const espera = await calcularEspera();
      const textoEspera = espera.agentesDisponibles === 0
        ? 'Todos nuestros agentes están ocupados en este momento. Te vamos a responder apenas se libere uno.'
        : `Tiempo de espera estimado: ${espera.esperaMinutos} min.`;
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        senderType: 'system',
        messageType: 'text',
        content: `Tu ticket fue creado. ${textoEspera}`,
      });
    }

    await db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

    notificarNuevoTicketSlack(teamId, user.name ?? user.email, content.trim()).catch((err) =>
      console.error('[zero-tickets] error notificando Slack', err),
    );

    return NextResponse.json({ ticketId: ticket.id });
  } catch (err) {
    console.error('[zero-tickets/tickets POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id)))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (!ticket) {
    const espera = await calcularEspera();
    return NextResponse.json({ ticket: null, messages: [], espera });
  }

  const messages = await db
    .select({
      message: ticketMessages,
      attachment: ticketAttachments,
    })
    .from(ticketMessages)
    .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
    .where(eq(ticketMessages.ticketId, ticket.id))
    .orderBy(asc(ticketMessages.createdAt));

  await db.update(tickets).set({ lastReadByUserAt: new Date() }).where(eq(tickets.id, ticket.id));

  const espera = ticket.status === 'esperando' ? await calcularEspera() : null;

  return NextResponse.json({
    ticket: { ...ticket, agentTyping: ticket.agentTypingUntil ? ticket.agentTypingUntil > new Date() : false },
    messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })),
    espera,
  });
}
```

**Ojo con el `leftJoin`:** un mensaje puede tener como máximo un adjunto en v1 (Task 6 crea un `ticket_message` por archivo subido, no uno con varios adjuntos) — el join no duplica filas. Si más adelante se permite adjuntar varios archivos al mismo mensaje, este `SELECT` hay que cambiarlo a agrupar attachments en un array.

- [ ] **Step 2: Endpoint de "usuario escribiendo"**

`app/api/zero-tickets/tickets/typing/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { eq, and, desc, ne } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';

const TYPING_TTL_MS = 4000;

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id), ne(tickets.status, 'cerrado')))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);

  if (!ticket) return NextResponse.json({ ok: true });

  await db
    .update(tickets)
    .set({ userTypingUntil: new Date(Date.now() + TYPING_TTL_MS) })
    .where(eq(tickets.id, ticket.id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verificar (sin sesión, deben dar 401, no 500)**

```bash
curl -s -o /dev/null -w "POST tickets: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/tickets -H "Content-Type: application/json" -d '{"content":"hola"}'
curl -s -o /dev/null -w "GET tickets: %{http_code}\n" http://localhost:3000/api/zero-tickets/tickets
curl -s -o /dev/null -w "POST typing: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/tickets/typing
```
Expected: los tres `401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/zero-tickets/tickets
git commit -m "feat(tickets): API del cliente — crear/enviar, cola, typing"
```

---

### Task 4: API del cliente — adjuntos

**Files:**
- Create: `app/api/zero-tickets/tickets/attachments/route.ts`
- Create: `app/api/zero-tickets/attachments/[id]/route.ts`

- [ ] **Step 1: Subida de adjuntos**

Límites v1: 15MB por archivo, tipos permitidos `image/*`, `video/*`, `application/pdf`. Ajustar si hace falta más adelante.

`app/api/zero-tickets/tickets/attachments/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, ne } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages, ticketAttachments } from '@/lib/db/schema';
import { s3Disponible, construirKeyTicket, subirAdjuntoTicket } from '@/lib/storage/tickets';

const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_PERMITIDOS = /^(image\/|video\/|application\/pdf$)/;

function kindDeMime(mime: string): 'image' | 'video' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Archivo muy grande (máx 15MB)' }, { status: 400 });
  if (!TIPOS_PERMITIDOS.test(file.type)) return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), eq(tickets.userId, user.id), ne(tickets.status, 'cerrado')))
    .orderBy(desc(tickets.lastMessageAt))
    .limit(1);
  if (!ticket) return NextResponse.json({ error: 'No hay ticket activo' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() ?? 'bin';

  const [msg] = await db
    .insert(ticketMessages)
    .values({ ticketId: ticket.id, senderType: 'user', senderId: user.id, content: null })
    .returning();

  if (s3Disponible()) {
    const key = construirKeyTicket(teamId, ext);
    await subirAdjuntoTicket(key, buffer, file.type);
    await db.insert(ticketAttachments).values({
      messageId: msg.id,
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      kind: kindDeMime(file.type),
      storage: 's3',
      s3Key: key,
    });
  } else {
    await db.insert(ticketAttachments).values({
      messageId: msg.id,
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      kind: kindDeMime(file.type),
      storage: 'db',
      dataBase64: buffer.toString('base64'),
    });
  }

  await db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

  return NextResponse.json({ ok: true, messageId: msg.id });
}
```

- [ ] **Step 2: Servir el adjunto (valida dueño del ticket O agente)**

`app/api/zero-tickets/attachments/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ticketAttachments, ticketMessages, tickets } from '@/lib/db/schema';
import { leerAdjuntoTicket } from '@/lib/storage/tickets';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const attachmentId = parseInt(id, 10);
  if (Number.isNaN(attachmentId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select({ attachment: ticketAttachments, ticket: tickets })
    .from(ticketAttachments)
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .where(eq(ticketAttachments.id, attachmentId))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const esDueño = row.ticket.userId === user.id;
  const esAgente = user.platformRole === 'admin';
  if (!esDueño && !esAgente) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { attachment } = row;
  const buffer = attachment.storage === 's3'
    ? await leerAdjuntoTicket(attachment.s3Key!)
    : Buffer.from(attachment.dataBase64!, 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.fileName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
```

- [ ] **Step 3: Verificar**

```bash
curl -s -o /dev/null -w "POST attachments: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/tickets/attachments
curl -s -o /dev/null -w "GET attachment: %{http_code}\n" http://localhost:3000/api/zero-tickets/attachments/1
```
Expected: ambos `401` (sin sesión).

- [ ] **Step 4: Commit**

```bash
git add app/api/zero-tickets/tickets/attachments app/api/zero-tickets/attachments
git commit -m "feat(tickets): subida y descarga de adjuntos"
```

---

### Task 5: API del agente

**Files:**
- Create: `app/api/zero-tickets/agent/tickets/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/messages/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/reply/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/claim/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/status/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/typing/route.ts`
- Create: `app/api/zero-tickets/agent/tickets/[id]/request-screenshot/route.ts`
- Create: `app/api/zero-tickets/agent/presence/route.ts`

Todas estas rutas comparten el mismo guard: `platformRole === 'admin'` (igual que `/api/admin/*` ya en el repo). No se reusa `requirePermission` de `lib/auth/api-guard.ts` porque ese sistema es de permisos por team, y "ser agente" acá es plataforma-wide, igual que `/admin/logs`.

- [ ] **Step 1: Listado para el agente**

`app/api/zero-tickets/agent/tickets/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, teams, users } from '@/lib/db/schema';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const agentUsers = db.select({ id: users.id, name: users.name, email: users.email }).from(users).as('agent_users');

  const rows = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      lastMessageAt: tickets.lastMessageAt,
      unread: sql<boolean>`${tickets.lastReadByAgentAt} IS NULL OR ${tickets.lastMessageAt} > ${tickets.lastReadByAgentAt}`,
      userTyping: sql<boolean>`${tickets.userTypingUntil} IS NOT NULL AND ${tickets.userTypingUntil} > NOW()`,
      teamId: teams.id,
      teamName: teams.name,
      userName: users.name,
      userEmail: users.email,
      assignedAgentId: tickets.assignedAgentId,
      assignedAgentName: agentUsers.name,
      lastMessage: sql<string>`(
        SELECT content FROM ticket_messages
        WHERE ticket_messages.ticket_id = tickets.id
        ORDER BY created_at DESC LIMIT 1
      )`,
    })
    .from(tickets)
    .innerJoin(teams, eq(teams.id, tickets.teamId))
    .innerJoin(users, eq(users.id, tickets.userId))
    .leftJoin(agentUsers, eq(agentUsers.id, tickets.assignedAgentId))
    .orderBy(desc(tickets.lastMessageAt));

  return NextResponse.json({ tickets: rows });
}
```

**Nota sobre la subquery `lastMessage`:** referencia `tickets.id` (nombre de tabla literal, no `${tickets.id}` interpolado) — mismo motivo documentado en `app/api/admin/inbox/conversations/route.ts` antes de borrarse y en `app/api/facturas/route.ts`: interpolar la columna de Drizzle dentro de una subquery correlacionada la convierte en un parámetro fijo (el de la primera fila), no en una referencia por fila, y todas las filas devolverían el mismo `lastMessage`.

- [ ] **Step 2: Thread completo (marca leído)**

`app/api/zero-tickets/agent/tickets/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ticketMessages, ticketAttachments, tickets } from '@/lib/db/schema';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const messages = await db
    .select({ message: ticketMessages, attachment: ticketAttachments })
    .from(ticketMessages)
    .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));

  await db.update(tickets).set({ lastReadByAgentAt: new Date() }).where(eq(tickets.id, ticketId));

  return NextResponse.json({ messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })) });
}
```

- [ ] **Step 3: Responder**

`app/api/zero-tickets/agent/tickets/[id]/reply/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { content } = (await req.json()) as { content: string };
  if (!content || !content.trim()) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });

  const [msg] = await db
    .insert(ticketMessages)
    .values({ ticketId, senderType: 'agent', senderId: user.id, content: content.trim() })
    .returning();

  const now = new Date();
  await db
    .update(tickets)
    .set({ lastMessageAt: now, updatedAt: now, lastReadByAgentAt: now })
    .where(eq(tickets.id, ticketId));

  return NextResponse.json({ message: msg });
}
```

- [ ] **Step 4: Tomar el ticket (claim)**

`app/api/zero-tickets/agent/tickets/[id]/claim/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [updated] = await db
    .update(tickets)
    .set({ assignedAgentId: user.id, status: 'abierto', updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: `${user.name ?? user.email} tomó este ticket.`,
  });

  return NextResponse.json({ ticket: updated });
}
```

- [ ] **Step 5: Cerrar/reabrir**

`app/api/zero-tickets/agent/tickets/[id]/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { status } = (await req.json()) as { status: string };
  if (status !== 'abierto' && status !== 'cerrado') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const [updated] = await db
    .update(tickets)
    .set({ status, closedAt: status === 'cerrado' ? new Date() : null, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await db.insert(ticketMessages).values({
    ticketId,
    senderType: 'system',
    content: status === 'cerrado' ? 'Ticket cerrado.' : 'Ticket reabierto.',
  });

  return NextResponse.json({ ticket: updated });
}
```

- [ ] **Step 6: Agente escribiendo**

`app/api/zero-tickets/agent/tickets/[id]/typing/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets } from '@/lib/db/schema';

const TYPING_TTL_MS = 4000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .update(tickets)
    .set({ agentTypingUntil: new Date(Date.now() + TYPING_TTL_MS) })
    .where(eq(tickets.id, ticketId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Pedir captura de pantalla**

`app/api/zero-tickets/agent/tickets/[id]/request-screenshot/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketMessages } from '@/lib/db/schema';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [msg] = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      senderType: 'agent',
      senderId: user.id,
      messageType: 'screenshot_request',
      content: 'Te pedimos que adjuntes una captura de pantalla para poder ayudarte mejor.',
    })
    .returning();

  const now = new Date();
  await db.update(tickets).set({ lastMessageAt: now, updatedAt: now }).where(eq(tickets.id, ticketId));

  return NextResponse.json({ message: msg });
}
```

- [ ] **Step 8: Presencia del agente**

`app/api/zero-tickets/agent/presence/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { agentPresence } from '@/lib/db/schema';

const AGENTE_STALE_MIN = 2;

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const [mine] = await db.select().from(agentPresence).where(eq(agentPresence.userId, user.id)).limit(1);

  const staleSince = new Date(Date.now() - AGENTE_STALE_MIN * 60_000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentPresence)
    .where(and(eq(agentPresence.isAvailable, true), gte(agentPresence.lastSeenAt, staleSince)));

  return NextResponse.json({ available: mine?.isAvailable ?? false, onlineAgents: count });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });

  const { available } = (await req.json()) as { available: boolean };

  await db
    .insert(agentPresence)
    .values({ userId: user.id, isAvailable: available, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: agentPresence.userId,
      set: { isAvailable: available, lastSeenAt: new Date(), updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: Verificar todo el bloque (sin sesión → 401, no 500)**

```bash
curl -s -o /dev/null -w "GET agent/tickets: %{http_code}\n" http://localhost:3000/api/zero-tickets/agent/tickets
curl -s -o /dev/null -w "GET messages: %{http_code}\n" http://localhost:3000/api/zero-tickets/agent/tickets/1/messages
curl -s -o /dev/null -w "POST reply: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/tickets/1/reply -H "Content-Type: application/json" -d '{"content":"hola"}'
curl -s -o /dev/null -w "POST claim: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/tickets/1/claim
curl -s -o /dev/null -w "POST status: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/tickets/1/status -H "Content-Type: application/json" -d '{"status":"cerrado"}'
curl -s -o /dev/null -w "POST typing: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/tickets/1/typing
curl -s -o /dev/null -w "POST screenshot: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/tickets/1/request-screenshot
curl -s -o /dev/null -w "GET presence: %{http_code}\n" http://localhost:3000/api/zero-tickets/agent/presence
curl -s -o /dev/null -w "POST presence: %{http_code}\n" -X POST http://localhost:3000/api/zero-tickets/agent/presence -H "Content-Type: application/json" -d '{"available":true}'
```
Expected: los nueve `401`.

- [ ] **Step 10: Commit**

```bash
git add app/api/zero-tickets/agent
git commit -m "feat(tickets): API del agente — cola, claim, reply, presencia, typing"
```

---

### Task 6: UI del cliente — `ticket-widget.tsx`

**Files:**
- Create: `components/support/ticket-widget.tsx`
- Delete: `components/support/test-chat-widget.tsx` (al final de este task, después de confirmar que el nuevo funciona)

- [ ] **Step 1: Escribir el widget**

Cubre: banner de cola/espera cuando `status === 'esperando'`, banner de cerrado, indicador de "agente escribiendo", checks de leído (✓ enviado / ✓✓ verde leído) en los mensajes propios, botón de adjuntar archivo (input file oculto), render especial para `messageType === 'screenshot_request'` con botón de adjuntar destacado, render de adjuntos (imagen inline, video con `<video controls>`, o link de descarga para otros tipos).

`components/support/ticket-widget.tsx`:

```tsx
'use client';

/**
 * Widget flotante de Zero Tickets. Polling cada 1.5s mientras está abierto
 * (elegido en vez de WebSockets para v1 — ver docs/superpowers/plans/
 * 2026-08-14-zero-tickets.md). Historial vive en la DB, se recupera al montar.
 */

import { useEffect, useRef, useState } from 'react';

interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
}

interface TicketMessage {
  id: number;
  senderType: 'user' | 'agent' | 'system';
  messageType: 'text' | 'screenshot_request';
  content: string | null;
  createdAt: string;
  attachment: Attachment | null;
}

interface Espera {
  agentesDisponibles: number;
  enCola: number;
  esperaMinutos: number | null;
}

export function TicketWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [readByAgentAt, setReadByAgentAt] = useState<string | null>(null);
  const ticketIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function poll() {
    const res = await fetch('/api/zero-tickets/tickets');
    if (!res.ok) return;
    const data = await res.json();
    if (data.ticket) {
      ticketIdRef.current = data.ticket.id;
      setMessages(data.messages);
      setStatus(data.ticket.status);
      setAgentTyping(Boolean(data.ticket.agentTyping));
      setReadByAgentAt(data.ticket.lastReadByAgentAt);
    }
    setEspera(data.espera);
  }

  useEffect(() => {
    poll();
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  function onInputChange(value: string) {
    setInput(value);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      fetch('/api/zero-tickets/tickets/typing', { method: 'POST' }).catch(() => {});
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/zero-tickets/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) await poll();
    } finally {
      setLoading(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/zero-tickets/tickets/attachments', { method: 'POST', body: form });
      if (res.ok) await poll();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%', background: '#7c3aed',
          color: 'white', border: 'none', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        💬
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        width: 340, height: 500, background: 'white', border: '1px solid #ddd',
        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ background: '#7c3aed', color: 'white', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Soporte</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
      </div>

      {status === 'esperando' && espera && (
        <div style={{ padding: '8px 10px', fontSize: 12, background: '#eef2ff', color: '#3730a3', textAlign: 'center' }}>
          {espera.agentesDisponibles === 0
            ? 'Todos nuestros agentes están ocupados. Te vamos a responder pronto.'
            : `Tiempo de espera estimado: ${espera.esperaMinutos} min (posición en cola: ${espera.enCola})`}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => {
          const key = m.id != null ? `msg-${m.id}` : `tmp-${i}`;
          if (m.senderType === 'system') {
            return (
              <div key={key} style={{ alignSelf: 'center', fontSize: 11, color: '#888', textAlign: 'center' }}>
                {m.content}
              </div>
            );
          }
          const mine = m.senderType === 'user';
          const leido = mine && readByAgentAt != null && new Date(m.createdAt) <= new Date(readByAgentAt);
          return (
            <div
              key={key}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                background: mine ? '#7c3aed' : '#0f766e',
                color: 'white',
                padding: '6px 10px', borderRadius: 12, maxWidth: '80%', fontSize: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.messageType === 'screenshot_request' && (
                <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>📸 Pidieron una captura</div>
              )}
              {m.content}
              {m.attachment && (
                <div style={{ marginTop: 6 }}>
                  {m.attachment.kind === 'image' && (
                    <img src={`/api/zero-tickets/attachments/${m.attachment.id}`} alt={m.attachment.fileName} style={{ maxWidth: '100%', borderRadius: 6 }} />
                  )}
                  {m.attachment.kind === 'video' && (
                    <video src={`/api/zero-tickets/attachments/${m.attachment.id}`} controls style={{ maxWidth: '100%', borderRadius: 6 }} />
                  )}
                  {m.attachment.kind === 'file' && (
                    <a href={`/api/zero-tickets/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer" style={{ color: 'white', textDecoration: 'underline', fontSize: 12 }}>
                      📎 {m.attachment.fileName}
                    </a>
                  )}
                </div>
              )}
              {mine && (
                <div style={{ fontSize: 10, textAlign: 'right', marginTop: 2, opacity: 0.8 }}>
                  {leido ? '✓✓' : '✓'}
                </div>
              )}
            </div>
          );
        })}
        {agentTyping && <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>El agente está escribiendo...</div>}
        {loading && <div style={{ fontSize: 12, color: '#888' }}>enviando...</div>}
      </div>

      {status === 'cerrado' && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: '#92400e', background: '#fef3c7', textAlign: 'center' }}>
          Este ticket fue cerrado. Escribe para reabrirlo.
        </div>
      )}

      <div style={{ display: 'flex', borderTop: '1px solid #eee', alignItems: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={onFileSelected} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Adjuntar archivo"
          style={{ border: 'none', background: 'none', fontSize: 18, padding: '0 8px', cursor: 'pointer' }}
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje..."
          style={{ flex: 1, border: 'none', padding: 10, fontSize: 14, outline: 'none' }}
        />
        <button onClick={send} style={{ border: 'none', background: '#7c3aed', color: 'white', padding: '0 16px', height: '100%', cursor: 'pointer' }}>
          Enviar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Actualizar el layout del dashboard**

Modificar `app/(dashboard)/layout.tsx`:

```tsx
import { TicketWidget } from '@/components/support/ticket-widget';

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TicketWidget />
    </>
  );
}
```

- [ ] **Step 3: Borrar el widget viejo**

```bash
rm components/support/test-chat-widget.tsx
```

- [ ] **Step 4: Verificar**

```bash
curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3000/dashboard
```
Expected: `307` (redirect, sin sesión) — no `500`. Después, con sesión real en el navegador: abrir `/dashboard`, ver la burbuja 💬, abrirla, ver el banner de cola si no hay agentes disponibles.

- [ ] **Step 5: Commit**

```bash
git add components/support/ticket-widget.tsx "app/(dashboard)/layout.tsx"
git rm components/support/test-chat-widget.tsx
git commit -m "feat(tickets): widget del cliente con adjuntos, typing y checks de leído"
```

---

### Task 7: UI del agente — `/zero-tickets`

**Files:**
- Create: `app/zero-tickets/layout.tsx`
- Create: `app/zero-tickets/page.tsx`

- [ ] **Step 1: Layout standalone (gate admin, NO anidado bajo `/admin`)**

`app/zero-tickets/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';

export default async function ZeroTicketsLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-4">
        <div className="h-7 w-7 bg-teal-500 rounded-lg flex items-center justify-center">
          <span className="font-black text-xs text-white">z</span>
        </div>
        <span className="font-bold text-sm sm:text-base">Zero Tickets</span>
        <a href="/dashboard" className="ml-auto text-xs sm:text-sm text-gray-400 hover:text-white">← App</a>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Vista de agente**

Cubre: toggle de disponibilidad (con conteo de agentes online), lista con no-leído/typing/tiempo de espera, botón "Tomar" cuando no está asignado, thread con adjuntos + typing + checks de leído, botón "Pedir captura", cerrar/reabrir.

`app/zero-tickets/page.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface TicketRow {
  id: number;
  status: string;
  lastMessageAt: string;
  unread: boolean;
  userTyping: boolean;
  teamId: number;
  teamName: string;
  userName: string | null;
  userEmail: string;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  lastMessage: string | null;
}

interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
}

interface Message {
  id: number;
  senderType: 'user' | 'agent' | 'system';
  messageType: 'text' | 'screenshot_request';
  content: string | null;
  createdAt: string;
  attachment: Attachment | null;
}

export default function ZeroTicketsPage() {
  const [ticketList, setTicketList] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState(false);
  const [onlineAgents, setOnlineAgents] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef(0);

  async function loadTickets() {
    const res = await fetch('/api/zero-tickets/agent/tickets');
    if (res.ok) setTicketList((await res.json()).tickets);
  }

  async function loadMessages(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/messages`);
    if (res.ok) setMessages((await res.json()).messages);
  }

  async function loadPresence() {
    const res = await fetch('/api/zero-tickets/agent/presence');
    if (res.ok) {
      const data = await res.json();
      setAvailable(data.available);
      setOnlineAgents(data.onlineAgents);
    }
  }

  useEffect(() => {
    loadTickets();
    loadPresence();
    const interval = setInterval(() => {
      loadTickets();
      loadPresence();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedId == null) return;
    loadMessages(selectedId);
    pollRef.current = setInterval(() => loadMessages(selectedId), 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId]);

  async function toggleAvailable() {
    const next = !available;
    setAvailable(next);
    await fetch('/api/zero-tickets/agent/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: next }),
    });
    await loadPresence();
  }

  async function claim(id: number) {
    await fetch(`/api/zero-tickets/agent/tickets/${id}/claim`, { method: 'POST' });
    await loadTickets();
  }

  async function toggleStatus(id: number, currentStatus: string) {
    const nextStatus = currentStatus === 'cerrado' ? 'abierto' : 'cerrado';
    await fetch(`/api/zero-tickets/agent/tickets/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadTickets();
  }

  async function requestScreenshot(id: number) {
    await fetch(`/api/zero-tickets/agent/tickets/${id}/request-screenshot`, { method: 'POST' });
    await loadMessages(id);
  }

  function onReplyChange(value: string) {
    setReply(value);
    if (!selectedId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      fetch(`/api/zero-tickets/agent/tickets/${selectedId}/typing`, { method: 'POST' }).catch(() => {});
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/zero-tickets/agent/tickets/${selectedId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (res.ok) {
        setReply('');
        await loadMessages(selectedId);
        await loadTickets();
      }
    } finally {
      setSending(false);
    }
  }

  const selected = ticketList.find((t) => t.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      <div className="w-80 shrink-0 flex flex-col gap-3">
        <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Mi estado</div>
            <div className="text-xs text-gray-500">{onlineAgents} agente(s) disponible(s)</div>
          </div>
          <button
            onClick={toggleAvailable}
            className={`text-xs px-3 py-1.5 rounded ${available ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            {available ? 'Disponible' : 'No disponible'}
          </button>
        </div>

        <div className="flex-1 border rounded-lg bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b font-bold text-gray-900">Tickets ({ticketList.length})</div>
          {ticketList.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${selectedId === t.id ? 'bg-teal-50' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
                  {t.unread && <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />}
                  {t.userName ?? t.userEmail}
                </span>
                <span className={`text-xs ${t.status === 'esperando' ? 'text-amber-600' : t.status === 'abierto' ? 'text-teal-600' : 'text-gray-400'}`}>
                  {t.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">{t.teamName}</div>
              <div className="text-xs text-gray-600 truncate mt-1">
                {t.userTyping ? <em>escribiendo...</em> : (t.lastMessage ?? '(sin mensajes)')}
              </div>
              {t.assignedAgentName && <div className="text-[10px] text-gray-400 mt-1">Agente: {t.assignedAgentName}</div>}
            </button>
          ))}
          {ticketList.length === 0 && <div className="p-4 text-sm text-gray-400">Ningún ticket todavía.</div>}
        </div>
      </div>

      <div className="flex-1 border rounded-lg bg-white flex flex-col">
        {selectedId == null || !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecciona un ticket</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <div className="font-bold text-gray-900">{selected.userName ?? selected.userEmail}</div>
                <div className="text-xs text-gray-500">{selected.teamName}</div>
              </div>
              <div className="flex gap-2">
                {!selected.assignedAgentId && (
                  <button onClick={() => claim(selected.id)} className="text-xs px-3 py-1.5 rounded bg-teal-600 text-white hover:bg-teal-700">
                    Tomar ticket
                  </button>
                )}
                <button onClick={() => requestScreenshot(selected.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Pedir captura
                </button>
                <button
                  onClick={() => toggleStatus(selected.id, selected.status)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    selected.status === 'cerrado' ? 'border-teal-600 text-teal-700 hover:bg-teal-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {selected.status === 'cerrado' ? 'Reabrir' : 'Cerrar'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => {
                if (m.senderType === 'system') {
                  return (
                    <div key={m.id} className="text-center text-[11px] text-gray-400">{m.content}</div>
                  );
                }
                const mine = m.senderType === 'agent';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`inline-block max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                      {m.messageType === 'screenshot_request' && (
                        <div className="text-[11px] opacity-80 mb-1">📸 Pedido de captura</div>
                      )}
                      {m.content}
                      {m.attachment && (
                        <div className="mt-1.5">
                          {m.attachment.kind === 'image' && (
                            <img src={`/api/zero-tickets/attachments/${m.attachment.id}`} alt={m.attachment.fileName} className="max-w-full rounded" />
                          )}
                          {m.attachment.kind === 'video' && (
                            <video src={`/api/zero-tickets/attachments/${m.attachment.id}`} controls className="max-w-full rounded" />
                          )}
                          {m.attachment.kind === 'file' && (
                            <a href={`/api/zero-tickets/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer" className="underline text-xs">
                              📎 {m.attachment.fileName}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t p-3 flex gap-2">
              <input
                value={reply}
                onChange={(e) => onReplyChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                placeholder="Escribe una respuesta..."
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <button onClick={sendReply} disabled={sending} className="bg-teal-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
curl -s -o /dev/null -w "zero-tickets: %{http_code}\n" http://localhost:3000/zero-tickets
```
Expected: `307` (redirect, sin sesión) — no `500`.

- [ ] **Step 4: Commit**

```bash
git add app/zero-tickets
git commit -m "feat(tickets): vista de agente en /zero-tickets"
```

---

### Task 8: Borrar el inbox viejo

**Files:**
- Delete: `app/admin/inbox/` (carpeta)
- Delete: `app/api/admin/inbox/` (carpeta)
- Modify: `app/admin/layout.tsx` (quitar el link "Inbox")

- [ ] **Step 1: Confirmar que nada nuevo depende de estas rutas**

```bash
grep -rn "admin/inbox" app components lib --include="*.tsx" --include="*.ts"
```
Expected: sin resultados (o solo referencias dentro de las carpetas que se van a borrar).

- [ ] **Step 2: Borrar**

```bash
rm -rf app/admin/inbox app/api/admin/inbox
```

- [ ] **Step 3: Quitar el link de la nav**

En `app/admin/layout.tsx`, quitar la línea:

```tsx
<a href="/admin/inbox" className="text-gray-300 hover:text-white whitespace-nowrap">Inbox</a>
```

- [ ] **Step 4: Verificar**

```bash
curl -s -o /dev/null -w "admin/inbox (borrado, esperar 404): %{http_code}\n" http://localhost:3000/admin/inbox
curl -s -o /dev/null -w "admin: %{http_code}\n" http://localhost:3000/admin
```
Expected: el primero `404`, el segundo `307` (redirect sin sesión, no `500`).

- [ ] **Step 5: Commit**

```bash
git add -A app/admin
git commit -m "chore(tickets): borra el inbox viejo, reemplazado por /zero-tickets"
```

---

### Task 9: Verificación manual completa (checklist para el usuario)

No hay suite automatizada — este es el checklist real antes de dar por terminado:

- [ ] Correr `npx tsx scripts/apply-migration-0089.ts` — confirma que las 4 tablas nuevas existen y las viejas ya no.
- [ ] `pnpm dev`, loguearse como usuario normal (no admin) → ver la burbuja de Zero Tickets en `/dashboard`.
- [ ] Mandar un mensaje sin ningún agente disponible → ver el banner "Todos nuestros agentes están ocupados...".
- [ ] Loguearse como admin en otra sesión/navegador → ir a `/zero-tickets` (confirmar que NO aparece dentro de `/admin`) → togglear "Disponible".
- [ ] Volver como usuario normal, mandar otro mensaje → confirmar que ahora el banner muestra minutos estimados.
- [ ] Como admin: ver el ticket en la lista con el punto de no-leído, click, "Tomar ticket", responder.
- [ ] Como usuario: confirmar que llega la respuesta (polling ~1.5s) y que el check pasa de ✓ a ✓✓ cuando el admin abrió el ticket.
- [ ] Escribir sin enviar en ambos lados → confirmar que aparece "escribiendo..." del otro lado.
- [ ] Adjuntar una imagen desde el widget del cliente → confirmar que se ve inline en ambos lados.
- [ ] Adjuntar un PDF → confirmar que aparece como link descargable, no como imagen rota.
- [ ] Como admin: "Pedir captura" → confirmar que aparece el mensaje especial en ambos lados.
- [ ] Como admin: "Cerrar" el ticket → confirmar que el widget del cliente muestra el banner amarillo de cerrado.
- [ ] Como cliente: escribir en un ticket cerrado → confirmar que se reabre automáticamente (mismo comportamiento que el inbox anterior).
- [ ] Confirmar que `SUPPORT_SLACK_WEBHOOK_URL` sigue mandando alertas (ahora con texto "Nuevo ticket").

---

## Self-Review

**Cobertura del spec:**
1. Sistema de tickets con tiempo de espera por agentes disponibles → Task 1 (`agent_presence`, `status`), Task 3 (`calcularEspera`), Task 5 (`/agent/presence`), Task 6/7 (UI de cola y toggle). ✅
2. Fotos/archivos/video + pedir captura → Task 2 (storage), Task 4 (subida/descarga), Task 5 (`request-screenshot`), Task 6/7 (render de adjuntos + UI de pedido). ✅
3. Typing + check de leído, ambos lados → Task 1 (`*_typing_until`, `last_read_by_*_at`), Task 3/5 (`typing` endpoints), Task 6/7 (indicador + checks). ✅
4. Ruta aparte, fuera de admin → Task 7 (`app/zero-tickets/layout.tsx` standalone), Task 8 (borra `/admin/inbox`). ✅
5. Mongo a futuro → documentado como decisión explícita en "Decisiones ya tomadas", sin trabajo de código ahora (correcto, YAGNI). ✅

**Placeholders:** ninguno — cada paso tiene código completo, no hay "TODO" ni "similar a Task N" sin repetir el código.

**Consistencia de tipos:** `status` de tickets es `'esperando' | 'abierto' | 'cerrado'` en schema, migración, y en las 3 rutas que lo tocan (`tickets/route.ts`, `agent/tickets/[id]/claim`, `agent/tickets/[id]/status`) — consistente. `senderType` es `'user' | 'agent' | 'system'` en todos los archivos que lo usan. `Attachment.kind` es `'image' | 'video' | 'file'` en schema, storage helper, y ambos componentes de UI — consistente.
