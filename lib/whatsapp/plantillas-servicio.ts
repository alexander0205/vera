import 'server-only';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas, type VariablePlantilla } from '@/lib/db/schema';
import { resolverRemitente } from './config';
import { crearPlantilla, listarPlantillas, WhatsAppApiError, type PlantillaCrm } from './client';
import { deducirVariables } from './catalogo';
import { AVISOS_PLANTILLA, guardarPlantillas, type AvisoPlantilla } from './plantillas';
import { VARIABLES_POR_AVISO, cabeEnAviso, nombreMeta, pegasDeMeta } from './plantillas-colegio';

/**
 * Las operaciones sobre plantillas del colegio, en un solo sitio.
 *
 * Las usan las rutas de la pantalla Y las herramientas del asistente de IA: que
 * el asistente pase por exactamente las mismas reglas que un clic del usuario
 * es lo que evita que la IA pueda hacer algo que la pantalla no deja.
 */

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fallo = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

export const esAviso = (v: string): v is AvisoPlantilla => AVISOS_PLANTILLA.some((a) => a.clave === v);

const CATEGORIAS = ['utility', 'marketing'] as const;

export interface EntradaBorrador {
  nombre: string;
  categoria?: string;
  cuerpo: string;
  pie?: string | null;
  variables?: VariablePlantilla[];
  avisoDestino?: string | null;
}

/**
 * Variables de una plantilla: si va a un aviso, las de ese aviso mandan (nombre,
 * tipo y ejemplo) — el orden lo fija el motor de envío, no quien redacta.
 */
function variablesFinales(cuerpo: string, previas: VariablePlantilla[], aviso: AvisoPlantilla | null): VariablePlantilla[] {
  const base = deducirVariables(cuerpo, previas);
  if (!aviso) return base;
  const guia = VARIABLES_POR_AVISO[aviso];
  return base.map((v) => guia.find((g) => g.pos === v.pos) ?? v);
}

export async function crearBorrador(teamId: number, e: EntradaBorrador): Promise<Resultado<{ id: number; nombre: string }>> {
  const nombre = nombreMeta(teamId, e.nombre);
  const cuerpo = (e.cuerpo ?? '').trim();
  if (!nombre) return fallo('Ponle un nombre a la plantilla');
  if (!cuerpo) return fallo('El mensaje no puede ir vacío');

  const aviso = e.avisoDestino && esAviso(e.avisoDestino) ? e.avisoDestino : null;
  if (e.avisoDestino && !aviso) return fallo('Aviso no válido');
  if (aviso) {
    const cabe = cabeEnAviso(cuerpo, aviso);
    if (!cabe.ok) return fallo(cabe.motivo);
  }

  const [existe] = await db.select({ id: whatsappPlantillas.id }).from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.nombre, nombre), eq(whatsappPlantillas.idioma, 'es'))).limit(1);
  if (existe) return fallo('Ya tienes una plantilla con ese nombre. Elige otro.', 409);

  const [fila] = await db.insert(whatsappPlantillas).values({
    nombre, idioma: 'es', teamId,
    categoria: (CATEGORIAS as readonly string[]).includes(e.categoria ?? '') ? e.categoria! : 'utility',
    cuerpo,
    pie: e.pie?.trim() || null,
    borrador: true,
    avisoDestino: aviso,
    variables: variablesFinales(cuerpo, e.variables ?? [], aviso),
  }).returning({ id: whatsappPlantillas.id, nombre: whatsappPlantillas.nombre });

  return { ok: true, id: fila.id, nombre: fila.nombre };
}

/** Reescribe un borrador del colegio. Las ya publicadas se editan desde la pantalla. */
export async function editarBorrador(
  teamId: number, nombre: string, cambios: Partial<Omit<EntradaBorrador, 'nombre'>>,
): Promise<Resultado<{ id: number; nombre: string }>> {
  const [p] = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.nombre, nombre), eq(whatsappPlantillas.teamId, teamId))).limit(1);
  if (!p) return fallo('Esa plantilla no existe', 404);
  if (!p.borrador) return fallo('Esa plantilla ya está en Meta; edítala desde la pantalla de plantillas.', 409);

  const cuerpo = (cambios.cuerpo ?? p.cuerpo).trim();
  const aviso = cambios.avisoDestino !== undefined
    ? (cambios.avisoDestino && esAviso(cambios.avisoDestino) ? cambios.avisoDestino : null)
    : (p.avisoDestino && esAviso(p.avisoDestino) ? p.avisoDestino : null);
  if (aviso) {
    const cabe = cabeEnAviso(cuerpo, aviso);
    if (!cabe.ok) return fallo(cabe.motivo);
  }

  await db.update(whatsappPlantillas).set({
    cuerpo,
    pie: cambios.pie !== undefined ? (cambios.pie?.trim() || null) : p.pie,
    categoria: (CATEGORIAS as readonly string[]).includes(cambios.categoria ?? '') ? cambios.categoria! : p.categoria,
    avisoDestino: aviso,
    variables: variablesFinales(cuerpo, cambios.variables ?? p.variables, aviso),
    actualizadoEn: new Date(),
  }).where(eq(whatsappPlantillas.id, p.id));
  return { ok: true, id: p.id, nombre: p.nombre };
}

export async function publicarBorrador(teamId: number, id: number): Promise<Resultado<{ estado: string }>> {
  const [p] = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.id, id), eq(whatsappPlantillas.teamId, teamId))).limit(1);
  if (!p) return fallo('Plantilla no encontrada', 404);
  if (!p.borrador) return fallo('Esa plantilla ya está en Meta', 409);

  const pegas = pegasDeMeta(p);
  if (pegas.length > 0) return fallo(pegas.join(' '));

  const remitente = await resolverRemitente(teamId);
  if (!remitente) return fallo('WhatsApp no está disponible para este colegio', 503);

  try {
    const r = await crearPlantilla(remitente.apiKey, {
      nombre: p.nombre,
      categoria: p.categoria as 'utility' | 'marketing' | 'authentication',
      idioma: p.idioma,
      cuerpo: p.cuerpo,
      ejemploCuerpo: p.variables.map((v) => v.ejemplo),
      encabezado: p.encabezado ?? undefined,
      pie: p.pie ?? undefined,
      boton: p.boton ?? undefined,
    });
    await db.update(whatsappPlantillas)
      .set({ borrador: false, metaId: r.id, metaEstado: r.status, actualizadoEn: new Date() })
      .where(eq(whatsappPlantillas.id, id));
    return { ok: true, estado: r.status };
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    console.error('[plantillas-servicio publicar]', e);
    return fallo(e instanceof Error ? e.message : 'Error publicando en Meta', status);
  }
}

/**
 * Asigna una plantilla a un aviso.
 *
 *   · aprobada y con las variables justas → queda asignada ya;
 *   · borrador o en revisión → queda como `avisoDestino` y se asigna sola cuando
 *     Meta la apruebe (ver `aplicarPendientes`). Devuelve `pendiente: true`.
 *   · nombre vacío → vuelve al default de la plataforma.
 */
export async function asignarAviso(
  teamId: number, aviso: string, nombre: string,
): Promise<Resultado<{ pendiente: boolean }>> {
  if (!esAviso(aviso)) return fallo('Aviso no válido');

  if (!nombre.trim()) {
    await guardarPlantillas(teamId, [{ aviso, nombre: '', idioma: 'es' }]);
    // Si había una pendiente para este aviso, también se olvida.
    await db.update(whatsappPlantillas).set({ avisoDestino: null })
      .where(and(eq(whatsappPlantillas.teamId, teamId), eq(whatsappPlantillas.avisoDestino, aviso)));
    return { ok: true, pendiente: false };
  }

  const [p] = await db.select().from(whatsappPlantillas)
    .where(and(
      eq(whatsappPlantillas.nombre, nombre.trim()),
      or(eq(whatsappPlantillas.teamId, teamId), isNull(whatsappPlantillas.teamId)),
    )).limit(1);
  if (!p) return fallo('Esa plantilla no existe', 404);

  const cabe = cabeEnAviso(p.cuerpo, aviso);
  if (!cabe.ok) return fallo(cabe.motivo);

  let aprobada = false;
  if (!p.borrador) {
    const remitente = await resolverRemitente(teamId);
    if (remitente) {
      try {
        const t = (await listarPlantillas(remitente.apiKey, p.nombre)).templates
          ?.find((x) => x.name === p.nombre && x.language === p.idioma);
        aprobada = t ? t.aprobado : p.metaEstado === 'APPROVED';
        if (t?.status === 'REJECTED') return fallo('Meta rechazó esa plantilla; edítala y vuelve a enviarla.', 409);
      } catch { aprobada = p.metaEstado === 'APPROVED'; }
    }
  }

  if (aprobada || p.teamId == null) {
    await guardarPlantillas(teamId, [{ aviso, nombre: p.nombre, idioma: p.idioma }]);
    await db.update(whatsappPlantillas).set({ avisoDestino: null })
      .where(and(eq(whatsappPlantillas.teamId, teamId), eq(whatsappPlantillas.avisoDestino, aviso)));
    return { ok: true, pendiente: false };
  }

  // Pendiente: solo una por aviso. Dos esperando el mismo hueco se pisarían.
  await db.update(whatsappPlantillas).set({ avisoDestino: null })
    .where(and(eq(whatsappPlantillas.teamId, teamId), eq(whatsappPlantillas.avisoDestino, aviso), ne(whatsappPlantillas.id, p.id)));
  await db.update(whatsappPlantillas).set({ avisoDestino: aviso }).where(eq(whatsappPlantillas.id, p.id));
  return { ok: true, pendiente: true };
}

/**
 * Asigna las que esperaban aprobación y ya la tienen. Se llama cuando ya se
 * tiene el estado de Meta en la mano (al abrir la pantalla, al consultar el
 * asistente), no en un cron propio.
 */
export async function aplicarPendientes(teamId: number, deMeta: PlantillaCrm[]): Promise<string[]> {
  const pendientes = await db.select().from(whatsappPlantillas)
    .where(and(eq(whatsappPlantillas.teamId, teamId), eq(whatsappPlantillas.borrador, false)));
  const aplicadas: string[] = [];

  for (const p of pendientes) {
    if (!p.avisoDestino || !esAviso(p.avisoDestino)) continue;
    const t = deMeta.find((x) => x.name === p.nombre && x.language === p.idioma);
    if (!t?.aprobado) continue;
    if (!cabeEnAviso(p.cuerpo, p.avisoDestino).ok) continue;

    await guardarPlantillas(teamId, [{ aviso: p.avisoDestino, nombre: p.nombre, idioma: p.idioma }]);
    await db.update(whatsappPlantillas).set({ avisoDestino: null, metaEstado: t.status })
      .where(eq(whatsappPlantillas.id, p.id));
    aplicadas.push(`${p.nombre} → ${p.avisoDestino}`);
  }
  return aplicadas;
}
