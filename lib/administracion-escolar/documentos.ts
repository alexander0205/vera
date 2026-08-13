import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosRequeridos,
  adminEscolarDocumentosEntregados,
  adminEscolarMatriculas,
  adminEscolarCursos,
  adminEscolarGrados,
  adminEscolarServicios,
  users,
} from '@/lib/db/schema';
import { and, eq, asc, inArray, sql } from 'drizzle-orm';
import { listarArchivos, type ArchivoResumen } from './documentos-archivo';

export type { ArchivoResumen };

/**
 * Los documentos que el colegio le pide a la familia al matricular.
 *
 * Dos ideas sostienen el módulo:
 *
 * 1. **"Si aplica" no es "opcional".** Opcional significa que da igual; "si
 *    aplica" significa que alguien tiene que mirar el caso y decidir. Por eso
 *    un `si_aplica` sin resolver deja la matrícula incompleta igual que un
 *    requerido sin entregar — solo que se resuelve marcando "no aplica" en vez
 *    de subiendo un papel.
 *
 * 2. **Recibido y aprobado son dos actos.** Quien recibe el papel en recepción
 *    no es quien lo da por bueno, y el colegio necesita saber quién firmó lo
 *    segundo. Lo que entra por el enlace de la familia nunca nace aprobado.
 */

export type TipoInscripcion = 'nuevo' | 'reinscripcion';
export type Exigencia = 'requerido' | 'si_aplica';
export type EstadoDocumento = 'pendiente' | 'recibido' | 'aprobado' | 'rechazado' | 'no_aplica';

export const TIPOS_INSCRIPCION: TipoInscripcion[] = ['nuevo', 'reinscripcion'];
export const EXIGENCIAS: Exigencia[] = ['requerido', 'si_aplica'];
export const ESTADOS_DOCUMENTO: EstadoDocumento[] =
  ['pendiente', 'recibido', 'aprobado', 'rechazado', 'no_aplica'];

/** Estados que dejan el documento resuelto: ya no se le reclama a la familia. */
const RESUELTOS: EstadoDocumento[] = ['aprobado', 'no_aplica'];

/**
 * Compara niveles sin que un acento o una mayúscula los separe: el servicio se
 * llama "Primario" en una pantalla y alguien escribe "primario" en otra.
 */
export function mismoNivel(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizarNivel(a) === normalizarNivel(b);
}

export function normalizarNivel(n: string | null | undefined): string {
  // U+0300–U+036F son los diacríticos que NFD separa de su letra. Escapados y
  // no literales: en el fuente serían caracteres invisibles que cualquier
  // reformateo puede comerse sin que nadie lo note.
  return (n ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// ── Semilla ─────────────────────────────────────────────────────────────────

/**
 * Lo que pide este colegio, tal como lo dictó.
 *
 * Se respeta al pie de la letra, incluso donde una lista difiere de otra: en
 * Inicial el historial del SIGERD, el boletín y la carta de saldo van como "si
 * aplica" y en Primario como requeridos. Puede ser deliberado —en primaria casi
 * todo alumno viene de otro centro— o un descuido al dictarlo; corregirlo por
 * cuenta propia cambiaría lo que el colegio exige, así que se deja como está y
 * se cambia desde la pantalla de Configuración.
 *
 * Faltan por confirmar: reinscripción de Primario y Secundario, y si la lista
 * de Secundario nuevo ingreso son solo esos dos documentos o van además de los
 * comunes.
 */
export const SEMILLA_DOCUMENTOS: Array<{
  nivel: string | null; tipo: TipoInscripcion; nombre: string;
  exigencia: Exigencia; cantidad?: number;
}> = [
  // ── Inicial · nuevo ingreso ──
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Formulario de inscripción',            exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Acta de nacimiento',                   exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Fotocopia de tarjeta de vacunas',      exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Fotos 2x2',                            exigencia: 'requerido', cantidad: 3 },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Copia de cédula de padres o tutores',  exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Certificado médico',                   exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Carta de reporte de conducta del centro anterior', exigencia: 'si_aplica' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Historial del SIGERD',                 exigencia: 'si_aplica' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Boletín de calificaciones del grado',  exigencia: 'si_aplica' },
  { nivel: 'Inicial', tipo: 'nuevo', nombre: 'Carta de saldo del centro anterior',   exigencia: 'si_aplica' },

  // ── Inicial · reinscripción ──
  { nivel: 'Inicial', tipo: 'reinscripcion', nombre: 'Ficha de reinscripción',                       exigencia: 'requerido' },
  { nivel: 'Inicial', tipo: 'reinscripcion', nombre: 'Fotos 2x2',                                    exigencia: 'requerido', cantidad: 2 },
  { nivel: 'Inicial', tipo: 'reinscripcion', nombre: 'Boletín de calificaciones del grado anterior', exigencia: 'requerido' },

  // ── Primario · nuevo ingreso ──
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Formulario de inscripción',           exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Acta de nacimiento',                  exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Fotocopia de tarjeta de vacunas',     exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Fotos 2x2',                           exigencia: 'requerido', cantidad: 3 },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Historial del SIGERD',                exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Boletín de calificaciones del grado anterior', exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Carta de saldo del colegio anterior', exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Copia de cédula de padres o tutores', exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Certificado médico',                  exigencia: 'requerido' },
  { nivel: 'Primario', tipo: 'nuevo', nombre: 'Carta de reporte del centro anterior', exigencia: 'si_aplica' },

  // ── Secundario · nuevo ingreso ──
  { nivel: 'Secundario', tipo: 'nuevo', nombre: 'Récord de calificaciones del grado anterior', exigencia: 'requerido' },
  { nivel: 'Secundario', tipo: 'nuevo', nombre: 'Certificado de sexto',                        exigencia: 'requerido' },
];

/**
 * Deja la semilla en la base. Idempotente por (nivel, tipo, nombre): correrlo
 * dos veces no duplica nada y no pisa lo que el colegio ya haya cambiado.
 */
export async function sembrarDocumentos(teamId: number): Promise<{ creados: number }> {
  const yaHay = await db
    .select({ nivel: adminEscolarDocumentosRequeridos.nivel,
              tipo:  adminEscolarDocumentosRequeridos.tipoInscripcion,
              nombre: adminEscolarDocumentosRequeridos.nombre })
    .from(adminEscolarDocumentosRequeridos)
    .where(eq(adminEscolarDocumentosRequeridos.teamId, teamId));

  const clave = (n: string | null, t: string, nom: string) =>
    `${normalizarNivel(n)}|${t}|${nom.trim().toLowerCase()}`;
  const existentes = new Set(yaHay.map((r) => clave(r.nivel, r.tipo, r.nombre)));

  const nuevos = SEMILLA_DOCUMENTOS
    .filter((d) => !existentes.has(clave(d.nivel, d.tipo, d.nombre)))
    .map((d, i) => ({
      teamId,
      nivel: d.nivel,
      tipoInscripcion: d.tipo,
      nombre: d.nombre,
      exigencia: d.exigencia,
      cantidad: d.cantidad ?? 1,
      orden: i,
    }));

  if (nuevos.length === 0) return { creados: 0 };
  await db.insert(adminEscolarDocumentosRequeridos).values(nuevos);
  return { creados: nuevos.length };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export interface ContextoMatricula {
  matriculaId: number;
  estudianteId: number;
  nivel: string | null;
  tipo: TipoInscripcion;
}

/**
 * El nivel y el tipo de inscripción de una matrícula.
 *
 * El tipo se DEDUCE en vez de guardarse: es nuevo ingreso si no hay ninguna
 * matrícula anterior del mismo alumno. Guardarlo en una columna abriría la
 * puerta a que dijera "nuevo" en la tercera matrícula de alguien porque nadie
 * la actualizó; deducirlo no puede desincronizarse.
 */
export async function contextoDeMatricula(
  teamId: number, matriculaId: number,
): Promise<ContextoMatricula | null> {
  const [fila] = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodoId: adminEscolarMatriculas.periodoId,
      nivel: adminEscolarServicios.nombre,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .leftJoin(adminEscolarGrados, eq(adminEscolarCursos.gradoId, adminEscolarGrados.id))
    .leftJoin(adminEscolarServicios, eq(adminEscolarGrados.servicioId, adminEscolarServicios.id))
    .where(and(
      eq(adminEscolarMatriculas.id, matriculaId),
      eq(adminEscolarMatriculas.teamId, teamId),
    ))
    .limit(1);
  if (!fila) return null;

  // ¿Hay alguna matrícula anterior del mismo alumno? Se compara por id porque
  // es el orden en que se crearon, y las anuladas cuentan: el alumno pasó por
  // aquí aunque después se deshiciera la inscripción.
  const [{ anteriores }] = await db
    .select({ anteriores: sql<number>`COUNT(*)::int` })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, fila.estudianteId),
      sql`${adminEscolarMatriculas.id} < ${matriculaId}`,
    ));

  return {
    matriculaId: fila.id,
    estudianteId: fila.estudianteId,
    nivel: fila.nivel,
    tipo: anteriores > 0 ? 'reinscripcion' : 'nuevo',
  };
}

export interface FilaChecklist {
  requeridoId: number;
  nombre: string;
  exigencia: Exigencia;
  cantidad: number;
  orden: number;
  entregadoId: number | null;
  estado: EstadoDocumento;
  /** Los archivos subidos, en el orden en que llegaron. Vacío si no hay ninguno. */
  archivos: ArchivoResumen[];
  subidoEn: string | null;
  subidoFamilia: boolean;
  aprobadoEn: string | null;
  aprobadoPor: string | null;
  motivo: string | null;
}

export interface Checklist {
  contexto: ContextoMatricula;
  filas: FilaChecklist[];
  resumen: {
    total: number;
    resueltos: number;
    /** Requeridos que aún no están aprobados. */
    faltanRequeridos: number;
    /** "Si aplica" que nadie ha resuelto todavía. */
    sinResolver: number;
    /** Subidos pero sin aprobar: la bandeja de quien revisa. */
    porAprobar: number;
    completa: boolean;
  };
}

/** Lo exigido para un nivel y tipo, ya ordenado. Incluye las filas sin nivel. */
export async function requeridosPara(
  teamId: number, nivel: string | null, tipo: TipoInscripcion,
) {
  const todos = await db
    .select()
    .from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.teamId, teamId),
      eq(adminEscolarDocumentosRequeridos.tipoInscripcion, tipo),
      eq(adminEscolarDocumentosRequeridos.activo, true),
    ))
    .orderBy(asc(adminEscolarDocumentosRequeridos.orden), asc(adminEscolarDocumentosRequeridos.id));

  // El filtro por nivel se hace aquí y no en SQL: comparar sin acentos en
  // Postgres exigiría `unaccent`, que no está instalada en esta base. Son
  // decenas de filas por colegio, no miles.
  return todos.filter((d) => d.nivel == null || mismoNivel(d.nivel, nivel));
}

/** La lista de una matrícula con lo que ya se entregó pegado a cada renglón. */
export async function checklistDeMatricula(
  teamId: number, matriculaId: number,
): Promise<Checklist | null> {
  const contexto = await contextoDeMatricula(teamId, matriculaId);
  if (!contexto) return null;

  const requeridos = await requeridosPara(teamId, contexto.nivel, contexto.tipo);
  if (requeridos.length === 0) {
    return {
      contexto,
      filas: [],
      resumen: { total: 0, resueltos: 0, faltanRequeridos: 0, sinResolver: 0, porAprobar: 0, completa: true },
    };
  }

  const entregados = await db
    .select({
      e: adminEscolarDocumentosEntregados,
      aprobador: users.name,
      aprobadorEmail: users.email,
    })
    .from(adminEscolarDocumentosEntregados)
    .leftJoin(users, eq(adminEscolarDocumentosEntregados.aprobadoPor, users.id))
    .where(and(
      eq(adminEscolarDocumentosEntregados.teamId, teamId),
      eq(adminEscolarDocumentosEntregados.matriculaId, matriculaId),
      inArray(adminEscolarDocumentosEntregados.requeridoId, requeridos.map((r) => r.id)),
    ));

  const porRequerido = new Map(entregados.map((x) => [x.e.requeridoId, x]));
  const archivosPorEntregado = await listarArchivos(teamId, entregados.map((x) => x.e.id));

  const filas: FilaChecklist[] = requeridos.map((r) => {
    const hit = porRequerido.get(r.id);
    const e = hit?.e;
    return {
      requeridoId: r.id,
      nombre: r.nombre,
      exigencia: r.exigencia as Exigencia,
      cantidad: r.cantidad,
      orden: r.orden,
      entregadoId: e?.id ?? null,
      estado: (e?.estado as EstadoDocumento) ?? 'pendiente',
      archivos: (e && archivosPorEntregado.get(e.id)) || [],
      subidoEn: e?.subidoEn?.toISOString() ?? null,
      subidoFamilia: e?.subidoFamilia ?? false,
      aprobadoEn: e?.aprobadoEn?.toISOString() ?? null,
      aprobadoPor: hit?.aprobador ?? hit?.aprobadorEmail ?? null,
      motivo: e?.motivo ?? null,
    };
  });

  return { contexto, filas, resumen: resumirChecklist(filas) };
}

/**
 * Las cifras del pie. Se calcula aquí y no en la pantalla para que la lista, el
 * badge del listado y cualquier aviso futuro cuenten lo mismo.
 */
export function resumirChecklist(filas: FilaChecklist[]): Checklist['resumen'] {
  const resueltos = filas.filter((f) => RESUELTOS.includes(f.estado)).length;
  const faltanRequeridos = filas.filter(
    (f) => f.exigencia === 'requerido' && f.estado !== 'aprobado').length;
  // Un "si aplica" en pendiente no está resuelto: nadie ha dicho todavía si al
  // alumno le toca o no.
  const sinResolver = filas.filter(
    (f) => f.exigencia === 'si_aplica' && !RESUELTOS.includes(f.estado)).length;
  const porAprobar = filas.filter((f) => f.estado === 'recibido').length;
  return {
    total: filas.length,
    resueltos,
    faltanRequeridos,
    sinResolver,
    porAprobar,
    completa: faltanRequeridos === 0 && sinResolver === 0,
  };
}
