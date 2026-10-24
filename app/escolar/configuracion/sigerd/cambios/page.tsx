import { RevisarCambiosSigerd } from '@/components/administracion-escolar/RevisarCambiosSigerd';

export const metadata = { title: 'Revisar cambios de SIGERD' };

/**
 * Cuelga de Configuración › SIGERD: el permiso de configurar ya se comprueba en
 * el layout de `/escolar/configuracion`, y mover matrículas es de ese mismo nivel.
 */
export default function Page() {
  return <RevisarCambiosSigerd />;
}
