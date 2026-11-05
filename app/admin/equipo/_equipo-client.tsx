'use client';

import { useRef, useState } from 'react';
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
import { Camera, KeyRound, Mail, Pencil, ShieldAlert, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { CARGO_MAX } from '@/lib/auth/equipo-zero-perfil-reglas';

export interface MiembroVista {
  id: number;
  nombre: string | null;
  email: string;
  esDueno: boolean;
  dosFactores: boolean;
  emailVerificado: boolean;
  creadoEn: string;
  enlacePendienteHasta: string | null;
  cargo: string | null;
  fotoUrl: string | null;
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

/** Lado de la foto guardada: se recorta al centro y se reduce en el navegador antes de subirla. */
const LADO_FOTO = 256;

/** La imagen elegida, recortada en cuadrado al centro y reducida a 256×256 JPEG, como data URL. */
async function recortarFoto(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) throw new Error('No se pudo leer la imagen.');
    const lienzo = document.createElement('canvas');
    lienzo.width = LADO_FOTO; lienzo.height = LADO_FOTO;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Tu navegador no pudo preparar la foto.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
    return lienzo.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Avatar({ m, lado = 38 }: { m: Pick<MiembroVista, 'nombre' | 'email' | 'esDueno' | 'fotoUrl'>; lado?: number }) {
  if (m.fotoUrl) {
    return <Box component="img" src={m.fotoUrl} alt="" sx={{ width: lado, height: lado, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }} />;
  }
  return (
    <Box sx={{ width: lado, height: lado, borderRadius: '50%', bgcolor: m.esDueno ? '#3658e1' : '#e5e7eb', color: m.esDueno ? '#fff' : '#374151', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: lado > 50 ? '1.5rem' : undefined, flexShrink: 0 }}>
      {(m.nombre?.trim() || m.email).charAt(0).toUpperCase()}
    </Box>
  );
}

const textoCorreo = (c?: string) =>
  c === 'enviado' ? 'Le enviamos el correo.'
    : c === 'fuera_de_produccion' ? 'Correo no enviado: este entorno no manda correos de verdad.'
      : c === 'fallo' ? 'El correo no salió: usa «Enviar enlace nuevo».' : '';

export function EquipoClient({ miembros, yoId, esDueno, migracionPendiente, abrirMiPerfil = false }: {
  miembros: MiembroVista[]; yoId: number; esDueno: boolean; migracionPendiente: boolean; abrirMiPerfil?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cuenta, setCuenta] = useState<Cuenta | null | 'nueva'>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [quitar, setQuitar] = useState<MiembroVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Foto y cargo: la propia persona o el dueño.
  const yo = miembros.find((m) => m.id === yoId) ?? null;
  const [editar, setEditar] = useState<MiembroVista | null>(abrirMiPerfil ? yo : null);
  const [cargo, setCargo] = useState(abrirMiPerfil ? (yo?.cargo ?? '') : '');
  /** `undefined` = sin cambio; `null` = quitarla; texto = foto nueva (data URL). */
  const [fotoNueva, setFotoNueva] = useState<string | null | undefined>(undefined);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const puedeEditar = (m: MiembroVista) => m.id === yoId || esDueno;

  /** Al cerrar, si se abrió desde el menú (`?perfil=1`), se limpia la URL para poder volver a abrirlo. */
  function cerrarEditar() {
    setEditar(null);
    if (abrirMiPerfil) router.replace('/admin/equipo', { scroll: false });
  }

  function abrirEditar(m: MiembroVista) {
    setEditar(m); setCargo(m.cargo ?? ''); setFotoNueva(undefined);
  }

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { toast.error('Elige una imagen (JPG, PNG o WebP).'); return; }
    setPreparandoFoto(true);
    try { setFotoNueva(await recortarFoto(archivo)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo leer la imagen.'); }
    finally { setPreparandoFoto(false); if (entradaFoto.current) entradaFoto.current.value = ''; }
  }

  async function guardarPerfil() {
    if (!editar) return;
    const cuerpo: { cargo?: string | null; foto?: string | null } = {};
    const cargoLimpio = cargo.trim();
    if (cargoLimpio !== (editar.cargo ?? '')) cuerpo.cargo = cargoLimpio || null;
    if (fotoNueva !== undefined) cuerpo.foto = fotoNueva;
    if (Object.keys(cuerpo).length === 0) { cerrarEditar(); return; }
    setTrabajando(true);
    const r = await fetch(`/api/admin/equipo/${editar.id}/perfil`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({})) as { error?: string };
    setTrabajando(false);
    if (!r.ok) { toast.error(d.error ?? 'No se pudo guardar.'); return; }
    toast.success('Guardado.');
    cerrarEditar();
    router.refresh();
  }

  const fotoEnDialogo = editar ? (fotoNueva === undefined ? editar.fotoUrl : fotoNueva) : null;

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
              <Avatar m={m} />
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
                  {m.nombre ?? m.email}{soyYo && <Box component="span" sx={{ color: '#6b7280', fontWeight: 400 }}> (tú)</Box>}
                </Typography>
                {m.cargo && <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500 }}>{m.cargo}</Typography>}
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
              {(esDueno || puedeEditar(m)) && (
                <Box sx={{ display: 'flex', gap: 0.75, ml: 'auto', flexWrap: 'wrap' }}>
                  {puedeEditar(m) && !migracionPendiente && (
                    <Button size="small" startIcon={<Pencil size={14} />} onClick={() => abrirEditar(m)} sx={{ textTransform: 'none' }}>Foto y cargo</Button>
                  )}
                  {esDueno && <Button size="small" startIcon={<KeyRound size={14} />} onClick={() => void enlaceNuevo(m)} sx={{ textTransform: 'none' }}>Enviar enlace nuevo</Button>}
                  {esDueno && !m.esDueno && !soyYo && (
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

      {/* Foto y cargo */}
      <Dialog open={editar !== null} onClose={() => !trabajando && cerrarEditar()} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editar?.id === yoId ? 'Tu foto y cargo' : `Foto y cargo de ${editar?.nombre ?? editar?.email ?? ''}`}</DialogTitle>
        <DialogContent>
          {editar && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5, mb: 2.5 }}>
              <Avatar m={{ ...editar, fotoUrl: fotoEnDialogo ?? null }} lado={72} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'flex-start' }}>
                <input ref={entradaFoto} type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={(e) => void elegirFoto(e.target.files?.[0])} />
                <Button size="small" variant="outlined" disabled={preparandoFoto || trabajando}
                  startIcon={preparandoFoto ? <CircularProgress size={14} /> : <Camera size={14} />}
                  onClick={() => entradaFoto.current?.click()} sx={{ textTransform: 'none', borderRadius: '8px' }}>
                  {fotoEnDialogo ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                {fotoEnDialogo && (
                  <Button size="small" color="error" disabled={trabajando} startIcon={<Trash2 size={14} />}
                    onClick={() => setFotoNueva(null)} sx={{ textTransform: 'none' }}>
                    Quitar foto
                  </Button>
                )}
              </Box>
            </Box>
          )}
          <TextField label="Cargo" size="small" fullWidth value={cargo} onChange={(e) => setCargo(e.target.value)}
            placeholder="Ej.: Soporte técnico" autoComplete="off" slotProps={{ htmlInput: { maxLength: CARGO_MAX } }}
            helperText="Lo que hace en el equipo de Zero. Se ve en el panel." />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={cerrarEditar} disabled={trabajando} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button onClick={() => void guardarPerfil()} variant="contained" disableElevation disabled={trabajando || preparandoFoto}
            startIcon={trabajando ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Guardar
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
