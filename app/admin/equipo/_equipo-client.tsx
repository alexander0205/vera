'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { fechaHora } from '@/lib/admin/fecha';
import { KeyRound, Mail, ShieldAlert, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react';

export interface MiembroVista {
  id: number;
  nombre: string | null;
  email: string;
  esDueno: boolean;
  dosFactores: boolean;
  emailVerificado: boolean;
  creadoEn: string;
  enlacePendienteHasta: string | null;
}

interface Cuenta { id: number; nombre: string | null; email: string; esAdmin: boolean; empresas: number; verificada: boolean }

const cuando = fechaHora;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function llamar(url: string, metodo: 'POST' | 'DELETE', cuerpo?: object) {
  const r = await fetch(url, {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({})) as { error?: string; correo?: string; cuentaNueva?: boolean };
  return { ok: r.ok, status: r.status, datos };
}

const textoCorreo = (c?: string) =>
  c === 'enviado' ? 'Le enviamos el correo.'
    : c === 'fuera_de_produccion' ? 'Correo no enviado: este entorno no manda correos de verdad.'
      : c === 'fallo' ? 'El correo no salió: usa «Enviar enlace nuevo».' : '';

export function EquipoClient({ miembros, yoId, esDueno, migracionPendiente }: {
  miembros: MiembroVista[]; yoId: number; esDueno: boolean; migracionPendiente: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cuenta, setCuenta] = useState<Cuenta | null | 'nueva'>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [quitar, setQuitar] = useState<MiembroVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  const correoValido = EMAIL_OK.test(email.trim());
  const sinDosFactores = miembros.filter((m) => !m.dosFactores).length;

  /** Primer paso: ver de quién se trata ANTES de confirmar. */
  async function revisar() {
    setError(null); setBuscando(true);
    try {
      const r = await fetch(`/api/admin/equipo?email=${encodeURIComponent(email.trim())}`);
      const d = await r.json().catch(() => ({})) as { cuenta?: Cuenta | null; error?: string };
      if (!r.ok) { setError(d.error ?? 'No se pudo revisar el correo.'); return; }
      if (d.cuenta?.esAdmin) { setError('Esa cuenta ya es administradora.'); return; }
      if (d.cuenta && !d.cuenta.verificada) {
        setError('Esa cuenta existe pero no ha verificado su correo, así que no se le puede dar acceso. Que lo verifique primero.');
        return;
      }
      setCuenta(d.cuenta ?? 'nueva');
    } finally { setBuscando(false); }
  }

  async function confirmarAgregar() {
    setTrabajando(true); setError(null);
    const r = await llamar('/api/admin/equipo', 'POST', { email: email.trim(), nombre: nombre.trim() || undefined, confirmado: true });
    setTrabajando(false);
    if (!r.ok) { setError(r.datos.error ?? 'No se pudo completar el cambio.'); setCuenta(null); return; }
    toast.success(r.datos.cuentaNueva ? 'Cuenta creada. ' + textoCorreo(r.datos.correo) : 'Ahora es administradora. ' + textoCorreo(r.datos.correo));
    setCuenta(null); setEmail(''); setNombre('');
    router.refresh();
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    setTrabajando(true);
    const r = await llamar(`/api/admin/equipo/${quitar.id}`, 'DELETE', { confirmado: true });
    setTrabajando(false);
    if (!r.ok) { toast.error(r.datos.error ?? 'No se pudo quitar el acceso.'); setQuitar(null); return; }
    toast.success(`${quitar.email} ya no es administrador.`);
    setQuitar(null);
    router.refresh();
  }

  async function enlaceNuevo(m: MiembroVista) {
    const r = await llamar(`/api/admin/equipo/${m.id}`, 'POST');
    if (!r.ok) { toast.error(r.datos.error ?? 'No se pudo enviar.'); return; }
    toast.success(`Enlace nuevo para ${m.email}. ${textoCorreo(r.datos.correo)}`);
    router.refresh();
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {migracionPendiente && (
        <Alert severity="warning" icon={<ShieldAlert size={18} />} sx={{ borderRadius: '12px' }}>
          Falta correr la migración <b>0216</b> en esta base. Mientras tanto nadie figura como dueño y esta pantalla es solo de lectura.
        </Alert>
      )}
      {!esDueno && !migracionPendiente && (
        <Alert severity="info" sx={{ borderRadius: '12px' }}>
          Solo el dueño de la plataforma puede agregar o quitar administradores. Tú puedes ver quién forma el equipo.
        </Alert>
      )}
      {sinDosFactores > 0 && (
        <Alert severity="warning" icon={<ShieldOff size={18} />} sx={{ borderRadius: '12px' }}>
          {sinDosFactores === 1 ? '1 administrador no tiene' : `${sinDosFactores} administradores no tienen`} la verificación en dos pasos.
          Un administrador ve todas las empresas: conviene que cada cuenta la active en su perfil.
        </Alert>
      )}
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: '12px' }}>{error}</Alert>}

      {esDueno && (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); if (correoValido && !buscando) void revisar(); }}
          sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: { xs: 2, sm: 2.5 } }}>
          <Typography sx={{ fontWeight: 700, color: '#111827', mb: 0.25 }}>Agregar un administrador</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mb: 2 }}>
            Si el correo ya tiene cuenta, se le da acceso a esa cuenta. Si no, se crea y le llega un enlace de 1 hora para poner su contraseña.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField label="Correo" type="email" size="small" value={email} onChange={(e) => setEmail(e.target.value)} required
              sx={{ flex: '1 1 260px' }} autoComplete="off" slotProps={{ htmlInput: { maxLength: 255 } }} />
            <TextField label="Nombre (opcional)" size="small" value={nombre} onChange={(e) => setNombre(e.target.value)}
              sx={{ flex: '1 1 200px' }} autoComplete="off" slotProps={{ htmlInput: { maxLength: 100 } }} />
            <Button type="submit" variant="contained" disableElevation disabled={!correoValido || buscando}
              startIcon={buscando ? <CircularProgress size={14} color="inherit" /> : <UserPlus size={16} />}
              sx={{ textTransform: 'none', borderRadius: '8px', height: 40 }}>
              Revisar y agregar
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700, color: '#111827' }}>Administradores ({miembros.length})</Typography>
        </Box>
        {miembros.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>No hay administradores activos.</Box>
        ) : miembros.map((m, i) => {
          const soyYo = m.id === yoId;
          const pendiente = m.enlacePendienteHasta && new Date(m.enlacePendienteHasta) > new Date();
          return (
            <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 2.5, py: 1.75, borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
              <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: m.esDueno ? '#3658e1' : '#e5e7eb', color: m.esDueno ? '#fff' : '#374151', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>
                {(m.nombre?.trim() || m.email).charAt(0).toUpperCase()}
              </Box>
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
                  {m.nombre ?? m.email}{soyYo && <Box component="span" sx={{ color: '#6b7280', fontWeight: 400 }}> (tú)</Box>}
                </Typography>
                {m.nombre && <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{m.email}</Typography>}
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Cuenta creada {cuando(m.creadoEn)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                {m.esDueno
                  ? <Chip size="small" icon={<ShieldCheck size={13} />} label="Dueño" sx={{ bgcolor: '#eef2fe', color: '#2a45c4', fontWeight: 600 }} />
                  : <Chip size="small" label="Administrador" sx={{ bgcolor: '#f3f4f6', color: '#374151', fontWeight: 600 }} />}
                <Chip size="small" label={m.dosFactores ? '2FA activo' : 'Sin 2FA'} sx={{ bgcolor: m.dosFactores ? '#f0fdf4' : '#fffbeb', color: m.dosFactores ? '#166534' : '#92400e' }} />
                {pendiente && <Chip size="small" icon={<Mail size={13} />} label={`Enlace de acceso pendiente · vence ${cuando(m.enlacePendienteHasta!)}`} sx={{ bgcolor: '#fff7ed', color: '#9a3412' }} />}
              </Box>
              {esDueno && (
                <Box sx={{ display: 'flex', gap: 0.75, ml: 'auto' }}>
                  <Button size="small" startIcon={<KeyRound size={14} />} onClick={() => void enlaceNuevo(m)} sx={{ textTransform: 'none' }}>Enviar enlace nuevo</Button>
                  {!m.esDueno && !soyYo && (
                    <Button size="small" color="error" startIcon={<UserMinus size={14} />} onClick={() => setQuitar(m)} sx={{ textTransform: 'none' }}>Quitar</Button>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
        Un dueño no se quita desde aquí: se hace en la base de datos, a propósito, para que ningún administrador pueda sacar al dueño.
      </Typography>

      {/* Confirmar: dar acceso */}
      <Dialog open={cuenta !== null} onClose={() => !trabajando && setCuenta(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Dar acceso de administrador?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>{email.trim().toLowerCase()}</Typography>
          {cuenta === 'nueva' ? (
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 1 }}>
              No tiene cuenta. Se crea una y le llega un enlace de <b>1 hora</b> para poner su contraseña.
            </Typography>
          ) : cuenta ? (
            <Alert severity={cuenta.empresas > 0 ? 'warning' : 'info'} sx={{ mt: 1.5, borderRadius: '8px' }}>
              Ya tiene cuenta{cuenta.nombre ? `: ${cuenta.nombre}` : ''} (número {cuenta.id}) y es miembro de <b>{cuenta.empresas}</b> {cuenta.empresas === 1 ? 'empresa' : 'empresas'}.
              {cuenta.empresas > 0 && ' Es una cuenta de cliente: lo más seguro es darle una cuenta aparte de trabajo.'}
            </Alert>
          ) : null}
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 1.5 }}>
            Podrá <b>ver y modificar los datos de todas las empresas</b> y crear nuevas. Esto queda registrado a tu nombre.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCuenta(null)} disabled={trabajando} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button onClick={() => void confirmarAgregar()} variant="contained" disableElevation disabled={trabajando}
            startIcon={trabajando ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Sí, dar acceso
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmar: quitar acceso */}
      <Dialog open={quitar !== null} onClose={() => !trabajando && setQuitar(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Quitar el acceso de administrador?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>{quitar?.email}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 1 }}>
            La cuenta no se borra: pasa a ser un usuario normal y deja de ver las empresas que no sean suyas. El cambio es inmediato y queda registrado a tu nombre.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setQuitar(null)} disabled={trabajando} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button onClick={() => void confirmarQuitar()} color="error" variant="contained" disableElevation disabled={trabajando}
            startIcon={trabajando ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Sí, quitar acceso
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
