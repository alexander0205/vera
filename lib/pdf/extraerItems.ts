/**
 * Extrae los ítems de una factura electrónica para renderizar en el PDF.
 *
 * Prioridad:
 *  1. `lineasJson` — guardado desde el formulario de emisión (estructura ItemLinea[])
 *  2. `xmlOriginal` — XML completo del e-CF; parsea los <Item> con regex
 *  3. null — no se pudo extraer nada; el caller decide el fallback
 */

import type { ItemPDF } from './FacturaPDF';

// ─── Helper: primer match de un tag XML simple ────────────────────────────────

function tagVal(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'))?.[1]?.trim() ?? '';
}

// ─── Extractor ────────────────────────────────────────────────────────────────

export function extraerItems(
  xmlOriginal: string | null | undefined,
  lineasJson:  string | null | undefined,
): ItemPDF[] | null {

  // ── 1. lineasJson (fuente más estructurada) ─────────────────────────────────
  if (lineasJson) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed: any[] = JSON.parse(lineasJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const items: ItemPDF[] = parsed.map(l => ({
          nombreItem:         String(l.nombreItem  ?? l.nombre   ?? 'Ítem'),
          descripcionItem:    l.descripcionItem    ?? l.descripcion ?? undefined,
          cantidadItem:       Number(l.cantidadItem ?? l.cantidad ?? 1),
          precioUnitarioItem: Number(l.precioUnitarioItem ?? l.precio ?? 0),
          descuentoMonto:     Number(l.descuentoMonto ?? l.descuento ?? 0) || undefined,
          tasaItbis:          Number(l.tasaItbis  ?? l.tasa     ?? 0) || undefined,
          subtotalConItbis:   Number(l.subtotalConItbis ?? l.subtotal ?? 0),
          unidadMedida:       l.unidadMedida ?? undefined,
        }));
        if (items.length > 0) return items;
      }
    } catch { /* fall through */ }
  }

  // ── 2. xmlOriginal — parsear bloques <Item> con regex ──────────────────────
  if (!xmlOriginal) return null;

  try {
    // Capturar el contenido de cada bloque <Item ...> ... </Item>
    const bloques = [...xmlOriginal.matchAll(/<Item[\s\S]*?>([\s\S]*?)<\/Item>/gi)];
    if (bloques.length === 0) return null;

    const items: ItemPDF[] = bloques.map(m => {
      const b      = m[1];
      const nombre = tagVal(b, 'NombreItem')          || 'Ítem';
      const desc   = tagVal(b, 'DescripcionItem')     || undefined;
      const cant   = parseFloat(tagVal(b, 'CantidadItem')        || '1');
      const precio = parseFloat(tagVal(b, 'PrecioUnitarioItem')  || '0');
      const tasa   = parseFloat(tagVal(b, 'TasaImpuesto')        || '0');
      const total  = parseFloat(tagVal(b, 'SubTotalLinea')       || '0');
      const descM  = parseFloat(tagVal(b, 'DescuentoMonto')      || '0');
      const udm    = tagVal(b, 'UnidadMedidaItem') || undefined;

      return {
        nombreItem:         nombre,
        descripcionItem:    desc,
        cantidadItem:       isNaN(cant)   ? 1    : cant,
        precioUnitarioItem: isNaN(precio) ? 0    : precio,
        descuentoMonto:     descM > 0     ? descM : undefined,
        tasaItbis:          tasa  > 0     ? tasa  : undefined,
        subtotalConItbis:   isNaN(total)  ? 0    : total,
        unidadMedida:       udm,
      } satisfies ItemPDF;
    });

    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}
