'use client';

import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { ListChecks } from 'lucide-react';

/**
 * La campana de arriba, en Gobernanza: cuántas tareas por revisar le tocan a
 * quien mira (las suyas con nombre y, al equipo de Zero, las de Soporte IT).
 * Lleva a «Por revisar».
 *
 * No se sondea con un reloj: se pide al entrar, al volver a la pestaña y tras
 * cada cambio en una tarea (`refrescarCampana`). Un sondeo cada pocos minutos
 * en cada pestaña abierta fue en su día la mayoría de las peticiones del
 * sistema.
 */

export const CLAVE_CAMPANA = '/api/administracion-escolar/tareas/colegio?soloConteo=1';
export const refrescarCampana = () => { void mutate(CLAVE_CAMPANA); };

const traer = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { mias: 0 }));

export function CampanaTareas() {
  const { data } = useSWR<{ mias: number }>(CLAVE_CAMPANA, traer, { revalidateOnFocus: true });
  const n = data?.mias ?? 0;
  const titulo = n === 0 ? 'Nada por revisar' : `${n} ${n === 1 ? 'tarea' : 'tareas'} por revisar`;
  return (
    <Tooltip title={titulo} placement="bottom">
      <IconButton component={Link} href="/escolar/por-revisar" size="small" aria-label={titulo}
        sx={{ position: 'relative', color: n > 0 ? '#b45309' : 'text.secondary' }}>
        <ListChecks style={{ width: 20, height: 20 }} />
        {n > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums"
          >
            {n > 99 ? '99+' : n}
          </span>
        )}
      </IconButton>
    </Tooltip>
  );
}
