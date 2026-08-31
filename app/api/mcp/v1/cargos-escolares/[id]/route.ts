/**
 * GET /api/mcp/v1/cargos-escolares/[id] — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarEstudiantes, adminEscolarConceptosPago } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_CARGO } from '@/lib/mcp/campos-cargos';
import { idValido } from '@/lib/mcp/ids';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const cargoId = idValido(id);
  if (cargoId === null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [cargo] = await db
    .select({
      ...CAMPOS_CARGO,
      estudianteNombre: sql<string>`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`,
      concepto: adminEscolarConceptosPago.nombre,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
    // El teamId sale de la key, nunca de la petición: pedir el id de otra
    // empresa da 404, no el cargo.
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);

  if (!cargo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ cargo });
}
