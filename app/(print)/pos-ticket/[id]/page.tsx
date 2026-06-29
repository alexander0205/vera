'use client';

/**
 * /pos-ticket/[id] — Recibo de venta POS imprimible (formato 80mm).
 * Layout (print) minimalista; abre el diálogo de impresión al cargar.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

  if (error) return <div style={{ padding: 16, fontFamily: 'monospace' }}>{error}</div>;
  if (!t) return <div style={{ padding: 16, fontFamily: 'monospace' }}>Cargando…</div>;

  const fecha = new Date(t.doc.fechaEmision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div style={{ width: '80mm', margin: '0 auto', padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, color: '#000', lineHeight: 1.35 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{t.empresa.nombre}</div>
        {t.empresa.rnc && <div>RNC: {t.empresa.rnc}</div>}
        <div style={{ marginTop: 4 }}>{t.doc.tipoEcf === 'sin-ncf' ? 'TICKET DE VENTA' : `NCF ${t.doc.encf}`}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div>Fecha: {fecha}</div>
        {t.doc.codigo && <div>Código: {t.doc.codigo}</div>}
        {t.cajero && <div>Cajero: {t.cajero}</div>}
        {t.doc.dependiente
          ? <div>Estudiante: {t.doc.dependiente}</div>
          : t.doc.cliente && <div>Cliente: {t.doc.cliente}</div>}
      </div>

      <table style={{ width: '100%', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', margin: '4px 0', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={{ width: '12%' }}>Cant</th><th>Producto</th><th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {t.lineas.map((l, i) => (
            <tr key={i}>
              <td style={{ verticalAlign: 'top' }}>{l.cantidadItem}</td>
              <td>{l.nombreItem}<div style={{ color: '#444' }}>@ {fmt(Math.round(l.precioUnitarioItem * 100))}</div></td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt(Math.round(l.precioUnitarioItem * l.cantidadItem * 100))}</td>
            </tr>
          ))}
          {t.lineas.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#444' }}>(sin detalle de líneas)</td></tr>}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ITBIS</span><span>{fmt(t.doc.totalItbis)}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>RD$ {fmt(t.doc.montoTotal)}</span></div>

      <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 4 }}>
        {t.pagos.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span><span>{fmt(p.montoCentavos)}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 8 }}>¡Gracias por su compra!</div>

      <button onClick={() => window.print()} className="no-print" style={{ display: 'block', margin: '12px auto', padding: '6px 14px' }}>
        Imprimir
      </button>
      <style>{`@media print { .no-print { display: none } @page { margin: 0 } }`}</style>
    </div>
  );
}
