import { GraduationCap } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { MODULE_LABELS, MODULE_DESCRIPTIONS } from '@/lib/config/modules';

/**
 * Muro que ve quien entra a /escolar/* sin el módulo Gobernanza en su plan.
 *
 * No es un redirect silencioso a propósito (pedido Darian 2026-09-23): si la
 * empresa nunca lo tuvo, o se dio de baja del plan, el mensaje explica qué
 * falta y lleva a activarlo, en vez de rebotar sin decir nada. El guard de
 * suscripción del layout (teamHasModule) decide cuándo se muestra esto; aquí
 * solo está la pantalla.
 */
export function ModuloEscolarInactivo() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb', p: 3 }}>
      <Box sx={{ maxWidth: 440, textAlign: 'center' }}>
        <Box sx={{ width: 56, height: 56, borderRadius: '16px', bgcolor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <GraduationCap style={{ width: 28, height: 28, color: '#4f46e5' }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Activa el plan {MODULE_LABELS.escolar} para poder acceder
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
          Tu empresa no tiene {MODULE_LABELS.escolar} activo en su plan. {MODULE_DESCRIPTIONS.escolar}.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button
            href="/dashboard/suscripcion"
            variant="contained"
            disableElevation
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600 }}
          >
            Activar el plan
          </Button>
          <Button
            href="/dashboard"
            variant="text"
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
          >
            Volver
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
