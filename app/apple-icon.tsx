import { ImageResponse } from 'next/og';

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
          background: '#0d9488',
          color: '#ffffff',
          fontSize: 108,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        Z
      </div>
    ),
    { ...size }
  );
}
