'use client';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

/**
 * Lo que se ve mientras se resuelve de qué va la factura.
 *
 * Cuando el formulario nace de cargos escolares, el cliente y las líneas no
 * están al montar: llegan de una llamada. Sin esto se pintaba el formulario
 * vacío —«Buscar cliente…», una línea en blanco, total RD$0.00— y medio
 * segundo después todo cambiaba de golpe. Quien abría el cajón alcanzaba a
 * leer que no había nada y creía que el prefill había fallado.
 *
 * Tiene la forma del formulario, no un spinner centrado: así lo que aparece
 * después cae donde ya se estaba mirando, sin que la página salte.
 */
export function EsqueletoFactura({ conBarraLateral = true }: {
  /** El resumen y el pago de la derecha. Se ocultan en pantallas estrechas. */
  conBarraLateral?: boolean;
}) {
  return (
    <Box
      aria-busy="true"
      aria-live="polite"
      aria-label="Preparando la factura"
      sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: { xs: 1.5, sm: 2, md: 2.5 } }}
    >
      {/* Barra de tipo de comprobante + fecha + estado */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Skeleton variant="rounded" width={92} height={28} />
        <Skeleton variant="rounded" width={168} height={28} />
        <Skeleton variant="rounded" width={150} height={28} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="rounded" width={84} height={24} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 360px' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Tarjeta titulo>
            <Skeleton variant="rounded" height={40} />
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' } }}>
              <Skeleton variant="rounded" height={40} />
              <Skeleton variant="rounded" height={40} />
              <Skeleton variant="rounded" height={40} />
            </Box>
          </Tarjeta>

          <Tarjeta titulo>
            <Skeleton variant="rounded" width={240} height={40} />
          </Tarjeta>

          <Tarjeta titulo>
            {/* Tres renglones de la tabla de líneas. Tres y no una: el caso
                normal aquí es una familia con varios meses o varios hijos, y
                un solo renglón haría que el bloque creciera de golpe. */}
            <Skeleton variant="rounded" height={34} />
            {[0, 1, 2].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                <Skeleton variant="rounded" height={40} sx={{ flex: 2 }} />
                <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
                <Skeleton variant="rounded" height={40} width={72} />
                <Skeleton variant="rounded" height={40} width={110} />
              </Box>
            ))}
          </Tarjeta>
        </Box>

        {conBarraLateral && (
          <Box sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', gap: 2 }}>
            <Tarjeta>
              <Skeleton variant="text" width={110} height={22} />
              {[0, 1, 2].map((i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                  <Skeleton variant="text" sx={{ flex: 1 }} />
                  <Skeleton variant="text" width={80} />
                </Box>
              ))}
              <Skeleton variant="rounded" height={34} />
            </Tarjeta>
            <Tarjeta>
              <Skeleton variant="text" width={70} height={22} />
              <Skeleton variant="rounded" height={30} />
            </Tarjeta>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** El mismo marco blanco de `SectionCard`, sin su contenido. */
function Tarjeta({ titulo = false, children }: { titulo?: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {titulo && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Skeleton variant="rounded" width={24} height={24} />
          <Skeleton variant="text" width={170} height={22} />
        </Box>
      )}
      {children}
    </Box>
  );
}
