import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentosEnlaces } from '@/lib/db/schema';
import { generarToken, hashToken, formatoTokenValido } from '@/lib/fotos/sesiones';

/**
 * El enlace con el que la familia sube documentos sin tener cuenta.
 *
 * Comparte el mecanismo del token con las sesiones de foto —mismo generador,
 * mismo hash, mismo formato— porque las propiedades que se necesitan son las
 * mismas: 256 bits de entropía para que no se adivine, y en la base solo el
 * SHA-256 para que un volcado no sirva para entrar.
 *
 * Lo que cambia es la vida útil y el uso. El QR de una foto vive diez minutos y
 * se quema al primer disparo: el encargado lo tiene delante. Este viaja por
 * WhatsApp a un padre que lo abrirá el sábado, admite varias subidas y varios
 * documentos, así que dura días y no se quema — se revoca o caduca.
 */

export { generarToken, hashToken, formatoTokenValido };

/** Lo que vive un enlace de documentos. Una semana cubre "te lo mando el
 *  viernes y lo hace el fin de semana" sin dejarlo abierto todo el año. */
export const DIAS_VIGENCIA_ENLACE = 7;

export function fechaExpiracionEnlace(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_ENLACE * 24 * 60 * 60_000);
}

export type EstadoEnlace = 'valido' | 'expirado' | 'revocado';

export function estadoEnlace(
  enlace: { expiraEn: Date; revocadoEn: Date | null },
  ahora: Date = new Date(),
): EstadoEnlace {
  if (enlace.revocadoEn) return 'revocado';
  if (enlace.expiraEn.getTime() <= ahora.getTime()) return 'expirado';
  return 'valido';
}

export interface EnlaceResuelto {
  id: number;
  teamId: number;
  matriculaId: number;
  /** null = el expediente entero. */
  requeridoId: number | null;
  expiraEn: Date;
}

/**
 * Busca el enlace de un token y comprueba que siga vivo.
 *
 * Devuelve null tanto si el token no existe como si está mal formado: desde
 * fuera no se distingue si llegó a existir alguna vez.
 */
export async function resolverEnlace(token: string): Promise<
  { ok: true; enlace: EnlaceResuelto } | { ok: false; motivo: 'invalido' | EstadoEnlace }
> {
  if (!formatoTokenValido(token)) return { ok: false, motivo: 'invalido' };

  const [fila] = await db
    .select()
    .from(adminEscolarDocumentosEnlaces)
    .where(eq(adminEscolarDocumentosEnlaces.tokenHash, hashToken(token)))
    .limit(1);
  if (!fila) return { ok: false, motivo: 'invalido' };

  const estado = estadoEnlace(fila);
  if (estado !== 'valido') return { ok: false, motivo: estado };

  return {
    ok: true,
    enlace: {
      id: fila.id,
      teamId: fila.teamId,
      matriculaId: fila.matriculaId,
      requeridoId: fila.requeridoId,
      expiraEn: fila.expiraEn,
    },
  };
}

/** Deja constancia de que se usó. Sirve para saber si el padre llegó a abrirlo. */
export async function marcarUso(enlaceId: number): Promise<void> {
  await db.update(adminEscolarDocumentosEnlaces)
    .set({ ultimoUsoEn: new Date() })
    .where(eq(adminEscolarDocumentosEnlaces.id, enlaceId));
}

/**
 * Crea un enlace, revocando antes cualquier otro vivo para el mismo destino.
 *
 * Uno solo a la vez por (matrícula, documento): si el colegio genera otro es
 * porque el anterior se perdió o se mandó a quien no era, y dejar los dos
 * abiertos significaría que revocar no sirve de nada.
 */
export async function crearEnlace(input: {
  teamId: number;
  matriculaId: number;
  requeridoId: number | null;
  creadoPor: number | null;
}): Promise<{ token: string; expiraEn: Date; id: number }> {
  await db.update(adminEscolarDocumentosEnlaces)
    .set({ revocadoEn: new Date() })
    .where(and(
      eq(adminEscolarDocumentosEnlaces.teamId, input.teamId),
      eq(adminEscolarDocumentosEnlaces.matriculaId, input.matriculaId),
      input.requeridoId == null
        ? isNull(adminEscolarDocumentosEnlaces.requeridoId)
        : eq(adminEscolarDocumentosEnlaces.requeridoId, input.requeridoId),
      isNull(adminEscolarDocumentosEnlaces.revocadoEn),
    ));

  const token = generarToken();
  const expiraEn = fechaExpiracionEnlace();
  const [fila] = await db.insert(adminEscolarDocumentosEnlaces).values({
    teamId: input.teamId,
    matriculaId: input.matriculaId,
    requeridoId: input.requeridoId,
    tokenHash: hashToken(token),
    expiraEn,
    creadoPor: input.creadoPor,
  }).returning({ id: adminEscolarDocumentosEnlaces.id });

  return { token, expiraEn, id: fila.id };
}

/** Los enlaces vivos de una matrícula, para saber qué hay repartido por ahí. */
export async function enlacesVivos(teamId: number, matriculaId: number) {
  return db
    .select({
      id: adminEscolarDocumentosEnlaces.id,
      requeridoId: adminEscolarDocumentosEnlaces.requeridoId,
      expiraEn: adminEscolarDocumentosEnlaces.expiraEn,
      creadoEn: adminEscolarDocumentosEnlaces.creadoEn,
      ultimoUsoEn: adminEscolarDocumentosEnlaces.ultimoUsoEn,
    })
    .from(adminEscolarDocumentosEnlaces)
    .where(and(
      eq(adminEscolarDocumentosEnlaces.teamId, teamId),
      eq(adminEscolarDocumentosEnlaces.matriculaId, matriculaId),
      isNull(adminEscolarDocumentosEnlaces.revocadoEn),
      sql`${adminEscolarDocumentosEnlaces.expiraEn} > now()`,
    ));
}

export async function revocarEnlace(teamId: number, id: number): Promise<boolean> {
  const [fila] = await db.update(adminEscolarDocumentosEnlaces)
    .set({ revocadoEn: new Date() })
    .where(and(
      eq(adminEscolarDocumentosEnlaces.id, id),
      eq(adminEscolarDocumentosEnlaces.teamId, teamId),
      isNull(adminEscolarDocumentosEnlaces.revocadoEn),
    ))
    .returning({ id: adminEscolarDocumentosEnlaces.id });
  return !!fila;
}
