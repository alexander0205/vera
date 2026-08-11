'use client';

/**
 * Historial de recibos del POS (Fase 1: ver + filtrar).
 *
 * Tarjetas rectangulares clickeables con lo cobrado en el turno activo. Al tocar
 * una se abre el recibo (reusa /api/pos/ticket + la vista imprimible
 * /pos-ticket/[id]). El tablero de filtros de abajo acota por método de pago y
 * tipo de orden. Las acciones (unsettle / eliminar orden) llegan en la Fase 2 —
 * aquí se muestran deshabilitadas para no tocar comprobantes fiscales todavía.
 */

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { ReceiptText, X, Printer, Undo2, Trash2, RefreshCw } from 'lucide-react';

const fmt = (c: number) => (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METODO_LABEL: Record<string, string> = {
  'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta', 'transferencia': 'Transferencia',
  'cuenta-estudiante': 'Cuenta estudiante', 'credito': 'Crédito (fiado)',
};
const TIPO_ORDEN_LABEL: Record<string, string> = {
  'comer-aqui': 'Comer aquí', 'para-llevar': 'Para llevar', 'delivery': 'Delivery', 'mostrador': 'Mostrador',
};
const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'cuenta-estudiante', 'credito'] as const;
const TIPOS_ORDEN = ['comer-aqui', 'para-llevar', 'delivery', 'mostrador'] as const;

interface Venta {
  id: number;
  codigo: string | null;
  encf: string;
  tipoEcf: string;
  estado: string;
  tipoOrden: string | null;
  montoTotal: number;
  cliente: string;
  fechaEmision: string;
  cajero: string | null;
  mesa: string | null;
  metodos: string[];
}

interface Linea { nombreItem: string; cantidadItem: number; precioUnitarioItem: number }
interface Ticket {
  empresa: { nombre: string; rnc: string | null };
  doc: { encf: string; codigo: string | null; tipoEcf: string; fechaEmision: string; montoTotal: number; totalItbis: number; cliente: string | null; dependiente: string | null };
  lineas: Linea[];
  pagos: { metodo: string; montoCentavos: number }[];
  cajero: string | null;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

export default function PosHistorialClient() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTurno, setSinTurno] = useState(false);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [tipoOrden, setTipoOrden] = useState<string | null>(null);
  const [sel, setSel] = useState<Venta | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const qs = new URLSearchParams();
    if (metodo)    qs.set('metodo', metodo);
    if (tipoOrden) qs.set('tipoOrden', tipoOrden);
    const res = await fetch(`/api/pos/historial?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setVentas(data.ventas ?? []);
      setSinTurno(data.turno == null);
    }
    setCargando(false);
  }, [metodo, tipoOrden]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f9fafb' }}>
      {/* Encabezado */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, py: 2, borderBottom: '1px solid #e5e7eb', bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ReceiptText style={{ width: 22, height: 22, color: '#3658e1' }} />
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'text.primary' }}>Historial de recibos</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Lo cobrado en el turno de caja abierto</Typography>
          </Box>
        </Box>
        <Button onClick={cargar} startIcon={<RefreshCw style={{ width: 15, height: 15 }} />} size="small"
          sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }} variant="outlined">
          Actualizar
        </Button>
      </Box>

      {/* Listado de tarjetas */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}>
        {cargando ? (
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>Cargando…</Typography>
        ) : sinTurno ? (
          <VacioMsg titulo="No hay un turno abierto" detalle="Abre un turno de caja para ver y filtrar lo que vayas cobrando." />
        ) : ventas.length === 0 ? (
          <VacioMsg titulo="Sin recibos" detalle={metodo || tipoOrden ? 'Ningún cobro coincide con el filtro.' : 'Aún no se ha cobrado nada en este turno.'} />
        ) : (
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            {ventas.map((v) => <TarjetaVenta key={v.id} v={v} onClick={() => setSel(v)} />)}
          </Box>
        )}
      </Box>

      {/* Tablero de filtros */}
      <Box sx={{ flexShrink: 0, borderTop: '1px solid #e5e7eb', bgcolor: '#fff', px: { xs: 2, sm: 3 }, py: 1.5 }}>
        <FiltroFila etiqueta="Método" valor={metodo} onChange={setMetodo}
          opciones={METODOS.map((m) => ({ value: m, label: METODO_LABEL[m] }))} />
        <FiltroFila etiqueta="Tipo de orden" valor={tipoOrden} onChange={setTipoOrden}
          opciones={TIPOS_ORDEN.map((t) => ({ value: t, label: TIPO_ORDEN_LABEL[t] }))} />
      </Box>

      {sel && <ReciboDrawer venta={sel} onClose={() => setSel(null)} />}
    </Box>
  );
}

function VacioMsg({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: 13, mt: 0.5 }}>{detalle}</Typography>
    </Box>
  );
}

function FiltroFila({ etiqueta, valor, onChange, opciones }: {
  etiqueta: string; valor: string | null; onChange: (v: string | null) => void;
  opciones: { value: string; label: string }[];
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', width: 96, flexShrink: 0 }}>{etiqueta}</Typography>
      <Chip label="Todos" size="small" onClick={() => onChange(null)}
        sx={{ fontSize: 12, height: 26, bgcolor: valor == null ? '#3658e1' : '#f3f4f6', color: valor == null ? '#fff' : '#374151', fontWeight: valor == null ? 600 : 500 }} />
      {opciones.map((o) => (
        <Chip key={o.value} label={o.label} size="small" onClick={() => onChange(o.value)}
          sx={{ fontSize: 12, height: 26, bgcolor: valor === o.value ? '#3658e1' : '#f3f4f6', color: valor === o.value ? '#fff' : '#374151', fontWeight: valor === o.value ? 600 : 500 }} />
      ))}
    </Box>
  );
}

function TarjetaVenta({ v, onClick }: { v: Venta; onClick: () => void }) {
  const anulado = v.estado === 'ANULADO';
  return (
    <Box
      onClick={onClick}
      role="button"
      sx={{
        cursor: 'pointer', borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 1.75,
        display: 'flex', flexDirection: 'column', gap: 1, transition: 'box-shadow 0.15s, border-color 0.15s',
        opacity: anulado ? 0.7 : 1,
        '&:hover': { boxShadow: '0 4px 14px rgba(0,0,0,0.08)', borderColor: '#c7d2fe' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {v.codigo ?? (v.tipoEcf === 'sin-ncf' ? 'Ticket' : v.encf)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{hora(v.fechaEmision)} · {v.cajero ?? '—'}</Typography>
        </Box>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#065f46', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          RD$ {fmt(v.montoTotal)}
        </Typography>
      </Box>

      <Typography sx={{ fontSize: 13, color: 'text.primary' }} noWrap>
        {v.cliente}{v.mesa ? ` · ${v.mesa}` : ''}
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {anulado && <Chip label="Anulado" size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }} />}
        {v.tipoOrden && <Chip label={TIPO_ORDEN_LABEL[v.tipoOrden] ?? v.tipoOrden} size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#eef2fe', color: '#3658e1', fontWeight: 600 }} />}
        {v.metodos.map((m) => (
          <Chip key={m} label={METODO_LABEL[m] ?? m} size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#f3f4f6', color: '#374151' }} />
        ))}
      </Box>
    </Box>
  );
}

function ReciboDrawer({ venta, onClose }: { venta: Venta; onClose: () => void }) {
  const [t, setT] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pos/ticket/${venta.id}`)
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error)))
      .then(setT)
      .catch((e) => setError(typeof e === 'string' ? e : 'No se pudo cargar el recibo'));
  }, [venta.id]);

  return (
    <Dialog open onClose={onClose} fullWidth slotProps={{ paper: { sx: { maxWidth: 420, m: 2, borderRadius: '14px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {venta.codigo ?? 'Recibo'}
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        {error ? (
          <Typography sx={{ color: '#991b1b', fontSize: 13 }}>{error}</Typography>
        ) : !t ? (
          <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Cargando recibo…</Typography>
        ) : (
          <>
            <Box sx={{ borderRadius: '10px', bgcolor: '#f9fafb', p: 1.75, mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'text.secondary' }}>
                <span>{new Date(t.doc.fechaEmision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>{t.doc.tipoEcf === 'sin-ncf' ? 'Ticket' : `NCF ${t.doc.encf}`}</span>
              </Box>
              <Typography sx={{ fontSize: 13, mt: 0.5 }}>{t.doc.dependiente || t.doc.cliente || 'Consumidor Final'}</Typography>
              {venta.mesa && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{venta.mesa}</Typography>}
            </Box>

            <Box sx={{ mb: 1.5 }}>
              {t.lineas.map((l, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, py: 0.25 }}>
                  <span>{l.cantidadItem}× {l.nombreItem}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(l.precioUnitarioItem * l.cantidadItem * 100))}</span>
                </Box>
              ))}
              {t.lineas.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>(sin detalle de líneas)</Typography>}
            </Box>

            <Box sx={{ borderTop: '1px dashed #d1d5db', pt: 1, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
              <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>RD$ {fmt(t.doc.montoTotal)}</span>
            </Box>

            <Box sx={{ mt: 0.75 }}>
              {t.pagos.map((p, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'text.secondary' }}>
                  <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span><span>{fmt(p.montoCentavos)}</span>
                </Box>
              ))}
            </Box>

            {/* Acciones */}
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                onClick={() => window.open(`/pos-ticket/${venta.id}`, '_blank')}
                variant="contained" disableElevation startIcon={<Printer style={{ width: 16, height: 16 }} />}
                sx={{ textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
              >
                Ver / imprimir recibo
              </Button>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Disponible en la Fase 2 (anula el e-CF y reabre la orden)">
                  <span style={{ flex: 1 }}>
                    <Button fullWidth disabled variant="outlined" startIcon={<Undo2 style={{ width: 15, height: 15 }} />}
                      sx={{ textTransform: 'none', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      Unsettle
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Disponible en la Fase 2 (nota de crédito + reversa de caja)">
                  <span style={{ flex: 1 }}>
                    <Button fullWidth disabled variant="outlined" startIcon={<Trash2 style={{ width: 15, height: 15 }} />}
                      sx={{ textTransform: 'none', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      Eliminar
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}
