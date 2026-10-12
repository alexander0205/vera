/**
 * PUT /api/administracion-escolar/whatsapp-plantillas/asignaciones
 *   { aviso, nombre }   — nombre vacío = volver al default de la plataforma
 *
 * Qué plantilla usa cada caso de uso (aviso). Se valida que la plantilla sea
 * del colegio o global, que esté aprobada y que tenga EXACTAMENTE las variables
 * que ese aviso manda: Meta rellena por posición y un desajuste no da error,
 * manda un mensaje que dice otra cosa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverRemitente } from '@/lib/whatsapp/config';
import { listarPlantillas } from '@/lib/whatsapp/client';
import { AVISOS_PLANTILLA, guardarPlantillas, type AvisoPlantilla } from '@/lib/whatsapp/plantillas';
import { cabeEnAviso } from '@/lib/whatsapp/plantillas-colegio';

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const b = await req.json().catch(() => null);
  const aviso = String(b?.aviso ?? '') as AvisoPlantilla;
  const nombre = String(b?.nombre ?? '').trim();

  if (!AVISOS_PLANTILLA.some((a) => a.clave === aviso)) {
    return NextResponse.json({ error: 'Aviso no válido' }, { status: 400 });
  }

  if (nombre) {
    const [p] = await db.select().from(whatsappPlantillas)
      .where(and(
        eq(whatsappPlantillas.nombre, nombre),
        or(eq(whatsappPlantillas.teamId, teamId), isNull(whatsappPlantillas.teamId)),
      )).limit(1);
    if (!p) return NextResponse.json({ error: 'Esa plantilla no existe' }, { status: 404 });
    if (p.borrador) {
      return NextResponse.json({ error: 'Primero envíala a aprobación: un borrador no se puede usar.' }, { status: 409 });
    }

    const cabe = cabeEnAviso(p.cuerpo, aviso);
    if (!cabe.ok) return NextResponse.json({ error: cabe.motivo }, { status: 400 });

    // Aprobada de verdad, según Meta. Si el CRM no contesta no se bloquea: lo
    // que no se puede es asignar algo que Meta dice que no está aprobado.
    const remitente = await resolverRemitente(teamId);
    if (remitente) {
      try {
        const t = (await listarPlantillas(remitente.apiKey, nombre)).templates
          ?.find((x) => x.name === nombre && x.language === p.idioma);
        if (t && !t.aprobado) {
          return NextResponse.json({ error: `Meta la tiene en estado ${t.status}. Solo se asignan las aprobadas.` }, { status: 409 });
        }
      } catch { /* se asigna igual; el estado se ve en la lista */ }
    }
  }

  await guardarPlantillas(teamId, [{ aviso, nombre, idioma: 'es' }]);
  return NextResponse.json({ ok: true });
}
