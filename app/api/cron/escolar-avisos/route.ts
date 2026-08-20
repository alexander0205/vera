import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import {
  avisosDeHoy, candidatos, despachar, equiposConAvisos, pesos, enLetra,
  type AvisoPendiente, type EnvioHecho,
} from '@/lib/administracion-escolar/avisos';
import { sumarDias } from '@/lib/administracion-escolar/calendario';
import { canalesDelColegio } from '@/lib/administracion-escolar/canales';
import { enviarAvisoCobroEmail } from '@/lib/email/escolar-avisos';
import { enviarWhatsApp, enviarWhatsAppPlantilla } from '@/lib/whatsapp/enviar';
import { resolverPlantilla, parametrosDeAviso, huecoDe } from '@/lib/whatsapp/plantillas';
import { CRM_SOPORTA_BOTONES } from '@/lib/whatsapp/client';
import { aE164 } from '@/lib/whatsapp/telefono';
import { reconciliarEntregas } from '@/lib/administracion-escolar/entregas';
import { enviarSms } from '@/lib/sms/enviar';
import { cuotaAvisos } from '@/lib/suscripcion/cuota-avisos';
import { equiposConProcesosVivos } from '@/lib/suscripcion/procesos';
import { AL_CANCELAR } from '@/lib/config/suscripcion';

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
  /**
   * 1100 ms y no 400: el CRM corta a 60 peticiones por minuto POR LLAVE, y la
   * llave es la de Zero para todos los colegios que no conectaron su número —
   * o sea, casi todos comparten el mismo cupo. A 400 ms la tanda iba a 150 por
   * minuto, dos veces y media por encima del tope, y lo que sobraba volvía
   * como 429. A 1100 caben unos 54 por minuto, justo por debajo.
   */
  const pausaMs = Number(process.env.ESCOLAR_AVISOS_PAUSA_MS) || 1100;

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

  // El teléfono del colegio va DENTRO del mensaje: el aviso sale por el número
  // de Zero, así que sin él el padre no tiene a quién llamar y contesta a
  // nuestro buzón.
  const telefonos = new Map(
    (await db.select({ id: teams.id, telefono: teams.telefono })
      .from(teams).where(inArray(teams.id, equipos)))
      .map((t) => [t.id, t.telefono]),
  );

  // Cada WhatsApp y cada SMS nos los factura el proveedor. Un colegio que
  // canceló no debe seguir generando esa factura —ni mandando recordatorios de
  // cobro a nombre de un cliente que ya no lo es—. No se le apaga su
  // configuración de canales: al reactivar, los avisos vuelven como estaban.
  const conProcesos = AL_CANCELAR.cortarAvisos
    ? await equiposConProcesosVivos(equipos)
    : null;
  const cortados: number[] = [];

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
    if (conProcesos && !conProcesos.has(teamId)) {
      cortados.push(teamId);
      continue;
    }
    // El interruptor maestro del colegio se lee UNA vez por colegio, no por
    // cargo: es la misma respuesta para los cientos de filas de abajo.
    const canales = await canalesDelColegio(teamId);
    const filas = await candidatos(teamId);
    const pendientes: AvisoPendiente[] = filas.flatMap((f) => avisosDeHoy(f, hoy, canales));
    const colegio = nombres.get(teamId) ?? 'Tu colegio';

    // Lo que le queda al colegio de su cuota MENSUAL de WhatsApp y SMS. Es un
    // conteo por colegio y no de la corrida: el presupuesto de arriba reparte
    // la ráfaga en el tiempo, esto es lo que compró.
    const cuota = await cuotaAvisos(teamId);

    const envios = await despachar(pendientes, {
      dryRun,
      colegio,
      limite: presupuesto,
      pausaMs,
      restantePorCanal: cuota.restante,
      enviar: {
        correo: (destino, texto, p) => enviarAvisoCobroEmail({
          email: destino,
          colegio,
          asunto: p.aviso === 'al-vencer' ? 'Tu factura venció hoy'
            : p.aviso === 'al-emitir' ? 'Tienes una factura nueva'
            : 'Tu factura está próxima a vencer',
          texto,
        }),
        /**
         * WhatsApp va por PLANTILLA, no por texto libre.
         *
         * El texto libre solo pasa dentro de las 24 h siguientes al último
         * mensaje del contacto, y un padre al que hay que recordarle una
         * mensualidad lleva semanas sin escribirnos: fuera de esa ventana el
         * `{to, text}` devuelve 422 y el aviso no sale. La plantilla es la
         * única forma de llegarle.
         *
         * Si el colegio no tiene plantilla asignada para este hueco se cae al
         * texto libre a propósito: dentro de la ventana sí llega, y es mejor
         * que no mandar nada mientras se configura.
         */
        whatsapp: async (destino, texto, p, enlace) => {
          // Al CRM siempre con código de país: `8293596602` y `18293596602`
          // le abren DOS conversaciones del mismo padre.
          const numero = aE164(destino) ?? destino;

          const plantilla = await resolverPlantilla(
            teamId, p.aviso, p.fila.cobraMora, p.fila.moraDiasGracia,
          );
          /**
           * Sin plantilla asignada, o con una que lleva botón, se manda texto
           * libre.
           *
           * Lo del botón no es un capricho: su URL lleva variable y rellenarla
           * necesita un parámetro de tipo `button` que el CRM todavía no
           * expone, así que el envío fallaría entero. Mejor el texto libre
           * —que al menos llega dentro de la ventana de 24 h— y un aviso en el
           * log que decir que salió cuando no salió.
           */
          /**
           * Cuál de las dos versiones del aviso sale.
           *
           * Con factura emitida va la del botón «Ver factura»; sin factura, la
           * de siempre. No es estético: un cargo sin factura no se puede
           * cobrar, así que el enlace llevaría al padre a transferir y subir su
           * comprobante para que el colegio no pueda aplicarlo.
           *
           * `enlace` ya viene en null cuando el cargo no tiene factura —lo
           * decide `despachar`— así que basta con mirarlo.
           */
          const usarConLink = enlace != null && plantilla?.nombreConLink != null;
          const nombre = usarConLink ? plantilla!.nombreConLink! : plantilla?.nombre;
          const necesitaBoton = usarConLink ? plantilla!.conLinkTieneBoton : plantilla?.conBoton === true;

          // El botón lleva variable en la URL y rellenarla necesita un
          // parámetro que el CRM todavía no expone: la plantilla se manda y
          // Meta la rechaza por parámetros. Mejor texto libre —que dentro de la
          // ventana de 24 h sí llega— que decir que salió cuando no salió.
          const botonInservible = necesitaBoton && !CRM_SOPORTA_BOTONES;
          if (!plantilla || !nombre || botonInservible) {
            if (botonInservible) {
              console.warn(
                `[avisos] "${nombre}" tiene botón y el CRM aún no puede rellenarlo; va como texto libre.`,
              );
            }
            const libre = await enviarWhatsApp(teamId, numero, texto);
            return libre.messageId ?? null;
          }

          const r = await enviarWhatsAppPlantilla(teamId, numero, {
            nombre,
            idioma: plantilla.idioma,
            // El enlace del padre, que es lo que rellena la {{1}} del botón.
            botonUrl: necesitaBoton ? enlace : null,
            parametros: parametrosDeAviso(
              huecoDe(p.aviso, p.fila.cobraMora, p.fila.moraDiasGracia),
              {
                colegio,
                concepto: p.fila.concepto,
                estudiante: p.fila.estudiante,
                monto: pesos(p.fila.saldoCentavos),
                telefonoColegio: telefonos.get(teamId) ?? '',
                fechaLimite: p.fila.fechaVencimiento
                  ? enLetra(p.fila.fechaVencimiento) : null,
                diasGracia: p.fila.moraDiasGracia,
                // La fecha del RECARGO, no la del vencimiento — igual que en
                // `redactar()`. Decirle que pague «antes del 3» cuando el
                // recargo entra el 8 le quita cinco días que tiene.
                fechaRecargo: p.fila.fechaVencimiento
                  ? enLetra(sumarDias(p.fila.fechaVencimiento, Math.max(0, p.fila.moraDiasGracia)))
                  : null,
              },
            ),
          });
          return r.messageId ?? null;
        },
        sms: async (destino, texto) => { await enviarSms(teamId, destino, texto); },
      },
    });

    // Solo cuentan los que de verdad salieron: un tutor sin correo no gasta
    // cupo de la tanda, porque tampoco gastó una llamada al proveedor.
    presupuesto -= envios.filter((e) => e.ok).length;

    /**
     * Antes de terminar, preguntar por los acuses de las corridas anteriores.
     *
     * Va DESPUÉS de mandar y no antes para no gastarle tiempo a la tanda del
     * día. Lo que falló hoy se suelta y sale en la corrida siguiente —el cron
     * repite cada quince minutos toda la mañana—, así que un fallo pasajero se
     * reintenta solo. Lo que falló ayer se queda anotado para el health, pero
     * no vuelve a salir: un aviso es de un día concreto.
     */
    if (!dryRun) {
      try {
        const acuses = await reconciliarEntregas(teamId);
        if (acuses.fallidos > 0) {
          console.warn('[avisos] entregas fallidas en', teamId, acuses.errores);
        }
      } catch (e) {
        console.error('[avisos] no se pudieron revisar los acuses:', e);
      }
    }
    resumen.push({ teamId, colegio, candidatos: filas.length, pendientes: pendientes.length, envios });
  }

  // Los cortados por cuota se cuentan aparte de los fallos de contacto. Son
  // dos problemas distintos con dos dueños distintos: uno lo arregla la
  // secretaria corrigiendo un teléfono, el otro lo arreglamos nosotros
  // vendiéndole un tramo mayor. Mezclados, el segundo no se ve nunca.
  const todos = resumen.flatMap((r) => r.envios);
  const sinCupo = todos.filter((e) => !e.ok && e.error?.startsWith('Cuota mensual'));
  const fallos = todos.filter((e) => !e.ok && !e.error?.startsWith('Cuota mensual'));

  if (sinCupo.length > 0) {
    console.warn('[cron.escolar-avisos] avisos NO enviados por cuota agotada', {
      hoy,
      total: sinCupo.length,
      porColegio: resumen
        .map((r) => ({
          colegio: r.colegio,
          n: r.envios.filter((e) => e.error?.startsWith('Cuota mensual')).length,
        }))
        .filter((x) => x.n > 0),
    });
  }
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

  const enviados = todos.filter((e) => e.ok).length;
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
    sinCupo: sinCupo.length,
    // Colegios que hoy no recibieron nada por no tener plan vivo. Va explícito
    // para que un cero de enviados se pueda distinguir de «no había nada que
    // mandar».
    sinPlan: cortados.length,
    resumen,
  });
}
