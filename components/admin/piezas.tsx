import type { ReactNode } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Piezas comunes de las pantallas del panel. Sin estado ni hooks: sirven igual
 * desde páginas de servidor y de cliente.
 */

export function EncabezadoPagina({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, mb: 2.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h1" sx={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, color: '#111827', lineHeight: 1.2 }}>{titulo}</Typography>
        {descripcion && <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280', maxWidth: 720 }}>{descripcion}</Typography>}
      </Box>
      {acciones && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{acciones}</Box>}
    </Box>
  );
}

type Tono = 'neutro' | 'alerta' | 'peligro' | 'ok' | 'azul';
const TONOS: Record<Tono, { fondo: string; borde: string; valor: string }> = {
  neutro: { fondo: '#fff', borde: '#e5e7eb', valor: '#111827' },
  azul: { fondo: '#eef2fe', borde: '#c7d2fc', valor: '#2a45c4' },
  ok: { fondo: '#f0fdf4', borde: '#bbf7d0', valor: '#166534' },
  alerta: { fondo: '#fffbeb', borde: '#fde68a', valor: '#92400e' },
  peligro: { fondo: '#fef2f2', borde: '#fecaca', valor: '#b91c1c' },
};

/** Una cifra con su etiqueta; con `href` es un acceso directo al detalle. */
export function TarjetaDato({ etiqueta, valor, nota, tono = 'neutro', href }: {
  etiqueta: string; valor: string | number; nota?: string; tono?: Tono; href?: string;
}) {
  const t = TONOS[tono];
  const cuerpo = (
    <Box sx={{
      bgcolor: t.fondo, border: `1px solid ${t.borde}`, borderRadius: '12px', p: 2, height: '100%',
      transition: 'box-shadow .15s, transform .15s', ...(href ? { '&:hover': { boxShadow: '0 4px 14px rgba(15,23,42,.08)', transform: 'translateY(-1px)' } } : {}),
    }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</Typography>
      <Typography sx={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.2, color: t.valor, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
      {nota && <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>{nota}</Typography>}
    </Box>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{cuerpo}</Link> : cuerpo;
}

export function RejillaDeTarjetas({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, mb: 2.5 }}>
      {children}
    </Box>
  );
}
