/**
 * Plantillas de WhatsApp del colegio.
 *
 *   GET    → { plantillas, casos, asignaciones, botonesActivos, canal }
 *   POST   → crea un borrador. No toca Meta.
 *   PUT    → edita. Borrador: solo local. Ya publicada: la reemplaza en Meta y
 *            vuelve a revisión.
 *   DELETE → ?id= borra el borrador · ?id= de una publicada la borra de Meta.
 *
 * Todo va acotado a `team_id`: un colegio nunca ve ni toca las de otro. Las
 * globales (`team_id` NULL, las de la plataforma) se listan aparte y de solo
 * lectura, para poder asignarlas a un aviso sin tener que copiarlas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas, type VariablePlantilla } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resolverRemitente } from '@/lib/whatsapp/config';
import {
  listarPlantillas, editarPlantilla, WhatsAppApiError, CRM_SOPORTA_BOTONES, type PlantillaCrm,
} from '@/lib/whatsapp/client';
import { deducirVariables } from '@/lib/whatsapp/catalogo';
import { getPlantillasDeTeam } from '@/lib/whatsapp/plantillas';
import { aplicarPendientes } from '@/lib/whatsapp/plantillas-servicio';
import { casosDeUso, nombreMeta, pegasDeMeta } from '@/lib/whatsapp/plantillas-colegio';

const CATEGORIAS = ['utility', 'marketing'] as const;
type Categoria = (typeof CATEGORIAS)[number];

const PERMISO = 'administracion-escolar:configurar' as const;

function fallo(e: unknown) {
  const status = e instanceof WhatsAppApiError ? e.status : 502;
  const error = e instanceof Error ? e.message : 'Error consultando WhatsApp';
  console.error('[escolar whatsapp-plantillas]', error);
  return NextResponse.json({ error }, { status });
}

function limpiarBoton(b: unknown) {
  const x = b as { texto?: string; url?: string; ejemplo?: string } | null | undefined;
  if (!x?.texto?.trim() || !x.url?.trim()) return null;
  return { texto: x.texto.trim(), url: x.url.trim(), ejemplo: (x.ejemplo ?? x.url).trim() };
}

function limpiarVariables(v: unknown): VariablePlantilla[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({
      pos: Number(x?.pos),
      nombre: String(x?.nombre ?? '').trim().slice(0, 60),
      tipo: (['texto', 'monto', 'fecha'].includes(x?.tipo) ? x.tipo : 'texto') as VariablePlantilla['tipo'],
      ejemplo: String(x?.ejemplo ?? '').trim().slice(0, 120),
    }))
    .filter((x) => Number.isInteger(x.pos) && x.pos > 0);
}

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', PERMISO);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  let locales = await db.select().from(whatsappPlantillas)
    .where(or(eq(whatsappPlantillas.teamId, teamId), isNull(whatsappPlantillas.teamId)))
    .orderBy(whatsappPlantillas.nombre);

  // El estado lo manda Meta. Sin remitente o con el CRM caído se sigue: los
  // borradores son nuestros y se ven igual; `canal.error` dice por qué falta.
  const remitente = await resolverRemitente(teamId);
  let deMeta: PlantillaCrm[] = [];
  let errorCrm: string | null = null;
  if (!remitente) {
    errorCrm = 'WhatsApp no está disponible para este colegio todavía.';
  } else if (locales.some((l) => !l.borrador)) {
    try {
      deMeta = (await listarPlantillas(remitente.apiKey)).templates ?? [];
    } catch (e) {
      errorCrm = e instanceof Error ? e.message : 'No se pudo leer el estado en Meta';
    }
  }
  const porClave = new Map(deMeta.map((t) => [`${t.name}|${t.language}`, t]));

  // Las que esperaban aprobación y Meta ya aprobó se asignan aquí, antes de
  // leer las asignaciones, para que la pantalla ya las muestre puestas.
  const aplicadas = deMeta.length > 0 ? await aplicarPendientes(teamId, deMeta) : [];
  if (aplicadas.length > 0) {
    locales = await db.select().from(whatsappPlantillas)
      .where(or(eq(whatsappPlantillas.teamId, teamId), isNull(whatsappPlantillas.teamId)))
      .orderBy(whatsappPlantillas.nombre);
  }

  const plantillas = locales.map((l) => {
    const crm = porClave.get(`${l.nombre}|${l.idioma}`);
    const publicada = !l.borrador;
    const contenido = publicada && crm?.content ? crm.content : null;
    return {
      id: l.id,
      nombre: l.nombre,
      idioma: l.idioma,
      categoria: (crm?.category ?? l.categoria).toLowerCase(),
      estado: l.borrador ? 'BORRADOR' : (crm?.status ?? l.metaEstado ?? 'DESCONOCIDO'),
      aprobado: l.borrador ? false : (crm?.aprobado ?? false),
      motivoRechazo: crm?.rejectedReason ?? null,
      cuerpo: contenido?.body ?? l.cuerpo,
      encabezado: contenido?.header ?? l.encabezado,
      pie: contenido?.footer ?? l.pie,
      variables: l.variables,
      boton: l.boton ?? null,
      esBorrador: l.borrador,
      // Las de la plataforma se pueden usar pero no tocar.
      propia: l.teamId === teamId,
      avisoDestino: l.avisoDestino,
    };
  });

  const asignadas = await getPlantillasDeTeam(teamId);
  const asignaciones = casosDeUso().map(({ clave }) => {
    const a = asignadas.find((x) => x.aviso === clave);
    return { aviso: clave, nombre: a?.nombre ?? '', propia: a?.propia ?? false, conBoton: a?.conBoton ?? false };
  });

  return NextResponse.json({
    plantillas,
    casos: casosDeUso(),
    asignaciones,
    aplicadas,
    botonesActivos: CRM_SOPORTA_BOTONES,
    canal: {
      disponible: remitente != null,
      propio: remitente?.propio ?? false,
      error: errorCrm,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', PERMISO);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const b = await req.json().catch(() => null);
  const nombre = nombreMeta(teamId, String(b?.nombre ?? ''));
  const cuerpo = String(b?.cuerpo ?? '').trim();

  if (!nombre) return NextResponse.json({ error: 'Ponle un nombre a la plantilla' }, { status: 400 });
  if (!cuerpo) return NextResponse.json({ error: 'El mensaje no puede ir vacío' }, { status: 400 });

  const idioma = 'es';
  const [existe] = await db.select({ id: whatsappPlantillas.id }).from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.nombre, nombre), eq(whatsappPlantillas.idioma, idioma))).limit(1);
  if (existe) {
    return NextResponse.json({ error: 'Ya tienes una plantilla con ese nombre. Elige otro.' }, { status: 409 });
  }

  const [fila] = await db.insert(whatsappPlantillas).values({
    nombre, idioma, teamId,
    categoria: CATEGORIAS.includes(b?.categoria) ? (b.categoria as Categoria) : 'utility',
    cuerpo,
    encabezado: String(b?.encabezado ?? '').trim() || null,
    pie: String(b?.pie ?? '').trim() || null,
    borrador: true,
    boton: limpiarBoton(b?.boton),
    variables: deducirVariables(cuerpo, limpiarVariables(b?.variables)),
  }).returning();

  return NextResponse.json(fila, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', PERMISO);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const [actual] = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.id, id), eq(whatsappPlantillas.teamId, teamId))).limit(1);
  if (!actual) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

  const cuerpo = String(b?.cuerpo ?? actual.cuerpo).trim();
  if (!cuerpo) return NextResponse.json({ error: 'El mensaje no puede ir vacío' }, { status: 400 });

  const variables = deducirVariables(cuerpo, limpiarVariables(b?.variables ?? actual.variables));
  const datos = {
    cuerpo,
    categoria: CATEGORIAS.includes(b?.categoria) ? (b.categoria as Categoria) : actual.categoria,
    encabezado: String(b?.encabezado ?? '').trim() || null,
    pie: String(b?.pie ?? '').trim() || null,
    boton: limpiarBoton(b?.boton),
    variables,
    actualizadoEn: new Date(),
  };

  if (actual.borrador) {
    await db.update(whatsappPlantillas).set(datos).where(eq(whatsappPlantillas.id, id));
    return NextResponse.json({ ok: true, estado: 'BORRADOR' });
  }

  // Ya está en Meta: hay que reemplazarla allá. Guardar solo aquí haría que la
  // pantalla enseñe un texto y al padre le llegue otro.
  const pegas = pegasDeMeta({ ...datos });
  if (pegas.length > 0) return NextResponse.json({ error: pegas.join(' '), pegas }, { status: 400 });

  const remitente = await resolverRemitente(teamId);
  if (!remitente) return NextResponse.json({ error: 'WhatsApp no está disponible para este colegio' }, { status: 503 });

  try {
    const r = await editarPlantilla(remitente.apiKey, {
      nombre: actual.nombre,
      categoria: datos.categoria as Categoria,
      idioma: actual.idioma,
      cuerpo,
      ejemploCuerpo: variables.map((v) => v.ejemplo),
      encabezado: datos.encabezado ?? undefined,
      pie: datos.pie ?? undefined,
      boton: datos.boton ?? undefined,
    });
    await db.update(whatsappPlantillas).set({ ...datos, metaEstado: r.status }).where(eq(whatsappPlantillas.id, id));
    return NextResponse.json({ ok: true, estado: r.status });
  } catch (e) { return fallo(e); }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', PERMISO);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const [fila] = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.id, id), eq(whatsappPlantillas.teamId, teamId))).limit(1);
  if (!fila) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

  if (!fila.borrador) {
    const remitente = await resolverRemitente(teamId);
    if (!remitente) return NextResponse.json({ error: 'WhatsApp no está disponible para este colegio' }, { status: 503 });
    try {
      const base = (process.env.CRM_ZERO_API_URL ?? '').replace(/\/+$/, '');
      const res = await fetch(`${base}/templates?name=${encodeURIComponent(fila.nombre)}`, {
        method: 'DELETE', headers: { 'x-api-key': remitente.apiKey },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new WhatsAppApiError(res.status, d.error ?? res.statusText);
      }
    } catch (e) { return fallo(e); }
  }

  await db.delete(whatsappPlantillas).where(eq(whatsappPlantillas.id, fila.id));
  return NextResponse.json({ ok: true });
}
