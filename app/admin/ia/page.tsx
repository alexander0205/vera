import { exigirAdmin } from '@/lib/auth/admin-guard';
import ModelosIaClient from './_modelos-client';

export default async function AdminIaPage() {
  await exigirAdmin();   // ver lib/auth/admin-guard.ts
  return <ModelosIaClient />;
}
