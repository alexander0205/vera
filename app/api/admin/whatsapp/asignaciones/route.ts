/**
 * Qué plantilla usa cada aviso, por colegio.
 *
 *   GET  ?teamId=9   → las 5 asignaciones vigentes de ese colegio
 *   GET              → los valores por defecto de la plataforma
 *   PUT              → guarda { teamId: number|null, asignaciones: [...] }
 *
 * Sin `teamId` se trabaja sobre el default de la plataforma, que es el que
 * hereda todo colegio que no haya elegido las suyas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillasAviso, teams } from '@/lib/db/schema';
import { getPlantillasDeTeam, guardarPlantillas, AVISOS_PLANTILLA, type AvisoPlantilla } from '@/lib/whatsapp/plantillas';
import { requireAdmin } from '@/lib/whatsapp/admin-guard';

/** Las del default de plataforma, sin resolver herencia (no hereda de nadie). */
async function getDefaults() {
  const filas = await db
    .select({
      aviso:  whatsappPlantillasAviso.aviso,
      nombre: whatsappPlantillasAviso.plantillaNombre,
      nombreConLink: whatsappPlantillasAviso.plantillaConLink,
      idioma: whatsappPlantillasAviso.idioma,
    })
    .from(whatsappPlantillasAviso)
    .where(isNull(whatsappPlantillasAviso.teamId));

  return AVISOS_PLANTILLA.map(({ clave }) => {
    const f = filas.find((x) => x.aviso === clave);
    return {
      aviso: clave, nombre: f?.nombre ?? '', nombreConLink: f?.nombreConLink ?? null,
      idioma: f?.idioma ?? 'es', propia: f != null,
    };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get('teamId');
  const teamId = raw ? Number(raw) : null;
  if (raw && !Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });
  }

  const catalogo = AVISOS_PLANTILLA.map((a) => ({
    clave: a.clave, titulo: a.titulo, detalle: a.detalle,
    sugerida: a.sugerida, variables: a.variables,
  }));

  if (teamId == null) {
    const empresas = await db.select({ id: teams.id, nombre: teams.name }).from(teams).orderBy(teams.id);
    return NextResponse.json({ catalogo, asignaciones: await getDefaults(), empresas });
  }

  const [existe] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!existe) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  // getPlantillasDeTeam solo devuelve los huecos llenos; la pantalla necesita
  // los cinco para poder pintar los vacíos y dejar llenarlos.
  const vigentes = await getPlantillasDeTeam(teamId);
  const asignaciones = AVISOS_PLANTILLA.map(({ clave }) => {
    const v = vigentes.find((x) => x.aviso === clave);
    return {
      aviso: clave, nombre: v?.nombre ?? '', nombreConLink: v?.nombreConLink ?? null,
      idioma: v?.idioma ?? 'es', propia: v?.propia ?? false,
    };
  });

  return NextResponse.json({ catalogo, asignaciones });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.asignaciones)) {
    return NextResponse.json({ error: 'Falta asignaciones[]' }, { status: 400 });
  }

  const teamId = body.teamId == null ? null : Number(body.teamId);
  if (teamId != null && !Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });
  }

  await guardarPlantillas(teamId, body.asignaciones.map((a: { aviso: AvisoPlantilla; nombre?: string; idioma?: string; nombreConLink?: string | null }) => ({
    aviso: a.aviso,
    nombre: String(a.nombre ?? ''),
    idioma: a.idioma,
    nombreConLink: a.nombreConLink ?? null,
  })));

  return NextResponse.json({ ok: true });
}
