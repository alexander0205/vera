/**
 * /dashboard/cotizaciones/[id]/editar
 * Server component: carga la cotización y renderiza el MISMO formulario que
 * "Nueva cotización" en modo edición (reusa los componentes de factura).
 */
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaCotizacionFormClient from '../../nueva/_nueva-cotizacion-client';
import type { Retencion } from '../../../facturas/nueva/utils/types';

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

  let items: Array<Record<string, unknown>> = [];
  try { if (cot.items) items = JSON.parse(cot.items); } catch { /* ignore */ }

  let retenciones: Retencion[] = [];
  try { if (cot.retenciones) retenciones = JSON.parse(cot.retenciones); } catch { /* ignore */ }

  const perfil = await getEmpresaPerfil();

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
    items,
    retenciones,
    notas:               cot.notas ?? '',
    terminosCondiciones: cot.terminosCondiciones ?? '',
    pieFactura:          cot.pieFactura ?? '',
    comentario:          cot.comentario ?? '',
  };

  return <NuevaCotizacionFormClient initialPerfil={perfil} initialData={initialData} />;
}
