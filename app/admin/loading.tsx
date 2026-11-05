import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

/** Mientras una sección del panel consulta la base: el esqueleto de una página con tabla. */
export default function CargandoAdmin() {
  return (
    <Box role="status" aria-label="Cargando" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Skeleton variant="text" width={220} height={36} />
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={76} />)}
      </Box>
      <Skeleton variant="rounded" height={48} />
      <Skeleton variant="rounded" height={360} />
    </Box>
  );
}
