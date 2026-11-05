import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { esDuenoDePlataforma } from '@/lib/auth/equipo-zero';
import { perfilesDelEquipo } from '@/lib/auth/equipo-zero-perfil';
import { urlFotoEquipo } from '@/lib/auth/equipo-zero-perfil-reglas';
import { AdminShell } from '@/components/admin/AdminShell';
import { EstadoEcfApi, EstadoEcfApiCargando } from '@/components/admin/EstadoEcfApi';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Segunda capa. La que cuenta es `exigirAdmin()` en cada página: este
  // `redirect()` no impide que la página consulte la base (ver lib/auth/admin-guard.ts).
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') redirect('/dashboard');

  const [esDueno, perfiles] = await Promise.all([esDuenoDePlataforma(user.id), perfilesDelEquipo([user.id])]);
  const perfil = perfiles.get(user.id);

  return (
    <AdminShell
      usuario={{
        nombre: user.name, email: user.email, esDueno, cargo: perfil?.cargo ?? null,
        fotoUrl: perfil?.fotoVersion != null ? urlFotoEquipo(user.id, perfil.fotoVersion) : null,
      }}
      // El estado de ecf-api es una llamada de red; fuera del camino crítico:
      // el panel pinta ya y este cuadro llega cuando responda.
      estado={<Suspense fallback={<EstadoEcfApiCargando />}><EstadoEcfApi /></Suspense>}
    >
      {children}
    </AdminShell>
  );
}
