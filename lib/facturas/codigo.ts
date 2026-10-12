/**
 * Generador de código de comprobante global-único e identificable.
 *
 * Formato: {TIPO}-{AÑO}-{EMP}{USR}-{RND5}-{SEC}
 *   - TIPO: FA (factura) | ND (tipoEcf 33) | NC (tipoEcf 34)
 *   - AÑO:  4 dígitos
 *   - EMP:  2 iniciales de la empresa (razonSocial → nombreComercial → name)
 *   - USR:  2 iniciales del usuario (users.name → email → 'SY' sistema)
 *   - RND5: 5 alfanuméricos MAYÚSCULA, sin ambiguos (0,O,1,I,L)
 *   - SEC:  secuencial por (team, año), LPAD 6 — counter factura_codigo_counter
 *
 * Ejemplos:
 *   factura      → FA-2026-YTAF-K7M2X-000017
 *   nota débito  → ND-2026-YTAF-9XQ4P-000018
 *   nota crédito → NC-2026-...
 *
 * El SEC sigue siendo per empresa+año (mismo contador atómico). El RND5 hace que
 * el código sea global-único. El UPSERT atómico evita races de doble-emisión.
 *
 * Si pasas una transacción (tx) en lugar de db global, el counter se incrementa
 * dentro de la misma tx y rollback restaura el estado.
 */

import { randomBytes } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import type { db as DbType } from '@/lib/db/drizzle';
import { teams, users } from '@/lib/db/schema';

type Executor = typeof DbType;

export interface GenerarCodigoFacturaOpts {
  teamId: number;
  userId?: number | null;
  tipoEcf: string;
  fecha?: Date;
  // Datos ya cargados por el caller → evitan re-consultar teams/users (2 round-
  // trips a Neon). Si se omiten, se consultan como antes. El nombre de empresa
  // se pasa pre-resuelto (razonSocial ?? nombreComercial ?? name).
  empNombre?: string | null;
  usrNombre?: string | null;
  usrEmail?: string | null;
}

// Sufijos legales a ignorar al derivar las iniciales de un nombre.
const SUFIJOS_LEGALES = new Set([
  'SRL', 'SA', 'SAS', 'EIRL', 'LTD', 'INC', 'CORP', 'LLC', 'CXA',
]);

/** Normaliza una palabra para comparar contra los sufijos legales (sin puntos). */
function limpiarPalabra(palabra: string): string {
  return palabra.replace(/[^A-Za-z]/g, '').toUpperCase();
}

/**
 * Deriva 2 iniciales en MAYÚSCULA de un texto, según reglas:
 *  - Tomar la primera letra de las primeras 2 palabras significativas
 *    (ignorando sufijos legales: SRL, SA, S.A., EIRL, SAS, LTD, INC, CORP).
 *  - Si queda 1 sola palabra → primeras 2 letras de esa palabra.
 *  - Solo A-Z; si no se puede derivar nada → fallback.
 */
function inicialesDe(texto: string | null | undefined, fallback: string): string {
  if (!texto) return fallback;

  const palabras = texto
    .split(/\s+/)
    .map(limpiarPalabra)
    .filter((p) => p.length > 0 && !SUFIJOS_LEGALES.has(p));

  if (palabras.length === 0) {
    // Todo eran sufijos/símbolos — intentar con el texto crudo.
    const crudo = texto.replace(/[^A-Za-z]/g, '').toUpperCase();
    return crudo.length >= 2 ? crudo.slice(0, 2) : fallback;
  }

  if (palabras.length === 1) {
    const unica = palabras[0];
    return unica.length >= 2 ? unica.slice(0, 2) : (unica + fallback).slice(0, 2);
  }

  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** TIPO del código según el tipo de e-CF. */
function tipoCodigo(tipoEcf: string): string {
  if (tipoEcf === '33') return 'ND';
  if (tipoEcf === '34') return 'NC';
  return 'FA';
}

// Alfabeto sin caracteres ambiguos (sin 0, O, 1, I, L).
const ALFABETO_RND = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 5 caracteres aleatorios alfanuméricos MAYÚSCULA, sin ambiguos. */
function random5(): string {
  const bytes = randomBytes(5);
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += ALFABETO_RND[bytes[i] % ALFABETO_RND.length];
  }
  return out;
}

export async function generarCodigoFactura(
  executor: Executor,
  opts: GenerarCodigoFacturaOpts,
): Promise<string> {
  const { teamId, userId = null, tipoEcf } = opts;
  const fecha = opts.fecha ?? new Date();
  const anio = fecha.getFullYear();

  const tipo = tipoCodigo(tipoEcf);

  // ── EMP: iniciales de la empresa ───────────────────────────────────────────
  // Si el caller ya trae el nombre (hot path del cobro), no re-consultar teams.
  let nombreEmpresa: string | null;
  if (opts.empNombre !== undefined) {
    nombreEmpresa = opts.empNombre;
  } else {
    const [team] = await executor
      .select({
        razonSocial:     teams.razonSocial,
        nombreComercial: teams.nombreComercial,
        name:            teams.name,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    nombreEmpresa = team?.razonSocial ?? team?.nombreComercial ?? team?.name ?? null;
  }
  const emp = inicialesDe(nombreEmpresa, 'XX');

  // ── USR: iniciales del usuario ─────────────────────────────────────────────
  let usr = 'SY';
  if (userId != null) {
    // Igual que arriba: si el caller ya trae nombre/email, no re-consultar users.
    let u: { name: string | null; email: string | null } | undefined;
    if (opts.usrNombre !== undefined || opts.usrEmail !== undefined) {
      u = { name: opts.usrNombre ?? null, email: opts.usrEmail ?? null };
    } else {
      [u] = await executor
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    }

    if (u?.name) {
      usr = inicialesDe(u.name, 'SY');
    } else if (u?.email) {
      // Primeras 2 letras del local-part del email.
      const localPart = u.email.split('@')[0].replace(/[^A-Za-z]/g, '').toUpperCase();
      usr = localPart.length >= 2 ? localPart.slice(0, 2) : 'SY';
    }
  }

  // ── SEC: secuencial atómico por (team, año) ────────────────────────────────
  // UPSERT atómico: si la fila (team, anio) existe → +1, si no → crear con ultimo=1.
  const rows = await executor.execute(sql`
    INSERT INTO factura_codigo_counter (team_id, anio, ultimo)
      VALUES (${teamId}, ${anio}, 1)
    ON CONFLICT (team_id, anio)
      DO UPDATE SET ultimo = factura_codigo_counter.ultimo + 1
    RETURNING ultimo
  `);

  // drizzle.execute() devuelve { rows: [...] } para neon-http, o el array directo
  // para otros drivers — normalizar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = rows;
  const ultimo: number = (r.rows?.[0]?.ultimo ?? r[0]?.ultimo) as number;
  if (!ultimo || typeof ultimo !== 'number') {
    throw new Error('No se pudo generar el código de factura — counter sin valor');
  }

  const sec = String(ultimo).padStart(6, '0');

  return `${tipo}-${anio}-${emp}${usr}-${random5()}-${sec}`;
}
