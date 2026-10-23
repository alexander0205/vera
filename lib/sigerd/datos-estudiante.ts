/**
 * Qué se le puede COMPLETAR a un estudiante de Zero con su ficha de SIGERD.
 *
 * «Cruzar estudiantes» crea al alumno con lo que da el listado de la sección:
 * el nombre y el id. Código RNE, sexo y fecha de nacimiento se quedaban en
 * blanco aunque la descarga ya los trajera en `estudianteFichas` (en el colegio
 * 43: 79 alumnos, 79 fichas, 75 con RNE). Resultado: la lista de estudiantes
 * enseñaba «—» donde debía ir el código, y buscar por RNE no encontraba a nadie.
 *
 * Esto es la parte PURA: de las fichas saca los datos aprovechables y, contra
 * lo que Zero ya tiene, decide qué se escribe. La escritura va en
 * `completar-datos-sigerd.ts`.
 *
 * Regla de oro: SOLO se llenan campos vacíos. Si alguien corrigió a mano una
 * fecha o un sexo, la descarga de SIGERD no se lo pisa.
 *
 * Sin `server-only`: se prueba en vitest y no toca la base.
 */
import { aFechaISO } from './fechas';
import { normalizarSexo, type SexoNormalizado } from './ficha';

/** Lo que una ficha aporta. `null` = la ficha no trae ese dato (o no sirve). */
export interface DatosDeSigerd {
  codigoRne: string | null;
  sexo: Exclude<SexoNormalizado, null> | null;
  /** ISO `yyyy-MM-dd`. */
  fechaNacimiento: string | null;
}

const SEXOS: readonly string[] = ['masculino', 'femenino', 'otro'];

/** ¿Es una fecha del calendario de verdad? (30 de febrero no lo es). */
function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (anio < 1900 || anio > new Date().getFullYear()) return false;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

/**
 * Cualquier forma en que una fecha de nacimiento pueda llegar → `yyyy-MM-dd`.
 *
 * Las fichas del dump ya traen ISO (`parsearFicha` convierte con `aFechaISO`),
 * pero un volcado más viejo o uno importado a mano puede traer `dd/MM/yyyy` o
 * un ISO con hora. Devuelve `null` ante cualquier cosa que no encaje: es mejor
 * dejar la fecha en blanco que inventar una.
 */
export function aFechaNacimientoISO(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (!t) return null;

  // ISO (con hora o sin ella) o `dd/MM/yyyy`, que es lo que sabe leer el
  // helper del portal. Los dos dejan el año primero.
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
    ?? aFechaISO(t)?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  let anio: number, mes: number, dia: number;
  if (ymd) {
    [anio, mes, dia] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  } else {
    // «5/3/2015» o «05-03-2015»: día primero y, a veces, sin ceros.
    const suelto = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!suelto) return null;
    [dia, mes, anio] = [Number(suelto[1]), Number(suelto[2]), Number(suelto[3])];
  }
  if (!esFechaReal(anio, mes, dia)) return null;
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** RNE tal cual para guardar: sin espacios y sin vacíos. */
function limpiarRne(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t === '' ? null : t;
}

/**
 * Para comparar RNE entre sí: sin importar mayúsculas ni espacios sobrantes.
 * (La base no tiene índice único, así que la colisión se decide aquí.)
 */
export const claveRne = (rne: string): string => rne.trim().toUpperCase();

/**
 * De `dump.estudianteFichas` → qué aporta cada ficha, por id de SIGERD.
 *
 * Tolerante: una ficha rota o sin id se ignora, no tumba el resto. Si el portal
 * repite un alumno, la primera ficha manda y las siguientes solo rellenan lo
 * que a ella le faltaba.
 *
 * Las fichas SIN ningún dato aprovechable también entran en el mapa: que exista
 * la ficha es lo que distingue «sin ficha» (hay que volver a bajar) de «su ficha
 * no trae nada nuevo».
 */
export function datosDesdeFichas(fichas: unknown): Map<number, DatosDeSigerd> {
  const salida = new Map<number, DatosDeSigerd>();
  if (!Array.isArray(fichas)) return salida;

  for (const f of fichas as Array<Record<string, unknown> | null>) {
    if (!f || typeof f !== 'object') continue;
    const id = Number(f.idSigerd);
    if (!Number.isInteger(id) || id <= 0) continue;

    const sexoCrudo = typeof f.sexoNormalizado === 'string' && SEXOS.includes(f.sexoNormalizado)
      ? (f.sexoNormalizado as DatosDeSigerd['sexo'])
      : normalizarSexo(typeof f.sexo === 'string' ? f.sexo : null);

    const nuevo: DatosDeSigerd = {
      codigoRne: limpiarRne(f.codigoRNE),
      sexo: sexoCrudo,
      fechaNacimiento: aFechaNacimientoISO(f.fechaNacimiento),
    };

    const previo = salida.get(id);
    salida.set(id, previo ? {
      codigoRne: previo.codigoRne ?? nuevo.codigoRne,
      sexo: previo.sexo ?? nuevo.sexo,
      fechaNacimiento: previo.fechaNacimiento ?? nuevo.fechaNacimiento,
    } : nuevo);
  }
  return salida;
}

/** Un estudiante activo de Zero con id de SIGERD, tal como está hoy. */
export interface EstudianteParaCompletar {
  id: number;
  sigerdId: number;
  codigoRne: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
}

/** Los campos que se le van a escribir. Solo los que traen valor. */
export interface CamposACompletar {
  codigoRne?: string;
  sexo?: string;
  fechaNacimiento?: string;
}

export interface PlanCompletado {
  cambios: Array<{ id: number; campos: CamposACompletar }>;
  /** Estudiantes activos con id de SIGERD que se miraron. */
  revisados: number;
  /** A cuántos se les llenó al menos un campo. */
  completados: number;
  /** Su id de SIGERD no tiene ficha en la descarga: hay que volver a bajar. */
  sinFicha: number;
  /** Su RNE ya lo tiene OTRO estudiante del colegio: no se escribió. */
  rneRepetido: number;
}

const vacio = (v: string | null | undefined) => v == null || v.trim() === '';

/**
 * Decide qué se escribe.
 *
 * `rneEnUso` dice qué RNE (en `claveRne`) están ya ocupados y por quién:
 * hay que armarlo con TODOS los estudiantes del colegio —activos o no— y mirando
 * tanto `codigo_rne` como `codigo`, porque `aplicarFichas` (el enriquecimiento
 * viejo) escribía el RNE en `codigo`. Mismo criterio que su guarda: el RNE sirve
 * si nadie más lo tiene; si lo tiene el propio alumno, no hay choque.
 *
 * Los alumnos se recorren por id y cada RNE que se asigna se anota al momento,
 * así que dos fichas con el mismo RNE no terminan las dos en la base: gana la
 * del alumno más antiguo y la otra cuenta como repetida.
 */
export function planearCompletado(
  estudiantes: readonly EstudianteParaCompletar[],
  datos: ReadonlyMap<number, DatosDeSigerd>,
  rneEnUso: ReadonlyMap<string, readonly number[]>,
): PlanCompletado {
  const ocupado = new Map<string, Set<number>>(
    [...rneEnUso].map(([rne, ids]) => [claveRne(rne), new Set(ids)]),
  );

  const plan: PlanCompletado = { cambios: [], revisados: 0, completados: 0, sinFicha: 0, rneRepetido: 0 };

  for (const e of [...estudiantes].sort((a, b) => a.id - b.id)) {
    plan.revisados++;
    const d = datos.get(e.sigerdId);
    if (!d) { plan.sinFicha++; continue; }

    const campos: CamposACompletar = {};

    if (vacio(e.codigoRne) && d.codigoRne) {
      const k = claveRne(d.codigoRne);
      const dueños = ocupado.get(k);
      if (dueños && [...dueños].some((id) => id !== e.id)) {
        plan.rneRepetido++;
      } else {
        campos.codigoRne = d.codigoRne;
        ocupado.set(k, new Set([...(dueños ?? []), e.id]));
      }
    }
    if (vacio(e.sexo) && d.sexo) campos.sexo = d.sexo;
    if (vacio(e.fechaNacimiento) && d.fechaNacimiento) campos.fechaNacimiento = d.fechaNacimiento;

    if (Object.keys(campos).length > 0) {
      plan.cambios.push({ id: e.id, campos });
      plan.completados++;
    }
  }
  return plan;
}
