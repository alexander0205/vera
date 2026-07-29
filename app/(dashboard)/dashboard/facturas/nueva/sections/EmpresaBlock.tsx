'use client';

import Link from 'next/link';
import type { EmpresaPerfil } from '../utils/types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  empresa: EmpresaPerfil | null;
  showCambiarEmpresa?: boolean;
  logoSize?: 'sm' | 'md';
}

export function EmpresaBlock({ empresa, showCambiarEmpresa = false, logoSize = 'sm' }: Props) {
  const logoH  = logoSize === 'md' ? 48 : 40;
  const logoMW = logoSize === 'md' ? 120 : 100;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      {empresa?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={empresa.logo}
          alt="Logo"
          style={{ height: logoH, maxWidth: logoMW, objectFit: 'contain', flexShrink: 0 }}
        />
      ) : (
        <Box
          component={Link}
          href="/dashboard/configuracion"
          title="Subir logo en Configuración"
          sx={{
            width: 80, height: logoH, flexShrink: 0,
            border: '2px dashed #d1d5db', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '&:hover': { borderColor: '#0d9488' }, transition: 'border-color 0.15s',
          }}
        >
          <Typography sx={{ fontSize: '0.5625rem', color: '#6b7280', textAlign: 'center', lineHeight: 1.3, px: 0.5 }}>Logo</Typography>
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Tu empresa'}
        </Typography>
        {empresa?.rnc && (
          <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', lineHeight: 1.25, mt: '2px' }}>RNC: {empresa.rnc}</Typography>
        )}
        {showCambiarEmpresa && (
          <Box
            component={Link}
            href="/dashboard/configuracion"
            sx={{ fontSize: '0.6875rem', color: '#0f766e', lineHeight: 1.25, mt: '4px', display: 'inline-block', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            Cambiar empresa
          </Box>
        )}
      </Box>
    </Box>
  );
}
