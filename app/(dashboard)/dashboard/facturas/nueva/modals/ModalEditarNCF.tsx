'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import { TIPOS_ECF } from '@/lib/ecf/types';
import type { SecuenciaInfo } from '../utils/types';

export function ModalEditarNCF({
  open, onClose, tipoEcf, secuencia,
  ncfSiguienteNum, setNcfSiguienteNum,
  ncfFechaVenc, setNcfFechaVenc,
  ncfPieFactura, setNcfPieFactura,
  ncfError, ncfSaving, onSave,
}: {
  open: boolean;
  onClose: () => void;
  tipoEcf: string;
  secuencia: SecuenciaInfo | null;
  ncfSiguienteNum: string;
  setNcfSiguienteNum: (v: string) => void;
  ncfFechaVenc: string;
  setNcfFechaVenc: (v: string) => void;
  ncfPieFactura: string;
  setNcfPieFactura: (v: string) => void;
  ncfError: string | null;
  ncfSaving: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 480, width: '100%' } } as object }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>
        Editar numeración
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#6b7280', mb: 0.5, display: 'block' }}>
              Nombre
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? ''}
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb' },
                '& .MuiInputBase-input': { color: '#4b5563' },
              }}
            />
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked
                readOnly
                size="small"
                sx={{ color: '#3658e1', '&.Mui-checked': { color: '#3658e1' } }}
              />
            }
            label={
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                Numeración automática
              </Typography>
            }
          />

          <Box>
            <Typography variant="caption" sx={{ color: '#6b7280', mb: 0.5, display: 'block' }}>
              Tipo de NCF
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={`E${tipoEcf}`}
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb' },
                '& .MuiInputBase-input': { color: '#4b5563', fontFamily: 'monospace' },
              }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Siguiente número
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              placeholder={secuencia?.encf?.slice(-8) ?? '1'}
              value={ncfSiguienteNum}
              onChange={(e) => setNcfSiguienteNum(e.target.value)}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Fecha de vencimiento
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={ncfFechaVenc}
              onChange={(e) => setNcfFechaVenc(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Pie de factura
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={3}
              placeholder="Texto que aparecerá al pie del comprobante..."
              value={ncfPieFactura}
              onChange={(e) => setNcfPieFactura(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3658e1',
                },
              }}
            />
          </Box>

          {ncfError && (
            <Typography variant="caption" sx={{ color: '#ef4444', px: 0.5 }}>
              {ncfError}
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
          disabled={ncfSaving}
          onClick={onSave}
          sx={{
            textTransform: 'none',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
            '&.Mui-disabled': { bgcolor: '#3658e180' },
          }}
        >
          {ncfSaving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={16} sx={{ color: 'inherit' }} />
              Guardando…
            </Box>
          ) : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
