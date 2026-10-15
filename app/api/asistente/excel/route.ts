/**
 * GET /api/asistente/excel?mensajeId=123 → .xlsx
 *
 * El Excel de una respuesta del asistente. Solo del propio usuario y de su
 * empresa (el mensaje tiene que pertenecer a una conversación suya) y solo con
 * lo que esa respuesta ya mostró: no consulta datos nuevos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, lt } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes, teams } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { aBloques } from '@/lib/asistente/bloques';
import { armarLibro, type Celda } from '@/lib/asistente/excel';
import { rateLimitDb } from '@/lib/rate-limit';

export const maxDuration = 30;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function aValor(c: Celda): ExcelJS.CellValue {
  return c.valor;
}

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_excel:${teamId}:${user.id}`, 30, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados Excel seguidos. Espera unos minutos.' }, { status: 429 });

  const id = Number(req.nextUrl.searchParams.get('mensajeId'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });

  const [m] = await db.select({
    id: asistenteMensajes.id, rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido,
    herramientas: asistenteMensajes.herramientas, conversacionId: asistenteMensajes.conversacionId,
  }).from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .where(and(
      eq(asistenteMensajes.id, id),
      eq(asistenteConversaciones.teamId, teamId),
      eq(asistenteConversaciones.userId, user.id),
    )).limit(1);
  if (!m || m.rol !== 'assistant') return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });

  const [pregunta] = await db.select({ contenido: asistenteMensajes.contenido }).from(asistenteMensajes)
    .where(and(
      eq(asistenteMensajes.conversacionId, m.conversacionId),
      eq(asistenteMensajes.rol, 'user'),
      lt(asistenteMensajes.id, m.id),
    ))
    .orderBy(desc(asistenteMensajes.id)).limit(1);
  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);

  const generadoEn = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'long', timeStyle: 'short' });
  const libro = armarLibro(aBloques(m.contenido), {
    empresa: team?.nombre ?? 'Mi empresa',
    usuario: user.name ?? null,
    generadoEn,
    pregunta: pregunta?.contenido ? pregunta.contenido.slice(0, 300) : null,
    consultas: (m.herramientas ?? []).map((h) => (h.resumen ? `${h.nombre} (${h.resumen})` : h.nombre)),
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  wb.created = new Date();
  for (const h of libro.hojas) {
    const ws = wb.addWorksheet(h.nombre);
    h.filas.forEach((fila, i) => {
      const row = ws.addRow(fila.map(aValor));
      fila.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        // Todo texto va como texto: nunca se interpreta como fórmula.
        if (c.tipo === 'numero') cell.numFmt = c.formato;
        else if (c.tipo === 'fecha') cell.numFmt = 'dd/mm/yyyy';
        if (i > 0 && h.numericas[j]) cell.alignment = { horizontal: 'right' };
      });
    });
    const enc = ws.getRow(1);
    enc.font = { bold: true };
    enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    // Ancho según lo más largo de cada columna (con tope).
    ws.columns.forEach((col, j) => {
      const largo = Math.max(...h.filas.map((f) => {
        const c = f[j];
        if (!c) return 0;
        return c.tipo === 'texto' ? c.valor.length : c.tipo === 'fecha' ? 10 : 16;
      }), 8);
      col.width = Math.min(60, largo + 3);
    });
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="asistente-zero-${fecha}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
