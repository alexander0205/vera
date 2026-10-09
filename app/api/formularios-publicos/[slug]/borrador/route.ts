import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularioRespuestas } from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import { getIp } from '@/lib/audit';
import {
  buscarFormulario, motivoCerrado, nuevoToken,
} from '@/lib/administracion-escolar/formularios-publicos';

/**
 * Abre una ficha a medio llenar.
 *
 * La ficha de admisión son 91 campos en 7 pasos. Sin un borrador, el padre que
 * la contesta en el teléfono mientras espera en el colegio pierde todo si se le
 * cierra el navegador — y no vuelve a empezar.
 *
 * Se crea SOLO cuando alguien pulsa «Comenzar», no al abrir el enlace: un
 * enlace público lo abren también los robots y los que solo miran, y no vale
 * la pena crearles una fila a cada uno.
 */

interface Ctx { params: Promise<{ slug: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;

  const rl = await rateLimitDb(`form_borrador_nuevo:${slug}:${getIp(req) ?? 'anon'}`, 10, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos seguidos. Inténtalo más tarde.' },
      { status: 429 },
    );
  }

  const f = await buscarFormulario(slug);
  if (!f) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });

  const motivo = await motivoCerrado(f);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 410 });

  const token = nuevoToken();

  await db.insert(adminEscolarFormularioRespuestas).values({
    teamId: f.teamId,
    formularioId: f.id,
    formularioNombre: f.nombre,
    datos: {},
    estado: 'borrador',
    token,
    pagina: 0,
    ip: getIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  // Solo el token: el id de la fila no le sirve de nada a quien contesta y es
  // justo lo que no queremos que circule.
  return NextResponse.json({ token, url: `/f/${slug}/r/${token}` });
}
