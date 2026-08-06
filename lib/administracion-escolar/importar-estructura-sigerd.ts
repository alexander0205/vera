import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarServicios, adminEscolarGrados, adminEscolarCursos, sigerdImportaciones,
} from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * Trae al año escolar la estructura que Sigerd ya tiene: servicios (tandas),
 * grados y secciones.
 *
 * Es idempotente por los ids de Sigerd, que son estables entre sincronizaciones.
 * La primera vez nadie los tiene guardados todavía, así que también se busca por
 * nombre: si el colegio ya creó "Secundario / Matutina" a mano —con sus precios
 * colgando— se adopta esa fila y se le graba el id, en vez de crear un duplicado
 * que dejaría las tarifas huérfanas.
 *
 * Los nombres nunca se pisan. El colegio manda en cómo se llaman las cosas;
 * Sigerd solo aporta la identidad.
 */

export interface ResumenImportacion {
  servicios: { creados: number; adoptados: number; existentes: number };
  grados:    { creados: number; existentes: number };
  secciones: { creados: number; existentes: number };
  detalle: string[];
}

interface SeccionSigerd { idSeccion?: number; nombre?: string; tope?: number | null }
interface GradoSigerd   { idGrado?: number; nombre?: string; secciones?: SeccionSigerd[] }
interface ServicioSigerd { idServicio?: number; nombre?: string; grados?: GradoSigerd[] }

/**
 * Parte el nombre que da Sigerd.
 *
 *   "Primario - 01'2014 - MATUTINA"  →  { nombre: "Primario", tanda: "Matutina" }
 *
 * Lo del medio es la resolución del Minerd que autoriza el servicio: sirve para
 * el ministerio, no para cobrar, así que no llega a la factura.
 */
export function partirNombreServicio(crudo: string): { nombre: string; tanda: string | null } {
  const partes = crudo.split('-').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return { nombre: crudo.trim(), tanda: null };

  const TANDAS = ['matutina', 'vespertina', 'nocturna', 'jornada extendida', 'sabatina'];
  const esTanda = (p: string) => TANDAS.includes(p.toLowerCase());

  // La tanda es lo último cuando está; el nombre, lo primero. Lo de en medio se
  // descarta salvo que sea lo único que quede.
  const ultima = partes[partes.length - 1];
  const tanda = esTanda(ultima) ? capitalizar(ultima) : null;
  const nombre = partes[0];

  return { nombre: nombre.trim(), tanda };
}

function capitalizar(s: string): string {
  return s.trim().toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Compara nombres ignorando mayúsculas, tildes y espacios de más. */
function mismoNombre(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
}

export async function importarEstructuraSigerd(
  teamId: number,
  periodoId: number,
): Promise<ResumenImportacion> {
  const r: ResumenImportacion = {
    servicios: { creados: 0, adoptados: 0, existentes: 0 },
    grados:    { creados: 0, existentes: 0 },
    secciones: { creados: 0, existentes: 0 },
    detalle: [],
  };

  const [imp] = await db
    .select({ dump: sigerdImportaciones.dump })
    .from(sigerdImportaciones)
    .where(eq(sigerdImportaciones.teamId, teamId))
    .orderBy(desc(sigerdImportaciones.updatedAt))
    .limit(1);

  const serviciosSigerd = (imp?.dump as { estructura?: { servicios?: ServicioSigerd[] } } | null)
    ?.estructura?.servicios;
  if (!Array.isArray(serviciosSigerd) || serviciosSigerd.length === 0) {
    r.detalle.push('No hay datos de Sigerd descargados todavía.');
    return r;
  }

  const serviciosApp = await db.select().from(adminEscolarServicios)
    .where(and(eq(adminEscolarServicios.teamId, teamId), eq(adminEscolarServicios.periodoId, periodoId)));

  for (const [i, sv] of serviciosSigerd.entries()) {
    const crudo = (sv.nombre ?? '').trim();
    if (!crudo || !sv.idServicio) continue;
    const { nombre, tanda } = partirNombreServicio(crudo);

    let servicioId: number;
    const porId = serviciosApp.find((s) => s.sigerdServicioId === sv.idServicio);
    const porNombre = !porId && serviciosApp.find(
      (s) => s.sigerdServicioId == null && mismoNombre(s.nombre, nombre)
        && (!!s.tanda === !!tanda ? mismoNombre(s.tanda ?? '', tanda ?? '') : false),
    );

    if (porId) {
      servicioId = porId.id;
      r.servicios.existentes += 1;
    } else if (porNombre) {
      // Adoptar: se le graba el id de Sigerd para que a partir de ahora sea el
      // mismo, sin tocarle el nombre ni perder lo que tenga colgando.
      await db.update(adminEscolarServicios)
        .set({ sigerdServicioId: sv.idServicio, updatedAt: new Date() })
        .where(eq(adminEscolarServicios.id, porNombre.id));
      servicioId = porNombre.id;
      r.servicios.adoptados += 1;
      r.detalle.push(`Se unió "${porNombre.nombre}" con el de Sigerd (conserva sus precios).`);
    } else {
      const [creado] = await db.insert(adminEscolarServicios).values({
        teamId, periodoId, nombre, tanda, orden: i,
        sigerdServicioId: sv.idServicio,
      }).returning({ id: adminEscolarServicios.id });
      servicioId = creado.id;
      r.servicios.creados += 1;
      r.detalle.push(`Servicio "${nombre}${tanda ? ` · ${tanda}` : ''}" creado.`);
    }

    const gradosApp = await db.select().from(adminEscolarGrados)
      .where(and(eq(adminEscolarGrados.teamId, teamId), eq(adminEscolarGrados.servicioId, servicioId)));

    for (const [j, g] of (sv.grados ?? []).entries()) {
      const nombreGrado = (g.nombre ?? '').trim();
      if (!nombreGrado || !g.idGrado) continue;

      let gradoId: number;
      const gExistente = gradosApp.find((x) => x.sigerdGradoId === g.idGrado)
        ?? gradosApp.find((x) => x.sigerdGradoId == null && mismoNombre(x.nombre, nombreGrado));

      if (gExistente) {
        if (gExistente.sigerdGradoId == null) {
          await db.update(adminEscolarGrados)
            .set({ sigerdGradoId: g.idGrado, updatedAt: new Date() })
            .where(eq(adminEscolarGrados.id, gExistente.id));
        }
        gradoId = gExistente.id;
        r.grados.existentes += 1;
      } else {
        const [creado] = await db.insert(adminEscolarGrados).values({
          teamId, servicioId, nombre: nombreGrado, orden: j, sigerdGradoId: g.idGrado,
        }).returning({ id: adminEscolarGrados.id });
        gradoId = creado.id;
        r.grados.creados += 1;
      }

      const seccionesApp = await db.select().from(adminEscolarCursos)
        .where(and(eq(adminEscolarCursos.teamId, teamId), eq(adminEscolarCursos.gradoId, gradoId)));

      for (const [k, s] of (g.secciones ?? []).entries()) {
        const nombreSeccion = (s.nombre ?? '').trim();
        if (!nombreSeccion || !s.idSeccion) continue;

        const sExistente = seccionesApp.find((x) => x.sigerdSeccionId === s.idSeccion)
          ?? seccionesApp.find((x) => x.sigerdSeccionId == null && mismoNombre(x.nombre, nombreSeccion));

        if (sExistente) {
          if (sExistente.sigerdSeccionId == null) {
            await db.update(adminEscolarCursos)
              .set({ sigerdSeccionId: s.idSeccion, updatedAt: new Date() })
              .where(eq(adminEscolarCursos.id, sExistente.id));
          }
          r.secciones.existentes += 1;
        } else {
          await db.insert(adminEscolarCursos).values({
            teamId, gradoId, nombre: nombreSeccion, orden: k,
            sigerdSeccionId: s.idSeccion,
            ...(s.tope ? { cupo: s.tope } : {}),
          });
          r.secciones.creados += 1;
        }
      }
    }
  }

  return r;
}
