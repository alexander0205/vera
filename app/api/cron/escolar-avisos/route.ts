import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import {
  avisosDeHoy, candidatos, despachar, equiposConAvisos,
  type AvisoPendiente, type EnvioHecho,
} from '@/lib/administracion-escolar/avisos';
import { canalesDelColegio } from '@/lib/administracion-escolar/canales';
import { enviarAvisoCobroEmail } from '@/lib/email/escolar-avisos';
import { enviarWhatsApp } from '@/lib/whatsapp/enviar';
import { enviarSms } from '@/lib/sms/enviar';

/**
 * Los recordatorios de cobro del módulo escolar.
 *
 * Corre a diario porque los avisos son de un día concreto: «cinco días antes
 * de que salga la factura» solo es hoy una vez. A diferencia del devengo, que
 * se puede poner al día porque la deuda no caduca, un aviso que no salió el
 * día que tocaba ya no sirve — no se recupera mañana.
 *
 * ⚠️ APAGADO POR DEFECTO. Sin `ESCOLAR_AVISOS_ACTIVOS=1` calcula y devuelve el
 * plan sin mandar nada. Esto le escribe a familias reales: encenderlo en un
 * entorno con datos de producción copiados manda correos de verdad a padres de
 * verdad. Se enciende a propósito, no por despliegue.
 *
 * `?dry=1` fuerza el simulacro aunque esté encendido, para poder inspeccionar
 * qué saldría hoy sin mandarlo.
 *
 * HORARIO. En `vercel.json` corre cada quince minutos entre las 12 y las 15
 * UTC, que en la República Dominicana (UTC-4, sin horario de verano) son las
 * 8:00 y las 11:45 de la mañana. La primera tanda sale a las 8 en punto y las
 * demás recogen lo que no cupo. No se avisa de madrugada a propósito: un SMS
 * de cobro a las 3 AM despierta a una familia para nada.
 *
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const forzarSimulacro = req.nextUrl.searchParams.get('dry') === '1';
  const encendido = process.env.ESCOLAR_AVISOS_ACTIVOS === '1';
  const dryRun = forzarSimulacro || !encendido;

  /**
   * El tamaño de la tanda y el ritmo dentro de ella.
   *
   * No se manda el día entero de una vez: un colegio grande son más de mil
   * mensajes y WhatsApp lee esa ráfaga como abuso. Se manda de a poco, y lo
   * que sobra sale en las corridas siguientes —el cron repite cada cuarto de
   * hora durante la mañana y la tabla de idempotencia hace que cada corrida
   * siga donde quedó la anterior, sin repetirle nada a nadie.
   */
  const limite = Number(process.env.ESCOLAR_AVISOS_LOTE) || 60;
  const pausaMs = Number(process.env.ESCOLAR_AVISOS_PAUSA_MS) || 400;

  const hoy = new Date().toISOString().slice(0, 10);
  const equipos = await equiposConAvisos();
  if (equipos.length === 0) {
    return NextResponse.json({ hoy, dryRun, equipos: 0, avisos: 0, envios: [] });
  }

  const nombres = new Map(
    (await db.select({ id: teams.id, name: teams.name })
      .from(teams).where(inArray(teams.id, equipos)))
      .map((t) => [t.id, t.name]),
  );

  const resumen: {
    teamId: number; colegio: string; candidatos: number;
    pendientes: number; envios: EnvioHecho[];
  }[] = [];

  // El presupuesto de la tanda es de la CORRIDA, no de cada colegio: si el
  // primero se lleva los sesenta mensajes, el segundo espera al cuarto de hora
  // siguiente. Repartirlo por colegio multiplicaría la ráfaga por el número de
  // colegios, que es justo lo que se quiere evitar.
  let presupuesto = limite;

  for (const teamId of equipos) {
    if (presupuesto <= 0 && !dryRun) break;
    // El interruptor maestro del colegio se lee UNA vez por colegio, no por
    // cargo: es la misma respuesta para los cientos de filas de abajo.
    const canales = await canalesDelColegio(teamId);
    const filas = await candidatos(teamId);
    const pendientes: AvisoPendiente[] = filas.flatMap((f) => avisosDeHoy(f, hoy, canales));
    const colegio = nombres.get(teamId) ?? 'Tu colegio';

    const envios = await despachar(pendientes, {
      dryRun,
      colegio,
      limite: presupuesto,
      pausaMs,
      enviar: {
        correo: (destino, texto, p) => enviarAvisoCobroEmail({
          email: destino,
          colegio,
          asunto: p.aviso === 'al-vencer' ? 'Tu factura venció hoy'
            : p.aviso === 'al-emitir' ? 'Tienes una factura nueva'
            : 'Tu factura está próxima a vencer',
          texto,
        }),
        whatsapp: async (destino, texto) => { await enviarWhatsApp(teamId, destino, texto); },
        sms: async (destino, texto) => { await enviarSms(teamId, destino, texto); },
      },
    });

    // Solo cuentan los que de verdad salieron: un tutor sin correo no gasta
    // cupo de la tanda, porque tampoco gastó una llamada al proveedor.
    presupuesto -= envios.filter((e) => e.ok).length;
    resumen.push({ teamId, colegio, candidatos: filas.length, pendientes: pendientes.length, envios });
  }

  const fallos = resumen.flatMap((r) => r.envios).filter((e) => !e.ok);
  // Los fallos se cuentan aparte en la respuesta y se registran: el más común
  // es un tutor sin correo o con un teléfono que no normaliza, y eso hay que
  // ir a corregirlo a mano en la ficha. Si solo se contaran los éxitos, la
  // secretaria vería «todo bien» mientras a dos padres nunca les llega nada.
  if (fallos.length > 0) {
    console.warn('[cron.escolar-avisos] avisos que no salieron', {
      hoy, dryRun, fallos: fallos.length,
      detalle: fallos.map((f) => ({ cargo: f.cargoId, canal: f.canal, error: f.error })),
    });
  }

  const enviados = resumen.flatMap((r) => r.envios).filter((e) => e.ok).length;
  return NextResponse.json({
    hoy,
    dryRun,
    motivoSimulacro: dryRun
      ? (forzarSimulacro ? 'pedido con ?dry=1' : 'ESCOLAR_AVISOS_ACTIVOS no está en 1')
      : null,
    lote: { limite, pausaMs, agotado: !dryRun && presupuesto <= 0 },
    equipos: equipos.length,
    avisos: resumen.reduce((n, r) => n + r.pendientes, 0),
    enviados,
    fallidos: fallos.length,
    resumen,
  });
}
