import { ImageResponse } from 'next/og';
import { Isotipo, AZUL_ZERO } from '@/lib/marca/isotipo';

/**
 * Icono de la pestaña del navegador.
 *
 * Sustituye al `favicon.ico` que venía de EmiteDO y que seguía apareciendo en
 * la pestaña aunque el resto de la aplicación ya fuera Zero. Se genera con los
 * trazos del isotipo, así que no hay un binario que se quede desactualizado
 * cuando la marca cambie.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: AZUL_ZERO,
          borderRadius: 7,
        }}
      >
        <Isotipo size={26} />
      </div>
    ),
    { ...size },
  );
}
