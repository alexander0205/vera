import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { esDuenoDePlataforma } from '@/lib/auth/equipo-zero';
import { AdminShell } from '@/components/admin/AdminShell';
import { EstadoEcfApi, EstadoEcfApiCargando } from '@/components/admin/EstadoEcfApi';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Segunda capa. La que cuenta es `exigirAdmin()` en cada página: este
  // `redirect()` no impide que la página consulte la base (ver lib/auth/admin-guard.ts).
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') redirect('/dashboard');

  const esDueno = await esDuenoDePlataforma(user.id);

  return (
    <AdminShell
      usuario={{ nombre: user.name, email: user.email, esDueno }}
      // El estado de ecf-api es una llamada de red; fuera del camino crítico:
      // el panel pinta ya y este cuadro llega cuando responda.
      estado={<Suspense fallback={<EstadoEcfApiCargando />}><EstadoEcfApi /></Suspense>}
    >
      {children}
    </AdminShell>
  );
}
