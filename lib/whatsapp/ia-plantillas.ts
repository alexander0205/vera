import 'server-only';
import { generateText, stepCountIs, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas } from '@/lib/db/schema';
import { resolverRemitente } from './config';
import { listarPlantillas, type PlantillaCrm } from './client';
import { getPlantillasDeTeam } from './plantillas';
import { casosDeUso } from './plantillas-colegio';
import { comoModelo, modelosDe } from '@/lib/ia/modelo-servidor';
import {
  crearBorrador, editarBorrador, publicarBorrador, asignarAviso, aplicarPendientes,
} from './plantillas-servicio';

/**
 * El asistente de plantillas: Gemini, por el AI Gateway, igual que la lectura
 * de facturas. Con herramientas, para que pueda HACER lo que el colegio pide
 * —crear la plantilla, mandarla a aprobar, asignarla a un aviso— y no solo
 * redactarla para que el usuario la copie.
 *
 * Todo pasa por plantillas-servicio.ts, que es lo mismo que usan los botones de
 * la pantalla: la IA no puede saltarse ninguna regla.
 */

// El modelo y su respaldo los escoge el administrador en /admin/ia (lib/ia/modelos.ts).

export const iaPlantillasDisponible = () =>
  Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

export type Accion =
  | { tipo: 'creada' | 'editada' | 'enviada' | 'asignada' | 'pendiente' | 'desasignada'; nombre?: string; aviso?: string }
  | { tipo: 'error'; texto: string };

function instrucciones(): string {
  const casos = casosDeUso().map((c) =>
    `- ${c.clave} («${c.titulo}»): ${c.detalle}\n  Variables, en ESTE orden: ${c.variables.map((v) => `{{${v.pos}}} ${v.nombre}`).join(', ')}`).join('\n');

  return `Eres el asistente de WhatsApp de un colegio dominicano. Ayudas al administrador a crear plantillas de WhatsApp Business para avisar a las familias y a dejarlas funcionando en cada aviso. Hablas en español dominicano, claro y breve. Respondes SIEMPRE en texto corto; lo que hagas lo haces con las herramientas.

Reglas de Meta para el texto:
- Variables {{1}}, {{2}}… consecutivas desde 1. Nunca al inicio ni al final del mensaje, nunca dos pegadas, y siempre con texto alrededor. Máximo 1024 caracteres.
- Sin amenazas, presión ni humillación. En cobros: respetuoso; di cuánto, de qué y hasta cuándo.
- categoria "utility" para avisos de una cuenta que la familia ya tiene (casi siempre); "marketing" solo para promociones (más cara, más estricta).
- El pie es opcional, corto (máx. 60) y sin variables.

Casos de uso (avisos de cobro). Cada uno manda un conjunto FIJO de variables en un orden FIJO; una plantilla asignada a un aviso debe tener exactamente esas variables y en ese orden:
${casos}

Cómo trabajas:
1. Si el colegio describe una plantilla, créala con crear_plantilla. Si es para un aviso de los de arriba, pasa su clave en avisoDestino y escribe el texto con SUS variables en SU orden. Si es un mensaje que no es de cobro, avisoDestino va vacío y eres libre con las variables.
2. Crear NO la manda a Meta. Solo si el colegio pide usarla, asignarla, publicarla o mandarla a aprobación, pasa enviarAprobacion=true. Si solo pide redactarla, déjala como borrador y dile que puede pedirte enviarla.
3. Meta tarda de minutos a horas en aprobar. Una plantilla que va a un aviso y se envió a aprobación queda asignada sola cuando Meta la apruebe: díselo así, sin prometer una hora.
4. Para asignar una que ya existe, usa asignar_plantilla. Para ver qué hay y cómo van, usa estado.
5. Puedes hacer varias cosas en una petición (por ejemplo, crear las plantillas de los 5 avisos). Hazlas todas y resume al final qué quedó hecho y qué falta.
6. Si falta un dato clave, pregunta UNA cosa. Si piden algo que Meta rechazaría, dilo y propón la alternativa.
7. Nunca inventes que algo quedó hecho: si una herramienta devuelve error, cuéntalo.`;
}

export interface MensajeChat { role: 'user' | 'assistant'; content: string }

async function estadoDeMeta(teamId: number): Promise<{ meta: PlantillaCrm[]; error: string | null }> {
  const remitente = await resolverRemitente(teamId);
  if (!remitente) return { meta: [], error: 'WhatsApp no está disponible para este colegio' };
  try {
    return { meta: (await listarPlantillas(remitente.apiKey)).templates ?? [], error: null };
  } catch (e) {
    return { meta: [], error: e instanceof Error ? e.message : 'No se pudo leer Meta' };
  }
}

export async function conversarPlantilla(
  teamId: number, historial: MensajeChat[], colegio: string | null,
  /** Solo para pruebas: un modelo simulado en lugar de Gemini. */
  modeloPrueba?: LanguageModel,
): Promise<{ respuesta: string; acciones: Accion[] }> {
  const acciones: Accion[] = [];

  // El modelo puede pedir varias herramientas en un mismo paso y el SDK las
  // lanza en paralelo: «crear» y «asignar» competirían y la segunda diría que
  // la plantilla no existe. Se encolan para que corran en el orden pedido.
  const AVISOS = casosDeUso().map((c) => c.clave) as [string, ...string[]];

  const herramientas = {
    estado: tool({
      description: 'Lista las plantillas del colegio con su estado en Meta y qué plantilla usa cada aviso.',
      inputSchema: z.object({}),
      execute: async () => {
        const { meta, error } = await estadoDeMeta(teamId);
        if (!error) await aplicarPendientes(teamId, meta);
        const locales = await db.select().from(whatsappPlantillas)
          .where(or(eq(whatsappPlantillas.teamId, teamId), isNull(whatsappPlantillas.teamId)));
        const asignadas = await getPlantillasDeTeam(teamId);
        return {
          errorMeta: error,
          plantillas: locales.map((l) => {
            const m = meta.find((x) => x.name === l.nombre && x.language === l.idioma);
            return {
              nombre: l.nombre,
              propia: l.teamId === teamId,
              estado: l.borrador ? 'BORRADOR' : (m?.status ?? l.metaEstado ?? 'DESCONOCIDO'),
              motivoRechazo: m?.rejectedReason ?? null,
              variables: l.variables.length,
              cuerpo: l.cuerpo,
              asignarAlAprobarse: l.avisoDestino,
            };
          }),
          avisos: casosDeUso().map((c) => ({
            aviso: c.clave,
            plantilla: asignadas.find((a) => a.aviso === c.clave)?.nombre ?? null,
          })),
        };
      },
    }),

    crear_plantilla: tool({
      description: 'Crea una plantilla (borrador) del colegio. Con enviarAprobacion=true además la manda a Meta para aprobación.',
      inputSchema: z.object({
        nombre: z.string().describe('Nombre corto en español, p. ej. «Recordatorio de mensualidad»'),
        categoria: z.enum(['utility', 'marketing']).default('utility'),
        cuerpo: z.string().describe('El mensaje, con {{1}}, {{2}}… en el orden del aviso si es para uno'),
        pie: z.string().nullable().optional(),
        avisoDestino: z.enum(AVISOS).nullable().optional()
          .describe('El aviso al que va esta plantilla; se asignará sola al aprobarse'),
        variables: z.array(z.object({
          pos: z.number().int(),
          nombre: z.string(),
          tipo: z.enum(['texto', 'monto', 'fecha']),
          ejemplo: z.string().describe('Valor de ejemplo realista, nunca vacío'),
        })).describe('Una por cada {{n}} del cuerpo'),
        enviarAprobacion: z.boolean().default(false),
      }),
      execute: async (i) => {
        const r = await crearBorrador(teamId, {
          nombre: i.nombre, categoria: i.categoria, cuerpo: i.cuerpo, pie: i.pie,
          variables: i.variables, avisoDestino: i.avisoDestino ?? null,
        });
        if (!r.ok) { acciones.push({ tipo: 'error', texto: r.error }); return { ok: false, error: r.error }; }
        acciones.push({ tipo: 'creada', nombre: r.nombre, aviso: i.avisoDestino ?? undefined });

        if (!i.enviarAprobacion) return { ok: true, nombre: r.nombre, estado: 'BORRADOR' };
        const p = await publicarBorrador(teamId, r.id);
        if (!p.ok) {
          acciones.push({ tipo: 'error', texto: p.error });
          return { ok: true, nombre: r.nombre, estado: 'BORRADOR', errorAlEnviar: p.error };
        }
        acciones.push({ tipo: 'enviada', nombre: r.nombre });
        return { ok: true, nombre: r.nombre, estado: p.estado, asignarAlAprobarse: i.avisoDestino ?? null };
      },
    }),

    editar_borrador: tool({
      description: 'Cambia el texto de un borrador del colegio (no de una ya enviada a Meta).',
      inputSchema: z.object({
        nombre: z.string().describe('El nombre exacto de la plantilla, tal como sale en estado'),
        cuerpo: z.string().optional(),
        pie: z.string().nullable().optional(),
        categoria: z.enum(['utility', 'marketing']).optional(),
        variables: z.array(z.object({
          pos: z.number().int(), nombre: z.string(),
          tipo: z.enum(['texto', 'monto', 'fecha']), ejemplo: z.string(),
        })).optional(),
      }),
      execute: async ({ nombre, ...cambios }) => {
        const r = await editarBorrador(teamId, nombre, cambios);
        if (!r.ok) { acciones.push({ tipo: 'error', texto: r.error }); return { ok: false, error: r.error }; }
        acciones.push({ tipo: 'editada', nombre });
        return { ok: true };
      },
    }),

    enviar_a_aprobacion: tool({
      description: 'Manda a Meta un borrador que ya existe. Solo si el colegio lo pidió.',
      inputSchema: z.object({ nombre: z.string() }),
      execute: async ({ nombre }) => {
        const [p] = await db.select({ id: whatsappPlantillas.id }).from(whatsappPlantillas)
          .where(and(eq(whatsappPlantillas.nombre, nombre), eq(whatsappPlantillas.teamId, teamId))).limit(1);
        if (!p) return { ok: false, error: 'Esa plantilla no existe' };
        const r = await publicarBorrador(teamId, p.id);
        if (!r.ok) { acciones.push({ tipo: 'error', texto: r.error }); return { ok: false, error: r.error }; }
        acciones.push({ tipo: 'enviada', nombre });
        return { ok: true, estado: r.estado };
      },
    }),

    asignar_plantilla: tool({
      description: 'Asigna una plantilla a un aviso. Si todavía no está aprobada queda pendiente y se asigna sola al aprobarse. Con nombre vacío vuelve al default de Zero.',
      inputSchema: z.object({
        aviso: z.enum(AVISOS),
        nombre: z.string().describe('Nombre de la plantilla, o vacío para volver al default'),
      }),
      execute: async ({ aviso, nombre }) => {
        const r = await asignarAviso(teamId, aviso, nombre);
        if (!r.ok) { acciones.push({ tipo: 'error', texto: r.error }); return { ok: false, error: r.error }; }
        acciones.push({
          tipo: !nombre.trim() ? 'desasignada' : r.pendiente ? 'pendiente' : 'asignada', nombre, aviso,
        });
        return { ok: true, pendiente: r.pendiente };
      },
    }),
  };

  // El modelo puede pedir varias herramientas en un mismo paso y el SDK las
  // lanza en paralelo: «crear» y «asignar» competirían y la segunda diría que
  // la plantilla no existe. Se encolan para que corran en el orden pedido.
  let cola: Promise<unknown> = Promise.resolve();
  const tools = Object.fromEntries(
    Object.entries(herramientas).map(([nombre, t]) => [nombre, {
      ...t,
      execute: (input: unknown, opts: unknown) => {
        const r = cola.then(() => (t.execute as (i: unknown, o: unknown) => unknown)(input, opts));
        cola = r.catch(() => undefined);
        return r;
      },
    }]),
  ) as unknown as typeof herramientas;

  const correr = async (model: LanguageModel) => {
    const { text } = await generateText({
      model,
      instructions: instrucciones() + (colegio ? `\n\nEl colegio se llama «${colegio}».` : ''),
      messages: historial.map((h) => ({ role: h.role, content: h.content })),
      tools,
      stopWhen: stepCountIs(12),
      abortSignal: AbortSignal.timeout(90_000),
    });
    return text;
  };

  const { principal: MODELO, respaldo: RESPALDO } = await modelosDe('plantillas');
  let texto: string;
  try {
    texto = await correr(modeloPrueba ?? comoModelo(MODELO) ?? MODELO);
  } catch (e) {
    // Si el principal falló a medias, ya pudo haber hecho cosas: no se reintenta
    // para no duplicarlas. Solo se reintenta si no hizo nada.
    if (acciones.length > 0 || RESPALDO === MODELO) throw e;
    console.warn(`[plantillas-ia] ${MODELO} falló; se reintenta con ${RESPALDO}`, e);
    texto = await correr(comoModelo(RESPALDO) ?? RESPALDO);
  }

  return {
    respuesta: texto.trim() || (acciones.length ? 'Listo.' : 'No supe qué hacer con eso. ¿Me lo cuentas de otra forma?'),
    acciones,
  };
}
