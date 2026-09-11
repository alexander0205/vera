import { requirePermission } from '@/lib/auth/page-guard';
import CorridaDetalleClient from './_page-client';

export default async function CorridaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('empleados:ver');
  const { id } = await params;
  return <CorridaDetalleClient id={id} />;
}
