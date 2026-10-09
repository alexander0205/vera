import { ImageResponse } from 'next/og';
import { Isotipo, AZUL_ZERO } from '@/lib/marca/isotipo';

// Ícono para iOS "Agregar a pantalla de inicio". Next inyecta el
// <link rel="apple-touch-icon"> automáticamente.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        }}
      >
        <Isotipo size={130} />
      </div>
    ),
    { ...size }
  );
}
