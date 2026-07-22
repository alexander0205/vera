/**
 * Consulta de e-NCF por rango o por número puntual.
 *
 * Cruza el registro local con ecf-api para explicar TODOS los números del
 * rango — incluidos los que no existen, que es lo que preguntan los contadores.
 * Gate: `contabilidad:ver` (el contador es solo lectura).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { consultarRango, parseEncf } from '@/lib/contabilidad/secuencias';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const encfParam = sp.get('encf')?.trim();

  // ── Modo 1: un e-NCF puntual ────────────────────────────────────────────
  if (encfParam) {
    const p = parseEncf(encfParam);
    if (!p) {
      return NextResponse.json(
        { error: `"${encfParam}" no es un e-NCF válido. Formato esperado: E320000000094.` },
        { status: 400 },
      );
    }
    const r = await consultarRango(auth.teamId, p.tipo, p.numero, p.numero);
    return NextResponse.json(r);
  }

  // ── Modo 2: rango ───────────────────────────────────────────────────────
  const tipo = sp.get('tipo')?.trim();
  if (!tipo || !/^\d{2}$/.test(tipo)) {
    return NextResponse.json(
      { error: 'Indica el tipo de comprobante (ej. 31, 32) o un e-NCF completo.' },
      { status: 400 },
    );
  }

  const desde = parseInt(sp.get('desde') ?? '1', 10);
  const hasta = parseInt(sp.get('hasta') ?? String(desde), 10);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde < 1 || hasta < 1) {
    return NextResponse.json({ error: 'Rango inválido. Usa números positivos, ej. 1–100.' }, { status: 400 });
  }

  try {
    const r = await consultarRango(auth.teamId, tipo, desde, hasta);
    return NextResponse.json(r);
  } catch (e) {
    console.error('[contabilidad/consulta-ncf]', e);
    return NextResponse.json(
      { error: 'No se pudo completar la consulta. Reintenta en un momento.' },
      { status: 502 },
    );
  }
}
