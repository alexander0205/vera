/**
 * Tests de integración (vitest + Postgres local) — auto-provisioning POS y
 * readiness DGII. Corren solo si POSTGRES_URL está definida (DB docker de
 * tests); en CI sin DB se saltan.
 *
 *   POSTGRES_URL=postgres://postgres:postgres@localhost:54322/emitedo_test \
 *     npm run test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DB_URL = process.env.POSTGRES_URL ?? '';
const run = DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1');

// Solo contra DB local — jamás contra una remota.
describe.runIf(run)('ensurePosDefaults + getDgiiReadiness (DB local)', () => {
  let db: typeof import('@/lib/db/drizzle').db;
  let schema: typeof import('@/lib/db/schema');
  let ensurePosDefaults: typeof import('@/lib/pos/provision').ensurePosDefaults;
  let getDgiiReadiness: typeof import('@/lib/ecf/readiness').getDgiiReadiness;
  let teamId: number;

  beforeAll(async () => {
    ({ db } = await import('@/lib/db/drizzle'));
    schema = await import('@/lib/db/schema');
    ({ ensurePosDefaults } = await import('@/lib/pos/provision'));
    ({ getDgiiReadiness } = await import('@/lib/ecf/readiness'));

    // Team aislado para este test
    const [t] = await db.insert(schema.teams).values({
      name: `unit-test-${Date.now()}`,
      razonSocial: 'Unit Test SRL',
    }).returning({ id: schema.teams.id });
    teamId = t.id;
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.posTerminales).where(eq(schema.posTerminales.teamId, teamId));
    await db.delete(schema.almacenes).where(eq(schema.almacenes.teamId, teamId));
    await db.delete(schema.sequences).where(eq(schema.sequences.teamId, teamId));
    await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
  });

  it('crea almacén y terminal default para un team vacío', async () => {
    const { eq } = await import('drizzle-orm');
    await ensurePosDefaults(teamId);

    const alms = await db.select().from(schema.almacenes).where(eq(schema.almacenes.teamId, teamId));
    expect(alms).toHaveLength(1);
    expect(alms[0].nombre).toBe('Almacén principal');
    expect(alms[0].esDefault).toBe('true');

    const terms = await db.select().from(schema.posTerminales).where(eq(schema.posTerminales.teamId, teamId));
    expect(terms).toHaveLength(1);
    expect(terms[0].nombre).toBe('Caja principal');
    expect(terms[0].tipoEcf).toBe('sin-ncf');
    expect(terms[0].almacenId).toBe(alms[0].id);
    expect(terms[0].activo).toBe(true);
  });

  it('es idempotente: segunda llamada no duplica nada', async () => {
    const { eq } = await import('drizzle-orm');
    await ensurePosDefaults(teamId);
    await ensurePosDefaults(teamId);

    const alms = await db.select().from(schema.almacenes).where(eq(schema.almacenes.teamId, teamId));
    const terms = await db.select().from(schema.posTerminales).where(eq(schema.posTerminales.teamId, teamId));
    expect(alms).toHaveLength(1);
    expect(terms).toHaveLength(1);
  });

  it('concurrencia: N llamadas simultáneas crean exactamente 1 terminal', async () => {
    const { eq } = await import('drizzle-orm');
    // Team fresco para la carrera
    const [t2] = await db.insert(schema.teams).values({
      name: `unit-race-${Date.now()}`,
      razonSocial: 'Race Test SRL',
    }).returning({ id: schema.teams.id });

    await Promise.all([1, 2, 3, 4, 5].map(() => ensurePosDefaults(t2.id)));

    const terms = await db.select().from(schema.posTerminales).where(eq(schema.posTerminales.teamId, t2.id));
    const alms = await db.select().from(schema.almacenes).where(eq(schema.almacenes.teamId, t2.id));
    expect(terms).toHaveLength(1);
    expect(alms).toHaveLength(1);

    await db.delete(schema.posTerminales).where(eq(schema.posTerminales.teamId, t2.id));
    await db.delete(schema.almacenes).where(eq(schema.almacenes.teamId, t2.id));
    await db.delete(schema.teams).where(eq(schema.teams.id, t2.id));
  });

  it('readiness: team sin nada → not ready con señales en false', async () => {
    const r = await getDgiiReadiness(teamId);
    expect(r.ready).toBe(false);
    expect(r.rnc).toBe(false);
    expect(r.registradaEcfApi).toBe(false);
    expect(r.secuenciaFiscalActiva).toBe(false);
  });

  it('readiness: rnc + codigo ecf-api + secuencia fiscal vigente → ready', async () => {
    const { eq } = await import('drizzle-orm');
    await db.update(schema.teams)
      .set({ rnc: '131111111', ecfCodigoPublico: 'ctb_test' })
      .where(eq(schema.teams.id, teamId));
    await db.insert(schema.sequences).values({
      teamId, tipoEcf: '32',
      secuenciaActual: BigInt(1), secuenciaHasta: BigInt(100),
      fechaVencimiento: new Date('2030-12-31'),
    });

    // getDgiiReadiness usa React cache() por request; en vitest cada llamada
    // fuera de un request de React no memoiza entre tests.
    const r = await getDgiiReadiness(teamId);
    expect(r.secuenciaFiscalActiva).toBe(true);
    expect(r.registradaEcfApi).toBe(true);
    expect(r.rnc).toBe(true);
    expect(r.ready).toBe(true);
  });

  it('readiness: secuencia agotada no cuenta', async () => {
    const { eq } = await import('drizzle-orm');
    // Agotar la secuencia (actual > hasta)
    await db.update(schema.sequences)
      .set({ secuenciaActual: BigInt(101) })
      .where(eq(schema.sequences.teamId, teamId));

    const r = await getDgiiReadiness(teamId);
    expect(r.secuenciaFiscalActiva).toBe(false);
    expect(r.ready).toBe(false);
  });
});
