'use client';

import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface TerminosProps {
  terminosCondiciones: string;
  setTerminos: (v: string) => void;
}

interface NotasProps {
  notas: string;
  setNotas: (v: string) => void;
}

export function Terminos({ terminosCondiciones, setTerminos }: TerminosProps) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.75 }}>Términos y condiciones</Typography>
      <TextField
        multiline
        minRows={4}
        fullWidth
        size="small"
        placeholder="Ej: Pago en cuenta corriente 000000001..."
        value={terminosCondiciones}
        onChange={(e) => setTerminos(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
      />
    </Box>
  );
}

export function Notas({ notas, setNotas }: NotasProps) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.75 }}>Notas</Typography>
      <TextField
        multiline
        minRows={4}
        fullWidth
        size="small"
        placeholder="Notas internas o para el cliente..."
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 500 } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
      />
      {notas.length > 0 && (
        <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', mt: 0.5, textAlign: 'right' }}>
          {notas.length}/500
        </Typography>
      )}
    </Box>
  );
}
