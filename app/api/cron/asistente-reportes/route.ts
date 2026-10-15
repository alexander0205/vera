import { createElement } from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/lib/db/drizzle';
import { asistenteReportesProgramados, teamMembers, teams, users } from '@/lib/db/schema';
import { userCanForTeam } from '@/lib/auth/permissions';
import { ErrorApi, type ClienteApi } from '@/lib/asistente/api';
import { construirContexto } from '@/lib/asistente/contexto';
import { crearHerramientas } from '@/lib/asistente/herramientas';
import { responderLocal } from '@/lib/asistente/local';
import { aBloques } from '@/lib/asistente/bloques';
import { hoyRd } from '@/lib/asistente/util';
import {
  esFrecuenciaReporte, esTipoReporte, preguntaDeReporte, tituloDeReporte, tocaHoy, yaEnviadoHoy,
} from '@/lib/asistente/reportes-programados';
import { AsistentePDF } from '@/lib/pdf/AsistentePDF';
import { enviarReporteProgramadoEmail } from '@/lib/email/asistente';
import { baseDeEnlaces } from '@/lib/config/enlaces';

export const maxDuration = 300;

/**
 * Envía los reportes programados del asistente.
 *
 * Corre a diario (vercel.json, 08:00 hora de RD). Por cada programación activa
 * que toca hoy: comprueba que la persona SIGUE pudiendo ver reportes de esa
 * empresa, arma el reporte con las mismas plantillas del chat y lo manda en PDF
 * a su correo. Solo usa los reportes (consultas por empresa, sin sesión): lo
 * que necesita la API de la app con la cookie de la persona no se incluye.
 *
 * Mismo patrón de acceso que los demás crons: Authorization: Bearer ${CRON_SECRET}.
 */

const aYmdRd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const MAX_POR_CORRIDA = 300;

/** Sin sesión de persona no hay API de la app: las herramientas que la usan no entran al reporte. */
const apiNoDisponible: ClienteApi = {
  async get() { throw new ErrorApi(401, 'sin sesión (reporte programado)'); },
};

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const hoy = hoyRd();

  const filas = await db.select({
    id: asistenteReportesProgramados.id,
    teamId: asistenteReportesProgramados.teamId,
    userId: asistenteReportesProgramados.userId,
    tipo: asistenteReportesProgramados.tipo,
    frecuencia: asistenteReportesProgramados.frecuencia,
    ultimoEnvioEn: asistenteReportesProgramados.ultimoEnvioEn,
    correo: users.email,
    nombre: users.name,
    platformRole: users.platformRole,
    empresa: teams.name,
  }).from(asistenteReportesProgramados)
    .innerJoin(users, eq(users.id, asistenteReportesProgramados.userId))
    .innerJoin(teams, eq(teams.id, asistenteReportesProgramados.teamId))
    .where(eq(asistenteReportesProgramados.activo, true))
    .limit(MAX_POR_CORRIDA);

  const resultado = { enviados: 0, omitidos: 0, fallidos: 0, desactivados: 0 };

  for (const f of filas) {
    try {
      if (!esTipoReporte(f.tipo) || !esFrecuenciaReporte(f.frecuencia)) { resultado.omitidos++; continue; }
      if (!tocaHoy(f.frecuencia, hoy) || yaEnviadoHoy(f.ultimoEnvioEn, hoy, aYmdRd)) { resultado.omitidos++; continue; }

      // Sigue siendo parte de la empresa y con los permisos que se necesitan.
      const [m] = await db.select({ role: teamMembers.role }).from(teamMembers)
        .where(and(eq(teamMembers.userId, f.userId), eq(teamMembers.teamId, f.teamId))).limit(1);
      const [administra, veReportes] = await Promise.all([
        userCanForTeam(f.teamId, f.platformRole, m?.role, 'configuracion:gestionar'),
        userCanForTeam(f.teamId, f.platformRole, m?.role, 'reportes:ver'),
      ]);
      if ((!m && f.platformRole !== 'admin') || !administra || !veReportes) {
        await db.update(asistenteReportesProgramados)
          .set({ activo: false, ultimoError: 'Ya no tienes permiso para este reporte' })
          .where(eq(asistenteReportesProgramados.id, f.id));
        resultado.desactivados++;
        continue;
      }

      const ctx = await construirContexto(f.teamId, f.platformRole, m?.role ?? null, apiNoDisponible);
      const consultas: { nombre: string; resumen: string }[] = [];
      const tools = crearHerramientas(ctx, consultas);
      const r = await responderLocal(preguntaDeReporte(f.tipo, f.frecuencia), tools, { hoy });
      if (!r) throw new Error('No se pudo armar el reporte');

      const titulo = tituloDeReporte(f.tipo, f.frecuencia);
      const fecha = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'long', timeStyle: 'short' });
      const pdf = await renderToBuffer(createElement(AsistentePDF, {
        data: {
          empresa: f.empresa, usuario: f.nombre ?? null, generadoEn: fecha,
          pregunta: `Reporte programado: ${titulo}`,
          bloques: aBloques(r.respuesta),
          consultas: consultas.map((c) => (c.resumen ? `${c.nombre} (${c.resumen})` : c.nombre)),
        },
      }) as never);

      await enviarReporteProgramadoEmail({
        email: f.correo, nombre: f.nombre, empresa: f.empresa, titulo, fecha, pdf: Buffer.from(pdf),
        urlGestion: `${baseDeEnlaces()}/dashboard/asistente`,
      });
      await db.update(asistenteReportesProgramados)
        .set({ ultimoEnvioEn: new Date(), ultimoError: null })
        .where(eq(asistenteReportesProgramados.id, f.id));
      resultado.enviados++;
    } catch (e) {
      resultado.fallidos++;
      console.error('[asistente-reportes]', f.id, e);
      await db.update(asistenteReportesProgramados)
        .set({ ultimoError: String((e as Error)?.message ?? e).slice(0, 190) })
        .where(eq(asistenteReportesProgramados.id, f.id))
        .catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, hoy, ...resultado });
}
