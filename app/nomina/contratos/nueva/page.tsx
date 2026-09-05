import { requirePermission } from '@/lib/auth/page-guard';
import NuevaPlantillaClient from './_page-client';

export default async function NuevaPlantillaPage() {
  await requirePermission('nomina:configurar');
  return <NuevaPlantillaClient />;
}
