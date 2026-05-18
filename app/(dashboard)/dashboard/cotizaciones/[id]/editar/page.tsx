/**
 * /dashboard/cotizaciones/[id]/editar
 * Server component: carga la cotización y renderiza el formulario de edición.
 */
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getTeamIdForUser } from '@/lib/db/queries';
import EditarCotizacionClient from './_editar-client';

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cotId = parseInt(id);
  if (isNaN(cotId)) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [cot] = await db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.id, cotId), eq(cotizaciones.teamId, teamId)))
    .limit(1);

  if (!cot) notFound();

  // Solo borrador y enviada son editables
  if (!['borrador', 'enviada'].includes(cot.estado)) {
    redirect(`/dashboard/cotizaciones/${cotId}`);
  }

  let parsedItems: Array<{ descripcion: string; precio: number; cantidad: number }> = [];
  try {
    if (cot.items) parsedItems = JSON.parse(cot.items);
  } catch { /* ignore */ }

  const initialData = {
    id:                   cot.id,
    numero:               cot.numero,
    estado:               cot.estado,
    razonSocialComprador: cot.razonSocialComprador ?? '',
    rncComprador:         cot.rncComprador ?? '',
    emailComprador:       cot.emailComprador ?? '',
    fechaVencimiento:     cot.fechaVencimiento
      ? new Date(cot.fechaVencimiento).toISOString().split('T')[0]
      : '',
    notas:               cot.notas ?? '',
    terminosCondiciones: cot.terminosCondiciones ?? '',
    items:               parsedItems,
  };

  return <EditarCotizacionClient initialData={initialData} />;
}
