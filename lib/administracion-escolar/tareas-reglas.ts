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

/**
 * De quién es: un alumno, toda su familia o el colegio (nadie en concreto:
 * «llamar al proveedor de uniformes», «revisar la nómina»).
 */
export type AlcanceTarea = 'alumno' | 'familia' | 'colegio';

/** Cómo se lee una tarea que no es de ningún alumno ni familia. */
export const DE_COLEGIO = 'Del colegio';

export interface NuevaTarea {
  alcance: AlcanceTarea;
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
  const alcance: AlcanceTarea = e.alcance === 'familia' || e.alcance === 'colegio' ? e.alcance : 'alumno';
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

/**
 * Por dónde pasa una tarea. «En revisión» es que alguien ya la tomó o espera
 * que se la confirmen: todavía no está hecha, así que cuenta como pendiente
 * junto con las abiertas (campana, «Asignadas a mí», el número de la ficha).
 */
export type EstadoTarea = 'abierta' | 'en_revision' | 'completada';
export const PENDIENTES: EstadoTarea[] = ['abierta', 'en_revision'];
export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  abierta: 'Abierta', en_revision: 'En revisión', completada: 'Completada',
};

/** Lo que se puede hacer con el estado, y de dónde se puede llegar. */
export type AccionEstado = 'completar' | 'revision' | 'reabrir';
export const DESTINO: Record<AccionEstado, { a: EstadoTarea; desde: EstadoTarea[] }> = {
  completar: { a: 'completada', desde: ['abierta', 'en_revision'] },
  revision: { a: 'en_revision', desde: ['abierta', 'completada'] },
  reabrir: { a: 'abierta', desde: ['en_revision', 'completada'] },
};

/** Las líneas que deja cada cambio en la conversación. */
export const textoEvento = {
  creada: (autor: string, asignada: string) => `${autor} creó la tarea y la asignó a ${asignada}`,
  completada: (autor: string) => `${autor} marcó la tarea como completada`,
  reabierta: (autor: string) => `${autor} volvió a abrir la tarea`,
  revision: (autor: string) => `${autor} pasó la tarea a revisión`,
};

/** Lo que deja el cron al cerrar sola una tarea que se quedó en revisión. */
export const TEXTO_CIERRE_AUTOMATICO = 'Se cerró automáticamente: pasaron 24 horas en revisión sin respuesta. '
  + 'Si algo no quedó bien, responde en esta tarea y la volvemos a abrir.';

/** Cuánto espera una tarea en revisión (plantilla de Soporte) antes de cerrarse sola, y una parada antes del aviso urgente. */
export const HORAS_SIN_RESPUESTA = 24;

/** `urgente`: 24 horas sin movimiento, a quien le toca contestar (cron `escolar-tareas`). */
export type AvisoTarea = 'creada' | 'mensaje' | 'completada' | 'reabierta' | 'revision' | 'adjunto' | 'urgente';

/**
 * A quién le toca contestar una tarea parada, para el correo urgente.
 *
 * Si lo último lo dijo Soporte (o Zero AI), le toca al colegio. Si lo dijo
 * alguien del colegio: en una tarea de Soporte nos toca a nosotros; en una de
 * una persona, a esa persona, o a quien la creó si fue ella la que escribió.
 * Sin nada escrito, le toca a quien se le asignó.
 */
export function turnoDe(t: {
  asignadaA: string; asignadaUserId: number | null; creadaPorUserId: number | null;
  ultimo: { userId: number | null; esSoporte: boolean } | null;
}): { soporte: boolean; colegio: boolean; usuarios: number[] } {
  const colegio = (...ids: (number | null)[]) =>
    ({ soporte: false, colegio: true, usuarios: [...new Set(ids.filter((x): x is number => x != null))] });
  if (!t.ultimo) {
    return t.asignadaA === 'soporte' ? { soporte: true, colegio: false, usuarios: [] } : colegio(t.asignadaUserId);
  }
  if (t.ultimo.esSoporte) return colegio(t.creadaPorUserId, t.asignadaA === 'persona' ? t.asignadaUserId : null);
  if (t.asignadaA === 'soporte') return { soporte: true, colegio: false, usuarios: [] };
  return colegio(t.ultimo.userId === t.asignadaUserId ? t.creadaPorUserId : t.asignadaUserId);
}

// ── Plantillas de Soporte IT ─────────────────────────────────────────────────

/**
 * Lo que el equipo de Zero le dice al colegio al cerrar una tarea o al dejarla
 * en revisión, siempre igual y con el enlace a la tarea. Solo las ve y las usa
 * el equipo de Zero (rol de plataforma `admin`); la ruta `plantilla` además
 * cambia el estado y avisa a quien la creó, a los participantes y a los dueños
 * del colegio.
 */
export type PlantillaSoporte = 'cerrada' | 'revision';

export const PLANTILLAS_SOPORTE: Record<PlantillaSoporte, {
  etiqueta: string; detalle: string; accion: AccionEstado; boton: string;
  texto: (d: { nombre: string | null; url: string }) => string;
}> = {
  cerrada: {
    etiqueta: 'Resuelta y cerrada',
    detalle: 'Avisa que ya se resolvió y la marca como completada',
    accion: 'completar',
    boton: 'Enviar y cerrar',
    texto: ({ nombre, url }) => `Hola${nombre ? ` ${nombre}` : ''}. Ya resolvimos esta tarea y la cerramos. `
      + `Puedes ver lo que se hizo aquí: ${url}\n\nSi algo no quedó bien, respóndenos en esta misma tarea y la volvemos a abrir.`,
  },
  revision: {
    etiqueta: 'En revisión: que la revise',
    detalle: 'Le pide revisarla; si no responde en 24 horas se cierra sola',
    accion: 'revision',
    boton: 'Enviar y pasar a revisión',
    texto: ({ nombre, url }) => `Hola${nombre ? ` ${nombre}` : ''}. Dejamos esta tarea en revisión. `
      + `Por favor revísala y confírmanos si quedó bien: ${url}\n\nSi no recibimos respuesta en 24 horas, `
      + 'la cerramos automáticamente.',
  },
};

export const esPlantilla = (v: unknown): v is PlantillaSoporte =>
  typeof v === 'string' && Object.hasOwn(PLANTILLAS_SOPORTE, v);

/** «Lic. Lizandro Martinez» → «Lizandro»: el saludo usa el primer nombre, sin el título. */
export function primerNombre(nombre: string | null | undefined): string | null {
  const partes = (nombre ?? '').trim().split(/\s+/).filter((p) => p && !/\.$/.test(p));
  const n = partes[0];
  if (!n || n.includes('@')) return null;
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

// ── Archivos adjuntos ────────────────────────────────────────────────────────

const MB = 1024 * 1024;
/** Un video del celular de un minuto pesa unos 100 MB. */
export const TOPE_VIDEO = 200 * MB;
export const TOPE_ARCHIVO = 25 * MB;

/**
 * Lo que se acepta, por extensión, con el tipo con que se guarda. El tipo que
 * manda el navegador no se usa: se decide aquí. Nada que el navegador ejecute
 * (html, svg, js): el archivo se sirve tal cual desde S3.
 */
const TIPOS: Record<string, { mime: string; clase: 'imagen' | 'video' | 'documento' }> = {
  jpg: { mime: 'image/jpeg', clase: 'imagen' }, jpeg: { mime: 'image/jpeg', clase: 'imagen' },
  png: { mime: 'image/png', clase: 'imagen' }, gif: { mime: 'image/gif', clase: 'imagen' },
  webp: { mime: 'image/webp', clase: 'imagen' }, heic: { mime: 'image/heic', clase: 'imagen' },
  heif: { mime: 'image/heif', clase: 'imagen' },
  mp4: { mime: 'video/mp4', clase: 'video' }, mov: { mime: 'video/quicktime', clase: 'video' },
  m4v: { mime: 'video/x-m4v', clase: 'video' }, webm: { mime: 'video/webm', clase: 'video' },
  '3gp': { mime: 'video/3gpp', clase: 'video' },
  pdf: { mime: 'application/pdf', clase: 'documento' },
  doc: { mime: 'application/msword', clase: 'documento' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', clase: 'documento' },
  xls: { mime: 'application/vnd.ms-excel', clase: 'documento' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', clase: 'documento' },
  ppt: { mime: 'application/vnd.ms-powerpoint', clase: 'documento' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', clase: 'documento' },
  csv: { mime: 'text/csv', clase: 'documento' }, txt: { mime: 'text/plain', clase: 'documento' },
  zip: { mime: 'application/zip', clase: 'documento' },
};

/** Lo que pone el selector de archivos para que solo ofrezca lo que se acepta. */
export const ACEPTA_ADJUNTOS = Object.keys(TIPOS).map((e) => `.${e}`).join(',');

export const extensionDe = (nombre: string) => (nombre.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase();

export type ClaseAdjunto = 'imagen' | 'video' | 'documento';
export function claseDeMime(mime: string): ClaseAdjunto {
  return mime.startsWith('image/') ? 'imagen' : mime.startsWith('video/') ? 'video' : 'documento';
}

export interface NuevoAdjunto { nombre: string; extension: string; mime: string; bytes: number; clase: ClaseAdjunto }

/** El archivo que se quiere subir, ya revisado, o el error para la persona. */
export function validarAdjunto(entrada: unknown): { ok: true; adjunto: NuevoAdjunto } | { ok: false; error: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nombre = typeof e.nombre === 'string' ? e.nombre.trim().replace(/[\\/]/g, '_').slice(-200) : '';
  if (!nombre) return { ok: false, error: 'El archivo no tiene nombre.' };
  const extension = extensionDe(nombre);
  const tipo = TIPOS[extension];
  if (!tipo) return { ok: false, error: `No se aceptan archivos .${extension || '¿?'}: sube fotos, videos, PDF, Word, Excel o PowerPoint.` };
  const bytes = Number(e.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0) return { ok: false, error: 'El archivo está vacío.' };
  const tope = tipo.clase === 'video' ? TOPE_VIDEO : TOPE_ARCHIVO;
  if (bytes > tope) return { ok: false, error: `«${nombre}» pesa más de ${tope / MB} MB.` };
  return { ok: true, adjunto: { nombre, extension, mime: tipo.mime, bytes, clase: tipo.clase } };
}

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
