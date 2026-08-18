/**
 * El catálogo de plantillas, juntando las dos mitades de la verdad.
 *
 * Meta manda sobre el ESTADO y, desde que el CRM lo expone, también sobre el
 * CONTENIDO de las que ya existen allá. Nuestra tabla guarda las dos cosas que
 * Meta no tiene:
 *
 *   · los BORRADORES — allá una plantilla nace en revisión y ya no se edita
 *     mientras está en revisión, así que redactarla en Meta es quemar el nombre;
 *   · qué SIGNIFICA cada variable — Meta solo conoce `{{1}}`, `{{2}}` y un
 *     ejemplo suelto, y sin nombre ni tipo no se puede decir «{{2}} es el monto»
 *     ni rellenar el aviso con el dato correcto en el orden correcto.
 *
 * Se cruzan por (nombre, idioma), que es como Meta las identifica.
 */

import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas, whatsappPlantillasAviso, teams, type VariablePlantilla, type BotonPlantilla } from '@/lib/db/schema';
import { listarPlantillas, type PlantillaCrm } from './client';

export type EstadoPlantilla =
  | 'BORRADOR' | 'APPROVED' | 'PENDING' | 'PENDING_REVIEW'
  | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'DESCONOCIDO';

export interface PlantillaVista {
  id: number | null;          // fila local; null = solo existe en Meta
  nombre: string;
  idioma: string;
  categoria: string;

  estado: EstadoPlantilla;
  aprobado: boolean;
  motivoRechazo: string | null;

  cuerpo: string;
  encabezado: string | null;
  pie: string | null;

  variables: VariablePlantilla[];
  boton: BotonPlantilla | null;
  esBorrador: boolean;
  /** Existe en Meta pero no la escribimos aquí: no sabemos qué es cada variable. */
  soloEnMeta: boolean;

  /** En cuántos avisos está asignada, y a cuántos negocios alcanza. */
  usoAvisos: number;
  usoNegocios: number;
}

/** Cuenta cuántas variables `{{n}}` distintas tiene un texto. */
export function contarVariables(texto: string): number {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(/\{\{(\d+)\}\}/g)) vistos.add(m[1]);
  return vistos.size;
}

/**
 * El texto con las variables sustituidas por sus ejemplos, para la vista previa.
 *
 * Una variable sin ejemplo se deja tal cual y NO se borra: un hueco vacío haría
 * parecer que la frase queda bien cuando en realidad va a salir incompleta.
 */
export function renderizar(cuerpo: string, variables: VariablePlantilla[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (original, n) => {
    const v = variables.find((x) => x.pos === Number(n));
    return v?.ejemplo?.trim() ? v.ejemplo : original;
  });
}

/**
 * Variables deducidas de un cuerpo, conservando lo que ya se sabía de cada una.
 *
 * Se llama en cada tecleo del editor: si en vez de conservar se regenerara todo,
 * escribir una coma después de `{{3}}` borraría el nombre y el ejemplo que el
 * usuario acaba de poner.
 */
export function deducirVariables(cuerpo: string, previas: VariablePlantilla[]): VariablePlantilla[] {
  const posiciones = [...new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))]
    .sort((a, b) => a - b);
  return posiciones.map((pos) => previas.find((p) => p.pos === pos)
    ?? { pos, nombre: `variable ${pos}`, tipo: 'texto' as const, ejemplo: '' });
}

/** Cuántos avisos usan cada plantilla, y a cuántos negocios llega. */
async function contarUso() {
  const filas = await db
    .select({
      nombre: whatsappPlantillasAviso.plantillaNombre,
      teamId: whatsappPlantillasAviso.teamId,
    })
    .from(whatsappPlantillasAviso);

  // Los negocios que NO tienen asignación propia heredan la global, así que una
  // plantilla puesta como global alcanza a todos menos a los que la pisaron.
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(teams);
  const conPropia = new Set(filas.filter((f) => f.teamId != null).map((f) => f.teamId));

  const uso = new Map<string, { avisos: number; negocios: number }>();
  for (const f of filas) {
    const u = uso.get(f.nombre) ?? { avisos: 0, negocios: 0 };
    u.avisos += 1;
    u.negocios += f.teamId == null ? Math.max(0, total - conPropia.size) : 1;
    uso.set(f.nombre, u);
  }
  return uso;
}

function estadoDe(crm: PlantillaCrm | undefined, esBorrador: boolean): EstadoPlantilla {
  if (esBorrador) return 'BORRADOR';
  if (!crm) return 'DESCONOCIDO';
  return (crm.status as EstadoPlantilla) ?? 'DESCONOCIDO';
}

/**
 * Todas las plantillas: las nuestras (borradores incluidos) y las que existan en
 * Meta aunque no las hayamos escrito aquí.
 *
 * Las de Meta que no conocemos se listan igual, marcadas `soloEnMeta`. Si se
 * escondieran, alguien crearía una desde Meta Business Suite y esta pantalla
 * juraría que no existe.
 */
export async function getCatalogo(apiKey: string | undefined): Promise<{
  plantillas: PlantillaVista[];
  errorCrm: string | null;
}> {
  const locales = await db.select().from(whatsappPlantillas).orderBy(whatsappPlantillas.nombre);

  let deMeta: PlantillaCrm[] = [];
  let errorCrm: string | null = null;
  if (apiKey) {
    try {
      deMeta = (await listarPlantillas(apiKey)).templates ?? [];
    } catch (e) {
      errorCrm = e instanceof Error ? e.message : 'No se pudo leer Meta';
    }
  } else {
    errorCrm = 'Falta CRM_ZERO_API_KEY';
  }

  const uso   = await contarUso();
  const clave = (n: string, i: string) => `${n}|${i}`;
  const porClave = new Map(deMeta.map((t) => [clave(t.name, t.language), t]));

  const vistas: PlantillaVista[] = locales.map((l) => {
    const crm = porClave.get(clave(l.nombre, l.idioma));
    porClave.delete(clave(l.nombre, l.idioma));
    const u = uso.get(l.nombre) ?? { avisos: 0, negocios: 0 };

    // El contenido de Meta gana cuando ya está publicada: es lo que de verdad
    // se le manda al padre. El local solo manda mientras es borrador.
    const cont = !l.borrador && crm?.content ? crm.content : null;

    return {
      id: l.id,
      nombre: l.nombre,
      idioma: l.idioma,
      categoria: (crm?.category ?? l.categoria).toLowerCase(),
      estado: estadoDe(crm, l.borrador),
      aprobado: crm?.aprobado ?? false,
      motivoRechazo: crm?.rejectedReason ?? null,
      cuerpo: cont?.body ?? l.cuerpo,
      encabezado: cont?.header ?? l.encabezado,
      pie: cont?.footer ?? l.pie,
      variables: l.variables,
      boton: l.boton ?? null,
      esBorrador: l.borrador,
      soloEnMeta: false,
      usoAvisos: u.avisos,
      usoNegocios: u.negocios,
    };
  });

  for (const t of porClave.values()) {
    const u = uso.get(t.name) ?? { avisos: 0, negocios: 0 };
    vistas.push({
      id: null,
      nombre: t.name,
      idioma: t.language,
      categoria: t.category.toLowerCase(),
      estado: (t.status as EstadoPlantilla) ?? 'DESCONOCIDO',
      aprobado: t.aprobado,
      motivoRechazo: t.rejectedReason,
      cuerpo: t.content?.body ?? '',
      encabezado: t.content?.header ?? null,
      pie: t.content?.footer ?? null,
      // Meta da los ejemplos pero no los nombres: se rellenan con lo que hay.
      variables: (t.content?.example?.[0] ?? []).map((ej, i) => ({
        pos: i + 1, nombre: `variable ${i + 1}`, tipo: 'texto' as const, ejemplo: ej,
      })),
      // El CRM devuelve `components`, pero normalizar el botón de una
      // plantilla que no escribimos aquí es adivinar: se deja vacío.
      boton: null,
      esBorrador: false,
      soloEnMeta: true,
      usoAvisos: u.avisos,
      usoNegocios: u.negocios,
    });
  }

  vistas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { plantillas: vistas, errorCrm };
}

/** Las de un negocio concreto más las globales. Ver nota de alcance abajo. */
export async function getPlantillasLocales(teamId: number | null) {
  return db.select().from(whatsappPlantillas)
    .where(teamId == null ? isNull(whatsappPlantillas.teamId) : eq(whatsappPlantillas.teamId, teamId));
}
