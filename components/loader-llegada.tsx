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
 *
 * El React de este componente no llega a tiempo solo: entre que el documento
 * nuevo pinta y que la hidratación corre el efecto hay un hueco en el que se
 * veía la pantalla pelada, y el loader parecía irse y volver. Por eso el
 * primer tapado NO lo hace React sino `ScriptTapaLlegada`, que corre antes de
 * pintar y deja el fondo puesto; cuando React monta, su loader aparece encima
 * y el tapado se retira. Así la cobertura es continua.
 */

import { useEffect, useRef, useState } from 'react';
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

/** Marca que el tapado inicial pone en el <html> y este componente retira. */
const ATRIBUTO = 'data-abriendo-modulo';

/**
 * Tapado instantáneo, antes de que React exista.
 *
 * Va como script en línea con `dangerouslySetInnerHTML` porque tiene que
 * ejecutarse ANTES del primer pintado: cualquier cosa que dependa de React
 * llega tarde y deja ver el fondo pelado. Solo pinta un fondo del color del
 * loader — el logo y la frase los pone React medio segundo después, encima.
 */
export function ScriptTapaLlegada() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{if(sessionStorage.getItem('${CLAVE}'))document.documentElement.setAttribute('${ATRIBUTO}','');}catch(e){}`,
      }}
    />
  );
}

export function LoaderLlegada({
  esperaMs = 1000,
  datosListos,
}: {
  esperaMs?: number;
  /**
   * Si el usuario y la empresa activa (los mismos /api/user y
   * /api/empresa/list que arman el sidebar y el header) ya llegaron. `undefined`
   * = el que llama no tiene esa noción y el loader se comporta como antes.
   *
   * Sin esto, la primera entrada al sistema (login, recarga completa) no
   * anotaba nada en sessionStorage —no hubo salto entre módulos— así que el
   * loader no se mostraba y se veía el sidebar sin plan y el header vacío
   * un instante, hasta que SWR resolvía y todo se repintaba de golpe.
   */
  datosListos?: boolean;
}) {
  const [nombre, setNombre] = useState<string | null>(null);
  // Una vez que los datos llegaron por primera vez, nunca más se vuelve a
  // tapar por esta razón: revalidaciones de fondo no deben ocultar la
  // pantalla que el usuario ya está viendo.
  const yaListoAlgunaVez = useRef(datosListos === true);

  useEffect(() => {
    if (datosListos) yaListoAlgunaVez.current = true;
  }, [datosListos]);

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
    const t = setTimeout(() => {
      setNombre(null);
      // El tapado se retira A LA VEZ que el loader, no antes: si se quitara al
      // montar, volvería a asomar la pantalla a medio hacer.
      document.documentElement.removeAttribute(ATRIBUTO);
    }, esperaMs);
    return () => clearTimeout(t);
  }, [esperaMs]);

  // Si no había nada anotado, el tapado no debe quedarse puesto —por ejemplo
  // si el script lo dejó y este componente se montó sin recoger nada.
  useEffect(() => {
    if (!nombre) document.documentElement.removeAttribute(ATRIBUTO);
  }, [nombre]);

  const cargaInicialPendiente = !yaListoAlgunaVez.current && datosListos === false;
  const abriendoModulo = !!nombre;

  return (
    <ZeroLoader
      open={abriendoModulo || cargaInicialPendiente}
      subtitulo={abriendoModulo ? `Abriendo ${nombre}` : undefined}
      // Cambio de módulo: ya se sabe que hubo un salto, sin retardo. Carga
      // inicial: se deja el antirrebote por defecto de ZeroLoader (retardoMs
      // ~400ms) para que una carga rapidísima no llegue ni a parpadear.
      retardoMs={abriendoModulo ? 0 : undefined}
      duracionMinimaMs={abriendoModulo ? esperaMs : undefined}
    />
  );
}
