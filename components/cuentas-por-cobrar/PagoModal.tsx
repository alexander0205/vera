'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { PagoMetodos, pagosValidos, type PagoLinea, type NotaCreditoDisponible } from '@/components/pagos/PagoMetodos';

/**
 * Cuenta por cobrar (factura con saldo pendiente). Shape devuelto por
 * `getCuentasPorCobrar` — compartido entre el módulo de Cuentas por Cobrar y
 * cualquier vista que reutilice el modal de cobro (p. ej. el perfil escolar).
 */
export interface Cuenta {
  id:                   number;
  clientId:             number | null;
  encf:                 string;
  codigo:               string | null;
  tipoEcf:              string;
  fechaEmision:         string;
  fechaLimitePago:      string | null;
  rncComprador:         string | null;
  razonSocialComprador: string | null;
  emailComprador:       string | null;
  estado:               string;
  montoTotal:           number;
  totalItbis:           number;
  pagado:               number;
  // saldo = saldoFactura + moraSaldo (TOTAL combinado a cobrar).
  saldo:                number;
  // Saldo SOLO de la factura (montoTotal − pagado).
  saldoFactura:         number;
  // Saldo combinado de las ND de mora atadas a esta factura.
  moraSaldo:            number;
  // Lista de ND de mora con saldo > 0 (para desglose).
  moraNotas?:           { id: number; codigo: string | null; saldo: number }[];
  vencida:              boolean;
  diasVencido:          number;
}

interface LineaFactura {
  nombreItem?: string;
  cantidadItem?: number | string;
  precioUnitarioItem?: number | string;
}

/**
 * Modal de registro de pago sobre una cuenta por cobrar. Reutilizable: se usa
 * desde el listado de Cuentas por Cobrar y desde el perfil del estudiante (el
 * flujo de datos es idéntico — POST a `/api/cuentas-por-cobrar/[id]/pagos`).
 * Muestra arriba el detalle de la factura asociada, porque abierto desde el
 * estudiante no hay una fila de tabla al lado que diga qué se está cobrando.
 */
export function PagoModal({
  cuenta, onClose, onSuccess,
}: {
  cuenta: Cuenta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // saldo = saldoFactura + moraSaldo (combinado). Montos en DOP.
  const saldoDOP  = cuenta.saldo / 100;
  // El repeater valida contra (total − yaPagado). Con yaPagado=0, el cap es el
  // saldo combinado factura + mora.
  const totalDOP  = saldoDOP;
  const pagadoDOP = 0;
  const [fecha, setFecha]         = useState(today);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // Cuando el pago se bloquea por método que obliga DGII sobre factura no emitida,
  // el backend devuelve el link al detalle para emitirla primero.
  const [emitirUrl, setEmitirUrl] = useState<string | null>(null);

  // Notas de crédito del cliente usables como pago (voucher por código, uso parcial).
  const [notasCredito, setNotasCredito] = useState<NotaCreditoDisponible[]>([]);

  // Detalle de la factura (líneas) para mostrar arriba. Best-effort: si falla,
  // el modal sigue sirviendo para cobrar.
  const [lineasFactura, setLineasFactura] = useState<LineaFactura[]>([]);

  useEffect(() => {
    if (!cuenta.clientId) { setNotasCredito([]); return; }
    let vivo = true;
    fetch(`/api/clientes/${cuenta.clientId}/notas-credito-disponibles`)
      .then(r => r.json())
      .then(j => { if (vivo) setNotasCredito(Array.isArray(j.notas) ? j.notas : []); })
      .catch(() => { if (vivo) setNotasCredito([]); });
    return () => { vivo = false; };
  }, [cuenta.clientId]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/facturas/${cuenta.id}`)
      .then(r => r.json())
      .then(j => { if (vivo) setLineasFactura(Array.isArray(j.lineas) ? j.lineas : []); })
      .catch(() => { if (vivo) setLineasFactura([]); });
    return () => { vivo = false; };
  }, [cuenta.id]);

  // Una o varias líneas (1 línea = pago normal). AR usa referencia.
  const [lineas, setLineas] = useState<PagoLinea[]>([
    { metodo: 'transferencia', valor: '', referencia: '' },
  ]);

  const valido = pagosValidos(lineas, totalDOP, pagadoDOP);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    setEmitirUrl(null);
    try {
      const pagos = lineas
        .filter(l => (parseFloat(l.valor || '0') || 0) > 0)
        .map(l => ({
          montoDOP:      parseFloat(l.valor),
          metodo:        l.metodo,
          referencia:    l.referencia?.trim() || undefined,
          notaCreditoId: l.notaCreditoId ?? undefined,
        }));

      const res = await fetch(`/api/cuentas-por-cobrar/${cuenta.id}/pagos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaPago: fecha, pagos }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmitirUrl(typeof json.emitirUrl === 'string' ? json.emitirUrl : null);
        throw new Error(json.error ?? 'Error al registrar pago');
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  const cliente = cuenta.razonSocialComprador ?? 'Consumidor final';
  const docRef  = cuenta.codigo || cuenta.encf || `Factura #${cuenta.id}`;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
        Registrar pago
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
          {docRef}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        <Box component="form" id="pago-form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Detalle de la factura asociada */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px', p: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cliente}
                </Typography>
                {cuenta.rncComprador && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>RNC {cuenta.rncComprador}</Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Emitida {fmtFechaCorta(cuenta.fechaEmision)}
                </Typography>
                {cuenta.fechaLimitePago && (
                  <Typography variant="caption" sx={{ display: 'block', color: cuenta.vencida ? 'error.main' : 'text.secondary' }}>
                    Vence {fmtFechaCorta(cuenta.fechaLimitePago)}
                  </Typography>
                )}
              </Box>
            </Box>

            {lineasFactura.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                {lineasFactura.map((l, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Number(l.cantidadItem ?? 1)} × {l.nombreItem ?? 'Ítem'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.primary', flexShrink: 0 }}>
                      {fmtDOP(Math.round(Number(l.precioUnitarioItem ?? 0) * Number(l.cantidadItem ?? 1) * 100))}
                    </Typography>
                  </Box>
                ))}
              </>
            )}

            <Divider sx={{ my: 0.75 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Total factura (incl. ITBIS)</Typography>
              <Typography variant="caption" sx={{ color: 'text.primary' }}>{fmtDOP(cuenta.montoTotal)}</Typography>
            </Box>
          </Box>

          {/* Resumen de saldo */}
          <Box sx={{ bgcolor: 'grey.50', borderRadius: '8px', p: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Saldo factura</Typography>
              <Typography variant="caption" sx={{ color: 'text.primary' }}>{fmtDOP(cuenta.saldoFactura)}</Typography>
            </Box>
            {cuenta.moraSaldo > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Mora</Typography>
                <Typography variant="caption" sx={{ color: '#ea580c' }}>{fmtDOP(cuenta.moraSaldo)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 0.75 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Total a cobrar</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtDOP(cuenta.saldo)}</Typography>
            </Box>
            {cuenta.moraSaldo > 0 && (
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>
                El pago cubre primero la factura; el resto se aplica a la mora.
              </Typography>
            )}
          </Box>

          {/* Fecha */}
          <TextField
            label="Fecha *" type="date" value={fecha} size="small" fullWidth required
            onChange={e => setFecha(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <PagoMetodos
            lineas={lineas}
            onChange={setLineas}
            total={totalDOP}
            yaPagado={pagadoDOP}
            disabled={guardando}
            showReferencia
            notasCredito={notasCredito}
          />

          {error && (
            <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              {error}
              {emitirUrl && (
                <Box
                  component={Link}
                  href={emitirUrl}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, fontWeight: 600, color: '#991b1b', textDecoration: 'underline', textUnderlineOffset: 2, '&:hover': { color: '#7f1d1d' } }}
                >
                  Ir a emitir la factura →
                </Box>
              )}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="pago-form" variant="contained" disableElevation
          disabled={guardando || !valido}
          startIcon={guardando ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
          Registrar pago
        </Button>
      </DialogActions>
    </Dialog>
  );
}
