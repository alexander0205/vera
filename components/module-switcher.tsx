'use client';

/**
 * ModuleSwitcher — cambia entre módulos del producto (Facturación ↔ POS).
 *
 * Patrón "Ir a…" (como Alegra): botón en el header que despliega los módulos
 * a los que el usuario tiene acceso (empresa ∩ rol, vía usePermissions).
 * Con un solo módulo accesible no renderiza nada.
 *
 * En prod cada módulo vive en su subdominio (moduleUrl); la sesión es
 * compartida por cookie de dominio, así que el cambio es un link normal.
 *
 * Justo por eso lleva pantalla de carga: al ser una navegación completa del
 * navegador —no del router— la app se queda muda mientras el otro módulo
 * arranca, y sin nada en pantalla el clic parece no haber hecho nada. El mismo
 * `ZeroLoader` que ya usa el cambio de empresa, que solo aparece si la espera
 * pasa de 400 ms.
 */

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { LayoutGrid, FileText, Store, GraduationCap, Check, Building2, Users } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ZeroLoader } from '@/components/zero-loader';
import { anunciarCambioDeModulo } from '@/components/loader-llegada';
import {
  MODULE_LABELS, MODULE_DESCRIPTIONS, moduleUrl, type ModuleKey,
} from '@/lib/config/modules';

const ICONS: Record<ModuleKey, typeof FileText> = {
  facturacion: FileText,
  administracion: Building2,
  pos: Store,
  escolar: GraduationCap,
  nomina: Users,
};

/**
 * `current` puede ser null en áreas que no son un módulo del catálogo (p. ej.
 * Administración): ahí el botón solo dice "Ir a…" y no marca ninguno activo.
 */
export function ModuleSwitcher({ current }: { current: ModuleKey | null }) {
  const { modules } = usePermissions();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [yendoA, setYendoA] = useState<ModuleKey | null>(null);

  // Si la navegación no llega a ocurrir —el usuario cancela, o vuelve atrás y
  // la página sale de la caché del navegador— el loader se quedaría tapando
  // todo. Se rinde solo a los 15 s, igual que el cambio de empresa.
  useEffect(() => {
    if (!yendoA) return;
    const t = setTimeout(() => setYendoA(null), 15000);
    return () => clearTimeout(t);
  }, [yendoA]);

  // Con un solo módulo igual se muestra: desde aquí se entra a Administración.
  // Sin ninguno (o cargando) no hay nada que ofrecer.
  if (modules.length === 0) return null;

  return (
    <>
      {/* En el teléfono queda el icono a secas.
          «Punto de Venta» salía cortado a «Punto de Ve» y desbordaba la barra;
          además el nombre del módulo en el que ya estás es la información menos
          útil de esa franja. El icono sigue abriendo la misma lista, con los
          nombres completos. */}
      <Button
        onClick={e => setAnchor(e.currentTarget)}
        size="small"
        aria-label="Cambiar de módulo"
        startIcon={<LayoutGrid style={{ width: 16, height: 16 }} />}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          color: 'text.secondary',
          borderRadius: '8px',
          flexShrink: 0,
          px: { xs: 0.75, sm: 1.25 },
          minWidth: { xs: 40, sm: 64 },
          '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: 0 },
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {current ? MODULE_LABELS[current] : 'Ir a…'}
        </Box>
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 280, mt: 0.5 } } as object }}
      >
        <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: '0.6875rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Cambiar de módulo
        </Typography>
        {modules.map(mod => {
          const Icon = ICONS[mod];
          const active = mod === current;
          return (
            <MenuItem
              key={mod}
              component="a"
              href={active ? undefined : moduleUrl(mod)}
              onClick={() => {
                setAnchor(null);
                // Sin preventDefault: el enlace navega igual, el loader solo
                // cubre el hueco hasta que el módulo nuevo pinte.
                if (!active) {
                  setYendoA(mod);
                  // El documento actual muere con la navegación y se lleva el
                  // loader; se deja anotado para que el módulo de destino lo
                  // retome mientras termina de montarse.
                  anunciarCambioDeModulo(MODULE_LABELS[mod]);
                }
              }}
              selected={active}
              sx={{ gap: 1.5, py: 1.25, mx: 0.75, borderRadius: '8px' }}
            >
              <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: active ? 'primary.main' : 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon style={{ width: 17, height: 17, color: active ? '#fff' : undefined }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {MODULE_LABELS[mod]}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'normal' }}>
                  {MODULE_DESCRIPTIONS[mod]}
                </Typography>
              </Box>
              {active && <Check style={{ width: 16, height: 16 }} />}
            </MenuItem>
          );
        })}
      </Menu>

      <ZeroLoader
        open={!!yendoA}
        subtitulo={yendoA ? `Abriendo ${MODULE_LABELS[yendoA]}` : undefined}
      />
    </>
  );
}
