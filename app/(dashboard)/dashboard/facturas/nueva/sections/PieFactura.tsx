'use client';

import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface Props {
  pieFactura: string;
  setPieFactura: (v: string) => void;
  /** Etiqueta del campo. Por defecto "Pie de factura"; en NC/ND → "Pie del documento". */
  label?: string;
}

/**
 * Inline pie-de-factura editor — rendered inside an AccordionSection.
 * The accordion provides the section header / collapse chrome.
 */
export function PieFactura({ pieFactura, setPieFactura, label = 'Pie de factura' }: Props) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.75 }}>{label}</Typography>
      <TextField
        multiline
        minRows={3}
        fullWidth
        size="small"
        placeholder="Visible en la impresión del documento"
        value={pieFactura}
        onChange={(e) => setPieFactura(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
      />
    </Box>
  );
}
