'use client';

/**
 * Botón de impresión para reportes. Dispara el diálogo nativo del navegador
 * (imprimir o guardar como PDF) sobre el `.print-area` del ReportShell, de modo
 * que el PDF salga tal cual se ve la pantalla. Complementa —no reemplaza— el
 * export a Excel.
 */
import { Printer } from 'lucide-react';
import Button from '@mui/material/Button';

export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      variant="outlined"
      disableElevation
      startIcon={<Printer style={{ width: 16, height: 16 }} />}
      sx={{ px: 2, py: 1, borderRadius: '8px', textTransform: 'none', fontWeight: 500, borderColor: '#0d9488', color: '#0f766e', '&:hover': { borderColor: '#0d9488', bgcolor: '#f0fdfa' }, whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      Imprimir / PDF
    </Button>
  );
}
