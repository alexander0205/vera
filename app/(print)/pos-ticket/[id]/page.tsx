'use client';

/**
 * /pos-ticket/[id] — Recibo de venta POS imprimible (formato 80mm).
 * Layout (print) minimalista; abre el diálogo de impresión al cargar.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

interface Linea { nombreItem: string; cantidadItem: number; precioUnitarioItem: number; tasaItbis?: string }
interface Ticket {
  empresa: { nombre: string; rnc: string | null };
  doc: { encf: string; codigo: string | null; tipoEcf: string; fechaEmision: string; montoTotal: number; totalItbis: number; cliente: string | null; dependiente: string | null };
  lineas: Linea[];
  pagos: { metodo: string; montoCentavos: number }[];
  cajero: string | null;
}

const fmt = (c: number) => (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METODO_LABEL: Record<string, string> = {
  'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta', 'transferencia': 'Transferencia', 'cuenta-estudiante': 'Cuenta estudiante',
};

export default function PosTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pos/ticket/${id}`)
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error)))
      .then((data) => { setT(data); setTimeout(() => window.print(), 350); })
      .catch((e) => setError(typeof e === 'string' ? e : 'No se pudo cargar el ticket'));
  }, [id]);

  if (error) return <Box sx={{ padding: '16px', fontFamily: 'monospace' }}>{error}</Box>;
  if (!t) return <Box sx={{ padding: '16px', fontFamily: 'monospace' }}>Cargando…</Box>;

  const fecha = new Date(t.doc.fechaEmision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });

  return (
    // `print-area`: el CSS global apaga `body *` al imprimir y solo deja ver lo
    // que cuelga de esta clase. Sin ella el ticket sale en blanco.
    <Box className="print-area" sx={{ width: '80mm', margin: '0 auto', padding: '6px 8px', fontFamily: 'monospace', fontSize: '12px', color: '#000', lineHeight: 1.35 }}>
      <Box sx={{ textAlign: 'center', marginBottom: '6px' }}>
        <Box sx={{ fontWeight: 700, fontSize: '14px' }}>{t.empresa.nombre}</Box>
        {t.empresa.rnc && <Box>RNC: {t.empresa.rnc}</Box>}
        <Box sx={{ marginTop: '4px' }}>{t.doc.tipoEcf === 'sin-ncf' ? 'TICKET DE VENTA' : `NCF ${t.doc.encf}`}</Box>
      </Box>

      <Box sx={{ borderTop: '1px dashed #000', paddingTop: '4px' }}>
        <Box>Fecha: {fecha}</Box>
        {t.doc.codigo && <Box>Código: {t.doc.codigo}</Box>}
        {t.cajero && <Box>Cajero: {t.cajero}</Box>}
        {t.doc.dependiente
          ? <Box>Estudiante: {t.doc.dependiente}</Box>
          : t.doc.cliente && <Box>Cliente: {t.doc.cliente}</Box>}
      </Box>

      <Box component="table" sx={{ width: '100%', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', margin: '4px 0', borderCollapse: 'collapse' }}>
        <Box component="thead">
          <Box component="tr" sx={{ textAlign: 'left' }}>
            <Box component="th" sx={{ width: '12%' }}>Cant</Box><Box component="th">Producto</Box><Box component="th" sx={{ textAlign: 'right' }}>Importe</Box>
          </Box>
        </Box>
        <Box component="tbody">
          {t.lineas.map((l, i) => (
            <Box component="tr" key={i}>
              <Box component="td" sx={{ verticalAlign: 'top' }}>{l.cantidadItem}</Box>
              <Box component="td">{l.nombreItem}<Box sx={{ color: '#444' }}>@ {fmt(Math.round(l.precioUnitarioItem * 100))}</Box></Box>
              <Box component="td" sx={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt(Math.round(l.precioUnitarioItem * l.cantidadItem * 100))}</Box>
            </Box>
          ))}
          {t.lineas.length === 0 && <Box component="tr"><Box component="td" colSpan={3} sx={{ textAlign: 'center', color: '#444' }}>(sin detalle de líneas)</Box></Box>}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box component="span">ITBIS</Box><Box component="span">{fmt(t.doc.totalItbis)}</Box></Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px' }}><Box component="span">TOTAL</Box><Box component="span">RD$ {fmt(t.doc.montoTotal)}</Box></Box>

      <Box sx={{ borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px' }}>
        {t.pagos.map((p, i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Box component="span">{METODO_LABEL[p.metodo] ?? p.metodo}</Box><Box component="span">{fmt(p.montoCentavos)}</Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ textAlign: 'center', marginTop: '8px' }}>¡Gracias por su compra!</Box>

      <Button
        onClick={() => window.print()}
        variant="outlined"
        size="small"
        sx={{ display: 'block', margin: '12px auto', padding: '6px 14px', textTransform: 'none', color: '#374151', borderColor: '#d1d5db', '@media print': { display: 'none' } }}
      >
        Imprimir
      </Button>
      <style>{`@media print { @page { margin: 0 } }`}</style>
    </Box>
  );
}
