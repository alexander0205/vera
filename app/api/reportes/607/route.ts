/**
 * Formato 607 — Ventas de Bienes y Servicios
 * Norma General 07-18 — DGII República Dominicana
 *
 * Tipos e-CF incluidos: 31, 32, 33, 34, 44, 45, 46
 * Archivo: DGII_F_607_{RNC}_{AAAAMM}.TXT
 *
 * Header  : 607|RNC|AAAAMM|NumRegistros
 * Detalle : 23 campos por pipe — sin fila de encabezado de columnas
 *   1  RNC/Cédula/Pasaporte comprador
 *   2  Tipo ID (1=RNC, 2=Cédula, 3=Pasaporte)
 *   3  NCF
 *   4  NCF Modificado (notas deb/cred)
 *   5  Tipo de Ingreso (1=operaciones, 2=financiero, 3=extraordinario,
 *                       4=arrendamiento, 5=activo depreciable, 6=otros)
 *   6  Fecha Comprobante (AAAAMMDD)
 *   7  Fecha Retención por Terceros (AAAAMMDD)
 *   8  Monto Facturado (sin ITBIS ni otros impuestos)
 *   9  ITBIS Facturado
 *   10 ITBIS Retenido por Terceros
 *   11 ITBIS Percibido (no habilitado)
 *   12 Retención de Renta por Terceros
 *   13 ISR Percibido (no habilitado)
 *   14 ISC
 *   15 Otros Impuestos
 *   16 Propina Legal
 *   17 Efectivo (incluye ITBIS)
 *   18 Cheque/Transferencia/Depósito (incluye ITBIS)
 *   19 Tarjeta Débito/Crédito (incluye ITBIS)
 *   20 Venta a Crédito (incluye ITBIS)
 *   21 Bonos/Certificados de Regalo
 *   22 Permuta
 *   23 Otras Formas
 */
import { NextRequest } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lt, inArray, notInArray } from 'drizzle-orm';

// Tipos de e-CF de ventas/emisiones
const TIPOS_607 = ['31', '32', '33', '34', '44', '45', '46'];

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fmtAmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Tipo Identificación: 1=RNC, 2=Cédula, 3=Pasaporte/ID tributaria
function tipoId(rnc: string | null | undefined): string {
  if (!rnc || rnc.trim() === '') return '1';
  // Si contiene letras → pasaporte o ID tributaria extranjera
  if (/[a-zA-Z]/.test(rnc)) return '3';
  const c = rnc.replace(/\D/g, '');
  if (c.length === 11) return '2'; // Cédula dominicana
  return '1'; // RNC (9 dígitos) o default
}

// Norma General 10-18: facturas de consumo (tipo 32) solo se reportan
// en el 607 si monto >= RD$250,000.00 (25,000,000 centavos)
const UMBRAL_CONSUMO_CTS = 25_000_000;

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
        inArray(ecfDocuments.tipoEcf, TIPOS_607),
        gte(ecfDocuments.fechaEmision, desde),
        lt(ecfDocuments.fechaEmision, hasta),
        notInArray(ecfDocuments.estado, ['ANULADO', 'RECHAZADO']),
      )
    ),
  ]);

  // Norma 10-18: excluir facturas de consumo (tipo 32) < RD$250,000
  // El parámetro incluirConsumoMenores=true permite incluir todas (checkbox OFV)
  const incluirTodas32 = sp.get('incluirConsumoMenores') === 'true';
  const ventas = docs.filter(d => {
    if (d.tipoEcf === '32' && !incluirTodas32 && d.montoTotal < UMBRAL_CONSUMO_CTS) {
      return false;
    }
    return true;
  });

  const teamRnc = (team?.rnc ?? '').replace(/\D/g, '');
  const periodo = `${anio}${mes}`;
  const filename = `DGII_F_607_${teamRnc}_${periodo}.TXT`;

  const lines: string[] = [];

  // ─── Header DGII ──────────────────────────────────────────────────────────
  lines.push(`607|${teamRnc}|${periodo}|${ventas.length}`);

  // ─── Detalle ──────────────────────────────────────────────────────────────
  for (const d of ventas) {
    const rncComp = (d.rncComprador ?? '').replace(/\D/g, '');
    const tId     = tipoId(d.rncComprador);
    const ncf     = d.encf ?? '';
    const ncfMod  = d.ncfModificado ?? '';

    // Campo 5: tipo de ingreso — almacenado en tipoIngreso (default '1')
    const tIngreso = d.tipoIngreso ?? '1';

    const fechaComp = fmtFecha(d.fechaEmision);

    // Fecha retención: cuando un tercero retiene — guardamos en pagoFecha como aproximación
    const fechaRet = '';

    // ─── Montos ───────────────────────────────────────────────────────────
    // Campo 8: Monto Facturado SIN impuestos
    const montoBase = Math.max(0, d.montoTotal - d.totalItbis);

    // Retenciones aplicadas al contribuyente (cliente nos retuvo ISR o ITBIS)
    let itbisRetTerceros = 0;
    let rentaRetTerceros = 0;

    try {
      const rets = JSON.parse(d.retenciones ?? '[]') as Array<{
        tipo: string; monto: number;
      }>;
      for (const r of rets) {
        const tipo = (r.tipo ?? '').toUpperCase();
        if (tipo === 'ITBIS') {
          itbisRetTerceros += r.monto ?? 0;
        } else {
          rentaRetTerceros += r.monto ?? 0;
        }
      }
    } catch { /* JSON malformado */ }

    // Fallback: si hay totalRetenciones y no se pudo parsear, es ISR
    if (!itbisRetTerceros && !rentaRetTerceros && d.totalRetenciones > 0) {
      rentaRetTerceros = d.totalRetenciones;
    }

    // ─── Formas de pago (campos 17-23) ────────────────────────────────────
    // Estos campos incluyen ITBIS y otros impuestos
    // La suma de 17-23 debe igualar el total cobrado con impuestos
    const totalConImpuestos = d.montoTotal;
    let ef = 0, ch = 0, tj = 0, cr = 0, bn = 0, pm = 0, ot = 0;

    switch (d.pagoMetodo) {
      case 'efectivo':       ef = totalConImpuestos; break;
      case 'cheque':
      case 'transferencia':  ch = totalConImpuestos; break;
      case 'tarjeta':        tj = totalConImpuestos; break;
      case 'credito':        cr = totalConImpuestos; break;
      default:               cr = totalConImpuestos; // default: venta a crédito
    }

    lines.push([
      rncComp,              // 1  RNC/Cédula comprador
      tId,                  // 2  Tipo ID
      ncf,                  // 3  NCF
      ncfMod,               // 4  NCF modificado
      tIngreso,             // 5  Tipo de ingreso
      fechaComp,            // 6  Fecha comprobante AAAAMMDD
      fechaRet,             // 7  Fecha retención por terceros
      fmtAmt(montoBase),    // 8  Monto facturado (sin ITBIS)
      fmtAmt(d.totalItbis), // 9  ITBIS facturado
      itbisRetTerceros ? fmtAmt(itbisRetTerceros) : '', // 10 ITBIS retenido por terceros
      '',                   // 11 ITBIS percibido — no habilitado
      rentaRetTerceros ? fmtAmt(rentaRetTerceros) : '', // 12 Retención renta por terceros
      '',                   // 13 ISR percibido — no habilitado
      '',                   // 14 ISC
      '',                   // 15 Otros impuestos
      '0.00',               // 16 Propina legal
      ef ? fmtAmt(ef) : '', // 17 Efectivo
      ch ? fmtAmt(ch) : '', // 18 Cheque/Transferencia/Depósito
      tj ? fmtAmt(tj) : '', // 19 Tarjeta débito/crédito
      cr ? fmtAmt(cr) : '', // 20 Venta a crédito
      bn ? fmtAmt(bn) : '', // 21 Bonos/certificados
      pm ? fmtAmt(pm) : '', // 22 Permuta
      ot ? fmtAmt(ot) : '', // 23 Otras formas
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
