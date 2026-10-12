import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios } from '@/lib/db/schema';
import { Marco, PantallaInicio } from './_publico';
import { Aviso } from './_aviso';
import { motivoCerrado } from '@/lib/administracion-escolar/formularios-publicos';
import type { ICampo, IFormularioConfig } from '@/lib/administracion-escolar/formularios';

/**
 * El enlace que el colegio manda por WhatsApp.
 *
 * Fuera del `(dashboard)`: aquí no hay sesión, ni menú, ni empresa activa. Lo
 * abre alguien que muchas veces todavía no es alumno —esta ficha es justo lo
 * que se llena ANTES de la admisión—, así que la página no puede depender de
 * nada que exija estar dentro.
 *
 * Esta pantalla solo presenta el formulario. Al pulsar «Comenzar» se abre un
 * borrador con su propia dirección (`/f/<slug>/r/<token>`) y a partir de ahí
 * todo se guarda solo.
 */

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [f] = await db.select({ nombre: adminEscolarFormularios.nombre })
    .from(adminEscolarFormularios)
    .where(and(eq(adminEscolarFormularios.slug, slug), eq(adminEscolarFormularios.activo, true)))
    .limit(1);
  return { title: f?.nombre ?? 'Formulario' };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;

  const [fila] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.slug, slug),
      eq(adminEscolarFormularios.activo, true),
    ))
    .limit(1);

  if (!fila) {
    return (
      <Aviso
        titulo="Formulario no disponible"
        texto="El enlace no existe o el colegio lo cerró. Consulta con el centro educativo."
      />
    );
  }

  const motivo = await motivoCerrado(fila);
  if (motivo) return <Aviso titulo="Este formulario ya cerró" texto={motivo} />;

  const cfg = (fila.configuracion ?? {}) as IFormularioConfig;
  const campos = (fila.campos ?? []) as ICampo[];
  const pasos = campos.filter((c) => c.tipo === 'salto_pagina').length + 1;

  return (
    <Marco fondo={cfg.colorFondo}>
      <PantallaInicio
        slug={slug}
        nombre={fila.nombre}
        descripcion={fila.descripcion}
        color={cfg.colorPrimario ?? '#2563eb'}
        pasos={pasos}
      />
    </Marco>
  );
}
