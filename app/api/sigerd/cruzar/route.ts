import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { cruzarEstructura, cruzarEstudiantes, cruzarPersonal } from '@/lib/sigerd/cruzar';

/**
 * Cruza a nuestras tablas un paso del asistente.
 *
 * No llama al portal: todo sale del snapshot ya descargado. Por eso puede
 * responder dentro del tiempo de una función normal aunque sean 465 estudiantes,
 * y por eso repetirlo no cuesta nada.
 *
 * `excluir` son los ids de SIGERD que el colegio desmarcó. Van como lista de lo
 * que NO entra y no de lo que sí: la pantalla marca por defecto todo lo nuevo,
 * así que las excepciones son pocas y el cuerpo de la petición no crece con los
 * cientos de casillas marcadas.
 */

const PASOS = ['estructura', 'estudiantes', 'personal'] as const;
type Paso = (typeof PASOS)[number];

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const { paso, excluir } = await req.json().catch(() => ({}));
  if (!PASOS.includes(paso as Paso)) {
    return NextResponse.json({ error: 'Paso inválido' }, { status: 400 });
  }

  const fuera = new Set<number>(
    Array.isArray(excluir) ? (excluir as unknown[]).map(Number).filter(Number.isInteger) : [],
  );

  try {
    const r = paso === 'estructura' ? await cruzarEstructura(auth.teamId, fuera)
      : paso === 'estudiantes' ? await cruzarEstudiantes(auth.teamId, fuera)
      : await cruzarPersonal(auth.teamId, fuera);
    return NextResponse.json({ ok: r.fallos.length === 0, ...r });
  } catch (e) {
    // El detalle va al log del servidor; a la pantalla, algo que se pueda leer.
    console.error('[sigerd/cruzar]', paso, e);
    return NextResponse.json(
      { error: 'Se cortó a mitad. Lo que ya entró se queda; vuelve a pulsar para seguir.' },
      { status: 500 },
    );
  }
}
