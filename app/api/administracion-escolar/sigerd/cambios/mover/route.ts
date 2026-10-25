import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { getIp } from '@/lib/audit';
import { MoverSeccionError, moverASeccionSigerd } from '@/lib/administracion-escolar/cambios-sigerd';

/**
 * «Mover a la sección de SIGERD»: pasa la matrícula activa de los alumnos
 * elegidos a la sección que dice la última descarga.
 *
 * Body: `{ estudianteIds: number[] }`. El servidor vuelve a comparar y solo
 * mueve a quien sigue figurando como cambio de sección y tiene destino claro:
 * lo que mande el navegador es una petición, no una orden.
 *
 * Los cargos ya creados no se tocan; lo que falte se cobra con la tarifa de la
 * sección nueva. Cada movimiento queda en `audit_logs`.
 */
export async function POST(req: NextRequest) {
  // Cambia a qué tarifa paga un alumno: escritura, con el gate de suscripción.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:configurar', { escritura: true },
  );
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as { estudianteIds?: unknown } | null;
  const ids = Array.isArray(body?.estudianteIds)
    ? [...new Set((body.estudianteIds as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Elige al menos un alumno.' }, { status: 400 });
  }
  // Un colegio no mueve a más de unos cientos de golpe; el tope evita que una
  // petición mal formada sea un bucle de UPDATE.
  if (ids.length > 500) {
    return NextResponse.json({ error: 'Son demasiados alumnos de una vez. Muévelos en grupos más pequeños.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await moverASeccionSigerd(auth.teamId, ids, {
      userId: auth.user.id, email: auth.user.email, ip: getIp(req),
    }));
  } catch (err) {
    if (err instanceof MoverSeccionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sigerd/cambios/mover]', err);
    return NextResponse.json(
      { error: 'No se pudo mover a los alumnos. Lo que ya se movió se queda; vuelve a revisar.' },
      { status: 500 },
    );
  }
}
