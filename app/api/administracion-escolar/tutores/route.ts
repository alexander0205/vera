import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores, clients } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, asc, and } from 'drizzle-orm';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const rows = await db
    .select({
      id: adminEscolarTutores.id,
      teamId: adminEscolarTutores.teamId,
      clientId: adminEscolarTutores.clientId,
      clienteRazonSocial: clients.razonSocial,
      nombre: adminEscolarTutores.nombre,
      documento: adminEscolarTutores.documento,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
      direccion: adminEscolarTutores.direccion,
      imagen: adminEscolarTutores.imagen,
    })
    .from(adminEscolarTutores)
    .leftJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
    .where(eq(adminEscolarTutores.teamId, teamId))
    .orderBy(asc(adminEscolarTutores.nombre));
  return NextResponse.json({ tutores: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, documento, telefono, email, direccion, clientId, imagen } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  // clientId opcional: si viene, debe pertenecer al team.
  if (clientId !== undefined && clientId !== null) {
    const [c] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
      .limit(1);
    if (!c) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const [row] = await db.insert(adminEscolarTutores).values({
    teamId,
    clientId: clientId ?? null,
    nombre: nombre.trim(),
    documento: documento?.trim() || null,
    telefono: telefono?.trim() || null,
    email: email?.trim() || null,
    direccion: direccion?.trim() || null,
    imagen: imagen || null,
  }).returning();
  return NextResponse.json({ tutor: row });
}
