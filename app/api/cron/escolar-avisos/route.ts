import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import {
  avisosDeHoy, candidatos, canalesSinWhatsApp, despachar, equiposConAvisos, mensajesEnviados,
  type AvisoPendiente, type EnvioHecho,
} from '@/lib/administracion-escolar/avisos';
import { asuntoDeAviso, datosWhatsAppDeGrupo, sufijoDeBoton } from '@/lib/administracion-escolar/agrupar-avisos';
import { canalesDelColegio } from '@/lib/administracion-escolar/canales';
import { enviarAvisoCobroEmail } from '@/lib/email/escolar-avisos';
import { enviarWhatsAppPlantilla } from '@/lib/whatsapp/enviar';
import { getPlantillasDeTeam, huecoDe, parametrosDeAviso, plantillaParaEnviar } from '@/lib/whatsapp/plantillas';
import { CRM_SOPORTA_BOTONES } from '@/lib/whatsapp/client';
import { aE164 } from '@/lib/whatsapp/telefono';
import { reconciliarEntregas } from '@/lib/administracion-escolar/entregas';
import { enviarSms } from '@/lib/sms/enviar';
import { cuotaAvisos } from '@/lib/suscripcion/cuota-avisos';
import { equiposConProcesosVivos } from '@/lib/suscripcion/procesos';
import { AL_CANCELAR } from '@/lib/config/suscripcion';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

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
 * UN MENSAJE POR FAMILIA. Los cargos de un mismo responsable de pago que caen el
 * mismo día, en el mismo momento y por el mismo canal salen juntos (ver
 * `agruparPendientes`): tres hermanos son un correo, un WhatsApp y un SMS, no
 * nueve. Por eso aquí todo lo que se cuenta —el lote, la cuota, `enviados`— son
 * MENSAJES; `cobrosAvisados` es la cuenta por cargo.
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
  if (!llamadaDeCronValida(authHeader)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const forzarSimulacro = req.nextUrl.searchParams.get('dry') === '1';
  const encendido = process.env.ESCOLAR_AVISOS_ACTIVOS === '1';
  const dryRun = forzarSimulacro || !encendido;

  /**
   * El tamaño de la tanda y el ritmo dentro de ella.
   *
   * Son mensajes, no cargos: una familia con tres hijos gasta uno por canal.
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
    pendientes: number; whatsappSinPlantilla: number; envios: EnvioHecho[];
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
    const crudos: AvisoPendiente[] = filas.flatMap((f) => avisosDeHoy(f, hoy, canales));

    // Un cobro sin plantilla de WhatsApp que se pueda mandar no va por WhatsApp
    // (ver `plantillaParaEnviar`): va por SMS en su lugar, si el colegio y el
    // concepto lo tienen encendido (`canalesSinWhatsApp`). Se decide ANTES de
    // despachar: así el WhatsApp no se reserva, no cuenta como fallo y no se
    // reintenta cada cuarto de hora. El correo del mismo cobro sigue igual.
    const plantillasDelColegio = await getPlantillasDeTeam(teamId);
    let whatsappSinPlantilla = 0;
    const pendientes: AvisoPendiente[] = crudos.map((p) => {
      if (!p.canales.includes('whatsapp')) return p;
      const hueco = huecoDe(p.aviso, p.fila.cobraMora, p.fila.moraDiasGracia);
      const asignada = plantillasDelColegio.find((x) => x.aviso === hueco) ?? null;
      const hayEnlace = p.fila.clientId != null && p.fila.ecfDocumentId != null;
      if (plantillaParaEnviar(asignada, hayEnlace, CRM_SOPORTA_BOTONES)) return p;
      whatsappSinPlantilla++;
      return { ...p, canales: canalesSinWhatsApp(p.canales, p.fila, canales) };
    }).filter((p) => p.canales.length > 0);
    if (whatsappSinPlantilla > 0) {
      console.warn(`[avisos] team ${teamId}: ${whatsappSinPlantilla} cobro(s) sin plantilla de WhatsApp; no van por WhatsApp (van por SMS si está encendido).`);
    }
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
        correo: (destino, texto, m) => enviarAvisoCobroEmail({
          email: destino,
          colegio,
          asunto: asuntoDeAviso(m.aviso, m.miembros.length),
          texto,
          // La lista de varios cobros necesita sus saltos de línea. El de un
          // solo cobro sale como siempre.
          multilinea: m.miembros.length > 1,
        }),
        /**
         * WhatsApp va SOLO por plantilla aprobada y asignada, nunca en texto
         * libre (ver `plantillaParaEnviar`).
         *
         * Los cobros sin plantilla ya llegan aquí sin el canal WhatsApp: se lo
         * quita el filtro de arriba. Esto es la última red por si el mensaje
         * agrupado acaba distinto de lo que se previó (p. ej. sin enlace de
         * pago para el botón): se lanza y el aviso cuenta como fallido.
         *
         * Con factura emitida va la versión del botón «Ver y pagar»; sin
         * factura, la de siempre. `enlace` ya viene en null cuando el cargo no
         * tiene factura —lo decide `despachar`— así que basta con mirarlo.
         */
        whatsapp: async (destino, _texto, m, enlace) => {
          // Al CRM siempre con código de país: `8293596602` y `18293596602`
          // le abren DOS conversaciones del mismo padre.
          const numero = aE164(destino) ?? destino;

          // Todos los cobros de un mensaje comparten hueco (así se agrupan).
          const asignada = plantillasDelColegio.find((x) => x.aviso === m.hueco) ?? null;
          const plantilla = plantillaParaEnviar(asignada, enlace != null, CRM_SOPORTA_BOTONES);
          if (!plantilla) {
            throw new Error('Sin plantilla de WhatsApp que se pueda mandar: no se envía texto libre.');
          }

          const r = await enviarWhatsAppPlantilla(teamId, numero, {
            nombre: plantilla.nombre,
            idioma: plantilla.idioma,
            // La {{1}} del botón es el FINAL de la URL (`…/pagar/{{1}}`): el
            // token y la factura, no la URL entera.
            botonUrl: plantilla.conBoton && enlace ? sufijoDeBoton(enlace) : null,
            // La MISMA plantilla aprobada con las variables combinadas cuando
            // son varios cobros (alumno «Ana y Pedro», concepto «Colegiatura
            // (2)», monto el total). Con uno solo, los valores de siempre.
            // La fecha del recargo es la del RECARGO y no la del vencimiento,
            // igual que en `redactar()`: decirle que pague «antes del 3»
            // cuando el recargo entra el 8 le quita cinco días que tiene.
            parametros: parametrosDeAviso(
              m.hueco,
              datosWhatsAppDeGrupo(m.miembros, {
                colegio,
                telefonoColegio: telefonos.get(teamId) ?? '',
              }),
            ),
          });
          return r.messageId ?? null;
        },
        sms: async (destino, texto) => { await enviarSms(teamId, destino, texto); },
      },
    });

    // Solo cuentan los que de verdad salieron: un tutor sin correo no gasta
    // cupo de la tanda, porque tampoco gastó una llamada al proveedor. Y se
    // cuentan MENSAJES: tres hermanos en un correo gastan uno.
    presupuesto -= mensajesEnviados(envios);

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
    resumen.push({ teamId, colegio, candidatos: filas.length, pendientes: pendientes.length, whatsappSinPlantilla, envios });
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

  const cobrosAvisados = todos.filter((e) => e.ok).length;
  // Mensajes distintos, no filas: en simulacro es lo que SALDRÍA.
  const enviados = mensajesEnviados(todos);
  return NextResponse.json({
    hoy,
    dryRun,
    motivoSimulacro: dryRun
      ? (forzarSimulacro ? 'pedido con ?dry=1' : 'ESCOLAR_AVISOS_ACTIVOS no está en 1')
      : null,
    lote: { limite, pausaMs, agotado: !dryRun && presupuesto <= 0 },
    equipos: equipos.length,
    avisos: resumen.reduce((n, r) => n + r.pendientes, 0),
    // Cobros que hoy no salieron por WhatsApp por no tener plantilla (fueron por
    // SMS si el colegio lo tiene): hay que asignarla, y Meta aprobarla.
    whatsappSinPlantilla: resumen.reduce((n, r) => n + r.whatsappSinPlantilla, 0),
    enviados,
    // Cuántos cargos cubrieron esos mensajes. Igual a `enviados` cuando nadie
    // tiene hermanos; mayor cuando una familia recibió un solo mensaje por varios.
    cobrosAvisados,
    fallidos: fallos.length,
    sinCupo: sinCupo.length,
    // Colegios que hoy no recibieron nada por no tener plan vivo. Va explícito
    // para que un cero de enviados se pueda distinguir de «no había nada que
    // mandar».
    sinPlan: cortados.length,
    resumen,
  });
}
