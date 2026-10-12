import { exigirAdmin } from '@/lib/auth/admin-guard';
import PlantillasClient from './_plantillas-client';

export default async function AdminWhatsAppPlantillasPage() {
  await exigirAdmin();   // ver lib/auth/admin-guard.ts
  return <PlantillasClient />;
}
