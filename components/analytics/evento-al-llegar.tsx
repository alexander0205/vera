'use client';

/**
 * Manda un evento una vez al llegar a la pantalla, si la URL trae la marca
 * `param` (por ejemplo `?alta=correo` tras crear la cuenta), y la quita de la
 * barra para que recargar o compartir el enlace no lo vuelva a contar.
 *
 * Sin `param`, lo manda en cada montaje: sirve para «llegó al paso N».
 */

import { useEffect } from 'react';
import { enviarEvento, type NombreEvento } from '@/lib/analytics/eventos';

export function EventoAlLlegar({
  evento, params = {}, param,
}: { evento: NombreEvento; params?: Record<string, string | number>; param?: string }) {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (param) {
        const valor = url.searchParams.get(param);
        if (!valor) return;
        url.searchParams.delete(param);
        window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash);
        enviarEvento(evento, { ...params, method: params.method ?? valor });
        return;
      }
      enviarEvento(evento, params);
    } catch { /* la medición nunca rompe la página */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento, param, JSON.stringify(params)]);
  return null;
}
