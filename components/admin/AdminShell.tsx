'use client';

/**
 * El marco del panel del equipo de Zero: barra lateral con las secciones
 * agrupadas, barra de arriba con la campana y el menú de la persona, y el
 * contenido. En pantallas chicas la barra lateral es un cajón.
 *
 * Solo pinta. Quién puede ver el panel se decide en el servidor
 * (`exigirAdmin()` en cada página y `requirePlatformAdmin()` en cada ruta).
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import {
  Activity, BarChart3, Bot, Building2, ClipboardList, Gauge, LayoutDashboard, ListChecks, LogOut, Menu as MenuIcon,
  MessageCircle, PlayCircle, ScrollText, ShieldCheck, Undo2, Users, UserCircle, UserCog,
} from 'lucide-react';
import { IsotipoZero } from '@/components/marca-zero';
import { CampanaNotificaciones } from '@/components/notificaciones/CampanaNotificaciones';

interface Seccion { href: string; etiqueta: string; icono: typeof Gauge }
interface Grupo { titulo: string | null; secciones: Seccion[] }

const GRUPOS: Grupo[] = [
  { titulo: null, secciones: [{ href: '/admin', etiqueta: 'Resumen', icono: LayoutDashboard }] },
  {
    titulo: 'Negocios',
    secciones: [
      { href: '/admin/empresas', etiqueta: 'Empresas', icono: Building2 },
      { href: '/admin/usuarios', etiqueta: 'Usuarios', icono: Users },
    ],
  },
  {
    titulo: 'Operación',
    secciones: [
      { href: '/admin/tareas', etiqueta: 'Tareas de colegios', icono: ListChecks },
      { href: '/admin/embudo', etiqueta: 'Embudo', icono: BarChart3 },
      { href: '/admin/tiempos', etiqueta: 'Tiempos', icono: Gauge },
      { href: '/admin/logs', etiqueta: 'Registros', icono: ScrollText },
    ],
  },
  {
    titulo: 'Plataforma',
    secciones: [
      { href: '/admin/equipo', etiqueta: 'Equipo Zero', icono: UserCog },
      { href: '/admin/whatsapp', etiqueta: 'WhatsApp', icono: MessageCircle },
      { href: '/admin/ia', etiqueta: 'Inteligencia artificial', icono: Bot },
      { href: '/admin/academia', etiqueta: 'Academia', icono: PlayCircle },
    ],
  },
];

const TODAS = GRUPOS.flatMap((g) => g.secciones);

function activa(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

export interface UsuarioShell { nombre: string | null; email: string; esDueno: boolean; cargo?: string | null; fotoUrl?: string | null }

function Navegacion({ pathname, alNavegar }: { pathname: string; alNavegar?: () => void }) {
  return (
    <Box component="nav" aria-label="Secciones del panel" sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 1.5, py: 2 }}>
      {GRUPOS.map((g, i) => (
        <Box key={g.titulo ?? i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {g.titulo && (
            <Typography sx={{ px: 1.5, pb: 0.5, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>
              {g.titulo}
            </Typography>
          )}
          {g.secciones.map((s) => {
            const on = activa(pathname, s.href);
            const Icono = s.icono;
            return (
              <Link key={s.href} href={s.href} onClick={alNavegar} aria-current={on ? 'page' : undefined}
                style={{ textDecoration: 'none' }}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 0.9, borderRadius: '8px',
                  color: on ? '#fff' : '#cbd5e1', bgcolor: on ? 'rgba(91,115,236,0.22)' : 'transparent',
                  boxShadow: on ? 'inset 3px 0 0 #5b73ec' : 'none', transition: 'background-color .15s, color .15s',
                  '&:hover': { bgcolor: on ? 'rgba(91,115,236,0.28)' : 'rgba(255,255,255,0.06)', color: '#fff' },
                }}>
                  <Icono size={17} strokeWidth={on ? 2.25 : 1.9} />
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: on ? 600 : 500, color: 'inherit' }}>{s.etiqueta}</Typography>
                </Box>
              </Link>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

export function AdminShell({ usuario, estado, children }: { usuario: UsuarioShell; estado: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [cajon, setCajon] = useState(false);
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const actual = TODAS.filter((s) => activa(pathname, s.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const inicial = (usuario.nombre?.trim() || usuario.email).charAt(0).toUpperCase();

  async function salir() {
    setAncla(null);
    await fetch('/api/user', { method: 'DELETE' }).catch(() => {});
    window.location.href = '/sign-in';
  }

  const marca = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, height: 56, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
      <IsotipoZero lado={28} />
      <Box>
        <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '0.9375rem', color: '#fff', lineHeight: 1.1 }}>Zero Admin</Typography>
        <Typography sx={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Equipo de la plataforma</Typography>
      </Box>
    </Box>
  );

  const lateral = (alNavegar?: () => void) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#111827', width: 248 }}>
      {marca}
      <Box sx={{ flex: 1, overflowY: 'auto' }}><Navegacion pathname={pathname} alNavegar={alNavegar} /></Box>
      <Box sx={{ p: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {estado}
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderRadius: '8px', color: '#94a3b8', fontSize: '0.8125rem', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' } }}>
            <Undo2 size={15} /> Volver a la app
          </Box>
        </Link>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb', display: 'flex' }}>
      {/* Barra lateral fija en pantallas anchas */}
      <Box component="aside" sx={{ display: { xs: 'none', md: 'block' }, width: 248, flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}>
        {lateral()}
      </Box>
      {/* Cajón en celular */}
      <Drawer open={cajon} onClose={() => setCajon(false)} sx={{ display: { md: 'none' } }} ModalProps={{ keepMounted: false }}>
        {lateral(() => setCajon(false))}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box component="header" sx={{
          position: 'sticky', top: 0, zIndex: 20, height: 56, display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, sm: 3 },
          bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e5e7eb',
        }}>
          <IconButton onClick={() => setCajon(true)} aria-label="Abrir el menú" sx={{ display: { md: 'none' }, color: '#374151' }} size="small">
            <MenuIcon size={20} />
          </IconButton>
          <Typography component="div" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 1 }}>
            {actual && <actual.icono size={16} color="#6b7280" />} {actual?.etiqueta ?? 'Panel'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <CampanaNotificaciones ambito="plataforma" />
          <Tooltip title={usuario.email}>
            <IconButton onClick={(e) => setAncla(e.currentTarget)} aria-label="Menú de tu cuenta" aria-haspopup="menu" size="small" sx={{ ml: 0.5 }}>
              {usuario.fotoUrl ? (
                <Box component="img" src={usuario.fotoUrl} alt="" sx={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#3658e1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.8125rem', fontWeight: 700 }}>
                  {inicial}
                </Box>
              )}
            </IconButton>
          </Tooltip>
          <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 240, borderRadius: '12px', border: '1px solid #e5e7eb' } } }}>
            <Box sx={{ px: 2, py: 1.25 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{usuario.nombre?.trim() || 'Administrador'}</Typography>
              {usuario.cargo && <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>{usuario.cargo}</Typography>}
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', wordBreak: 'break-all' }}>{usuario.email}</Typography>
              <Box sx={{ mt: 0.75, display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: '999px', bgcolor: usuario.esDueno ? '#eef2fe' : '#f3f4f6', color: usuario.esDueno ? '#2a45c4' : '#4b5563', fontSize: '0.6875rem', fontWeight: 600 }}>
                <ShieldCheck size={12} /> {usuario.esDueno ? 'Dueño de la plataforma' : 'Administrador'}
              </Box>
            </Box>
            <Divider />
            <MenuItem component={Link} href="/admin/equipo?perfil=1" onClick={() => setAncla(null)}>
              <ListItemIcon><UserCircle size={16} /></ListItemIcon> Mi foto y cargo
            </MenuItem>
            <MenuItem component={Link} href="/dashboard" onClick={() => setAncla(null)}>
              <ListItemIcon><ClipboardList size={16} /></ListItemIcon> Ir a mis empresas
            </MenuItem>
            <MenuItem component={Link} href="/admin/logs" onClick={() => setAncla(null)}>
              <ListItemIcon><Activity size={16} /></ListItemIcon> Registros del sistema
            </MenuItem>
            <Divider />
            <MenuItem onClick={salir} sx={{ color: '#dc2626' }}>
              <ListItemIcon><LogOut size={16} color="#dc2626" /></ListItemIcon> Cerrar sesión
            </MenuItem>
          </Menu>
        </Box>

        <Box component="main" sx={{ p: { xs: 2, sm: 3 }, width: '100%', maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
