import { notFound } from 'next/navigation';
import { PlanGate } from '@/components/plan-gate';
import { volverSeguro } from '@/lib/administracion-escolar/matricula-pantalla';
import ClienteForm from '../../_cliente-form';

/**
 * «Editar cliente».
 *
 *   ?volver=<ruta>  a dónde regresar al guardar o cancelar. Solo lo manda
 *                   Administración Escolar («Editar contacto» en Responsables),
 *                   así que solo se aceptan rutas de ese módulo.
 */
export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string | string[] }>;
}) {
  const { id } = await params;
  const clienteId = parseInt(id);
  if (isNaN(clienteId)) notFound();
  const { volver } = await searchParams;

  return (
    <>
      <PlanGate feature="clientes" />
      <ClienteForm clienteId={clienteId} volverA={volverSeguro(volver)} />
    </>
  );
}
