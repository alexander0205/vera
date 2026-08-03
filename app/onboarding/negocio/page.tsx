import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { OnboardingNegocioForm } from './_form';

// Paso 2 del registro: datos del negocio. Fuera del grupo (dashboard) a
// propósito — el team recién creado aún no tiene módulos activos y el gate del
// dashboard lo mandaría a /pricing. Aquí solo exigimos sesión.
export default async function OnboardingNegocioPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  return <OnboardingNegocioForm />;
}
