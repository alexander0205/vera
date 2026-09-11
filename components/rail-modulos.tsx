'use client';

/**
 * RailModulos — los otros módulos disponibles, al pie del menú lateral.
 *
 * Va en los CUATRO menús con el mismo código y la misma fuente de datos
 * (`usePermissions().modules` = empresa ∩ rol, lo mismo que usa el switcher del
 * header). Antes cada rail tenía lo suyo: Facturación enlazaba a POS y Escolar
 * a mano, y los otros tres tenían un único "Ir a Facturación" — así el menú
 * ofrecía cosas distintas según dónde estuvieras.
 *
 * Se omite el módulo actual: no tiene sentido ofrecer ir a donde ya estás.
 * Si no queda ninguno, no se dibuja ni el separador.
 */

import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FileText, Store, GraduationCap, Building2, Users } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { MODULE_LABELS, moduleUrl, type ModuleKey } from '@/lib/config/modules';
import { anunciarCambioDeModulo } from '@/components/loader-llegada';

const ICONS: Record<ModuleKey, typeof FileText> = {
  facturacion:    FileText,
  administracion: Building2,
  pos:            Store,
  escolar:        GraduationCap,
  nomina:         Users,
};

export function RailModulos({ current }: { current: ModuleKey | null }) {
  const { modules } = usePermissions();
  const otros = modules.filter(m => m !== current);
  if (otros.length === 0) return null;

  return (
    // Va DENTRO de la lista que hace scroll (después de Configuración), no
    // anclado al pie: el separador es una línea arriba y un margen, no un borde
    // de footer.
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <Typography
        className="nav-text"
        sx={{
          px: 1.5, mb: 0.25, fontSize: '0.6875rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          fontFamily: 'var(--font-display)',
          color: 'rgba(203,213,225,0.5)', whiteSpace: 'nowrap',
        }}
      >
        Módulos
      </Typography>

      {otros.map(m => {
        const Icono = ICONS[m];
        return (
          <Box
            key={m}
            component={Link}
            href={moduleUrl(m)}
            // Desde aquí también se cambia de módulo, así que también hay que
            // avisar: si no, el módulo de destino se monta a pedazos y a la
            // vista parece que la pantalla de carga va y viene.
            onClick={() => anunciarCambioDeModulo(MODULE_LABELS[m])}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
              borderRadius: '10px', fontSize: '0.875rem', textDecoration: 'none',
              fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.005em',
              color: 'rgba(203,213,225,0.72)', transition: 'all 0.15s',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(248,250,252,0.96)' },
            }}
          >
            <Icono style={{ width: 18, height: 18, flexShrink: 0 }} />
            <Box component="span" className="nav-text" sx={{ whiteSpace: 'nowrap' }}>
              {MODULE_LABELS[m]}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
