/**
 * Estado de la conexión de WhatsApp, para el admin de la plataforma.
 *
 * Responde dos preguntas que hasta ahora solo se podían contestar entrando a
 * la base y al panel del CRM: ¿el número de Zero puede enviar?, y ¿quién está
 * saliendo por él?
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, whatsappConfig, adminEscolarAvisosEnviados } from '@/lib/db/schema';
import { generarConnectUrl, WhatsAppApiError, type EstadoConexionCrm } from './client';

export interface EstadoZero {
  /** Las dos variables de entorno están puestas. */
  configurado: boolean;
  /** Hay número y token vinculados. NO significa que se pueda enviar. */
  vinculado: boolean | null;
  /**
   * Lo único que importa antes de mandar nada. Un número vinculado pero sin
   * registrar en la Cloud API rechaza cada envío con
   * `(#133010) Account not registered`.
   */
  puedeEnviar: boolean | null;
  estado: EstadoConexionCrm | null;
  /** Explicación del CRM, para no inventarnos una nosotros. */
  descripcion: string | null;
  numero: string | null;
  /** Por qué no se pudo preguntar, en cristiano. */
  error: string | null;
}

export interface UsoPorEmpresa {
  teamId: number;
  nombre: string;
  /** true = tiene su propio número conectado · false = sale por el de Zero. */
  numeroPropio: boolean;
  /** Su número, cuando lo tiene. */
  numero: string | null;
  /** Tiene negocio creado en el CRM pero sin terminar de conectar. */
  aMedias: boolean;
}

export async function getEstadoZero(): Promise<EstadoZero> {
  const apiKey = process.env.CRM_ZERO_API_KEY;
  const url    = process.env.CRM_ZERO_API_URL;
  if (!apiKey || !url) {
    return {
      configurado: false, vinculado: null, puedeEnviar: null, estado: null,
      descripcion: null, numero: null,
      error: !apiKey && !url ? 'Faltan CRM_ZERO_API_KEY y CRM_ZERO_API_URL'
           : !apiKey ? 'Falta CRM_ZERO_API_KEY' : 'Falta CRM_ZERO_API_URL',
    };
  }

  try {
    const r = await generarConnectUrl(apiKey);
    const vinculado = r.whatsappLinked ?? r.whatsappConnected;

    // El CRM puede estar sirviendo todavía la versión que solo mandaba
    // `whatsappConnected`. En ese caso no sabemos si envía: el número vacío es
    // la señal de que falta registrarlo, y es más honesto decir "no sé" que
    // pintar un verde que miente.
    const puedeEnviar = r.whatsappCanSend ?? (vinculado && r.displayPhoneNumber ? true : null);

    return {
      configurado: true,
      vinculado,
      puedeEnviar,
      estado: r.estadoConexion ?? null,
      descripcion: r.estadoDescripcion ?? null,
      numero: r.displayPhoneNumber || null,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof WhatsAppApiError
      ? (e.status === 401 ? 'El CRM rechazó la llave (401). Puede estar rotada.' : `El CRM respondió ${e.status}: ${e.message}`)
      : e instanceof Error ? e.message : 'Error desconocido';
    return {
      configurado: true, vinculado: null, puedeEnviar: null, estado: null,
      descripcion: null, numero: null, error: msg,
    };
  }
}

/**
 * Quién sale por su número y quién por el de Zero.
 *
 * Las empresas SIN fila en whatsapp_config también salen por Zero, así que van
 * en la lista: si solo se listaran las que tienen fila, la pantalla diría que
 * nadie usa el número de Zero justo cuando lo usan todas.
 */
export async function getUsoPorEmpresa(): Promise<UsoPorEmpresa[]> {
  const filas = await db
    .select({
      teamId: teams.id,
      nombre: teams.name,
      conectado: whatsappConfig.conectado,
      numero: whatsappConfig.numeroWhatsapp,
      tieneConfig: whatsappConfig.teamId,
    })
    .from(teams)
    .leftJoin(whatsappConfig, eq(whatsappConfig.teamId, teams.id))
    .orderBy(teams.id);

  return filas.map((f) => ({
    teamId: f.teamId,
    nombre: f.nombre,
    numeroPropio: f.conectado === true,
    numero: f.numero ?? null,
    aMedias: f.tieneConfig != null && f.conectado !== true,
  }));
}

// ─── Salud del canal ─────────────────────────────────────────────────────────

export interface SaludCanal {
  /** listo | necesita_registro | vinculado | error | no_conectado | sin_llave */
  conexion: string;
  conexionDescripcion: string;
  puedeEnviar: boolean;
  /** Últimos 7 días de avisos de WhatsApp. */
  enviados: number;
  entregados: number;
  fallidos: number;
  sinAcuse: number;
  /** Los motivos reales de Meta, del más frecuente al menos. */
  errores: { motivo: string; cuantos: number }[];
  /**
   * Lo que hay que hacer, en una frase, o null si no hay nada que hacer.
   *
   * Va aquí y no en la pantalla porque el diagnóstico sale de los códigos de
   * Meta, que nadie se sabe: `131042` es «la cuenta no tiene método de pago» y
   * se arregla en el Billing Hub, no reintentando.
   */
  queHacer: string | null;
}

/**
 * Traduce el código de Meta a lo que de verdad hay que hacer.
 *
 * Sin esto, un colegio con todos los avisos fallando ve «fallido» y reintenta,
 * que es justo lo que no arregla ninguno de estos casos.
 */
export function queHacerCon(motivo: string): string | null {
  if (motivo.includes('131042')) {
    return 'La cuenta de WhatsApp Business no puede cobrar: falta método de pago o moneda. Se arregla en el Billing Hub de Meta, no reintentando.';
  }
  if (motivo.includes('133010')) {
    return 'El número está vinculado pero no registrado. Vuelve a abrir el enlace de conexión para terminar de activarlo.';
  }
  if (motivo.includes('131047')) {
    return 'Se mandó texto libre fuera de la ventana de 24 horas. Asigna una plantilla aprobada a ese aviso en Automatizaciones.';
  }
  if (motivo.includes('131026')) {
    return 'El destinatario no puede recibir mensajes: número sin WhatsApp o mal escrito. Revisa el teléfono del responsable.';
  }
  if (motivo.includes('132000') || motivo.includes('132001')) {
    return 'Los valores no cuadran con la plantilla. Revisa que la plantilla asignada tenga las mismas variables que el aviso.';
  }
  return null;
}

/** El estado de salud del canal de un colegio: conexión + entregas recientes. */
export async function getSaludCanal(teamId: number): Promise<SaludCanal> {
  const [conexion, filas] = await Promise.all([
    getEstadoZero(),
    db
      .select({
        estado: adminEscolarAvisosEnviados.estadoEntrega,
        error:  adminEscolarAvisosEnviados.errorEntrega,
      })
      .from(adminEscolarAvisosEnviados)
      .where(and(
        eq(adminEscolarAvisosEnviados.teamId, teamId),
        eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
        gte(adminEscolarAvisosEnviados.enviadoAt, new Date(Date.now() - 7 * 864e5)),
      )),
  ]);

  const errores = new Map<string, number>();
  let entregados = 0, fallidos = 0, sinAcuse = 0;
  for (const f of filas) {
    if (f.estado === 'entregado' || f.estado === 'leido') entregados++;
    else if (f.estado === 'fallido') {
      fallidos++;
      const motivo = (f.error ?? 'sin motivo').slice(0, 160);
      errores.set(motivo, (errores.get(motivo) ?? 0) + 1);
    } else sinAcuse++;
  }

  const ordenados = [...errores.entries()]
    .map(([motivo, cuantos]) => ({ motivo, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos);

  return {
    conexion: conexion.estado ?? 'sin_llave',
    conexionDescripcion: conexion.descripcion ?? conexion.error ?? 'No se pudo consultar el CRM',
    puedeEnviar: conexion.puedeEnviar === true,
    enviados: filas.length,
    entregados, fallidos, sinAcuse,
    errores: ordenados,
    // El motivo más frecuente es el que hay que atender primero.
    queHacer: ordenados.length > 0 ? queHacerCon(ordenados[0].motivo) : null,
  };
}
