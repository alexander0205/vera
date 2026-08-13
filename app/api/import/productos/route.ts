/**
 * POST /api/import/productos
 *
 * Importa productos/servicios (CSV de productos y servicios) → tabla products.
 * Dedup por referencia (si existe) o por nombre normalizado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireImport, readUpload, ImportError } from '@/lib/import/server';
import {
  decodeBuffer, parseCsv, pick, normKey, toCents,
  type ImportRow, type ImportResult,
} from '@/lib/import/csv';

interface ProductoData {
  nombre: string;
  referencia: string | null;
  descripcion: string | null;
  precio: number;       // centavos
  tasaItbis: string;    // 'exento' | '0' | '0.16' | '0.18'
  tipo: string;         // 'bien' | 'servicio'
}

/** Interpreta el valor de impuesto del CSV → tasaItbis. */
function parseTasa(raw: string): string {
  const s = normKey(raw);
  if (!s || s.includes('exento') || s.includes('exent')) return 'exento';
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return 'exento';
  if (n >= 17) return '0.18';
  if (n >= 15) return '0.16';
  if (n === 0) return 'exento';
  return '0';
}

function parseTipo(raw: string): string {
  const s = normKey(raw);
  if (s.includes('producto') || s.includes('bien') || s.includes('inventario')) return 'bien';
  return 'servicio';
}

export async function POST(req: NextRequest) {
  try {
    const { teamId } = await requireImport('productos:gestionar');
    const { buf, mode } = await readUpload(req);

    const csvRows = parseCsv(decodeBuffer(buf));

    const existing = await db
      .select({ id: products.id, nombre: products.nombre, referencia: products.referencia })
      .from(products)
      .where(eq(products.teamId, teamId));

    const byRef  = new Map<string, true>();
    const byName = new Map<string, true>();
    for (const e of existing) {
      if (e.referencia) byRef.set(normKey(e.referencia), true);
      byName.set(normKey(e.nombre), true);
    }

    const rows: ImportRow<ProductoData>[] = [];
    const toInsert: (ProductoData & { teamId: number; activo: string })[] = [];

    csvRows.forEach((row, i) => {
      const ref = String(i + 2);
      const nombre = pick(row, 'Nombre', 'Nombre del producto', 'Item', 'Ítem', 'Producto/Servicio - Nombre', 'PRODUCTO/SERVICIO - NOMBRE').trim();
      if (!nombre) {
        rows.push({ ref, data: { nombre: '', referencia: null, descripcion: null, precio: 0, tasaItbis: 'exento', tipo: 'servicio' }, action: 'skip', reason: 'sin nombre' });
        return;
      }

      const referencia = (pick(row, 'Referencia', 'Código', 'Codigo', 'SKU') || '').slice(0, 100) || null;
      const descripcion = (pick(row, 'Descripción', 'Descripcion') || '').slice(0, 2000) || null;
      const precio = toCents(pick(row, 'Precio', 'Precio base', 'Precio unitario', 'Precio de venta', 'Precio venta'));
      const tasaItbis = parseTasa(pick(row, 'Impuesto', 'Impuestos', 'ITBIS', 'IVA', '% Impuesto', 'Impuesto (%)'));
      const tipo = parseTipo(pick(row, 'Tipo', 'Tipo de item', 'Tipo de ítem'));

      const data: ProductoData = { nombre, referencia, descripcion, precio, tasaItbis, tipo };

      const refKey  = referencia ? normKey(referencia) : '';
      const nameKey = normKey(nombre);
      const isDup = (refKey && byRef.has(refKey)) || byName.has(nameKey);
      if (isDup) {
        rows.push({ ref, data, action: 'skip', reason: 'ya existe' });
        return;
      }

      if (refKey) byRef.set(refKey, true);
      byName.set(nameKey, true);

      rows.push({ ref, data, action: 'create' });
      toInsert.push({ teamId, activo: 'true', ...data });
    });

    if (mode === 'commit' && toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 500) {
        await db.insert(products).values(toInsert.slice(i, i + 500));
      }
    }

    const created = rows.filter(r => r.action === 'create').length;
    const skipped = rows.filter(r => r.action === 'skip').length;

    const result: ImportResult<ProductoData> = {
      mode, total: rows.length, created, updated: 0, skipped, errors: [], rows,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/import/productos]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 });
  }
}
