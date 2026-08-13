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
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { ReceiptText, X, Printer, Undo2, Trash2, RefreshCw, Pencil } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';

const fmt = (c: number) => (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METODO_LABEL: Record<string, string> = {
  'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta', 'transferencia': 'Transferencia',
  'cuenta-estudiante': 'Cuenta estudiante', 'credito': 'Crédito (fiado)',
};
const TIPO_ORDEN_LABEL: Record<string, string> = {
  'comer-aqui': 'Comer aquí', 'para-llevar': 'Para llevar', 'delivery': 'Delivery', 'mostrador': 'Mostrador',
};
// Estado de cobro → badge en la tarjeta. ANULADA se muestra aparte ("Anulado").
const PAGO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  'PAGADA':    { label: 'Pagado',    bg: '#dcfce7', color: '#166534' },
  'PARCIAL':   { label: 'Parcial',   bg: '#fef3c7', color: '#92400e' },
  'PENDIENTE': { label: 'No pagado', bg: '#fee2e2', color: '#991b1b' },
  'GRATUITA':  { label: 'Gratis',    bg: '#e0e7ff', color: '#3730a3' },
};
const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'cuenta-estudiante', 'credito'] as const;
const TIPOS_ORDEN = ['comer-aqui', 'para-llevar', 'delivery', 'mostrador'] as const;

interface Venta {
  id: number;
  codigo: string | null;
  encf: string;
  tipoEcf: string;
  estado: string;
  estadoPago: string;
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

export default function PosHistorialClient({ modoMesas = false }: { modoMesas?: boolean } = {}) {
  const { can } = usePermissions();
  // Fuera de modo restaurante, "Comer aquí" no aplica: se oculta del filtro.
  const tiposOrdenVisibles = modoMesas ? TIPOS_ORDEN : TIPOS_ORDEN.filter((t) => t !== 'comer-aqui');
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
          opciones={tiposOrdenVisibles.map((t) => ({ value: t, label: TIPO_ORDEN_LABEL[t] }))} />
      </Box>

      {sel && (
        <ReciboDrawer
          venta={sel}
          puedeAnular={can('pos:anular')}
          puedeQuitarPin={can('pos:quitar-item-pin')}
          onClose={() => setSel(null)}
          onAnulada={() => { setSel(null); cargar(); }}
        />
      )}
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
  const chipSx = (activo: boolean) => ({
    fontSize: 14, height: 40, borderRadius: '10px', px: 0.5,
    '& .MuiChip-label': { px: 1.75 },
    bgcolor: activo ? '#3658e1' : '#f3f4f6', color: activo ? '#fff' : '#374151',
    fontWeight: activo ? 600 : 500,
    '&:hover': { bgcolor: activo ? '#2a45c4' : '#e5e7eb' },
  });
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', width: 110, flexShrink: 0 }}>{etiqueta}</Typography>
      <Chip label="Todos" onClick={() => onChange(null)} sx={chipSx(valor == null)} />
      {opciones.map((o) => (
        <Chip key={o.value} label={o.label} onClick={() => onChange(o.value)} sx={chipSx(valor === o.value)} />
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
        {anulado ? (
          <Chip label="Anulado" size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }} />
        ) : PAGO_BADGE[v.estadoPago] && (
          <Chip label={PAGO_BADGE[v.estadoPago].label} size="small"
            sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: PAGO_BADGE[v.estadoPago].bg, color: PAGO_BADGE[v.estadoPago].color }} />
        )}
        {v.tipoOrden && <Chip label={TIPO_ORDEN_LABEL[v.tipoOrden] ?? v.tipoOrden} size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#eef2fe', color: '#3658e1', fontWeight: 600 }} />}
        {v.metodos.map((m) => (
          <Chip key={m} label={METODO_LABEL[m] ?? m} size="small" sx={{ height: 22, fontSize: 11, bgcolor: '#f3f4f6', color: '#374151' }} />
        ))}
      </Box>
    </Box>
  );
}

function ReciboDrawer({ venta, puedeAnular, puedeQuitarPin, onClose, onAnulada }: {
  venta: Venta; puedeAnular: boolean; puedeQuitarPin: boolean; onClose: () => void; onAnulada: () => void;
}) {
  const router = useRouter();
  const [t, setT] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<'eliminar' | 'unsettle' | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Cajero quitando un ítem con PIN: índice de la línea elegida.
  const [quitarLinea, setQuitarLinea] = useState<number | null>(null);

  const anulado = venta.estado === 'ANULADO';
  // Un e-CF ACEPTADO por la DGII es inmutable: no se edita ni se hace unsettle;
  // su única reversa es una Nota de Crédito (tipo 34). El botón Eliminar, en ese
  // caso, redirige al formulario de NC (el backend responde requiereNotaCredito).
  const aceptadoDgii = ['ACEPTADO', 'ACEPTADO_CONDICIONAL'].includes(venta.estado);
  // En proceso = enviado a la DGII, esperando respuesta: no se toca en vuelo.
  const enProceso = venta.estado === 'EN_PROCESO';
  // (Editable en el POS = el caso restante: sin-ncf / borrador / rechazado.)
  const editable = !anulado && !aceptadoDgii && !enProceso;
  // Cajero (sin pos:anular) puede quitar un ítem con el PIN de un supervisor.
  const cajeroQuita = puedeQuitarPin && !puedeAnular && editable;
  // "Marcar no pagado" (unsettle) solo tiene sentido si hay un cobro que revertir.
  const tienePago = ['PAGADA', 'PARCIAL'].includes(venta.estadoPago);
  const irAEditar = () => router.push(`/pos/historial/${venta.id}/editar`);

  useEffect(() => {
    fetch(`/api/pos/ticket/${venta.id}`)
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error)))
      .then(setT)
      .catch((e) => setError(typeof e === 'string' ? e : 'No se pudo cargar el recibo'));
  }, [venta.id]);

  async function quitarItem(pin: string) {
    if (quitarLinea == null) return;
    setProcesando(true);
    try {
      const res = await fetch(`/api/pos/venta/${venta.id}/quitar-item`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineaIndex: quitarLinea, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? 'No se pudo quitar el ítem'); return; }
      if (data.requiereNotaCredito) {
        toast.info('Requiere Nota de Crédito — te llevo al formulario');
        router.push(data.redirectTo);
        return;
      }
      toast.success(data.devolucionCts > 0 ? `Ítem quitado. Devolución ${fmt(data.devolucionCts)}` : 'Ítem quitado');
      setQuitarLinea(null);
      onAnulada();
    } finally {
      setProcesando(false);
    }
  }

  async function anular(modo: 'eliminar' | 'unsettle') {
    setProcesando(true);
    try {
      const res = await fetch(`/api/pos/venta/${venta.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? 'No se pudo anular'); return; }
      // e-CF fiscal aceptado → el POS no lo anula: manda al form de Nota de Crédito.
      if (data.requiereNotaCredito) {
        toast.info('Requiere Nota de Crédito — te llevo al formulario');
        router.push(data.redirectTo);
        return;
      }
      toast.success(modo === 'unsettle' ? 'Recibo marcado como no pagado' : 'Recibo eliminado');
      onAnulada();
    } finally {
      setProcesando(false);
      setConfirmar(null);
    }
  }

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
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 13, py: 0.25 }}>
                  <span>{l.cantidadItem}× {l.nombreItem}</span>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(l.precioUnitarioItem * l.cantidadItem * 100))}</span>
                    {cajeroQuita && t.lineas.length > 1 && (
                      <IconButton onClick={() => setQuitarLinea(i)} size="small" title="Quitar ítem (requiere PIN)" sx={{ color: '#dc2626', p: 0.25 }}>
                        <Trash2 style={{ width: 15, height: 15 }} />
                      </IconButton>
                    )}
                  </Box>
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

              {anulado ? (
                <Box sx={{ mt: 0.5, textAlign: 'center', fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                  Recibo anulado
                </Box>
              ) : !puedeAnular ? (
                <Box sx={{ mt: 0.5, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
                  {cajeroQuita
                    ? 'Para quitar un ítem, toca la papelera junto a la línea (pide el PIN de un supervisor).'
                    : 'Solo un administrador puede anular o reabrir recibos.'}
                </Box>
              ) : enProceso ? (
                <Box sx={{ mt: 0.5, borderRadius: '10px', border: '1px solid #fde68a', bgcolor: '#fffbeb', p: 1.25, fontSize: 12, color: '#92400e', textAlign: 'center' }}>
                  Comprobante en proceso en la DGII. Espera la respuesta para poder anularlo.
                </Box>
              ) : confirmar ? (
                <Box sx={{ mt: 0.5, borderRadius: '10px', border: '1px solid #fecaca', bgcolor: '#fef2f2', p: 1.25 }}>
                  <Typography sx={{ fontSize: 13, color: '#991b1b', mb: 1 }}>
                    {aceptadoDgii
                      ? 'Este comprobante fue aceptado por la DGII y no se puede borrar. Su anulación se hace con una Nota de Crédito (tipo 34). Te llevamos al formulario.'
                      : confirmar === 'unsettle'
                        ? '¿Marcar este recibo como NO pagado? Se revierte el cobro; la venta y su inventario se conservan.'
                        : '¿Anular este recibo? Se revierte el cobro y se restaura el inventario.'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button fullWidth size="small" variant="outlined" disabled={procesando}
                      onClick={() => setConfirmar(null)}
                      sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>
                      Cancelar
                    </Button>
                    <Button fullWidth size="small" variant="contained" disableElevation disabled={procesando}
                      onClick={() => anular(confirmar)}
                      sx={{ textTransform: 'none', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>
                      {procesando ? 'Procesando…' : aceptadoDgii ? 'Ir a Nota de Crédito' : confirmar === 'unsettle' ? 'Sí, marcar no pagado' : 'Sí, anular'}
                    </Button>
                  </Box>
                </Box>
              ) : aceptadoDgii ? (
                // e-CF aceptado: NO se edita ni se hace unsettle. Solo "Eliminar",
                // que en realidad emite la Nota de Crédito (handoff, no borra en el POS).
                <>
                  <Box sx={{ borderRadius: '8px', bgcolor: '#eff6ff', p: 1, fontSize: 12, color: '#1e40af', textAlign: 'center' }}>
                    Comprobante fiscal emitido. Su reversa es una Nota de Crédito.
                  </Box>
                  <Button fullWidth variant="outlined" startIcon={<Trash2 style={{ width: 15, height: 15 }} />}
                    onClick={() => setConfirmar('eliminar')}
                    sx={{ textTransform: 'none', color: '#dc2626', borderColor: '#fecaca' }}>
                    Eliminar
                  </Button>
                </>
              ) : (
                // Editable en el POS (sin-ncf / borrador / rechazado): añadir, quitar, unsettle.
                <>
                  <Button fullWidth variant="outlined" startIcon={<Pencil style={{ width: 15, height: 15 }} />}
                    onClick={irAEditar}
                    sx={{ textTransform: 'none', color: '#2a45c4', borderColor: '#c7d2fe' }}>
                    Editar
                  </Button>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {/* Unsettle: solo si el recibo tiene un cobro que revertir. */}
                    {tienePago && (
                      <Button fullWidth variant="outlined" startIcon={<Undo2 style={{ width: 15, height: 15 }} />}
                        onClick={() => setConfirmar('unsettle')}
                        sx={{ textTransform: 'none', color: '#b45309', borderColor: '#fcd34d' }}>
                        Marcar no pagado
                      </Button>
                    )}
                    <Button fullWidth variant="outlined" startIcon={<Trash2 style={{ width: 15, height: 15 }} />}
                      onClick={() => setConfirmar('eliminar')}
                      sx={{ textTransform: 'none', color: '#dc2626', borderColor: '#fecaca' }}>
                      Eliminar
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          </>
        )}
      </Box>

      {quitarLinea != null && t && (
        <QuitarItemPinDialog
          nombre={t.lineas[quitarLinea]?.nombreItem ?? 'este ítem'}
          procesando={procesando}
          onCancel={() => setQuitarLinea(null)}
          onConfirm={quitarItem}
        />
      )}
    </Dialog>
  );
}

// ─── Cajero: quitar un ítem con PIN de supervisor ────────────────────────────

function QuitarItemPinDialog({ nombre, procesando, onCancel, onConfirm }: {
  nombre: string; procesando: boolean; onCancel: () => void; onConfirm: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const valido = /^\d{4,6}$/.test(pin);
  return (
    <Dialog open onClose={onCancel} fullWidth slotProps={{ paper: { sx: { maxWidth: 380, m: 2, borderRadius: '14px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>¿Estás seguro que lo quieres eliminar?</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
          Se quitará <b>{nombre}</b> de la factura y se devolverá lo pagado por ese ítem. Un supervisor debe autorizarlo con su PIN.
        </Typography>
        <TextField
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          type="password"
          inputMode="numeric"
          autoFocus
          fullWidth
          label="PIN de supervisor"
          placeholder="••••"
          onKeyDown={(e) => { if (e.key === 'Enter' && valido && !procesando) onConfirm(pin); }}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button fullWidth variant="outlined" onClick={onCancel} disabled={procesando} sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>Cancelar</Button>
          <Button fullWidth variant="contained" disableElevation disabled={!valido || procesando}
            onClick={() => onConfirm(pin)} startIcon={<Trash2 style={{ width: 15, height: 15 }} />}
            sx={{ textTransform: 'none', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, '&.Mui-disabled': { opacity: 0.5 } }}>
            {procesando ? 'Procesando…' : 'Quitar ítem'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
