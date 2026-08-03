'use client';

/**
 * RailBrand — cabecera del rail de navegación, igual en los 4 módulos.
 *
 * Antes cada rail dibujaba su propia versión: mismo layout, pero cada uno con
 * su ícono (Store / GraduationCap / Building2 / "z") y su sub-rótulo. Como el
 * rail está pegado al header, se leía como una sola barra con cuatro marcas
 * distintas — el usuario notaba que "el nav cambia" al moverse entre módulos.
 *
 * Ahora la marca es una sola: el cuadro con la "z" y el nombre del módulo
 * debajo. El ícono propio de cada módulo sigue existiendo, pero en el switcher
 * del header, que es donde se compara un módulo contra otro.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MODULE_LABELS, type ModuleKey } from '@/lib/config/modules';

export function RailBrand({ modulo }: { modulo: ModuleKey }) {
  return (
    <Box
      sx={{
        px: 2, py: 2,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 1,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: 28, height: 28, bgcolor: '#fff', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Typography sx={{ color: '#0f766e', fontWeight: 900, fontSize: '0.875rem', lineHeight: 1 }}>z</Typography>
      </Box>
      {/* nav-text: el rail lo oculta cuando está colapsado a solo iconos. */}
      <Box className="nav-text" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>Zero</Typography>
        <Typography sx={{ color: 'rgba(204,251,241,0.85)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {MODULE_LABELS[modulo]}
        </Typography>
      </Box>
    </Box>
  );
}
