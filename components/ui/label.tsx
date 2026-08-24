'use client';

import * as React from 'react';
import Typography from '@mui/material/Typography';

/**
 * Etiqueta de campo.
 *
 * Es un `<label>` de verdad —no un `<span>` con aspecto de etiqueta— para que
 * `htmlFor` siga enfocando su campo y el lector de pantalla los relacione.
 *
 * Los valores repiten los que el formulario de factura ya usaba a mano
 * (`components/factura/form.tsx`): así las etiquetas de facturación y las de
 * colegios se ven iguales, que era justo lo que no pasaba cuando cada módulo
 * traía su propia librería.
 *
 * `className` se deja pasar porque medio sistema le manda utilidades de
 * espaciado; quitarlo obligaría a tocar los 26 sitios que la usan.
 */
function Label({ className, sx, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & {
  sx?: React.ComponentProps<typeof Typography>['sx'];
}) {
  return (
    <Typography
      component="label"
      className={className}
      sx={{
        display:       'block',
        fontSize:      '0.875rem',
        fontWeight:    500,
        lineHeight:    1,
        color:         '#374151',
        userSelect:    'none',
        // Réplica exacta de `peer-disabled:` de Tailwind: el campo deshabilitado
        // apaga su etiqueta. Se mantiene el selector porque los formularios que
        // marcan el input con `.peer` siguen esperando ese comportamiento.
        '.peer:disabled ~ &': { opacity: 0.5, cursor: 'not-allowed' },
        ...sx,
      }}
      {...props}
    />
  );
}

export { Label };
