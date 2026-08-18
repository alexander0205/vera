/**
 * Plantillas de WhatsApp: las nuestras y su estado en Meta.
 *
 *   GET    → catálogo fusionado (local + Meta)
 *   POST   → guarda un borrador nuestro. NO toca Meta.
 *   PUT    → edita. Si es borrador, solo local. Si ya está en Meta, la reemplaza
 *            allá y vuelve a revisión.
 *   DELETE → ?id= borra el borrador local · ?name= la borra de Meta
 *
 * Se escribe primero en borrador a propósito: en Meta una plantilla nace en
 * revisión, y mientras está en revisión NO se puede editar. Publicar un texto a
 * medio pensar quema el nombre para siempre.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas } from '@/lib/db/schema';
import { editarPlantilla, WhatsAppApiError } from '@/lib/whatsapp/client';
import { getCatalogo, deducirVariables, contarVariables } from '@/lib/whatsapp/catalogo';
import { requireAdmin, requireAdminConLlave } from '@/lib/whatsapp/admin-guard';

const CATEGORIAS = ['utility', 'marketing', 'authentication'] as const;
type Categoria = (typeof CATEGORIAS)[number];

function fallo(e: unknown) {
  const status = e instanceof WhatsAppApiError ? e.status : 502;
  const error  = e instanceof Error ? e.message : 'Error consultando el CRM';
  console.error('[admin whatsapp plantillas]', error);
  return NextResponse.json({ error }, { status });
}

/** El nombre que Meta acepta: minúsculas, números y guion bajo. */
function nombreValido(n: string) {
  return /^[a-z0-9_]{1,512}$/.test(n);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  // Sin llave se sigue: los borradores son nuestros y se pueden ver igual.
  // getCatalogo devuelve el porqué en `errorCrm` y la pantalla lo enseña.
  return NextResponse.json(await getCatalogo(process.env.CRM_ZERO_API_KEY));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const b = await request.json().catch(() => null);
  const nombre = String(b?.nombre ?? '').trim();
  const cuerpo = String(b?.cuerpo ?? '').trim();

  if (!nombreValido(nombre)) {
    return NextResponse.json({ error: 'El nombre solo admite minúsculas, números y guion bajo' }, { status: 400 });
  }
  if (!cuerpo) return NextResponse.json({ error: 'El mensaje no puede ir vacío' }, { status: 400 });

  const idioma = String(b?.idioma ?? 'es').trim() || 'es';
  const [existe] = await db.select({ id: whatsappPlantillas.id })
    .from(whatsappPlantillas)
    .where(eq(whatsappPlantillas.nombre, nombre)).limit(1);
  if (existe) {
    return NextResponse.json({ error: `Ya hay una plantilla llamada "${nombre}"` }, { status: 409 });
  }

  const [fila] = await db.insert(whatsappPlantillas).values({
    nombre, idioma,
    categoria: CATEGORIAS.includes(b?.categoria) ? (b.categoria as Categoria) : 'utility',
    cuerpo,
    encabezado: b?.encabezado?.trim() || null,
    pie:        b?.pie?.trim() || null,
    teamId:     b?.teamId ?? null,
    borrador:   true,
    boton:      b?.boton?.texto?.trim() ? b.boton : null,
    variables:  deducirVariables(cuerpo, Array.isArray(b?.variables) ? b.variables : []),
  }).returning();

  return NextResponse.json(fila, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const b  = await request.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const [actual] = await db.select().from(whatsappPlantillas).where(eq(whatsappPlantillas.id, id)).limit(1);
  if (!actual) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

  const cuerpo = String(b?.cuerpo ?? actual.cuerpo).trim();
  if (!cuerpo) return NextResponse.json({ error: 'El mensaje no puede ir vacío' }, { status: 400 });

  const variables = deducirVariables(cuerpo, Array.isArray(b?.variables) ? b.variables : actual.variables);
  const datos = {
    cuerpo,
    categoria:  CATEGORIAS.includes(b?.categoria) ? (b.categoria as Categoria) : actual.categoria,
    encabezado: b?.encabezado?.trim() || null,
    pie:        b?.pie?.trim() || null,
    boton:      b?.boton?.texto?.trim() ? b.boton : null,
    variables,
    actualizadoEn: new Date(),
  };

  // Ya publicada: hay que reemplazarla en Meta, no solo aquí. Si solo se
  // guardara local, la pantalla enseñaría un texto y al padre le llegaría otro.
  if (!actual.borrador) {
    const conLlave = await requireAdminConLlave();
    if (!conLlave.ok) return conLlave.response;

    const sinEjemplo = variables.filter((v) => !v.ejemplo.trim()).length;
    if (contarVariables(cuerpo) > 0 && sinEjemplo > 0) {
      return NextResponse.json({ error: `Faltan ${sinEjemplo} valor(es) de ejemplo. Meta los exige.` }, { status: 400 });
    }
    try {
      const r = await editarPlantilla(conLlave.apiKey, {
        nombre: actual.nombre,
        categoria: datos.categoria as Categoria,
        idioma: actual.idioma,
        cuerpo,
        ejemploCuerpo: variables.map((v) => v.ejemplo),
        encabezado: datos.encabezado ?? undefined,
        pie: datos.pie ?? undefined,
        boton: datos.boton ?? undefined,
      });
      await db.update(whatsappPlantillas)
        .set({ ...datos, metaEstado: r.status })
        .where(eq(whatsappPlantillas.id, id));
      return NextResponse.json({ ok: true, estado: r.status });
    } catch (e) { return fallo(e); }
  }

  await db.update(whatsappPlantillas).set(datos).where(eq(whatsappPlantillas.id, id));
  return NextResponse.json({ ok: true, estado: 'BORRADOR' });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const sp = new URL(request.url).searchParams;
  const id = sp.get('id');
  const nombre = sp.get('name');

  if (id) {
    const [fila] = await db.select().from(whatsappPlantillas)
      .where(eq(whatsappPlantillas.id, Number(id))).limit(1);
    if (!fila) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    if (!fila.borrador) {
      return NextResponse.json(
        { error: 'Esa plantilla ya está en Meta. Bórrala por nombre para quitarla de allá también.' },
        { status: 409 },
      );
    }
    await db.delete(whatsappPlantillas).where(eq(whatsappPlantillas.id, fila.id));
    return NextResponse.json({ ok: true });
  }

  if (!nombre) return NextResponse.json({ error: 'Falta ?id= o ?name=' }, { status: 400 });

  const conLlave = await requireAdminConLlave();
  if (!conLlave.ok) return conLlave.response;
  try {
    const res = await fetch(`${process.env.CRM_ZERO_API_URL}/templates?name=${encodeURIComponent(nombre)}`, {
      method: 'DELETE', headers: { 'x-api-key': conLlave.apiKey },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new WhatsAppApiError(res.status, d.error ?? res.statusText);
    }
    await db.delete(whatsappPlantillas).where(eq(whatsappPlantillas.nombre, nombre));
    return NextResponse.json({ ok: true });
  } catch (e) { return fallo(e); }
}
