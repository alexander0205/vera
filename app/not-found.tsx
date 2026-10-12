/**
 * 404 — la página que no está.
 *
 * Era la del starter: en inglés, un círculo naranja suelto de icono y un
 * «Back to Home» que mandaba a `/`. Tres problemas: el idioma, el color —el
 * naranja no es de la marca y aquí leía como error grave— y sobre todo el
 * destino, porque a quien ya entró no le sirve la portada pública.
 *
 * Se sale por donde de verdad se quiere salir: el panel, o atrás. Y el isotipo
 * de fondo hace de marca sin necesidad de una ilustración inventada.
 */

import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { LayoutDashboard, Search } from 'lucide-react';
import { Isotipo } from '@/lib/marca/isotipo';
import { BotonVolver } from './_boton-volver';

export default function NotFound() {
  return (
    <Box
      component="main"
      sx={{
        position: 'relative', overflow: 'hidden',
        minHeight: '100dvh', bgcolor: '#f9fafb',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        px: 2,
      }}
    >
      {/* El lazo infinito, muy tenue y saliéndose del encuadre. Decorativo:
          no lleva texto encima que dependa de él. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', bottom: -140, right: -160,
          opacity: 0.05, pointerEvents: 'none',
          display: { xs: 'none', sm: 'block' },
        }}
      >
        <Isotipo size={560} color="#3658e1" />
      </Box>

      <Box sx={{ position: 'relative', maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <Typography
          sx={{
            fontFamily: 'var(--font-display)',
            fontSize: { xs: '4.5rem', sm: '5.5rem' },
            fontWeight: 800, lineHeight: 1,
            letterSpacing: '-0.04em',
            color: '#3658e1',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          404
        </Typography>

        <Typography
          variant="h5"
          sx={{ fontWeight: 700, color: '#111827', mt: 2, letterSpacing: '-0.02em', textWrap: 'balance' }}
        >
          Esta página no existe
        </Typography>

        <Typography sx={{ color: '#6b7280', mt: 1.5, fontSize: '0.9375rem', lineHeight: 1.6 }}>
          Puede que la hayamos movido, que el enlace esté viejo, o que se haya
          colado un carácter de más en la dirección.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mt: 4, flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained" disableElevation
              startIcon={<LayoutDashboard style={{ width: 16, height: 16 }} />}
              sx={{
                borderRadius: '10px', textTransform: 'none', fontWeight: 600,
                bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' },
              }}
            >
              Ir al panel
            </Button>
          </Link>
          <BotonVolver />
        </Box>

        {/* La búsqueda global cubre el caso real detrás de casi todo 404:
            se buscaba una factura, un cliente o un producto concreto. */}
        <Typography sx={{ color: '#9ca3af', fontSize: '0.8125rem', mt: 3.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Search style={{ width: 13, height: 13 }} />
          ¿Buscabas algo en concreto? Pulsa
          <Box component="kbd" sx={{
            px: 0.75, py: 0.125, border: '1px solid #e5e7eb', borderRadius: '5px',
            bgcolor: '#fff', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280',
          }}>
            ⌘K
          </Box>
          dentro del sistema.
        </Typography>
      </Box>
    </Box>
  );
}
