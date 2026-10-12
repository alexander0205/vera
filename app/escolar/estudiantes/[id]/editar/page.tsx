import EditarEstudianteClient from './_editar-client';

export default async function EditarEstudiantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditarEstudianteClient id={parseInt(id)} />;
}
