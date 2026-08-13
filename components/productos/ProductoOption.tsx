'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Cómo se ve un producto dentro de un buscador.
 *
 * Vivía dentro de la tabla de líneas de la factura, y por eso el resto del
 * sistema elegía productos con un `<select>` que solo enseñaba el nombre. En un
 * catálogo con «Material gastable 01», «02» y «03» eso no alcanza para saber
 * cuál es cuál, y el ajuste de inventario se hacía a ciegas.
 *
 * Está aquí para que sea UNA sola pinta: el día que se le añada el stock o la
 * categoría, se añade en los dos sitios a la vez.
 */
export interface ProductoOptionData {
  id: number;
  nombre: string;
  referencia?: string | null;
  descripcion?: string | null;
}

export function renderProductoOption(p: ProductoOptionData) {
  return (
    // Rejilla de dos columnas: la referencia en monoespaciado a la izquierda
    // —ancho fijo para que todas las filas se lean en columna— y el nombre a la
    // derecha, con la descripción debajo ocupando el ancho completo.
    <Box sx={{ display: 'grid', gridTemplateColumns: '5rem 1fr', alignItems: 'start', columnGap: 1.5, rowGap: 0.25 }}>
      <Typography
        component="span"
        title={p.referencia ?? undefined}
        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pt: '2px' }}
      >
        {p.referencia || '—'}
      </Typography>
      <Typography sx={{ minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.nombre}
      </Typography>
      {p.descripcion && (
        <Typography
          title={p.descripcion}
          sx={{ gridColumn: 'span 2', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#6b7280' }}
        >
          {p.descripcion}
        </Typography>
      )}
    </Box>
  );
}
