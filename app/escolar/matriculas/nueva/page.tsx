import { requirePermission } from '@/lib/auth/page-guard';
import { idDeRuta, volverSeguro } from '@/lib/administracion-escolar/matricula-pantalla';
import MatriculaPantalla from '../_matricula-pantalla';

/**
 * «Nueva matrícula», a pantalla completa.
 *
 *   ?estudiante=<id>  el alumno ya viene decidido (desde su ficha, o recién
 *                     dado de alta). Sin él se elige con el buscador.
 *   ?volver=<ruta>    a dónde regresar al guardar o cancelar.
 *
 * Matricular es gestionar: el botón que traía aquí solo lo ve quien tiene ese
 * permiso, y la dirección escrita a mano no puede ser una puerta de atrás. El
 * layout del módulo ya exigió poder mirar; esto va encima.
 *
 * Lo que viene en la dirección se valida AQUÍ, antes de que llegue al
 * navegador: un `volver` que no sea una ruta del módulo se ignora.
 */
export default async function NuevaMatriculaPage({ searchParams }: {
  searchParams: Promise<{ estudiante?: string | string[]; volver?: string | string[] }>;
}) {
  await requirePermission('administracion-escolar:gestionar');
  const { estudiante, volver } = await searchParams;
  const estudianteId = idDeRuta(estudiante);
  return (
    <MatriculaPantalla
      // Otro alumno es otro formulario: no se reaprovecha lo escrito para el anterior.
      key={estudianteId ?? 'sin-alumno'}
      modo="nueva"
      matriculaId={null}
      estudianteId={estudianteId}
      volver={volverSeguro(volver)}
    />
  );
}
