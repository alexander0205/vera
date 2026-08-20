/**
 * El aviso de un cargo ya facturado, mandado a mano.
 *
 *   GET  → qué se va a mandar y a quién, sin mandarlo
 *   POST → lo manda
 *
 * Hace falta porque el aviso automático sale una vez y en su día: si esa noche
 * el canal estaba caído, si el colegio facturó tarde, o si el padre dice que no
 * le llegó, no había forma de repetirlo — la tabla de idempotencia dice que ya
 * salió y el cron no lo reintenta.
 *
 * El GET no es un adorno: esto le escribe a una familia real, y quien pulsa el
 * botón tiene que poder leer antes el texto y el número. El texto cambia según
 * la mora del concepto, y el número es el que esté guardado, que no siempre es
 * el bueno.
 *
 * Solo con factura emitida: un cargo sin factura no se puede cobrar, y el aviso
 * llevaría un enlace que no sirve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarConceptosPago, adminEscolarEstudiantes,
  adminEscolarAvisosEnviados, clients, teams,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { enviarWhatsApp, enviarWhatsAppPlantilla, WhatsAppNoConectadoError } from '@/lib/whatsapp/enviar';
import { resolverPlantilla, parametrosDeAviso, huecoDe } from '@/lib/whatsapp/plantillas';
import { CRM_SOPORTA_BOTONES } from '@/lib/whatsapp/client';
import { aE164 } from '@/lib/whatsapp/telefono';
import { getOCrearLink, urlDelLink } from '@/lib/administracion-escolar/link-pago';
import { pesos, enLetra } from '@/lib/administracion-escolar/avisos';

/** Uno por cargo cada 24 horas. Ver `esperaRestante`. */
const HORAS_ENTRE_AVISOS = 24;

interface AvisoListo {
  destino: string;
  responsable: string;
  texto: string;
  enlace: string;
  /** null = va como texto libre. */
  nombrePlantilla: string | null;
  idioma: string;
  parametros: string[];
  botonUrl: string | null;
  /** Horas que faltan para poder repetirlo, o null si se puede ya. */
  esperaHoras: number | null;
}

/**
 * El cuerpo de la plantilla, con sus valores puestos.
 *
 * Se reconstruye aquí en vez de pedírselo a Meta: la previa tiene que salir al
 * instante al abrir el diálogo, y una llamada al CRM cada vez que alguien mira
 * un cargo es un viaje que no aporta — el texto es nuestro y los valores
 * también. Si se cambia la plantilla, hay que cambiarlo aquí: por eso la previa
 * dice de qué plantilla sale, para poder comprobarlo.
 */
function textoDePlantilla(p: string[], hueco: string): string {
  const [colegio, concepto, estudiante, monto] = p;
  const cola = hueco === 'al-vencer-con-gracia'
    ? `Tienes ${p[4]} días antes de que se aplique el recargo.`
    : hueco === 'al-vencer-con-recargo'
      ? 'Ya se aplicó el recargo por mora.'
      : 'Puedes pagarlo para ponerte al día.';
  return `Te escribimos de *${colegio}*.\n\n`
    + `Hoy venció el cobro de *${concepto}* para ${estudiante}.\n\n`
    + `Monto: *${monto}*\n${cola}\n`
    + `Contacto del colegio: ${p.at(-1)}\n\n`
    + 'Si ya realizaste el pago, ignora este mensaje.';
}

/**
 * Horas que faltan para poder volver a avisar de este cargo, o null si ya.
 *
 * Dos recordatorios del mismo cobro el mismo día es lo que hace que una familia
 * bloquee el número del colegio — y con el número bloqueado se pierden TODOS
 * los avisos, también los que sí importan.
 */
async function esperaRestante(teamId: number, cargoId: number): Promise<number | null> {
  const desde = new Date(Date.now() - HORAS_ENTRE_AVISOS * 3600_000);
  const [ultimo] = await db
    .select({ enviadoAt: adminEscolarAvisosEnviados.enviadoAt })
    .from(adminEscolarAvisosEnviados)
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      eq(adminEscolarAvisosEnviados.cargoId, cargoId),
      eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
      gte(adminEscolarAvisosEnviados.enviadoAt, desde),
    ))
    .orderBy(desc(adminEscolarAvisosEnviados.enviadoAt))
    .limit(1);

  if (!ultimo) return null;
  return Math.max(1, Math.ceil(
    (ultimo.enviadoAt.getTime() + HORAS_ENTRE_AVISOS * 3600_000 - Date.now()) / 3600_000,
  ));
}

/**
 * Resuelve el aviso sin mandarlo. Lo comparten el GET y el POST para que la
 * previa y el envío no puedan decir cosas distintas.
 */
async function armarAviso(
  teamId: number, cargoId: number,
): Promise<AvisoListo | { error: string; status: number }> {
  const [fila] = await db
    .select({
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      concepto: adminEscolarConceptosPago.nombre,
      cobraMora: adminEscolarConceptosPago.cobraMora,
      moraDiasGracia: adminEscolarConceptosPago.moraDiasGracia,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      clientId: clients.id,
      responsable: clients.razonSocial,
      whatsapp: clients.whatsapp,
      celular: clients.celular,
      colegio: teams.name,
      telefonoColegio: teams.telefono,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
    .innerJoin(teams, eq(teams.id, adminEscolarCargos.teamId))
    .leftJoin(clients, eq(clients.id, adminEscolarEstudiantes.facturarAClientId))
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);

  if (!fila) return { error: 'Cargo no encontrado', status: 404 };
  if (fila.ecfDocumentId == null) {
    return {
      error: 'Este cargo todavía no tiene factura. Factúralo primero: sin factura no se puede cobrar.',
      status: 409,
    };
  }
  if (fila.clientId == null) {
    return { error: 'El alumno no tiene responsable de pago', status: 409 };
  }

  // Al CRM siempre con código de país, o abre otra conversación del mismo padre.
  const destino = aE164(fila.whatsapp ?? fila.celular);
  if (!destino) {
    return {
      error: 'El responsable no tiene WhatsApp ni celular. El teléfono fijo no recibe mensajes.',
      status: 409,
    };
  }

  const estudiante = `${fila.nombres} ${fila.apellidos ?? ''}`.trim();
  const enlace = urlDelLink((await getOCrearLink(teamId, fila.clientId)).token);

  /**
   * Se manda el aviso de VENCIMIENTO, no el de «ya está lista».
   *
   * Este botón se usa cuando el padre no pagó y hay que insistir, no el día que
   * salió la factura. Mandar «ya está lista tu factura» dos semanas después
   * suena a que el colegio no sabe lo que ya avisó.
   */
  const hueco = huecoDe('al-vencer', fila.cobraMora, fila.moraDiasGracia);
  const plantilla = await resolverPlantilla(teamId, 'al-vencer', fila.cobraMora, fila.moraDiasGracia);

  // Con factura hay enlace, así que va la versión con botón si está puesta.
  const usarConLink = plantilla?.nombreConLink != null;
  const nombre = usarConLink ? plantilla!.nombreConLink! : plantilla?.nombre;
  const necesitaBoton = usarConLink ? plantilla!.conLinkTieneBoton : plantilla?.conBoton === true;
  const porPlantilla = plantilla != null && nombre != null && !(necesitaBoton && !CRM_SOPORTA_BOTONES);

  const parametros = plantilla
    ? parametrosDeAviso(hueco, {
        colegio: fila.colegio,
        concepto: fila.concepto,
        estudiante,
        monto: pesos(fila.saldoCentavos),
        telefonoColegio: fila.telefonoColegio ?? '',
        diasGracia: fila.moraDiasGracia,
        fechaRecargo: fila.fechaVencimiento ? enLetra(String(fila.fechaVencimiento)) : null,
      })
    : [];

  const textoLibre = `Hoy venció el cobro de ${fila.concepto} de ${estudiante}: ${pesos(fila.saldoCentavos)}.`
    + `\n\nPaga o sube tu comprobante aquí: ${enlace}`;

  return {
    destino,
    responsable: fila.responsable ?? '',
    // Lo que se enseña en la previa es lo que va a leer el padre: si sale por
    // plantilla, el texto se arma con sus valores reales, no el libre.
    texto: porPlantilla ? textoDePlantilla(parametros, hueco) : textoLibre,
    enlace,
    nombrePlantilla: porPlantilla ? nombre! : null,
    idioma: plantilla?.idioma ?? 'es',
    parametros,
    botonUrl: necesitaBoton ? enlace : null,
    esperaHoras: await esperaRestante(teamId, cargoId),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const cargoId = Number((await params).id);
  if (!Number.isInteger(cargoId)) {
    return NextResponse.json({ error: 'Id no válido' }, { status: 400 });
  }

  const aviso = await armarAviso(auth.teamId, cargoId);
  // Un 200 con `puede:false` y no un error: el diálogo tiene que poder explicar
  // POR QUÉ no se puede, y un 409 al cargar se lee como que algo se rompió.
  if ('error' in aviso) return NextResponse.json({ puede: false, motivo: aviso.error });

  return NextResponse.json({
    puede: aviso.esperaHoras == null,
    motivo: aviso.esperaHoras != null
      ? `Ya se le avisó de este cobro hoy. Podrás repetirlo en ${aviso.esperaHoras} hora(s).`
      : null,
    destino: aviso.destino,
    responsable: aviso.responsable,
    texto: aviso.texto,
    plantilla: aviso.nombrePlantilla,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const cargoId = Number((await params).id);
  if (!Number.isInteger(cargoId)) {
    return NextResponse.json({ error: 'Id no válido' }, { status: 400 });
  }

  const aviso = await armarAviso(auth.teamId, cargoId);
  if ('error' in aviso) {
    return NextResponse.json({ error: aviso.error }, { status: aviso.status });
  }

  // Se comprueba aquí y no con el índice único de la tabla: ese rebota la
  // anotación, pero el mensaje ya habría salido.
  if (aviso.esperaHoras != null) {
    return NextResponse.json(
      {
        error: `Ya se le avisó de este cobro hoy. Puedes volver a intentarlo en ${aviso.esperaHoras} hora(s).`,
        esperaHoras: aviso.esperaHoras,
      },
      { status: 429 },
    );
  }

  try {
    const r = aviso.nombrePlantilla
      ? await enviarWhatsAppPlantilla(auth.teamId, aviso.destino, {
          nombre: aviso.nombrePlantilla,
          idioma: aviso.idioma,
          botonUrl: aviso.botonUrl,
          parametros: aviso.parametros,
        })
      : await enviarWhatsApp(auth.teamId, aviso.destino, aviso.texto);

    /**
     * Se anota como un aviso más, con su `mensaje_id`, para que la
     * reconciliación de entregas lo revise igual que a los automáticos. Un
     * reenvío a mano que falla en silencio es exactamente el problema que este
     * botón viene a resolver.
     *
     * `offsetDias: -1` lo distingue de los del cron sin chocar con su índice
     * único. El tope de 24 h de arriba es lo que impide repetirlo, no el índice.
     */
    await db.insert(adminEscolarAvisosEnviados).values({
      teamId: auth.teamId,
      cargoId,
      tipo: 'al-vencer',
      offsetDias: -1,
      canal: 'whatsapp',
      destino: aviso.destino,
      mensajeId: r.messageId ?? null,
    }).onConflictDoNothing();

    return NextResponse.json({ ok: true, destino: aviso.destino, messageId: r.messageId });
  } catch (e) {
    if (e instanceof WhatsAppNoConectadoError) {
      return NextResponse.json(
        { error: 'WhatsApp no está conectado. Revísalo en Configuración → Avisos.' },
        { status: 409 },
      );
    }
    console.error('[reenviar-aviso]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo enviar el aviso' },
      { status: 502 },
    );
  }
}
