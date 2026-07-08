import CompraLocalDetalleClient from './_page-client';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <CompraLocalDetalleClient compraId={parseInt(id)} />;
}
