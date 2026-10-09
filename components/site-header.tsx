import Link from 'next/link';
import { getUser } from '@/lib/db/queries';
import { SiteHeaderClient } from './site-header-client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { LogoZero } from '@/components/marca-zero';

const NAV_LINKS = [
  { href: '/#contacto', label: 'Contacto' },
];

export async function SiteHeader() {
  const user = await getUser();
  const isLoggedIn = !!user;

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%',
        borderBottom: '1px solid rgba(229,231,235,0.6)',
        bgcolor: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Top bar — estado de sesión */}
      <Box sx={{ bgcolor: '#111827', color: '#d1d5db', fontSize: '0.75rem' }}>
        <Box
          sx={{
            maxWidth: '80rem',
            mx: 'auto',
            px: { xs: 2, sm: 3, lg: 4 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 32,
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Facturación electrónica certificada por la DGII
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto' }}>
            {isLoggedIn ? (
              <>
                <Box component="span" sx={{ color: '#9ca3af' }}>
                  {user.email}
                </Box>
                <Box
                  component="a"
                  href="/dashboard"
                  sx={{
                    color: '#ffffff',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                    '&:hover': { color: '#a5b4f9' },
                  }}
                >
                  Ir al dashboard →
                </Box>
              </>
            ) : (
              <>
                <Box
                  component="a"
                  href="/sign-in"
                  sx={{
                    color: 'inherit',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                    '&:hover': { color: '#ffffff' },
                  }}
                >
                  Iniciar sesión
                </Box>
                <Box
                  component="a"
                  href="/sign-up"
                  sx={{
                    bgcolor: '#3658e1',
                    color: '#ffffff',
                    px: 1.5,
                    py: 0.25,
                    borderRadius: '9999px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'background-color 0.15s',
                    '&:hover': { bgcolor: '#5b73ec' },
                  }}
                >
                  Crear cuenta
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* Nav principal */}
      <Box component="nav" sx={{ maxWidth: '80rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          {/* Logo */}
          <Box
            component="a"
            href="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, textDecoration: 'none' }}
          >
            <LogoZero alto={30} />
          </Box>

          {/* Links — desktop */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 4 }}>
            {NAV_LINKS.map((link) => (
              <Box
                key={link.href}
                component="a"
                href={link.href}
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#4b5563',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                  '&:hover': { color: '#111827' },
                }}
              >
                {link.label}
              </Box>
            ))}
          </Box>

          {/* CTA — desktop */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5 }}>
            {isLoggedIn ? (
              <Box
                component="a"
                href="/dashboard"
                sx={{
                  bgcolor: '#3658e1',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  px: 2.5,
                  py: 1.25,
                  borderRadius: '9999px',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: '#2a45c4' },
                }}
              >
                Ir al dashboard
              </Box>
            ) : (
              <>
                <Box
                  component="a"
                  href="/sign-in"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#4b5563',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                    '&:hover': { color: '#111827' },
                  }}
                >
                  Iniciar sesión
                </Box>
                <Box
                  component="a"
                  href="/sign-up"
                  sx={{
                    bgcolor: '#3658e1',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    px: 2.5,
                    py: 1.25,
                    borderRadius: '9999px',
                    textDecoration: 'none',
                    transition: 'background-color 0.15s',
                    '&:hover': { bgcolor: '#2a45c4' },
                  }}
                >
                  Empezar gratis →
                </Box>
              </>
            )}
          </Box>

          {/* Hamburger — mobile (Client Component) */}
          <SiteHeaderClient navLinks={NAV_LINKS} isLoggedIn={isLoggedIn} />
        </Box>
      </Box>
    </Box>
  );
}
