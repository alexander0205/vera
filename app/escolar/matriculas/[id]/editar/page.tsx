import { requirePermission } from '@/lib/auth/page-guard';
import { idDeRuta, volverSeguro } from '@/lib/administracion-escolar/matricula-pantalla';
import MatriculaPantalla from '../../_matricula-pantalla';

/**
 * «Editar matrícula», a pantalla completa.
 *
 *   ?volver=<ruta>  a dónde regresar al guardar o cancelar.
 *
 * Mismo permiso que «Nueva matrícula», y por lo mismo: el botón que traía aquí
 * solo lo ve quien puede gestionar.
 *
 * Un id que no es un número pasa como `null`: la pantalla dice que esa
 * matrícula no existe, sin llegar a pedirla.
 */
export default async function EditarMatriculaPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string | string[] }>;
}) {
  await requirePermission('administracion-escolar:gestionar');
  const { id } = await params;
  const { volver } = await searchParams;
  return (
    <MatriculaPantalla
      key={id}
      modo="editar"
      matriculaId={idDeRuta(id)}
      estudianteId={null}
      volver={volverSeguro(volver)}
    />
  );
}
