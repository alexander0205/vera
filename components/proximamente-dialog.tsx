'use client';

import { useState, useCallback } from 'react';
import { MessageCircle, Phone, X, Sparkles } from 'lucide-react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';

/**
 * Dialog reutilizable que se muestra cuando un usuario clickea una feature
 * que NO está implementada aún. Ofrece contacto vía WhatsApp.
 *
 * Uso 1 — vía hook:
 *   const { openProximamente, dialog } = useProximamenteDialog();
 *   <button onClick={() => openProximamente('Conduces')}>+ Conduce</button>
 *   {dialog}
 *
 * Uso 2 — vía componente standalone:
 *   <ProximamenteButton feature="Duplicar factura">Duplicar</ProximamenteButton>
 */

const WHATSAPP_NUMBER = '18293596602';
const WHATSAPP_DISPLAY = '+1 (829) 359-6602';

interface DialogProps {
  open: boolean;
  feature: string;
  onClose: () => void;
}

export function ProximamenteDialog({ open, feature, onClose }: DialogProps) {
  const message = encodeURIComponent(
    `Hola, estoy interesado en la funcionalidad "${feature}" de EmiteDO. ¿Pueden habilitarla?`,
  );
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="proximamente-title"
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 448, width: '100%', p: 3 } } as object }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
        <Box sx={{ height: 40, width: 40, borderRadius: '9999px', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles style={{ width: 20, height: 20, color: '#0f766e' }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="proximamente-title" sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
            {feature} — Próximamente
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>
            Esta funcionalidad aún no está habilitada en tu cuenta.
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          aria-label="Cerrar"
          sx={{ color: '#9ca3af', p: 0.5, m: '-4px', '&:hover': { color: '#374151', bgcolor: 'transparent' } }}
        >
          <X style={{ width: 20, height: 20 }} />
        </IconButton>
      </Box>

      <Box sx={{ bgcolor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', p: 2, mb: 2 }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: 1.625 }}>
          ¿La necesitas ya? Estaré muy feliz de habilitar esta funcionalidad
          para ti. <Box component="strong" sx={{ fontWeight: 700 }}>Contáctame y la activamos:</Box>
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button
          component="a"
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          nativeButton={false}
          fullWidth
          variant="contained"
          disableElevation
          startIcon={<MessageCircle style={{ width: 20, height: 20 }} />}
          sx={{
            justifyContent: 'flex-start',
            gap: 1.5,
            py: 1.5,
            px: 2,
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 500,
            color: '#fff',
            bgcolor: '#25D366',
            '&:hover': { bgcolor: '#1ebe5b' },
          }}
        >
          WhatsApp · {WHATSAPP_DISPLAY}
        </Button>
        <Button
          component="a"
          href={`tel:${WHATSAPP_NUMBER}`}
          nativeButton={false}
          fullWidth
          variant="outlined"
          startIcon={<Phone style={{ width: 20, height: 20, color: '#6b7280' }} />}
          sx={{
            justifyContent: 'flex-start',
            gap: 1.5,
            py: 1.5,
            px: 2,
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 500,
            color: '#1f2937',
            borderColor: '#d1d5db',
            '&:hover': { bgcolor: '#f9fafb', borderColor: '#d1d5db' },
          }}
        >
          Llamar · {WHATSAPP_DISPLAY}
        </Button>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', mt: 2 }}>
        Mientras tanto, puedes seguir usando el resto del sistema sin problemas.
      </Typography>
    </Dialog>
  );
}

/**
 * Hook que devuelve `openProximamente(featureName)` y el dialog para renderizar.
 */
export function useProximamenteDialog() {
  const [feature, setFeature] = useState<string | null>(null);
  const openProximamente = useCallback((f: string) => setFeature(f), []);
  const close = useCallback(() => setFeature(null), []);
  const dialog = <ProximamenteDialog open={feature !== null} feature={feature ?? ''} onClose={close} />;
  return { openProximamente, dialog };
}

/**
 * Botón standalone que abre el dialog al click.
 */
interface ButtonProps {
  feature: string;
  className?: string;
  children: React.ReactNode;
}

export function ProximamenteButton({ feature, className, children }: ButtonProps) {
  const { openProximamente, dialog } = useProximamenteDialog();
  return (
    <>
      <Button
        type="button"
        onClick={() => openProximamente(feature)}
        variant="text"
        {...(className ? { className } : {})}
        sx={{ textTransform: 'none' }}
      >
        {children}
      </Button>
      {dialog}
    </>
  );
}
