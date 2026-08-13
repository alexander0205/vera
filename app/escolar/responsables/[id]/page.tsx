import FamiliaPerfilClient from './_perfil-client';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FamiliaPerfilClient clientId={Number(id)} />;
}
