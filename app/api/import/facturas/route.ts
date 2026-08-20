/**
 * POST /api/import/facturas
 *
 * Importa facturas históricas (CSV de facturas exportado del sistema anterior (sep=;, latin-1)) →
 * ecfDocuments con estado HISTORICA (NO se envían a DGII). Solo para
 * tracking de cobranza y migración de histórico.
 *
 * - 1 fila por línea de producto; se agrupan por CÓDIGO (= 1 factura).
 * - Crea clientes y productos faltantes automáticamente (commit).
 * - encf = `ALG-{CÓDIGO}` para que el import de pagos pueda enlazar.
 * - Dedup por encf (no re-importa la misma factura).
 *
 * Patrón basado en /api/cuentas-por-cobrar/historica:
 *   tipoEcf '00', estado 'HISTORICA', tipoPago 2 (aparece en AR con saldo).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, clients, products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireImport, readUpload, ImportError } from '@/lib/import/server';
import { registrarPago } from '@/lib/db/queries';
import { banderasPorTipo } from '@/lib/productos/donde-se-vende';
import {
  decodeBuffer, parseCsv, pick, normKey, toCents, toIsoDate, isPlaceholderRnc,
  type ImportRow, type ImportResult,
} from '@/lib/import/csv';

interface LineaData {
  nombre: string;
  descripcion?: string;
  cantidad: number;
  precio: number;    // DOP (unitario)
  subtotal: number;  // DOP (línea)
  tasa: number;      // 0 = exento
}

interface FacturaData {
  encf: string;
  codigo: string;
  fecha: string;             // YYYY-MM-DD
  clienteNombre: string;
  clienteRnc: string | null;
  montoTotal: number;        // centavos
  cobrada: boolean;          // ESTADO=Cobrada en el origen → se registra pago full
  lineas: LineaData[];
}

export async function POST(req: NextRequest) {
  try {
    const { user, teamId } = await requireImport('facturas:crear');
    const { buf, mode } = await readUpload(req);

    const csvRows = parseCsv(decodeBuffer(buf));

    // ── Agrupar filas por CÓDIGO, preservando orden de aparición ──────────────
    const groups = new Map<string, Record<string, string>[]>();
    for (const row of csvRows) {
      const codigo = pick(row, 'CÓDIGO', 'Código', 'CODIGO', 'Número', 'Numero').trim();
      if (!codigo) continue;
      if (!groups.has(codigo)) groups.set(codigo, []);
      groups.get(codigo)!.push(row);
    }

    // ── Estado existente para dedup ───────────────────────────────────────────
    const [existingDocs, existingClients, existingProducts] = await Promise.all([
      db.select({ encf: ecfDocuments.encf }).from(ecfDocuments).where(eq(ecfDocuments.teamId, teamId)),
      db.select({ id: clients.id, rnc: clients.rnc, razonSocial: clients.razonSocial }).from(clients).where(eq(clients.teamId, teamId)),
      db.select({ nombre: products.nombre }).from(products).where(eq(products.teamId, teamId)),
    ]);

    const encfSet = new Set(existingDocs.map(d => d.encf));
    const clientByRnc  = new Map<string, number>();
    const clientByName = new Map<string, number>();
    for (const c of existingClients) {
      if (c.rnc) clientByRnc.set(c.rnc, c.id);
      clientByName.set(normKey(c.razonSocial), c.id);
    }
    const productNames = new Set(existingProducts.map(p => normKey(p.nombre)));

    const rows: ImportRow<Omit<FacturaData, 'lineas'> & { lineasCount: number }>[] = [];
    const parsed: FacturaData[] = [];
    const errors: string[] = [];

    // Acumular clientes/productos nuevos a crear (commit).
    const newClientsByKey = new Map<string, { teamId: number; razonSocial: string; rnc: string | null }>();
    const newProductNames = new Map<string, number>(); // normKey → precio DOP (primera ocurrencia)

    for (const [codigo, lineRows] of groups) {
      const ref = codigo;
      const head = lineRows[0];
      const encf = `ALG-${codigo}`;

      const fecha = toIsoDate(pick(head, 'FECHA DE EMISIÓN', 'Fecha de emisión', 'Fecha'));
      const clienteNombre = pick(head, 'CLIENTE - NOMBRE', 'Cliente - Nombre', 'Cliente').trim();
      const rncDigits = pick(head, 'CLIENTE - RNC O CÉDULA', 'Cliente - RNC o Cédula', 'RNC/Cédula').replace(/\D/g, '');
      const clienteRnc = (!isPlaceholderRnc(rncDigits) && /^\d{9}$|^\d{11}$/.test(rncDigits)) ? rncDigits : null;
      // ESTADO del CSV (col 'ESTADO', distinta de 'ESTADO LEGAL'). 'Cobrada' → pago full.
      const cobrada = normKey(pick(head, 'ESTADO', 'Estado')) === 'cobrada';

      const lineas: LineaData[] = lineRows.map(r => {
        const nombre = pick(r, 'PRODUCTO/SERVICIO - NOMBRE', 'Producto/Servicio - Nombre').trim() || 'Ítem';
        const cantidad = parseFloat(pick(r, 'PRODUCTO/SERVICIO - CANTIDAD', 'Cantidad').replace(',', '.')) || 1;
        const precio = parseFloat(pick(r, 'PRODUCTO/SERVICIO - PRECIO UNITARIO', 'Precio unitario').replace(/,/g, '')) || 0;
        const subtotal = parseFloat(pick(r, 'PRODUCTO/SERVICIO - TOTAL', 'Total').replace(/,/g, '')) || precio * cantidad;
        const descripcion = pick(r, 'PRODUCTO/SERVICIO - DESCRIPCIÓN', 'Descripción') || undefined;
        return { nombre, descripcion, cantidad, precio, subtotal, tasa: 0 };
      });

      // Monto total: TOTAL - FACTURA (repetido por línea) o suma de líneas.
      let montoTotal = toCents(pick(head, 'TOTAL - FACTURA', 'Total - Factura', 'Total factura'));
      if (montoTotal === 0) montoTotal = Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100);

      const data = { encf, codigo, fecha, clienteNombre, clienteRnc, montoTotal, cobrada, lineasCount: lineas.length };

      if (!fecha) {
        rows.push({ ref, data, action: 'skip', reason: 'fecha inválida' });
        errors.push(`Factura ${codigo}: fecha inválida, omitida`);
        continue;
      }
      if (encfSet.has(encf)) {
        rows.push({ ref, data, action: 'skip', reason: 'ya importada' });
        continue;
      }

      // Marcar cliente/producto nuevos (para crear en commit).
      if (clienteNombre) {
        const key = clienteRnc ?? normKey(clienteNombre);
        const exists = (clienteRnc && clientByRnc.has(clienteRnc)) || clientByName.has(normKey(clienteNombre));
        if (!exists && !newClientsByKey.has(key)) {
          newClientsByKey.set(key, { teamId, razonSocial: clienteNombre, rnc: clienteRnc });
        }
      }
      for (const l of lineas) {
        const nk = normKey(l.nombre);
        if (!productNames.has(nk) && !newProductNames.has(nk)) {
          newProductNames.set(nk, l.precio);
        }
      }

      encfSet.add(encf);
      rows.push({ ref, data, action: 'create' });
      parsed.push({ encf, codigo, fecha, clienteNombre, clienteRnc, montoTotal, cobrada, lineas });
    }

    // ── Commit ────────────────────────────────────────────────────────────────
    if (mode === 'commit' && parsed.length > 0) {
      // 1. Crear clientes faltantes y mapear nombre/rnc → id.
      if (newClientsByKey.size > 0) {
        const inserted = await db.insert(clients)
          .values([...newClientsByKey.values()].map(c => ({ teamId: c.teamId, razonSocial: c.razonSocial, rnc: c.rnc })))
          .returning({ id: clients.id, rnc: clients.rnc, razonSocial: clients.razonSocial });
        for (const c of inserted) {
          if (c.rnc) clientByRnc.set(c.rnc, c.id);
          clientByName.set(normKey(c.razonSocial), c.id);
        }
      }

      // 2. Crear productos faltantes (catálogo).
      if (newProductNames.size > 0) {
        const productValues = [...newProductNames.entries()].map(([nk, precio]) => ({
          teamId,
          nombre: parsed.flatMap(f => f.lineas).find(l => normKey(l.nombre) === nk)?.nombre ?? nk,
          precio: Math.round((precio || 0) * 100),
          tasaItbis: 'exento',
          tipo: 'servicio',
          activo: 'true',
          // Estos productos no los pidió nadie: se inventan para poder enganchar
          // la línea de una factura histórica que se está importando. Salen de
          // Facturación, que es de donde vienen, y no de la caja: aparecer en la
          // grilla del POS por el mero hecho de haber importado el histórico es
          // ruido que el comerciante no sabe de dónde salió.
          ...banderasPorTipo('servicio'),
        }));
        for (let i = 0; i < productValues.length; i += 500) {
          await db.insert(products).values(productValues.slice(i, i + 500));
        }
      }

      // 3. Insertar facturas históricas.
      const docValues = parsed.map(f => {
        let clientId: number | null = null;
        if (f.clienteRnc) clientId = clientByRnc.get(f.clienteRnc) ?? null;
        if (clientId == null) clientId = clientByName.get(normKey(f.clienteNombre)) ?? null;
        return {
          teamId,
          clientId,
          encf: f.encf,
          tipoEcf: '00',
          estado: 'HISTORICA',
          rncComprador: f.clienteRnc ?? undefined,
          razonSocialComprador: f.clienteNombre || undefined,
          montoTotal: f.montoTotal,
          totalItbis: 0,
          tipoPago: 2,
          fechaEmision: new Date(f.fecha + 'T12:00:00'),
          fechaLimitePago: f.fecha,
          // Formato canónico ItemLinea (nombreItem/cantidadItem/...) para que el
          // detalle, la edición y "Generar e-CF" (emitir-ecf) reconstruyan los ítems.
          lineasJson: JSON.stringify(f.lineas.map((l, i) => ({
            id:                     i + 1,
            nombreItem:             l.nombre,
            referencia:             '',
            descripcionItem:        l.descripcion ?? '',
            cantidadItem:           l.cantidad,
            precioUnitarioItem:     l.precio,
            descuentoPct:           0,
            tasaItbis:              'exento',
            indicadorBienoServicio: '2',
          }))),
          notas: `Importada por CSV (factura ${f.codigo})`,
        };
      });
      const insertedDocs: { id: number; encf: string }[] = [];
      for (let i = 0; i < docValues.length; i += 200) {
        const chunk = await db.insert(ecfDocuments)
          .values(docValues.slice(i, i + 200))
          .returning({ id: ecfDocuments.id, encf: ecfDocuments.encf });
        insertedDocs.push(...chunk);
      }

      // 4. ESTADO=Cobrada en el CSV → registrar pago full (queda 'Pagada' en AR/export).
      const idByEncf = new Map(insertedDocs.map(d => [d.encf, d.id]));
      for (const f of parsed) {
        if (!f.cobrada) continue;
        const docId = idByEncf.get(f.encf);
        if (!docId) continue;
        await registrarPago({
          teamId,
          ecfDocumentId:  docId,
          montoCentavos:  f.montoTotal,
          metodo:         'otro',
          fechaPago:      f.fecha,
          notas:          `Cobrada al importar (factura ${f.codigo})`,
          createdBy:      user.id,
        });
      }
    }

    const created = rows.filter(r => r.action === 'create').length;
    const skipped = rows.filter(r => r.action === 'skip').length;

    const result: ImportResult<Omit<FacturaData, 'lineas'> & { lineasCount: number }> = {
      mode, total: rows.length, created, updated: 0, skipped, errors, rows,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/import/facturas]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 });
  }
}
