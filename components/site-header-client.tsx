'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';

interface Props {
  navLinks: { href: string; label: string }[];
  isLoggedIn: boolean;
}

export function SiteHeaderClient({ navLinks, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Botón hamburger */}
      <IconButton
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        sx={{
          display: { md: 'none' },
          p: 1,
          mr: -1,
          color: '#4b5563',
          '&:hover': { color: '#111827', bgcolor: 'transparent' },
        }}
      >
        {open ? <X style={{ width: 24, height: 24 }} /> : <Menu style={{ width: 24, height: 24 }} />}
      </IconButton>

      {/* Panel móvil */}
      {open && (
        <Box
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            bgcolor: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
            display: { md: 'none' },
          }}
        >
          <Box sx={{ px: 2, py: 2, '& > * + *': { mt: 0.5 } }}>
            {navLinks.map((link) => (
              <Box
                key={link.href}
                component={Link}
                href={link.href}
                onClick={() => setOpen(false)}
                sx={{
                  display: 'block',
                  px: 1.5,
                  py: 1.25,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  '&:hover': { bgcolor: '#f9fafb' },
                }}
              >
                {link.label}
              </Box>
            ))}

            <Box sx={{ pt: 1.5, mt: 1.5, borderTop: '1px solid #f3f4f6', '& > * + *': { mt: 1 } }}>
              {isLoggedIn ? (
                <Box
                  component={Link}
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'center',
                    bgcolor: '#3658e1',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    px: 2,
                    py: 1.25,
                    borderRadius: '9999px',
                    textDecoration: 'none',
                  }}
                >
                  Ir al dashboard
                </Box>
              ) : (
                <>
                  <Box
                    component={Link}
                    href="/sign-in"
                    onClick={() => setOpen(false)}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      px: 2,
                      py: 1.25,
                      borderRadius: '9999px',
                      border: '1px solid #e5e7eb',
                      textDecoration: 'none',
                    }}
                  >
                    Iniciar sesión
                  </Box>
                  <Box
                    component={Link}
                    href="/sign-up"
                    onClick={() => setOpen(false)}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      bgcolor: '#3658e1',
                      color: '#ffffff',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      px: 2,
                      py: 1.25,
                      borderRadius: '9999px',
                      textDecoration: 'none',
                    }}
                  >
                    Empezar gratis →
                  </Box>
                </>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </>
  );
}
