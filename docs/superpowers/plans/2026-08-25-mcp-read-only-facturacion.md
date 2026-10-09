# MCP de solo lectura (clientes, facturas, facturas recurrentes, cuentas por cobrar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer clientes, facturas, facturas recurrentes y cuentas por cobrar a una AI externa (ChatGPT, Claude u otro cliente MCP) vía un endpoint MCP de solo lectura, autenticado por API key, que nunca toca la base de datos directamente — solo llama a rutas REST propias.

**Architecture:** (1) Un guard `requireApiKey` que valida `Authorization: Bearer emdo_xxx` contra la tabla `apiKeys` existente. (2) Rutas REST nuevas y aisladas bajo `app/api/mcp/v1/*` (solo GET, reusan el mismo guard, escopadas por el `teamId` del key). (3) Un endpoint MCP en `app/api/mcp/route.ts` (paquete `mcp-handler`) cuyas 7 tools hacen `fetch()` HTTP a esas rutas hermanas, reenviando el mismo Bearer key.

**Tech Stack:** Next.js 15 (App Router, route handlers con `params: Promise<...>`), Drizzle ORM, PostgreSQL, TypeScript, `bcryptjs`, `zod`, `mcp-handler` (nuevo), Vitest.

Spec de referencia: `docs/superpowers/specs/2026-08-25-mcp-read-only-facturacion-design.md`

---

## Convenciones a seguir (ya existentes en el repo — no inventar otras)

- Rutas Next 15: `type Ctx = { params: Promise<{ id: string }> }` y `const { id } = await params;`.
- Respuestas de error: `NextResponse.json({ error: '...' }, { status: N })`.
- Import de DB: `import { db } from '@/lib/db/drizzle';`.
- Hash de keys: `bcryptjs` (no `bcrypt` nativo) — ya usado en `app/api/api-keys/route.ts`.
- Tests: Vitest, `tests/unit/*.test.ts`, alias `@/`, mocks inline de `@/lib/db/drizzle` vía `vi.mock` (ver `tests/unit/inventario-agrupado.test.ts` como referencia de estilo).

---

### Task 1: Guard de API key

**Files:**
- Create: `lib/auth/api-key-guard.ts`
- Test: `tests/unit/api-key-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/api-key-guard.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const filaKey: {
  id: number; teamId: number; keyHash: string; permisos: string;
  revokedAt: Date | null; expiresAt: Date | null;
} = {
  id: 1, teamId: 42, keyHash: '', permisos: 'read', revokedAt: null, expiresAt: null,
};

let updateSetLlamado: unknown = null;

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([filaKey]),
        }),
      }),
    }),
    update: () => ({
      set: (v: unknown) => { updateSetLlamado = v; return { where: () => Promise.resolve() }; },
    }),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: (raw: string) => Promise.resolve(raw === 'emdo_valida'),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');

function reqCon(auth?: string) {
  return new NextRequest('http://localhost/api/mcp/v1/clientes', {
    headers: auth ? { Authorization: auth } : {},
  });
}

describe('requireApiKey', () => {
  it('sin header Authorization → 401', async () => {
    const r = await requireApiKey(reqCon());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it('header sin prefijo Bearer → 401', async () => {
    const r = await requireApiKey(reqCon('emdo_valida'));
    expect(r.ok).toBe(false);
  });

  it('key correcta y con permiso de lectura → ok con teamId', async () => {
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.teamId).toBe(42);
    expect(updateSetLlamado).toBeTruthy();
  });

  it('key con hash que no coincide → 401', async () => {
    const r = await requireApiKey(reqCon('Bearer emdo_otra'));
    expect(r.ok).toBe(false);
  });

  it('key revocada → 401 con el mismo mensaje que una key inválida', async () => {
    filaKey.revokedAt = new Date();
    const r1 = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.revokedAt = null;
    const r2 = await requireApiKey(reqCon('Bearer emdo_noexiste'));
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok && !r2.ok) {
      const b1 = await r1.response.clone().json();
      const b2 = await r2.response.clone().json();
      expect(b1.error).toBe(b2.error);
    }
  });

  it('key expirada → 401', async () => {
    filaKey.expiresAt = new Date('2020-01-01');
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.expiresAt = null;
    expect(r.ok).toBe(false);
  });

  it('permisos sin capacidad de lectura → 401', async () => {
    filaKey.permisos = 'ninguno';
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.permisos = 'read';
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api-key-guard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/api-key-guard'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/auth/api-key-guard.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';

const PERMISOS_CON_LECTURA = ['read', 'write', 'admin'];

/** Puro: dado el valor de `permisos` de una key, ¿alcanza para leer? */
export function permiteLectura(permisos: string): boolean {
  return PERMISOS_CON_LECTURA.includes(permisos);
}

const MENSAJE_401 = 'API key inválida o sin permiso de lectura';

function rechazo() {
  return { ok: false as const, response: NextResponse.json({ error: MENSAJE_401 }, { status: 401 }) };
}

export type ApiKeyAuthOk = { ok: true; teamId: number; apiKeyId: number };
export type ApiKeyAuthErr = { ok: false; response: NextResponse };

/**
 * Valida `Authorization: Bearer emdo_xxx` contra `apiKeys`. Mismo mensaje de
 * error para key ausente, mal formada, inexistente, revocada, expirada o sin
 * permiso de lectura — no delatar cuál caso fue para no ayudar a adivinar keys.
 */
export async function requireApiKey(req: NextRequest): Promise<ApiKeyAuthOk | ApiKeyAuthErr> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return rechazo();
  const rawKey = header.slice('Bearer '.length).trim();
  if (!rawKey.startsWith('emdo_')) return rechazo();

  const keyPrefix = rawKey.slice(0, 12);

  const [fila] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, keyPrefix))
    .limit(1);

  if (!fila) return rechazo();
  if (fila.revokedAt) return rechazo();
  if (fila.expiresAt && fila.expiresAt.getTime() < Date.now()) return rechazo();
  if (!permiteLectura(fila.permisos)) return rechazo();

  const coincide = await bcrypt.compare(rawKey, fila.keyHash);
  if (!coincide) return rechazo();

  // Fire-and-forget: no bloquear la respuesta por esto.
  void db.update(apiKeys).set({ ultimoUsoAt: new Date() })
    .where(and(eq(apiKeys.id, fila.id))).catch(() => {});

  return { ok: true, teamId: fila.teamId, apiKeyId: fila.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/api-key-guard.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth/api-key-guard.ts tests/unit/api-key-guard.test.ts
git commit -m "feat(mcp): guard de autenticación por API key de solo lectura"
```

---

### Task 2: `/api/mcp/v1/clientes` (lista + detalle)

**Files:**
- Create: `app/api/mcp/v1/clientes/route.ts`
- Create: `app/api/mcp/v1/clientes/[id]/route.ts`
- Test: `tests/unit/mcp-v1-clientes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/mcp-v1-clientes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({
  requireApiKey: vi.fn(),
}));

const clientesFixture = [
  { id: 1, teamId: 42, razonSocial: 'Colegio ABC', rnc: '101', email: 'a@x.com' },
];

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({ offset: () => Promise.resolve(clientesFixture) }),
          }),
          limit: () => Promise.resolve(clientesFixture),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/clientes/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/clientes/[id]/route');

describe('GET /api/mcp/v1/clientes', () => {
  it('sin key válida → 401, no llega a la DB', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'x' }), { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/clientes'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista de clientes', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/clientes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientes).toEqual(clientesFixture);
  });
});

describe('GET /api/mcp/v1/clientes/[id]', () => {
  it('con key válida → 200 y el cliente', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/clientes/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cliente).toEqual(clientesFixture[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-v1-clientes.test.ts`
Expected: FAIL — módulos de ruta no existen

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/mcp/v1/clientes/route.ts
/**
 * GET /api/mcp/v1/clientes — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condicion = q
    ? and(
        eq(clients.teamId, teamId),
        or(
          ilike(clients.razonSocial, `%${q}%`),
          ilike(clients.rnc, `%${q}%`),
          ilike(clients.email, `%${q}%`),
        ),
      )
    : eq(clients.teamId, teamId);

  const clientes = await db
    .select()
    .from(clients)
    .where(condicion)
    .orderBy(clients.razonSocial)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ clientes });
}
```

```typescript
// app/api/mcp/v1/clientes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const [cliente] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, Number(id)), eq(clients.teamId, teamId)))
    .limit(1);

  if (!cliente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ cliente });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-v1-clientes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/v1/clientes tests/unit/mcp-v1-clientes.test.ts
git commit -m "feat(mcp): rutas de solo lectura /api/mcp/v1/clientes"
```

---

### Task 3: `/api/mcp/v1/facturas` (lista + detalle)

**Files:**
- Create: `app/api/mcp/v1/facturas/route.ts`
- Create: `app/api/mcp/v1/facturas/[id]/route.ts`
- Test: `tests/unit/mcp-v1-facturas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/mcp-v1-facturas.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const facturaFixture = {
  id: 9, teamId: 42, encf: 'E310000000009', codigo: 'F-2026-1', tipoEcf: '31',
  estado: 'ACEPTADO', estadoPago: 'PENDIENTE', clientId: 1,
  rncComprador: '101', razonSocialComprador: 'Colegio ABC', emailComprador: 'a@x.com',
  montoTotal: 500000, totalItbis: 90000, totalRetenciones: 0, tipoPago: 2,
  fechaEmision: new Date('2026-08-01'), fechaLimitePago: '2026-08-06',
  dependienteId: null, dependienteNombre: null, origenRecurrenteId: null,
  periodoRecurrente: null, createdAt: new Date(), updatedAt: new Date(),
};

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([facturaFixture]) }) }),
          limit: () => Promise.resolve([facturaFixture]),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/facturas/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/facturas/[id]/route');

describe('GET /api/mcp/v1/facturas', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista de facturas', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas?estado=PENDIENTE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturas).toHaveLength(1);
    expect(body.facturas[0].encf).toBe('E310000000009');
  });
});

describe('GET /api/mcp/v1/facturas/[id]', () => {
  it('con key válida → 200 y la factura', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factura.id).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-v1-facturas.test.ts`
Expected: FAIL — módulos de ruta no existen

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/mcp/v1/facturas/route.ts
/**
 * GET /api/mcp/v1/facturas — solo lectura, autenticado por API key.
 * Proyección deliberadamente reducida: se excluyen XML/PDF/campos internos
 * de DGII — esta ruta es para consumo de una AI externa, no para el detalle
 * completo que usa el frontend en /api/facturas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

const CAMPOS = {
  id: ecfDocuments.id,
  encf: ecfDocuments.encf,
  codigo: ecfDocuments.codigo,
  tipoEcf: ecfDocuments.tipoEcf,
  estado: ecfDocuments.estado,
  estadoPago: ecfDocuments.estadoPago,
  clientId: ecfDocuments.clientId,
  rncComprador: ecfDocuments.rncComprador,
  razonSocialComprador: ecfDocuments.razonSocialComprador,
  emailComprador: ecfDocuments.emailComprador,
  montoTotal: ecfDocuments.montoTotal,
  totalItbis: ecfDocuments.totalItbis,
  totalRetenciones: ecfDocuments.totalRetenciones,
  tipoPago: ecfDocuments.tipoPago,
  fechaEmision: ecfDocuments.fechaEmision,
  fechaLimitePago: ecfDocuments.fechaLimitePago,
  dependienteId: ecfDocuments.dependienteId,
  dependienteNombre: ecfDocuments.dependienteNombre,
  origenRecurrenteId: ecfDocuments.origenRecurrenteId,
  periodoRecurrente: ecfDocuments.periodoRecurrente,
  createdAt: ecfDocuments.createdAt,
  updatedAt: ecfDocuments.updatedAt,
};

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const estado = sp.get('estado');
  const estadoPago = sp.get('estadoPago');
  const clientId = sp.get('clientId');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condiciones = [eq(ecfDocuments.teamId, teamId)];
  if (estado) condiciones.push(eq(ecfDocuments.estado, estado));
  if (estadoPago) condiciones.push(eq(ecfDocuments.estadoPago, estadoPago));
  if (clientId) condiciones.push(eq(ecfDocuments.clientId, Number(clientId)));
  if (desde) condiciones.push(gte(ecfDocuments.fechaEmision, new Date(desde)));
  if (hasta) condiciones.push(lte(ecfDocuments.fechaEmision, new Date(hasta)));
  if (q) {
    condiciones.push(
      or(
        ilike(ecfDocuments.encf, `%${q}%`),
        ilike(ecfDocuments.codigo, `%${q}%`),
        ilike(ecfDocuments.razonSocialComprador, `%${q}%`),
        ilike(ecfDocuments.rncComprador, `%${q}%`),
      )!,
    );
  }

  const facturas = await db
    .select(CAMPOS)
    .from(ecfDocuments)
    .where(and(...condiciones))
    .orderBy(ecfDocuments.fechaEmision)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturas });
}
```

```typescript
// app/api/mcp/v1/facturas/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const [factura] = await db
    .select()
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, Number(id)), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!factura) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Mismo criterio de exclusión que la lista: sin XML/PDF/internos de DGII.
  const {
    xmlOriginal, xmlFirmado, xmlUrl, pdfUrl, mensajesDgii, trackId, codigoSeguridad,
    lineasJson, ...resto
  } = factura;
  void xmlOriginal; void xmlFirmado; void xmlUrl; void pdfUrl;
  void mensajesDgii; void trackId; void codigoSeguridad; void lineasJson;

  return NextResponse.json({ factura: resto });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-v1-facturas.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/v1/facturas tests/unit/mcp-v1-facturas.test.ts
git commit -m "feat(mcp): rutas de solo lectura /api/mcp/v1/facturas"
```

---

### Task 4: `/api/mcp/v1/facturas-recurrentes` (lista + detalle)

**Files:**
- Create: `app/api/mcp/v1/facturas-recurrentes/route.ts`
- Create: `app/api/mcp/v1/facturas-recurrentes/[id]/route.ts`
- Test: `tests/unit/mcp-v1-facturas-recurrentes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/mcp-v1-facturas-recurrentes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const recurrenteFixture = {
  id: 3, teamId: 42, clientId: 1, nombre: 'Mensualidad Primaria',
  descripcion: null, tipoEcf: '31', tipoPago: 2, diasParaPago: 5,
  frecuencia: 'mensual', diaCobro: 1, fechaInicio: '2026-01-01', fechaFin: null,
  proximaEmision: '2026-09-01', estado: 'activa', items: '[]', notas: null,
  totalEstimado: 500000, facturasEmitidas: 8,
  createdAt: new Date(), updatedAt: new Date(),
};

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([recurrenteFixture]) }) }),
          limit: () => Promise.resolve([recurrenteFixture]),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/facturas-recurrentes/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/facturas-recurrentes/[id]/route');

describe('GET /api/mcp/v1/facturas-recurrentes', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturasRecurrentes).toHaveLength(1);
  });
});

describe('GET /api/mcp/v1/facturas-recurrentes/[id]', () => {
  it('con key válida → 200 y el plan', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes/3'),
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturaRecurrente.nombre).toBe('Mensualidad Primaria');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-v1-facturas-recurrentes.test.ts`
Expected: FAIL — módulos de ruta no existen

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/mcp/v1/facturas-recurrentes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const estado = sp.get('estado');
  const clientId = sp.get('clientId');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condiciones = [eq(facturasRecurrentes.teamId, teamId)];
  if (estado) condiciones.push(eq(facturasRecurrentes.estado, estado));
  if (clientId) condiciones.push(eq(facturasRecurrentes.clientId, Number(clientId)));
  if (q) condiciones.push(ilike(facturasRecurrentes.nombre, `%${q}%`));

  const facturasRecurrentesRows = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(...condiciones))
    .orderBy(facturasRecurrentes.nombre)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturasRecurrentes: facturasRecurrentesRows });
}
```

```typescript
// app/api/mcp/v1/facturas-recurrentes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const [facturaRecurrente] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, Number(id)), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);

  if (!facturaRecurrente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-v1-facturas-recurrentes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/v1/facturas-recurrentes tests/unit/mcp-v1-facturas-recurrentes.test.ts
git commit -m "feat(mcp): rutas de solo lectura /api/mcp/v1/facturas-recurrentes"
```

---

### Task 5: `/api/mcp/v1/cuentas-por-cobrar`

**Files:**
- Create: `app/api/mcp/v1/cuentas-por-cobrar/route.ts`
- Test: `tests/unit/mcp-v1-cuentas-por-cobrar.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/mcp-v1-cuentas-por-cobrar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const resultadoFixture = {
  cuentas: [{ id: 9, encf: 'E310000000009', saldo: 590000, vencida: false }],
  pendiente: 590000, vencido: 0, count: 1, countVencidas: 0,
  antiguedad: { porVencer: 590000, d1a30: 0, d31a60: 0, d61a90: 0, d90mas: 0 },
};

vi.mock('@/lib/db/queries', () => ({
  getCuentasPorCobrar: vi.fn(() => Promise.resolve(resultadoFixture)),
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { getCuentasPorCobrar } = await import('@/lib/db/queries');
const { GET } = await import('@/app/api/mcp/v1/cuentas-por-cobrar/route');

describe('GET /api/mcp/v1/cuentas-por-cobrar', () => {
  it('sin key válida → 401, no llama a getCuentasPorCobrar', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await GET(new NextRequest('http://localhost/api/mcp/v1/cuentas-por-cobrar'));
    expect(res.status).toBe(401);
    expect(getCuentasPorCobrar).not.toHaveBeenCalled();
  });

  it('con key válida → 200 con el resultado de getCuentasPorCobrar escopado al teamId de la key', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await GET(new NextRequest('http://localhost/api/mcp/v1/cuentas-por-cobrar?soloVencidas=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(resultadoFixture);
    expect(getCuentasPorCobrar).toHaveBeenCalledWith(42, expect.objectContaining({ soloVencidas: true }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-v1-cuentas-por-cobrar.test.ts`
Expected: FAIL — módulo de ruta no existe

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/mcp/v1/cuentas-por-cobrar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCuentasPorCobrar } from '@/lib/db/queries';
import { requireApiKey } from '@/lib/auth/api-key-guard';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const clientId = sp.get('clientId');
  const soloVencidas = sp.get('soloVencidas') === 'true';
  const limit = Math.min(Number(sp.get('limit')) || 500, 2000);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const resultado = await getCuentasPorCobrar(teamId, {
    ...(clientId ? { clientId: Number(clientId) } : {}),
    soloVencidas,
    limit,
    offset,
  });

  return NextResponse.json(resultado);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-v1-cuentas-por-cobrar.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/v1/cuentas-por-cobrar tests/unit/mcp-v1-cuentas-por-cobrar.test.ts
git commit -m "feat(mcp): ruta de solo lectura /api/mcp/v1/cuentas-por-cobrar"
```

---

### Task 6: Endpoint MCP — `/api/mcp`

**Files:**
- Modify: `package.json` (nueva dependencia)
- Create: `app/api/mcp/route.ts`

- [ ] **Step 1: Instalar `mcp-handler`**

Run:
```bash
npm install mcp-handler
```

Expected: se agrega `mcp-handler` a `dependencies` en `package.json`. Si npm reporta conflicto de peer-dependency con `zod` (el repo usa `zod@^3.24.4`), correr `npm install mcp-handler --legacy-peer-deps` — los tools de este plan solo usan `z.object`/`z.string`/`z.number`, compatibles con zod v3.

- [ ] **Step 2: Escribir el endpoint MCP**

```typescript
// app/api/mcp/route.ts
/**
 * Endpoint MCP de solo lectura. Cada tool llama por HTTP a su ruta hermana
 * bajo /api/mcp/v1/*, reenviando el mismo Bearer key que llegó en esta
 * request — nunca toca la base de datos directamente desde aquí.
 */
import { NextRequest } from 'next/server';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/api-key-guard';

function construirHandler(origin: string, authHeader: string) {
  async function llamar(path: string, params: Record<string, string | undefined> = {}) {
    const url = new URL(`/api/mcp/v1${path}`, origin);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
    const res = await fetch(url, { headers: { Authorization: authHeader } });
    const body = await res.json();
    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  }

  return createMcpHandler((server) => {
    server.registerTool(
      'list_clients',
      { title: 'Listar clientes', description: 'Lista los clientes del tenant, con búsqueda opcional por nombre/RNC/email.',
        inputSchema: z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }) },
      async ({ q, limit }) => llamar('/clientes', { q, limit: limit?.toString() }),
    );

    server.registerTool(
      'get_client',
      { title: 'Detalle de cliente', description: 'Obtiene un cliente por id.',
        inputSchema: z.object({ id: z.number().int() }) },
      async ({ id }) => llamar(`/clientes/${id}`),
    );

    server.registerTool(
      'list_invoices',
      { title: 'Listar facturas', description: 'Lista facturas con filtros opcionales (estado, estadoPago, clientId, desde, hasta, q).',
        inputSchema: z.object({
          q: z.string().optional(),
          estado: z.string().optional(),
          estadoPago: z.string().optional(),
          clientId: z.number().int().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        }) },
      async (args) => llamar('/facturas', {
        q: args.q, estado: args.estado, estadoPago: args.estadoPago,
        clientId: args.clientId?.toString(), desde: args.desde, hasta: args.hasta,
        limit: args.limit?.toString(),
      }),
    );

    server.registerTool(
      'get_invoice',
      { title: 'Detalle de factura', description: 'Obtiene una factura por id.',
        inputSchema: z.object({ id: z.number().int() }) },
      async ({ id }) => llamar(`/facturas/${id}`),
    );

    server.registerTool(
      'list_recurring_invoices',
      { title: 'Listar facturas recurrentes', description: 'Lista los planes de facturación recurrente, con filtros opcionales (estado, clientId, q).',
        inputSchema: z.object({
          q: z.string().optional(),
          estado: z.string().optional(),
          clientId: z.number().int().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        }) },
      async (args) => llamar('/facturas-recurrentes', {
        q: args.q, estado: args.estado, clientId: args.clientId?.toString(), limit: args.limit?.toString(),
      }),
    );

    server.registerTool(
      'get_recurring_invoice',
      { title: 'Detalle de factura recurrente', description: 'Obtiene un plan de facturación recurrente por id.',
        inputSchema: z.object({ id: z.number().int() }) },
      async ({ id }) => llamar(`/facturas-recurrentes/${id}`),
    );

    server.registerTool(
      'get_accounts_receivable',
      { title: 'Cuentas por cobrar', description: 'Lista cuentas por cobrar con totales y antigüedad de saldo. Filtros opcionales: clientId, soloVencidas.',
        inputSchema: z.object({
          clientId: z.number().int().optional(),
          soloVencidas: z.boolean().optional(),
        }) },
      async (args) => llamar('/cuentas-por-cobrar', {
        clientId: args.clientId?.toString(),
        soloVencidas: args.soloVencidas ? 'true' : undefined,
      }),
    );
  });
}

async function manejar(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;

  const authHeader = req.headers.get('authorization')!;
  const origin = new URL(req.url).origin;
  const handler = construirHandler(origin, authHeader);
  return handler(req);
}

export { manejar as GET, manejar as POST };
```

- [ ] **Step 3: Verificar que el build pasa**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos en `app/api/mcp/**`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/api/mcp/route.ts
git commit -m "feat(mcp): endpoint MCP con 7 tools de solo lectura sobre /api/mcp/v1"
```

---

### Task 7: Verificación manual end-to-end

No es un paso automatizable — requiere una key real y un cliente MCP.

- [ ] **Step 1: Generar una API key de prueba**

Desde la UI de la app (o `POST /api/api-keys` autenticado con sesión), crear una key con `permisos: 'read'`. Guardar el `rawKey` devuelto (`emdo_...`) — no se vuelve a mostrar.

- [ ] **Step 2: Probar las rutas REST directamente**

```bash
curl -H "Authorization: Bearer emdo_TU_KEY" http://localhost:3000/api/mcp/v1/clientes
curl -H "Authorization: Bearer emdo_TU_KEY" http://localhost:3000/api/mcp/v1/facturas?limit=5
curl -H "Authorization: Bearer emdo_TU_KEY" http://localhost:3000/api/mcp/v1/cuentas-por-cobrar
```

Expected: JSON 200 con datos reales del tenant de esa key. Repetir sin header o con key inventada → 401.

- [ ] **Step 3: Conectar un cliente MCP real**

Usar `npx @modelcontextprotocol/inspector` (o Claude Desktop / conector personalizado de ChatGPT) apuntando a `http://localhost:3000/api/mcp` con el header `Authorization: Bearer emdo_TU_KEY`. Confirmar que las 7 tools aparecen y que invocar `list_invoices` devuelve datos reales.

- [ ] **Step 4: Confirmar aislamiento por tenant**

Generar una segunda key para otro team (si hay uno de prueba) y confirmar que `list_clients` con esa key nunca devuelve clientes del primer team.
