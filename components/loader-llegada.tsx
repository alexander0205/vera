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

/**
 * Tope de la carga inicial: si los datos del header no llegan en este tiempo,
 * se revela la pantalla igual en vez de dejar el loader colgado para siempre.
 * Muy por encima de lo normal (reconexión fría a Neon ~1.4 s); solo salta ante
 * una petición que de verdad se cuelga.
 */
const TECHO_CARGA_INICIAL_MS = 12_000;

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

  // Recoger el aviso está SEPARADO de la cuenta atrás que lo retira, a
  // propósito. Antes ambos vivían en un mismo efecto: se leía sessionStorage,
  // se borraba, se ponía el nombre y se armaba el timer. En dev, StrictMode
  // monta el efecto dos veces (setup → cleanup → setup): el primer setup ya
  // borró la clave, el cleanup mató el timer, y el segundo setup —sin clave que
  // leer— salía temprano sin rearmar el timer. Quedaba `nombre` puesto y NADIE
  // lo bajaba: el loader se trababa y solo un refresh lo soltaba. Al separar,
  // el timer (efecto de abajo) depende solo de `nombre`, no de la clave ya
  // consumida, así que StrictMode lo rearma bien.
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
    if (anotado) setNombre(anotado);
  }, []);

  // Cuenta atrás que retira el loader de cambio de módulo. Keyed en `nombre`:
  // cuando hay uno, se arma; StrictMode puede montar/desmontar este efecto sin
  // perder el temporizador porque no depende de la clave de sessionStorage.
  useEffect(() => {
    if (!nombre) return;
    const t = setTimeout(() => {
      setNombre(null);
      // El tapado se retira A LA VEZ que el loader, no antes: si se quitara al
      // montar, volvería a asomar la pantalla a medio hacer.
      document.documentElement.removeAttribute(ATRIBUTO);
    }, esperaMs);
    return () => clearTimeout(t);
  }, [nombre, esperaMs]);

  // Si no había nada anotado, el tapado no debe quedarse puesto —por ejemplo
  // si el script lo dejó y este componente se montó sin recoger nada.
  useEffect(() => {
    if (!nombre) document.documentElement.removeAttribute(ATRIBUTO);
  }, [nombre]);

  // Techo de la carga inicial. Por muy fría que esté la conexión, el loader no
  // debe quedarse indefinidamente esperando `datosListos`: una petición que se
  // cuelga (conexión fría a la DB que ni resuelve ni falla) dejaba el loader
  // puesto hasta refrescar a mano. Pasado el tope se revela la pantalla igual —
  // cada una trae sus propios esqueletos/spinners.
  const [techoCarga, setTechoCarga] = useState(false);
  useEffect(() => {
    if (yaListoAlgunaVez.current || datosListos !== false) return;
    const t = setTimeout(() => setTechoCarga(true), TECHO_CARGA_INICIAL_MS);
    return () => clearTimeout(t);
  }, [datosListos]);

  const cargaInicialPendiente =
    !yaListoAlgunaVez.current && datosListos === false && !techoCarga;
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
