/**
 * Imprimir, PDF y Excel de lo que la pantalla tiene filtrado (todo, no solo la
 * página). Los usan Gastos y Pagos recibidos; cada una tiene su ruta de export
 * que acepta `formato=pdf|xlsx` e `inline=1` más los parámetros de su filtro.
 * «Imprimir» abre el PDF en el visor del navegador, que ya trae su botón de
 * imprimir. Sin hooks: sirve en páginas de servidor y de cliente.
 */
import { Printer, Download, FileText } from 'lucide-react';
import Box from '@mui/material/Box';

const sx = {
  display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, height: 36, borderRadius: '8px',
  fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap',
  border: '1px solid #d1d5db', color: '#374151', bgcolor: '#fff', '&:hover': { bgcolor: '#f9fafb' },
} as const;

const sxApagado = { ...sx, opacity: 0.5, pointerEvents: 'none' } as const;

export function BotonesExportar({ ruta, filtro, deshabilitado, testId }: {
  /** p. ej. `/api/gastos/export` */
  ruta: string;
  /** Query string del filtro, sin `?`. */
  filtro: string;
  deshabilitado?: boolean;
  testId?: string;
}) {
  const base = `${ruta}?${filtro ? `${filtro}&` : ''}`;
  const estilo = deshabilitado ? sxApagado : sx;
  const extra = deshabilitado ? { 'aria-disabled': true, tabIndex: -1 } : {};
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-testid={testId}>
      <Box component="a" href={`${base}formato=pdf&inline=1`} target="_blank" rel="noopener" sx={estilo} {...extra}>
        <Printer size={15} /> Imprimir
      </Box>
      <Box component="a" href={`${base}formato=pdf`} sx={estilo} {...extra}>
        <FileText size={15} /> PDF
      </Box>
      <Box component="a" href={`${base}formato=xlsx`} sx={estilo} {...extra}>
        <Download size={15} /> Excel
      </Box>
    </Box>
  );
}
