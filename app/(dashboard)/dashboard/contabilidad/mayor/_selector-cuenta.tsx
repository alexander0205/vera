'use client';

/**
 * Selector de cuenta del mayor. Va aparte porque la barra de periodo es
 * compartida con el balance y este control solo existe aquí: el mayor es el
 * reporte de UNA cuenta.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">Cuenta</span>
      <select
        value={cuentaId ?? ''}
        disabled={pendiente || cuentas.length === 0}
        onChange={(e) => elegir(e.target.value)}
        className="min-w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Elige una cuenta…</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
        ))}
      </select>
    </label>
  );
}
