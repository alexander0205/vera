'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const PASOS = [
  { n: 1, nombre: 'Factura' },
  { n: 2, nombre: 'Pago y envío' },
] as const;

/**
 * En qué paso va la factura del cajón.
 *
 * Existe porque el paso 1 dejó de terminar en «Guardar»: ahora lleva a un
 * segundo paso, y sin esto el botón «Siguiente: pago y envío» aparecía sin
 * avisar de que quedaba algo detrás. Dos pastillas dicen cuántos pasos hay y
 * en cuál se está, que es todo lo que hace falta saber.
 *
 * El paso 3 —la factura ya emitida— no sale aquí: cuando llega, el formulario
 * entero se sustituye por el comprobante y no hay a dónde volver.
 */
export function Pasos({ paso }: { paso: 1 | 2 }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.25,
      maxWidth: 980, mx: 'auto', width: '100%', mb: 1.75,
    }}>
      {PASOS.map((x, i) => {
        const activo = paso === x.n;
        const hecho = paso > x.n;
        return (
          <Box key={x.n} sx={{ display: 'contents' }}>
            {i > 0 && <Box component="span" sx={{ flex: 1, height: '1px', bgcolor: '#E2E6F2' }} />}
            <Box
              component="span"
              aria-current={activo ? 'step' : undefined}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                height: 28, pl: 0.5, pr: 1.5, borderRadius: 999,
                border: '1px solid',
                borderColor: activo ? '#C3CDEB' : hecho ? '#D6EDE1' : '#EDEFF5',
                bgcolor: activo ? '#EDF1FE' : hecho ? '#F5FBF8' : '#fff',
                whiteSpace: 'nowrap',
              }}
            >
              <Box component="span" sx={{
                width: 20, height: 20, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                fontSize: '0.65625rem', fontWeight: 600, color: '#fff',
                bgcolor: activo ? '#3658E1' : hecho ? '#0F7A4A' : '#C3C8D4',
              }}>
                {x.n}
              </Box>
              <Typography component="span" sx={{
                fontSize: '0.75rem', fontWeight: 600,
                color: activo ? '#102A72' : hecho ? '#0F7A4A' : '#8A90A0',
              }}>
                {x.nombre}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
