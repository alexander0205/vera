import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularioRespuestas } from '@/lib/db/schema';
import { Marco } from '../../_publico';
import { Aviso } from '../../_aviso';
import { Llenando } from './_llenar';
import {
  buscarFormulario, formularioPublico, motivoCerrado,
} from '@/lib/administracion-escolar/formularios-publicos';

/**
 * La ficha a medio llenar de UNA familia.
 *
 * El token de la URL es la única credencial: quien tenga el enlace ve y edita
 * esta ficha. Por eso no se indexa —`robots: noindex`— y por eso el token es
 * azar criptográfico y no el id de la fila.
 *
 * Se busca por token Y por formulario: un token de otro colegio no abre esto.
 */

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ slug: string; token: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const f = await buscarFormulario(slug);
  return {
    title: f?.nombre ?? 'Formulario',
    // Un borrador con los datos de un menor no puede acabar en un buscador.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { slug, token } = await params;

  const f = await buscarFormulario(slug);
  if (!f) {
    return (
      <Aviso
        titulo="Formulario no disponible"
        texto="El enlace no existe o el colegio lo cerró. Consulta con el centro educativo."
      />
    );
  }

  const [fila] = await db.select().from(adminEscolarFormularioRespuestas)
    .where(and(
      eq(adminEscolarFormularioRespuestas.token, token),
      eq(adminEscolarFormularioRespuestas.formularioId, f.id),
    ))
    .limit(1);

  if (!fila) {
    return (
      <Aviso
        titulo="Este enlace ya no sirve"
        texto="Puede que esté mal copiado. Abre otra vez el enlace que te mandó el colegio y pulsa «Comenzar»."
      />
    );
  }

  if (fila.estado !== 'borrador') {
    return (
      <Aviso
        titulo="Este formulario ya fue enviado"
        texto="El colegio ya lo recibió. Si necesitas corregir algo, comunícate con el centro educativo."
      />
    );
  }

  // Caducó mientras lo llenaba: mejor decirlo ahora que dejar que termine los
  // siete pasos y se estrelle contra un 410 al enviar.
  const motivo = await motivoCerrado(f);
  if (motivo) return <Aviso titulo="Este formulario ya cerró" texto={motivo} />;

  const publico = formularioPublico(f);

  return (
    <Marco fondo={publico.configuracion.colorFondo}>
      <Llenando
        formulario={publico}
        slug={slug}
        token={token}
        datos={(fila.datos ?? {}) as Record<string, unknown>}
        pagina={fila.pagina}
      />
    </Marco>
  );
}
