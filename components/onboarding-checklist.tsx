'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, Circle, X, ChevronDown, ChevronUp } from 'lucide-react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

interface OnboardingData {
  tieneCertificado: boolean;
  tieneSecuencias: boolean;
  tieneClientes: boolean;
  tieneFacturas: boolean;
  perfilCompleto: boolean;
}

export function OnboardingChecklist() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('onboarding_dismissed');
    if (saved === 'true') { setDismissed(true); return; }
    fetch('/api/onboarding/status').then(r => r.json()).then(setData).catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem('onboarding_dismissed', 'true');
    setDismissed(true);
  }

  if (dismissed || !data) return null;

  const items: ChecklistItem[] = [
    {
      id: 'perfil',
      label: 'Completa el perfil de tu empresa',
      description: 'Agrega RNC, dirección y logo',
      href: '/dashboard/configuracion',
      done: data.perfilCompleto,
    },
    // Certificado oculto del onboarding — gestión manual desde panel admin
    {
      id: 'secuencias',
      label: 'Registra tus secuencias de e-NCF',
      description: 'Solicítalas en la OVTT de la DGII',
      href: '/dashboard/secuencias',
      done: data.tieneSecuencias,
    },
    {
      id: 'clientes',
      label: 'Agrega tu primer cliente',
      description: 'Para poder emitir facturas rápido',
      href: '/dashboard/clientes',
      done: data.tieneClientes,
    },
    {
      id: 'facturas',
      label: 'Emite tu primer comprobante',
      description: '¡Ya estás listo para facturar!',
      href: '/dashboard/facturas/nueva',
      done: data.tieneFacturas,
    },
  ];

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;

  if (allDone) {
    dismiss();
    return null;
  }

  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <Box sx={{ bgcolor: '#ffffff', border: '1px solid #99f6e4', borderRadius: '12px', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)', overflow: 'hidden', mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, bgcolor: '#f0fdfa' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#134e4a' }}>Configuración inicial — {doneCount}/{items.length} completados</Typography>
            <Box sx={{ mt: 0.5, height: 6, bgcolor: '#99f6e4', borderRadius: '9999px', width: 192 }}>
              <Box sx={{ height: 6, bgcolor: '#0d9488', borderRadius: '9999px', transition: 'all 0.15s', width: `${pct}%` }} />
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => setCollapsed(c => !c)} size="small" sx={{ color: '#0d9488', '&:hover': { color: '#115e59', bgcolor: 'transparent' } }}>
            {collapsed ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronUp style={{ width: 16, height: 16 }} />}
          </IconButton>
          <IconButton onClick={dismiss} size="small" sx={{ color: '#2dd4bf', '&:hover': { color: '#0f766e', bgcolor: 'transparent' } }}>
            <X style={{ width: 16, height: 16 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Items */}
      {!collapsed && (
        <Box sx={{ '& > * + *': { borderTop: '1px solid #f3f4f6' } }}>
          {items.map(item => (
            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5, ...(item.done ? { opacity: 0.6 } : {}) }}>
              {item.done
                ? <CheckCircle style={{ width: 20, height: 20, color: '#14b8a6', flexShrink: 0 }} />
                : <Circle style={{ width: 20, height: 20, color: '#d1d5db', flexShrink: 0 }} />
              }
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, ...(item.done ? { textDecoration: 'line-through', color: '#9ca3af' } : { color: '#111827' }) }}>
                  {item.label}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.description}</Typography>
              </Box>
              {!item.done && (
                <Box
                  component={Link}
                  href={item.href}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: '#0d9488',
                    border: '1px solid #99f6e4',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '8px',
                    textDecoration: 'none',
                    '&:hover': { color: '#115e59', bgcolor: '#f0fdfa' },
                  }}
                >
                  Ir →
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
