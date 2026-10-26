/**
 * lib/administracion-escolar/tareas-reglas.ts — las reglas de las tareas por
 * revisar, sin base de datos: qué se acepta al crear una, cómo se llama quien
 * escribe y qué dice cada evento de la conversación. Lo usan las rutas y lo
 * prueba vitest; la pantalla repite las etiquetas desde aquí.
 */

/**
 * A quién se le asigna: al equipo de Zero o a una persona del colegio con
 * nombre. Hubo también «Dirección» y «Administración», pero un grupo sin
 * nombre es una tarea que nadie siente suya: se quitaron (24-10-2026).
 */
export const ASIGNACIONES = ['soporte', 'persona'] as const;
export type Asignacion = typeof ASIGNACIONES[number];

/** Cómo se lee a quién le toca. «persona» se lee con su nombre. */
export const ETIQUETA_ASIGNACION: Record<Exclude<Asignacion, 'persona'>, string> = {
  soporte: 'Soporte IT · Zero',
};

export const AUTOR_SOPORTE = 'Soporte IT · Zero';
export const AUTOR_IA = 'Zero AI';

export function etiquetaAsignada(asignadaA: string, nombrePersona?: string | null): string {
  if (asignadaA === 'persona') return nombrePersona?.trim() || 'Una persona';
  return ETIQUETA_ASIGNACION[asignadaA as Exclude<Asignacion, 'persona'>] ?? asignadaA;
}

/**
 * Cómo firma quien escribe. El equipo de Zero (rol de plataforma `admin`)
 * firma como Soporte IT, aunque entre a la empresa del colegio: para el
 * colegio es soporte, no un empleado suyo.
 */
export function autorDe(user: { name?: string | null; email: string; platformRole?: string | null }): string {
  if (user.platformRole === 'admin') return AUTOR_SOPORTE;
  return user.name?.trim() || user.email;
}

/** Quien hace un cambio: con qué firma, y si es el equipo de Zero. Zero AI no tiene usuario. */
export interface AutorTarea { userId: number | null; nombre: string; esSoporte: boolean }

export const autorTarea = (user: { id: number; name?: string | null; email: string; platformRole?: string | null }): AutorTarea =>
  ({ userId: user.id, nombre: autorDe(user), esSoporte: user.platformRole === 'admin' });

export const AUTOR_ZERO_AI: AutorTarea = { userId: null, nombre: AUTOR_IA, esSoporte: false };

export interface NuevaTarea {
  alcance: 'alumno' | 'familia';
  titulo: string;
  descripcion: string | null;
  asignadaA: Asignacion;
  asignadaUserId: number | null;
  ecfDocumentId: number | null;
  venceEl: string | null;
}

const TOPE_TITULO = 160;
const TOPE_TEXTO = 4000;
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const idPositivo = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Lo que manda la pantalla al crear una tarea, ya limpio, o el error para la persona. */
export function validarNuevaTarea(entrada: unknown): { ok: true; tarea: NuevaTarea } | { ok: false; error: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const titulo = typeof e.titulo === 'string' ? e.titulo.trim() : '';
  if (!titulo) return { ok: false, error: 'Escribe qué hay que revisar.' };
  if (titulo.length > TOPE_TITULO) return { ok: false, error: `El título es muy largo (máximo ${TOPE_TITULO} letras).` };
  const descripcion = typeof e.descripcion === 'string' && e.descripcion.trim() ? e.descripcion.trim() : null;
  if (descripcion && descripcion.length > TOPE_TEXTO) return { ok: false, error: 'La descripción es muy larga.' };
  const alcance = e.alcance === 'familia' ? 'familia' : 'alumno';
  if (!ASIGNACIONES.includes(e.asignadaA as Asignacion)) return { ok: false, error: 'Elige a quién se le asigna.' };
  const asignadaA = e.asignadaA as Asignacion;
  const asignadaUserId = idPositivo(e.asignadaUserId);
  if (asignadaA === 'persona' && !asignadaUserId) return { ok: false, error: 'Elige a la persona.' };
  const venceEl = typeof e.venceEl === 'string' && e.venceEl ? e.venceEl : null;
  if (venceEl && !esFecha(venceEl)) return { ok: false, error: 'La fecha no es válida.' };
  return {
    ok: true,
    tarea: {
      alcance, titulo, descripcion, asignadaA,
      asignadaUserId: asignadaA === 'persona' ? asignadaUserId : null,
      ecfDocumentId: idPositivo(e.ecfDocumentId),
      venceEl,
    },
  };
}

/** Lo que se escribe en la conversación: no vacío y con tope. */
export function validarMensaje(texto: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!t) return { ok: false, error: 'Escribe algo antes de enviar.' };
  if (t.length > TOPE_TEXTO) return { ok: false, error: 'El mensaje es muy largo.' };
  return { ok: true, texto: t };
}

/** Las líneas que deja cada cambio en la conversación. */
export const textoEvento = {
  creada: (autor: string, asignada: string) => `${autor} creó la tarea y la asignó a ${asignada}`,
  completada: (autor: string) => `${autor} marcó la tarea como completada`,
  reabierta: (autor: string) => `${autor} volvió a abrir la tarea`,
};

export type AvisoTarea = 'creada' | 'mensaje' | 'completada' | 'reabierta';

/**
 * A quién se le avisa por correo de un cambio en la tarea.
 *
 * Al crearla, solo a quien se le asignó. Después, también a quien la creó y a
 * quien haya escrito en la conversación: una respuesta que nadie lee es una
 * tarea parada. Nunca a quien hizo el cambio, ni a Soporte IT cuando quien
 * escribe es el propio Soporte.
 */
export function aQuienAvisar(
  t: { asignadaA: string; asignadaUserId: number | null; creadaPorUserId: number | null },
  participantes: number[],
  aviso: AvisoTarea,
  autor: { userId: number | null; esSoporte: boolean },
): { usuarios: number[]; soporte: boolean } {
  const usuarios = new Set<number>();
  if (t.asignadaA === 'persona' && t.asignadaUserId) usuarios.add(t.asignadaUserId);
  if (aviso !== 'creada') {
    if (t.creadaPorUserId) usuarios.add(t.creadaPorUserId);
    for (const p of participantes) usuarios.add(p);
  }
  if (autor.userId) usuarios.delete(autor.userId);
  return { usuarios: [...usuarios], soporte: t.asignadaA === 'soporte' && !autor.esSoporte };
}

// ── Zero AI: lo que encuentra al revisar cargos y facturas ──────────────────

/**
 * Zero AI está apagado: el usuario pidió no subirlo todavía (24-10-2026).
 * Encenderlo es poner `true`: aparecen el botón «Revisar con Zero AI», el
 * número de «Sugeridas por Zero AI» y el filtro por origen en «Por revisar», y
 * la ruta `/api/administracion-escolar/tareas/zero-ai` deja de dar 404.
 */
export const ZERO_AI_TAREAS = false;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const rd = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const mesDe = (mes: number, anio: number) => `${MESES[mes - 1] ?? `mes ${mes}`} ${anio}`;

/** Lo que Zero AI encontró y la tarea que abre. `clave` impide abrirla dos veces. */
export interface Hallazgo {
  clave: string;
  estudianteId: number;
  titulo: string;
  descripcion: string;
  ecfDocumentId: number | null;
  cargoId: number | null;
}

/**
 * Un cobro de más guardado como cargo «Pago de más (a revisión)»: el dinero
 * entró, pero nadie ha dicho todavía a qué se aplica.
 */
export function hallazgoPagoDeMas(c: {
  cargoId: number; estudianteId: number; montoCentavos: number; factura: string | null; ecfDocumentId: number | null;
}): Hallazgo {
  return {
    clave: `pago-de-mas:${c.cargoId}`,
    estudianteId: c.estudianteId,
    titulo: `Decidir qué hacer con ${rd(c.montoCentavos)} de pago de más`,
    descripcion: `Entraron ${rd(c.montoCentavos)} de más${c.factura ? ` en la factura ${c.factura}` : ''} y quedaron `
      + 'guardados como «Pago de más (a revisión)». ¿Se aplican a otro mes o a otro concepto, '
      + 'se quedan como saldo a favor, o se devuelven?',
    ecfDocumentId: c.ecfDocumentId,
    cargoId: c.cargoId,
  };
}

/**
 * El mismo concepto cobrado dos veces el mismo mes al mismo alumno. Casi
 * siempre es la facturación recurrente repitiendo un mes que ya se había
 * cobrado a mano (Mi Casita, septiembre 2026).
 */
export function hallazgoCargoRepetido(c: {
  estudianteId: number; conceptoId: number; concepto: string; anio: number; mes: number;
  cargos: { id: number; montoCentavos: number; estado: string; factura: string | null; ecfDocumentId: number | null }[];
}): Hallazgo {
  const sinFactura = c.cargos.find((x) => !x.factura) ?? c.cargos[c.cargos.length - 1];
  const conFactura = c.cargos.find((x) => x.factura);
  const lista = c.cargos.map((x) => `${rd(x.montoCentavos)} ${x.estado}${x.factura ? ` (factura ${x.factura})` : ' (sin factura)'}`);
  return {
    clave: `cargo-repetido:${c.estudianteId}:${c.conceptoId}:${c.anio}-${c.mes}`,
    estudianteId: c.estudianteId,
    titulo: `${c.concepto} de ${mesDe(c.mes, c.anio)} está cobrado ${c.cargos.length === 2 ? 'dos' : c.cargos.length} veces`,
    descripcion: `Hay ${c.cargos.length} cargos de ${c.concepto} para ${mesDe(c.mes, c.anio)}: ${lista.join('; ')}. `
      + 'Si uno sobra, hay que anularlo; si son dos cosas distintas, a uno le toca otro concepto.',
    ecfDocumentId: conFactura?.ecfDocumentId ?? null,
    cargoId: sinFactura?.id ?? null,
  };
}

/**
 * Un mes con su factura por menos de lo que dice el cargo: o se acordó un
 * precio menor y hay que bajar el cargo, o falta facturar la diferencia.
 */
export function hallazgoFacturaMenor(c: {
  cargoId: number; estudianteId: number; concepto: string; anio: number; mes: number;
  cargoCentavos: number; facturaCentavos: number; factura: string; ecfDocumentId: number;
}): Hallazgo {
  const diferencia = c.cargoCentavos - c.facturaCentavos;
  return {
    clave: `factura-menor:${c.cargoId}`,
    estudianteId: c.estudianteId,
    titulo: `${c.concepto} de ${mesDe(c.mes, c.anio)}: la factura no cubre el cargo`,
    descripcion: `La factura ${c.factura} es de ${rd(c.facturaCentavos)} y el cargo de ${mesDe(c.mes, c.anio)} `
      + `es de ${rd(c.cargoCentavos)}: faltan ${rd(diferencia)}. Si se acordó ${rd(c.facturaCentavos)}, `
      + 'hay que bajar el cargo; si no, falta facturar la diferencia.',
    ecfDocumentId: c.ecfDocumentId,
    cargoId: c.cargoId,
  };
}
