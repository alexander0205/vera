/**
 * Reportes programados del asistente (de la persona que pregunta).
 *
 *   GET                              → los míos
 *   POST   { tipo, frecuencia }      → programar uno (llega a MI correo)
 *   DELETE ?id=                      → quitar uno mío
 *
 * Solo dueños y administradores (los mismos que usan el asistente). El
 * destinatario es siempre el correo de quien lo programa: no se acepta otro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteReportesProgramados } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { rateLimitDb } from '@/lib/rate-limit';
import { esFrecuenciaReporte, esTipoReporte } from '@/lib/asistente/reportes-programados';

const MAXIMO_POR_PERSONA = 8;

const columnas = {
  id: asistenteReportesProgramados.id,
  tipo: asistenteReportesProgramados.tipo,
  frecuencia: asistenteReportesProgramados.frecuencia,
  activo: asistenteReportesProgramados.activo,
  ultimoEnvioEn: asistenteReportesProgramados.ultimoEnvioEn,
  ultimoError: asistenteReportesProgramados.ultimoError,
};

export async function GET() {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const filas = await db.select(columnas).from(asistenteReportesProgramados)
    .where(and(eq(asistenteReportesProgramados.teamId, acceso.teamId), eq(asistenteReportesProgramados.userId, acceso.user.id)))
    .orderBy(asistenteReportesProgramados.id);
  return NextResponse.json({ reportes: filas, correo: acceso.user.email });
}

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_reportes:${teamId}:${user.id}`, 30, 60 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados cambios seguidos.' }, { status: 429 });

  const b = await req.json().catch(() => null);
  if (!esTipoReporte(b?.tipo) || !esFrecuenciaReporte(b?.frecuencia)) {
    return NextResponse.json({ error: 'Elige un reporte y una frecuencia válidos.' }, { status: 400 });
  }

  const mios = await db.select({ id: asistenteReportesProgramados.id }).from(asistenteReportesProgramados)
    .where(and(eq(asistenteReportesProgramados.teamId, teamId), eq(asistenteReportesProgramados.userId, user.id)));
  if (mios.length >= MAXIMO_POR_PERSONA) {
    return NextResponse.json({ error: `Puedes tener hasta ${MAXIMO_POR_PERSONA} reportes programados.` }, { status: 400 });
  }

  const [creado] = await db.insert(asistenteReportesProgramados)
    .values({ teamId, userId: user.id, tipo: b.tipo, frecuencia: b.frecuencia })
    .onConflictDoUpdate({
      target: [
        asistenteReportesProgramados.teamId, asistenteReportesProgramados.userId,
        asistenteReportesProgramados.tipo, asistenteReportesProgramados.frecuencia,
      ],
      // Programar de nuevo lo que ya existía lo reactiva, no duplica.
      set: { activo: true, ultimoError: null },
    })
    .returning(columnas);
  return NextResponse.json({ reporte: creado });
}

export async function DELETE(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta el reporte' }, { status: 400 });

  const borrados = await db.delete(asistenteReportesProgramados)
    .where(and(
      eq(asistenteReportesProgramados.id, id),
      eq(asistenteReportesProgramados.teamId, acceso.teamId),
      eq(asistenteReportesProgramados.userId, acceso.user.id),
    ))
    .returning({ id: asistenteReportesProgramados.id });
  if (!borrados.length) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
