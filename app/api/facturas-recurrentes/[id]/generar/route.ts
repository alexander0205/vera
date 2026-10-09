/**
 * POST /api/facturas-recurrentes/[id]/generar
 *
 * Genera una factura borrador manualmente a partir de una factura recurrente,
 * sin importar si la proximaEmision es futura. Útil para pruebas y casos donde
 * se necesita adelantar la generación.
 *
 * Autenticación: sesión normal (getTeamIdForUser), NO CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { and, eq } from 'drizzle-orm';
import { generarFacturaDeRecurrente } from '@/lib/cobranza/recurrente';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  // Período opcional ('YYYY-MM-DD'): permite generar cualquier fecha del schedule,
  // no solo la próxima. Si no viene, se usa proximaEmision.
  let periodo: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.periodo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.periodo)) {
      periodo = body.periodo;
    }
  } catch {
    // Sin body o body inválido: generar la próxima emisión.
  }

  // Cargar la recurrente verificando que pertenece al team
  const [fr] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  if (!fr) return NextResponse.json({ error: 'Factura recurrente no encontrada' }, { status: 404 });

  // Permitir generar incluso si está pausada/finalizada (es disparo manual para probar)
  // pero no generar si está en un estado inesperado. Try/catch para que un error
  // inesperado devuelva JSON (y no un 500 con body vacío → "Error de conexión").
  try {
    const result = await generarFacturaDeRecurrente(fr, { periodo });

    if (!result.ok) {
      if (result.reason === 'no_sequence') {
        return NextResponse.json(
          { error: 'No hay secuencia disponible para el tipo de comprobante configurado en esta factura recurrente.' },
          { status: 409 },
        );
      }
      if (result.reason === 'already_generated') {
        return NextResponse.json(
          { error: 'Ya existe una factura para ese período.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({ ok: true, documentoId: result.documentoId, encf: result.encf });
  } catch (e) {
    console.error('[facturas-recurrentes/generar] error inesperado', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error inesperado al generar la factura' },
      { status: 500 },
    );
  }
}
