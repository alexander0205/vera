'use client';

/**
 * Conectar y desconectar el número de Zero.
 *
 * Van juntos porque son el mismo interruptor visto por sus dos lados, y porque
 * cambiar de número es desconectar y volver a conectar: el CRM avisa que
 * conectar uno nuevo pisa al anterior, pero deja la WABA vieja suscrita al
 * webhook y siguen llegando entrantes de un canal muerto.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { Link2, RefreshCw, Unlink } from 'lucide-react';

const CONFIRMACION = 'DESCONECTAR';

export function BotonConectar({ yaVinculado, puedeEnviar, empresasQueDependen }: {
  yaVinculado: boolean;
  /**
   * Cambia lo que ofrece el botón. Sin esto decía «Terminar de activar» incluso
   * con el número ya enviando, o sea invitaba a arreglar algo que funciona.
   */
  puedeEnviar: boolean | null;
  /** Cuántos colegios se quedarían sin avisos. Se le dice al usuario antes. */
  empresasQueDependen: number;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState('');
  const [soltando, setSoltando] = useState(false);

  const [esperando, setEsperando] = useState(false);
  const vigilante = useRef<ReturnType<typeof setInterval> | null>(null);

  const dejarDeVigilar = useCallback(() => {
    if (vigilante.current) { clearInterval(vigilante.current); vigilante.current = null; }
    setEsperando(false);
  }, []);

  useEffect(() => dejarDeVigilar, [dejarDeVigilar]);

  /**
   * La conexión ocurre en OTRA ventana, así que esta pantalla no se entera de
   * nada por su cuenta: se quedaba diciendo «no envía» después de conectar bien.
   *
   * Se vigilan las dos señales, y no solo el cierre de la ventana: hay quien
   * termina el popup y lo deja abierto, y hay quien lo cierra a mitad. Con
   * `closed` sola la pantalla se queda congelada en el primer caso; con el
   * sondeo solo, en el segundo se queda girando para siempre.
   *
   * `window.closed` sí se puede leer de una ventana de otro dominio — es de lo
   * poquísimo que el navegador deja mirar a través del origen.
   */
  const vigilar = useCallback((ventana: Window | null) => {
    dejarDeVigilar();
    setEsperando(true);
    let vueltas = 0;
    vigilante.current = setInterval(async () => {
      vueltas++;
      try {
        const r = await fetch('/api/admin/whatsapp/estado');
        const d = await r.json();
        if (r.ok && d.puedeEnviar === true) {
          dejarDeVigilar();
          ventana?.close();
          router.refresh();
          return;
        }
      } catch { /* si falla una consulta, se reintenta en la siguiente vuelta */ }

      if (ventana?.closed) { dejarDeVigilar(); router.refresh(); return; }

      // Tope de 5 minutos: si nadie termina el popup, esto no puede quedarse
      // consultando el resto de la tarde.
      if (vueltas > 100) { dejarDeVigilar(); router.refresh(); }
    }, 3000);
  }, [dejarDeVigilar, router]);

  async function conectar() {
    setCargando(true); setError(null);
    // La ventana se abre ANTES del fetch: si se abre después, el navegador ya
    // no la considera consecuencia de un clic y la bloquea como emergente.
    const ventana = window.open('', '_blank');
    try {
      const r = await fetch('/api/admin/whatsapp/conectar', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo generar el enlace');
      if (ventana) { ventana.location.href = d.connectUrl; vigilar(ventana); }
      else window.location.href = d.connectUrl;   // el navegador bloqueó la ventana
    } catch (e) {
      ventana?.close();
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setCargando(false); }
  }

  async function desconectar() {
    setSoltando(true); setError(null);
    try {
      const r = await fetch('/api/admin/whatsapp/conectar', { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo desconectar');
      setConfirmando(false); setTexto('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setSoltando(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Box component="button" onClick={conectar} disabled={cargando}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, border: 'none', cursor: 'pointer',
            bgcolor: '#3658e1', color: '#fff', borderRadius: '8px', px: 2, py: 1,
            fontSize: '0.8125rem', fontWeight: 600, '&:hover': { bgcolor: '#2a45c4' },
            '&:disabled': { opacity: 0.6, cursor: 'default' },
          }}>
          {cargando
            ? <CircularProgress size={14} sx={{ color: '#fff' }} />
            : yaVinculado ? <RefreshCw size={14} /> : <Link2 size={14} />}
          {!yaVinculado ? 'Conectar WhatsApp'
            : puedeEnviar ? 'Reconectar' : 'Terminar de activar'}
        </Box>

        {yaVinculado && (
          <Box component="button" onClick={() => { setConfirmando(true); setError(null); setTexto(''); }}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
              bgcolor: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px',
              px: 2, py: 1, fontSize: '0.8125rem', fontWeight: 600, '&:hover': { bgcolor: '#fef2f2' },
            }}>
            <Unlink size={14} /> Desconectar
          </Box>
        )}
      </Box>

      {esperando && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#eef2fe', border: '1px solid #e0e7fd', borderRadius: '8px', px: 1.5, py: 1 }}>
          <CircularProgress size={13} sx={{ color: '#3658e1' }} />
          <Typography sx={{ fontSize: '0.75rem', color: '#24377d' }}>
            Esperando a que termines en Meta… esta pantalla se actualiza sola.
          </Typography>
          <Box component="button" onClick={() => { dejarDeVigilar(); router.refresh(); }}
            sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: '#3658e1', textDecoration: 'underline', p: 0 }}>
            Ya terminé
          </Box>
        </Box>
      )}

      <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', maxWidth: 560, lineHeight: 1.6 }}>
        Conectar abre el popup de Meta; hace falta la cuenta de Facebook Business y, si lo pide,
        el PIN de seis dígitos del número. Para <strong>cambiar de número</strong>, desconecta
        primero: conectar uno nuevo encima deja la cuenta vieja recibiendo mensajes.
      </Typography>

      {error && <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{error}</Typography>}

      <Dialog open={confirmando} onClose={() => !soltando && setConfirmando(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Desconectar el número de Zero?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.6 }}>
              Se desuscribe la cuenta en Meta y se borran las credenciales. Las conversaciones
              y su historial se conservan.
            </Typography>
            {empresasQueDependen > 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#991b1b', bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.25, lineHeight: 1.6 }}>
                <strong>{empresasQueDependen}</strong>{' '}
                {empresasQueDependen === 1 ? 'empresa sale' : 'empresas salen'} por este número.
                Hasta que se conecte otro, sus avisos por WhatsApp <strong>no salen</strong>.
              </Typography>
            )}
            <TextField size="small" fullWidth autoFocus
              label={`Escribe ${CONFIRMACION} para confirmar`}
              value={texto} onChange={(e) => setTexto(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            {error && <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{error}</Typography>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setConfirmando(false)} disabled={soltando}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" color="error" disableElevation
            onClick={desconectar} disabled={soltando || texto.trim() !== CONFIRMACION}
            startIcon={soltando ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {soltando ? 'Desconectando…' : 'Desconectar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
