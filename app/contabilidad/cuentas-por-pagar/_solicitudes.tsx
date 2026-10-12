'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import { limpiarMonto, mascaraMonto } from '@/lib/utils/monto-mascara';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import type { ListadoSolicitudes, SolicitudPago } from '@/lib/contabilidad/solicitudes-pago';

export interface CompraParaSolicitar { id: number; proveedorNombre: string | null; referencia: string | null; saldo: number }
type CuentaCatalogo = { id: number; codigo: string; nombre: string };

const ETIQUETA: Record<string, { texto: string; color: string }> = {
  solicitado: { texto: 'Por aprobar', color: '#b45309' },
  aprobado: { texto: 'Aprobada', color: '#047857' },
  pagando: { texto: 'Pagando…', color: '#6b7280' },
  pagado: { texto: 'Pagada', color: '#6b7280' },
  rechazado: { texto: 'Rechazada', color: '#dc2626' },
  cancelado: { texto: 'Cancelada', color: '#6b7280' },
};

/**
 * Solicitudes de pago a proveedores: la secretaria pide, el dueño aprueba mirando
 * lo disponible en caja y bancos, y luego se registra el pago.
 */
export function SolicitudesPago({ puedeGestionar, puedeAprobar, cuentasSalida, compra, onCerrarSolicitud, onPagada }: {
  puedeGestionar: boolean; puedeAprobar: boolean; cuentasSalida: CuentaCatalogo[];
  compra: CompraParaSolicitar | null; onCerrarSolicitud: () => void; onPagada: () => void;
}) {
  const [datos, setDatos] = useState<ListadoSolicitudes | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const ocupado = useRef(false);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/contabilidad/cuentas-por-pagar/solicitudes');
      const d = await r.json();
      if (r.ok) { setDatos(d); setFallo(null); } else setFallo(d.error ?? 'No se pudieron cargar las solicitudes');
    } catch { setFallo('No se pudieron cargar las solicitudes. Revisa tu conexión.'); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(s: SolicitudPago, a: 'aprobar' | 'rechazar' | 'cancelar' | 'pagar', extra: Record<string, unknown> = {}) {
    if (ocupado.current) return;
    ocupado.current = true; setTrabajando(true); setFallo(null); setMensaje(null);
    try {
      const r = await fetch(`/api/contabilidad/cuentas-por-pagar/solicitudes/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: a, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setFallo(d.error ?? 'No se pudo completar');
      else { setMensaje(a === 'pagar' ? 'Pago registrado' : a === 'aprobar' ? 'Solicitud aprobada' : a === 'rechazar' ? 'Solicitud rechazada' : 'Solicitud cancelada'); if (a === 'pagar') onPagada(); }
      await cargar();
    } finally { ocupado.current = false; setTrabajando(false); }
  }

  const abiertas = (datos?.solicitudes ?? []).filter((s) => ['solicitado', 'aprobado', 'pagando'].includes(s.estado));
  const cerradas = (datos?.solicitudes ?? []).filter((s) => !['solicitado', 'aprobado', 'pagando'].includes(s.estado)).slice(0, 15);
  const [rechazando, setRechazando] = useState<SolicitudPago | null>(null);
  const [motivo, setMotivo] = useState('');

  return (
    <Box data-testid="solicitudes-pago" sx={{ border: '1px solid #e5e7eb', borderRadius: 2, bgcolor: '#fff', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box>
        <Typography sx={{ fontWeight: 700 }}>Solicitudes de pago</Typography>
        <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
          Se pide el pago, el dueño lo aprueba según lo disponible y después se registra. Pedir no mueve dinero.
        </Typography>
      </Box>

      {datos && datos.disponible.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 13 }}>
          <span>Pedido por aprobar: <b>{fmtDOP(datos.pendientesCents)}</b></span>
          <span>Aprobado sin pagar: <b>{fmtDOP(datos.aprobadasCents)}</b></span>
          {datos.disponible.map((c) => <span key={c.cuentaId} style={{ color: '#4b5563' }}>{c.nombre}: <b>{fmtDOP(c.saldoCents)}</b></span>)}
        </Box>
      )}

      {fallo && <Alert severity="error" role="alert">{fallo}</Alert>}
      {mensaje && <Alert severity="success">{mensaje}</Alert>}

      {abiertas.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: '#6b7280', py: 1 }}>No hay solicitudes abiertas.</Typography>
      ) : abiertas.map((s) => (
        <Fila key={s.id} s={s}>
          {s.estado === 'solicitado' && puedeAprobar && <>
            <Button size="small" variant="contained" disabled={trabajando} onClick={() => accion(s, 'aprobar')}>Aprobar</Button>
            <Button size="small" color="error" disabled={trabajando} onClick={() => { setMotivo(''); setRechazando(s); }}>Rechazar</Button>
          </>}
          {s.estado === 'aprobado' && puedeGestionar && (
            <Button size="small" variant="contained" disabled={trabajando} onClick={() => accion(s, 'pagar', { fechaPago: hoyRD() })}>Registrar pago</Button>
          )}
          {(s.estado === 'solicitado' || s.estado === 'aprobado') && puedeGestionar && (
            <Button size="small" disabled={trabajando} onClick={() => accion(s, 'cancelar')}>Cancelar</Button>
          )}
        </Fila>
      ))}

      {cerradas.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 12, color: '#6b7280', mb: .5 }}>Resueltas recientemente</Typography>
          {cerradas.map((s) => <Fila key={s.id} s={s} />)}
        </Box>
      )}

      <Dialog open={rechazando !== null} onClose={() => setRechazando(null)}>
        <DialogTitle>Rechazar la solicitud</DialogTitle>
        <DialogContent sx={{ pt: 2, minWidth: 340 }}>
          <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} fullWidth multiline slotProps={{ htmlInput: { maxLength: 300 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRechazando(null)}>Volver</Button>
          <Button color="error" variant="contained" disabled={trabajando} onClick={async () => { const s = rechazando; setRechazando(null); if (s) await accion(s, 'rechazar', { motivo }); }}>Rechazar</Button>
        </DialogActions>
      </Dialog>

      {compra && <Solicitar compra={compra} cuentasSalida={cuentasSalida} onCerrar={onCerrarSolicitud} onCreada={async () => { onCerrarSolicitud(); setMensaje('Solicitud enviada'); await cargar(); }} />}
    </Box>
  );
}

function Fila({ s, children }: { s: SolicitudPago; children?: React.ReactNode }) {
  const e = ETIQUETA[s.estado] ?? { texto: s.estado, color: '#6b7280' };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', pt: 1 }}>
      <Box sx={{ flex: 1, minWidth: 220, overflowWrap: 'anywhere' }}>
        <Typography sx={{ fontSize: 14 }}>
          {s.proveedor ?? 'Proveedor sin nombre'} <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{s.referencia ?? `#${s.compraId}`}</span>
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#6b7280' }}>
          {s.solicitadaPor ? `Pidió ${s.solicitadaPor}` : 'Solicitud'} · {s.metodo}{s.cuentaSalida ? ` · sale de ${s.cuentaSalida}` : ''}
          {s.nota ? ` · ${s.nota}` : ''}{s.motivo ? ` · motivo: ${s.motivo}` : ''}
        </Typography>
      </Box>
      <Typography sx={{ fontWeight: 700 }}>{fmtDOP(s.montoCents)}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: e.color, minWidth: 80 }}>{e.texto}</Typography>
      {children}
    </Box>
  );
}

function Solicitar({ compra, cuentasSalida, onCerrar, onCreada }: { compra: CompraParaSolicitar; cuentasSalida: CuentaCatalogo[]; onCerrar: () => void; onCreada: () => void | Promise<void> }) {
  const [monto, setMonto] = useState((compra.saldo / 100).toFixed(2));
  const [metodo, setMetodo] = useState('transferencia');
  const [cuenta, setCuenta] = useState('auto');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);

  async function enviar() {
    if (ocupado.current) return;
    ocupado.current = true; setGuardando(true); setError(null);
    try {
      const r = await fetch('/api/contabilidad/cuentas-por-pagar/solicitudes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compraId: compra.id, monto, metodo, cuentaSalidaId: cuenta === 'auto' ? null : Number(cuenta), nota }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? 'No se pudo enviar'); else await onCreada();
    } finally { ocupado.current = false; setGuardando(false); }
  }

  return (
    <Dialog open onClose={() => !guardando && onCerrar()}>
      <DialogTitle>Solicitar pago a proveedor</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, minWidth: 360 }}>
        <Typography sx={{ fontSize: 13, color: '#6b7280' }}>{compra.proveedorNombre ?? 'Proveedor sin nombre'} · {compra.referencia ?? `#${compra.id}`} · saldo {fmtDOP(compra.saldo)}</Typography>
        <TextField label="Monto (RD$)" value={mascaraMonto(monto)} onChange={(e) => setMonto(limpiarMonto(e.target.value))} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        <TextField select label="Método" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS_PAGO.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>
        {cuentasSalida.length > 0 && (
          <TextField select label="Sale de" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <MenuItem value="auto">Automática (la del método)</MenuItem>
            {cuentasSalida.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.codigo} · {c.nombre}</MenuItem>)}
          </TextField>
        )}
        <TextField label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar solicitud'}</Button>
      </DialogActions>
    </Dialog>
  );
}
