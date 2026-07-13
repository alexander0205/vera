'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { CheckCircle, Download, Printer } from 'lucide-react';
import { TIPOS_ECF } from '@/lib/ecf/types';

export function ModalPreviewPDF({
  open, onOpenChange, tipoEcf, previewUrl, loading, onEmitir,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipoEcf: string;
  /** Object URL (blob) del PDF de vista previa — NO crea factura en DB. */
  previewUrl: string | null;
  loading: boolean;
  onEmitir: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: '16px',
            height: '95dvh',
            maxHeight: '95dvh',
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0.5, sm: 2 },
          },
        } as object,
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          px: { xs: 2, md: 3 },
          pt: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          fontSize: { xs: '0.875rem', md: '1rem' },
          fontWeight: 600,
        }}
      >
        <Typography
          component="span"
          variant="inherit"
          sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          Vista previa — {TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? 'Comprobante'}
        </Typography>
        <Box
          component="span"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 400,
            color: '#92400e',
            bgcolor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '4px',
            px: 0.75,
            py: 0.25,
          }}
        >
          BORRADOR
        </Box>
      </DialogTitle>

      {/* PDF area */}
      <DialogContent
        sx={{ p: 0, flexGrow: 1, minHeight: 0, bgcolor: '#f3f4f6', display: 'flex', flexDirection: 'column' }}
      >
        {previewUrl ? (
          <Box
            component="iframe"
            src={previewUrl}
            title="Vista previa del comprobante"
            sx={{ width: '100%', height: '100%', flexGrow: 1, border: 'none' }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, color: '#4b5563', gap: 1 }}>
            <CircularProgress size={24} sx={{ color: '#6b7280' }} />
            <Typography variant="body2">Cargando PDF…</Typography>
          </Box>
        )}
      </DialogContent>

      {/* Footer actions */}
      <DialogActions
        sx={{
          px: { xs: 2, md: 3 },
          py: { xs: 1.5, md: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: '#fff',
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Button
          variant="text"
          size="small"
          onClick={() => onOpenChange(false)}
          sx={{ textTransform: 'none', color: '#6b7280', width: { xs: '100%', sm: 'auto' } }}
        >
          ← Volver a editar
        </Button>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
          {previewUrl && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Printer size={14} />}
                onClick={() => window.open(previewUrl, '_blank')}
                sx={{ textTransform: 'none', color: '#4b5563', borderColor: '#e5e7eb' }}
              >
                Imprimir
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download size={14} />}
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewUrl;
                  a.download = 'vista-previa.pdf';
                  a.click();
                }}
                sx={{ textTransform: 'none', color: '#4b5563', borderColor: '#e5e7eb' }}
              >
                Descargar
              </Button>
            </>
          )}
          <Button
            variant="contained"
            size="small"
            disabled={loading}
            onClick={onEmitir}
            disableElevation
            startIcon={loading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <CheckCircle size={14} />}
            sx={{ textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
          >
            Emitir
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
