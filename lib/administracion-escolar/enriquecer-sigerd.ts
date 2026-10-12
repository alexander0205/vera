/**
 * Nivel 2: enriquecer estudiantes ya importados con su ficha completa de SIGERD.
 *
 * El Nivel 1 (sync) deja al estudiante con lo que da el listado de sección:
 * nombre concatenado (partido a la mitad, aproximado), sin sexo ni fecha, y
 * código `SIGERD-<id>`. Este paso baja la ficha de cada uno y COMPLETA:
 *   - nombres/apellidos separados de verdad (corrige el split del Nivel 1)
 *   - fechaNacimiento (ISO)
 *   - sexo (masculino/femenino/otro)
 *   - código → RNE cuando la ficha lo trae (identificador oficial del MINERD)
 *
 * Va EN LOTES porque son ~1 petición por estudiante y un centro tiene cientos:
 * no cabe en una sola llamada de Vercel. Cada tanda procesa N y devuelve cuántos
 * quedan; el cliente repite hasta vaciar.
 *
 * "PENDIENTE" = estudiante con código `SIGERD-%` y `fechaNacimiento` NULL. Al
 * enriquecerlo se le pone la fecha, así sale de la cola aunque no tenga RNE
 * (conserva el código SIGERD-). Caso raro: si la ficha no trae fecha NI RNE,
 * volvería a caer en la cola — se acota con el tope de reintentos del cliente.
 */
import 'server-only';
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import type { FichaEstudianteSigerd } from '@/lib/sigerd/ficha';

/** Estudiante local pendiente de ficha, con el id de SIGERD ya extraído. */
export interface PendienteFicha {
  estudianteId: number;
  idSigerd: number;
  codigo: string;
}

/**
 * Estudiantes de un team a los que aún les falta la ficha.
 *
 * El id de SIGERD se saca del propio código (`SIGERD-<id>`). Solo estos: los
 * que ya tienen RNE (código migrado) o fecha se consideran completos.
 */
export async function estudiantesPendientesFicha(
  teamId: number,
  limite = 40,
): Promise<PendienteFicha[]> {
  const filas = await db
    .select({ id: adminEscolarEstudiantes.id, codigo: adminEscolarEstudiantes.codigo })
    .from(adminEscolarEstudiantes)
    .where(
      and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        like(adminEscolarEstudiantes.codigo, 'SIGERD-%'),
        isNull(adminEscolarEstudiantes.fechaNacimiento),
      ),
    )
    .orderBy(adminEscolarEstudiantes.id)
    .limit(limite);

  return filas
    .map((f) => {
      const idSigerd = Number((f.codigo ?? '').replace('SIGERD-', ''));
      return { estudianteId: f.id, idSigerd, codigo: f.codigo ?? '' };
    })
    .filter((p) => Number.isFinite(p.idSigerd) && p.idSigerd > 0);
}

/** Cuántos quedan pendientes (para la barra de progreso del cliente). */
export async function contarPendientesFicha(teamId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminEscolarEstudiantes)
    .where(
      and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        like(adminEscolarEstudiantes.codigo, 'SIGERD-%'),
        isNull(adminEscolarEstudiantes.fechaNacimiento),
      ),
    );
  return row?.n ?? 0;
}

/** Une los dos campos descartando vacíos (nombres o apellidos). */
function unir(...partes: Array<string | null | undefined>): string {
  return partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
}

export interface ResultadoEnriquecer {
  actualizados: number;
  conRne: number;
  sinFicha: number;
}

/**
 * Aplica las fichas descargadas a los estudiantes locales.
 *
 * `fichas` viene indexado por `estudianteId` local (el llamador ya resolvió el
 * mapeo estudiante↔ficha). Cada update se hace acotado por teamId + id, nunca a
 * ciegas. El código solo migra a RNE si la ficha lo trae Y ese RNE no está ya
 * en uso por otro estudiante del team (evita colisión de código).
 */
export async function aplicarFichas(
  teamId: number,
  fichas: Array<{ estudianteId: number; ficha: FichaEstudianteSigerd | null }>,
): Promise<ResultadoEnriquecer> {
  let actualizados = 0;
  let conRne = 0;
  let sinFicha = 0;

  for (const { estudianteId, ficha } of fichas) {
    if (!ficha) {
      sinFicha++;
      continue;
    }

    const nombres = unir(ficha.primerNombre, ficha.segundoNombre);
    const apellidos = unir(ficha.primerApellido, ficha.segundoApellido);

    // ¿Se puede migrar el código a RNE sin chocar con otro estudiante?
    let nuevoCodigo: string | undefined;
    if (ficha.codigoRNE) {
      const [choca] = await db
        .select({ id: adminEscolarEstudiantes.id })
        .from(adminEscolarEstudiantes)
        .where(
          and(
            eq(adminEscolarEstudiantes.teamId, teamId),
            eq(adminEscolarEstudiantes.codigo, ficha.codigoRNE),
          ),
        )
        .limit(1);
      if (!choca || choca.id === estudianteId) {
        nuevoCodigo = ficha.codigoRNE;
        conRne++;
      }
    }

    await db
      .update(adminEscolarEstudiantes)
      .set({
        nombres: nombres || undefined,
        apellidos: apellidos || undefined,
        fechaNacimiento: ficha.fechaNacimiento,
        sexo: ficha.sexoNormalizado,
        ...(nuevoCodigo ? { codigo: nuevoCodigo } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(adminEscolarEstudiantes.teamId, teamId), eq(adminEscolarEstudiantes.id, estudianteId)));

    actualizados++;
  }

  return { actualizados, conRne, sinFicha };
}
