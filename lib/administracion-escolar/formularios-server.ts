import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios } from '@/lib/db/schema';
import { normalizarSlug } from './formularios';

/**
 * Helpers del constructor de formularios que SÍ tocan la base. Separados de
 * ./formularios (que es puro vocabulario + funciones sin efectos) a
 * propósito: ese fichero lo importa `FormularioBuilder.tsx`, un componente de
 * cliente, y basta un solo `import { db }` en cualquier función que use para
 * que el bundler intente meter el driver de Postgres en el navegador — se
 * rompe en silencio (pantalla en negro, el error solo sale en la consola).
 * El paquete `server-only` deja ese error explícito en vez de silencioso si
 * alguna vez alguien importa esto desde un componente de cliente por error.
 */

/**
 * Slug único POR COLEGIO (no global — ver comentario de la tabla). Si
 * "inscripcion-2026" ya existe se prueba "inscripcion-2026-2",
 * "inscripcion-2026-3"... `excluirId` es para cuando se renombra un
 * formulario existente y no debe chocar consigo mismo.
 */
export async function slugUnico(teamId: number, nombre: string, excluirId?: number): Promise<string> {
  const base = normalizarSlug(nombre);
  for (let intento = 0; intento < 200; intento++) {
    const candidato = intento === 0 ? base : `${base}-${intento + 1}`;
    const [existente] = await db.select({ id: adminEscolarFormularios.id })
      .from(adminEscolarFormularios)
      .where(and(
        eq(adminEscolarFormularios.teamId, teamId),
        eq(adminEscolarFormularios.slug, candidato),
      ))
      .limit(1);
    if (!existente || existente.id === excluirId) return candidato;
  }
  // Prácticamente inalcanzable (200 formularios con el mismo nombre), pero
  // sin esto la función podría no devolver nada.
  return `${base}-${Date.now()}`;
}
