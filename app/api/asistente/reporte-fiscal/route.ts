/**
 * GET /api/asistente/reporte-fiscal?anio=2026&mes=9 → .xlsx
 *
 * El paquete fiscal del mes (cobros, parciales, sin pago, resumen, 607, 606 y
 * notas) como lo revisa un contador. Solo lectura: consulta los datos de la
 * empresa de la sesión y arma el libro con `armarLibroFiscal`. Mismo acceso que
 * el asistente (dueño o administrador con permiso de reportes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { armarLibroFiscal } from '@/lib/asistente/reporte-fiscal';
import { cargarDatosFiscales } from '@/lib/asistente/reporte-fiscal-datos';
import { rateLimitDb } from '@/lib/rate-limit';

export const maxDuration = 60;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_fiscal:${teamId}:${user.id}`, 20, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados reportes seguidos. Espera unos minutos.' }, { status: 429 });

  const sp = req.nextUrl.searchParams;
  const anio = Number(sp.get('anio'));
  const mes = Number(sp.get('mes'));
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
  }

  const wb = armarLibroFiscal(await cargarDatosFiscales(teamId, anio, mes));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="reporte-fiscal-${anio}-${String(mes).padStart(2, '0')}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
