/**
 * Formato 606 — Compras de Bienes y Servicios
 * Norma General 07-18 — DGII República Dominicana
 *
 * Tipos e-CF incluidos: 41 (Compras), 43 (Gastos Menores)
 * Archivo: DGII_F_606_{RNC}_{AAAAMM}.TXT
 *
 * Header  : 606|RNC|AAAAMM|NumRegistros
 * Detalle : 23 campos por pipe — sin fila de encabezado de columnas
 *   1  RNC/Cédula proveedor
 *   2  Tipo ID (1=RNC, 2=Cédula)
 *   3  Tipo Bienes/Servicios (02=trabajos,suministros,servicios)
 *   4  NCF
 *   5  NCF Modificado (notas deb/cred)
 *   6  Fecha Comprobante (AAAAMMDD)
 *   7  Fecha Pago (AAAAMMDD)
 *   8  Monto Servicios (sin ITBIS)
 *   9  Monto Bienes (sin ITBIS)
 *   10 Total Facturado (8+9)
 *   11 ITBIS Facturado
 *   12 ITBIS Retenido
 *   13 ITBIS Proporcionalidad
 *   14 ITBIS al Costo
 *   15 ITBIS por Adelantar (11-14)
 *   16 ITBIS Percibido (no habilitado)
 *   17 Tipo Retención ISR
 *   18 Monto Retención Renta
 *   19 ISR Percibido (no habilitado)
 *   20 ISC
 *   21 Otros Impuestos
 *   22 Propina Legal
 *   23 Forma de Pago (1=Efectivo,2=Cheque/Trans,3=Tarjeta,4=Crédito)
 */
import { NextRequest } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lt, inArray } from 'drizzle-orm';

const TIPOS_606 = ['41', '43'];

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fmtAmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

function tipoId(rnc: string | null | undefined): string {
  const c = (rnc ?? '').replace(/\D/g, '');
  return c.length === 11 ? '2' : '1';
}

// Forma de Pago: 1=Efectivo, 2=Cheque/Trans/Dep, 3=Tarjeta, 4=Compra a crédito,
//   5=Permuta, 6=Notas de crédito, 7=Mixto
function codFormaPago(metodo: string | null | undefined): string {
  switch (metodo) {
    case 'efectivo':        return '1';
    case 'cheque':
    case 'transferencia':   return '2';
    case 'tarjeta':         return '3';
    case 'credito':         return '4';
    case 'permuta':         return '5';
    case 'nota_credito':    return '6';
    case 'mixto':           return '7';
    default:                return '4'; // crédito por defecto
  }
}

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('No autorizado', { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const anio = sp.get('anio') ?? String(new Date().getFullYear());
  const mes  = (sp.get('mes') ?? String(new Date().getMonth() + 1)).padStart(2, '0');

  const desde = new Date(`${anio}-${mes}-01T00:00:00`);
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);

  const [team, docs] = await Promise.all([
    getTeamProfile(teamId),
    db.select().from(ecfDocuments).where(
      and(
        eq(ecfDocuments.teamId, teamId),
        inArray(ecfDocuments.tipoEcf, TIPOS_606),
        gte(ecfDocuments.fechaEmision, desde),
        lt(ecfDocuments.fechaEmision, hasta),
      )
    ),
  ]);

  // 606 excluye anulados — los anulados van en el 608
  const compras = docs.filter(d => d.estado !== 'ANULADO');

  const teamRnc = (team?.rnc ?? '').replace(/\D/g, '');
  const periodo = `${anio}${mes}`;
  const filename = `DGII_F_606_${teamRnc}_${periodo}.TXT`;

  const lines: string[] = [];

  // ─── Header DGII ──────────────────────────────────────────────────────────
  lines.push(`606|${teamRnc}|${periodo}|${compras.length}`);

  // ─── Detalle ──────────────────────────────────────────────────────────────
  for (const d of compras) {
    const rncProv = (d.rncComprador ?? '').replace(/\D/g, '');
    const tId     = tipoId(d.rncComprador);

    // Campo 3: tipo de bienes/servicios comprados (02 = más común para servicios)
    const tipoBienes = '02';

    const ncf    = d.encf ?? '';
    const ncfMod = d.ncfModificado ?? '';

    const fechaComp = fmtFecha(d.fechaEmision);
    const fechaPago = d.pagoFecha ? d.pagoFecha.replace(/-/g, '') : '';

    // Montos — DGII pide separado: servicios vs bienes
    // Por defecto ponemos todo en servicios (campo 8), bienes = 0
    const montoBase = Math.max(0, d.montoTotal - d.totalItbis);

    // ISR — parsear desde retenciones JSON
    let tipoISR  = '0';
    let montoISR = '0.00';
    try {
      const rets = JSON.parse(d.retenciones ?? '[]') as Array<{ tipo: string; monto: number }>;
      const isrRet = rets.find(r =>
        ['ISR', 'RENTA', 'HONORARIOS'].includes((r.tipo ?? '').toUpperCase())
      );
      if (isrRet && isrRet.monto > 0) {
        tipoISR  = '2'; // 2 = Honorarios por servicios (código más común)
        montoISR = fmtAmt(isrRet.monto);
      }
    } catch { /* retenciones malformadas */ }

    lines.push([
      rncProv,            // 1  RNC proveedor
      tId,                // 2  Tipo ID
      tipoBienes,         // 3  Tipo bienes/servicios
      ncf,                // 4  NCF
      ncfMod,             // 5  NCF modificado
      fechaComp,          // 6  Fecha comprobante AAAAMMDD
      fechaPago,          // 7  Fecha pago AAAAMMDD
      fmtAmt(montoBase),  // 8  Monto servicios
      '0.00',             // 9  Monto bienes
      fmtAmt(montoBase),  // 10 Total facturado
      fmtAmt(d.totalItbis), // 11 ITBIS facturado
      '0.00',             // 12 ITBIS retenido al proveedor
      '',                 // 13 ITBIS proporcionalidad (Art. 349) — si no aplica: vacío
      '',                 // 14 ITBIS al costo — si no aplica: vacío
      fmtAmt(d.totalItbis), // 15 ITBIS por adelantar (=ITBIS facturado cuando 14=0)
      '',                 // 16 ITBIS percibido — no habilitado por DGII
      tipoISR,            // 17 Tipo retención ISR
      montoISR,           // 18 Monto retención renta
      '',                 // 19 ISR percibido — no habilitado
      '',                 // 20 ISC
      '',                 // 21 Otros impuestos
      '0.00',             // 22 Propina legal
      codFormaPago(d.pagoMetodo), // 23 Forma de pago
    ].join('|'));
  }

  // CRLF obligatorio según Norma 07-18
  const content = lines.join('\r\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
