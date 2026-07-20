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
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { LayoutGrid, FileText, Store, GraduationCap, Check, Building2 } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import {
  MODULE_LABELS, MODULE_DESCRIPTIONS, moduleUrl, type ModuleKey,
} from '@/lib/config/modules';

const ICONS: Record<ModuleKey, typeof FileText> = {
  facturacion: FileText,
  pos: Store,
  escolar: GraduationCap,
};

export function ModuleSwitcher({ current }: { current: ModuleKey }) {
  const { modules } = usePermissions();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  // Con un solo módulo igual se muestra: desde aquí se entra a Administración.
  // Sin ninguno (o cargando) no hay nada que ofrecer.
  if (modules.length === 0) return null;

  return (
    <>
      <Button
        onClick={e => setAnchor(e.currentTarget)}
        size="small"
        startIcon={<LayoutGrid style={{ width: 16, height: 16 }} />}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          color: 'text.secondary',
          borderRadius: '8px',
          px: 1.25,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {MODULE_LABELS[current]}
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
              onClick={() => setAnchor(null)}
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

        {/* Administración del negocio — NO es un módulo facturable (toda empresa
            la necesita), pero vive en su propio espacio como los demás. */}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          component="a"
          href="/cuenta"
          onClick={() => setAnchor(null)}
          sx={{ gap: 1.5, py: 1.25, mx: 0.75, borderRadius: '8px' }}
        >
          <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 style={{ width: 17, height: 17 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Administración</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'normal' }}>
              Mi empresa, usuarios, roles y plan
            </Typography>
          </Box>
        </MenuItem>
      </Menu>
    </>
  );
}
