'use client';

/**
 * Semáforo de «¿hay alguien ahora mismo?».
 *
 * Se calcula en el cliente y DESPUÉS de montar, por dos razones:
 *
 *  1. La hora buena es la de Santo Domingo, no la del navegador ni la del
 *     servidor (que en Vercel corre en UTC). Se fuerza con `Intl`.
 *  2. Si se pintara en el servidor, el HTML podría quedarse cacheado diciendo
 *     «disponible ahora mismo» a las tres de la madrugada. Un horario mal
 *     dicho es una llamada que nadie contesta.
 *
 * Hasta que monta se muestra el horario a secas, que es cierto siempre.
 */

import { useEffect, useState } from 'react';

const TZ_RD = 'America/Santo_Domingo';

type Estado = { texto: string; color: string };

function estadoAhora(): Estado {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_RD,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? '0');
  const dia = partes.find(p => p.type === 'weekday')?.value ?? '';
  const laborable = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dia);

  // Ventas: lun a vie 8:00–17:00. Soporte: todos los días 7:00–24:00.
  if (laborable && hora >= 8 && hora < 17) {
    return { texto: 'Ventas está disponible ahora mismo', color: 'bg-[#25a366]' };
  }
  if (hora >= 7) {
    return { texto: 'Ventas cerrado · soporte disponible ahora', color: 'bg-[#f5b301]' };
  }
  return { texto: 'Fuera de horario · te respondemos a primera hora', color: 'bg-[#8a90a0]' };
}

export function EstadoAtencion() {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    setEstado(estadoAhora());
    // Un minuto es suficiente: nadie se queda mirando esta tarjeta el rato que
    // haría falta para que se pase de las 17:00 sin enterarse.
    const t = setInterval(() => setEstado(estadoAhora()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-5 flex items-center gap-2.5 border-t border-white/15 pt-4">
      <span className={`size-2 shrink-0 rounded-full ${estado?.color ?? 'bg-white/40'}`} />
      <span className="text-xs text-white/85">
        {estado?.texto ?? 'Horario de República Dominicana'}
      </span>
    </div>
  );
}
