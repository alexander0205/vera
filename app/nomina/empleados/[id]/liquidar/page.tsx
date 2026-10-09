import { requirePermission } from '@/lib/auth/page-guard';
import LiquidarEmpleadoClient from './_page-client';

export default async function LiquidarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('nomina:correr');
  const { id } = await params;
  return <LiquidarEmpleadoClient id={id} />;
}
