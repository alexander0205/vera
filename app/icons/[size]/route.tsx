import { ImageResponse } from 'next/og';
import { Isotipo, AZUL_ZERO } from '@/lib/marca/isotipo';

// Íconos PWA generados con ImageResponse (sin binarios): el isotipo de Zero
// en blanco sobre el azul corporativo.
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
          background: AZUL_ZERO,
        }}
      >
        <Isotipo size={px * 0.72} />
      </div>
    ),
    { width: px, height: px }
  );
}
