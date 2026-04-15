import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const user = await getUser();
  return Response.json(user);
}

export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();
  const name = body?.name?.trim();
  if (!name) return Response.json({ error: 'Nombre requerido' }, { status: 400 });
  if (name.length > 100) return Response.json({ error: 'Nombre muy largo' }, { status: 400 });

  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return Response.json({ success: true, name });
}

export async function DELETE() {
  const { cookies } = await import('next/headers');
  (await cookies()).delete('session');
  return Response.json({ success: true });
}
