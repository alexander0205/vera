'use client';

/**
 * Imprimir / PDF / Excel de un listado que vive en el navegador: arma el envío
 * con las filas tal como se ven y lo manda a `/api/export/listado`.
 *
 * Mismo aspecto que `BotonesExportar` (Gastos, Pagos, Facturas), que en cambio
 * son enlaces a rutas que consultan la base por su cuenta.
 */
import { useState } from 'react';
import { Printer, Download, FileText, Loader2 } from 'lucide-react';
import Box from '@mui/material/Box';
import { toast } from 'sonner';
import type { ListadoEnvio } from '@/lib/export/listado';
import { hoyRD } from '@/lib/utils/format';

const sx = {
  display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, height: 36, borderRadius: '8px',
  fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
  border: '1px solid #d1d5db', color: '#374151', bgcolor: '#fff', '&:hover': { bgcolor: '#f9fafb' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
} as const;

type Accion = 'imprimir' | 'pdf' | 'xlsx';

export function ExportarListado({ armar, deshabilitado, testId }: {
  /**
   * Arma el envío en el momento del clic (con el filtro y orden vigentes).
   * Puede ser asíncrono: las pantallas paginadas en el servidor piden ahí
   * todo el rango filtrado, no solo la página que enseñan.
   */
  armar: () => Omit<ListadoEnvio, 'formato' | 'inline'> | Promise<Omit<ListadoEnvio, 'formato' | 'inline'>>;
  deshabilitado?: boolean;
  testId?: string;
}) {
  const [ocupado, setOcupado] = useState<Accion | null>(null);

  async function exportar(accion: Accion) {
    // La ventana del «Imprimir» se abre ya, en el clic: abrirla después del
    // fetch la bloquea el navegador como ventana emergente.
    const ventana = accion === 'imprimir' ? window.open('', '_blank') : null;
    setOcupado(accion);
    try {
      const envio: ListadoEnvio = { ...(await armar()), formato: accion === 'xlsx' ? 'xlsx' : 'pdf', inline: accion === 'imprimir' };
      const res = await fetch('/api/export/listado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envio),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${envio.archivo}_${hoyRD()}.${envio.formato}`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      ventana?.close();
      toast.error(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setOcupado(null);
    }
  }

  const icono = (a: Accion, I: typeof Printer) => (ocupado === a ? <Loader2 size={15} className="animate-spin" /> : <I size={15} />);
  const off = deshabilitado || ocupado !== null;
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-testid={testId}>
      <Box component="button" type="button" sx={sx} disabled={off} onClick={() => exportar('imprimir')}>{icono('imprimir', Printer)} Imprimir</Box>
      <Box component="button" type="button" sx={sx} disabled={off} onClick={() => exportar('pdf')}>{icono('pdf', FileText)} PDF</Box>
      <Box component="button" type="button" sx={sx} disabled={off} onClick={() => exportar('xlsx')}>{icono('xlsx', Download)} Excel</Box>
    </Box>
  );
}
