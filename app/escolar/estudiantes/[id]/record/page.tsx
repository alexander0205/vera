import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { fichaEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';
import RecordFinancieroClient from './_record-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Récord financiero — Zero' };

/**
 * El récord financiero del alumno: todo su dinero, en un papel.
 *
 * Antes había un botón «Estado de cuenta» que llamaba a `window.print()` sobre
 * la ficha entera. Salían las pestañas, los menús y los botones, y no salía lo
 * que de verdad hace falta: el detalle cargo por cargo con su factura, los
 * pagos con su referencia, y los totales del período. Lo que el colegio
 * entrega en el mostrador cuando una familia pide «el récord del niño» —o lo
 * que le manda al padre que discute una deuda— no puede ser una captura de una
 * pantalla de trabajo.
 *
 * Es una página aparte y del SERVIDOR a propósito: se abre en su pestaña, se
 * imprime sola y se puede enlazar. Y todo lo que enseña sale de la misma
 * consulta que la ficha, así que no hay dos verdades sobre la deuda.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('administracion-escolar:ver');
  await requireModule('escolar', '/dashboard');

  const teamId = await getTeamIdForUser();
  if (!teamId) notFound();

  const { id } = await params;
  const estudianteId = parseInt(id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) notFound();

  const [ficha, colegio] = await Promise.all([
    fichaEstudiante(teamId, estudianteId),
    db.select({ nombre: teams.name, rnc: teams.rnc, telefono: teams.telefono, direccion: teams.direccion })
      .from(teams).where(eq(teams.id, teamId)).limit(1).then((r) => r[0] ?? null),
  ]);
  if (!ficha) notFound();

  return <RecordFinancieroClient ficha={ficha} colegio={colegio} />;
}
