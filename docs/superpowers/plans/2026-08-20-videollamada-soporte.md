# Videollamada con Pantalla Compartida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Adaptación a este repo:** sin suite de tests automatizados (`pytest`/`vitest` no configurados). Cada ruta backend se verifica con `curl` contra `pnpm dev` corriendo, y cada pieza de UI con una revisión visual dirigida — mismo patrón que `docs/superpowers/plans/2026-08-14-zero-tickets.md`. El handshake WebRTC en sí (Task 21) no se puede probar tramo a tramo: se verifica de punta a punta con dos navegadores al final.
>
> **Migraciones:** `drizzle-kit migrate` está congelado en la migración 0004 y no aplica nada después — este repo aplica migraciones a mano contra Postgres. Task 1 incluye el paso exacto para aplicarla en este entorno (ya probado en esta misma sesión).

**Goal:** El agente pide una videollamada desde un ticket. El cliente acepta, comparte pantalla y micrófono; el agente responde con su micrófono. Media va directa entre navegadores (WebRTC P2P), sin servidor de video ni grabación.

**Architecture:** Dos tablas nuevas (`ticket_calls`, `ticket_call_signals`) y 5 rutas REST. La señalización usa ICE no-trickle: un solo intercambio oferta/respuesta por llamada, gracias a transceivers reservados de antemano que permiten `replaceTrack` sin renegociar. El estado de la llamada viaja en el poll que Zero Tickets ya tiene (cliente y agente); las señales SDP tienen su propio poll acotado, solo mientras dura el handshake.

**Tech Stack:** WebRTC nativo (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`), Next.js route handlers, Drizzle/Postgres, React (client components).

**Spec de referencia:** `docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md` — leerlo antes de tocar código. Este plan asume que ya lo leíste; no repite el "por qué" de cada decisión, solo el "cómo".

---

## Task 1: Modelo de datos

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0151_ticket_calls.sql`

- [ ] **Step 1: Agregar las tablas a `lib/db/schema.ts`**

Buscar el bloque de `ticketAttachments` (termina alrededor de la línea 1075-1080, justo después de `ticketMessages`) y agregar esto inmediatamente después de que termine la definición de `ticketAttachments` (antes de cualquier `export const ...Relations = relations(...)` que exista para tickets, si lo hay — si no hay, agregar al final del archivo):

```ts
export const ticketCalls = pgTable('ticket_calls', {
  id:           serial('id').primaryKey(),
  ticketId:     integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  requestedBy:  integer('requested_by').notNull().references(() => users.id),
  status:       varchar('status', { length: 20 }).notNull().default('pendiente'), // pendiente | activa | terminada | rechazada
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  answeredAt:   timestamp('answered_at'),
  endedAt:      timestamp('ended_at'),
  endedReason:  varchar('ended_reason', { length: 20 }), // colgada | rechazada | timeout | error | desconexion
}, (t) => [
  // Una sola llamada viva (pendiente o activa) por ticket — el segundo
  // agente que intente llamar al mismo ticket choca acá, no en el código.
  uniqueIndex('ticket_calls_activa_uniq').on(t.ticketId).where(sql`status IN ('pendiente', 'activa')`),
]);

export const ticketCallSignals = pgTable('ticket_call_signals', {
  id:         serial('id').primaryKey(),
  callId:     integer('call_id').notNull().references(() => ticketCalls.id, { onDelete: 'cascade' }),
  fromRole:   varchar('from_role', { length: 10 }).notNull(), // user | agent
  kind:       varchar('kind', { length: 10 }).notNull(),      // offer | answer
  payload:    jsonb('payload').notNull(),                     // RTCSessionDescriptionInit completo
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});
```

`pgTable`, `serial`, `integer`, `varchar`, `timestamp`, `jsonb`, `uniqueIndex` y `sql` ya están importados al principio del archivo — no hace falta agregar imports.

- [ ] **Step 2: Escribir la migración SQL**

Crear `lib/db/migrations/0151_ticket_calls.sql`:

```sql
-- Videollamada con pantalla compartida — ver
-- docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md
--
-- Un solo par de tablas: el estado de la llamada (ticket_calls) y las
-- señales SDP del handshake (ticket_call_signals). Van separadas de
-- ticket_messages a propósito: son ruido técnico, no conversación.

CREATE TABLE IF NOT EXISTS ticket_calls (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMP,
  ended_at TIMESTAMP,
  ended_reason VARCHAR(20)
);

-- Índice parcial: solo una llamada pendiente/activa por ticket a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_calls_activa_uniq
  ON ticket_calls (ticket_id)
  WHERE status IN ('pendiente', 'activa');

CREATE TABLE IF NOT EXISTS ticket_call_signals (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES ticket_calls(id) ON DELETE CASCADE,
  from_role VARCHAR(10) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_call_signals_call_idx
  ON ticket_call_signals (call_id, created_at);
```

- [ ] **Step 3: Aplicar la migración**

Este repo no usa `drizzle-kit migrate` para archivos posteriores al 0004 (journal congelado). Aplicarla con un script Node puntual, mismo mecanismo ya usado y verificado en esta sesión:

```bash
node -e "
require('dotenv').config();
const fs = require('fs');
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', connect_timeout: 20, max: 1 });
(async () => {
  const contenido = fs.readFileSync('lib/db/migrations/0151_ticket_calls.sql', 'utf8');
  await sql.unsafe(contenido);
  console.log('OK — 0151_ticket_calls.sql aplicada');
  await sql.end();
})();
"
```

Correr desde la raíz del repo (para que `require('postgres')` resuelva contra `node_modules`). Expected output: `OK — 0151_ticket_calls.sql aplicada`.

- [ ] **Step 4: Verificar que las tablas existen**

```bash
node -e "
require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', connect_timeout: 20, max: 1 });
(async () => {
  const r = await sql\`select to_regclass('public.ticket_calls') as a, to_regclass('public.ticket_call_signals') as b\`;
  console.log(r[0]);
  await sql.end();
})();
"
```

Expected: `{ a: 'ticket_calls', b: 'ticket_call_signals' }`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "schema.ts"
```

Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0151_ticket_calls.sql
git commit -m "feat(llamadas): tablas ticket_calls y ticket_call_signals"
```

---

## Task 2: Permisos del navegador (CSP + Permissions-Policy)

**Files:**
- Modify: `next.config.ts:34-50`

- [ ] **Step 1: Abrir micrófono y compartir pantalla, y permitir STUN/TURN en connect-src**

En `next.config.ts`, el objeto `securityHeaders` (línea 34), reemplazar el `value` de `Content-Security-Policy` y el `value` de `Permissions-Policy`:

```ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.zero.com.do https://api.stripe.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com stun: turn: turns:; frame-src 'self' blob: https://js.stripe.com; object-src 'none'; base-uri 'self'",
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), display-capture=(self), geolocation=()',
  },
```

(Dejar el resto del archivo sin tocar — solo cambian estas dos entradas.)

- [ ] **Step 2: Agregar el comentario que explica el cambio**

Justo arriba de `const securityHeaders = [`, agregar al final del bloque de comentario ya existente (que termina con la explicación de `worker-src blob:`):

```ts
 *
 * `microphone=(self), display-capture=(self)` — la videollamada de soporte
 * (docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md) pide
 * getUserMedia (audio) y getDisplayMedia (pantalla). Sin esto el navegador
 * bloquea ambos de raíz, antes de que el código llegue a pedir permiso. La
 * cámara se queda cerrada — no la usa nada de este feature.
 *
 * `stun: turn: turns:` en connect-src — los navegadores tratan las
 * conexiones ICE de WebRTC como sujetas a connect-src; sin estos esquemas
 * ahí, la conexión a los servidores STUN/TURN se bloquea.
 */
```

- [ ] **Step 3: Reiniciar el dev server y confirmar los headers**

```bash
curl -sI http://localhost:3000 | grep -i "permissions-policy\|content-security-policy"
```

Expected: la línea de `permissions-policy` contiene `microphone=(self)` y `display-capture=(self)`; la de `content-security-policy` contiene `stun: turn: turns:`.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(llamadas): abrir microfono y pantalla compartida en Permissions-Policy"
```

---

## Task 3: Guard de autorización para llamadas

**Files:**
- Create: `lib/auth/zero-tickets-call-guard.ts`

Las rutas de señal y de colgar las puede tocar CUALQUIERA de los dos lados de una llamada — el cliente dueño del ticket, o un agente. Esto centraliza ese chequeo doble en un solo lugar en vez de repetirlo en cada ruta.

- [ ] **Step 1: Escribir el guard**

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, tickets } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isZeroTicketsAgent } from './zero-tickets-guard';

type Llamada = typeof ticketCalls.$inferSelect;

export interface CallParticipantOk {
  ok: true;
  role: 'user' | 'agent';
  call: Llamada;
}
export interface CallParticipantErr {
  ok: false;
  response: NextResponse;
}

/**
 * Autoriza al dueño del ticket (rol 'user') o a un agente de Zero Tickets
 * (rol 'agent') a tocar una llamada puntual. Ninguno de los dos por su
 * cuenta alcanza — se resuelve consultando de quién es el ticket detrás
 * de la llamada.
 */
export async function requireCallParticipant(
  callId: number,
): Promise<CallParticipantOk | CallParticipantErr> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const [row] = await db
    .select({ call: ticketCalls, ticketUserId: tickets.userId })
    .from(ticketCalls)
    .innerJoin(tickets, eq(tickets.id, ticketCalls.ticketId))
    .where(eq(ticketCalls.id, callId))
    .limit(1);

  if (!row) {
    return { ok: false, response: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  }

  if (row.ticketUserId === user.id) {
    return { ok: true, role: 'user', call: row.call };
  }
  if (await isZeroTicketsAgent(user)) {
    return { ok: true, role: 'agent', call: row.call };
  }
  return { ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "zero-tickets-call-guard"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/zero-tickets-call-guard.ts
git commit -m "feat(llamadas): guard de autorizacion compartido cliente/agente"
```

---

## Task 4: Helper de servidor — llamada vigente de un ticket

**Files:**
- Create: `lib/webrtc/llamada-db.ts`

Lo usan las dos rutas de poll existentes (Task 10 y 11) para no duplicar la query ni la lógica de expiración de invitaciones sin responder.

- [ ] **Step 1: Escribir el helper**

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages, users } from '@/lib/db/schema';

const TIMEOUT_INVITACION_MS = 60_000;

export interface LlamadaVigente {
  id: number;
  ticketId: number;
  status: string;
  requestedBy: number;
  requestedByName: string | null;
  createdAt: Date;
  answeredAt: Date | null;
}

/**
 * La llamada pendiente o activa de un ticket, si hay una. Expira sola una
 * invitación que nadie respondió en 60s (expiración perezosa: se resuelve
 * acá, en la próxima lectura, no con un cron — mismo patrón que
 * `exigirOnboarding` en `lib/onboarding/muro.ts`).
 */
export async function obtenerLlamadaVigente(ticketId: number): Promise<LlamadaVigente | null> {
  const [row] = await db
    .select({ call: ticketCalls, requestedByName: users.name })
    .from(ticketCalls)
    .leftJoin(users, eq(users.id, ticketCalls.requestedBy))
    .where(and(eq(ticketCalls.ticketId, ticketId), inArray(ticketCalls.status, ['pendiente', 'activa'])))
    .orderBy(desc(ticketCalls.createdAt))
    .limit(1);

  if (!row) return null;

  const vencida = row.call.status === 'pendiente'
    && Date.now() - row.call.createdAt.getTime() > TIMEOUT_INVITACION_MS;

  if (vencida) {
    await Promise.all([
      db.update(ticketCalls)
        .set({ status: 'terminada', endedAt: new Date(), endedReason: 'timeout' })
        .where(eq(ticketCalls.id, row.call.id)),
      db.insert(ticketMessages).values({
        ticketId,
        senderType: 'system',
        content: 'Nadie respondió la llamada a tiempo.',
      }),
    ]);
    return null;
  }

  return {
    id: row.call.id,
    ticketId: row.call.ticketId,
    status: row.call.status,
    requestedBy: row.call.requestedBy,
    requestedByName: row.requestedByName,
    createdAt: row.call.createdAt,
    answeredAt: row.call.answeredAt,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "llamada-db"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc/llamada-db.ts
git commit -m "feat(llamadas): helper de servidor para la llamada vigente de un ticket"
```

---

## Task 5: Ruta — iniciar llamada (agente)

**Files:**
- Create: `app/api/zero-tickets/calls/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { tickets, ticketCalls, ticketMessages } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { ticketId } = (await req.json()) as { ticketId: number };
  if (typeof ticketId !== 'number' || Number.isNaN(ticketId)) {
    return NextResponse.json({ error: 'ticketId inválido' }, { status: 400 });
  }

  const [ticket] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });

  let call;
  try {
    [call] = await db
      .insert(ticketCalls)
      .values({ ticketId, requestedBy: user.id })
      .returning();
  } catch (err) {
    // 23505 = unique_violation — el índice parcial ya tiene una llamada
    // pendiente/activa en este ticket.
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'Ya hay una llamada en curso en este ticket' }, { status: 409 });
    }
    throw err;
  }

  await Promise.all([
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'system',
      content: `${user.name ?? user.email} inició una llamada.`,
    }),
    db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticketId)),
  ]);

  return NextResponse.json({ call });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "calls/route"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl (necesita cookie de sesión de un agente — copiarla del navegador tras loguearse)**

```bash
curl -s -X POST http://localhost:3000/api/zero-tickets/calls \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<pegar cookie>" \
  -d '{"ticketId": 1}'
```

Expected: `{"call":{"id":1,"ticketId":1,"requestedBy":<id>,"status":"pendiente",...}}`. Repetir la misma llamada dos veces seguidas: la segunda debe devolver 409.

- [ ] **Step 4: Commit**

```bash
git add app/api/zero-tickets/calls/route.ts
git commit -m "feat(llamadas): ruta para que el agente inicie una llamada"
```

---

## Task 6: Ruta — aceptar o rechazar (cliente)

**Files:**
- Create: `app/api/zero-tickets/calls/[id]/answer/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages, tickets } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const { accept } = (await req.json()) as { accept: boolean };
  if (typeof accept !== 'boolean') return NextResponse.json({ error: 'accept inválido' }, { status: 400 });

  const [row] = await db
    .select({ call: ticketCalls, ticketUserId: tickets.userId })
    .from(ticketCalls)
    .innerJoin(tickets, eq(tickets.id, ticketCalls.ticketId))
    .where(eq(ticketCalls.id, callId))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  // Solo el dueño del ticket puede responder su propia invitación.
  if (row.ticketUserId !== user.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  if (row.call.status !== 'pendiente') {
    return NextResponse.json({ error: 'Esta llamada ya no está pendiente' }, { status: 409 });
  }

  const ticketId = row.call.ticketId;
  const [[updated]] = await Promise.all([
    accept
      ? db.update(ticketCalls).set({ status: 'activa', answeredAt: new Date() }).where(eq(ticketCalls.id, callId)).returning()
      : db.update(ticketCalls).set({ status: 'rechazada', endedAt: new Date(), endedReason: 'rechazada' }).where(eq(ticketCalls.id, callId)).returning(),
    db.insert(ticketMessages).values({
      ticketId,
      senderType: 'system',
      content: accept ? 'Llamada aceptada.' : 'Llamada rechazada.',
    }),
  ]);

  return NextResponse.json({ call: updated });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "answer/route"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl (cookie del cliente dueño del ticket)**

```bash
curl -s -X POST http://localhost:3000/api/zero-tickets/calls/1/answer \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<pegar cookie del cliente>" \
  -d '{"accept": true}'
```

Expected: `{"call":{"id":1,"status":"activa","answeredAt":"...",...}}`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/zero-tickets/calls/[id]/answer/route.ts"
git commit -m "feat(llamadas): ruta para que el cliente acepte o rechace"
```

---

## Task 7: Ruta — señales SDP (handshake)

**Files:**
- Create: `app/api/zero-tickets/calls/[id]/signal/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gt } from 'drizzle-orm';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCallSignals } from '@/lib/db/schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  if (auth.call.status !== 'pendiente' && auth.call.status !== 'activa') {
    return NextResponse.json({ error: 'La llamada ya terminó' }, { status: 409 });
  }

  const { kind, sdp } = (await req.json()) as { kind: 'offer' | 'answer'; sdp: unknown };
  if (kind !== 'offer' && kind !== 'answer') {
    return NextResponse.json({ error: 'kind inválido' }, { status: 400 });
  }

  const [signal] = await db
    .insert(ticketCallSignals)
    .values({ callId, fromRole: auth.role, kind, payload: sdp })
    .returning();

  return NextResponse.json({ signal });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  const desdeParam = req.nextUrl.searchParams.get('desde');
  const desde = desdeParam ? parseInt(desdeParam, 10) : 0;

  // Solo interesan las señales del OTRO lado — las propias ya las tengo.
  const otroRol = auth.role === 'user' ? 'agent' : 'user';

  const signals = await db
    .select()
    .from(ticketCallSignals)
    .where(and(eq(ticketCallSignals.callId, callId), eq(ticketCallSignals.fromRole, otroRol), gt(ticketCallSignals.id, desde)))
    .orderBy(asc(ticketCallSignals.id));

  return NextResponse.json({ signals });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "signal/route"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl**

```bash
curl -s -X POST http://localhost:3000/api/zero-tickets/calls/1/signal \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<cookie del cliente>" \
  -d '{"kind":"offer","sdp":{"type":"offer","sdp":"v=0..."}}'

curl -s "http://localhost:3000/api/zero-tickets/calls/1/signal?desde=0" \
  -H "Cookie: session=<cookie del agente>"
```

Expected: el POST devuelve `{"signal":{"id":1,"fromRole":"user","kind":"offer",...}}`; el GET del agente devuelve `{"signals":[{"id":1,"fromRole":"user","kind":"offer",...}]}` — recibe la señal del cliente porque son roles distintos.

- [ ] **Step 4: Commit**

```bash
git add "app/api/zero-tickets/calls/[id]/signal/route.ts"
git commit -m "feat(llamadas): ruta de señalización SDP (GET/POST)"
```

---

## Task 8: Ruta — colgar

**Files:**
- Create: `app/api/zero-tickets/calls/[id]/end/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketMessages } from '@/lib/db/schema';

const RAZONES_VALIDAS = new Set(['colgada', 'error', 'desconexion']);

function formatearDuracion(ms: number): string {
  const totalSeg = Math.round(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const auth = await requireCallParticipant(callId);
  if (!auth.ok) return auth.response;

  if (auth.call.status !== 'pendiente' && auth.call.status !== 'activa') {
    return NextResponse.json({ call: auth.call });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason && RAZONES_VALIDAS.has(body.reason) ? body.reason : 'colgada';

  const ahora = new Date();
  const duracionTexto = auth.call.answeredAt
    ? ` · ${formatearDuracion(ahora.getTime() - auth.call.answeredAt.getTime())}`
    : '';

  const [[updated]] = await Promise.all([
    db.update(ticketCalls)
      .set({ status: 'terminada', endedAt: ahora, endedReason: reason })
      .where(eq(ticketCalls.id, callId))
      .returning(),
    db.insert(ticketMessages).values({
      ticketId: auth.call.ticketId,
      senderType: 'system',
      content: `Llamada terminada${duracionTexto}.`,
    }),
  ]);

  return NextResponse.json({ call: updated });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "end/route"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl**

```bash
curl -s -X POST http://localhost:3000/api/zero-tickets/calls/1/end \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<cualquiera de los dos>" \
  -d '{"reason":"colgada"}'
```

Expected: `{"call":{"id":1,"status":"terminada","endedReason":"colgada",...}}`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/zero-tickets/calls/[id]/end/route.ts"
git commit -m "feat(llamadas): ruta para colgar"
```

---

## Task 9: Ruta — credenciales ICE (STUN/TURN)

**Files:**
- Create: `app/api/zero-tickets/calls/ice-servers/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { getUser } from '@/lib/db/queries';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TTL_SEGUNDOS = 600;

/**
 * STUN público siempre disponible, sin credenciales — alcanza para la
 * mayoría de las redes. TURN solo se agrega si hay credenciales configuradas
 * (TURN_URL + TURN_SECRET); si no las hay, degrada a STUN-only, mismo
 * criterio que `s3Disponible()` degradando a base64 en
 * `lib/storage/tickets.ts`.
 */
function construirIceServers(): IceServer[] {
  const servers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  const turnUrl = process.env.TURN_URL;
  const turnSecret = process.env.TURN_SECRET;
  if (!turnUrl || !turnSecret) return servers;

  // Credenciales efímeras (REST API de coturn/Cloudflare): username con
  // vencimiento embebido, credential = HMAC-SHA1 del username con el
  // secreto del servidor. El secreto nunca sale de acá.
  const username = `${Math.floor(Date.now() / 1000) + TTL_SEGUNDOS}:zero-tickets`;
  const credential = createHmac('sha1', turnSecret).update(username).digest('base64');

  servers.push({ urls: turnUrl, username, credential });
  return servers;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  return NextResponse.json({ iceServers: construirIceServers() });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "ice-servers"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl**

```bash
curl -s http://localhost:3000/api/zero-tickets/calls/ice-servers \
  -H "Cookie: session=<cualquier usuario logueado>"
```

Expected (sin `TURN_URL`/`TURN_SECRET` en el entorno): `{"iceServers":[{"urls":"stun:stun.l.google.com:19302"}]}`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/zero-tickets/calls/ice-servers/route.ts"
git commit -m "feat(llamadas): ruta de credenciales ICE, STUN publico con TURN opcional"
```

---

## Task 10: Wirear `call` en el poll del cliente

**Files:**
- Modify: `app/api/zero-tickets/tickets/route.ts:135-179`

- [ ] **Step 1: Importar el helper**

Al principio del archivo, agregar el import:

```ts
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';
```

- [ ] **Step 2: Paralelizar la query de mensajes con la de la llamada, y agregar `call` a la respuesta**

Reemplazar el bloque actual (desde `const messages = await db` hasta el `return NextResponse.json({...})` final) por:

```ts
  const [messages, call] = await Promise.all([
    db
      .select({
        message: ticketMessages,
        attachment: ticketAttachments,
      })
      .from(ticketMessages)
      .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
      .where(eq(ticketMessages.ticketId, ticket.id))
      .orderBy(asc(ticketMessages.createdAt)),
    obtenerLlamadaVigente(ticket.id),
  ]);

  // El poll pega cada 1.5s mientras el chat está abierto — escribir acá en
  // cada tick, aunque no haya nada nuevo que marcar como leído, multiplica
  // los writes contra la DB por nada. Solo se actualiza si de verdad hay
  // mensajes más nuevos que la última marca.
  if (!ticket.lastReadByUserAt || ticket.lastMessageAt > ticket.lastReadByUserAt) {
    await db.update(tickets).set({ lastReadByUserAt: new Date() }).where(eq(tickets.id, ticket.id));
  }

  const espera = ticket.status === 'esperando' ? await calcularEspera() : null;

  return NextResponse.json({
    ticket: { ...ticket, agentTyping: ticket.agentTypingUntil ? ticket.agentTypingUntil > new Date() : false },
    messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })),
    espera,
    call,
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "zero-tickets/tickets/route"
```

Expected: sin salida.

- [ ] **Step 4: Probar con curl**

```bash
curl -s http://localhost:3000/api/zero-tickets/tickets -H "Cookie: session=<cliente>"
```

Expected: la respuesta incluye `"call":null` si no hay llamada vigente, o el objeto de la llamada si la hay (creala primero con Task 5).

- [ ] **Step 5: Commit**

```bash
git add app/api/zero-tickets/tickets/route.ts
git commit -m "feat(llamadas): exponer la llamada vigente en el poll del cliente"
```

---

## Task 11: Wirear `call` en el poll del agente

**Files:**
- Modify: `app/api/zero-tickets/agent/tickets/[id]/messages/route.ts`

- [ ] **Step 1: Reescribir la ruta completa**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketMessages, ticketAttachments, tickets } from '@/lib/db/schema';
import { obtenerLlamadaVigente } from '@/lib/webrtc/llamada-db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [messages, call] = await Promise.all([
    db
      .select({ message: ticketMessages, attachment: ticketAttachments })
      .from(ticketMessages)
      .leftJoin(ticketAttachments, eq(ticketAttachments.messageId, ticketMessages.id))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(asc(ticketMessages.createdAt)),
    obtenerLlamadaVigente(ticketId),
  ]);

  await db.update(tickets).set({ lastReadByAgentAt: new Date() }).where(eq(tickets.id, ticketId));

  return NextResponse.json({
    messages: messages.map((r) => ({ ...r.message, attachment: r.attachment })),
    call,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "agent/tickets.*messages/route"
```

Expected: sin salida.

- [ ] **Step 3: Probar con curl**

```bash
curl -s http://localhost:3000/api/zero-tickets/agent/tickets/1/messages -H "Cookie: session=<agente>"
```

Expected: la respuesta incluye `"call": ...` igual que en Task 10.

- [ ] **Step 4: Commit**

```bash
git add "app/api/zero-tickets/agent/tickets/[id]/messages/route.ts"
git commit -m "feat(llamadas): exponer la llamada vigente en el poll del agente"
```

---

## Task 12: Envoltorio de RTCPeerConnection

**Files:**
- Create: `lib/webrtc/conexion.ts`

- [ ] **Step 1: Escribir la clase**

```ts
'use client';

/**
 * Envoltorio sobre RTCPeerConnection. No sabe nada de React ni de HTTP —
 * solo maneja la conexión, los tracks y el ICE gathering no-trickle. Ver
 * docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TIMEOUT_ICE_GATHERING_MS = 8000;
export const TIMEOUT_CONEXION_MS = 20000;

export class ConexionLlamada {
  private readonly pc: RTCPeerConnection;
  private readonly audioSender: RTCRtpSender;
  private readonly videoSender: RTCRtpSender;
  private micStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onEstadoCambiado: ((estado: RTCPeerConnectionState) => void) | null = null;

  constructor(iceServers: IceServerConfig[]) {
    this.pc = new RTCPeerConnection({ iceServers });

    // Transceivers reservados de entrada: compartir pantalla después es un
    // replaceTrack, sin renegociar — un solo intercambio SDP por llamada,
    // sin importar quién comparte qué ni cuándo.
    this.audioSender = this.pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    this.videoSender = this.pc.addTransceiver('video', { direction: 'sendrecv' }).sender;

    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.onRemoteStream?.(e.streams[0]);
    };
    this.pc.onconnectionstatechange = () => {
      this.onEstadoCambiado?.(this.pc.connectionState);
    };
  }

  async activarMicrofono(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await this.audioSender.replaceTrack(this.micStream.getAudioTracks()[0]);
  }

  async compartirPantalla(onCortadoPorNavegador: () => void): Promise<void> {
    // Si ya había un share en curso (re-share sin cortar antes), hay que
    // soltar sus tracks primero — si no, la captura sigue corriendo
    // invisible y su `onended` queda huérfano. Nota: NO se llama
    // `dejarDeCompartirPantalla()` acá — eso también haría
    // `replaceTrack(null)`, un round-trip desperdiciado justo antes de
    // reemplazarlo por el track nuevo dos líneas abajo.
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = this.screenStream.getVideoTracks()[0];
    await this.videoSender.replaceTrack(track);
    // Si corta desde el control nativo del navegador ("Dejar de compartir"),
    // hay que enterarse para actualizar el estado en la UI.
    track.onended = onCortadoPorNavegador;
  }

  dejarDeCompartirPantalla(): void {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.videoSender.replaceTrack(null).catch(() => {});
  }

  silenciarMicrofono(silenciado: boolean): void {
    const track = this.micStream?.getAudioTracks()[0];
    if (track) track.enabled = !silenciado;
  }

  compartiendoPantalla(): boolean {
    return this.screenStream !== null;
  }

  /**
   * Arma la oferta y espera a que termine de juntar candidatos ICE antes de
   * devolverla — ICE no-trickle: un solo SDP con todo adentro, en vez de
   * ~40 señales sueltas que el poll de este proyecto no puede sostener a
   * tiempo.
   */
  async crearOferta(): Promise<RTCSessionDescriptionInit> {
    const oferta = await this.pc.createOffer();
    await this.pc.setLocalDescription(oferta);
    await this.esperarIceCompleto();
    if (!this.pc.localDescription) throw new Error('Sin localDescription tras negociar la oferta');
    return this.pc.localDescription.toJSON();
  }

  async crearRespuesta(ofertaRemota: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(ofertaRemota);
    const respuesta = await this.pc.createAnswer();
    await this.pc.setLocalDescription(respuesta);
    await this.esperarIceCompleto();
    if (!this.pc.localDescription) throw new Error('Sin localDescription tras negociar la respuesta');
    return this.pc.localDescription.toJSON();
  }

  async aplicarRespuesta(respuestaRemota: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(respuestaRemota);
  }

  private esperarIceCompleto(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, TIMEOUT_ICE_GATHERING_MS);
      const onChange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          this.pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  cerrar(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "webrtc/conexion"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc/conexion.ts
git commit -m "feat(llamadas): envoltorio de RTCPeerConnection con ICE no-trickle"
```

---

## Task 13: Cliente REST de señalización

**Files:**
- Create: `lib/webrtc/senalizacion.ts`

- [ ] **Step 1: Escribir el cliente**

```ts
'use client';

import type { IceServerConfig } from './conexion';

export interface LlamadaDTO {
  id: number;
  ticketId: number;
  status: 'pendiente' | 'activa' | 'terminada' | 'rechazada';
  requestedBy: number;
  requestedByName: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export interface SignalDTO {
  id: number;
  fromRole: 'user' | 'agent';
  kind: 'offer' | 'answer';
  payload: RTCSessionDescriptionInit;
  createdAt: string;
}

export async function iniciarLlamada(ticketId: number): Promise<LlamadaDTO> {
  const res = await fetch('/api/zero-tickets/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'No se pudo iniciar la llamada');
  }
  return (await res.json()).call;
}

export async function responderLlamada(callId: number, accept: boolean): Promise<LlamadaDTO> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept }),
  });
  if (!res.ok) throw new Error('No se pudo responder la llamada');
  return (await res.json()).call;
}

export async function mandarSenal(callId: number, kind: 'offer' | 'answer', sdp: RTCSessionDescriptionInit): Promise<void> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sdp }),
  });
  if (!res.ok) throw new Error('No se pudo mandar la señal');
}

export async function leerSenales(callId: number, desde: number): Promise<SignalDTO[]> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal?desde=${desde}`);
  if (!res.ok) return [];
  return (await res.json()).signals;
}

export async function terminarLlamada(callId: number, reason: string): Promise<void> {
  await fetch(`/api/zero-tickets/calls/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).catch(() => {});
}

export async function obtenerIceServers(): Promise<IceServerConfig[]> {
  const res = await fetch('/api/zero-tickets/calls/ice-servers');
  if (!res.ok) return [{ urls: 'stun:stun.l.google.com:19302' }];
  return (await res.json()).iceServers;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "webrtc/senalizacion"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc/senalizacion.ts
git commit -m "feat(llamadas): cliente REST de senalizacion"
```

---

## Task 14: Hook que orquesta la llamada

**Files:**
- Create: `lib/webrtc/useLlamada.ts`

- [ ] **Step 1: Escribir el hook**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConexionLlamada, TIMEOUT_CONEXION_MS } from './conexion';
import { mandarSenal, leerSenales, terminarLlamada, obtenerIceServers, type LlamadaDTO } from './senalizacion';

export type EstadoLlamada = 'inactiva' | 'conectando' | 'activa' | 'error';

const TIMEOUT_DESCONEXION_MS = 10000;

/**
 * Orquesta la conexión WebRTC de una llamada. El ESTADO de la llamada
 * (pendiente/activa/terminada) lo trae el poll que cada lado ya tiene
 * (useTicketChat para el cliente, el poll de mensajes para el agente) — este
 * hook solo reacciona a esos cambios y maneja la conexión de media en sí.
 */
export function useLlamada(role: 'user' | 'agent', call: LlamadaDTO | null) {
  const [estado, setEstado] = useState<EstadoLlamada>('inactiva');
  const [error, setError] = useState<string | null>(null);
  const [micActivo, setMicActivo] = useState(true);
  const [compartiendoPantalla, setCompartiendoPantalla] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const estadoRef = useRef<EstadoLlamada>('inactiva');
  const conexionRef = useRef<ConexionLlamada | null>(null);
  const callIdEnCursoRef = useRef<number | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutConexionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 10s de gracia cuando la conexión pasa a 'disconnected' — un lag de red
  // breve no debe cortar la llamada de una, pero si no se recupera en ese
  // plazo sí hay que cerrarla (tabla de errores del spec de diseño).
  const desconexionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaSenalRef = useRef(0);

  function fijarEstado(nuevo: EstadoLlamada) {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }

  const limpiar = useCallback((mensajeError?: string) => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    if (timeoutConexionRef.current) clearTimeout(timeoutConexionRef.current);
    if (desconexionRef.current) clearTimeout(desconexionRef.current);
    signalPollRef.current = null;
    timeoutConexionRef.current = null;
    desconexionRef.current = null;
    conexionRef.current?.cerrar();
    conexionRef.current = null;
    callIdEnCursoRef.current = null;
    ultimaSenalRef.current = 0;
    setRemoteStream(null);
    setCompartiendoPantalla(false);
    fijarEstado(mensajeError ? 'error' : 'inactiva');
    setError(mensajeError ?? null);
  }, []);

  const colgar = useCallback((reason: string = 'colgada') => {
    const id = callIdEnCursoRef.current;
    if (id) terminarLlamada(id, reason);
    limpiar();
  }, [limpiar]);

  const negociar = useCallback(async (llamada: LlamadaDTO, soyOfertante: boolean) => {
    callIdEnCursoRef.current = llamada.id;
    fijarEstado('conectando');
    setError(null);
    try {
      const iceServers = await obtenerIceServers();
      const conexion = new ConexionLlamada(iceServers);
      conexionRef.current = conexion;
      conexion.onRemoteStream = (stream) => setRemoteStream(stream);
      conexion.onEstadoCambiado = (pcEstado) => {
        if (pcEstado === 'connected') {
          if (desconexionRef.current) {
            clearTimeout(desconexionRef.current);
            desconexionRef.current = null;
          }
          fijarEstado('activa');
        }
        if (pcEstado === 'failed') colgar('error');
        // 'disconnected' es transitorio (un lag de red breve pasa por acá
        // sin que la llamada esté realmente perdida) — se le da 10s de
        // gracia para reconectar solo antes de cortar.
        if (pcEstado === 'disconnected' && !desconexionRef.current) {
          desconexionRef.current = setTimeout(() => colgar('desconexion'), TIMEOUT_DESCONEXION_MS);
        }
      };

      // Negar el micrófono no debe tirar abajo la llamada entera — sigue
      // sin audio propio, recibiendo el del otro lado igual (tabla de
      // errores del spec de diseño).
      try {
        await conexion.activarMicrofono();
      } catch {
        setError('No se pudo activar el micrófono. La llamada sigue sin tu audio.');
      }

      timeoutConexionRef.current = setTimeout(() => {
        if (estadoRef.current !== 'activa') colgar('error');
      }, TIMEOUT_CONEXION_MS);

      if (soyOfertante) {
        const oferta = await conexion.crearOferta();
        await mandarSenal(llamada.id, 'offer', oferta);
      }

      // Poll de señales — solo mientras dura el handshake (oferta+respuesta
      // es todo el intercambio; se apaga solo apenas llega la que faltaba).
      signalPollRef.current = setInterval(async () => {
        const senales = await leerSenales(llamada.id, ultimaSenalRef.current);
        let negociada = false;
        for (const s of senales) {
          ultimaSenalRef.current = Math.max(ultimaSenalRef.current, s.id);
          if (!soyOfertante && s.kind === 'offer') {
            const respuesta = await conexion.crearRespuesta(s.payload);
            await mandarSenal(llamada.id, 'answer', respuesta);
            negociada = true;
          } else if (soyOfertante && s.kind === 'answer') {
            await conexion.aplicarRespuesta(s.payload);
            negociada = true;
          }
        }
        if (negociada && signalPollRef.current) {
          clearInterval(signalPollRef.current);
          signalPollRef.current = null;
        }
      }, 1500);
    } catch {
      colgar('error');
    }
  }, [colgar]);

  useEffect(() => {
    if (!call) return;
    if (call.status === 'activa' && callIdEnCursoRef.current !== call.id) {
      negociar(call, role === 'user'); // el que acepta ofrece
    }
    if ((call.status === 'terminada' || call.status === 'rechazada') && estadoRef.current !== 'inactiva') {
      limpiar();
    }
  }, [call, role, negociar, limpiar]);

  useEffect(() => () => limpiar(), [limpiar]);

  const alternarMicrofono = useCallback(() => {
    setMicActivo((prev) => {
      const nuevo = !prev;
      conexionRef.current?.silenciarMicrofono(!nuevo);
      return nuevo;
    });
  }, []);

  const alternarPantalla = useCallback(async () => {
    const conexion = conexionRef.current;
    if (!conexion) return;
    if (conexion.compartiendoPantalla()) {
      conexion.dejarDeCompartirPantalla();
      setCompartiendoPantalla(false);
    } else {
      try {
        await conexion.compartirPantalla(() => setCompartiendoPantalla(false));
        setCompartiendoPantalla(true);
      } catch {
        // Picker nativo cancelado — no es un error a mostrar.
      }
    }
  }, []);

  return { estado, error, micActivo, compartiendoPantalla, remoteStream, alternarMicrofono, alternarPantalla, colgar };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "webrtc/useLlamada"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc/useLlamada.ts
git commit -m "feat(llamadas): hook que orquesta la conexion WebRTC"
```

---

## Task 15: UI — banner de invitación

**Files:**
- Create: `components/support/invitacion-llamada.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
'use client';

import { Video } from 'lucide-react';

export function InvitacionLlamada({
  nombreAgente,
  onAceptar,
  onRechazar,
}: {
  nombreAgente: string | null;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  return (
    <div style={{ padding: '12px 20px', background: '#eef1fd', borderBottom: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <Video size={18} color="#3658e1" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: '#1e293b', flex: 1 }}>
        {nombreAgente ?? 'El agente'} quiere iniciar una llamada con pantalla compartida.
      </span>
      <button
        onClick={onRechazar}
        style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
      >
        Rechazar
      </button>
      <button
        onClick={onAceptar}
        style={{ border: 'none', background: '#3658e1', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
      >
        Aceptar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "invitacion-llamada"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add components/support/invitacion-llamada.tsx
git commit -m "feat(llamadas): banner de invitacion a llamada"
```

---

## Task 16: UI — panel de la llamada

**Files:**
- Create: `components/support/panel-llamada.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { Mic, MicOff, ScreenShare, ScreenShareOff, PhoneOff } from 'lucide-react';
import type { EstadoLlamada } from '@/lib/webrtc/useLlamada';

export function PanelLlamada({
  estado,
  error,
  micActivo,
  compartiendoPantalla,
  remoteStream,
  onAlternarMicrofono,
  onAlternarPantalla,
  onColgar,
}: {
  estado: EstadoLlamada;
  error: string | null;
  micActivo: boolean;
  compartiendoPantalla: boolean;
  remoteStream: MediaStream | null;
  onAlternarMicrofono: () => void;
  onAlternarPantalla: () => void;
  onColgar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {remoteStream ? (
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13.5, padding: '0 20px', textAlign: 'center' }}>
            {estado === 'conectando' && 'Conectando…'}
            {estado === 'error' && (error ?? 'No se pudo conectar')}
            {estado === 'activa' && 'Esperando a que comparta pantalla…'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 14, background: '#1e293b' }}>
        <button
          onClick={onAlternarMicrofono}
          title={micActivo ? 'Silenciar micrófono' : 'Activar micrófono'}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: micActivo ? '#334155' : '#dc2626', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {micActivo ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={onAlternarPantalla}
          title={compartiendoPantalla ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: compartiendoPantalla ? '#3658e1' : '#334155', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {compartiendoPantalla ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
        </button>
        <button
          onClick={onColgar}
          title="Colgar"
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#dc2626', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "panel-llamada"
```

Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add components/support/panel-llamada.tsx
git commit -m "feat(llamadas): panel de video y controles de la llamada"
```

---

## Task 17: Exponer `call` desde `useTicketChat`

**Files:**
- Modify: `lib/hooks/useTicketChat.ts`

- [ ] **Step 1: Importar el tipo y agregar el estado**

Al principio del archivo, agregar el import:

```ts
import type { LlamadaDTO } from '@/lib/webrtc/senalizacion';
```

Justo después de `const [espera, setEspera] = useState<Espera | null>(null);` (línea 66), agregar:

```ts
  const [call, setCall] = useState<LlamadaDTO | null>(null);
```

- [ ] **Step 2: Leerlo del poll**

Dentro de `poll()`, justo después de `setEspera(data.espera);` (línea 117), agregar:

```ts
      setCall(data.call ?? null);
```

- [ ] **Step 3: Exponerlo en el return**

En el objeto que devuelve el hook, agregar `call,` junto a `espera,`:

```ts
    espera,
    call,
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "useTicketChat"
```

Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useTicketChat.ts
git commit -m "feat(llamadas): exponer el estado de la llamada desde useTicketChat"
```

---

## Task 18: Wirear el widget flotante

**Files:**
- Modify: `components/support/ticket-widget.tsx`

El widget de 360px no alcanza para mostrar video — al aceptar, redirige a `/dashboard/soporte` (la conexión WebRTC arranca ahí, no acá).

- [ ] **Step 1: Importar lo necesario**

Al principio del archivo, agregar:

```ts
import { useRouter } from 'next/navigation';
import { InvitacionLlamada } from '@/components/support/invitacion-llamada';
import { responderLlamada } from '@/lib/webrtc/senalizacion';
```

- [ ] **Step 2: Agregar el router y el handler**

Dentro de `TicketWidget()`, justo después de `const chat = useTicketChat(open);` (línea 23), agregar:

```ts
  const router = useRouter();

  async function responderInvitacion(accept: boolean) {
    if (!chat.call) return;
    await responderLlamada(chat.call.id, accept);
    if (accept) router.push('/dashboard/soporte');
  }
```

- [ ] **Step 3: Mostrar el banner**

Justo después del bloque de `{chat.status === 'esperando' && chat.espera && (...)}` (después de la línea 101, antes de `<div ref={listRef} ...>`), agregar:

```tsx
      {chat.call?.status === 'pendiente' && (
        <InvitacionLlamada
          nombreAgente={chat.call.requestedByName}
          onAceptar={() => responderInvitacion(true)}
          onRechazar={() => responderInvitacion(false)}
        />
      )}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "ticket-widget"
```

Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add components/support/ticket-widget.tsx
git commit -m "feat(llamadas): banner de invitacion en el widget, redirige a pantalla completa"
```

---

## Task 19: Wirear `/dashboard/soporte`

**Files:**
- Modify: `components/support/soporte-full-page.tsx`

- [ ] **Step 1: Importar lo necesario**

Al principio del archivo, agregar:

```ts
import { InvitacionLlamada } from '@/components/support/invitacion-llamada';
import { PanelLlamada } from '@/components/support/panel-llamada';
import { useLlamada } from '@/lib/webrtc/useLlamada';
import { responderLlamada } from '@/lib/webrtc/senalizacion';
```

- [ ] **Step 2: Conectar el hook de llamada**

Dentro de `SoportePaginaCompleta()`, justo después de `const chat = useTicketChat(true);`, agregar:

```ts
  const llamada = useLlamada('user', chat.call);

  async function responderInvitacion(accept: boolean) {
    if (!chat.call) return;
    await responderLlamada(chat.call.id, accept);
  }
```

- [ ] **Step 3: Cambiar el layout raíz para poder mostrar el panel al lado**

Buscar la línea `return (` seguida de `<div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>` y envolver el contenido existente en una fila que deje lugar al panel de llamada. Reemplazar:

```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {(chat.busyStage === 'capturando' || chat.busyStage === 'subiendo') && (
        <CapturaOverlay stage={chat.busyStage} />
      )}

      <div style={{ padding: '18px 28px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 19, color: '#0f172a' }}>Soporte</span>
      </div>
```

por:

```tsx
  return (
    <div style={{ display: 'flex', height: '100%' }}>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: 'white' }}>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {(chat.busyStage === 'capturando' || chat.busyStage === 'subiendo') && (
        <CapturaOverlay stage={chat.busyStage} />
      )}

      <div style={{ padding: '18px 28px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 19, color: '#0f172a' }}>Soporte</span>
      </div>

      {chat.call?.status === 'pendiente' && (
        <InvitacionLlamada
          nombreAgente={chat.call.requestedByName}
          onAceptar={() => responderInvitacion(true)}
          onRechazar={() => responderInvitacion(false)}
        />
      )}
```

- [ ] **Step 4: Cerrar el div nuevo y agregar el panel de llamada**

Buscar el final del componente — el `</div>` que cierra el contenedor raíz, justo antes de `);` y `}`:

```tsx
    </div>
  );
}
```

Reemplazar por:

```tsx
    </div>

    {chat.call?.status === 'activa' && (
      <div style={{ width: 420, flexShrink: 0, padding: 16, background: '#f8fafc' }}>
        <PanelLlamada
          estado={llamada.estado}
          error={llamada.error}
          micActivo={llamada.micActivo}
          compartiendoPantalla={llamada.compartiendoPantalla}
          remoteStream={llamada.remoteStream}
          onAlternarMicrofono={llamada.alternarMicrofono}
          onAlternarPantalla={llamada.alternarPantalla}
          onColgar={() => llamada.colgar('colgada')}
        />
      </div>
    )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "soporte-full-page"
```

Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add components/support/soporte-full-page.tsx
git commit -m "feat(llamadas): panel de llamada en /dashboard/soporte"
```

---

## Task 20: Wirear la consola de agentes

**Files:**
- Modify: `app/zero-tickets/page.tsx`

- [ ] **Step 1: Importar lo necesario**

Al principio del archivo, agregar:

```ts
import { PanelLlamada } from '@/components/support/panel-llamada';
import { useLlamada } from '@/lib/webrtc/useLlamada';
import { iniciarLlamada, type LlamadaDTO } from '@/lib/webrtc/senalizacion';
```

- [ ] **Step 2: Agregar estado para la llamada del ticket seleccionado**

Junto a los otros `useState` del componente (cerca de `const [messages, setMessages] = useState<Message[]>([]);`), agregar:

```ts
  const [call, setCall] = useState<LlamadaDTO | null>(null);
  const llamada = useLlamada('agent', call);
```

- [ ] **Step 3: Leer `call` de la respuesta de `loadMessages`**

Buscar la función `loadMessages`:

```ts
  async function loadMessages(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/messages`);
    if (res.ok) setMessages((await res.json()).messages);
  }
```

Reemplazar por:

```ts
  async function loadMessages(id: number) {
    const res = await fetch(`/api/zero-tickets/agent/tickets/${id}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setCall(data.call ?? null);
    }
  }
```

- [ ] **Step 4: Handler para iniciar la llamada**

Junto a las otras funciones de acción (cerca de `async function requestScreenshot`), agregar:

```ts
  async function startCall(id: number) {
    try {
      await iniciarLlamada(id);
      await loadMessages(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo iniciar la llamada.');
    }
  }
```

- [ ] **Step 5: Botón "Iniciar llamada" junto a "Pedir captura"**

Buscar:

```tsx
                <button onClick={() => requestScreenshot(selected.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Pedir captura
                </button>
```

Reemplazar por:

```tsx
                <button onClick={() => requestScreenshot(selected.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Pedir captura
                </button>
                <button
                  onClick={() => startCall(selected.id)}
                  disabled={call?.status === 'pendiente' || call?.status === 'activa'}
                  className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {call?.status === 'pendiente' ? 'Esperando respuesta…' : call?.status === 'activa' ? 'En llamada' : 'Iniciar llamada'}
                </button>
```

- [ ] **Step 6: Mostrar el panel de llamada cuando está activa**

Buscar el cierre del panel de mensajes del ticket seleccionado — el `<div className="flex-1 border rounded-lg bg-white flex flex-col">` que envuelve toda la conversación (línea 368 aproximadamente) — y envolverlo junto al panel de llamada. Reemplazar la apertura:

```tsx
      <div className="flex-1 border rounded-lg bg-white flex flex-col">
```

por:

```tsx
      <div className="flex-1 flex gap-4">
      <div className="flex-1 border rounded-lg bg-white flex flex-col min-w-0">
```

Y buscar el cierre correspondiente de ese mismo `<div>` — es el que viene justo antes de `{showManageModal && (` al final del archivo:

```tsx
      </div>

      {showManageModal && (
```

Reemplazar por:

```tsx
      </div>

      {call?.status === 'activa' && (
        <div style={{ width: 420 }} className="shrink-0">
          <PanelLlamada
            estado={llamada.estado}
            error={llamada.error}
            micActivo={llamada.micActivo}
            compartiendoPantalla={llamada.compartiendoPantalla}
            remoteStream={llamada.remoteStream}
            onAlternarMicrofono={llamada.alternarMicrofono}
            onAlternarPantalla={llamada.alternarPantalla}
            onColgar={() => llamada.colgar('colgada')}
          />
        </div>
      )}
      </div>

      {showManageModal && (
```

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "zero-tickets/page"
```

Expected: sin salida.

- [ ] **Step 8: Commit**

```bash
git add app/zero-tickets/page.tsx
git commit -m "feat(llamadas): boton de iniciar llamada y panel en la consola de agentes"
```

---

## Task 21: Verificación de punta a punta

No hay forma de probar el handshake WebRTC tramo a tramo — se verifica completo, con dos sesiones de navegador reales (una normal, una de incógnito logueada como agente).

- [ ] **Step 1: Levantar el servidor**

```bash
pnpm dev
```

- [ ] **Step 2: Preparación**

- Ventana 1 (normal): loguearse como cliente, ir a cualquier página del dashboard, abrir el chat flotante.
- Ventana 2 (incógnito): loguearse como agente, ir a `/zero-tickets`, seleccionar el ticket del cliente (crear uno mandando un mensaje desde la ventana 1 si no existe todavía).

- [ ] **Step 3: Llamada completa de punta a punta**

En la ventana 2, click "Iniciar llamada". En la ventana 1 debe aparecer el banner de invitación en menos de 2s (el poll es cada 1.5s). Click "Aceptar" — debe redirigir a `/dashboard/soporte` y, unos segundos después (negociación + ICE gathering), la ventana 2 debe mostrar el panel de llamada con `estado: activa`.

Expected: ambos lados en `estado: activa`, sin mensajes de error.

- [ ] **Step 4: Compartir y dejar de compartir pantalla desde ambos lados**

En cualquiera de las dos ventanas, click en el ícono de compartir pantalla, elegir una ventana/pestaña en el picker nativo. El otro lado debe ver el video en unos 1-2s. Click de nuevo para dejar de compartir — el video debe desaparecer del otro lado sin cortar la llamada. Repetir desde el otro lado.

Expected: funciona en ambas direcciones, sin recargar ni reconectar.

- [ ] **Step 5: Mute / unmute**

Click en el ícono de micrófono en cualquiera de los dos lados — el botón debe cambiar de color (gris → rojo). No hay forma de verificar el audio en silencio de manera automática; confirmar visualmente que el estado cambia y no rompe la conexión.

- [ ] **Step 6: Rechazar la invitación**

Iniciar una llamada nueva (Task 3 debe estar libre — colgar la anterior primero). En la ventana del cliente, click "Rechazar". La ventana del agente debe mostrar el botón como "Iniciar llamada" de nuevo (no "En llamada"), y el chat debe tener el mensaje de sistema "Llamada rechazada."

- [ ] **Step 7: Cerrar la pestaña de un lado**

Con una llamada activa, cerrar la pestaña del cliente. Del lado del agente: el navegador tarda unos segundos en detectar la pérdida de conexión (`connectionState` pasa a `disconnected`), y desde ahí hay 10s de gracia antes de cortar (`TIMEOUT_DESCONEXION_MS` en `useLlamada.ts`) — en total, hasta ~20s. El estado debe volver a `inactiva`, el botón a "Iniciar llamada", y el chat debe tener el mensaje "Llamada terminada · Xm Ys." con `endedReason: desconexion`.

- [ ] **Step 8: Negar el permiso de micrófono**

Antes de aceptar una invitación, revocar el permiso de micrófono del navegador para ese sitio (o denegarlo en el prompt). Expected: la llamada sigue conectando igual — llega a `estado: activa`, con un mensaje visible ("No se pudo activar el micrófono. La llamada sigue sin tu audio.") en vez de cortarse. El otro lado sigue recibiendo/mandando audio normalmente. El botón de colgar funciona en todo momento.

- [ ] **Step 9: Confirmar que la conexión es P2P, no relay**

Con ambas ventanas en la misma red (sin VPN), y con una llamada activa, abrir `chrome://webrtc-internals` en cualquiera de los dos navegadores. Buscar la sección de la conexión activa y el `selected candidate pair`. Confirmar que el tipo de candidato es `host` o `srflx` — **no** `relay`.

Expected: `host` o `srflx`. Si aparece `relay` sin que la red lo justifique (sin firewall corporativo de por medio), algo en la configuración de ICE está mal.

- [ ] **Step 10: Commit final si hubo ajustes durante la verificación**

```bash
git add -A
git commit -m "fix(llamadas): ajustes tras verificacion manual de punta a punta"
```

(Solo si Step 3-9 encontraron algo que corregir. Si todo pasó a la primera, no hay nada que commitear acá.)

---

## Fuera de alcance (recordatorio, ver spec)

Grabación, llamadas grupales, cámara, llamadas iniciadas por el cliente, estadísticas de calidad, chat dentro del panel de llamada.
