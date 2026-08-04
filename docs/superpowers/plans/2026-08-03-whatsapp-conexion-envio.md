# WhatsApp — Conexión y Envío (vera → crm-escolar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada team de vera puede conectar su propio WhatsApp Business (vía la API pública de `crm-escolar`, deployada en `https://crm.zero.com.do`) y vera puede enviar mensajes de texto usando ese número, y recibir entrantes por webhook verificado.

**Architecture:** vera es un integrador de `crm-escolar/api/v1`. Un cliente HTTP tipado (`lib/whatsapp/client.ts`, mismo patrón que `lib/ecf-api/client.ts`) habla con esa API. Las credenciales por team (`apiKey`, `webhookSecret`) se guardan cifradas (AES-256-GCM, reusando `lib/crypto/cert.ts`) en una tabla nueva `whatsapp_config`. Los mensajes entrantes se persisten en `whatsapp_mensajes` sin UI de inbox (fuera de alcance).

**Tech Stack:** Next.js App Router (route handlers), Drizzle ORM + Postgres (Neon), Node `crypto` nativo, MUI, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-whatsapp-conexion-envio-design.md`

---

### Task 1: Esquema de datos — `whatsapp_config` y `whatsapp_mensajes`

**Files:**
- Modify: `lib/db/schema.ts` (agregar al final del archivo, después de la última tabla)
- Create: `lib/db/migrations/0095_whatsapp_config.sql`
- Create: `scripts/apply-migration-0095.ts`

- [ ] **Step 1: Agregar las tablas a `lib/db/schema.ts`**

```ts
// ── WhatsApp — conexión por negocio (vía crm-escolar, API pública /api/v1) ────
export const whatsappConfig = pgTable('whatsapp_config', {
  id:       serial('id').primaryKey(),
  teamId:   integer('team_id').notNull().unique().references(() => teams.id),
  negocioId: text('negocio_id').notNull(),

  apiKeyCiphered: text('api_key_ciphered').notNull(),
  apiKeyIv:       text('api_key_iv').notNull(),
  apiKeyAuthTag:  text('api_key_auth_tag').notNull(),

  webhookSecretCiphered: text('webhook_secret_ciphered'),
  webhookSecretIv:       text('webhook_secret_iv'),
  webhookSecretAuthTag:  text('webhook_secret_auth_tag'),

  conectado:      boolean('conectado').notNull().default(false),
  numeroWhatsapp: text('numero_whatsapp'),

  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
});

export const whatsappMensajes = pgTable('whatsapp_mensajes', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  telefono:       text('telefono').notNull(),
  nombreContacto: text('nombre_contacto'),
  texto:          text('texto'),
  tipo:           text('tipo').notNull(),
  conversationId: text('conversation_id').notNull(),
  messageId:      text('message_id').notNull().unique(),
  recibidoEn:     timestamp('recibido_en').notNull().defaultNow(),
}, (t) => ({
  teamIdx: index('whatsapp_mensajes_team_idx').on(t.teamId, t.recibidoEn),
}));
```

Verificar que `index` ya está importado en el archivo (se usa en otras tablas, ej. línea con `admin_escolar_periodos_team_idx`); si no, agregar `index` al import de `drizzle-orm/pg-core` al tope del archivo.

- [ ] **Step 2: Crear la migración SQL**

`lib/db/migrations/0095_whatsapp_config.sql`:

```sql
-- Conexión WhatsApp por negocio, vía la API pública de crm-escolar
-- (docs/superpowers/specs/2026-08-03-whatsapp-conexion-envio-design.md).
-- Credenciales cifradas AES-256-GCM (mismo patrón que cert_p12_* en teams).

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id                        serial PRIMARY KEY,
  team_id                   integer NOT NULL UNIQUE REFERENCES teams(id),
  negocio_id                text NOT NULL,

  api_key_ciphered          text NOT NULL,
  api_key_iv                text NOT NULL,
  api_key_auth_tag          text NOT NULL,

  webhook_secret_ciphered   text,
  webhook_secret_iv         text,
  webhook_secret_auth_tag   text,

  conectado                 boolean NOT NULL DEFAULT false,
  numero_whatsapp           text,

  creado_en                 timestamp NOT NULL DEFAULT now(),
  actualizado_en            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id                serial PRIMARY KEY,
  team_id           integer NOT NULL REFERENCES teams(id),
  telefono          text NOT NULL,
  nombre_contacto   text,
  texto             text,
  tipo              text NOT NULL,
  conversation_id   text NOT NULL,
  message_id        text NOT NULL UNIQUE,
  recibido_en       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_mensajes_team_idx
  ON whatsapp_mensajes (team_id, recibido_en DESC);
```

- [ ] **Step 3: Script para aplicar la migración (mismo patrón que `apply-migration-0092.ts`)**

`scripts/apply-migration-0095.ts`:

```ts
import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

(async () => {
  const migration = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0095_whatsapp_config.sql'),
    'utf-8',
  );
  await sql.unsafe(migration);
  console.log('✓ Migración 0095 aplicada (whatsapp_config + whatsapp_mensajes).');
  await sql.end();
})();
```

- [ ] **Step 4: Aplicar contra la DB de dev**

Run: `npx tsx scripts/apply-migration-0095.ts`
Expected: `✓ Migración 0095 aplicada (whatsapp_config + whatsapp_mensajes).`

---

### Task 2: Cliente HTTP de la API de crm-escolar

**Files:**
- Create: `lib/whatsapp/client.ts`
- Test: `tests/unit/whatsapp-client.test.ts`

- [ ] **Step 1: Escribir el test (falla porque el archivo no existe)**

```ts
import { test, describe, vi, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';

describe('lib/whatsapp/client', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.CRM_ZERO_API_URL = 'https://crm.zero.com.do/api/v1';
    process.env.CRM_ZERO_PARTNER_KEY = 'partner-test-key';
  });
  afterEach(() => { global.fetch = realFetch; vi.resetModules(); });

  test('enviarMensaje devuelve messageId/conversationId en 201', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'wamid.1', conversationId: 'conv-1' }),
    }) as unknown as typeof fetch;
    const { enviarMensaje } = await import('@/lib/whatsapp/client');
    const r = await enviarMensaje('sk_live_abc', '+18095551234', 'hola');
    assert.equal(r.messageId, 'wamid.1');
    assert.equal(r.conversationId, 'conv-1');
  });

  test('enviarMensaje lanza WhatsAppApiError con el status HTTP en error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Fuera de ventana de 24h' }),
    }) as unknown as typeof fetch;
    const { enviarMensaje, WhatsAppApiError } = await import('@/lib/whatsapp/client');
    await assert.rejects(
      () => enviarMensaje('sk_live_abc', '+18095551234', 'hola'),
      (err: unknown) => err instanceof WhatsAppApiError && err.status === 422,
    );
  });

  test('crearNegocio lanza 503 si falta CRM_ZERO_PARTNER_KEY', async () => {
    delete process.env.CRM_ZERO_PARTNER_KEY;
    const { crearNegocio, WhatsAppApiError } = await import('@/lib/whatsapp/client');
    await assert.rejects(
      () => crearNegocio('Colegio X', 'colegio'),
      (err: unknown) => err instanceof WhatsAppApiError && err.status === 503,
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/unit/whatsapp-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/whatsapp/client'`

- [ ] **Step 3: Implementar el cliente**

`lib/whatsapp/client.ts`:

```ts
/**
 * Cliente HTTP para la API pública de crm-escolar (WhatsApp por negocio).
 * Contrato: crm-escolar/docs/api-publica.md. Todas las llamadas server-side;
 * las keys nunca salen al browser.
 */

function baseUrl() {
  return process.env.CRM_ZERO_API_URL!.replace(/\/+$/, '');
}

export class WhatsAppApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new WhatsAppApiError(res.status, data.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface CrearNegocioResult {
  ok: boolean;
  negocioId: string;
  slug: string;
  apiKey: string;
  connectUrl: string;
}

/** Crea el negocio del team en crm-escolar. Requiere CRM_ZERO_PARTNER_KEY (server-side). */
export async function crearNegocio(
  nombre: string,
  vertical: 'colegio' | 'clinica' | 'general',
): Promise<CrearNegocioResult> {
  const partnerKey = process.env.CRM_ZERO_PARTNER_KEY;
  if (!partnerKey) {
    throw new WhatsAppApiError(503, 'CRM_ZERO_PARTNER_KEY no configurado');
  }
  const res = await fetch(`${baseUrl()}/negocios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-partner-key': partnerKey },
    body: JSON.stringify({ nombre, vertical }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new WhatsAppApiError(res.status, data.error ?? res.statusText);
  }
  return res.json();
}

export interface ConnectUrlResult {
  whatsappConnected: boolean;
  displayPhoneNumber?: string;
  connectUrl: string;
}

/** Genera/renueva el link de conexión de Meta (dura 24h) para un negocio ya creado. */
export function generarConnectUrl(apiKey: string): Promise<ConnectUrlResult> {
  return request<ConnectUrlResult>('POST', '/connect-url', apiKey);
}

export interface EnviarMensajeResult {
  messageId: string;
  conversationId: string;
}

export function enviarMensaje(apiKey: string, to: string, text: string): Promise<EnviarMensajeResult> {
  return request<EnviarMensajeResult>('POST', '/messages', apiKey, { to, text });
}

export interface RegistrarWebhookResult {
  ok: boolean;
  id: string;
  secret: string;
}

export function registrarWebhook(apiKey: string, url: string): Promise<RegistrarWebhookResult> {
  return request<RegistrarWebhookResult>('POST', '/webhooks', apiKey, { url });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/unit/whatsapp-client.test.ts`
Expected: PASS (3 tests)

---

### Task 3: Verificación de firma del webhook (función pura, testeable sin servidor)

**Files:**
- Create: `lib/whatsapp/signature.ts`
- Test: `tests/unit/whatsapp-signature.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { verificarFirma } from '@/lib/whatsapp/signature';

describe('verificarFirma', () => {
  const secret = 'un-secret-de-prueba';
  const rawBody = JSON.stringify({ event: 'message.received', from: '18095559999', text: 'hola' });

  test('acepta una firma HMAC-SHA256 válida', () => {
    const firmaValida = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody, secret, firmaValida), true);
  });

  test('rechaza una firma con secret incorrecto', () => {
    const firmaOtroSecret = 'sha256=' + createHmac('sha256', 'otro-secret').update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody, secret, firmaOtroSecret), false);
  });

  test('rechaza si el body fue alterado después de firmar', () => {
    const firma = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody + 'x', secret, firma), false);
  });

  test('rechaza si no hay header de firma', () => {
    assert.equal(verificarFirma(rawBody, secret, null), false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/whatsapp-signature.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`lib/whatsapp/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

/** Verifica `x-crm-signature: sha256=<hex>` de un webhook de crm-escolar. */
export function verificarFirma(rawBody: string, secret: string, headerFirma: string | null): boolean {
  if (!headerFirma) return false;
  const esperada = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (esperada.length !== headerFirma.length) return false;
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(headerFirma));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/whatsapp-signature.test.ts`
Expected: PASS (4 tests)

---

### Task 4: Acceso a `whatsapp_config` por team (cifrado con `lib/crypto/cert.ts`)

**Files:**
- Create: `lib/whatsapp/config.ts`

- [ ] **Step 1: Implementar (sin test unitario — requiere DB; se cubre en el checklist de integración manual del Task 7)**

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig } from '@/lib/db/schema';
import { encryptField, decryptField } from '@/lib/crypto/cert';

export interface WhatsAppTeamConfig {
  negocioId: string;
  apiKey: string;
  webhookSecret: string | null;
  conectado: boolean;
  numeroWhatsapp: string | null;
}

export async function getWhatsAppConfig(teamId: number): Promise<WhatsAppTeamConfig | null> {
  const [row] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
  if (!row) return null;
  return {
    negocioId: row.negocioId,
    apiKey: decryptField({ ciphered: row.apiKeyCiphered, iv: row.apiKeyIv, authTag: row.apiKeyAuthTag }),
    webhookSecret: row.webhookSecretCiphered
      ? decryptField({ ciphered: row.webhookSecretCiphered, iv: row.webhookSecretIv!, authTag: row.webhookSecretAuthTag! })
      : null,
    conectado: row.conectado,
    numeroWhatsapp: row.numeroWhatsapp,
  };
}

export async function crearWhatsAppConfig(teamId: number, negocioId: string, apiKey: string) {
  const enc = encryptField(apiKey);
  await db.insert(whatsappConfig).values({
    teamId,
    negocioId,
    apiKeyCiphered: enc.ciphered,
    apiKeyIv: enc.iv,
    apiKeyAuthTag: enc.authTag,
  });
}

export async function guardarWebhookSecret(teamId: number, secret: string) {
  const enc = encryptField(secret);
  await db.update(whatsappConfig).set({
    webhookSecretCiphered: enc.ciphered,
    webhookSecretIv: enc.iv,
    webhookSecretAuthTag: enc.authTag,
    actualizadoEn: new Date(),
  }).where(eq(whatsappConfig.teamId, teamId));
}

export async function actualizarEstadoConexion(teamId: number, conectado: boolean, numeroWhatsapp: string | null) {
  await db.update(whatsappConfig).set({
    conectado,
    numeroWhatsapp,
    actualizadoEn: new Date(),
  }).where(eq(whatsappConfig.teamId, teamId));
}
```

---

### Task 5: Envío saliente con mapeo de errores (`enviarWhatsApp`)

**Files:**
- Create: `lib/whatsapp/enviar.ts`
- Test: `tests/unit/whatsapp-enviar.test.ts`

- [ ] **Step 1: Escribir el test (mockea `lib/whatsapp/config` y `lib/whatsapp/client`)**

```ts
import { test, describe, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';

vi.mock('@/lib/whatsapp/config', () => ({
  getWhatsAppConfig: vi.fn(),
}));
vi.mock('@/lib/whatsapp/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/client')>('@/lib/whatsapp/client');
  return { ...actual, enviarMensaje: vi.fn() };
});

import { getWhatsAppConfig } from '@/lib/whatsapp/config';
import { enviarMensaje, WhatsAppApiError } from '@/lib/whatsapp/client';
import { enviarWhatsApp, WhatsAppNoConectadoError, WhatsAppFueraDeVentanaError } from '@/lib/whatsapp/enviar';

describe('enviarWhatsApp', () => {
  afterEach(() => vi.clearAllMocks());

  test('lanza WhatsAppNoConectadoError si el team no tiene config', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue(null);
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('lanza WhatsAppNoConectadoError si conectado=false', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: false, numeroWhatsapp: null,
    });
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('envía y devuelve messageId cuando está conectado', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockResolvedValue({ messageId: 'wamid.1', conversationId: 'c1' });
    const r = await enviarWhatsApp(1, '+18095551234', 'hola');
    assert.equal(r.messageId, 'wamid.1');
  });

  test('mapea 422 a WhatsAppFueraDeVentanaError', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(422, 'Fuera de ventana de 24h'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppFueraDeVentanaError);
  });

  test('mapea 409 a WhatsAppNoConectadoError', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(409, 'no conectado'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('reintenta una vez en 429 y propaga si vuelve a fallar', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(429, 'rate limit'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppApiError);
    assert.equal(vi.mocked(enviarMensaje).mock.calls.length, 2); // intento original + 1 reintento
  });
});
```

- [ ] **Step 2: Correr y verificar que falla** (módulo no existe)

Run: `npx vitest run tests/unit/whatsapp-enviar.test.ts`

- [ ] **Step 3: Implementar**

`lib/whatsapp/enviar.ts`:

```ts
import { getWhatsAppConfig } from './config';
import { enviarMensaje, WhatsAppApiError, type EnviarMensajeResult } from './client';

export class WhatsAppNoConectadoError extends Error {
  constructor() {
    super('WhatsApp no está conectado para este negocio.');
    this.name = 'WhatsAppNoConectadoError';
  }
}

export class WhatsAppFueraDeVentanaError extends Error {
  constructor(detalle: string) {
    super(detalle);
    this.name = 'WhatsAppFueraDeVentanaError';
  }
}

/** Espera `ms` milisegundos. Extraído para poder mockear en tests si hiciera falta. */
function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enviarWhatsApp(
  teamId: number,
  telefono: string,
  texto: string,
): Promise<EnviarMensajeResult> {
  const config = await getWhatsAppConfig(teamId);
  if (!config || !config.conectado) {
    throw new WhatsAppNoConectadoError();
  }

  try {
    return await enviarMensaje(config.apiKey, telefono, texto);
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      if (err.status === 409) throw new WhatsAppNoConectadoError();
      if (err.status === 422) throw new WhatsAppFueraDeVentanaError(err.message);
      if (err.status === 429) {
        await esperar(2000);
        return await enviarMensaje(config.apiKey, telefono, texto);
      }
    }
    throw err;
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/whatsapp-enviar.test.ts`
Expected: PASS (6 tests)

---

### Task 6: Rutas API — conectar, estado, webhook

**Files:**
- Create: `app/api/whatsapp/conectar/route.ts`
- Create: `app/api/whatsapp/estado/route.ts`
- Create: `app/api/whatsapp/webhook/[teamId]/route.ts`

- [ ] **Step 1: `POST /api/whatsapp/conectar`** — crea el negocio (si no existe) y registra el webhook.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams, whatsappConfig } from '@/lib/db/schema';
import { crearNegocio, registrarWebhook, WhatsAppApiError } from '@/lib/whatsapp/client';
import { crearWhatsAppConfig, guardarWebhookSecret } from '@/lib/whatsapp/config';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const rl = await rateLimitDb(`whatsapp_conectar:${teamId}`, 5, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
    }

    const [existing] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
    if (existing) {
      return NextResponse.json({ error: 'Este negocio ya tiene WhatsApp configurado' }, { status: 409 });
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    let negocio;
    try {
      negocio = await crearNegocio(team.name, team.posEscolarHabilitado ? 'colegio' : 'general');
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    await crearWhatsAppConfig(teamId, negocio.negocioId, negocio.apiKey);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/+$/, '');
    try {
      const webhook = await registrarWebhook(negocio.apiKey, `${appUrl}/api/whatsapp/webhook/${teamId}`);
      await guardarWebhookSecret(teamId, webhook.secret);
    } catch (err) {
      // El negocio y la apiKey ya quedaron guardados — el webhook se puede
      // reintentar registrar después desde /api/whatsapp/estado si esto falla.
      console.error('[POST /api/whatsapp/conectar] registrarWebhook', err);
    }

    logAudit({ teamId, userId: user.id, actor: user.email, action: 'WHATSAPP_CONECTAR', ip: getIp(request) });

    return NextResponse.json({ ok: true, connectUrl: negocio.connectUrl });
  } catch (err) {
    console.error('[POST /api/whatsapp/conectar]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

Nota: `AuditAction` en `lib/audit.ts` es un union type — agregar `'WHATSAPP_CONECTAR'` a ese union como parte de este step (revisar `lib/audit.ts:24-63` y sumar el literal).

- [ ] **Step 2: `POST /api/whatsapp/estado`** — consulta/renueva `connect-url` y refresca `conectado`/`numeroWhatsapp`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getWhatsAppConfig, actualizarEstadoConexion } from '@/lib/whatsapp/config';
import { generarConnectUrl, WhatsAppApiError } from '@/lib/whatsapp/client';

export async function POST(_request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const config = await getWhatsAppConfig(teamId);
    if (!config) {
      return NextResponse.json({ configurado: false });
    }

    let estado;
    try {
      estado = await generarConnectUrl(config.apiKey);
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    await actualizarEstadoConexion(teamId, estado.whatsappConnected, estado.displayPhoneNumber ?? null);

    return NextResponse.json({
      configurado: true,
      conectado: estado.whatsappConnected,
      numeroWhatsapp: estado.displayPhoneNumber ?? null,
      connectUrl: estado.connectUrl,
    });
  } catch (err) {
    console.error('[POST /api/whatsapp/estado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `POST /api/whatsapp/webhook/[teamId]`** — receptor firmado.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig, whatsappMensajes } from '@/lib/db/schema';
import { verificarFirma } from '@/lib/whatsapp/signature';
import { decryptField } from '@/lib/crypto/cert';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId: teamIdParam } = await params;
  const teamId = parseInt(teamIdParam, 10);
  if (!Number.isFinite(teamId)) {
    return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });
  }

  const [config] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
  if (!config || !config.webhookSecretCiphered) {
    return NextResponse.json({ error: 'Team sin webhook configurado' }, { status: 404 });
  }

  const rawBody = await request.text();
  const secret = decryptField({
    ciphered: config.webhookSecretCiphered,
    iv: config.webhookSecretIv!,
    authTag: config.webhookSecretAuthTag!,
  });

  const firmaValida = verificarFirma(rawBody, secret, request.headers.get('x-crm-signature'));
  if (!firmaValida) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  // Responder rápido — la escritura a DB va después, como pide la API.
  const respuesta = NextResponse.json({ ok: true });

  const evento = JSON.parse(rawBody);
  if (evento.event === 'message.received') {
    await db.insert(whatsappMensajes).values({
      teamId,
      telefono: evento.from,
      nombreContacto: evento.name ?? null,
      texto: evento.text ?? null,
      tipo: evento.type ?? 'texto',
      conversationId: evento.conversationId,
      messageId: evento.messageId,
    }).onConflictDoNothing({ target: whatsappMensajes.messageId });
  }

  return respuesta;
}
```

Nota: Next.js espera la respuesta antes de continuar ejecución del handler solo si se hace `return` — en un route handler no hay forma de "responder y seguir ejecutando" como en Express (`res.sendStatus(200)` seguido de más código). Aquí se prioriza la corrección (guardar antes de responder) sobre la latencia — la API de crm-escolar tiene timeout de 10s, un insert a Postgres corre muy por debajo de eso. Si en producción esto genera timeouts, mover el insert a un job asíncrono (`after()` de Next.js) sería el siguiente paso — no incluido en este spec.

---

### Task 7: Tarjeta UI en Configuración → Canales

**Files:**
- Create: `app/(dashboard)/dashboard/configuracion/WhatsAppCard.tsx`
- Modify: `app/(dashboard)/dashboard/configuracion/page.tsx`

- [ ] **Step 1: Crear el componente**

`app/(dashboard)/dashboard/configuracion/WhatsAppCard.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { MessageCircle, CheckCircle } from 'lucide-react';

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };
const cardHeaderSx = { px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 };
const cardContentSx = { px: 3, py: 3 };

interface Estado {
  configurado: boolean;
  conectado?: boolean;
  numeroWhatsapp?: string | null;
  connectUrl?: string;
}

export function WhatsAppCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ configurado: false });

  async function refrescarEstado() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/estado', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo consultar el estado.'); return; }
      setEstado(data);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refrescarEstado().finally(() => setLoading(false)); }, []);

  async function conectar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/conectar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo iniciar la conexión.'); return; }
      window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function reconectar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/estado', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo generar el link.'); return; }
      setEstado(data);
      if (data.connectUrl) window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={cardSx}>
      <Box sx={cardHeaderSx}>
        <MessageCircle size={16} color="#0d9488" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>WhatsApp Business</Typography>
      </Box>
      <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          Conecta el WhatsApp de tu negocio para enviar facturas y recordatorios de cobro directo por WhatsApp.
        </Typography>

        {error && <Alert severity="error" sx={{ borderRadius: '8px' }}>{error}</Alert>}

        {loading ? (
          <CircularProgress size={24} sx={{ color: '#0d9488' }} />
        ) : !estado.configurado ? (
          <Button variant="contained" disableElevation onClick={conectar} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, alignSelf: 'flex-start' }}>
            Conectar WhatsApp
          </Button>
        ) : estado.conectado ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#15803d' }}>
            <CheckCircle size={18} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Conectado: {estado.numeroWhatsapp}
            </Typography>
          </Box>
        ) : (
          <Button variant="outlined" onClick={reconectar} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', alignSelf: 'flex-start' }}>
            Verificar conexión
          </Button>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Embeber en la página de configuración**

Modificar `app/(dashboard)/dashboard/configuracion/page.tsx`:
1. Agregar el import junto a `EquipoCard`:

```ts
import { WhatsAppCard } from './WhatsAppCard';
```

2. Agregar `<WhatsAppCard />` justo antes de `<EquipoCard />` (línea ~651-652):

```tsx
        {/* WhatsApp Business */}
        <WhatsAppCard />

        {/* Equipo y permisos */}
        <EquipoCard />
```

---

### Task 8: Variables de entorno

**Files:**
- Modify: `.env.example`
- Modify: `lib/env.ts` (opcional — no agregar a `REQUIRED_ENV_VARS`: si falta, `crearNegocio` ya lanza 503 con mensaje claro; agregarlas a `REQUIRED_ENV_VARS` bloquearía el arranque completo de vera en dev/prod solo por esta feature nueva, lo cual es desproporcionado para un canal opcional)

- [ ] **Step 1: Agregar a `.env.example`**

```
# WhatsApp — API pública de crm-escolar (docs/superpowers/specs/2026-08-03-whatsapp-conexion-envio-design.md)
CRM_ZERO_API_URL=https://crm.zero.com.do/api/v1
CRM_ZERO_PARTNER_KEY=
```

---

### Task 9: Verificación final

- [ ] **Step 1: Correr toda la suite unitaria**

Run: `npm run test:unit`
Expected: todos los tests pasan, incluidos los 3 archivos nuevos (`whatsapp-client`, `whatsapp-signature`, `whatsapp-enviar`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a los archivos de este plan.

- [ ] **Step 3: Checklist manual de integración (requiere `CRM_ZERO_PARTNER_KEY` real y un team de prueba)**

1. Configurar `CRM_ZERO_PARTNER_KEY` en `.env.local` con la key generada en `crm-escolar`.
2. Entrar a Configuración → tarjeta "WhatsApp Business" → "Conectar WhatsApp".
3. Verificar que se crea la fila en `whatsapp_config` (negocioId + apiKey cifrada).
4. Verificar que se abre el popup de Meta con el QR.
5. Escanear con un WhatsApp Business de prueba.
6. Volver a la tarjeta, click "Verificar conexión" → debe mostrar "Conectado: +...".
7. Desde una consola: `enviarWhatsApp(teamId, '+numero-que-escribió-primero', 'prueba')` → confirmar que llega al teléfono.
8. Escribir "hola" desde ese teléfono → confirmar que aparece una fila en `whatsapp_mensajes`.

No automatizable sin un número de WhatsApp de prueba real — queda como checklist manual, tal como indica el spec.

---

## Self-review

**Cobertura del spec:** Objetivo 1 (conectar) → Task 6/7. Objetivo 2 (auto-crear negocio) → Task 6 Step 1. Objetivo 3 (enviar) → Task 5. Objetivo 4 (recibir) → Task 6 Step 3. Modelo de datos → Task 1. Cifrado reusado → Task 4. Manejo de errores 409/422/429/503 → Task 5 + Task 6. Fuera de alcance (inbox, media, disparo automático, polling) — respetado, no se crea código para ninguno de esos.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `WhatsAppApiError` (Task 2) reusado igual en Task 5 y Task 6. `WhatsAppTeamConfig` (Task 4) consumido igual en Task 5. `crearWhatsAppConfig`/`guardarWebhookSecret`/`actualizarEstadoConexion` (Task 4) llamados con la misma firma en Task 6.
