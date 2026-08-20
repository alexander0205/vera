import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados } from '@/lib/db/schema';

/**
 * El rastro de lo que se le mandó a una familia sobre su expediente.
 *
 * Va a la MISMA tabla que los recordatorios de cobro, no a una nueva: cuando la
 * familia dice «a mí no me avisaron», la secretaria abre una sola pantalla. Dos
 * historiales separados obligan a mirar en dos sitios y a acordarse de que el
 * segundo existe.
 *
 * Estos avisos cuelgan de la matrícula en vez de una cuota — no hay cuota que
 * cobrar detrás de pedir un acta de nacimiento.
 */

export type TipoAvisoExpediente = 'documentos' | 'formulario';

export async function registrarAvisoExpediente(opts: {
  teamId: number;
  matriculaId: number;
  tipo: TipoAvisoExpediente;
  canal: 'correo' | 'whatsapp' | 'sms';
  destino: string;
  /** Qué se mandó, en palabras. Es lo que hace útil el historial. */
  detalle?: string | null;
}) {
  // Nunca debe tumbar el envío: el correo ya salió, y perder la constancia es
  // malo, pero devolverle un error a quien acaba de mandarlo —y que lo mande
  // otra vez— es peor.
  try {
    await db.insert(adminEscolarAvisosEnviados).values({
      teamId: opts.teamId,
      matriculaId: opts.matriculaId,
      cargoId: null,
      tipo: opts.tipo,
      offsetDias: 0,
      canal: opts.canal,
      destino: opts.destino.slice(0, 200),
      detalle: opts.detalle?.slice(0, 200) ?? null,
    });
  } catch (err) {
    console.error('[avisos-expediente] no se pudo registrar el aviso', err);
  }
}
