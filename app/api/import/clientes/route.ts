/**
 * POST /api/import/clientes
 *
 * Importa contactos (CSV export de Alegra) → tabla clients.
 * mode=preview → solo analiza y devuelve qué pasaría (no escribe).
 * mode=commit  → inserta los nuevos.
 *
 * Dedup: por RNC/cédula válido; si no, por nombre normalizado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireImport, readUpload, ImportError } from '@/lib/import/server';
import {
  decodeBuffer, parseCsv, pick, normKey, isPlaceholderRnc,
  type ImportRow, type ImportResult,
} from '@/lib/import/csv';

interface ClienteData {
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { teamId } = await requireImport('clientes:gestionar');
    const { buf, mode } = await readUpload(req);

    const csvRows = parseCsv(decodeBuffer(buf));

    // Índices de duplicados sobre los clientes ya existentes del team.
    const existing = await db
      .select({ id: clients.id, rnc: clients.rnc, razonSocial: clients.razonSocial })
      .from(clients)
      .where(eq(clients.teamId, teamId));

    const byRnc  = new Map<string, true>();
    const byName = new Map<string, true>();
    for (const e of existing) {
      if (e.rnc) byRnc.set(e.rnc, true);
      byName.set(normKey(e.razonSocial), true);
    }

    const rows: ImportRow<ClienteData>[] = [];
    const toInsert: (ClienteData & { teamId: number })[] = [];

    csvRows.forEach((row, i) => {
      const ref = String(i + 2); // +2: fila 1 = header
      const nombre = pick(row, 'Nombre/Razón social', 'Nombre', 'Razón social').trim();
      if (!nombre) {
        rows.push({ ref, data: { razonSocial: '', rnc: null, email: null, telefono: null, direccion: null }, action: 'skip', reason: 'sin nombre' });
        return;
      }

      const rncDigits = pick(row, 'RNC/Cédula', 'CLIENTE - RNC O CÉDULA', 'RNC', 'Cédula').replace(/\D/g, '');
      const rnc = (!isPlaceholderRnc(rncDigits) && /^\d{9}$|^\d{11}$/.test(rncDigits)) ? rncDigits : null;

      const correoRaw = pick(row, 'Correo', 'Email', 'Correo electrónico');
      const email = correoRaw && EMAIL_RE.test(correoRaw) ? correoRaw : null;

      const tel = (pick(row, 'Teléfono 1', 'Teléfono') || pick(row, 'Celular') || '').slice(0, 20) || null;

      let direccion = pick(row, 'Dirección', 'Direccion');
      const muni = pick(row, 'Municipio');
      const prov = pick(row, 'Provincia');
      const loc = [muni, prov].filter(Boolean).join(', ');
      if (loc && !direccion.toLowerCase().includes(loc.toLowerCase())) {
        direccion = direccion ? `${direccion} (${loc})` : loc;
      }
      direccion = direccion.slice(0, 500) || '';

      const data: ClienteData = { razonSocial: nombre, rnc, email, telefono: tel, direccion: direccion || null };

      const nameKey = normKey(nombre);
      const isDup = (rnc && byRnc.has(rnc)) || byName.has(nameKey);
      if (isDup) {
        rows.push({ ref, data, action: 'skip', reason: 'ya existe' });
        return;
      }

      // Registrar para dedup intra-archivo.
      if (rnc) byRnc.set(rnc, true);
      byName.set(nameKey, true);

      rows.push({ ref, data, action: 'create' });
      toInsert.push({ teamId, ...data });
    });

    if (mode === 'commit' && toInsert.length > 0) {
      // Insertar en lotes para no exceder límites de parámetros.
      for (let i = 0; i < toInsert.length; i += 500) {
        await db.insert(clients).values(toInsert.slice(i, i + 500));
      }
    }

    const created = rows.filter(r => r.action === 'create').length;
    const skipped = rows.filter(r => r.action === 'skip').length;

    const result: ImportResult<ClienteData> = {
      mode, total: rows.length, created, updated: 0, skipped, errors: [], rows,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/import/clientes]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 });
  }
}
