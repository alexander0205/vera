import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { listarVideos, videoPorSlug } from '@/lib/academia/datos';
import { puedeAdministrarAcademia } from '@/lib/academia/reglas';
import { segundosDeParametro } from '@/lib/academia/tiempo';
import { Reproductor } from '@/components/academia/Reproductor';

export default async function VideoPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const { slug } = await params;
  const { t } = await searchParams;

  // El borrador solo lo abre el administrador (para revisarlo antes de publicar).
  const video = await videoPorSlug(user.id, slug, puedeAdministrarAcademia(user));
  if (!video) notFound();

  const todos = await listarVideos(user.id);
  const relacionados = todos
    .filter((v) => v.id !== video.id)
    .sort((a, b) => Number(b.modulo === video.modulo) - Number(a.modulo === video.modulo))
    .slice(0, 4);

  return <Reproductor video={video} relacionados={relacionados} inicioSeg={segundosDeParametro(t)} />;
}
