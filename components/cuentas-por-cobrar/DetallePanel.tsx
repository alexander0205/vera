'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X, Loader2, FileText, Wallet2, AlertTriangle, Receipt, ExternalLink,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import type { DetalleCuenta, EventoCartera } from '@/lib/cobranza/detalle';
import type { OrigenEscolarFactura } from '@/lib/administracion-escolar/origen-factura';
import { GestionCobro } from '@/components/cuentas-por-cobrar/GestionCobro';

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Icono y color por tipo de evento del timeline. */
const EVENTO_UI: Record<EventoCartera['tipo'], {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>; punto: string; monto: string;
}> = {
  'emision':      { Icon: FileText,      punto: '#d1d5db', monto: '#111827' },
  'pago':         { Icon: Wallet2,       punto: '#10b981', monto: '#047857' },
  'mora':         { Icon: AlertTriangle, punto: '#f97316', monto: '#c2410c' },
  'nota-credito': { Icon: Receipt,       punto: '#0ea5e9', monto: '#0369a1' },
};

export function DetallePanel({
  cuenta, onClose, onCobrar,
}: {
  cuenta: Cuenta;
  onClose: () => void;
  onCobrar: (c: Cuenta) => void;
}) {
  const [detalle, setDetalle] = useState<DetalleCuenta | null>(null);
  const [origenEscolar, setOrigenEscolar] = useState<OrigenEscolarFactura[]>([]);
  const [actual, setActual]   = useState<Cuenta>(cuenta);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    fetch(`/api/cuentas-por-cobrar/${cuenta.id}?detalle=1`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Error cargando el detalle');
        return j;
      })
      .then(j => {
        if (!vivo) return;
        setDetalle(j);
        setOrigenEscolar(j.origenEscolar ?? []);
        if (j.cuenta) setActual(j.cuenta);
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [cuenta.id]);

  return (
    <Drawer
      open anchor="right" onClose={onClose}
      aria-label={`Detalle de ${actual.codigo ?? actual.encf}`}
      slotProps={{ paper: { sx: { width: '100%', maxWidth: 448, display: 'flex', flexDirection: 'column' } } }}
    >
      {/* Encabezado */}
      <Box component="header" sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            {actual.razonSocialComprador ?? 'Consumidor Final'}
          </Typography>
          <Box
            component={Link}
            href={`/dashboard/facturas/${actual.id}`}
            sx={{
              fontSize: '0.75rem', fontFamily: 'monospace', color: '#3658e1',
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              textDecoration: 'none', '&:hover': { textDecoration: 'underline' },
            }}
          >
            {actual.codigo ?? actual.encf}
            <ExternalLink style={{ width: 12, height: 12 }} />
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Cerrar" sx={{ color: '#9ca3af', flexShrink: 0 }}>
          <X style={{ width: 20, height: 20 }} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {/* Resumen del saldo — el desglose de la fórmula, no solo el total */}
        <Box component="section" sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.875rem' }}>
            <Fila label="Total facturado" valor={fmtDOP(actual.montoTotal)} />
            {actual.pagado > 0 && (
              <Fila label="Pagado" valor={`− ${fmtDOP(actual.pagado)}`} color="#047857" />
            )}
            {actual.ncAplicado > 0 && (
              <Fila label="Notas de crédito" valor={`− ${fmtDOP(actual.ncAplicado)}`} color="#0369a1" />
            )}
            <Fila label="Saldo de la factura" valor={fmtDOP(actual.saldoFactura)} borde />
            {actual.moraSaldo > 0 && (
              <Fila label="Mora pendiente" valor={`+ ${fmtDOP(actual.moraSaldo)}`} color="#c2410c" />
            )}
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', pt: 0.75, borderTop: '1px solid #e5e7eb' }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Saldo a cobrar</Typography>
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{fmtDOP(actual.saldo)}</Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            {actual.fechaLimitePago ? (
              <Typography sx={{ fontSize: '0.75rem', ...(actual.vencida ? { color: '#b91c1c', fontWeight: 500 } : { color: '#6b7280' }) }}>
                Vence {fmtFechaCorta(actual.fechaLimitePago)}
                {actual.vencida && ` · ${actual.diasVencido} día${actual.diasVencido !== 1 ? 's' : ''} vencida`}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Sin fecha de vencimiento</Typography>
            )}
          </Box>
        </Box>

        {/* Origen escolar — solo aparece si la factura cubre cargos de un
            colegio. Responde "de dónde salió esta deuda" sin salir del panel. */}
        {origenEscolar.length > 0 && (
          <Box component="section" sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
            <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
              Origen escolar
            </Typography>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {origenEscolar.map(o => (
                <Box component="li" key={o.cargoId} sx={{ fontSize: '0.875rem' }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>
                    {o.estudiante}
                    {o.codigoEstudiante && (
                      <Box component="span" sx={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: '0.75rem' }}> · {o.codigoEstudiante}</Box>
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: '11px', color: '#6b7280' }}>
                    {[
                      o.concepto,
                      o.mes ? `${MESES[o.mes]} ${o.anio}` : String(o.anio),
                      o.curso,
                      o.periodo,
                    ].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Timeline */}
        <Box component="section" sx={{ px: 2, py: 1.5 }}>
          <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
            Historial
          </Typography>

          {loading && (
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: '#9ca3af', py: 2 }}>
              <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Cargando…
            </Typography>
          )}
          {error && <Typography sx={{ fontSize: '0.875rem', color: '#dc2626', py: 1 }}>{error}</Typography>}

          {!loading && !error && detalle && (
            detalle.timeline.length === 0 ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', py: 1 }}>Sin movimientos registrados.</Typography>
            ) : (
              <Box component="ol" sx={{ position: 'relative', m: 0, p: 0, pl: 2.5, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Línea vertical del timeline */}
                <Box component="span" aria-hidden sx={{ position: 'absolute', left: '5px', top: 6, bottom: 6, width: '1px', bgcolor: '#e5e7eb' }} />
                {detalle.timeline.map((ev, i) => {
                  const ui = EVENTO_UI[ev.tipo];
                  return (
                    <Box component="li" key={`${ev.tipo}-${i}`} sx={{ position: 'relative' }}>
                      <Box
                        component="span" aria-hidden
                        sx={{
                          position: 'absolute', left: -20, top: 6, height: 11, width: 11,
                          borderRadius: '9999px', bgcolor: ui.punto, boxShadow: '0 0 0 2px #fff',
                        }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <ui.Icon style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
                          {ev.titulo}
                        </Typography>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', color: ui.monto }}>
                          {ev.montoCents < 0 ? '−' : '+'} {fmtDOP(Math.abs(ev.montoCents))}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '11px', color: '#9ca3af', mt: 0.25 }}>
                        {fmtFechaCorta(ev.fecha)}
                        {ev.detalle && ` · ${ev.detalle}`}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )
          )}
        </Box>

        {/* Gestión de cobro: qué se ha hecho y qué sigue. Separado del
            historial de arriba porque ese es el movimiento del dinero y este
            es la gestión — mezclarlos confundiría lo fiscal con lo interno. */}
        <GestionCobro docId={actual.id} />
      </Box>

      {/* Acciones */}
      <Box component="footer" sx={{ px: 2, py: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained" fullWidth
          onClick={() => onCobrar(actual)}
          disabled={actual.saldo <= 0}
          startIcon={<Wallet2 style={{ width: 16, height: 16 }} />}
        >
          Registrar pago
        </Button>
        <Button
          component={Link} href={`/dashboard/facturas/${actual.id}`} nativeButton={false}
          variant="outlined" color="inherit"
          sx={{ color: '#374151', borderColor: '#d1d5db', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Ver factura
        </Button>
      </Box>
    </Drawer>
  );
}

function Fila({ label, valor, color, borde }: {
  label: string; valor: string; color?: string; borde?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', ...(borde && { pt: 0.75, borderTop: '1px solid #f3f4f6' }) }}>
      <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: color ?? '#111827' }}>{valor}</Typography>
    </Box>
  );
}
