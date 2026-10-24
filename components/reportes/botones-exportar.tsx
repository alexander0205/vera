'use client';

/**
 * Imprimir, PDF, Excel y CSV de lo que la pantalla tiene filtrado (todo, no solo la
 * página). Los usan las pantallas que tienen su propia ruta de export (Gastos,
 * Pagos recibidos, Facturas de venta, Libro diario, Mayor), que acepta
 * `formato=pdf|xlsx|csv` e `inline=1` más los parámetros de su filtro.
 *
 * «PDF», «Excel» y «CSV» son enlaces de descarga. «Imprimir» pide el PDF y abre el
 * diálogo de impresión (`imprimirPdf`): como enlace a una pestaña nueva, en un
 * navegador que descarga los PDF hacía lo mismo que «PDF».
 */
import { useState } from 'react';
import { Printer, Download, FileText, Loader2 } from 'lucide-react';
import Box from '@mui/material/Box';
import { toast } from 'sonner';
import { imprimirPdf } from '@/lib/reportes/imprimir-pdf';
import { Tooltip } from '@/components/ui/tooltip';

const sx = {
  display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, height: 36, borderRadius: '8px',
  fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
  border: '1px solid #d1d5db', color: '#374151', bgcolor: '#fff', '&:hover': { bgcolor: '#f9fafb' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
} as const;

const sxApagado = { ...sx, opacity: 0.5, pointerEvents: 'none' } as const;

export function BotonesExportar({ ruta, filtro, deshabilitado, testId, mostrarCsv = true, mostrarImprimir = true }: {
  /** p. ej. `/api/gastos/export` */
  ruta: string;
  /** Query string del filtro, sin `?`. */
  filtro: string;
  deshabilitado?: boolean;
  testId?: string;
  mostrarCsv?: boolean;
  /** Para estados contables que imprimen la propia pantalla. */
  mostrarImprimir?: boolean;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const base = `${ruta}?${filtro ? `${filtro}&` : ''}`;
  const estilo = deshabilitado ? sxApagado : sx;
  const extra = deshabilitado ? { 'aria-disabled': true, tabIndex: -1 } : {};

  async function imprimir() {
    setImprimiendo(true);
    try {
      const res = await fetch(`${base}formato=pdf&inline=1`);
      if (!res.ok) throw new Error('No se pudo preparar la impresión');
      await imprimirPdf(await res.blob());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir');
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-testid={testId}>
      {mostrarImprimir && (
        <Tooltip text="Abre la impresión del reporte">
          <Box component="button" type="button" sx={sx} disabled={deshabilitado || imprimiendo} onClick={imprimir}>
            {imprimiendo ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Imprimir
          </Box>
        </Tooltip>
      )}
      <Tooltip text="Descarga el reporte en PDF, listo para compartir">
        <Box component="a" href={`${base}formato=pdf`} sx={estilo} {...extra}>
          <FileText size={15} /> PDF
        </Box>
      </Tooltip>
      <Tooltip text="Descarga el reporte en Excel para seguir trabajando con los datos">
        <Box component="a" href={`${base}formato=xlsx`} sx={estilo} {...extra}>
          <Download size={15} /> Excel
        </Box>
      </Tooltip>
      {mostrarCsv && (
        <Tooltip text="Descarga el reporte en CSV, un archivo de texto simple">
          <Box component="a" href={`${base}formato=csv`} sx={estilo} {...extra}>
            <Download size={15} /> CSV
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}
