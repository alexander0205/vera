/**
 * Los precios en texto, para quien los lee con un modelo: `llms.txt` y el MCP
 * público del sitio.
 *
 * Salen del catálogo (`lib/config/plans.ts`), con su bandera de cotización. Un
 * texto con cifras a mano es el que se queda viejo.
 */

import { ADDONS, LINEAS_PRODUCTO, PRODUCTOS_APARTE, lineaBajoCotizacion, planesDeLinea } from '@/lib/config/plans';

const usd = (n: number) => `US$${n}`;

/** Una línea por producto, con sus planes y su precio mensual. */
export function preciosDeLineas(): string {
  return LINEAS_PRODUCTO.map(l => {
    if (lineaBajoCotizacion(l.key)) {
      return `- **${l.nombre}** — ${l.descripcion} Precio bajo cotización.`;
    }
    const planes = planesDeLinea(l.key);
    const detalle = planes.map(({ plan, precio }) => `${plan.name} ${usd(precio)}/mes`).join(' · ');
    return `- **${l.nombre}** — ${l.descripcion}\n  ${detalle}`;
  }).join('\n');
}

/** Los adicionales y lo que se contrata aparte, como Zero CRM. */
export function preciosAdicionales(): string {
  const sueltos = ADDONS.map(a => {
    const incluido = a.incluidoEn.length > 0 ? ` (incluido en ${a.incluidoEn.join(', ')})` : '';
    return `- **${a.name}** — +${usd(a.price)}/mes. ${a.descripcion}${incluido}`;
  });
  const aparte = PRODUCTOS_APARTE.map(p =>
    `- **${p.nombre}** — ${p.descripcion} Se contrata aparte de los planes; precio bajo cotización.`);
  return [...sueltos, ...aparte].join('\n');
}
