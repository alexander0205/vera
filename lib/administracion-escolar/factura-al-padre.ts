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
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarAvisosEnviados,
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarEstudiantes,
  clients,
  ecfDocuments,
  pagosRecibidos,
  teams,
  whatsappPlantillas,
} from '@/lib/db/schema';
import { teamHasModule } from '@/lib/auth/modules';
import { aE164 } from '@/lib/whatsapp/telefono';
import { cuotaAvisos } from '@/lib/suscripcion/cuota-avisos';
import { getOCrearLink, urlDelLink } from './link-pago';
import { pesos, urlDeFacturaEnLink } from './avisos';

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

// ─── WhatsApp: «recibimos tu pago» ───────────────────────────────────────────

/** El nombre con el que se registra la plantilla (ver sembrar-plantillas-whatsapp). */
export const PLANTILLA_PAGO_RECIBIDO = 'pago_recibido';

/**
 * Varios nombres en una sola frase: «Ana y Beto», «Ana, Beto y Carla».
 *
 * Una variable de Meta no admite saltos de línea, así que un padre con varios
 * hijos recibe UN mensaje y los nombres van juntos. Sin nombres devuelve un
 * respaldo: Meta rechaza una variable vacía con 132000.
 */
export function unirNombres(nombres: string[]): string {
  const limpios = [...new Set(nombres.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (limpios.length === 0) return 'tu hijo(a)';
  if (limpios.length === 1) return limpios[0];
  return `${limpios.slice(0, -1).join(', ')} y ${limpios[limpios.length - 1]}`;
}

export interface DatosPagoRecibido {
  colegio: string;
  concepto: string;
  estudiante: string;
  monto: string;
  telefonoColegio: string;
  /** El enlace de ESA factura (`/pagar/{token}?f={id}`). */
  enlace: string;
}

/**
 * Los valores de `{{1}}`…`{{6}}` de `pago_recibido`, en orden.
 *
 * Pura y con su test porque Meta rellena por POSICIÓN: un valor corrido no da
 * error, manda un mensaje que dice otra cosa.
 */
export function parametrosPagoRecibido(d: DatosPagoRecibido): string[] {
  const limpio = (v: string | null | undefined, respaldo: string) =>
    String(v ?? '').replace(/\s+/g, ' ').trim() || respaldo;
  return [
    limpio(d.colegio, 'tu colegio'),
    limpio(d.concepto, 'un cargo'),
    limpio(d.estudiante, 'tu hijo(a)'),
    limpio(d.monto, 'el monto pagado'),
    limpio(d.telefonoColegio, 'el número del colegio'),
    limpio(d.enlace, ''),
  ];
}

export type ResultadoWhatsAppPago =
  | { enviado: true; destino: string }
  | {
      enviado: false;
      motivo: 'no-escolar' | 'sin-celular' | 'sin-plantilla' | 'sin-cuota' | 'ya-enviado' | 'sin-pago' | 'error';
      detalle?: string;
    };

/**
 * Le escribe al responsable por WhatsApp que su pago llegó, con el enlace a su
 * factura.
 *
 * Sale por PLANTILLA: quien acaba de pagar puede llevar semanas sin escribir, y
 * fuera de las 24 h el texto libre no pasa. Si `pago_recibido` no está
 * publicada y aprobada, no se manda nada — nunca se cae a texto libre, que
 * fallaría justo cuando más falta hace.
 *
 * Respeta lo que ya respetan los avisos: cuenta en la cuota mensual de WhatsApp
 * del plan, queda anotado en `admin_escolar_avisos_enviados` y no se repite.
 */
export async function enviarPagoRecibidoPorWhatsApp(
  teamId: number,
  ecfDocumentId: number,
): Promise<ResultadoWhatsAppPago> {
  try {
    if (!(await teamHasModule(teamId, 'escolar'))) return { enviado: false, motivo: 'no-escolar' };

    const cargos = await db
      .select({
        cargoId: adminEscolarCargos.id,
        concepto: adminEscolarConceptosPago.nombre,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        clientId: clients.id,
        whatsapp: clients.whatsapp,
        celular: clients.celular,
      })
      .from(adminEscolarCargos)
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
      .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
      .leftJoin(clients, eq(clients.id, adminEscolarEstudiantes.facturarAClientId))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.ecfDocumentId, ecfDocumentId),
      ))
      .orderBy(asc(adminEscolarCargos.id));
    if (cargos.length === 0) return { enviado: false, motivo: 'no-escolar' };

    // Un hermano puede no tener responsable asignado: vale el primero que sí.
    const resp = cargos.find((c) => c.clientId != null);
    const destino = aE164(resp?.whatsapp ?? resp?.celular);
    if (!resp || !destino) return { enviado: false, motivo: 'sin-celular' };

    const [plantilla] = await db
      .select({
        nombre: whatsappPlantillas.nombre,
        idioma: whatsappPlantillas.idioma,
        metaEstado: whatsappPlantillas.metaEstado,
        borrador: whatsappPlantillas.borrador,
      })
      .from(whatsappPlantillas)
      .where(eq(whatsappPlantillas.nombre, PLANTILLA_PAGO_RECIBIDO))
      .limit(1);
    if (!plantilla || plantilla.borrador || !/^approved$/i.test(plantilla.metaEstado ?? '')) {
      return { enviado: false, motivo: 'sin-plantilla' };
    }

    const cuota = await cuotaAvisos(teamId);
    if (cuota.restante.whatsapp <= 0) return { enviado: false, motivo: 'sin-cuota' };

    const pagos = await db
      .select({ id: pagosRecibidos.id, monto: pagosRecibidos.montoCentavos })
      .from(pagosRecibidos)
      .where(and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, ecfDocumentId)))
      .orderBy(desc(pagosRecibidos.id));
    if (pagos.length === 0) return { enviado: false, motivo: 'sin-pago' };

    const [colegio] = await db
      .select({ nombre: teams.name, telefono: teams.telefono })
      .from(teams).where(eq(teams.id, teamId)).limit(1);

    const enlace = urlDeFacturaEnLink(
      urlDelLink((await getOCrearLink(teamId, resp.clientId!)).token),
      ecfDocumentId,
    );
    const parametros = parametrosPagoRecibido({
      colegio: colegio?.nombre ?? '',
      concepto: unirNombres(cargos.map((c) => c.concepto)),
      estudiante: unirNombres(cargos.map((c) => `${c.nombres} ${c.apellidos ?? ''}`)),
      monto: pesos(pagos[0].monto),
      telefonoColegio: colegio?.telefono ?? '',
      enlace,
    });

    // Se reserva ANTES de mandar, igual que los avisos: dos callbacks a la vez
    // no pueden mandar dos mensajes. El «offset» es el número de pago, así que
    // un segundo abono a la misma factura sí tiene su propio mensaje.
    const [reserva] = await db
      .insert(adminEscolarAvisosEnviados)
      .values({
        teamId,
        cargoId: cargos[0].cargoId,
        tipo: 'pago-recibido',
        offsetDias: Math.min(pagos.length, 32000),
        canal: 'whatsapp',
        destino,
        detalle: parametros[1].slice(0, 200),
      })
      .onConflictDoNothing()
      .returning({ id: adminEscolarAvisosEnviados.id });
    if (!reserva) return { enviado: false, motivo: 'ya-enviado' };

    try {
      // Import perezoso, igual que el correo: no carga el cliente de WhatsApp
      // en quien solo importa este módulo.
      const { enviarWhatsAppPlantilla } = await import('@/lib/whatsapp/enviar');
      const r = await enviarWhatsAppPlantilla(teamId, destino, {
        nombre: plantilla.nombre,
        idioma: plantilla.idioma,
        parametros,
      });
      if (r.messageId) {
        await db.update(adminEscolarAvisosEnviados)
          .set({ mensajeId: r.messageId })
          .where(eq(adminEscolarAvisosEnviados.id, reserva.id));
      }
      return { enviado: true, destino };
    } catch (e) {
      // Se suelta la reserva: un fallo pasajero no debe dejar al padre sin su
      // mensaje para siempre ni gastarle la cuota.
      await db.delete(adminEscolarAvisosEnviados).where(eq(adminEscolarAvisosEnviados.id, reserva.id));
      throw e;
    }
  } catch (e) {
    console.error('[factura-al-padre] no se pudo mandar el WhatsApp de pago:', e);
    return { enviado: false, motivo: 'error', detalle: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Para los puntos de pago: manda el correo Y el WhatsApp sin hacer esperar la
 * respuesta ni poder romperla. Son independientes: que falle uno no impide el
 * otro. El resultado solo se anota.
 */
export function enviarFacturaAlResponsableEnSegundoPlano(teamId: number, ecfDocumentId: number): void {
  void enviarFacturaAlResponsable(teamId, ecfDocumentId).then((r) => {
    if (!r.enviado && r.motivo !== 'no-escolar') {
      console.warn(`[factura-al-padre] factura ${ecfDocumentId} no enviada: ${r.motivo}${r.detalle ? ` (${r.detalle})` : ''}`);
    }
  });
  void enviarPagoRecibidoPorWhatsApp(teamId, ecfDocumentId).then((r) => {
    // `sin-plantilla` es lo esperado hasta que Meta apruebe `pago_recibido`:
    // no es un problema y avisar de él en cada pago ensucia el log.
    const callado = r.enviado || r.motivo === 'no-escolar' || r.motivo === 'sin-plantilla'
      || r.motivo === 'sin-celular' || r.motivo === 'ya-enviado';
    if (!callado) {
      console.warn(`[factura-al-padre] WhatsApp de la factura ${ecfDocumentId} no enviado: ${r.motivo}${r.detalle ? ` (${r.detalle})` : ''}`);
    }
  });
}
