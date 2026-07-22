'use client';

/**
 * Selector de cuenta del mayor. Va aparte porque la barra de periodo es
 * compartida con el balance y este control solo existe aquí: el mayor es el
 * reporte de UNA cuenta.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

export function SelectorCuenta({
  cuentas, cuentaId, desde, hasta,
}: {
  cuentas:  { id: number; codigo: string; nombre: string }[];
  cuentaId?: number;
  desde?:   string;
  hasta?:   string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function elegir(valor: string) {
    const qs = new URLSearchParams();
    if (valor) qs.set('cuentaId', valor);
    // El periodo se conserva al cambiar de cuenta: quien está revisando un
    // trimestre quiere comparar cuentas dentro de ese mismo trimestre.
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);

    const ruta = '/dashboard/contabilidad/mayor';
    startTransition(() => router.push(qs.toString() ? `${ruta}?${qs}` : ruta));
  }

  return (
    <TextField
      label="Cuenta" select
      value={cuentaId ?? ''}
      disabled={pendiente || cuentas.length === 0}
      onChange={(e) => elegir(e.target.value)}
      sx={{ minWidth: 260 }}
    >
      <MenuItem value="">Elige una cuenta…</MenuItem>
      {cuentas.map((c) => (
        <MenuItem key={c.id} value={c.id}>{c.codigo} · {c.nombre}</MenuItem>
      ))}
    </TextField>
  );
}
