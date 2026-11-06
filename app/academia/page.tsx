import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { hayAcademia, listarVideos, modulosParaAcademia } from '@/lib/academia/datos';
import { filtrarPorModulos, puedeAdministrarAcademia, puedeVerPaginaAcademia } from '@/lib/academia/reglas';
import { AcademiaInicio } from '@/components/academia/AcademiaInicio';

export default async function AcademiaPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  // Sin ningún video publicado, la Academia no existe para los usuarios normales.
  if (!puedeVerPaginaAcademia({ hayPublicados: await hayAcademia(), esAdmin: puedeAdministrarAcademia(user) })) notFound();
  // Solo los publicados: los borradores se ven en /admin/academia. Si la
  // migración no se ha corrido, la lista sale vacía y la página lo dice.
  const [todos, modulos] = await Promise.all([listarVideos(user.id), modulosParaAcademia(user)]);
  // Solo lo de los módulos que tiene la empresa, más «General».
  const videos = filtrarPorModulos(todos, modulos);
  return <AcademiaInicio videos={videos} esAdmin={puedeAdministrarAcademia(user)} />;
}
