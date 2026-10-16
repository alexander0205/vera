import CargoLoteClient from './_page-client';

/**
 * Cobrarle lo mismo a un grupo de alumnos (paseo, fotos, uniforme). Vivía en
 * «Cargos y deudas» (/escolar/cargos/lote); al quitar esa sección se perdió y
 * la revisión del PR #126 pidió reponerlo. La ruta vieja redirige a
 * Responsables, por eso vive aquí.
 */
export default function CobrarGrupoPage() {
  return <CargoLoteClient />;
}
