/** Lista de facturas — Server-friendly, responsive (cards en móvil / tabla en desktop). */

import Link from 'next/link';
import { Download } from 'lucide-react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { fmtMoneda, fmtFecha, type FacturaRow } from '@/lib/factura/core';

const ESTADO_STYLES: Record<string, { bgcolor: string; color: string; lineThrough?: boolean }> = {
  ACEPTADO:             { bgcolor: '#dcfce7', color: '#166534' },
  ACEPTADO_CONDICIONAL: { bgcolor: '#fef9c3', color: '#854d0e' },
  EN_PROCESO:           { bgcolor: '#dbeafe', color: '#1e40af' },
  RECHAZADO:            { bgcolor: '#fee2e2', color: '#991b1b' },
  BORRADOR:             { bgcolor: '#f3f4f6', color: '#374151' },
  ANULADO:              { bgcolor: '#f3f4f6', color: '#6b7280', lineThrough: true },
};

const THEAD_CELL = {
  px: 2,
  py: 1.25,
  fontWeight: 500,
  color: '#4b5563',
  bgcolor: '#f9fafb',
  fontSize: '0.875rem',
  borderBottom: '1px solid #e5e7eb',
} as const;

const TBODY_CELL = {
  px: 2,
  py: 1.5,
  fontSize: '0.875rem',
  borderColor: '#e5e7eb',
} as const;

// Etiqueta visible por estado (el valor interno BORRADOR se muestra como "Sin
// comprobante" — decisión de producto: no exponer "borrador" en la UI).
const ESTADO_LABEL: Record<string, string> = {
  ACEPTADO:             'Aceptado',
  ACEPTADO_CONDICIONAL: 'Aceptado condicional',
  EN_PROCESO:           'En proceso',
  RECHAZADO:            'Rechazado',
  BORRADOR:             'Sin comprobante',
  ANULADO:              'Anulado',
};

function EstadoBadge({ estado }: { estado: string }) {
  const style = ESTADO_STYLES[estado] ?? { bgcolor: '#f3f4f6', color: '#374151' };
  return (
    <Chip
      label={ESTADO_LABEL[estado] ?? estado}
      size="small"
      sx={{
        height: 20,
        fontSize: '0.75rem',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        bgcolor: style.bgcolor,
        color: style.color,
        '& .MuiChip-label': style.lineThrough ? { textDecoration: 'line-through' } : undefined,
      }}
    />
  );
}

export function FacturasList({ facturas }: { facturas: FacturaRow[] }) {
  if (facturas.length === 0) {
    return (
      <Box sx={{ bgcolor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', p: { xs: 3, sm: 4 }, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
        Aún no has emitido facturas. Cuando emitas una, aparecerá aquí.
      </Box>
    );
  }

  return (
    <>
      {/* ─── Móvil: cards ─────────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1 }}>
        {facturas.map(f => (
          <Box key={f.id} sx={{ bgcolor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151', wordBreak: 'break-all' }}>{f.encf}</Box>
              <EstadoBadge estado={f.estado} />
            </Box>
            <Box sx={{ fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.razonSocialComprador ?? <Box component="span" sx={{ color: '#9ca3af' }}>Consumidor final</Box>}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
              <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{fmtFecha(f.createdAt)}</Box>
              <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                {fmtMoneda(f.montoTotal / 100)}
              </Box>
            </Box>
            <Button
              component="a"
              href={`/api/pdf/factura/${f.id}`}
              target="_blank"
              nativeButton={false}
              variant="text"
              startIcon={<Download style={{ width: 14, height: 14 }} />}
              sx={{ alignSelf: 'flex-start', textTransform: 'none', p: 0, minWidth: 0, mt: 0.5, fontSize: '0.75rem', color: '#ea580c', '&:hover': { color: '#c2410c', bgcolor: 'transparent' } }}
            >
              Descargar PDF
            </Button>
          </Box>
        ))}
      </Box>

      {/* ─── Desktop: tabla ───────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, bgcolor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <Table sx={{ '& td, & th': { borderColor: '#e5e7eb' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={THEAD_CELL}>e-NCF</TableCell>
              <TableCell sx={THEAD_CELL}>Cliente</TableCell>
              <TableCell sx={THEAD_CELL}>Fecha</TableCell>
              <TableCell align="right" sx={THEAD_CELL}>Total</TableCell>
              <TableCell align="center" sx={THEAD_CELL}>Estado</TableCell>
              <TableCell align="right" sx={{ ...THEAD_CELL, width: 80 }}>PDF</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {facturas.map(f => (
              <TableRow key={f.id} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                <TableCell sx={{ ...TBODY_CELL, fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151' }}>{f.encf}</TableCell>
                <TableCell sx={{ ...TBODY_CELL, color: '#111827', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.razonSocialComprador ?? <Box component="span" sx={{ color: '#9ca3af' }}>Consumidor final</Box>}
                </TableCell>
                <TableCell sx={{ ...TBODY_CELL, color: '#4b5563' }}>{fmtFecha(f.createdAt)}</TableCell>
                <TableCell align="right" sx={{ ...TBODY_CELL, color: '#111827' }}>{fmtMoneda(f.montoTotal / 100)}</TableCell>
                <TableCell align="center" sx={TBODY_CELL}>
                  <EstadoBadge estado={f.estado} />
                </TableCell>
                <TableCell align="right" sx={TBODY_CELL}>
                  <IconButton
                    component="a"
                    href={`/api/pdf/factura/${f.id}`}
                    target="_blank"
                    nativeButton={false}
                    title="Descargar PDF"
                    size="small"
                    sx={{ color: '#ea580c', '&:hover': { color: '#c2410c', bgcolor: 'transparent' } }}
                  >
                    <Download style={{ width: 14, height: 14 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </>
  );
}
