/**
 * GET  /api/clientes          — Lista clientes del equipo (con búsqueda opcional)
 * POST /api/clientes          — Crea un nuevo cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { clients, dependientes } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, ilike, or, and, inArray, sql } from 'drizzle-orm';
import { clienteSchema } from '@/lib/clientes/schema';

/**
 * Condición ILIKE sobre un dependiente: nombre, apellido o el nombre completo.
 * El nombre completo permite buscar "Juan Pérez" aunque esté partido en dos columnas.
 */
function matchDependiente(term: string) {
  const like = `%${term}%`;
  return or(
    ilike(dependientes.nombre, like),
    ilike(dependientes.apellido, like),
    ilike(sql`${dependientes.nombre} || ' ' || ${dependientes.apellido}`, like),
  );
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  // Paginación opcional (compatible: sin params trae hasta 1000).
  const limit  = Math.min(Number(sp.get('limit'))  || 1000, 1000);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  // La búsqueda también matchea por dependiente/beneficiario: en colegios el
  // acudiente se busca por el nombre del hijo, no por el suyo.
  const rows = await db.select().from(clients)
    .where(
      q
        ? and(
            eq(clients.teamId, teamId),
            or(
              ilike(clients.razonSocial, `%${q}%`),
              ilike(clients.rnc, `%${q}%`),
              ilike(clients.email, `%${q}%`),
              sql`EXISTS (
                SELECT 1 FROM ${dependientes}
                WHERE ${dependientes.clientId} = ${clients.id}
                  AND ${dependientes.teamId} = ${teamId}
                  AND ${matchDependiente(q)}
              )`,
            )
          )
        : eq(clients.teamId, teamId)
    )
    .orderBy(clients.razonSocial)
    .limit(limit)
    .offset(offset);

  // TODOS los dependientes de cada cliente devuelto — no solo los que matchearon.
  // Buscando al padre se ven sus hijos, y buscando al hijo se ve la familia
  // completa: el cajero confirma que es el contacto correcto sin abrir la ficha.
  let porCliente: Record<number, string[]> = {};
  if (q && rows.length) {
    const deps = await db.select({
        clientId: dependientes.clientId,
        nombre:   dependientes.nombre,
        apellido: dependientes.apellido,
      })
      .from(dependientes)
      .where(and(
        eq(dependientes.teamId, teamId),
        inArray(dependientes.clientId, rows.map(r => r.id)),
      ))
      .orderBy(dependientes.nombre);
    porCliente = deps.reduce<Record<number, string[]>>((acc, d) => {
      (acc[d.clientId] ??= []).push(`${d.nombre} ${d.apellido}`);
      return acc;
    }, {});
  }

  const clientes = rows.map(r => ({ ...r, dependientes: porCliente[r.id] ?? [] }));

  return NextResponse.json({ clientes });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('clientes:gestionar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json();
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const { razonSocial, rnc, email, telefono, direccion, descripcion } = parsed.data;

  // CLI-12: avisar al cliente si ya existe un cliente con el mismo RNC en el team.
  // Si el caller envía `?force=1` (o `force:true` en body) se permite duplicado.
  const force = new URL(req.url).searchParams.get('force') === '1'
    || (body && body.force === true);
  if (rnc && !force) {
    const [dup] = await db.select({ id: clients.id, razonSocial: clients.razonSocial })
      .from(clients)
      .where(and(eq(clients.teamId, teamId), eq(clients.rnc, rnc)))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        {
          error: 'RNC duplicado',
          duplicado: dup,
          mensaje: `Ya existe el cliente "${dup.razonSocial}" con el mismo RNC. Reenvía con force=true para crear de todos modos.`,
        },
        { status: 409 },
      );
    }
  }

  const [created] = await db.insert(clients).values({
    teamId,
    razonSocial,
    rnc:         rnc         || null,
    email:       email       || null,
    telefono:    telefono    || null,
    direccion:   direccion   || null,
    descripcion: descripcion || null,
    createdBy:   user.id,
  }).returning();

  return NextResponse.json({ ok: true, cliente: created }, { status: 201 });
}
