import { exigirAdmin } from '@/lib/auth/admin-guard';
import AcademiaAdminClient from './_academia-client';

export default async function AdminAcademiaPage() {
  await exigirAdmin();   // ver lib/auth/admin-guard.ts — primera línea, antes de tocar la base
  return <AcademiaAdminClient />;
}
