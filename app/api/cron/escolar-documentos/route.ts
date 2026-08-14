import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, adminEscolarAvisosEnviados } from '@/lib/db/schema';
import { seguimientoDeDocumentos } from '@/lib/administracion-escolar/documentos-seguimiento';
import { crearEnlace, DIAS_VIGENCIA_ENLACE } from '@/lib/administracion-escolar/documentos-enlace';
import { enviarEnlaceDocumentosEmail } from '@/lib/email/escolar-avisos';
import { registrarAvisoExpediente } from '@/lib/administracion-escolar/avisos-expediente';

/**
 * El recordatorio de documentos que falta entregar.
 *
 * Hasta ahora, cada reclamación era alguien acordándose a mano. Los papeles que
 * faltan no se resuelven solos: en agosto una matrícula se queda a medias
 * durante semanas porque nadie volvió a preguntar por el acta de nacimiento.
 *
 * ⚠️ APAGADO POR DEFECTO, igual que los avisos de cobro. Sin
 * `ESCOLAR_DOCUMENTOS_RECORDATORIO=1` calcula y devuelve el plan sin mandar
 * nada. Esto le escribe a familias reales: encenderlo sobre una copia de
 * producción manda correos de verdad a padres de verdad.
 *
 * `?dry=1` fuerza el simulacro aunque esté encendido.
 *
 * TRES REGLAS que evitan convertir esto en spam:
 *
 *  1. **Una vez por semana como mucho.** Se mira el historial de avisos: si a
 *     esa matrícula ya se le reclamó por documentos en los últimos 7 días, se
 *     salta. Sin esto, un cron diario le escribiría todos los días a la misma
 *     familia hasta que entregara.
 *  2. **Solo a quien le falta de verdad**, con la misma cuenta que la pantalla
 *     de seguimiento — y solo si tiene correo.
 *  3. **Tope por colegio y por día**, porque un fallo de datos que marcara a
 *     todos como incompletos no puede traducirse en 465 correos.
 *
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */

/** Días de silencio entre dos reclamaciones a la misma familia. */
const DIAS_ENTRE_RECLAMOS = 7;

/** Cuántas familias como mucho por colegio y ejecución. */
const TOPE_POR_COLEGIO = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const simulacro = req.nextUrl.searchParams.get('dry') === '1'
    || process.env.ESCOLAR_DOCUMENTOS_RECORDATORIO !== '1';

  // El origen público no sale de la petición del cron —que llega de la
  // infraestructura, no de un navegador— sino de la variable de entorno.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!simulacro && !base) {
    return NextResponse.json(
      { error: 'Falta NEXT_PUBLIC_APP_URL: sin ella el enlace del correo no lleva a ninguna parte' },
      { status: 500 },
    );
  }

  const colegios = await db
    .select({ id: teams.id, nombre: teams.name })
    .from(teams);

  const desde = new Date(Date.now() - DIAS_ENTRE_RECLAMOS * 24 * 60 * 60_000);
  const resumen: Record<string, unknown>[] = [];

  for (const colegio of colegios) {
    const { periodoId, filas } = await seguimientoDeDocumentos(colegio.id);
    if (!periodoId) continue;

    const pendientes = filas.filter((f) => !f.completa && f.email);
    if (pendientes.length === 0) continue;

    // A quién ya se le reclamó esta semana.
    const recientes = await db
      .select({ matriculaId: adminEscolarAvisosEnviados.matriculaId })
      .from(adminEscolarAvisosEnviados)
      .where(and(
        eq(adminEscolarAvisosEnviados.teamId, colegio.id),
        eq(adminEscolarAvisosEnviados.tipo, 'documentos'),
        gte(adminEscolarAvisosEnviados.enviadoAt, desde),
      ));
    const yaAvisadas = new Set(recientes.map((r) => r.matriculaId));

    const objetivo = pendientes
      .filter((f) => !yaAvisadas.has(f.matriculaId))
      .slice(0, TOPE_POR_COLEGIO);

    if (objetivo.length === 0) {
      resumen.push({ colegio: colegio.nombre, saltadas: pendientes.length, enviados: 0 });
      continue;
    }

    if (simulacro) {
      resumen.push({
        colegio: colegio.nombre,
        seEnviarian: objetivo.length,
        ejemplo: objetivo.slice(0, 3).map((f) => ({ alumno: f.estudiante, faltan: f.pendientes.length })),
        silenciadasEstaSemana: pendientes.length - objetivo.length,
      });
      continue;
    }

    let enviados = 0;
    const fallos: string[] = [];
    for (const f of objetivo) {
      try {
        const { token } = await crearEnlace({
          teamId: colegio.id,
          matriculaId: f.matriculaId,
          requeridoId: null,
          // Lo manda el sistema, no una persona: queda sin autor a propósito.
          creadoPor: null,
        });
        await enviarEnlaceDocumentosEmail({
          email: f.email!,
          colegio: colegio.nombre,
          tutor: null,
          estudiante: f.estudiante,
          documentos: f.pendientes,
          url: `${base}/d/${token}`,
          dias: DIAS_VIGENCIA_ENLACE,
        });
        await registrarAvisoExpediente({
          teamId: colegio.id,
          matriculaId: f.matriculaId,
          tipo: 'documentos',
          canal: 'correo',
          destino: f.email!,
          detalle: f.pendientes.slice(0, 3).join(', ') || 'Expediente',
        });
        enviados++;
      } catch (err) {
        fallos.push(`${f.estudiante}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }

    resumen.push({
      colegio: colegio.nombre,
      enviados,
      silenciadasEstaSemana: pendientes.length - objetivo.length,
      fallos: fallos.slice(0, 5),
    });
  }

  return NextResponse.json({
    simulacro,
    motivo: simulacro && process.env.ESCOLAR_DOCUMENTOS_RECORDATORIO !== '1'
      ? 'ESCOLAR_DOCUMENTOS_RECORDATORIO no está en 1: no se mandó nada'
      : undefined,
    colegios: resumen,
  });
}
