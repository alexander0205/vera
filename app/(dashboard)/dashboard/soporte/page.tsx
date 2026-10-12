import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { SoportePaginaCompleta } from '@/components/support/soporte-full-page';

export const metadata = { title: 'Soporte — Zero' };

export default async function SoportePage() {
  const user = await getUser();
  if (!user) redirect('/sign-in?redirect=/dashboard/soporte');

  return <SoportePaginaCompleta />;
}
