/**
 * «Revisar cambios de SIGERD»: qué es distinto entre la ÚLTIMA DESCARGA del
 * portal y lo que hay en Zero.
 *
 * Durante el año SIGERD cambia: entran alumnos nuevos, se retiran otros, a
 * alguien lo pasan de la A a la B, el MINERD renombra o abre una sección. Zero
 * solo se enteraba al crear la estructura la primera vez; después, cada
 * diferencia era silenciosa. Peor: «Matricular desde SIGERD» deja tal cual a
 * quien ya tiene matrícula aunque SIGERD lo ponga en otra sección, sin decirlo.
 *
 * Esto es la parte PURA, sin base de datos ni red: recibe el árbol de la
 * descarga y los datos de Zero ya leídos, y devuelve cinco listas. Por eso se
 * prueba con casos inventados y no hace falta un colegio real.
 *
 * Reglas que conviene tener a la vista:
 *  - El alumno se empareja por `sigerd_id`. Solo si no hay id que valga, por RNE
 *    (cuando lo tienen los dos y es inequívoco): nunca por nombre, porque hay
 *    hermanos con el mismo nombre y apellido en un mismo centro.
 *  - La sección se empareja por `sigerd_seccion_id` del curso de Zero, nunca por
 *    nombre: el nombre del portal no es el que el colegio usa.
 *  - Lo que se compara es con lo DESCARGADO. Si SIGERD cambió después, no sale
 *    hasta volver a bajar. La pantalla lo dice.
 *
 * Sin `server-only`: se usa en pruebas.
 */
import type { ArbolCentro } from './sync';

// ── Entrada: lo que se lee de Zero ──────────────────────────────────────────

/** Un alumno de Zero. Entran TODOS (activos o no): ver `nuevos`. */
export interface AlumnoZero {
  id: number;
  nombre: string;
  /** activo | inactivo | retirado | graduado */
  estado: string;
  sigerdId: number | null;
  codigoRne: string | null;
  /** Su matrícula ACTIVA del año vigente, si la tiene. */
  matricula: {
    id: number;
    cursoId: number;
    /** «Primero — A · Matutina». */
    cursoEtiqueta: string;
    /** `sigerd_seccion_id` de ese curso; `null` si no está enlazado a SIGERD. */
    cursoSigerdSeccionId: number | null;
  } | null;
}

/** Una sección (curso) ACTIVA del año vigente. Es lo que se puede ofrecer de destino. */
export interface CursoZero {
  id: number;
  /** Nombre de la sección tal como la llama el colegio («A»). */
  nombre: string;
  /** «Primero — A · Matutina». */
  etiqueta: string;
  sigerdSeccionId: number | null;
}

export interface DatosZero {
  alumnos: readonly AlumnoZero[];
  cursos: readonly CursoZero[];
}

export interface OpcionesComparar {
  /**
   * RNE de cada alumno de SIGERD (`id` → RNE), de las fichas de la descarga. El
   * árbol solo trae nombre e id, así que sin esto no hay respaldo por RNE.
   */
  rnePorSigerd?: ReadonlyMap<number, string>;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export interface AlumnoNuevo {
  idSigerd: number;
  nombre: string;
  /** «Primario · Primero · A». */
  ubicacion: string;
}

export interface AlumnoYaNoEsta {
  estudianteId: number;
  nombre: string;
  sigerdId: number;
  /** Dónde está matriculado en Zero, si lo está. */
  cursoEtiqueta: string | null;
}

export interface CambioDeSeccion {
  estudianteId: number;
  matriculaId: number;
  nombre: string;
  sigerdId: number;
  /** El curso de su matrícula en Zero. */
  desde: string;
  desdeCursoId: number;
  /** Dónde lo pone SIGERD: «Primario · Primero · B». Si son varias, unidas por « / ». */
  hacia: string;
  /**
   * La sección de Zero enlazada a la de SIGERD, si hay una y es única. Sin
   * destino no se puede mover desde aquí: `sinDestino` dice por qué.
   */
  destino: { cursoId: number; etiqueta: string } | null;
  sinDestino: 'varias-secciones' | 'seccion-sin-enlazar' | 'enlace-duplicado' | null;
}

export interface SeccionNueva {
  idSeccion: number;
  nombre: string;
  ubicacion: string;
  estudiantes: number;
}

export interface SeccionRenombrada {
  cursoId: number;
  idSeccion: number;
  nombreZero: string;
  nombreSigerd: string;
  ubicacion: string;
}

export interface CambiosSigerd {
  nuevos: AlumnoNuevo[];
  yaNoEstan: AlumnoYaNoEsta[];
  cambiaronDeSeccion: CambioDeSeccion[];
  seccionesNuevas: SeccionNueva[];
  seccionesRenombradas: SeccionRenombrada[];
  /**
   * Secciones cuyos alumnos la descarga no pudo leer. Mientras haya alguna, la
   * lista de «ya no están» puede incluir a quien solo falta porque su sección
   * falló: la pantalla lo avisa.
   */
  seccionesConError: string[];
  totales: {
    /** Alumnos distintos que lista SIGERD. */
    enSigerd: number;
    /** Alumnos de Zero emparejados con uno de SIGERD. */
    emparejados: number;
    /** De esos, los que se emparejaron por RNE porque su id ya no vale. */
    porRne: number;
    /** Matriculados en un curso sin enlace a SIGERD: no se puede saber si cambiaron. */
    enCursoSinEnlace: number;
  };
}

// ── Lógica ──────────────────────────────────────────────────────────────────

/** Para comparar nombres: sin tildes, en minúsculas y con espacios normales. */
function clave(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const claveRne = (s: string) => s.trim().toUpperCase();

interface Sitio { idSeccion: number; ubicacion: string }

export function compararConSigerd(
  arbol: ArbolCentro,
  zero: DatosZero,
  opciones: OpcionesComparar = {},
): CambiosSigerd {
  // ── SIGERD aplanado: dónde está cada alumno y cada sección ───────────────
  // El portal a veces repite a un alumno en dos secciones; se guardan TODOS
  // sus sitios y se decide después, en vez de quedarse con el primero.
  const alumnosSigerd = new Map<number, { nombre: string; sitios: Sitio[] }>();
  const seccionesSigerd: Array<SeccionNueva & { error?: string }> = [];

  for (const sv of arbol.servicios ?? []) {
    for (const g of sv.grados ?? []) {
      for (const s of g.secciones ?? []) {
        const ubicacion = `${sv.nombre} · ${g.nombre} · ${s.nombre}`;
        seccionesSigerd.push({
          idSeccion: s.idSeccion, nombre: s.nombre, ubicacion,
          estudiantes: (s.estudiantes ?? []).length, error: s.error,
        });
        for (const e of s.estudiantes ?? []) {
          const a = alumnosSigerd.get(e.id) ?? { nombre: (e.nombre ?? '').trim(), sitios: [] };
          if (!a.sitios.some((x) => x.idSeccion === s.idSeccion)) a.sitios.push({ idSeccion: s.idSeccion, ubicacion });
          alumnosSigerd.set(e.id, a);
        }
      }
    }
  }

  // ── Emparejar alumnos ────────────────────────────────────────────────────
  // `emparejado`: alumno de Zero → id de SIGERD con el que se cruza.
  const emparejado = new Map<number, number>();
  const sigerdConPareja = new Set<number>();

  // 1) Por id de SIGERD.
  for (const a of zero.alumnos) {
    if (a.sigerdId != null && alumnosSigerd.has(a.sigerdId)) {
      emparejado.set(a.id, a.sigerdId);
      sigerdConPareja.add(a.sigerdId);
    }
  }

  // Los ids que Zero ya conoce, de quien sea y esté como esté: un alumno retirado
  // que SIGERD todavía lista no es «nuevo», ya tiene ficha.
  const idsConocidos = new Set(zero.alumnos.map((a) => a.sigerdId).filter((x): x is number => x != null));

  // 2) Respaldo por RNE, solo para lo que el id no resolvió. Exige que el RNE
  // sea de UN solo alumno de Zero: con dos, no se adivina.
  let porRne = 0;
  const rneSigerd = opciones.rnePorSigerd;
  if (rneSigerd && rneSigerd.size > 0) {
    const sinPareja = new Map<string, AlumnoZero[]>();
    for (const a of zero.alumnos) {
      if (emparejado.has(a.id) || !a.codigoRne?.trim()) continue;
      const k = claveRne(a.codigoRne);
      sinPareja.set(k, [...(sinPareja.get(k) ?? []), a]);
    }
    // Cuántos alumnos de SIGERD comparten cada RNE: si dos lo comparten, ninguno vale.
    const veces = new Map<string, number>();
    for (const [id, rne] of rneSigerd) {
      if (!alumnosSigerd.has(id) || idsConocidos.has(id)) continue;
      const k = claveRne(rne);
      veces.set(k, (veces.get(k) ?? 0) + 1);
    }
    for (const [id, rne] of rneSigerd) {
      if (!alumnosSigerd.has(id) || idsConocidos.has(id) || sigerdConPareja.has(id)) continue;
      const k = claveRne(rne);
      const candidatos = sinPareja.get(k);
      if (!candidatos || candidatos.length !== 1 || (veces.get(k) ?? 0) !== 1) continue;
      emparejado.set(candidatos[0].id, id);
      sigerdConPareja.add(id);
      porRne++;
    }
  }

  // ── Nuevos: en SIGERD y sin alumno en Zero ───────────────────────────────
  const nuevos: AlumnoNuevo[] = [];
  for (const [id, a] of alumnosSigerd) {
    if (idsConocidos.has(id) || sigerdConPareja.has(id)) continue;
    nuevos.push({ idSigerd: id, nombre: a.nombre, ubicacion: a.sitios.map((s) => s.ubicacion).join(' / ') });
  }
  nuevos.sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, 'es') || a.nombre.localeCompare(b.nombre, 'es'));

  // ── Secciones de Zero enlazadas a SIGERD ─────────────────────────────────
  const cursosPorSeccion = new Map<number, CursoZero[]>();
  for (const c of zero.cursos) {
    if (c.sigerdSeccionId == null) continue;
    cursosPorSeccion.set(c.sigerdSeccionId, [...(cursosPorSeccion.get(c.sigerdSeccionId) ?? []), c]);
  }

  // ── Ya no están: alumnos activos de Zero con id de SIGERD que no aparecen ─
  const yaNoEstan: AlumnoYaNoEsta[] = [];
  const cambiaronDeSeccion: CambioDeSeccion[] = [];
  let enCursoSinEnlace = 0;

  for (const a of zero.alumnos) {
    if (a.estado !== 'activo') continue;
    const idSigerd = emparejado.get(a.id);

    if (idSigerd == null) {
      if (a.sigerdId != null) {
        yaNoEstan.push({
          estudianteId: a.id, nombre: a.nombre, sigerdId: a.sigerdId,
          cursoEtiqueta: a.matricula?.cursoEtiqueta ?? null,
        });
      }
      continue;
    }

    // ── Cambiaron de sección: matriculado aquí en una, SIGERD lo pone en otra ──
    const m = a.matricula;
    if (!m) continue;
    if (m.cursoSigerdSeccionId == null) { enCursoSinEnlace++; continue; }

    const sitios = alumnosSigerd.get(idSigerd)!.sitios;
    // Si SIGERD lo tiene (también) en su sección de Zero, no cambió.
    if (sitios.some((s) => s.idSeccion === m.cursoSigerdSeccionId)) continue;

    let destino: CambioDeSeccion['destino'] = null;
    let sinDestino: CambioDeSeccion['sinDestino'] = null;
    if (sitios.length > 1) {
      // Dos sitios distintos y ninguno es el suyo: no se elige por él.
      sinDestino = 'varias-secciones';
    } else {
      const candidatos = cursosPorSeccion.get(sitios[0].idSeccion) ?? [];
      if (candidatos.length === 1) destino = { cursoId: candidatos[0].id, etiqueta: candidatos[0].etiqueta };
      // Dos secciones de Zero enlazadas a la misma de SIGERD: tampoco se elige.
      else sinDestino = candidatos.length === 0 ? 'seccion-sin-enlazar' : 'enlace-duplicado';
    }

    cambiaronDeSeccion.push({
      estudianteId: a.id, matriculaId: m.id, nombre: a.nombre, sigerdId: idSigerd,
      desde: m.cursoEtiqueta, desdeCursoId: m.cursoId,
      hacia: sitios.map((s) => s.ubicacion).join(' / '),
      destino, sinDestino,
    });
  }
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
  yaNoEstan.sort(porNombre);
  cambiaronDeSeccion.sort((a, b) => a.hacia.localeCompare(b.hacia, 'es') || porNombre(a, b));

  // ── Secciones nuevas y renombradas ───────────────────────────────────────
  const seccionesNuevas: SeccionNueva[] = [];
  const seccionesRenombradas: SeccionRenombrada[] = [];
  for (const s of seccionesSigerd) {
    const enlazadas = cursosPorSeccion.get(s.idSeccion);
    if (!enlazadas || enlazadas.length === 0) {
      seccionesNuevas.push({ idSeccion: s.idSeccion, nombre: s.nombre, ubicacion: s.ubicacion, estudiantes: s.estudiantes });
      continue;
    }
    const c = enlazadas[0];
    if (clave(c.nombre) !== clave(s.nombre)) {
      seccionesRenombradas.push({
        cursoId: c.id, idSeccion: s.idSeccion,
        nombreZero: c.nombre, nombreSigerd: s.nombre, ubicacion: s.ubicacion,
      });
    }
  }

  return {
    nuevos, yaNoEstan, cambiaronDeSeccion, seccionesNuevas, seccionesRenombradas,
    seccionesConError: seccionesSigerd.filter((s) => s.error).map((s) => s.ubicacion),
    totales: { enSigerd: alumnosSigerd.size, emparejados: emparejado.size, porRne, enCursoSinEnlace },
  };
}
