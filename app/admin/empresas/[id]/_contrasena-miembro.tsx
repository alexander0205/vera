'use client';

import { useState, useTransition } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Typography, IconButton, InputAdornment,
} from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  teamId: number;
  userId: number;
  email:  string;
  action: (formData: FormData) => Promise<{ error?: string }>;
}

// Sin 0/O ni 1/l/I: la clave se dicta por teléfono o se copia de un WhatsApp.
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generar(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => LETRAS[b % LETRAS.length]).join('');
}

/**
 * El platform-admin le pone una contraseña nueva a un miembro. Es la de su
 * cuenta, no la de la empresa: si la persona está en varias, cambia en todas.
 */
export function ContrasenaMiembro({ teamId, userId, email, action }: Props) {
  const [abierto, setAbierto]     = useState(false);
  const [clave, setClave]         = useState('');
  const [ver, setVer]             = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [hecho, setHecho]         = useState(false);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setClave(''); setVer(false); setError(null); setAbierto(true);
  }

  function guardar() {
    setError(null);
    if (clave.length < 8) { setError('Mínimo 8 caracteres.'); return; }
    const fd = new FormData();
    fd.set('teamId', String(teamId));
    fd.set('userId', String(userId));
    fd.set('password', clave);
    startTransition(async () => {
      try {
        const r = await action(fd);
        if (r.error) { setError(r.error); return; }
        setAbierto(false);
        setHecho(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
      }
    });
  }

  return (
    <>
      <Button
        size="small"
        onClick={abrir}
        sx={{ textTransform: 'none', minWidth: 0, p: 0, fontWeight: 500, color: '#374151' }}
      >
        {hecho ? '✓ Contraseña cambiada' : 'Cambiar contraseña'}
      </Button>

      <Dialog open={abierto} onClose={() => !pending && setAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Cambiar contraseña</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
            {email}. Es la contraseña de su cuenta: si está en otras empresas, cambia también allí.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Contraseña nueva"
            type={ver ? 'text' : 'password'}
            value={clave}
            onChange={e => setClave(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); }}
            error={!!error}
            helperText={error ?? 'Mínimo 8 caracteres.'}
            autoComplete="new-password"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'}>
                      {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            size="small"
            onClick={() => { setClave(generar()); setVer(true); setError(null); }}
            sx={{ textTransform: 'none', mt: 1, p: 0, minWidth: 0 }}
          >
            Generar una
          </Button>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAbierto(false)} disabled={pending} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending} variant="contained" disableElevation sx={{ textTransform: 'none' }}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
