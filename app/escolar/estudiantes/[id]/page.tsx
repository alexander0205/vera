import PerfilEstudianteClient from './_perfil-client';

export default async function EstudiantePerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PerfilEstudianteClient id={parseInt(id)} />;
}
