import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos, teams } from '@/lib/db/schema';
import { devengarPeriodo } from '@/lib/administracion-escolar/devengar';
import { facturarCuotasEmitidas } from '@/lib/administracion-escolar/facturar-emision';

/**
 * Devengo mensual de la deuda escolar, y su factura.
 *
 * Los cargos no nacen todos el día de la matrícula: al matricular solo se crea
 * lo exigible ese mes, y esto añade cada mensualidad cuando le llega el turno.
 * Sin este cron el padre solo debería la inscripción para siempre.
 *
 * Desde que existe la facturación automática son DOS pasos seguidos: el
 * calendario del concepto crea el cargo (devengo) y, para los colegios que lo
 * pidieron, crea también su factura borrador (facturación). Los dos leen la
 * misma fecha de emisión, así que no pueden desincronizarse.
 *
 * Corre a diario aunque el devengo sea mensual, porque el día 1 puede fallar
 * (despliegue, caída, cuota de la plataforma) y un colegio no puede quedarse un
 * mes entero sin facturar por eso. Repetirlo no cobra de más: el índice único
 * `(matricula_id, cuota_id)` descarta los cargos que ya existen, y la
 * facturación solo mira cargos sin factura.
 *
 * Invocado por el cron de Vercel (vercel.json → crons[]).
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */

/**
 * El devengo solo cuenta cuotas y termina en segundos; facturar escribe un
 * documento por familia y no. Medido contra datos reales, un colegio de 78
 * alumnos tarda ~110 s en emitir sus 57 facturas del mes, así que con el
 * límite por defecto un colegio grande se quedaría a medias.
 *
 * Quedarse a medias no pierde nada —cada factura es su propia transacción y la
 * ventana de recuperación las recoge al día siguiente—, pero es mejor que no
 * pase.
 */
export const maxDuration = 300;

/**
 * Cuántos días hacia atrás mira la facturación automática.
 *
 * Si el cron no corrió ayer —o falló a mitad—, las cuotas de ese día se
 * quedarían sin factura para siempre, porque nada las vuelve a mirar. Con la
 * ventana, la corrida siguiente las recoge sola.
 *
 * Puede ser generosa sin riesgo: la línea de corte de cada colegio
 * (`escolar_facturacion_automatica_desde`) impide en cualquier caso facturar
 * hacia atrás más allá del día en que se encendió, así que la ventana nunca
 * alcanza deuda vieja por mucho que se abra.
 */
const DIAS_RECUPERACION = 7;

/** `fecha` menos N días, en ISO. */
function restarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  x.setUTCDate(x.getUTCDate() - dias);
  return x.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // HOY, no fin de mes. Un cargo nace el día en que se emite, ni un día antes:
  // la cuota de septiembre que se emite el 30 no puede figurar como deuda el
  // día 2. Cortar en fin de mes adelantaba hasta 30 días cada mensualidad —en
  // producción llegó a haber 373 cargos por RD$2.4M con la emisión todavía por
  // llegar—, y la pantalla los mostraba como pendientes porque un cargo que
  // existe ES deuda. Lo que el corte de fin de mes intentaba lograr (que el
  // colegio vea el mes completo) ya lo cubre «Previsto», que enseña la cuota
  // sin inventarle una deuda.
  const hasta = new Date().toISOString().slice(0, 10);

  // Un año activo por colegio; el índice parcial de la migración 0105 lo
  // garantiza, así que esto es un período por team con módulo escolar en uso.
  //
  // Se trae de paso la línea de corte de la facturación automática: sin ella el
  // colegio solo devenga, que es como funcionó siempre.
  const activos = await db
    .select({
      teamId: adminEscolarPeriodos.teamId,
      id: adminEscolarPeriodos.id,
      facturarDesde: teams.escolarFacturacionAutomaticaDesde,
    })
    .from(adminEscolarPeriodos)
    .innerJoin(teams, eq(teams.id, adminEscolarPeriodos.teamId))
    .where(eq(adminEscolarPeriodos.activo, true));

  const detalle: {
    teamId: number;
    cargosCreados: number;
    noGeneradas?: number;
    facturas?: number;
    cargosFacturados?: number;
    montoFacturado?: number;
    noFacturadas?: number;
    error?: string;
  }[] = [];
  let creados = 0;
  let facturas = 0;

  for (const periodo of activos) {
    // Un colegio con la configuración a medias no puede dejar sin devengar a
    // los demás: se anota el fallo y se sigue.
    try {
      const r = await devengarPeriodo(periodo.teamId, periodo.id, hasta);
      creados += r.cargosCreados;

      // Facturación automática: solo para el colegio que la encendió, y solo de
      // su línea de corte en adelante. `facturarDesde` es la fecha desde la que
      // el calendario manda; nunca se factura una cuota anterior a ella.
      let fact: Awaited<ReturnType<typeof facturarCuotasEmitidas>> | null = null;
      if (periodo.facturarDesde) {
        const ventana = restarDias(hasta, DIAS_RECUPERACION);
        const desde = periodo.facturarDesde > ventana ? periodo.facturarDesde : ventana;
        fact = await facturarCuotasEmitidas(periodo.teamId, periodo.id, { desde, hasta });
        facturas += fact.facturas.length;
      }

      // El diagnóstico (cuotas válidas que no salieron) viaja en la respuesta
      // para que un pendiente que no se facturó tenga un motivo visible (#5).
      detalle.push({
        teamId: periodo.teamId,
        cargosCreados: r.cargosCreados,
        ...(r.diagnostico.length ? { noGeneradas: r.diagnostico.length } : {}),
        ...(fact ? {
          facturas: fact.facturas.length,
          cargosFacturados: fact.cargosFacturados,
          montoFacturado: fact.montoCentavos,
          ...(fact.diagnostico.length ? { noFacturadas: fact.diagnostico.length } : {}),
        } : {}),
      });
    } catch (e: unknown) {
      detalle.push({
        teamId: periodo.teamId,
        cargosCreados: 0,
        error: e instanceof Error ? e.message : 'error desconocido',
      });
    }
  }

  return NextResponse.json({
    hasta,
    colegios: activos.length,
    cargosCreados: creados,
    facturasCreadas: facturas,
    detalle,
    timestamp: new Date().toISOString(),
  });
}
