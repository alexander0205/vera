'use client';

import { useState } from 'react';

/**
 * La foto de una persona del equipo de Zero o, sin foto (o si no carga), sus
 * iniciales. La foto sale de `/api/equipo-zero/:id/foto?v=` (solo fotos del
 * equipo, con sesión).
 */
export function AvatarEquipo({ fotoUrl, iniciales, clase = 'h-8 w-8 text-[10px]' }: {
  fotoUrl: string | null; iniciales: string; clase?: string;
}) {
  const [fallo, setFallo] = useState(false);
  if (fotoUrl && !fallo) {
    // eslint-disable-next-line @next/next/no-img-element -- ruta propia con sesión y caché por versión; next/image no aplica
    return <img src={fotoUrl} alt="" onError={() => setFallo(true)} className={`${clase} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`${clase} flex shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-800`}>
      {iniciales}
    </span>
  );
}
