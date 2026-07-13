'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export function ModalNuevoPlazo({
  open, onClose, npNombre, setNpNombre, npDias, setNpDias, npError, onGuardar,
}: {
  open: boolean;
  onClose: () => void;
  npNombre: string;
  setNpNombre: (v: string) => void;
  npDias: string;
  setNpDias: (v: string) => void;
  npError: string | null;
  onGuardar: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ color: '#0d9488', fontWeight: 600 }}>
        Agregar nuevo término de pago
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {npError && (
          <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mb: 1 }}>
            {npError}
          </Typography>
        )}

        <TextField
          label="Nombre"
          required
          size="small"
          fullWidth
          placeholder="Ej: 45 días"
          value={npNombre}
          onChange={(e) => setNpNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGuardar()}
          autoFocus
          sx={{ mb: 2, mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        <TextField
          label="Días"
          required
          size="small"
          fullWidth
          type="number"
          placeholder="45"
          value={npDias}
          onChange={(e) => setNpDias(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGuardar()}
          slotProps={{ htmlInput: { min: 1, max: 365 } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ textTransform: 'none', color: '#4b5563', borderColor: '#e5e7eb' }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={onGuardar}
          disableElevation
          sx={{ textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          Aceptar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
