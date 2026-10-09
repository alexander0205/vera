'use client';

import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface Props {
  comentario: string;
  setComentario: (v: string) => void;
}

export function Comentarios({ comentario, setComentario }: Props) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.75 }}>Comentario interno</Typography>
      <TextField
        multiline
        rows={3}
        fullWidth
        size="small"
        placeholder="Escribe un comentario"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 280 } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
      />
      <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', mt: 0.5, textAlign: 'right' }}>
        {comentario.length}/280
      </Typography>
    </Box>
  );
}
