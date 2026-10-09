/**
 * La factura le llega al padre cuando paga.
 *
 * En gobernanza el cobro vive en la factura (`pagos_recibidos`), así que
 * «hubo un pago» se detecta donde se registra ese cobro. Este módulo es lo que
 * esos puntos llaman después: mira si la factura es de un cargo escolar y, si
 * lo es, le manda al responsable de pago el PDF por correo, con el enlace a su
 * factura.
 *
 * Tres reglas que no se negocian:
 *
 * 1. NUNCA tumba el cobro. El pago ya está en el ledger cuando se llega aquí; si
 *    el correo falla, se anota y se sigue. Quien lo llama no debe esperar un
 *    error de este módulo.
 *
 * 2. Solo facturas de cargos escolares. Una venta de mostrador del POS o la
 *    factura de un proveedor no son del padre, y este módulo no se mete.
 *
 * 3. No se engancha a la importación ni a la emisión masiva: eso mandaría un
 *    correo a cada familia por pagos que se cargaron de golpe. Solo se llama
 *    desde los puntos donde una persona (o el padre) registra UN cobro.
 */

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarEstudiantes,
  clients,
  ecfDocuments,
} from '@/lib/db/schema';
import { teamHasModule } from '@/lib/auth/modules';
import { getOCrearLink, urlDelLink } from './link-pago';
import { urlDeFacturaEnLink } from './avisos';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A qué correo va. El del responsable de pago manda: es a quien el colegio le
 * cobra y quien tiene el enlace. El del comprador que quedó en la factura es el
 * respaldo, para los colegios que facturaron antes de asignar responsable.
 */
export function elegirDestinatario(
  emailResponsable: string | null | undefined,
  emailComprador: string | null | undefined,
): string | null {
  for (const e of [emailResponsable, emailComprador]) {
    const limpio = e?.trim();
    if (limpio && CORREO.test(limpio)) return limpio;
  }
  return null;
}

export type ResultadoEnvioFactura =
  | { enviado: true; destino: string }
  | { enviado: false; motivo: 'no-escolar' | 'sin-correo' | 'sin-factura' | 'error'; detalle?: string };

/** Quién paga esta factura según los cargos escolares que la saldan. */
async function responsableDeLaFactura(teamId: number, ecfDocumentId: number) {
  const filas = await db
    .select({
      clientId: clients.id,
      nombre: clients.razonSocial,
      email: clients.email,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
    .leftJoin(clients, eq(clients.id, adminEscolarEstudiantes.facturarAClientId))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.ecfDocumentId, ecfDocumentId),
    ));
  if (filas.length === 0) return null;
  // Una factura puede saldar varios cargos de hermanos; comparten responsable
  // (así lo exige la emisión), así que basta el primero que lo tenga.
  return filas.find((f) => f.clientId != null) ?? { clientId: null, nombre: null, email: null };
}

export async function enviarFacturaAlResponsable(
  teamId: number,
  ecfDocumentId: number,
): Promise<ResultadoEnvioFactura> {
  try {
    if (!(await teamHasModule(teamId, 'escolar'))) return { enviado: false, motivo: 'no-escolar' };

    const resp = await responsableDeLaFactura(teamId, ecfDocumentId);
    if (!resp) return { enviado: false, motivo: 'no-escolar' };

    const [doc] = await db
      .select({ emailComprador: ecfDocuments.emailComprador })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);
    if (!doc) return { enviado: false, motivo: 'sin-factura' };

    const destino = elegirDestinatario(resp.email, doc.emailComprador);
    if (!destino) return { enviado: false, motivo: 'sin-correo' };

    // Import perezoso a propósito: `@/lib/email` crea el cliente de Resend al
    // cargarse y revienta sin RESEND_API_KEY. Este módulo lo importan los
    // flujos de comprobantes y de pagos, y cargarlo de forma estática
    // rompería toda prueba o script que los toque sin esa clave.
    const [{ generarFacturaPdf }, { sendInvoiceEmail }] = await Promise.all([
      import('@/lib/pdf/generar'),
      import('@/lib/email'),
    ]);

    const pdf = await generarFacturaPdf({ teamId, docId: ecfDocumentId });
    if (!pdf) return { enviado: false, motivo: 'sin-factura' };

    // Sin responsable asignado no hay enlace de familia que abrir: el correo
    // sale igual, con el PDF adjunto, pero sin botón.
    const enlace = resp.clientId != null
      ? urlDeFacturaEnLink(
          urlDelLink((await getOCrearLink(teamId, resp.clientId)).token),
          ecfDocumentId,
        )
      : null;

    await sendInvoiceEmail({
      email: destino,
      encf: pdf.encf,
      codigo: pdf.codigo,
      emisor: pdf.emisor,
      pdfBuffer: pdf.buffer,
      ...pdf.resumen,
      enlace,
      pagoRecibido: true,
    });
    return { enviado: true, destino };
  } catch (e) {
    console.error('[factura-al-padre] no se pudo enviar la factura:', e);
    return { enviado: false, motivo: 'error', detalle: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Para los puntos de pago: lo manda sin hacer esperar la respuesta ni poder
 * romperla. El resultado solo se anota.
 */
export function enviarFacturaAlResponsableEnSegundoPlano(teamId: number, ecfDocumentId: number): void {
  void enviarFacturaAlResponsable(teamId, ecfDocumentId).then((r) => {
    if (!r.enviado && r.motivo !== 'no-escolar') {
      console.warn(`[factura-al-padre] factura ${ecfDocumentId} no enviada: ${r.motivo}${r.detalle ? ` (${r.detalle})` : ''}`);
    }
  });
}
