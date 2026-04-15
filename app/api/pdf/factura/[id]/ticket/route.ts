/**
 * GET /api/pdf/factura/[id]/ticket
 * Devuelve una página HTML optimizada para impresión en papel térmico 80mm.
 * Muestra el recibo en pantalla y permite imprimir con window.print().
 */
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte centavos a pesos RD con 2 decimales, sin símbolo */
function fmt(cents: number): string {
  return (cents / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formato de fecha: DD/MM/YY HH:MM:SS */
function fmtDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Fecha corta: DD/MM/YYYY */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Calcula la fecha límite del e-NCF (último día del año de la secuencia) */
function validoHasta(encf: string): string {
  // El e-NCF tiene el año en los primeros dígitos de la parte numérica: E310000000001
  // La DGII emite secuencias por año, usamos el año actual del documento
  const now = new Date();
  return `31/12/${now.getFullYear()}`;
}

/** Nombre amigable del tipo de e-CF */
const TIPO_NOMBRE: Record<string, string> = {
  '31': 'CREDITO FISCAL',
  '32': 'CONSUMO',
  '33': 'NOTA DE DEBITO',
  '34': 'NOTA DE CREDITO',
  '41': 'COMPRAS',
  '43': 'GASTOS MENORES',
  '44': 'REGIMENES ESPECIALES',
  '45': 'GUBERNAMENTAL',
  '46': 'EXPORTACIONES',
  '47': 'PAGOS AL EXTERIOR',
};

/** Nombre completo del tipo para el banner central */
const TIPO_BANNER: Record<string, string> = {
  '31': 'FACTURA DE CREDITO\n    FISCAL ELECTRONICO',
  '32': 'FACTURA DE CONSUMO\n      ELECTRONICA',
  '33': 'NOTA DE DEBITO\n    ELECTRONICA',
  '34': 'NOTA DE CREDITO\n    ELECTRONICA',
  '41': 'COMPROBANTE DE\n       COMPRAS',
  '43': 'GASTOS MENORES',
  '44': 'REGIMENES ESPECIALES',
  '45': 'GUBERNAMENTAL',
};

/** Nombre del método de pago */
const METODO_PAGO: Record<string, string> = {
  efectivo: 'EFECTIVO',
  tarjeta: 'TARJETA',
  transferencia: 'TRANSFERENCIA',
  cheque: 'CHEQUE',
  credito: 'CREDITO',
  otro: 'OTRO',
};

// ─── XML Item Parsing ─────────────────────────────────────────────────────────

interface ItemLine {
  nombre: string;
  cantidad: number;
  precioUnitario: number; // centavos
  montoItem: number;      // centavos (total de la línea)
  montoItbis: number;     // centavos
}

/**
 * Extrae las líneas de detalle del xmlOriginal usando regex.
 * Si no hay XML o falla, retorna array vacío.
 */
function parseItemsFromXml(xml: string | null): ItemLine[] {
  if (!xml) return [];

  try {
    const items: ItemLine[] = [];
    // Extraer bloques <DetallesItem>...</DetallesItem>
    const blockRe = /<DetallesItem>([\s\S]*?)<\/DetallesItem>/gi;
    let block: RegExpExecArray | null;

    while ((block = blockRe.exec(xml)) !== null) {
      const chunk = block[1];

      const get = (tag: string): string => {
        const m = new RegExp(`<${tag}>([^<]*)<\/${tag}>`, 'i').exec(chunk);
        return m ? m[1].trim() : '';
      };

      const nombre = get('NombreItem') || get('DescripcionItem') || 'Item';
      const cantidad = parseFloat(get('CantidadItem') || '1') || 1;
      // Precios en el XML ya vienen en pesos (no centavos)
      const precioUnitarioPesos = parseFloat(get('PrecioUnitarioItem') || '0');
      const montoItemPesos = parseFloat(get('MontoItem') || '0');
      const montoItbisPesos = parseFloat(get('MontoITBIS') || get('ITBIS') || '0');

      items.push({
        nombre,
        cantidad,
        precioUnitario: Math.round(precioUnitarioPesos * 100),
        montoItem: Math.round(montoItemPesos * 100),
        montoItbis: Math.round(montoItbisPesos * 100),
      });
    }

    return items;
  } catch {
    return [];
  }
}

// ─── HTML Builder ─────────────────────────────────────────────────────────────

/** Genera una fila de texto monospace alineado: izquierda y derecha en 32 chars */
function row(left: string, right: string, width = 32): string {
  const space = width - left.length - right.length;
  return left + (space > 0 ? ' '.repeat(space) : ' ') + right;
}

/** Genera el HTML completo del ticket */
function buildTicketHtml(params: {
  doc: {
    encf: string;
    tipoEcf: string;
    estado: string;
    trackId: string | null;
    codigoSeguridad: string | null;
    rncComprador: string | null;
    razonSocialComprador: string | null;
    emailComprador: string | null;
    montoTotal: number;
    totalItbis: number;
    totalRetenciones: number;
    pagoRecibido: string | null;
    pagoMetodo: string | null;
    pagoValorCts: number | null;
    notas: string | null;
    pieFactura: string | null;
    fechaEmision: Date;
    xmlOriginal: string | null;
  };
  team: {
    razonSocial: string | null;
    nombreComercial: string | null;
    rnc: string | null;
    direccion: string | null;
    telefono: string | null;
    name: string;
  };
}): string {
  const { doc, team } = params;

  const nombreEmpresa = team.razonSocial || team.name;
  const tagline = team.nombreComercial || '';
  const rnc = team.rnc || '';
  const direccion = team.direccion || '';
  const telefono = team.telefono || '';

  const fechaHora = fmtDatetime(doc.fechaEmision);
  const fechaFirma = fmtDate(doc.fechaEmision);
  const validoH = validoHasta(doc.encf);

  const tipoBanner = TIPO_BANNER[doc.tipoEcf] ?? `FACTURA ELECTRONICA\n   TIPO ${doc.tipoEcf}`;
  const bannerLines = tipoBanner.split('\n');

  // Items del XML
  const items = parseItemsFromXml(doc.xmlOriginal);
  const hasItems = items.length > 0;

  // Pago
  const pagoMetodoStr = doc.pagoMetodo
    ? (METODO_PAGO[doc.pagoMetodo.toLowerCase()] ?? doc.pagoMetodo.toUpperCase())
    : 'CONTADO';
  const pagado = doc.pagoRecibido === 'true' && (doc.pagoValorCts ?? 0) > 0;
  const pagoValor = doc.pagoValorCts ?? 0;
  const cambio = pagoValor > doc.montoTotal ? pagoValor - doc.montoTotal : 0;

  // QR — usa el trackId de la DGII o el e-NCF
  const qrData = doc.trackId
    ? `https://dgii.gov.do/e-CF?trackid=${doc.trackId}`
    : `https://dgii.gov.do/e-CF?encf=${doc.encf}&rnc=${rnc}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=2&data=${encodeURIComponent(qrData)}`;

  const DASH = '--------------------------------';

  // Construir líneas de items HTML
  let itemsHtml = '';
  if (hasItems) {
    for (const item of items) {
      const qtyLine = `${item.cantidad} x ${fmt(item.precioUnitario)}`;
      const itbisStr = fmt(item.montoItbis);
      const totalStr = fmt(item.montoItem);
      // Nombre con ITBIS y VALOR al final
      const nameRight = `${itbisStr.padStart(6)} ${totalStr.padStart(8)}`;
      const nameLeft = item.nombre.substring(0, 32 - nameRight.length - 1);
      itemsHtml += `
        <div class="line muted">${qtyLine}</div>
        <div class="line">${nameLeft.padEnd(32 - nameRight.length)}${nameRight}</div>`;
    }
  } else {
    itemsHtml = `<div class="line muted">  Ver detalle completo en PDF</div>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ticket ${doc.encf}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Screen: center on gray background ── */
    body {
      background: #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px 48px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      color: #111;
    }

    /* ── Print button (hidden on print) ── */
    .print-btn {
      margin-bottom: 16px;
      padding: 8px 20px;
      background: #1e40af;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
    }
    .print-btn:hover { background: #1e3a8a; }

    /* ── Ticket card (screen) ── */
    .ticket {
      background: #fff;
      width: 72mm;
      padding: 4mm 3mm;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }

    /* ── Print overrides ── */
    @media print {
      @page {
        size: 80mm auto;
        margin: 2mm 3mm;
      }
      body {
        background: none;
        padding: 0;
        display: block;
      }
      .print-btn { display: none; }
      .ticket {
        width: 100%;
        padding: 0;
        box-shadow: none;
        page-break-inside: avoid;
      }
    }

    /* ── Typography ── */
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .large   { font-size: 14px; }
    .medium  { font-size: 11px; }
    .muted   { color: #555; }
    .line    { white-space: pre; line-height: 1.45; font-family: 'Courier New', Courier, monospace; font-size: 10px; }
    .dash    { border: none; border-top: 1px dashed #555; margin: 3px 0; }
    .spacer  { height: 3px; }

    /* ── Header ── */
    .header  { text-align: center; margin-bottom: 4px; }
    .company { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
    .tagline { font-size: 10px; margin-top: 1px; }
    .address { font-size: 9px; color: #444; margin-top: 1px; }

    /* ── Banner center ── */
    .banner  { text-align: center; font-weight: bold; font-size: 10px; margin: 2px 0; line-height: 1.5; }

    /* ── Table header ── */
    .tbl-hdr { display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 2px; font-size: 9px; }
    .col-desc { flex: 1; }
    .col-itbis { width: 32px; text-align: right; }
    .col-valor { width: 44px; text-align: right; }

    /* ── Totals ── */
    .total-row { display: flex; justify-content: space-between; font-size: 10px; margin: 1px 0; }
    .total-row.big { font-weight: bold; font-size: 11px; margin-top: 3px; }

    /* ── QR ── */
    .qr-wrap { text-align: center; margin: 6px 0 2px; }
    .qr-wrap img { width: 28mm; height: 28mm; display: block; margin: 0 auto; image-rendering: pixelated; }

    /* ── Estado badge ── */
    .estado  { display: inline-block; font-size: 9px; font-weight: bold; padding: 1px 4px; border: 1px solid #333; margin-top: 2px; }
    .estado.aceptado { border-color: #16a34a; color: #16a34a; }
    .estado.rechazado { border-color: #dc2626; color: #dc2626; }
    .estado.pendiente { border-color: #d97706; color: #d97706; }
  </style>
</head>
<body>

  <button class="print-btn" onclick="window.print()">&#x1F5A8;&#xFE0F; Imprimir</button>

  <div class="ticket">

    <!-- HEADER -->
    <div class="header">
      <div class="company">${escHtml(nombreEmpresa)}</div>
      ${tagline ? `<div class="tagline">${escHtml(tagline)}</div>` : ''}
      ${direccion ? `<div class="address">${escHtml(direccion)}</div>` : ''}
      ${telefono ? `<div class="address">Tel: ${escHtml(telefono)}</div>` : ''}
    </div>

    <hr class="dash" />

    <!-- INFO EMISOR -->
    <div class="line">${escHtml(nombreEmpresa.toUpperCase().substring(0, 32))}</div>
    <div class="line">RNC: ${escHtml(rnc)}</div>
    <div class="line">${escHtml(fechaHora)}</div>
    <div class="line">e-NCF: ${escHtml(doc.encf)}</div>
    <div class="line">VALIDO HASTA: ${escHtml(validoH)}</div>

    ${doc.rncComprador ? `<div class="line">RNC: ${escHtml(doc.rncComprador)}</div>` : ''}
    ${doc.razonSocialComprador ? `<div class="line">${escHtml(doc.razonSocialComprador.substring(0, 32))}</div>` : ''}

    <hr class="dash" />

    <!-- BANNER TIPO -->
    <div class="banner">${bannerLines.map(l => escHtml(l)).join('<br/>')}</div>

    <hr class="dash" />

    <!-- ITEMS HEADER -->
    <div class="tbl-hdr">
      <span class="col-desc">DESCRIPCION</span>
      <span class="col-itbis">ITBIS</span>
      <span class="col-valor">VALOR</span>
    </div>
    <hr class="dash" />

    <!-- ITEMS -->
    ${itemsHtml}

    <hr class="dash" />

    <!-- TOTALES -->
    ${doc.totalItbis > 0 ? `
    <div class="total-row">
      <span>SUBTOTAL</span>
      <span>${fmt(doc.montoTotal - doc.totalItbis)}</span>
    </div>
    <div class="total-row">
      <span>ITBIS (18%)</span>
      <span>${fmt(doc.totalItbis)}</span>
    </div>` : ''}
    ${doc.totalRetenciones > 0 ? `
    <div class="total-row">
      <span>RETENCIONES</span>
      <span>-${fmt(doc.totalRetenciones)}</span>
    </div>` : ''}
    <div class="total-row big">
      <span>TOTAL A PAGAR</span>
      <span>${fmt(doc.montoTotal)}</span>
    </div>

    ${pagado ? `
    <hr class="dash" />
    <div class="total-row">
      <span>${escHtml(pagoMetodoStr)}</span>
      <span>${fmt(pagoValor)}</span>
    </div>
    ${cambio > 0 ? `
    <div class="total-row">
      <span>CAMBIO</span>
      <span>${fmt(cambio)}</span>
    </div>` : ''}
    ` : ''}

    <hr class="dash" />

    <!-- QR CODE -->
    <div class="qr-wrap">
      <img src="${qrUrl}" alt="QR DGII" />
    </div>

    <!-- CODIGO SEGURIDAD Y FIRMA -->
    ${doc.codigoSeguridad ? `<div class="line center">Codigo de Seguridad: ${escHtml(doc.codigoSeguridad)}</div>` : ''}
    <div class="line center">Fecha de Firma Digital: ${escHtml(fechaFirma)}</div>

    <!-- ESTADO -->
    <div class="center">
      <span class="estado ${estadoClass(doc.estado)}">${escHtml(doc.estado)}</span>
    </div>

    ${doc.notas || doc.pieFactura ? `
    <hr class="dash" />
    ${doc.notas ? `<div class="line muted">${escHtml(doc.notas)}</div>` : ''}
    ${doc.pieFactura ? `<div class="line muted">${escHtml(doc.pieFactura)}</div>` : ''}
    ` : ''}

    <hr class="dash" />
    <div class="line center muted">** Documento electronico **</div>
    <div class="line center muted">Verifique en dgii.gov.do</div>
    <div class="spacer"></div>

  </div><!-- /ticket -->

</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function estadoClass(estado: string): string {
  const e = estado.toUpperCase();
  if (e === 'ACEPTADO' || e === 'ACEPTADO_CONDICIONAL') return 'aceptado';
  if (e === 'RECHAZADO' || e === 'ANULADO') return 'rechazado';
  return 'pendiente';
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth
    const user = await getUser();
    if (!user) {
      return new Response('<h1>No autorizado</h1>', {
        status: 401,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const { id } = await params;
    const docId = parseInt(id);
    if (isNaN(docId)) {
      return new Response('<h1>ID inválido</h1>', {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Obtener teamId activo del usuario
    const teamId = await getTeamIdForUser();
    if (!teamId) {
      return new Response('<h1>Sin equipo asignado</h1>', {
        status: 403,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Documento + team (join seguro por teamId)
    const [row] = await db
      .select({ doc: ecfDocuments, team: teams })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(
        and(
          eq(ecfDocuments.id, docId),
          eq(ecfDocuments.teamId, teamId)
        )
      )
      .limit(1);

    if (!row) {
      return new Response('<h1>Documento no encontrado</h1>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const html = buildTicketHtml({
      doc: {
        ...row.doc,
        fechaEmision: new Date(row.doc.fechaEmision),
      },
      team: row.team,
    });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[TICKET] Error generando ticket:', err);
    return new Response('<h1>Error generando ticket</h1>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
