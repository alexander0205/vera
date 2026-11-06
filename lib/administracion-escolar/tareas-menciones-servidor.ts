/**
 * El lado servidor de las menciones con «@» (reglas puras en tareas-menciones.ts):
 * buscar a quién mencionar y validar lo que llega al guardar un mensaje.
 *
 * Todo va acotado al colegio de la tarea. Se busca solo con MIN_BUSQUEDA letras
 * o más, con tope por grupo (MAX_POR_GRUPO), y por columnas con índice trigram
 * (clients.razon_social, ecf_documents.encf y .codigo: migración 0242, y las de
 * nombres y apellidos de estudiantes de la 0071+): nunca una lista completa.
 * Las personas son la excepción: es una lista corta (el personal del colegio y
 * el equipo de Zero) que el cliente pide una vez por tarea y guarda.
 */
import 'server-only';
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, clients, ecfDocuments, teamMembers, users } from '@/lib/db/schema';
import { primerNombre } from './tareas-reglas';
import {
  escaparLike, MAX_POR_GRUPO, mencionesDe, MIN_BUSQUEDA, reescribirMenciones, type Mencion, type TipoMencion,
} from './tareas-menciones';

export interface Mencionable extends Mencion {
  /** Una persona del equipo de Zero (para avisarle en su panel). */
  zero?: boolean;
}

/** «Ana · Zero»: al colegio solo le llega el primer nombre del equipo de Zero. */
const etiquetaZero = (name: string | null) => {
  const n = primerNombre(name);
  return n ? `${n} · Zero` : null;
};

/** El personal del colegio y el equipo de Zero, para el menú «Personas». Una consulta por tarea. */
export async function personasMencionables(teamId: number): Promise<Mencionable[]> {
  const [delColegio, delEquipo] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), isNull(users.deletedAt), sql`${users.platformRole} <> 'admin'`)),
    db.select({ id: users.id, name: users.name }).from(users)
      .where(and(eq(users.platformRole, 'admin'), isNull(users.deletedAt))),
  ]);
  const colegio: Mencionable[] = delColegio.map((u) => ({
    tipo: 'persona' as const, id: u.id, etiqueta: u.name?.trim() || u.email.split('@')[0],
  }));
  const zero: Mencionable[] = delEquipo.flatMap((u) => {
    const etiqueta = etiquetaZero(u.name);
    return etiqueta ? [{ tipo: 'persona' as const, id: u.id, etiqueta, zero: true }] : [];
  });
  const porNombre = (a: Mencionable, b: Mencionable) => a.etiqueta.localeCompare(b.etiqueta, 'es');
  return [...colegio.sort(porNombre), ...zero.sort(porNombre)];
}

export interface PermisosMencion { padres: boolean; documentos: boolean }

/**
 * Padres, estudiantes y documentos que coinciden con lo escrito (2 letras o
 * más), hasta MAX_POR_GRUPO de cada uno, y solo de lo que quien busca puede ver.
 */
export async function buscarMenciones(
  teamId: number, q: string, permisos: PermisosMencion,
): Promise<Record<Exclude<TipoMencion, 'persona'>, Mencion[]>> {
  const sinDocumentos: DocumentosPorTipo = { factura: [], nc: [], nd: [] };
  const texto = q.trim().slice(0, 40);
  if (texto.length < MIN_BUSQUEDA) return { padre: [], estudiante: [], ...sinDocumentos };
  const patron = `%${escaparLike(texto)}%`;

  const [padres, estudiantes, documentos] = await Promise.all([
    permisos.padres
      ? db.select({ id: clients.id, nombre: clients.razonSocial }).from(clients)
        .where(and(eq(clients.teamId, teamId), sql`${clients.razonSocial} ilike ${patron}`))
        .orderBy(asc(clients.razonSocial)).limit(MAX_POR_GRUPO)
      : Promise.resolve([]),
    db.select({ id: adminEscolarEstudiantes.id, nombres: adminEscolarEstudiantes.nombres, apellidos: adminEscolarEstudiantes.apellidos })
      .from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        or(sql`${adminEscolarEstudiantes.nombres} ilike ${patron}`, sql`${adminEscolarEstudiantes.apellidos} ilike ${patron}`),
      ))
      .orderBy(asc(adminEscolarEstudiantes.nombres)).limit(MAX_POR_GRUPO),
    permisos.documentos ? buscarDocumentos(teamId, patron) : Promise.resolve(sinDocumentos),
  ]);
  return {
    padre: padres.map((p) => ({ tipo: 'padre' as const, id: p.id, etiqueta: p.nombre })),
    estudiante: estudiantes.map((e) => ({ tipo: 'estudiante' as const, id: e.id, etiqueta: `${e.nombres} ${e.apellidos}`.trim() })),
    ...documentos,
  };
}

type DocumentosPorTipo = Record<'factura' | 'nc' | 'nd', Mencion[]>;

/** El número que se lee en pantalla de un documento: su código o, sin él, el e-NCF. */
const numeroDe = (d: { codigo: string | null; encf: string }) => d.codigo || d.encf;

/** Facturas (todo lo que no es nota), notas de crédito (34) y de débito (33): cinco de cada una. */
async function buscarDocumentos(teamId: number, patron: string): Promise<DocumentosPorTipo> {
  const coincide = or(sql`${ecfDocuments.encf} ilike ${patron}`, sql`${ecfDocuments.codigo} ilike ${patron}`)!;
  const por = async (tipo: 'factura' | 'nc' | 'nd'): Promise<Mencion[]> => {
    const filtroTipo = tipo === 'nc' ? eq(ecfDocuments.tipoEcf, '34')
      : tipo === 'nd' ? eq(ecfDocuments.tipoEcf, '33') : notInArray(ecfDocuments.tipoEcf, ['33', '34']);
    const filas = await db.select({ id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), filtroTipo, coincide))
      .orderBy(desc(ecfDocuments.id)).limit(MAX_POR_GRUPO);
    return filas.map((f) => ({ tipo, id: f.id, etiqueta: numeroDe(f) }));
  };
  const [factura, nc, nd] = await Promise.all([por('factura'), por('nc'), por('nd')]);
  return { factura, nc, nd };
}

/**
 * Valida las menciones de un mensaje contra el colegio de la tarea y las
 * reescribe con la etiqueta del servidor. Devuelve el texto a guardar y las
 * personas mencionadas (a quienes se les avisa en la campana).
 */
export async function resolverMencionesGuardadas(teamId: number, texto: string): Promise<{
  texto: string; personas: { id: number; zero: boolean }[];
}> {
  const pedidas = mencionesDe(texto);
  if (pedidas.length === 0) return { texto, personas: [] };
  const ids = (tipo: TipoMencion) => pedidas.filter((m) => m.tipo === tipo).map((m) => m.id);
  const [pers, pad, est, doc] = await Promise.all([
    ids('persona').length === 0 ? [] : personasMencionables(teamId).then((p) => p.filter((x) => ids('persona').includes(x.id))),
    ids('padre').length === 0 ? [] : db.select({ id: clients.id, n: clients.razonSocial }).from(clients)
      .where(and(eq(clients.teamId, teamId), inArray(clients.id, ids('padre')))),
    ids('estudiante').length === 0 ? [] : db.select({ id: adminEscolarEstudiantes.id, a: adminEscolarEstudiantes.nombres, b: adminEscolarEstudiantes.apellidos })
      .from(adminEscolarEstudiantes).where(and(eq(adminEscolarEstudiantes.teamId, teamId), inArray(adminEscolarEstudiantes.id, ids('estudiante')))),
    (ids('factura').length + ids('nc').length + ids('nd').length) === 0 ? [] : db.select({
      id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf, tipo: ecfDocuments.tipoEcf,
    }).from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, [...ids('factura'), ...ids('nc'), ...ids('nd')]))),
  ]);
  const etiquetas = new Map<string, string>();
  for (const p of pers) etiquetas.set(`persona:${p.id}`, p.etiqueta);
  for (const p of pad) etiquetas.set(`padre:${p.id}`, p.n);
  for (const e of est) etiquetas.set(`estudiante:${e.id}`, `${e.a} ${e.b}`.trim());
  for (const d of doc) {
    const tipo: TipoMencion = d.tipo === '34' ? 'nc' : d.tipo === '33' ? 'nd' : 'factura';
    etiquetas.set(`${tipo}:${d.id}`, numeroDe(d));
  }
  const r = reescribirMenciones(texto, (m) => etiquetas.get(`${m.tipo}:${m.id}`) ?? null);
  const zero = new Map(pers.map((p) => [p.id, Boolean(p.zero)]));
  return {
    texto: r.texto,
    personas: r.validas.filter((m) => m.tipo === 'persona').map((m) => ({ id: m.id, zero: zero.get(m.id) ?? false })),
  };
}
