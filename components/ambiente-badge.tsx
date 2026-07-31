'use client';

/**
 * AmbienteBadge — avisa que la empresa NO está en Producción de la DGII.
 *
 * En Producción no se muestra nada: el estado normal no necesita cartel. En
 * TesteCF/CerteCF sí, porque ahí los comprobantes que se envían son de prueba
 * aunque la DGII los acepte (ver lib/ecf/ambiente.ts).
 *
 * Vivía dentro del layout de Facturación; se sacó acá para que el header único
 * lo pueda mostrar en todos los módulos.
 */

import Chip from '@mui/material/Chip';
import { AlertCircle } from 'lucide-react';

export function AmbienteBadge({ ambiente }: { ambiente: string | null }) {
  if (!ambiente || ambiente === 'Produccion') return null;

  const map: Record<string, { label: string; color: 'warning' | 'secondary' | 'default' }> = {
    TesteCF: { label: 'Pruebas',       color: 'warning' },
    CerteCF: { label: 'Certificación', color: 'secondary' },
  };
  const item = map[ambiente] ?? { label: 'No producción', color: 'default' as const };

  return (
    <Chip
      icon={<AlertCircle style={{ width: 12, height: 12 }} />}
      label={item.label}
      size="small"
      color={item.color}
      variant="outlined"
      sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }}
    />
  );
}
