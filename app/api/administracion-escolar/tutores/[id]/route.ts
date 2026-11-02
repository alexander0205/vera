import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores, clients } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';
import { textoLimpio } from '@/lib/utils/format';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, documento, telefono, whatsapp, email, direccion, clientId, imagen } = await req.json();
  const nombreLimpio = textoLimpio(nombre);
  if (nombre !== undefined && !nombreLimpio) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  // clientId: null desvincula; si viene un id, debe pertenecer al team.
  if (clientId !== undefined && clientId !== null) {
    const [c] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
      .limit(1);
    if (!c) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const [row] = await db.update(adminEscolarTutores)
    .set({
      // Todo sin invisibles (ver `textoLimpio`). Editar al tutor y volver a
      // escribir la cédula es como se arregla uno que ya entró sucio.
      ...(nombreLimpio ? { nombre: nombreLimpio } : {}),
      ...(documento !== undefined ? { documento: textoLimpio(documento) } : {}),
      ...(telefono !== undefined ? { telefono: textoLimpio(telefono) } : {}),
      // Por donde se le escribe de verdad. Se perdia: el formulario lo mandaba
      // y aqui no se leia, asi que editar un tutor nunca guardaba su WhatsApp.
      ...(whatsapp !== undefined ? { whatsapp: textoLimpio(whatsapp) } : {}),
      ...(email !== undefined ? { email: textoLimpio(email) } : {}),
      ...(direccion !== undefined ? { direccion: textoLimpio(direccion) } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(imagen !== undefined ? { imagen: imagen || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarTutores.id, parseInt(id)), eq(adminEscolarTutores.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ tutor: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarTutores)
    .where(and(eq(adminEscolarTutores.id, parseInt(id)), eq(adminEscolarTutores.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
