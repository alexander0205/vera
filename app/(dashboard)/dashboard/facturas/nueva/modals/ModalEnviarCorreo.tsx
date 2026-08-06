'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Mail as MailOutlineIcon } from 'lucide-react';

export function ModalEnviarCorreo({
  open, onClose, emailEnviar, setEmailEnviar, correoEncf, correoDocumentoId,
  emailSending, setEmailSending,
}: {
  open: boolean;
  onClose: () => void;
  emailEnviar: string;
  setEmailEnviar: (v: string) => void;
  correoEncf: string;
  correoDocumentoId: number | null;
  emailSending: boolean;
  setEmailSending: (v: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MailOutlineIcon size={20} color="#3658e1" />
          Enviar comprobante
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Correo electrónico del destinatario
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="email"
              placeholder="cliente@empresa.com"
              value={emailEnviar}
              onChange={(e) => setEmailEnviar(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {correoEncf && (
            <Typography variant="caption" sx={{ color: '#6b7280' }}>
              Se enviará el comprobante{' '}
              <Box
                component="span"
                sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#2a45c4' }}
              >
                {correoEncf}
              </Box>
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            color: '#4b5563',
            borderColor: '#e5e7eb',
            '&:hover': { borderColor: '#d1d5db', bgcolor: 'transparent' },
          }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          disableElevation
          disabled={emailSending || !emailEnviar.includes('@')}
          onClick={async () => {
            if (!correoDocumentoId) return;
            setEmailSending(true);
            try {
              await fetch(`/api/facturas/${correoDocumentoId}/enviar-correo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailEnviar }),
              });
              onClose();
            } finally {
              setEmailSending(false);
            }
          }}
          sx={{
            textTransform: 'none',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
            '&.Mui-disabled': { bgcolor: '#3658e180' },
          }}
        >
          {emailSending ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={16} sx={{ color: 'inherit' }} />
              Enviando…
            </Box>
          ) : 'Enviar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
