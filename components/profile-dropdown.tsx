'use client';

/**
 * ProfileDropdown — avatar del usuario con su menú.
 *
 * Vivía dentro del layout de Facturación, así que los otros módulos
 * (Administración Escolar, Administración) se quedaban sin header. Extraído
 * aquí para que todos los shells de módulo monten el mismo.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Activity, CreditCard, LogOut, Shield, UserCircle } from 'lucide-react';

export interface UserInfo { name: string | null; email: string; platformRole?: string | null; }

export function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function ProfileDropdown({ user }: { user: UserInfo | null }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  async function handleSignOut() {
    setAnchorEl(null);
    await fetch('/api/user', { method: 'DELETE' });
    router.push('/sign-in');
    router.refresh();
  }

  const menuItems = [
    ...(user?.platformRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Panel admin' }] : []),
    { href: '/dashboard/perfil',      icon: UserCircle, label: 'Mi perfil' },
    { href: '/dashboard/suscripcion', icon: CreditCard, label: 'Suscripción' },
    { href: '/dashboard/activity',    icon: Activity,   label: 'Actividad' },
    { href: '/dashboard/security',    icon: Shield,     label: 'Seguridad' },
  ];

  const initials = user ? getInitials(user.name, user.email) : '?';

  return (
    <>
      <Tooltip title={user?.name ?? user?.email ?? ''} placement="bottom">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          sx={{ p: 0.5 }}
        >
          <Avatar
            sx={{
              width:    32,
              height:   32,
              bgcolor:  'primary.main',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {initials}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              borderRadius: '12px',
              border:       '1px solid #e5e7eb',
              boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              minWidth:     220,
              mt:           0.5,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {user?.name ?? user?.email}
          </Typography>
          {user?.name && (
            <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
              {user.email}
            </Typography>
          )}
        </Box>

        <Box sx={{ py: 0.5 }}>
          {menuItems.map(item => (
            <MenuItem
              key={item.href}
              component={Link}
              href={item.href}
              sx={{ borderRadius: '6px', mx: 0.5, gap: 1.5, py: '6px', fontSize: '0.875rem' }}
            >
              <ListItemIcon sx={{ minWidth: 'auto' }}>
                <item.icon style={{ width: 16, height: 16, color: '#6b7280' }} />
              </ListItemIcon>
              {item.label}
            </MenuItem>
          ))}
        </Box>

        <Divider sx={{ my: 0 }} />

        <Box sx={{ py: 0.5 }}>
          <MenuItem
            onClick={handleSignOut}
            sx={{
              borderRadius: '6px',
              mx: 0.5,
              gap: 1.5,
              py: '6px',
              fontSize: '0.875rem',
              color: 'error.main',
              '&:hover': { bgcolor: '#fef2f2' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}>
              <LogOut style={{ width: 16, height: 16, color: '#ef4444' }} />
            </ListItemIcon>
            Cerrar sesión
          </MenuItem>
        </Box>
      </Menu>
    </>
  );
}
