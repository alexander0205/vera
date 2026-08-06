'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { MessageCircle, CheckCircle } from 'lucide-react';

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };
const cardHeaderSx = { px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 };
const cardContentSx = { px: 3, py: 3 };

interface Estado {
  configurado: boolean;
  conectado?: boolean;
  numeroWhatsapp?: string | null;
  connectUrl?: string;
}

export function WhatsAppCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ configurado: false });

  async function refrescarEstado() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/estado', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo consultar el estado.'); return; }
      setEstado(data);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refrescarEstado().finally(() => setLoading(false)); }, []);

  async function conectar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/conectar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo iniciar la conexión.'); return; }
      // El negocio ya quedó creado del lado de crm-escolar — si el usuario
      // cierra el popup sin terminar, un segundo click en "Conectar" volvería
      // a llamar este endpoint y el backend correctamente daría 409 ("ya
      // configurado"). Actualizamos el estado local ya mismo para que el botón
      // pase a "Verificar conexión" y no se pueda reintentar "Conectar" de nuevo.
      setEstado({ configurado: true, conectado: false, connectUrl: data.connectUrl });
      window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function reconectar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp/estado', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo generar el link.'); return; }
      setEstado(data);
      if (data.connectUrl) window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={cardSx}>
      <Box sx={cardHeaderSx}>
        <MessageCircle size={16} color="#3658e1" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>WhatsApp Business</Typography>
      </Box>
      <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          Conecta el WhatsApp de tu negocio para enviar facturas y recordatorios de cobro directo por WhatsApp.
        </Typography>

        {error && <Alert severity="error" sx={{ borderRadius: '8px' }}>{error}</Alert>}

        {loading ? (
          <CircularProgress size={24} sx={{ color: '#3658e1' }} />
        ) : !estado.configurado ? (
          <Button variant="contained" disableElevation onClick={conectar} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' }, alignSelf: 'flex-start' }}>
            Conectar WhatsApp
          </Button>
        ) : estado.conectado ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#15803d' }}>
            <CheckCircle size={18} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Conectado: {estado.numeroWhatsapp}
            </Typography>
          </Box>
        ) : (
          <Button variant="outlined" onClick={reconectar} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', alignSelf: 'flex-start' }}>
            Verificar conexión
          </Button>
        )}
      </Box>
    </Box>
  );
}
