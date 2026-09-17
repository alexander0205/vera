'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { Camera, Copy, RefreshCw, Check } from 'lucide-react';
import { toast } from '@/lib/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface LinkResp { token: string | null; estado: string; url: string | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CapturaEnlaceBoton() {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [link, setLink] = useState<LinkResp | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmar, setConfirmar] = useState<'regenerar' | 'revocar' | null>(null);

  async function pintarQr(url: string | null) {
    if (!url) { setQr(null); return; }
    try { setQr(await QRCode.toDataURL(url, { width: 220, margin: 1 })); } catch { setQr(null); }
  }

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    try {
      const data: LinkResp = await fetcher('/api/compras/captura-link');
      setLink(data);
      await pintarQr(data.url);
    } catch {
      toast.error('No se pudo cargar el enlace');
    } finally {
      setCargando(false);
    }
  }

  async function accion(accion: 'regenerar' | 'revocar') {
    setCargando(true);
    try {
      const res = await fetch('/api/compras/captura-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      });
      const data: LinkResp = await res.json();
      setLink(data);
      await pintarQr(data.url);
      toast.success(accion === 'regenerar' ? 'Enlace regenerado' : 'Enlace desactivado');
    } catch {
      toast.error('No se pudo actualizar el enlace');
    } finally {
      setCargando(false);
      setConfirmar(null);
    }
  }

  async function copiar() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  const activo = link?.estado === 'abierto' && link.url;

  return (
    <>
      <Button onClick={abrir} variant="outlined" size="small" startIcon={<Camera style={{ width: 16, height: 16 }} />}>
        Enlace de captura
      </Button>

      <Dialog open={abierto} onClose={() => setAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Enlace para registrar compras con foto</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mb: 2 }}>
            Comparte este enlace o imprime el QR. Quien lo abra fotografía la factura y la lectura cae en la
            pestaña <b>Capturas</b> para que la revises y registres. El enlace no vence.
          </Typography>

          {cargando && !link ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          ) : activo ? (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr && <img src={qr} alt="QR del enlace" style={{ width: 200, height: 200 }} />}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0, border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.25, py: 0.75, fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link!.url}
                </Box>
                <Button onClick={copiar} size="small" variant="contained" startIcon={copiado ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}>
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </Box>
            </>
          ) : (
            <Alert severity="warning" sx={{ mb: 1 }}>El enlace está desactivado. Regenéralo para volver a recibir fotos.</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          {activo ? (
            <Button onClick={() => setConfirmar('revocar')} size="small" color="error" disabled={cargando}>Desactivar</Button>
          ) : <span />}
          <Button onClick={() => setConfirmar('regenerar')} size="small" disabled={cargando} startIcon={<RefreshCw style={{ width: 14, height: 14 }} />}>
            {activo ? 'Regenerar' : 'Regenerar enlace'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => { if (!o) setConfirmar(null); }}
        title={confirmar === 'revocar' ? '¿Desactivar el enlace?' : '¿Regenerar el enlace?'}
        description={confirmar === 'revocar'
          ? 'Nadie podrá enviar fotos hasta que lo vuelvas a generar. El QR impreso dejará de funcionar.'
          : 'El enlace actual (y su QR impreso) dejará de funcionar y se creará uno nuevo.'}
        confirmLabel={confirmar === 'revocar' ? 'Desactivar' : 'Regenerar'}
        destructive
        loading={cargando}
        onConfirm={() => { if (confirmar) accion(confirmar); }}
      />
    </>
  );
}
