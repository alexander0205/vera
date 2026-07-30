/**
 * Anulación de rangos de e-NCF no utilizados ante DGII (ANECF).
 *
 *   GET  ?tipo=32&desde=1&hasta=100  → preview: qué hay en el tramo, si es anulable
 *   GET  ?historico=1                → tramos ya anulados por el equipo
 *   POST { tipo, desde, hasta, motivo? } → firma y envía el ANECF a DGII
 *
 * Gate: `facturas:anular` — es una acción fiscal irreversible, mismo nivel que
 * anular un comprobante. El contador (solo `reportes:ver`) puede consultar pero
 * no enviar, así que el preview va por GET con el mismo gate para no filtrarle
 * un botón que no puede usar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { z } from 'zod';
import {
  revisarTramo, anularTramo, listarTramosAnulados, AnulacionTramoError,
} from '@/lib/contabilidad/anulacion-rangos';

export const dynamic = 'force-dynamic';

const TIPO_RE = /^(31|32|33|34|41|43|44|45|46|47)$/;

const bodySchema = z.object({
  tipo:   z.string().regex(TIPO_RE, 'Tipo de comprobante no válido para anulación.'),
  desde:  z.coerce.number().int().min(1).max(9_999_999_999),
  hasta:  z.coerce.number().int().min(1).max(9_999_999_999),
  motivo: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission('facturas:anular');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  if (sp.get('historico')) {
    const tramos = await listarTramosAnulados(auth.teamId);
    return NextResponse.json({ tramos });
  }

  const tipo = sp.get('tipo')?.trim();
  if (!tipo || !TIPO_RE.test(tipo)) {
    return NextResponse.json(
      { error: 'Indica el tipo de comprobante (31, 32, 33, 34, 41, 43, 44, 45, 46 o 47).' },
      { status: 400 },
    );
  }

  const desde = parseInt(sp.get('desde') ?? '', 10);
  const hasta = parseInt(sp.get('hasta') ?? '', 10);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde < 1 || hasta < 1) {
    return NextResponse.json({ error: 'Rango inválido. Usa números positivos, ej. 1–100.' }, { status: 400 });
  }

  try {
    const revision = await revisarTramo(auth.teamId, tipo, desde, hasta);
    return NextResponse.json(revision);
  } catch (e) {
    console.error('[contabilidad/anular-rango GET]', e);
    return NextResponse.json(
      { error: 'No se pudo revisar el tramo. Reintenta en un momento.' },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('facturas:anular');
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const r = await anularTramo(auth.teamId, auth.user.id, {
      tipoEcf: parsed.data.tipo,
      desde:   parsed.data.desde,
      hasta:   parsed.data.hasta,
      motivo:  parsed.data.motivo,
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof AnulacionTramoError) {
      return NextResponse.json({ error: e.message, detalle: e.detalle }, { status: e.status });
    }
    console.error('[contabilidad/anular-rango POST]', e);
    return NextResponse.json(
      { error: 'No se pudo completar la anulación. Reintenta en un momento.' },
      { status: 502 },
    );
  }
}
