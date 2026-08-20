/**
 * Generación de PDFs (factura e-CF y cotización) como funciones de servidor.
 *
 * Vive aparte de las rutas `/api/pdf/*` para que quien necesite el PDF en el
 * servidor —el envío por email, por ejemplo— lo genere llamando directo, sin
 * un fetch HTTP a la propia app. Ese salto por red dependía de
 * NEXT_PUBLIC_APP_URL y perdía la cookie de sesión en cualquier redirect
 * cross-origin, así que el PDF volvía 401 y el correo nunca se enviaba.
 *
 * Todas las funciones reciben el `teamId` ya resuelto: el scoping por equipo es
 * responsabilidad de quien llama (la ruta o el guard de permisos).
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import QRCode from 'qrcode';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  ecfDocuments,
  teams,
  clients,
  pagosRecibidos,
  users,
  cotizaciones,
} from '@/lib/db/schema';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';
import { FacturaTirillaPDF } from '@/lib/pdf/FacturaTirillaPDF';
import { CotizacionPDF, type CotizacionPDFData } from '@/lib/pdf/CotizacionPDF';
import { extraerItems } from '@/lib/pdf/extraerItems';
import { emision, EcfApiError } from '@/lib/ecf-api/client';
import type { EmisorEmail } from '@/lib/email';

export type FormatoFacturaPdf = 'grande' | 'tirilla';

/** Datos de marca del emisor — los usa el correo al cliente. */
function emisorDeTeam(team: typeof teams.$inferSelect): EmisorEmail {
  return {
    razonSocial:      team.razonSocial ?? team.name,
    nombreComercial:  team.nombreComercial,
    rnc:              team.rnc,
    direccion:        team.direccion,
    telefono:         team.telefono,
    sitioWeb:         team.sitioWeb,
    emailFacturacion: team.emailFacturacion,
    logo:             team.logo,
    colorPrimario:    team.colorPrimario ?? '#1e40af',
  };
}

/**
 * Extrae la fecha/hora de firma del XML firmado.
 * Busca `<SigningTime>` (XMLDSig estándar) o el `FechaFirma` en el cuerpo del e-CF.
 * Devuelve formato legible "DD/MM/YYYY HH:mm" — o null si no se encuentra.
 */
function extraerFechaFirma(xmlFirmado: string | null): string | null {
  if (!xmlFirmado) return null;
  // Intentar <SigningTime> del bloque XMLDSig
  const m1 = xmlFirmado.match(/<SigningTime[^>]*>([^<]+)<\/SigningTime>/i);
  // O <FechaFirma> que algunos formatos DGII incluyen
  const m2 = xmlFirmado.match(/<FechaFirma[^>]*>([^<]+)<\/FechaFirma>/i);
  const iso = (m1?.[1] ?? m2?.[1] ?? '').trim();
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // devolver el raw si no parsea
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante Electrónico de Compras',
  '43': 'Comprobante Electrónico para Gastos Menores',
  '44': 'Comprobante Electrónico para Regímenes Especiales',
  '45': 'Comprobante Electrónico Gubernamental',
  '46': 'Comprobante Electrónico para Exportaciones',
  '47': 'Comprobante Electrónico para Pagos al Exterior',
  'sin-ncf': 'Factura',
};

const TIPO_PAGO_NOMBRE: Record<number, string> = {
  1: 'Contado',
  2: 'Crédito',
  3: 'Gratuito',
  4: 'Uso o Consumo',
};

export type FacturaPdfResult = {
  buffer:   Buffer;
  filename: string;
  encf:     string;
  codigo:   string | null;
  emisor:   EmisorEmail;
  /** Lo mismo que ve el cliente en el PDF, para no recalcularlo en el correo. */
  resumen: {
    fechaEmision:  string;
    clienteNombre: string | null;
    montoTotalCts: number;
    saldoCts:      number;
  };
};

/**
 * Genera el PDF de un e-CF del equipo indicado.
 *
 * El documento se ubica por `docId` (numérico) o por `codigo` (F-YYYY-NNNNNN);
 * el código no es único global, pero el lookup va scopeado por teamId.
 * Devuelve `null` si el documento no existe o no pertenece al equipo.
 */
export async function generarFacturaPdf(opts: {
  teamId:   number;
  docId?:   number | null;
  codigo?:  string | null;
  formato?: FormatoFacturaPdf;
}): Promise<FacturaPdfResult | null> {
  const { teamId, docId: docIdParam = null, codigo: codigoParam = null } = opts;
  const formato = opts.formato ?? 'grande';

  if (docIdParam == null && codigoParam == null) return null;

  const [row] = await db
    .select({ doc: ecfDocuments, team: teams })
    .from(ecfDocuments)
    .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
    .where(
      and(
        codigoParam != null
          ? eq(ecfDocuments.codigo, codigoParam)
          : eq(ecfDocuments.id, docIdParam!),
        eq(ecfDocuments.teamId, teamId)
      )
    )
    .limit(1);

  if (!row) return null;

  const { doc, team } = row;
  // ID real del doc (para las queries de pagos que siguen)
  const docId = doc.id;

  // Saldo real desde ledger pagos_recibidos (source of truth).
  // Fallback al campo inline legacy si el ledger está vacío (docs pre-migración).
  const [pagAgg] = await db
    .select({ sum: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, docId));
  const sumLedger = Number(pagAgg?.sum ?? 0);
  const inlineCts = doc.pagoRecibido === 'true' ? (doc.pagoValorCts ?? 0) : 0;
  const pagadoCts = sumLedger > 0 ? sumLedger : inlineCts;
  const saldoCts  = Math.max(0, doc.montoTotal - pagadoCts);

  // Pagos del ledger (cada uno con fecha + usuario) para el historial en el PDF.
  const pagosRows = await db
    .select({
      metodo:        pagosRecibidos.metodo,
      montoCentavos: pagosRecibidos.montoCentavos,
      fechaPago:     pagosRecibidos.fechaPago,
      referencia:    pagosRecibidos.referencia,
      notas:         pagosRecibidos.notas,
      usuarioName:   users.name,
      usuarioEmail:  users.email,
    })
    .from(pagosRecibidos)
    .leftJoin(users, eq(pagosRecibidos.createdBy, users.id))
    .where(eq(pagosRecibidos.ecfDocumentId, docId))
    .orderBy(pagosRecibidos.fechaPago, pagosRecibidos.id);

  // Cargar teléfono del cliente si existe referencia
  let telefonoComprador: string | undefined;
  if (doc.clientId) {
    const [cl] = await db
      .select({ telefono: clients.telefono })
      .from(clients)
      .where(eq(clients.id, doc.clientId))
      .limit(1);
    telefonoComprador = cl?.telefono ?? undefined;
  }

  // ── Relación con la mora ────────────────────────────────────────────────
  // Si el doc ES una ND de mora → referencia a su factura padre, para que el
  // PDF diga a qué factura corresponde. Si es una factura → lista sus notas de
  // mora, que es lo que explica por qué el cliente debe más que el total.
  let moraOrigen: FacturaPDFData['moraOrigen'];
  let moras: FacturaPDFData['moras'];
  if (doc.moraOrigenId != null) {
    const [padre] = await db
      .select({ codigo: ecfDocuments.codigo, encf: ecfDocuments.encf, fechaEmision: ecfDocuments.fechaEmision })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, doc.moraOrigenId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);
    if (padre) {
      moraOrigen = {
        codigo: padre.codigo ?? undefined,
        encf:   padre.encf && !padre.encf.startsWith('BOR-') ? padre.encf : undefined,
        fecha:  padre.fechaEmision ? new Date(padre.fechaEmision).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined,
      };
    }
  } else {
    const ndRows = await db
      .select({
        id:           ecfDocuments.id,
        codigo:       ecfDocuments.codigo,
        encf:         ecfDocuments.encf,
        montoTotal:   ecfDocuments.montoTotal,
        fechaEmision: ecfDocuments.fechaEmision,
        pagado: sql<number>`coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
        ), 0)`,
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.moraOrigenId, docId),
        eq(ecfDocuments.teamId, teamId),
        ne(ecfDocuments.estado, 'ANULADO'),
      ))
      .orderBy(ecfDocuments.id);
    if (ndRows.length > 0) {
      moras = ndRows.map(nd => {
        const pagadoNd = Number(nd.pagado);
        const saldoNd  = Math.max(0, nd.montoTotal - pagadoNd);
        const estadoNd: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' =
          saldoNd <= 0 ? 'PAGADA' : pagadoNd > 0 ? 'PARCIAL' : 'PENDIENTE';
        return {
          codigo:   nd.codigo ?? undefined,
          encf:     nd.encf && !nd.encf.startsWith('BOR-') ? nd.encf : undefined,
          fecha:    nd.fechaEmision ? new Date(nd.fechaEmision).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined,
          montoDOP: nd.montoTotal / 100,
          saldoDOP: saldoNd / 100,
          estado:   estadoNd,
        };
      });
    }
  }

  // QR URL DGII — viene tal cual desde ecf-api (doc.urlVerificacion).
  // No reconstruimos client-side: ecf-api ya devuelve la URL canónica firmada.
  // Fallback legacy: facturas emitidas antes de persistir urlVerificacion → re-fetch
  // desde ecf-api usando ecfApiEmisionId y backfill en BD.
  let urlVerificacion = doc.urlVerificacion;
  let codigoSeguridad = doc.codigoSeguridad;
  let fechaFirma      = doc.fechaFirma;

  if (!urlVerificacion && doc.ecfApiEmisionId) {
    try {
      const remoto = await emision.get(doc.ecfApiEmisionId);
      const urlRemota = remoto.urlVerificacion ?? remoto.qrCodeData ?? null;
      const codRemoto = remoto.codigoSeguridad ?? null;
      const firmaRemota = remoto.fechaHoraFirma ?? null;

      if (urlRemota || codRemoto || firmaRemota) {
        urlVerificacion = urlRemota ?? urlVerificacion;
        codigoSeguridad = codRemoto ?? codigoSeguridad;
        fechaFirma      = firmaRemota ?? fechaFirma;

        // Backfill BD (best-effort, no bloquea respuesta)
        await db
          .update(ecfDocuments)
          .set({
            urlVerificacion: urlVerificacion ?? null,
            codigoSeguridad: codigoSeguridad ?? null,
            fechaFirma:      fechaFirma ?? null,
            updatedAt:       new Date(),
          })
          .where(eq(ecfDocuments.id, docId));
      }
    } catch (err) {
      if (err instanceof EcfApiError) {
        console.warn('[PDF] ecf-api fetch fallback fallo:', err.status, err.message);
      } else {
        console.warn('[PDF] fallback ecf-api err:', err);
      }
    }
  }

  const qrText = urlVerificacion ?? '';
  const qrDataUrl = qrText
    ? await QRCode.toDataURL(qrText, {
        width: 128,
        margin: 1,
        errorCorrectionLevel: 'M',
      })
    : undefined;

  // Montos en centavos → DOP (el PDF espera valores en pesos, no centavos)
  const montoTotalDOP  = doc.montoTotal / 100;
  const totalItbisDOP  = doc.totalItbis / 100;
  const subtotalDOP    = montoTotalDOP - totalItbisDOP;

  // Extraer ítems reales desde lineasJson (prioridad) o xmlOriginal.
  const items = extraerItems(doc.xmlOriginal, doc.lineasJson) ?? [
    {
      nombreItem:          doc.razonSocialComprador
        ? `Factura a ${doc.razonSocialComprador}`
        : 'Servicios / Productos',
      cantidadItem:        1,
      precioUnitarioItem:  subtotalDOP,
      subtotalConItbis:    montoTotalDOP,
      tasaItbis:           totalItbisDOP > 0 ? totalItbisDOP / subtotalDOP : undefined,
    },
  ];

  const pdfData: FacturaPDFData = {
    encf:          doc.encf,
    codigo:        doc.codigo ?? undefined,
    tipoEcf:       doc.tipoEcf,
    tipoEcfNombre: TIPO_NOMBRE[doc.tipoEcf] ?? `Tipo ${doc.tipoEcf}`,
    fechaEmision:  new Date(doc.fechaEmision).toLocaleDateString('es-DO', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    tipoPagoNombre: TIPO_PAGO_NOMBRE[1] ?? 'Contado',
    estado:        doc.estado,
    // B3 fix: solo watermark BORRADOR si no tiene pago registrado.
    // Factura sin NCF pero con pago = documento final, no borrador real.
    esBorrador:    doc.estado === 'BORRADOR' && pagadoCts === 0,
    codigoSeguridad: codigoSeguridad ?? undefined,
    trackId:       doc.trackId ?? undefined,
    // Prefer columna persistida (rápido). Fallback: parsear XML firmado.
    fechaFirma:    fechaFirma ?? extraerFechaFirma(doc.xmlFirmado) ?? undefined,
    moneda:        'DOP',

    emisor: {
      razonSocial:      team.razonSocial ?? team.name,
      nombreComercial:  team.nombreComercial ?? undefined,
      rnc:              team.rnc ?? '',
      direccion:        team.direccion ?? undefined,
      telefono:         team.telefono ?? undefined,
      sitioWeb:         team.sitioWeb ?? undefined,
      emailFacturacion: team.emailFacturacion ?? undefined,
      logo:             team.logo ?? undefined,
      colorPrimario:    team.colorPrimario ?? '#1e40af',
    },

    comprador: {
      razonSocial: doc.razonSocialComprador ?? undefined,
      rnc:         doc.rncComprador ?? undefined,
      email:       doc.emailComprador ?? undefined,
      telefono:    telefonoComprador,
    },

    items,
    subtotal:    subtotalDOP,
    totalItbis:  totalItbisDOP,
    montoTotal:  montoTotalDOP,
    saldo:       saldoCts / 100,  // B2 fix: saldo real (0 si pagada)
    pagos: pagosRows.map(p => ({
      metodo:   p.metodo,
      montoDOP: p.montoCentavos / 100,
      fecha:    p.fechaPago,
      usuario:  p.usuarioName ?? p.usuarioEmail ?? undefined,
      nota:     p.notas ?? undefined,
      referencia: p.referencia ?? undefined,
    })),
    qrDataUrl,
    pieFactura:          doc.pieFactura ?? undefined,
    terminosCondiciones: doc.terminosCondiciones ?? undefined,
    notas:               doc.notas ?? undefined,
    dependienteNombre:   doc.dependienteNombre ?? undefined,
    moraOrigen,
    moras,
  };

  // Renderizar PDF — cast necesario por incompatibilidad de tipos con react-pdf
  const Component = formato === 'tirilla' ? FacturaTirillaPDF : FacturaPDF;
  const buffer = await renderToBuffer(
    createElement(Component, { data: pdfData }) as any
  );

  // Nombre del archivo = código de factura (F-YYYY-NNNNNN); fallback al encf.
  const nombreBase = doc.codigo ?? doc.encf;
  const filename = formato === 'tirilla'
    ? `factura-${nombreBase}-tirilla.pdf`
    : `factura-${nombreBase}.pdf`;

  return {
    buffer,
    filename,
    encf:   doc.encf,
    codigo: doc.codigo ?? null,
    emisor: emisorDeTeam(team),
    resumen: {
      fechaEmision:  pdfData.fechaEmision,
      clienteNombre: doc.razonSocialComprador ?? null,
      montoTotalCts: doc.montoTotal,
      saldoCts:      saldoCts,
    },
  };
}

export type CotizacionPdfResult = {
  buffer:   Buffer;
  filename: string;
  numero:   string;
  emisor:   EmisorEmail;
  resumen: {
    fechaEmision:     string;
    fechaVencimiento: string | null;
    clienteNombre:    string | null;
    montoTotalCts:    number;
  };
};

/**
 * Genera el PDF de una cotización del equipo indicado.
 * Devuelve `null` si no existe o no pertenece al equipo.
 */
export async function generarCotizacionPdf(opts: {
  teamId: number;
  cotId:  number;
}): Promise<CotizacionPdfResult | null> {
  const { teamId, cotId } = opts;

  const [row] = await db
    .select({ cot: cotizaciones, team: teams })
    .from(cotizaciones)
    .innerJoin(teams, eq(teams.id, cotizaciones.teamId))
    .where(and(eq(cotizaciones.id, cotId), eq(cotizaciones.teamId, teamId)))
    .limit(1);

  if (!row) return null;

  const { cot, team } = row;

  // Parsear ítems
  // Soporta el shape rico (ItemLinea, cotizaciones nuevas) y el viejo.
  let parsedItems: Array<Record<string, unknown>> = [];
  try {
    if (cot.items) parsedItems = JSON.parse(cot.items);
  } catch { /* ignore */ }

  const items = parsedItems.map(it => {
    const descripcion = String((it.nombreItem ?? it.descripcion) ?? '');
    const precio      = Number(it.precioUnitarioItem ?? it.precio ?? 0);
    const cantidad    = Number(it.cantidadItem ?? it.cantidad ?? 1);
    return {
      descripcion,
      precio,
      cantidad,
      total:       precio * cantidad,
      dependienteNombre: String(it.dependienteNombre ?? '') || null,
    };
  });

  const montoTotalDOP = cot.montoTotal / 100;
  const subtotalDOP   = cot.montoSubtotal / 100;

  const pdfData: CotizacionPDFData = {
    numero:    cot.numero,
    estado:    cot.estado,
    fechaEmision: new Date(cot.fechaEmision).toLocaleDateString('es-DO', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    fechaVencimiento: cot.fechaVencimiento
      ? new Date(cot.fechaVencimiento).toLocaleDateString('es-DO', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      : undefined,
    emisor: {
      razonSocial:      team.razonSocial ?? team.name,
      nombreComercial:  team.nombreComercial ?? undefined,
      rnc:              team.rnc ?? undefined,
      direccion:        team.direccion ?? undefined,
      telefono:         team.telefono ?? undefined,
      sitioWeb:         team.sitioWeb ?? undefined,
      emailFacturacion: team.emailFacturacion ?? undefined,
      logo:             team.logo ?? undefined,
      colorPrimario:    team.colorPrimario ?? '#1e40af',
    },
    comprador: {
      razonSocial: cot.razonSocialComprador ?? undefined,
      rnc:         cot.rncComprador ?? undefined,
      email:       cot.emailComprador ?? undefined,
    },
    items,
    subtotal:   subtotalDOP,
    montoTotal: montoTotalDOP,
    notas:               cot.notas,
    terminosCondiciones: cot.terminosCondiciones,
  };

  const buffer = await renderToBuffer(
    createElement(CotizacionPDF, { data: pdfData }) as any
  );

  return {
    buffer,
    filename: `cotizacion-${cot.numero}.pdf`,
    numero:   cot.numero,
    emisor:   emisorDeTeam(team),
    resumen: {
      fechaEmision:     pdfData.fechaEmision,
      fechaVencimiento: pdfData.fechaVencimiento ?? null,
      clienteNombre:    cot.razonSocialComprador ?? null,
      montoTotalCts:    cot.montoTotal,
    },
  };
}
