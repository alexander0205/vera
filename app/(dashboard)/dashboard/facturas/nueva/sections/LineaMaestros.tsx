'use client';

/**
 * Plan B (solo lectura): muestra los atributos de maestros asignados al
 * producto de una línea de factura, como chips discretos bajo el campo
 * Producto. No persiste nada en la factura — solo surface la info al facturar.
 *
 * Usa SWR con clave = URL, así varias líneas del mismo producto comparten
 * caché y no se refetchea.
 */

import useSWR from 'swr';
import Box from '@mui/material/Box';
import { Tags } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro { id: number; nombre: string; valores: Valor[]; }
interface Resp {
  maestros?:     Maestro[];
  asignaciones?: { maestroId: number; valorId: number }[];
}

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function LineaMaestros({ productoId }: { productoId?: number }) {
  const { data } = useSWR<Resp>(
    productoId ? `/api/productos/${productoId}/maestros` : null,
    fetcher,
  );
  if (!productoId || !data) return null;

  const ms  = data.maestros ?? [];
  const asg = data.asignaciones ?? [];
  const grupos = ms
    .map(m => ({
      nombre: m.nombre,
      valores: asg
        .filter(a => a.maestroId === m.id)
        .map(a => m.valores.find(v => v.id === a.valorId)?.valor)
        .filter((v): v is string => !!v),
    }))
    .filter(g => g.valores.length > 0);

  if (grupos.length === 0) return null;

  return (
    <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
      <Tags size={12} color="#d1d5db" style={{ flexShrink: 0 }} />
      {grupos.map(g => (
        <Box component="span" key={g.nombre} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '11px', color: '#6b7280' }}>
          <Box component="span" sx={{ color: '#9ca3af' }}>{g.nombre}:</Box>
          {g.valores.map(v => (
            <Box component="span" key={v} sx={{ borderRadius: '4px', bgcolor: '#f3f4f6', px: 0.75, py: 0.25, color: '#4b5563' }}>{v}</Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
