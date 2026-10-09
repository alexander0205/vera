'use client';

/**
 * Las cuentas bancarias de la empresa, para el desplegable de cobro.
 *
 * Se carga una vez y se comparte: el repetidor de pagos puede pintar cinco
 * líneas y no tiene sentido que cada una pida la lista. SWR deduplica por clave,
 * así que basta con llamar al hook en cada línea.
 *
 * Si la empresa no tiene ninguna cuenta cargada, `cuentas` viene vacío y quien
 * llama debe seguir aceptando texto libre — nadie puede quedarse sin registrar
 * un cobro porque falte configurar bancos.
 */

import useSWR from 'swr';
import type { CuentaBancoOpcion } from '@/app/api/cuentas-banco/route';

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null));

export type { CuentaBancoOpcion };

export function useCuentasBanco(): {
  cuentas: CuentaBancoOpcion[];
  cargando: boolean;
} {
  const { data, isLoading } = useSWR<{ cuentas?: CuentaBancoOpcion[] } | null>(
    '/api/cuentas-banco',
    fetcher,
    {
      // Las cuentas de una empresa no cambian mientras se cobra.
      revalidateOnFocus: false,
      dedupingInterval: 5 * 60 * 1000,
    },
  );

  return {
    cuentas: Array.isArray(data?.cuentas) ? data.cuentas : [],
    cargando: isLoading,
  };
}
