/**
 * POST /api/admin/whatsapp/plantillas/publicar   body: { id }
 *
 * Manda un borrador a Meta. Es el paso que no se deshace del todo: a partir de
 * aquí el nombre queda ocupado, la plantilla entra en revisión y mientras esté
 * en revisión NO se puede editar. Por eso se valida aquí todo lo que Meta
 * rechaza, en vez de dejar que lo descubra media hora después con un REJECTED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas } from '@/lib/db/schema';
import { crearPlantilla, WhatsAppApiError } from '@/lib/whatsapp/client';
import { contarVariables } from '@/lib/whatsapp/catalogo';
import { requireAdminConLlave } from '@/lib/whatsapp/admin-guard';

/** Lo que Meta rechaza y se puede ver desde aquí sin preguntarle. */
function pegasDeMeta(cuerpo: string, ejemplos: string[]): string[] {
  const pegas: string[] = [];
  const variables = contarVariables(cuerpo);

  if (variables > 0 && ejemplos.filter((e) => e.trim()).length < variables) {
    pegas.push(`Faltan valores de ejemplo: ${variables} variable(s) y ${ejemplos.filter((e) => e.trim()).length} ejemplo(s).`);
  }
  const limpio = cuerpo.trim();
  if (/^\{\{\d+\}\}/.test(limpio)) pegas.push('El mensaje no puede empezar con una variable.');
  if (/\{\{\d+\}\}$/.test(limpio)) pegas.push('El mensaje no puede terminar con una variable.');
  if (/\}\}\s*\{\{/.test(limpio))  pegas.push('Dos variables no pueden ir pegadas: pon texto entre ellas.');
  if (limpio.length > 1024)        pegas.push('El mensaje pasa de 1024 caracteres.');
  return pegas;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminConLlave();
  if (!auth.ok) return auth.response;

  const b  = await request.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const [p] = await db.select().from(whatsappPlantillas).where(eq(whatsappPlantillas.id, id)).limit(1);
  if (!p) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
  if (!p.borrador) return NextResponse.json({ error: 'Esa plantilla ya está en Meta' }, { status: 409 });

  const ejemplos = p.variables.map((v) => v.ejemplo ?? '');
  const pegas = pegasDeMeta(p.cuerpo, ejemplos);
  if (pegas.length > 0) return NextResponse.json({ error: pegas.join(' '), pegas }, { status: 400 });

  try {
    const r = await crearPlantilla(auth.apiKey, {
      nombre: p.nombre,
      categoria: p.categoria as 'utility' | 'marketing' | 'authentication',
      idioma: p.idioma,
      cuerpo: p.cuerpo,
      ejemploCuerpo: ejemplos,
      encabezado: p.encabezado ?? undefined,
      pie: p.pie ?? undefined,
      boton: p.boton ?? undefined,
    });

    await db.update(whatsappPlantillas)
      .set({ borrador: false, metaId: r.id, metaEstado: r.status, actualizadoEn: new Date() })
      .where(eq(whatsappPlantillas.id, id));

    return NextResponse.json({ ok: true, estado: r.status, id: r.id });
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    const error  = e instanceof Error ? e.message : 'Error publicando en Meta';
    console.error('[admin whatsapp publicar]', error);
    return NextResponse.json({ error }, { status });
  }
}
