/**
 * Formato 609 — Pagos por Servicios al Exterior
 * Norma General 07-18 — DGII República Dominicana
 *
 * Incluye e-CF tipo 47 (Pagos al Exterior)
 * Archivo: DGII_F_609_{RNC}_{AAAAMM}.TXT
 *
 * Header  : 609|RNC|AAAAMM|NumRegistros
 * Detalle : 13 campos por pipe — sin fila de encabezado de columnas
 *   1  Razón Social proveedor extranjero (hasta 50 chars)
 *   2  Tipo ID Tributaria (1=Persona Física, 2=Persona Jurídica)
 *   3  ID Tributaria del proveedor (hasta 50 chars)
 *   4  País destino (código ISO 3166-1 alpha-3: USA, ESP, etc.)
 *   5  Tipo de servicio adquirido (1-8)
 *   6  Detalle del servicio (11-84, subcategoría del campo 5)
 *   7  Parte relacionada (0=No, 1=Sí)
 *   8  Número de documento
 *   9  Fecha documento (AAAAMMDD)
 *   10 Monto facturado
 *   11 Fecha retención ISR (AAAAMMDD)
 *   12 Renta presunta (Art. 305 CT — base cálculo ISR)
 *   13 ISR retenido
 */
import { NextRequest } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lt, inArray, notInArray } from 'drizzle-orm';

const TIPOS_609 = ['47'];

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fmtAmt(cents: number): string {
  return (cents / 100).toFixed(2);
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
        inArray(ecfDocuments.tipoEcf, TIPOS_609),
        gte(ecfDocuments.fechaEmision, desde),
        lt(ecfDocuments.fechaEmision, hasta),
        notInArray(ecfDocuments.estado, ['ANULADO', 'RECHAZADO']),
      )
    ),
  ]);

  const teamRnc = (team?.rnc ?? '').replace(/\D/g, '');
  const periodo = `${anio}${mes}`;
  const filename = `DGII_F_609_${teamRnc}_${periodo}.TXT`;

  const lines: string[] = [];

  // ─── Header DGII ──────────────────────────────────────────────────────────
  lines.push(`609|${teamRnc}|${periodo}|${docs.length}`);

  // ─── Detalle ──────────────────────────────────────────────────────────────
  for (const d of docs) {
    // Para pagos al exterior, razonSocialComprador = nombre del proveedor extranjero
    const razonSocial = (d.razonSocialComprador ?? '').slice(0, 50);
    const tipoId      = '2'; // Persona Jurídica (default para empresas extranjeras)
    const idTrib      = (d.rncComprador ?? '').slice(0, 50); // ID tributario en país de origen
    const pais        = 'USA'; // Campo no almacenado — USA como default; el usuario debe corregir
    const tipoServicio = '2'; // Gastos por trabajos, suministros y servicios (más común)
    const detalleServ  = '21'; // Honorarios por servicios profesionales (personas morales)
    const parteRelacionada = '0'; // No relacionado por defecto
    const numDoc      = d.encf ?? '';
    const fechaDoc    = fmtFecha(d.fechaEmision);

    const montoFacturado = Math.max(0, d.montoTotal - d.totalItbis);

    // ISR retenido al proveedor extranjero
    let rentaPresunta = '0.00';
    let isrRetenido   = '0.00';
    try {
      const rets = JSON.parse(d.retenciones ?? '[]') as Array<{ tipo: string; monto: number }>;
      const isr  = rets.find(r => ['ISR', 'RENTA'].includes((r.tipo ?? '').toUpperCase()));
      if (isr && isr.monto > 0) {
        isrRetenido   = fmtAmt(isr.monto);
        // Renta presunta ≈ ISR / tasa presunta (Art. 305 CT = 29% para servicios técnicos)
        rentaPresunta = fmtAmt(Math.round(isr.monto / 0.29));
      }
    } catch { /* JSON malformado */ }

    const fechaRet = d.pagoFecha ? d.pagoFecha.replace(/-/g, '') : fmtFecha(d.fechaEmision);

    lines.push([
      razonSocial,            // 1  Razón social proveedor
      tipoId,                 // 2  Tipo ID tributaria
      idTrib,                 // 3  ID tributaria
      pais,                   // 4  País destino (ISO alpha-3)
      tipoServicio,           // 5  Tipo servicio adquirido
      detalleServ,            // 6  Detalle del servicio
      parteRelacionada,       // 7  Parte relacionada
      numDoc,                 // 8  Número documento
      fechaDoc,               // 9  Fecha documento AAAAMMDD
      fmtAmt(montoFacturado), // 10 Monto facturado
      fechaRet,               // 11 Fecha retención ISR AAAAMMDD
      rentaPresunta,          // 12 Renta presunta
      isrRetenido,            // 13 ISR retenido
    ].join('|'));
  }

  const content = lines.join('\r\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
