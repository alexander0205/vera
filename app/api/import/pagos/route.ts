/**
 * POST /api/import/pagos
 *
 * Importa pagos desde el PDF de "Recibos de Caja" de Alegra.
 * Cada recibo trae "Pago a factura No. X" → enlaza con la factura histórica
 * importada (encf = `ALG-X`) y registra el cobro vía registrarPago().
 *
 * Requiere haber importado antes las facturas (/api/import/facturas).
 * Idempotente: no duplica un recibo ya registrado (referencia = "Recibo N").
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { eq, and, like } from 'drizzle-orm';
import { requireImport, readUpload, ImportError } from '@/lib/import/server';
import { toCents, toIsoDate, type ImportRow, type ImportResult } from '@/lib/import/csv';
import { registrarPago } from '@/lib/db/queries';

export const runtime = 'nodejs';

interface PagoData {
  recibo: string;
  factura: string;
  cliente: string;
  metodo: string;
  fecha: string;
  montoDOP: string;
}

function mapMetodo(raw: string): string {
  const s = raw.toLowerCase();
  if (s.startsWith('efec')) return 'efectivo';
  if (s.startsWith('transf')) return 'transferencia';
  if (s.startsWith('cheq')) return 'cheque';
  if (s.startsWith('tarj')) return 'tarjeta';
  if (s.startsWith('dep')) return 'transferencia';
  return 'otro';
}

const fmtDOP = (cts: number) => `RD$${(cts / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

export async function POST(req: NextRequest) {
  try {
    const { user, teamId } = await requireImport('facturas:crear');
    const { buf, mode } = await readUpload(req);

    // ── Extraer texto del PDF ─────────────────────────────────────────────────
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    let text = '';
    try {
      ({ text } = await parser.getText());
    } finally {
      await parser.destroy();
    }

    const blocks = text.split(/--\s*\d+\s+of\s+\d+\s*--/).map(b => b.trim()).filter(Boolean);

    // ── Facturas históricas importadas (para enlazar) ─────────────────────────
    const docs = await db
      .select({ id: ecfDocuments.id, encf: ecfDocuments.encf, montoTotal: ecfDocuments.montoTotal, razon: ecfDocuments.razonSocialComprador })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), like(ecfDocuments.encf, 'ALG-%')));
    const docByEncf = new Map(docs.map(d => [d.encf, d]));

    // ── Pagos ya registrados (saldo + idempotencia por referencia) ────────────
    const existingPagos = await db
      .select({ docId: pagosRecibidos.ecfDocumentId, monto: pagosRecibidos.montoCentavos, ref: pagosRecibidos.referencia })
      .from(pagosRecibidos)
      .where(eq(pagosRecibidos.teamId, teamId));

    const pagadoByDoc = new Map<number, number>();
    const refByDoc = new Map<number, Set<string>>();
    for (const p of existingPagos) {
      pagadoByDoc.set(p.docId, (pagadoByDoc.get(p.docId) ?? 0) + p.monto);
      if (p.ref) {
        if (!refByDoc.has(p.docId)) refByDoc.set(p.docId, new Set());
        refByDoc.get(p.docId)!.add(p.ref);
      }
    }

    const rows: ImportRow<PagoData>[] = [];
    const toApply: { docId: number; montoCentavos: number; metodo: string; referencia: string; fechaPago: string }[] = [];
    const errors: string[] = [];

    for (const b of blocks) {
      const factura = b.match(/Pago a factura No\.?\s*(\S+)\s+RD\$/i)?.[1] ?? '';
      const recibo  = b.match(/No\.\s*(\d+)\s*\n\s*RECIBO DE CAJA/i)?.[1] ?? '';
      const totalRaw = [...b.matchAll(/Total\s*RD\$\s*([\d.,]+)/gi)].pop()?.[1] ?? '';
      const metodoRaw = b.match(/\n(Efectivo|Transferencia|Cheque|Tarjeta|Dep[oó]sito)\n/i)?.[1] ?? '';
      const fecha = toIsoDate(b.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? '');
      const montoCts = toCents(totalRaw);
      const ref = String(recibo || '?');

      const base: PagoData = { recibo: ref, factura, cliente: '—', metodo: mapMetodo(metodoRaw), fecha, montoDOP: fmtDOP(montoCts) };

      if (!factura) { rows.push({ ref, data: base, action: 'skip', reason: 'sin factura' }); continue; }

      const doc = docByEncf.get(`ALG-${factura}`);
      if (!doc) {
        rows.push({ ref, data: base, action: 'skip', reason: 'factura no importada' });
        errors.push(`Recibo ${ref}: factura ${factura} no encontrada (importa facturas primero)`);
        continue;
      }
      base.cliente = doc.razon ?? '—';

      const referencia = `Recibo ${ref}`;
      if (refByDoc.get(doc.id)?.has(referencia)) {
        rows.push({ ref, data: base, action: 'skip', reason: 'ya registrado' });
        continue;
      }

      const pagado = pagadoByDoc.get(doc.id) ?? 0;
      const saldo = doc.montoTotal - pagado;
      if (saldo <= 0) { rows.push({ ref, data: base, action: 'skip', reason: 'sin saldo' }); continue; }
      if (montoCts <= 0) { rows.push({ ref, data: base, action: 'skip', reason: 'monto inválido' }); continue; }

      const aplicar = Math.min(montoCts, saldo);
      base.montoDOP = fmtDOP(aplicar);
      pagadoByDoc.set(doc.id, pagado + aplicar);

      rows.push({ ref, data: base, action: 'create' });
      toApply.push({ docId: doc.id, montoCentavos: aplicar, metodo: base.metodo, referencia, fechaPago: fecha || new Date().toISOString().slice(0, 10) });
    }

    if (mode === 'commit' && toApply.length > 0) {
      for (const p of toApply) {
        try {
          await registrarPago({
            teamId,
            ecfDocumentId: p.docId,
            montoCentavos: p.montoCentavos,
            metodo: p.metodo,
            referencia: p.referencia,
            cuenta: 'Caja general',
            fechaPago: p.fechaPago,
            notas: 'Importado de recibo de caja (Alegra)',
            createdBy: user.id,
          });
        } catch (e) {
          errors.push(`${p.referencia}: ${e instanceof Error ? e.message : 'error al registrar'}`);
        }
      }
    }

    const created = rows.filter(r => r.action === 'create').length;
    const skipped = rows.filter(r => r.action === 'skip').length;

    const result: ImportResult<PagoData> = {
      mode, total: rows.length, created, updated: 0, skipped, errors, rows,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/import/pagos]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 });
  }
}
