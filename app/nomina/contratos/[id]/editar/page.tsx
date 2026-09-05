import { requirePermission } from '@/lib/auth/page-guard';
import EditarPlantillaClient from './_page-client';

export default async function EditarPlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('nomina:configurar');
  const { id } = await params;
  return <EditarPlantillaClient id={id} />;
}
