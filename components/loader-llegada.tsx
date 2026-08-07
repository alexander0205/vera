'use client';

/**
 * El loader que sigue puesto un momento DESPUÉS de aterrizar.
 *
 * Cambiar de módulo es una navegación completa del navegador: el documento
 * viejo se destruye y con él el loader que lo cubría. El nuevo aparece al
 * instante pero vacío —los datos los pide después, por SWR—, así que se veía
 * la pantalla montarse a pedazos: primero el armazón, luego las tablas, luego
 * los totales.
 *
 * La intención de cambiar se deja anotada en `sessionStorage` antes de
 * navegar, y aquí se recoge: mientras dura, el loader tapa ese montaje. Va en
 * sessionStorage y no en una query en la URL porque no tiene por qué ensuciar
 * la dirección ni sobrevivir a un marcador — es de esta pestaña y de este
 * salto.
 */

import { useEffect, useState } from 'react';
import { ZeroLoader } from '@/components/zero-loader';

const CLAVE = 'zero:abriendo-modulo';

/** Se llama antes de navegar; lo recoge el módulo de destino al montar. */
export function anunciarCambioDeModulo(nombre: string) {
  try {
    window.sessionStorage.setItem(CLAVE, nombre);
  } catch {
    // Safari en privado tira al tocar sessionStorage: se pierde el aviso y el
    // destino simplemente no muestra loader. No es crítico.
  }
}

export function LoaderLlegada({ esperaMs = 1000 }: { esperaMs?: number }) {
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    let anotado: string | null = null;
    try {
      anotado = window.sessionStorage.getItem(CLAVE);
      // Se borra en cuanto se lee: si no, una recarga de esta misma pantalla
      // volvería a mostrar el loader sin que nadie haya cambiado de módulo.
      if (anotado) window.sessionStorage.removeItem(CLAVE);
    } catch {
      return;
    }
    if (!anotado) return;

    setNombre(anotado);
    const t = setTimeout(() => setNombre(null), esperaMs);
    return () => clearTimeout(t);
  }, [esperaMs]);

  return (
    <ZeroLoader
      open={!!nombre}
      subtitulo={nombre ? `Abriendo ${nombre}` : undefined}
      // Sin retardo: aquí ya se sabe que hubo un salto entre módulos, así que
      // no hay que esperar a ver si tarda — la pausa es a propósito.
      retardoMs={0}
      duracionMinimaMs={esperaMs}
    />
  );
}
