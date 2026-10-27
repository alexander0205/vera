import { NextRequest, NextResponse } from 'next/server';
import { hoyRD } from '@/lib/utils/format';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';
import { procesarAvisosCorrida, type DepsCorrida } from '@/lib/administracion-escolar/corrida-proceso';
import {
  avisosYaEnviados,
  cargarContextoColegio,
  descubrirCorridas,
  destinatariosPorColegio,
  facturasCreadasEl,
  registrarEnvio,
} from '@/lib/administracion-escolar/corrida-datos';
import { armarCorreoCorrida, enviarAvisoCorrida } from '@/lib/email/escolar-corrida';

/**
 * Los tres avisos de la corrida de facturación del colegio.
 *
 * A las 3:00 a. m. el cron `escolar-devengo` crea los cargos del día y, en los
 * colegios que lo pidieron, sus facturas. El colegio no ve nada de eso: se
 * entera por lo que falta o por lo que sobra. Esto le cuenta lo que va a pasar
 * y lo que pasó, a quien administra (owner y admin):
 *
 *   · 5 días antes   «Así va a salir la facturación del …»  con el SIMULACRO
 *   · 2 días antes   «Pasado mañana se factura»
 *   · el mismo día   «Resultado de la facturación de hoy»   ya pasada la corrida
 *
 * Si el colegio factura solo, el correo dice qué va a generar Zero; si no, es el
 * recordatorio de que le toca facturar a él.
 *
 * Nunca manda un aviso dos veces: cada envío deja una fila en `audit_logs`
 * (acción `ESCOLAR_AVISO_CORRIDA`, recurso `tipo:fecha`) y se consulta antes de
 * mandar. No hace falta migración.
 *
 * ⚠️ INTERRUPTOR. Con `ESCOLAR_AVISOS_CORRIDA_OFF=1` calcula todo y devuelve lo
 * que mandaría, sin enviar ni anotar nada. `?simular=1` hace lo mismo a pedido,
 * y con `&hoy=YYYY-MM-DD` permite ver qué saldría otro día (solo en simulacro:
 * una fecha pasada a mano jamás manda correos).
 *
 * HORARIO. `0 12 * * *` UTC son las 8:00 a. m. en la República Dominicana (UTC-4,
 * sin horario de verano): cinco horas después de la corrida de las 3:00 a. m.,
 * así que el resultado ya existe cuando se cuenta.
 *
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */

export const maxDuration = 120;

const deps: DepsCorrida = {
  descubrir: descubrirCorridas,
  destinatarios: destinatariosPorColegio,
  yaEnviados: avisosYaEnviados,
  cargarContexto: cargarContextoColegio,
  facturasCreadasEl,
  asunto: (d) => armarCorreoCorrida(d).asunto,
  enviar: enviarAvisoCorrida,
  registrar: registrarEnvio,
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!llamadaDeCronValida(authHeader)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const pidioSimular = req.nextUrl.searchParams.get('simular') === '1';
  const apagado = process.env.ESCOLAR_AVISOS_CORRIDA_OFF === '1';
  const soloSimular = pidioSimular || apagado;

  // La fecha de otro día solo se acepta para mirar, nunca para mandar.
  const pedida = req.nextUrl.searchParams.get('hoy');
  const hoy = soloSimular && pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoyRD();

  // Los colegios que facturan a mano solo reciben avisos si se enciende a
  // propósito: hoy solo los pidió el colegio con facturación automática.
  const incluirManual = process.env.ESCOLAR_AVISOS_CORRIDA_MANUAL === '1';
  const r = await procesarAvisosCorrida(deps, { hoy, soloSimular, incluirManual });

  return NextResponse.json({
    hoy,
    simulacro: soloSimular,
    motivoSimulacro: !soloSimular ? null
      : apagado ? 'ESCOLAR_AVISOS_CORRIDA_OFF está en 1' : 'pedido con ?simular=1',
    colegios: r.colegios,
    avisos: r.avisos.length,
    enviados: r.enviados,
    omitidos: r.omitidos.length,
    fallidos: r.fallos.length,
    detalle: r.avisos,
    omisiones: r.omitidos,
    fallos: r.fallos,
    timestamp: new Date().toISOString(),
  });
}
