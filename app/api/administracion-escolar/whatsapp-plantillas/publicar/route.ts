/**
 * POST /api/administracion-escolar/whatsapp-plantillas/publicar   { id }
 *
 * Manda un borrador a Meta para aprobación. Es el paso que no se deshace: el
 * nombre queda ocupado y en revisión no se puede editar. Por eso se validan
 * aquí todas las pegas que Meta rechazaría, en vez de que el colegio las
 * descubra una hora después con un REJECTED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverRemitente } from '@/lib/whatsapp/config';
import { crearPlantilla, WhatsAppApiError } from '@/lib/whatsapp/client';
import { pegasDeMeta } from '@/lib/whatsapp/plantillas-colegio';

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const [p] = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.id, id), eq(whatsappPlantillas.teamId, teamId))).limit(1);
  if (!p) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
  if (!p.borrador) return NextResponse.json({ error: 'Esa plantilla ya está en Meta' }, { status: 409 });

  const pegas = pegasDeMeta(p);
  if (pegas.length > 0) return NextResponse.json({ error: pegas.join(' '), pegas }, { status: 400 });

  const remitente = await resolverRemitente(teamId);
  if (!remitente) {
    return NextResponse.json({ error: 'WhatsApp no está disponible para este colegio' }, { status: 503 });
  }

  try {
    const r = await crearPlantilla(remitente.apiKey, {
      nombre: p.nombre,
      categoria: p.categoria as 'utility' | 'marketing' | 'authentication',
      idioma: p.idioma,
      cuerpo: p.cuerpo,
      ejemploCuerpo: p.variables.map((v) => v.ejemplo),
      encabezado: p.encabezado ?? undefined,
      pie: p.pie ?? undefined,
      boton: p.boton ?? undefined,
    });
    await db.update(whatsappPlantillas)
      .set({ borrador: false, metaId: r.id, metaEstado: r.status, actualizadoEn: new Date() })
      .where(eq(whatsappPlantillas.id, id));
    return NextResponse.json({ ok: true, estado: r.status });
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    const error = e instanceof Error ? e.message : 'Error publicando en Meta';
    console.error('[escolar whatsapp-plantillas publicar]', error);
    return NextResponse.json({ error }, { status });
  }
}
