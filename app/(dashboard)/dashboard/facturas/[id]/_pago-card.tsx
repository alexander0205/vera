'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CreditCard, ChevronDown, FileX, User } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface PagoLineaHistorial {
  metodo:      string;
  valor:       string;
  cuenta?:     string;
  referencia?: string;
  fechaPago?:  string | null;
  notas?:      string;
  usuario?:    string;
}

export interface PagoData {
  recibido: boolean;
  metodo?:  string | null;
  cuenta?:  string | null;
  valorDOP: string;
  fecha?:   string | null;
  lineas?:  PagoLineaHistorial[];
}

interface Props {
  initial:  PagoData;
  totalDOP: string;
}

const METODO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
  cheque:        'Cheque',
  deposito:      'Depósito',
  otro:          'Otro',
};

const metodoLabel = (m: string) =>
  METODO_LABELS[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Pago');

const toCts = (dop: string) => Math.round((parseFloat(dop || '0') || 0) * 100);

export function PagoCard({ initial, totalDOP }: Props) {
  const [open, setOpen] = useState(true);

  const lineas    = initial.lineas ?? [];
  const pagadoCts = toCts(initial.valorDOP);
  const totalCts  = toCts(totalDOP);
  const saldoCts  = Math.max(totalCts - pagadoCts, 0);

  return (
    <Box
      data-pago-card
      sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        sx={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1.5,
          bgcolor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          '&:hover': { bgcolor: '#f9fafb' }, transition: 'background 0.1s',
        }}
      >
        <CreditCard size={16} color="#3658e1" style={{ flexShrink: 0 }} />
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}>
          Historial de pagos
        </Typography>
        {lineas.length > 0 && (
          <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{lineas.length}</Typography>
        )}
        <Box sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
          <ChevronDown size={16} color="#9ca3af" />
        </Box>
      </Box>

      {open && (
        <Box sx={{ px: 2, pb: 2 }}>
          {lineas.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 4 }}>
              <FileX size={40} color="#d1d5db" style={{ marginBottom: 12 }} strokeWidth={1.4} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Sin pagos registrados</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.5, maxWidth: 200 }}>
                Los pagos se registran desde Cuentas por cobrar.
              </Typography>
            </Box>
          ) : (
            <>
              {/* Lista de pagos */}
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', '& li + li': { borderTop: '1px solid #f3f4f6' } }}>
                {lineas.map((l, i) => (
                  <Box component="li" key={l.referencia ? `${i}-${l.referencia}` : i} sx={{ py: 1.5, '&:first-of-type': { pt: 0.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f2937' }}>
                        {metodoLabel(l.metodo)}
                      </Typography>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtDOP(toCts(l.valor))}
                      </Typography>
                    </Box>
                    <Box sx={{ mt: 0.25, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
                      {l.fechaPago && (
                        <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280' }}>{fmtFechaCorta(l.fechaPago)}</Typography>
                      )}
                      {l.usuario && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          <User size={11} color="#9ca3af" />
                          <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280' }}>{l.usuario}</Typography>
                        </Box>
                      )}
                      {l.referencia && (
                        <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', fontFamily: 'monospace' }}>{l.referencia}</Typography>
                      )}
                    </Box>
                    {l.notas && (
                      <Typography sx={{ mt: 0.5, fontSize: '0.6875rem', color: '#4b5563', fontStyle: 'italic', lineHeight: 1.4 }}>
                        {l.notas}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>

              {/* Resumen */}
              <Box sx={{ pt: 1.5, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Total pagado</Typography>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDOP(pagadoCts)}
                  </Typography>
                </Box>
                {totalCts > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Saldo</Typography>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: saldoCts === 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtDOP(saldoCts)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
