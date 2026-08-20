'use client';

/**
 * Barra de periodo compartida por el mayor general y el balance de
 * comprobación. Los dos reportes se leen siempre "de tal fecha a tal fecha", y
 * tenerla en un solo sitio evita que una pantalla acabe validando distinto que
 * la otra sobre el mismo concepto.
 *
 * Igual que en el libro diario, el periodo vive en la URL: filtra el servidor,
 * y una vista de un trimestre concreto se puede compartir o guardar.
 */

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

export interface Periodo {
  desde?: string;
  hasta?: string;
}

export function FiltrosPeriodo({
  ruta, periodo, extra, paramsExtra = {},
}: {
  /** Ruta del reporte, p. ej. '/dashboard/contabilidad/balance'. */
  ruta:    string;
  periodo: Periodo;
  /** Controles propios del reporte (el selector de cuenta del mayor). */
  extra?:  ReactNode;
  /** Parámetros que hay que conservar al cambiar el periodo. */
  paramsExtra?: Record<string, string | number | undefined>;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function navegar(cambios: Periodo) {
    const siguiente = { ...periodo, ...cambios };
    const qs = new URLSearchParams();

    for (const [k, v] of Object.entries(paramsExtra)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    if (siguiente.desde) qs.set('desde', siguiente.desde);
    if (siguiente.hasta) qs.set('hasta', siguiente.hasta);

    startTransition(() => router.push(qs.toString() ? `${ruta}?${qs}` : ruta));
  }

  const hayPeriodo = Boolean(periodo.desde || periodo.hasta);

  return (
    <Box sx={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5,
      bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2,
    }}>
      {extra}

      <TextField
        label="Desde" type="date"
        value={periodo.desde ?? ''}
        disabled={pendiente}
        onChange={(e) => navegar({ desde: e.target.value || undefined })}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        label="Hasta" type="date"
        value={periodo.hasta ?? ''}
        disabled={pendiente}
        onChange={(e) => navegar({ hasta: e.target.value || undefined })}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      {hayPeriodo && (
        <Button
          type="button" color="inherit" disabled={pendiente}
          onClick={() => navegar({ desde: undefined, hasta: undefined })}
          startIcon={<X style={{ width: 16, height: 16 }} />}
          sx={{ color: '#6b7280', '&:hover': { color: '#374151' }, pb: 1 }}
        >
          Todo el histórico
        </Button>
      )}
    </Box>
  );
}
