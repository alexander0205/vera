import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { evaluarAcceso } from '@/lib/asistente/acceso';
import { ReportesProgramados } from './reportes-programados';

/**
 * Reportes por correo del asistente. Solo dueños y administradores (los mismos
 * que pueden usarlo); cada persona ve y administra los suyos.
 */
export default async function AsistenteReportesPage() {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) redirect('/dashboard');

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Reportes por correo</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        Programa el envío automático de reportes en PDF a tu correo.
      </Typography>
      <ReportesProgramados />
    </Box>
  );
}
