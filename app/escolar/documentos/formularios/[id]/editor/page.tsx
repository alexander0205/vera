import EditorClient from './_editor-client';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorClient id={parseInt(id)} />;
}
