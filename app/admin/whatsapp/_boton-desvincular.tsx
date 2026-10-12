'use client';

/**
 * Suelta el número propio de un colegio para poder volver a conectarlo.
 *
 * Pide confirmación escribiendo el nombre: es un botón pequeño en una lista de
 * veintitantas filas, y desvincular al colegio equivocado no se nota hasta que
 * a alguien deja de llegarle su aviso desde el número que reconoce.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { Unlink } from 'lucide-react';

export function BotonDesvincular({ teamId, nombre }: { teamId: number; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto]     = useState('');
  const [yendo, setYendo]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const coincide = texto.trim().toLowerCase() === nombre.trim().toLowerCase();

  async function desvincular() {
    setYendo(true); setError(null);
    try {
      const r = await fetch(`/api/admin/whatsapp/config?teamId=${teamId}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo desvincular');
      setAbierto(false); setTexto('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setYendo(false); }
  }

  return (
    <>
      <Box component="button" onClick={() => { setAbierto(true); setError(null); setTexto(''); }}
        title="Desvincular su número"
        sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', p: 0.5, flexShrink: 0, '&:hover': { color: '#dc2626' } }}>
        <Unlink size={14} />
      </Box>

      <Dialog open={abierto} onClose={() => !yendo && setAbierto(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Desvincular el número?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.6 }}>
              <strong>{nombre}</strong> dejará de usar su propio número y sus avisos
              volverán a salir por el de Zero. Sus conversaciones no se borran.
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#92400e', bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.25 }}>
              Esto no lo suelta de Meta: el número sigue vinculado a su cuenta de WhatsApp
              Business. Lo que se corta es que Zero lo use. Para volver a conectarlo hay que
              rehacer la conexión desde el CRM.
            </Typography>
            <TextField size="small" fullWidth autoFocus
              label={`Escribe "${nombre}" para confirmar`}
              value={texto} onChange={(e) => setTexto(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            {error && <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{error}</Typography>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setAbierto(false)} disabled={yendo}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" color="error" disableElevation
            onClick={desvincular} disabled={yendo || !coincide}
            startIcon={yendo ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {yendo ? 'Desvinculando…' : 'Desvincular'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
