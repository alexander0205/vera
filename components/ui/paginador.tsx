'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/**
 * Paginador de listados.
 *
 * Enseña siempre el total y el tramo que se está viendo. Eso importa más que
 * los botones: sin el total, una lista cortada en la fila cincuenta parece la
 * lista completa, y quien la mira no tiene forma de saber que falta algo.
 *
 * No usa el `Pagination` de MUI a propósito. Ese pinta la rueda de números
 * (1 2 3 … 47), que aquí sobra: los listados se recorren de corrido y el dato
 * que hace falta es cuántos faltan, no saltar a la página 31.
 */
export function Paginador({
  pagina,
  paginas,
  total,
  porPagina,
  onCambiar,
  cargando = false,
}: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
  cargando?: boolean;
}) {
  if (total === 0) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <Box
      sx={{
        display:        'flex',
        flexWrap:       'wrap',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            1.5,
        borderTop:      1,
        borderColor:    'divider',
        px:             2,
        py:             1.5,
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {total === 1 ? (
          '1 registro'
        ) : (
          <>
            Mostrando{' '}
            <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
              {desde}–{hasta}
            </Box>{' '}
            de{' '}
            <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
              {total.toLocaleString('es-DO')}
            </Box>
          </>
        )}
      </Typography>

      {paginas > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={() => onCambiar(pagina - 1)}
            disabled={pagina <= 1 || cargando}
            startIcon={<ChevronLeftIcon fontSize="small" />}
            sx={{ color: 'text.secondary' }}
          >
            Anterior
          </Button>

          <Typography variant="body2" sx={{ px: 1, color: 'text.secondary' }}>
            {pagina} de {paginas}
          </Typography>

          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={() => onCambiar(pagina + 1)}
            disabled={pagina >= paginas || cargando}
            endIcon={<ChevronRightIcon fontSize="small" />}
            sx={{ color: 'text.secondary' }}
          >
            Siguiente
          </Button>
        </Box>
      )}
    </Box>
  );
}
