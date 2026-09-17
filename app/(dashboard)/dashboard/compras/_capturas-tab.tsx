'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { Camera, Trash2 } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';
import { toast } from '@/lib/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Captura {
  id: number;
  origen: 'qr' | 'ia';
  proveedorNombre: string | null;
  proveedorRnc: string | null;
  ncf: string | null;
  fecha: string | null;
  totalCents: number | null;
  fotoUrl: string | null;
  creadoEn: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CapturasTab() {
  const { data, isLoading, mutate } = useSWR<{ capturas?: Captura[] }>('/api/compras/capturas', fetcher, { revalidateOnFocus: false });
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aDescartar, setADescartar] = useState<number | null>(null);
  const capturas = data?.capturas ?? [];

  async function descartar(id: number) {
    setOcupado(id);
    try {
      const res = await fetch(`/api/compras/capturas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'descartar' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Captura descartada');
      setADescartar(null);
      mutate();
    } catch {
      toast.error('No se pudo descartar');
    } finally {
      setOcupado(null);
    }
  }

  if (isLoading) return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress size={28} /></Box>;

  if (capturas.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
        <Camera style={{ width: 40, height: 40, color: '#9ca3af' }} />
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', mt: 1 }}>No hay capturas pendientes</Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#9ca3af', mt: 0.5 }}>
          Las fotos que envíen por el enlace de captura aparecen aquí para revisar y registrar.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {capturas.map((c) => (
        <Box key={c.id} sx={{ display: 'flex', gap: 1.5, border: '1px solid #e5e7eb', borderRadius: '12px', p: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {c.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.fotoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          ) : (
            <Box sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: '#f3f4f6', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Camera style={{ width: 20, height: 20, color: '#9ca3af' }} />
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 140 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                {c.proveedorNombre || 'Proveedor sin nombre'}
              </Typography>
              <Chip label={c.origen === 'qr' ? 'QR' : 'IA'} size="small" sx={{ height: 18, fontSize: '0.625rem', bgcolor: '#eef2fe', color: '#3658e1' }} />
            </Box>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: '#9ca3af' }}>
              {[c.proveedorRnc, c.ncf, c.fecha].filter(Boolean).join(' · ') || 'Sin datos leídos'}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {c.totalCents != null ? fmtDOP(c.totalCents) : '—'}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button component={Link} href={`/dashboard/compras/registrar?captura=${c.id}`} size="small" variant="contained">
              Registrar
            </Button>
            <Button onClick={() => setADescartar(c.id)} size="small" color="error" disabled={ocupado === c.id} sx={{ minWidth: 36, px: 1 }}>
              <Trash2 style={{ width: 16, height: 16 }} />
            </Button>
          </Box>
        </Box>
      ))}

      <ConfirmDialog
        open={aDescartar !== null}
        onOpenChange={(o) => { if (!o) setADescartar(null); }}
        title="¿Descartar esta captura?"
        description="No se registrará como compra. Podrás volver a enviar la foto por el enlace si hace falta."
        confirmLabel="Descartar"
        destructive
        loading={ocupado !== null}
        onConfirm={() => { if (aDescartar !== null) descartar(aDescartar); }}
      />
    </Box>
  );
}
