/**
 * La factura se ata a sus cargos sola, al crearse.
 *
 * Antes esto era un botón. La secretaria guardaba la factura y le salían dos
 * opciones: «Vincular al cargo y volver al estudiante» o «Ver factura sin
 * vincular». Si se iba, cerraba el cajón, o pulsaba la segunda —que suena
 * inofensiva— el cargo se quedaba sin factura para siempre.
 *
 * Lo que se veía después: la ficha del alumno decía «Sin facturar» encima de
 * una factura que existía y a veces ya estaba cobrada; las tarjetas de arriba
 * decían «Facturado RD$0.00 · Por facturar RD$3,000» con el documento ya
 * emitido; y si alguien hacía caso, le cobraba dos veces a la familia.
 *
 * En producción hay 20 facturas así en un colegio, 18 de ellas cobradas por
 * RD$213,500, y ya no se pueden reparar: nacieron sin líneas, así que no queda
 * rastro de a qué cuota pertenecían. De ahí que esto viva en el servidor y no
 * en un clic — un enlace que depende de que alguien se acuerde no es un enlace.
 *
 * El dato con el que se ata viaja en cada línea desde el prefill: `cuotaClave`,
 * con la forma `estudiante:cargo:mes:año`. Ver `LineaPrefill.cuotaClave`.
 */

import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { adminEscolarCargos, adminEscolarEstudiantes, ecfDocuments } from '@/lib/db/schema';
import type { db as Db } from '@/lib/db/drizzle';

/** Lo que se pudo atar, para poder contarlo y contarlo bien. */
export interface ResultadoVinculo {
  vinculados: number[];
  /** Pedidos que no se ataron: ya tenían factura, o no son de esta familia. */
  omitidos: number[];
}

/**
 * Los ids de cargo que vienen en las líneas.
 *
 * Un mes ADELANTADO llega con id 0 —su cargo todavía no existe— y se descarta:
 * ese lo crea el flujo de «adelantar» y se ata aparte. Lo demás se queda con
 * los ids reales, sin repetir.
 */
export function cargosDeLasLineas(
  lineas: { cuotaClave?: string | null }[] | null | undefined,
): number[] {
  if (!Array.isArray(lineas)) return [];
  const ids = new Set<number>();
  for (const l of lineas) {
    if (typeof l?.cuotaClave !== 'string') continue;
    const partes = l.cuotaClave.split(':');
    if (partes.length !== 4) continue;
    const cargoId = Number(partes[1]);
    if (Number.isInteger(cargoId) && cargoId > 0) ids.add(cargoId);
  }
  return [...ids];
}

/**
 * Ata a la factura los cargos que sus líneas declaran.
 *
 * Tres candados, y ninguno sobra:
 *
 *   1. El cargo tiene que ser del MISMO equipo. Sin esto, una clave manipulada
 *      podría atar el cargo de otro colegio.
 *   2. El cargo tiene que ser de un alumno cuyo responsable de pago es el
 *      cliente de la factura. Es el mismo guard que ya hacía
 *      `saldar-con-factura`: cobrarle a alguien el hijo de otro deja de ser
 *      posible por construcción.
 *   3. Solo se atan cargos SIN factura (`ecf_document_id IS NULL`). Un cargo ya
 *      facturado no se secuestra: eso sería cobrarlo dos veces.
 *
 * No lanza si algo no cuadra. Una factura válida no puede caerse porque un
 * cargo suyo ya estuviera atado — se anota en `omitidos` y quien llama decide
 * si lo dice. El botón manual sigue existiendo como red: `saldar-con-factura`
 * es idempotente, así que volver a pulsarlo no rompe nada.
 */
export async function vincularCargosDeFactura(
  tx: typeof Db,
  args: { teamId: number; documentoId: number; clientId: number | null; cargoIds: number[] },
): Promise<ResultadoVinculo> {
  const { teamId, documentoId, clientId, cargoIds } = args;
  if (cargoIds.length === 0 || clientId == null) {
    return { vinculados: [], omitidos: cargoIds };
  }

  const vinculados = await tx
    .update(adminEscolarCargos)
    .set({ ecfDocumentId: documentoId, updatedAt: new Date() })
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.id, cargoIds),
      isNull(adminEscolarCargos.ecfDocumentId),
      // El alumno del cargo le factura a ESTE cliente. Va como subconsulta
      // porque el UPDATE no puede unir tablas.
      inArray(
        adminEscolarCargos.estudianteId,
        tx.select({ id: adminEscolarEstudiantes.id })
          .from(adminEscolarEstudiantes)
          .where(and(
            eq(adminEscolarEstudiantes.teamId, teamId),
            eq(adminEscolarEstudiantes.facturarAClientId, clientId),
          )),
      ),
    ))
    .returning({ id: adminEscolarCargos.id });

  const hechos = new Set(vinculados.map((v) => v.id));
  return {
    vinculados: [...hechos],
    omitidos: cargoIds.filter((id) => !hechos.has(id)),
  };
}


/**
 * De quién es la factura, cuando el formulario no lo dijo.
 *
 * Pasa más de lo que parece: en el buscador de RNC se puede elegir un RNC del
 * padrón de la DGII, que NO es un contacto de la agenda. La factura sale con
 * su RNC correcto y `client_id` en NULL — y una factura sin cliente no se puede
 * atar a ningún cargo, porque el candado exige que el cliente sea el
 * responsable de pago del alumno. Queda huérfana para siempre.
 *
 * Cuando las líneas dicen de qué cargos son, el dueño no hay que adivinarlo: el
 * alumno del cargo tiene su responsable de pago, y ese ES el cliente de la
 * factura. Se rellena solo, y únicamente si venía vacío — si alguien eligió un
 * contacto a propósito, manda el suyo.
 */
export async function responsableDeLosCargos(
  tx: typeof Db,
  args: { teamId: number; cargoIds: number[] },
): Promise<number | null> {
  if (args.cargoIds.length === 0) return null;

  const filas = await tx
    .selectDistinct({ clientId: adminEscolarEstudiantes.facturarAClientId })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, args.teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.teamId, args.teamId),
      inArray(adminEscolarCargos.id, args.cargoIds),
    ));

  const ids = filas.map((f) => f.clientId).filter((x): x is number => x != null);
  // Dos responsables distintos = no hay UN dueño. No se inventa: eso solo pasa
  // si alguien mezcló hijos de dos familias, y ahí la factura está mal de raíz.
  return new Set(ids).size === 1 ? ids[0] : null;
}

/** Le pone dueño a una factura escolar que salió sin él. */
export async function ponerResponsableSiFalta(
  tx: typeof Db,
  args: { teamId: number; documentoId: number; clientId: number },
): Promise<void> {
  await tx
    .update(ecfDocuments)
    .set({ clientId: args.clientId })
    .where(and(
      eq(ecfDocuments.id, args.documentoId),
      eq(ecfDocuments.teamId, args.teamId),
      isNull(ecfDocuments.clientId),
    ));
}


/**
 * Los alumnos que vienen en las líneas.
 *
 * A diferencia de `cargosDeLasLineas`, esto sirve TAMBIÉN para los meses
 * adelantados: ahí el cargo todavía no existe (id 0) pero el alumno sí, y con
 * el alumno basta para saber de quién es la factura.
 */
export function estudiantesDeLasLineas(
  lineas: { cuotaClave?: string | null }[] | null | undefined,
): number[] {
  if (!Array.isArray(lineas)) return [];
  const ids = new Set<number>();
  for (const l of lineas) {
    if (typeof l?.cuotaClave !== 'string') continue;
    const partes = l.cuotaClave.split(':');
    if (partes.length !== 4) continue;
    const estudianteId = Number(partes[0]);
    if (Number.isInteger(estudianteId) && estudianteId > 0) ids.add(estudianteId);
  }
  return [...ids];
}

/** El responsable de pago común de unos alumnos, si es uno solo. */
export async function responsableDeLosEstudiantes(
  tx: typeof Db,
  args: { teamId: number; estudianteIds: number[] },
): Promise<number | null> {
  if (args.estudianteIds.length === 0) return null;
  const filas = await tx
    .selectDistinct({ clientId: adminEscolarEstudiantes.facturarAClientId })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, args.teamId),
      inArray(adminEscolarEstudiantes.id, args.estudianteIds),
    ));
  const ids = filas.map((f) => f.clientId).filter((x): x is number => x != null);
  return new Set(ids).size === 1 ? ids[0] : null;
}
