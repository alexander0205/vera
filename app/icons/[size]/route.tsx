import { ImageResponse } from 'next/og';

// Íconos PWA generados con ImageResponse (sin binarios). Marca Zero:
// cuadro teal-600 con "Z" blanca.
const SIZES: Record<string, number> = { '192': 192, '512': 512 };

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size } = await params;
  const px = SIZES[size] ?? 512;

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
          fontSize: px * 0.6,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        Z
      </div>
    ),
    { width: px, height: px }
  );
}
