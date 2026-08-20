/**
 * Qué plantilla de WhatsApp le toca a cada aviso escolar.
 *
 * Los avisos son tres (`al-emitir`, `al-vencer`, `antes-mora`) pero las
 * plantillas son CINCO, porque `al-vencer` termina de tres maneras distintas
 * según la mora del concepto y una plantilla de Meta no puede ramificar:
 *
 *   cobra mora, con días de gracia  → «tienes N días antes del recargo»
 *   cobra mora, sin días de gracia  → «ya se aplicó el recargo»
 *   no cobra mora                   → «págala para ponerte al día»
 *
 * Y como `moraDiasGracia` es del CONCEPTO y no del colegio —la colegiatura
 * puede dar cinco días y la inscripción ninguno—, un mismo colegio necesita
 * las tres.
 */

import { and, eq, isNull, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappPlantillasAviso, whatsappPlantillas } from '@/lib/db/schema';

export const AVISOS_PLANTILLA = [
  {
    clave: 'al-emitir',
    titulo: 'Cuando sale la factura',
    detalle: 'El día que se emite el cargo. Avisa de qué es, cuánto y hasta cuándo.',
    sugerida: 'factura_lista',
    variables: ['concepto', 'estudiante(s)', 'monto', 'fecha de vencimiento'],
  },
  {
    clave: 'al-vencer-con-gracia',
    titulo: 'Venció, con días de gracia',
    detalle: 'Venció hoy y el concepto cobra mora, pero todavía quedan días antes del recargo.',
    sugerida: 'factura_vencio_hoy',
    variables: ['concepto', 'estudiante(s)', 'monto', 'días de gracia'],
  },
  {
    clave: 'al-vencer-con-recargo',
    titulo: 'Venció y el recargo ya entró',
    detalle: 'Venció hoy, cobra mora y no hay días de gracia: el recargo se aplicó de una vez.',
    sugerida: 'factura_vencio_con_recargo',
    variables: ['concepto', 'estudiante(s)', 'monto'],
  },
  {
    clave: 'al-vencer-sin-mora',
    titulo: 'Venció, sin recargo',
    detalle: 'Venció hoy y el concepto no cobra mora. No hay nada que amenazar.',
    sugerida: 'factura_vencio_sin_recargo',
    variables: ['concepto', 'estudiante(s)', 'monto'],
  },
  {
    clave: 'antes-mora',
    titulo: 'Antes de que entre el recargo',
    detalle: 'Unos días antes del recargo. Es el único aviso que le ahorra dinero al padre, y el que de verdad hace pagar.',
    sugerida: 'evita_el_recargo',
    variables: ['concepto', 'estudiante(s)', 'monto', 'fecha del recargo'],
  },
] as const;

export type AvisoPlantilla = (typeof AVISOS_PLANTILLA)[number]['clave'];

/** Los tres momentos que calcula el motor de avisos. */
export type MomentoAviso = 'al-emitir' | 'al-vencer' | 'antes-mora';

/**
 * En cuál de los cinco huecos cae un aviso.
 *
 * Puro a propósito: tiene que decidir EXACTAMENTE igual que las ramas de
 * `redactar()` en lib/administracion-escolar/avisos.ts. Si las dos se separan,
 * al padre le llega una plantilla que dice «ya se aplicó el recargo» cuando
 * todavía le quedaban cinco días — y eso es una queja, no un bug cosmético.
 */
export function huecoDe(
  momento: MomentoAviso,
  cobraMora: boolean,
  moraDiasGracia: number,
): AvisoPlantilla {
  if (momento === 'al-emitir')  return 'al-emitir';
  if (momento === 'antes-mora') return 'antes-mora';
  if (!cobraMora)               return 'al-vencer-sin-mora';
  return moraDiasGracia > 0 ? 'al-vencer-con-gracia' : 'al-vencer-con-recargo';
}

export interface PlantillaAsignada {
  aviso: AvisoPlantilla;
  nombre: string;
  idioma: string;
  /** true = la puso este colegio · false = viene del default de la plataforma. */
  propia: boolean;
  /**
   * La versión para cuando el cargo YA tiene factura: la que lleva el botón al
   * enlace de pago. Null = este colegio manda siempre la misma.
   */
  nombreConLink: string | null;
  /** Si esa otra lleva botón, y por tanto necesita el parámetro de URL. */
  conLinkTieneBoton: boolean;
  /**
   * Si la de siempre lleva botón de enlace.
   *
   * Importa porque HOY no se puede enviar: la URL del botón lleva variable y
   * rellenarla necesita un parámetro de tipo `button` que el CRM no expone —su
   * `POST /api/v1/messages` solo acepta `bodyParameters`—. Asignar una de estas
   * haría fallar todos los avisos de ese hueco, así que el motor las salta.
   *
   * Se saca de la plantilla guardada y NO del nombre: el colegio puede asignar
   * la que quiera y adivinar por el sufijo deja pasar la que sí rompe.
   */
  conBoton: boolean;
}

/**
 * Las asignaciones vigentes de un colegio: las suyas, y para los huecos que no
 * haya llenado, las de la plataforma.
 *
 * Se resuelve con UNA consulta y se decide en memoria. Con dos consultas
 * —primero las suyas, luego los defaults de lo que falte— el colegio que no ha
 * configurado nada paga siempre dos viajes, y son cinco filas.
 */
export async function getPlantillasDeTeam(teamId: number): Promise<PlantillaAsignada[]> {
  const filas = await db
    .select({
      teamId: whatsappPlantillasAviso.teamId,
      aviso:  whatsappPlantillasAviso.aviso,
      nombre: whatsappPlantillasAviso.plantillaNombre,
      conLink: whatsappPlantillasAviso.plantillaConLink,
      idioma: whatsappPlantillasAviso.idioma,
    })
    .from(whatsappPlantillasAviso)
    .where(or(eq(whatsappPlantillasAviso.teamId, teamId), isNull(whatsappPlantillasAviso.teamId)));

  const nombres = [...new Set(filas.flatMap((f) => [f.nombre, f.conLink].filter((x): x is string => !!x)))];
  const conBoton = new Set(
    nombres.length === 0 ? [] : (await db
      .select({ nombre: whatsappPlantillas.nombre, boton: whatsappPlantillas.boton })
      .from(whatsappPlantillas)
      .where(inArray(whatsappPlantillas.nombre, nombres)))
      .filter((p) => p.boton != null)
      .map((p) => p.nombre),
  );

  return AVISOS_PLANTILLA.map(({ clave }) => {
    const propia  = filas.find((f) => f.teamId === teamId && f.aviso === clave);
    const general = filas.find((f) => f.teamId === null   && f.aviso === clave);
    const usar    = propia ?? general;
    if (!usar) return null;
    return {
      aviso: clave, nombre: usar.nombre, idioma: usar.idioma,
      propia: propia != null, conBoton: conBoton.has(usar.nombre),
      nombreConLink: usar.conLink ?? null,
      conLinkTieneBoton: usar.conLink ? conBoton.has(usar.conLink) : false,
    };
  }).filter((x): x is PlantillaAsignada => x !== null);
}

/** La plantilla que le toca a un aviso concreto, o null si ese hueco está vacío. */
export async function resolverPlantilla(
  teamId: number,
  momento: MomentoAviso,
  cobraMora: boolean,
  moraDiasGracia: number,
): Promise<PlantillaAsignada | null> {
  const hueco = huecoDe(momento, cobraMora, moraDiasGracia);
  const todas = await getPlantillasDeTeam(teamId);
  return todas.find((p) => p.aviso === hueco) ?? null;
}

/**
 * Guarda las asignaciones de un colegio (o los defaults, con teamId null).
 * Un nombre vacío BORRA la asignación: es como se vuelve al default.
 */
export async function guardarPlantillas(
  teamId: number | null,
  asignaciones: { aviso: AvisoPlantilla; nombre: string; idioma?: string; nombreConLink?: string | null }[],
): Promise<void> {
  const claves = new Set<string>(AVISOS_PLANTILLA.map((a) => a.clave));
  const validas = asignaciones.filter((a) => claves.has(a.aviso));
  if (validas.length === 0) return;

  const aBorrar  = validas.filter((a) => !a.nombre.trim()).map((a) => a.aviso);
  const aGuardar = validas.filter((a) => a.nombre.trim());

  const delTeam = teamId == null
    ? isNull(whatsappPlantillasAviso.teamId)
    : eq(whatsappPlantillasAviso.teamId, teamId);

  await db.transaction(async (tx) => {
    if (aBorrar.length > 0) {
      await tx.delete(whatsappPlantillasAviso)
        .where(and(delTeam, inArray(whatsappPlantillasAviso.aviso, aBorrar)));
    }
    for (const a of aGuardar) {
      // Borrar-e-insertar en vez de ON CONFLICT: el índice único es PARCIAL
      // (dos, uno para las de colegio y otro para los defaults), y no se puede
      // apuntar a un índice parcial desde ON CONFLICT.
      await tx.delete(whatsappPlantillasAviso)
        .where(and(delTeam, eq(whatsappPlantillasAviso.aviso, a.aviso)));
      await tx.insert(whatsappPlantillasAviso).values({
        teamId,
        aviso: a.aviso,
        plantillaNombre: a.nombre.trim(),
        // Vacío = este colegio manda siempre la misma, tenga factura o no.
        plantillaConLink: a.nombreConLink?.trim() || null,
        idioma: a.idioma?.trim() || 'es',
      });
    }
  });
}

// ─── Los valores que se le mandan a Meta ─────────────────────────────────────

/** Lo que hace falta saber para rellenar cualquiera de las cinco. */
export interface DatosAviso {
  colegio: string;
  concepto: string;
  estudiante: string;
  monto: string;
  /** El teléfono del colegio, ya legible. */
  telefonoColegio: string;
  /** Hasta cuándo puede pagar, en letra. Solo `al-emitir`. */
  fechaLimite?: string | null;
  /** Días antes del recargo. Solo `al-vencer-con-gracia`. */
  diasGracia?: number | null;
  /** Cuándo entra el recargo, en letra. Solo `antes-mora`. */
  fechaRecargo?: string | null;
}

/**
 * Los valores de `{{1}}`, `{{2}}`… en orden.
 *
 * Pura y con su propio test porque Meta rellena POR POSICIÓN, no por nombre: un
 * valor corrido de sitio no da error, manda un mensaje que dice otra cosa —el
 * concepto donde va el monto— y eso llega al padre.
 *
 * Las cinco comparten las cuatro primeras (colegio, concepto, estudiante,
 * monto) y terminan en el teléfono. Lo que cambia es el hueco del medio, que
 * solo tienen tres de ellas.
 *
 * Ningún valor puede ir vacío ni traer saltos de línea: Meta rechaza el envío
 * con 132000 y el aviso no sale. Por eso todo pasa por `limpio()`.
 */
export function parametrosDeAviso(aviso: AvisoPlantilla, d: DatosAviso): string[] {
  const limpio = (v: string | number | null | undefined, respaldo: string): string => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s || respaldo;
  };

  const cabeza = [
    limpio(d.colegio, 'tu colegio'),
    limpio(d.concepto, 'un cargo'),
    limpio(d.estudiante, 'tu hijo(a)'),
    limpio(d.monto, 'el monto pendiente'),
  ];
  const telefono = limpio(d.telefonoColegio, 'el número del colegio');

  if (aviso === 'al-emitir') {
    return [...cabeza, limpio(d.fechaLimite, 'la fecha indicada'), telefono];
  }
  if (aviso === 'al-vencer-con-gracia') {
    // En días: el texto dice «Tienes {{5}} día(s)», así que va el número solo.
    return [...cabeza, limpio(d.diasGracia, 'pocos'), telefono];
  }
  if (aviso === 'antes-mora') {
    return [...cabeza, limpio(d.fechaRecargo, 'la fecha del recargo'), telefono];
  }
  // Las dos de vencimiento sin hueco intermedio.
  return [...cabeza, telefono];
}
