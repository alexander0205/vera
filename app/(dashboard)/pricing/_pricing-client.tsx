'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { Check, FileText, Store, GraduationCap } from 'lucide-react';
import { MODULES, MODULE_LABELS, MODULE_DESCRIPTIONS, MODULE_HOME, type ModuleKey } from '@/lib/config/modules';
import { MODULE_TIERS, statusGrantsAccess, type ModuleTier } from '@/lib/config/module-plans';

// Estado actual de cada módulo de la empresa (server → cliente).
export interface ModuleState {
  status: string | null;   // null = nunca contratado
  tier: string | null;
}

const ICONS: Record<ModuleKey, React.ComponentType<{ size?: number; color?: string }>> = {
  facturacion: FileText,
  pos: Store,
  escolar: GraduationCap,
};

export function PricingClient({
  current,
  isNew,
}: {
  current: Record<ModuleKey, ModuleState>;
  isNew: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facturacionActiva = statusGrantsAccess(current.facturacion?.status ?? undefined);

  async function probar(modulo: ModuleKey, tier: string) {
    setError(null);
    setBusy(tier);
    try {
      const res = await fetch('/api/modulos/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulo, tier }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo iniciar la prueba');
      // Trial activo → entrar al módulo.
      router.push(MODULE_HOME[modulo]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setBusy(null);
    }
  }

  return (
    <Box>
      {isNew && (
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '12px', px: 2.5, py: 2 }}>
          <Typography sx={{ fontSize: '1.5rem' }}>🎉</Typography>
          <Box>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f766e' }}>¡Negocio registrado! Elige cómo empezar</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#0d9488', mt: 0.25 }}>
              Activa <strong>Facturación</strong> (el módulo base) con <strong>15 días de prueba gratis, sin tarjeta</strong>. Luego agregas Punto de Venta o Colegio.
            </Typography>
          </Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MODULES.map(modulo => {
          const tiers = MODULE_TIERS[modulo];
          const st = current[modulo];
          const activo = statusGrantsAccess(st?.status ?? undefined);
          const yaProbado = st?.status === 'trial_expired' || st?.status === 'canceled';
          const bloqueadoPorBase = modulo !== 'facturacion' && !facturacionActiva;
          const Icon = ICONS[modulo];

          return (
            <Box key={modulo}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Icon size={22} color="#0d9488" />
                <Box>
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                    {MODULE_LABELS[modulo]}
                    {modulo === 'facturacion' && <Chip label="Base" size="small" sx={{ ml: 1, height: 20, fontSize: '0.6875rem', bgcolor: '#f0fdfa', color: '#0f766e' }} />}
                    {activo && <Chip label={st?.status === 'trialing' ? 'En prueba' : 'Activo'} size="small" color="success" sx={{ ml: 1, height: 20, fontSize: '0.6875rem' }} />}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                    {MODULE_DESCRIPTIONS[modulo]}
                    {bloqueadoPorBase && ' — requiere Facturación activa'}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 3 }}>
                {tiers.map(tier => (
                  <TierCard
                    key={tier.key}
                    tier={tier}
                    esActual={activo && st?.tier === tier.key}
                    moduloActivo={activo}
                    yaProbado={yaProbado}
                    bloqueadoPorBase={bloqueadoPorBase}
                    busy={busy === tier.key}
                    disabledOtro={busy !== null && busy !== tier.key}
                    onProbar={() => probar(modulo, tier.key)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function TierCard({
  tier, esActual, moduloActivo, yaProbado, bloqueadoPorBase, busy, disabledOtro, onProbar,
}: {
  tier: ModuleTier;
  esActual: boolean;
  moduloActivo: boolean;
  yaProbado: boolean;
  bloqueadoPorBase: boolean;
  busy: boolean;
  disabledOtro: boolean;
  onProbar: () => void;
}) {
  const destacado = tier.ui.highlighted;

  let label = 'Probar 15 días gratis';
  let disabled = disabledOtro;
  if (esActual) { label = 'Plan actual'; disabled = true; }
  else if (moduloActivo) { label = 'Cambiar de plan (pronto)'; disabled = true; }
  else if (bloqueadoPorBase) { label = 'Activa Facturación primero'; disabled = true; }
  else if (yaProbado) { label = 'Prueba usada — suscribir (pronto)'; disabled = true; }
  if (busy) label = 'Activando…';

  return (
    <Box sx={{
      position: 'relative', display: 'flex', flexDirection: 'column', p: 3.5,
      borderRadius: '16px', border: '1px solid',
      ...(destacado ? { borderColor: '#0d9488' } : { borderColor: '#e5e7eb' }),
      bgcolor: '#fff', opacity: bloqueadoPorBase ? 0.7 : 1,
    }}>
      {destacado && (
        <Box sx={{ position: 'absolute', top: -12, left: 24, bgcolor: '#f97316', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '99px' }}>
          Recomendado
        </Box>
      )}
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{tier.label}</Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mb: 1.5 }}>{tier.ui.description}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 2 }}>
        <Typography sx={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>${tier.price}</Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>USD/mes</Typography>
      </Box>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1, mb: 3, flex: 1 }}>
        {tier.ui.marketingFeatures.map((f, i) => (
          <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Check size={15} color="#0d9488" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>{f}</Typography>
          </Box>
        ))}
      </Box>

      <Button
        variant={destacado ? 'contained' : 'outlined'} disabled={disabled} onClick={onProbar} fullWidth
        sx={{
          py: 1.1, borderRadius: '99px', textTransform: 'none', fontWeight: 600,
          ...(destacado
            ? { bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }
            : { color: '#0d9488', borderColor: '#0d9488', '&:hover': { borderColor: '#0f766e', bgcolor: '#f0fdfa' } }),
        }}
      >
        {label}
      </Button>
    </Box>
  );
}
