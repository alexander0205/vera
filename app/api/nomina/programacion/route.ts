import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaProgramacion } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/** Valores por defecto cuando la empresa aún no configuró nada. */
const DEFAULTS = {
  activa: false,
  mensualActiva: true,
  mensualDia: 30,
  quincenalActiva: false,
  quincenalDia1: 15,
  quincenalDia2: 30,
  anticipacionDias: 5,
};

/** Encajona un día de pago a 1..31. */
function dia(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : fallback;
}

/** Anticipación 0..30 días; fuera de rango → default. */
function anticipacion(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : fallback;
}

/** GET /api/nomina/programacion — la config de la empresa (o defaults). */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const [fila] = await db
    .select()
    .from(nominaProgramacion)
    .where(eq(nominaProgramacion.teamId, auth.teamId))
    .limit(1);

  return NextResponse.json({ programacion: fila ?? { teamId: auth.teamId, ...DEFAULTS } });
}

/** PUT /api/nomina/programacion — guarda la config (upsert por empresa). */
export async function PUT(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const valores = {
    activa: Boolean(body.activa),
    mensualActiva: Boolean(body.mensualActiva),
    mensualDia: dia(body.mensualDia, DEFAULTS.mensualDia),
    quincenalActiva: Boolean(body.quincenalActiva),
    quincenalDia1: dia(body.quincenalDia1, DEFAULTS.quincenalDia1),
    quincenalDia2: dia(body.quincenalDia2, DEFAULTS.quincenalDia2),
    anticipacionDias: anticipacion(body.anticipacionDias, DEFAULTS.anticipacionDias),
    updatedAt: new Date(),
  };

  const [fila] = await db
    .insert(nominaProgramacion)
    .values({ teamId: auth.teamId, ...valores })
    .onConflictDoUpdate({ target: nominaProgramacion.teamId, set: valores })
    .returning();

  return NextResponse.json({ programacion: fila });
}
