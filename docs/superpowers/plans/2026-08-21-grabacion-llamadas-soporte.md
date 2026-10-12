# Grabación de llamadas de soporte — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lado de una llamada de soporte (cliente y agente) graba su propio mic + pantalla compartida y lo sube a S3 al colgar, con un historial simple visible solo para agentes.

**Architecture:** Sin mezcla en vivo — dos archivos independientes por llamada (uno por lado), como ya decidió el spec (`docs/superpowers/specs/2026-08-21-grabacion-llamadas-soporte-design.md`). Grabación orquestada por un módulo cliente nuevo (`GrabacionLlamada`) que `useLlamada` arranca/para en los mismos puntos donde ya maneja el ciclo de vida de la llamada. Subida por un endpoint nuevo, storage reusando el patrón ya establecido de `lib/storage/tickets.ts` (mismo bucket S3, prefix propio). Reproducción restringida a agentes vía el guard ya existente.

**Tech Stack:** Next.js App Router, Drizzle/Postgres, MediaRecorder API, AWS S3 (SDK ya en el repo).

**Desviación deliberada del spec, documentada acá porque no es cosmética:** el spec (sección 1) proponía un solo `MediaRecorder` por lado, arrancado con el track de mic y con el track de pantalla compartida agregado después vía `addTrack()` sobre el MISMO stream en vivo, sin reiniciar el recorder. Ese patrón de `addTrack()` en un stream ya asignado es el que funcionó bien esta sesión para `<video>`/`<audio>` — pero `MediaRecorder` es una API distinta, y agregar un track de VIDEO a un recorder que arrancó solo-audio, ya en marcha, tiene soporte inconsistente entre navegadores (no está garantizado que el navegador empiece a codificar el track nuevo). Repetir acá la misma clase de incertidumbre de comportamiento de navegador que ya costó horas esta sesión (ver la saga en el spec de feedback de llamadas) va directo en contra del pedido explícito del usuario: *"no hablo de coste, sino de tiempo, esfuerzo, lógica, no quiero tardar tanto como acá"*.

En vez de eso: **grabación por segmentos**. Cada vez que cambia el conjunto de tracks locales (aparece o desaparece pantalla compartida), se cierra el `MediaRecorder` actual (si hay uno) y arranca uno nuevo con el stream actualizado — cada segmento es un `MediaRecorder.start()`/`.stop()` completo sobre un stream FIJO durante toda su vida, el único patrón de uso de `MediaRecorder` con soporte sólido en todos los navegadores. Resultado: en vez de un archivo por lado, puede haber 2-3 archivos cortos por lado si hubo cambios de pantalla compartida durante la llamada — más archivos, pero cada uno construido con la forma de uso de MediaRecorder que SÍ está garantizada. La tabla `ticket_call_recordings` ya admite esto sin cambios (múltiples filas por `callId`+`role`).

---

## Mapa de archivos

- `lib/db/migrations/0152_ticket_call_recordings.sql` (nuevo) — tabla.
- `lib/db/schema.ts` (modificar) — `ticketCallRecordings`.
- `scripts/apply-migration-0152.ts` (nuevo) — corre la migración (mismo patrón que `apply-migration-0128.ts`; `drizzle-kit migrate` tiene el journal roto, no se usa en este repo).
- `lib/storage/tickets.ts` (modificar) — `construirKeyGrabacion()`, reusa `s3Disponible()`/`subirAdjuntoTicket()` ya existentes.
- `app/api/zero-tickets/calls/[id]/grabacion/route.ts` (nuevo) — POST, sube un segmento.
- `lib/webrtc/conexion.ts` (modificar) — `streamLocal` (mismo patrón que `streamRemoto`) + `obtenerStreamLocal()`.
- `lib/webrtc/grabacionLlamada.ts` (nuevo) — `GrabacionLlamada`, orquesta MediaRecorder por segmentos.
- `lib/webrtc/useLlamada.ts` (modificar) — crea/alimenta/cierra `GrabacionLlamada`.
- `components/support/panel-llamada.tsx` (modificar) — banner de aviso.
- `app/api/zero-tickets/agent/tickets/[id]/recordings/route.ts` (nuevo) — GET, lista grabaciones de un ticket.
- `app/api/zero-tickets/agent/recordings/[id]/route.ts` (nuevo) — GET, sirve los bytes de una grabación.
- `app/zero-tickets/page.tsx` (modificar) — botón + lista de historial en el header del ticket.

---

### Task 1: Tabla `ticket_call_recordings`

**Files:**
- Create: `lib/db/migrations/0152_ticket_call_recordings.sql`
- Create: `scripts/apply-migration-0152.ts`
- Modify: `lib/db/schema.ts:1103` (justo después del cierre de `ticketCallSignals`)

- [ ] **Step 1: Escribir la migración**

```sql
-- lib/db/migrations/0152_ticket_call_recordings.sql
-- Grabación de llamadas de soporte — ver
-- docs/superpowers/specs/2026-08-21-grabacion-llamadas-soporte-design.md
--
-- Un archivo por lado (user/agent) por llamada, y potencialmente varios
-- SEGMENTOS por lado si compartir pantalla arrancó/paró a mitad de llamada
-- (ver el plan: MediaRecorder se reinicia en vez de mutar un stream en vivo,
-- así que puede haber más de una fila por callId+role). Sin política de
-- borrado — se guardan indefinidamente, mismo criterio que el resto de los
-- adjuntos de este feature.

CREATE TABLE IF NOT EXISTS ticket_call_recordings (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES ticket_calls(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  duracion_segundos INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_call_recordings_call_idx
  ON ticket_call_recordings (call_id, created_at);
```

- [ ] **Step 2: Agregar la tabla a schema.ts**

Insertar en `lib/db/schema.ts`, inmediatamente después del cierre de `ticketCallSignals` (línea 1103, `});`):

```ts
export const ticketCallRecordings = pgTable('ticket_call_recordings', {
  id:                serial('id').primaryKey(),
  callId:            integer('call_id').notNull().references(() => ticketCalls.id, { onDelete: 'cascade' }),
  role:              varchar('role', { length: 10 }).notNull(), // user | agent
  s3Key:             varchar('s3_key', { length: 500 }).notNull(),
  duracionSegundos:  integer('duracion_segundos').notNull(),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 3: Script para aplicar la migración**

```ts
// scripts/apply-migration-0152.ts
import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0152_ticket_call_recordings.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0152 ejecutada.');

  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'ticket_call_recordings'
     ORDER BY column_name`;
  console.table(cols);

  await sql.end();
})();
```

- [ ] **Step 4: Correr la migración y verificar**

```bash
npx tsx scripts/apply-migration-0152.ts
```

Expected: imprime la tabla con las 6 columnas (`id, call_id, role, s3_key, duracion_segundos, created_at`).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/0152_ticket_call_recordings.sql scripts/apply-migration-0152.ts lib/db/schema.ts
git commit -m "feat(llamadas): tabla ticket_call_recordings"
```

---

### Task 2: Storage — key builder para grabaciones

**Files:**
- Modify: `lib/storage/tickets.ts`

Reusa `s3Disponible()` y `subirAdjuntoTicket()` que ya existen ahí (mismo bucket/credenciales) — solo hace falta un constructor de key con prefix propio.

- [ ] **Step 1: Agregar `construirKeyGrabacion`**

Agregar al final de `lib/storage/tickets.ts` (después de `construirKeyTicket`):

```ts
const PREFIX_GRABACIONES = process.env.S3_GRABACIONES_PREFIX ?? 'grabaciones';

export function construirKeyGrabacion(callId: number, role: 'user' | 'agent'): string {
  return `${PREFIX_GRABACIONES}/call_${callId}/${role}_${randomUUID()}.webm`;
}
```

(`randomUUID` ya está importado en este archivo — mismo que usa `construirKeyTicket`.)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/storage/tickets.ts
git commit -m "feat(llamadas): key builder S3 para grabaciones"
```

---

### Task 3: Endpoint de subida

**Files:**
- Create: `app/api/zero-tickets/calls/[id]/grabacion/route.ts`

Recibe el blob por `multipart/form-data`, gateado con `requireCallParticipant` (mismo guard que ya usa `signal/route.ts` — ambos lados de la llamada pueden subir su propio segmento). Si S3 no está configurado, no guarda nada (sin fallback a base64 en DB — la lección de esta sesión) y responde `{ ok: true, skipped: true }`.

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/zero-tickets/calls/[id]/grabacion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { s3Disponible, construirKeyGrabacion, subirAdjuntoTicket } from '@/lib/storage/tickets';
import { db } from '@/lib/db/drizzle';
import { ticketCallRecordings } from '@/lib/db/schema';

const MAX_BYTES = 200 * 1024 * 1024; // 200MB — de sobra para un segmento de llamada

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const rolParam = req.nextUrl.searchParams.get('role');
  if (rolParam !== 'user' && rolParam !== 'agent') {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 });
  }

  const auth = await requireCallParticipant(callId, rolParam);
  if (!auth.ok) return auth.response;

  // Sin S3 configurado no hay dónde guardar el blob — se descarta en vez de
  // caer a base64 en Postgres (ese fallback ya causó una latencia de 100+s
  // en este mismo proyecto para adjuntos de tickets). Grabar es un extra de
  // la llamada, no su propósito: que falte no debe romper nada.
  if (!s3Disponible()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const form = await req.formData();
  const file = form.get('file');
  const duracionRaw = form.get('duracionSegundos');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Archivo muy grande' }, { status: 400 });
  const duracionSegundos = typeof duracionRaw === 'string' ? parseInt(duracionRaw, 10) : NaN;
  if (Number.isNaN(duracionSegundos) || duracionSegundos < 0) {
    return NextResponse.json({ error: 'duracionSegundos inválido' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = construirKeyGrabacion(callId, auth.role);

  try {
    await subirAdjuntoTicket(key, buffer, 'video/webm');
    await db.insert(ticketCallRecordings).values({ callId, role: auth.role, s3Key: key, duracionSegundos });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/grabacion POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/zero-tickets/calls/[id]/grabacion/route.ts
git commit -m "feat(llamadas): endpoint de subida de grabaciones"
```

---

### Task 4: `ConexionLlamada` expone el stream local

**Files:**
- Modify: `lib/webrtc/conexion.ts`

Mismo patrón que `streamRemoto` (línea 41): un único `MediaStream` mutado con `addTrack`/`removeTrack`, nunca reconstruido — así el consumidor (la grabación) puede leerlo en cualquier momento sin preocuparse por referencias viejas.

- [ ] **Step 1: Agregar el stream local privado**

En `lib/webrtc/conexion.ts`, junto a la declaración de `streamRemoto` (línea 41):

```ts
  // Mismo patrón que streamRemoto pero del lado que ESTE cliente manda — lo
  // consume GrabacionLlamada para saber qué grabar sin tener que replicar
  // acá el manejo de mic/pantalla compartida.
  private readonly streamLocal = new MediaStream();
```

- [ ] **Step 2: Alimentar el stream local en `activarMicrofono`**

Reemplazar el cuerpo de `activarMicrofono` (línea 138-142):

```ts
  async activarMicrofono(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = this.micStream.getAudioTracks()[0];
    await this.senderNegociado('audio').replaceTrack(track);
    this.streamLocal.getAudioTracks().forEach((t) => this.streamLocal.removeTrack(t));
    this.streamLocal.addTrack(track);
  }
```

- [ ] **Step 3: Alimentar el stream local en `compartirPantalla`/`dejarDeCompartirPantalla`**

Reemplazar `compartirPantalla` (línea 144-152):

```ts
  async compartirPantalla(onCortadoPorNavegador: () => void): Promise<void> {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
    const track = this.screenStream.getVideoTracks()[0];
    await this.senderNegociado('video').replaceTrack(track);
    track.onended = onCortadoPorNavegador;
    this.streamLocal.getVideoTracks().forEach((t) => this.streamLocal.removeTrack(t));
    this.streamLocal.addTrack(track);
  }
```

Reemplazar `dejarDeCompartirPantalla` (línea 154-158):

```ts
  dejarDeCompartirPantalla(): void {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.senderNegociado('video').replaceTrack(null).catch(() => {});
    this.streamLocal.getVideoTracks().forEach((t) => this.streamLocal.removeTrack(t));
  }
```

- [ ] **Step 4: Getter público**

Agregar cerca de `compartiendoPantalla()` (línea 165-167):

```ts
  obtenerStreamLocal(): MediaStream {
    return this.streamLocal;
  }
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/webrtc/conexion.ts
git commit -m "feat(llamadas): ConexionLlamada expone el stream local"
```

---

### Task 5: `GrabacionLlamada` — grabación por segmentos

**Files:**
- Create: `lib/webrtc/grabacionLlamada.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
// lib/webrtc/grabacionLlamada.ts
'use client';

/**
 * Graba el stream LOCAL de esta punta (mic + pantalla compartida si está
 * activa) y sube cada segmento terminado a S3.
 *
 * Deliberadamente NO agrega tracks a un MediaRecorder ya en marcha — el
 * soporte de los navegadores para tracks agregados en vivo a un recorder
 * activo es inconsistente. En vez de apostar a eso, cada vez que cambia el
 * conjunto de tracks del stream local (aparece/desaparece pantalla
 * compartida) se cierra el segmento actual y arranca uno nuevo. Resultado:
 * puede haber varios archivos cortos por llamada en vez de uno solo — más
 * simple y sin la superficie de bugs de navegador que ya costó horas esta
 * sesión con la mezcla de audio+video en tiempo real (ver el spec).
 */
export class GrabacionLlamada {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private inicioSegmento = 0;
  private firmaTracksActual = '';
  private mimeTypeActual = '';

  constructor(
    private readonly callId: number,
    private readonly role: 'user' | 'agent',
  ) {}

  /** Llamar cada vez que el stream local gana o pierde un track. */
  actualizarStream(stream: MediaStream): void {
    const firma = stream.getTracks().map((t) => t.id).join(',');
    if (firma === this.firmaTracksActual) return;
    this.firmaTracksActual = firma;
    this.detenerSegmentoActual();
    if (stream.getTracks().length === 0) return;
    this.iniciarSegmento(stream);
  }

  private iniciarSegmento(stream: MediaStream): void {
    const candidatos = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm'];
    const mimeType = candidatos.find((m) => MediaRecorder.isTypeSupported(m));
    // Sin ningún mimeType soportado no se graba — degradación silenciosa,
    // no debe romper la llamada por esto.
    if (!mimeType) return;

    this.chunks = [];
    this.mimeTypeActual = mimeType;
    this.inicioSegmento = Date.now();
    try {
      this.recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      this.recorder = null;
      return;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.subirSegmento();
    this.recorder.start();
  }

  private detenerSegmentoActual(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }

  private async subirSegmento(): Promise<void> {
    if (this.chunks.length === 0) return;
    const duracionSegundos = Math.round((Date.now() - this.inicioSegmento) / 1000);
    // Segmentos muy cortos (p.ej. un cambio de track a los pocos ms de
    // arrancar) no aportan nada revisable.
    if (duracionSegundos < 2) {
      this.chunks = [];
      return;
    }
    const blob = new Blob(this.chunks, { type: this.mimeTypeActual });
    this.chunks = [];

    const form = new FormData();
    form.append('file', blob, 'grabacion.webm');
    form.append('duracionSegundos', String(duracionSegundos));
    await fetch(`/api/zero-tickets/calls/${this.callId}/grabacion?role=${this.role}`, {
      method: 'POST',
      body: form,
    }).catch(() => {
      // Si falla la subida se pierde ese segmento — no hay reintento (no hay
      // dónde guardar el blob si la pestaña se cierra igual) ni se
      // interrumpe la llamada por esto.
    });
  }

  /** Llamar al colgar / limpiar la llamada. */
  detener(): void {
    this.detenerSegmentoActual();
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc/grabacionLlamada.ts
git commit -m "feat(llamadas): GrabacionLlamada, grabacion por segmentos"
```

---

### Task 6: Orquestar desde `useLlamada`

**Files:**
- Modify: `lib/webrtc/useLlamada.ts`

Arranca cuando la conexión pasa a `'activa'` (mismo momento que ya activa el micrófono), se alimenta en cada cambio de pantalla compartida, se cierra en `limpiar()`.

- [ ] **Step 1: Importar y declarar el ref**

En `lib/webrtc/useLlamada.ts`, agregar el import (junto a los de `./conexion` y `./senalizacion`, línea 4-5):

```ts
import { GrabacionLlamada } from './grabacionLlamada';
```

Y el ref, junto a `conexionRef` (línea 32):

```ts
  const grabacionRef = useRef<GrabacionLlamada | null>(null);
```

- [ ] **Step 2: Arrancar la grabación al conectar**

Dentro de `activarMicrofonoAlConectar` (línea 118-148), después del `try { await conexion.activarMicrofono(); } catch {...}` — la grabación arranca tanto si el mic se pudo activar como si no (el stream local puede estar vacío momentáneamente, `GrabacionLlamada.actualizarStream` con stream sin tracks simplemente no arranca nada):

```ts
        try {
          await conexion.activarMicrofono();
        } catch (e) {
          const detalle = e instanceof Error ? e.message : 'motivo desconocido';
          setError(`No se pudo activar el micrófono (${detalle}). La llamada sigue sin tu audio.`);
        }
        grabacionRef.current = new GrabacionLlamada(llamada.id, role);
        grabacionRef.current.actualizarStream(conexion.obtenerStreamLocal());
```

(El resto de `activarMicrofonoAlConectar` queda igual.)

- [ ] **Step 3: Alimentar la grabación cuando cambia la pantalla compartida**

Reemplazar `alternarPantalla` (línea 287-310):

```ts
  const alternarPantalla = useCallback(async () => {
    const conexion = conexionRef.current;
    if (!conexion) return;
    if (conexion.compartiendoPantalla()) {
      conexion.dejarDeCompartirPantalla();
      setCompartiendoPantalla(false);
      grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
    } else {
      try {
        await conexion.compartirPantalla(() => {
          setCompartiendoPantalla(false);
          grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
        });
        setCompartiendoPantalla(true);
        grabacionRef.current?.actualizarStream(conexion.obtenerStreamLocal());
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : '';
        if (/denied by user/i.test(mensaje)) return;
        setError(`No se pudo compartir pantalla (${mensaje || 'motivo desconocido'}). Si entraste por una IP de red (http://10.x.x.x) en vez de localhost o un dominio con HTTPS, el navegador bloquea compartir pantalla directamente — hace falta un túnel o desplegar con SSL.`);
      }
    }
  }, []);
```

- [ ] **Step 4: Cerrar la grabación en `limpiar()`**

En `limpiar` (línea 55-76), agregar junto a `conexionRef.current?.cerrar()`:

```ts
    conexionRef.current?.cerrar();
    conexionRef.current = null;
    grabacionRef.current?.detener();
    grabacionRef.current = null;
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/webrtc/useLlamada.ts
git commit -m "feat(llamadas): useLlamada orquesta GrabacionLlamada"
```

---

### Task 7: Aviso de grabación en `PanelLlamada`

**Files:**
- Modify: `components/support/panel-llamada.tsx`

Un banner chico, no bloqueante — el spec pide que aparezca "apenas arranca la grabación", que es el mismo momento que `estado === 'activa'` (Task 6, Step 2). No hace falta un prop nuevo: `estado` ya es un prop existente.

- [ ] **Step 1: Agregar el banner**

En `components/support/panel-llamada.tsx`, dentro del contenedor principal, después del bloque de video/audio (después de línea 173, el `</div>` que cierra el área de video, antes del bloque de controles):

```tsx
      {estado === 'activa' && (
        <div style={{ padding: '4px 14px', fontSize: 11, color: '#94a3b8', textAlign: 'center', background: '#1e293b', borderTop: '1px solid #334155' }}>
          Esta llamada se está grabando
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Con la app corriendo, iniciar una llamada de prueba desde ambos lados y confirmar que el banner "Esta llamada se está grabando" aparece apenas conecta, en el panel de ambos lados (widget del cliente y consola de agente).

- [ ] **Step 4: Commit**

```bash
git add components/support/panel-llamada.tsx
git commit -m "feat(llamadas): aviso de grabacion en PanelLlamada"
```

---

### Task 8: Listado de grabaciones (agente)

**Files:**
- Create: `app/api/zero-tickets/agent/tickets/[id]/recordings/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/zero-tickets/agent/tickets/[id]/recordings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCalls, ticketCallRecordings } from '@/lib/db/schema';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const rows = await db
    .select({
      id: ticketCallRecordings.id,
      role: ticketCallRecordings.role,
      duracionSegundos: ticketCallRecordings.duracionSegundos,
      createdAt: ticketCallRecordings.createdAt,
    })
    .from(ticketCallRecordings)
    .innerJoin(ticketCalls, eq(ticketCalls.id, ticketCallRecordings.callId))
    .where(eq(ticketCalls.ticketId, ticketId))
    .orderBy(desc(ticketCallRecordings.createdAt));

  return NextResponse.json({ recordings: rows });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/zero-tickets/agent/tickets/[id]/recordings/route.ts
git commit -m "feat(llamadas): endpoint de listado de grabaciones"
```

---

### Task 9: Servir una grabación (agente)

**Files:**
- Create: `app/api/zero-tickets/agent/recordings/[id]/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/zero-tickets/agent/recordings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { ticketCallRecordings } from '@/lib/db/schema';
import { leerAdjuntoTicket } from '@/lib/storage/tickets';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const recordingId = parseInt(id, 10);
  if (Number.isNaN(recordingId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select()
    .from(ticketCallRecordings)
    .where(eq(ticketCallRecordings.id, recordingId))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const buffer = await leerAdjuntoTicket(row.s3Key);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'video/webm',
      'Content-Disposition': `inline; filename="grabacion_${row.role}_${row.id}.webm"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/zero-tickets/agent/recordings/[id]/route.ts
git commit -m "feat(llamadas): endpoint para servir una grabacion"
```

---

### Task 10: Historial de grabaciones en la consola de agente

**Files:**
- Modify: `app/zero-tickets/page.tsx`

Un botón junto a los que ya existen ("Pedir captura", "Llamar", etc. — línea 461-477) que abre/cierra una lista simple de grabaciones del ticket seleccionado. Cada fila es un link que abre el archivo en una pestaña nueva (el navegador ya sabe reproducir `.webm`, no hace falta un player custom).

- [ ] **Step 1: Estado y carga de grabaciones**

Junto a los demás `useState` del componente (cerca de `llamando`/`errorLlamada`, buscar esa zona), agregar:

```ts
  const [mostrarGrabaciones, setMostrarGrabaciones] = useState(false);
  const [grabaciones, setGrabaciones] = useState<{ id: number; role: string; duracionSegundos: number; createdAt: string }[]>([]);

  async function toggleGrabaciones() {
    if (!selectedId) return;
    if (mostrarGrabaciones) {
      setMostrarGrabaciones(false);
      return;
    }
    const res = await fetch(`/api/zero-tickets/agent/tickets/${selectedId}/recordings`);
    setGrabaciones(res.ok ? (await res.json()).recordings : []);
    setMostrarGrabaciones(true);
  }
```

- [ ] **Step 2: Botón en el header del ticket**

Agregar junto al botón "Pedir captura" (línea 461-463):

```tsx
                <button onClick={toggleGrabaciones} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  {mostrarGrabaciones ? 'Ocultar grabaciones' : 'Grabaciones'}
                </button>
```

- [ ] **Step 3: Lista desplegable**

Justo antes del div de mensajes (línea 500, `<div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">`), agregar:

```tsx
            {mostrarGrabaciones && (
              <div className="border-b bg-gray-50 px-4 py-2 space-y-1">
                {grabaciones.length === 0 && <div className="text-xs text-gray-400">Sin grabaciones para este ticket.</div>}
                {grabaciones.map((g) => (
                  <a
                    key={g.id}
                    href={`/api/zero-tickets/agent/recordings/${g.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex justify-between text-xs text-[#3658e1] hover:underline"
                  >
                    <span>{g.role === 'agent' ? 'Agente' : 'Cliente'} — {new Date(g.createdAt).toLocaleString()}</span>
                    <span>{g.duracionSegundos}s</span>
                  </a>
                ))}
              </div>
            )}
```

- [ ] **Step 4: Cerrar el desplegable al cambiar de ticket**

En el `useEffect` que ya reacciona a `selectedId` (el del poll de mensajes, línea 182-190), agregar `setMostrarGrabaciones(false);` al principio del cuerpo, antes de `if (pollRef.current) clearInterval(...)`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: sin errores.

- [ ] **Step 6: Verificación manual**

Con al menos una llamada de prueba ya colgada y S3 configurado, entrar a `/zero-tickets`, seleccionar el ticket, click en "Grabaciones", confirmar que lista los archivos con rol/fecha/duración y que el link abre el `.webm` en una pestaña nueva. **Sin S3 configurado** (caso actual de este entorno), confirmar que el botón funciona igual y muestra "Sin grabaciones para este ticket." sin romper nada — la subida ya viene devolviendo `{ skipped: true }` en ese caso (Task 3), así que no hay filas que listar.

- [ ] **Step 7: Commit**

```bash
git add app/zero-tickets/page.tsx
git commit -m "feat(llamadas): historial de grabaciones en la consola de agente"
```

---

## Self-review

**Cobertura del spec:**
- Sección 1 (grabación cliente) → Tasks 4, 5, 6 (con la desviación de diseño documentada arriba).
- Sección 2 (aviso) → Task 7.
- Sección 3 (subida y storage) → Tasks 1, 2, 3.
- Sección 4 (reproducción, gateado a agentes) → Tasks 8, 9, 10.
- "Fuera de alcance" del spec (mezcla, retención, transcripción, consentimiento explícito) → ningún task los toca, correcto.
- Lección de esta sesión (no base64 en DB) → Task 3, Step 1 explícitamente hace skip en vez de fallback.

**Placeholders:** ninguno — cada step tiene código completo, sin "TODO" ni "similar a Task N".

**Consistencia de tipos:** `role: 'user' | 'agent'` usado igual en Tasks 2/3/4/5/6/8; `GrabacionLlamada.actualizarStream(stream: MediaStream)` y `.detener()` son los únicos dos métodos públicos, y Task 6 los usa exactamente así; `ticketCallRecordings` (Task 1) tiene los mismos 5 campos de negocio que usan las queries de Tasks 3/8/9 (`callId, role, s3Key, duracionSegundos, createdAt` + `id`).

**Nota sobre el entorno actual:** S3 no está configurado en este repo ahora mismo (confirmado con el usuario) — con este plan implementado, la grabación graba localmente igual pero la subida hace `skip` (Task 3) y el historial (Task 10) sale vacío hasta que se agreguen credenciales `S3_COMPROBANTES_*`. No bloquea el desarrollo ni el merge de este plan.
