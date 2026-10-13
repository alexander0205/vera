/**
 * Cobrarle un concepto a los alumnos de un curso desde la propia pantalla de
 * Tarifas.
 *
 * En Configuración escolar > Tarifas se ve, fila por fila, lo que cuesta un
 * concepto en cada servicio, grado y sección: «Evaluación Inicial, RD$500,
 * Inicial - Matutina». Lo que no se podía hacer ahí era lo único que se quiere
 * hacer justo después de ponerle el precio —cobrárselo a esos alumnos—: había
 * que irse a «Cargo a varios alumnos», buscar el concepto otra vez, teclear el
 * monto que se acababa de guardar y acotar a mano el curso. Tres sitios donde
 * equivocarse y ponerle a Primaria el precio de Inicial.
 *
 * La acción de Tarifas no es esa pantalla metida en un diálogo: es lo
 * imprescindible de ella. El concepto NO se elige —es el de la fila, y desde
 * aquí no se crean conceptos nuevos—, el curso NO se elige —es el de la fila—
 * y el monto NO se teclea —es la tarifa de esa fila—. Lo único que queda por
 * decidir es a cuáles de esos alumnos se les cobra y hasta cuándo pueden
 * pagar.
 *
 * Aquí vive lo que se puede probar sin pantalla: qué secciones entran en una
 * fila, cuándo la acción no se puede ofrecer y cómo se cuenta a quién le falta
 * el cargo frente a quién ya lo tiene.
 *
 * Pruebas en `tests/unit/cargo-desde-tarifa.test.ts`.
 */

import { esCobroFijo } from './cargo-lote';

/** La fila de la que salió la acción: un servicio, un grado o una sección. */
export interface ObjetivoDeTarifa {
  tipo: 'servicio' | 'grado' | 'seccion';
  id: number;
}

interface GradoDeEstructura { id: number; servicioId: number }
interface SeccionDeEstructura { id: number; gradoId: number }

/**
 * Las secciones que entran en la fila. Es lo que la ruta de generar entiende
 * por «a quién» (`cursoIds`): un servicio son todas las secciones de todos sus
 * grados, un grado las suyas y una sección ella misma.
 *
 * Una lista VACÍA no se puede mandar: la ruta la lee como «todo el colegio» y
 * le crearía la deuda a quien nadie eligió. Quien llama tiene que tratarla
 * como «esta fila no tiene a nadie» y no preguntar (ver `motivoParaNoCargar`).
 */
export function seccionesDelObjetivo(
  objetivo: ObjetivoDeTarifa,
  grados: GradoDeEstructura[],
  secciones: SeccionDeEstructura[],
): number[] {
  if (objetivo.tipo === 'seccion') {
    return secciones.some((s) => s.id === objetivo.id) ? [objetivo.id] : [];
  }
  const gradosDelObjetivo = objetivo.tipo === 'grado'
    ? grados.filter((g) => g.id === objetivo.id)
    : grados.filter((g) => g.servicioId === objetivo.id);
  const ids = new Set(gradosDelObjetivo.map((g) => g.id));
  return secciones.filter((s) => ids.has(s.gradoId)).map((s) => s.id);
}

/**
 * Por qué esta fila no puede cobrar, para decirlo en el botón antes de que
 * nadie lo pulse. `null` = se puede.
 *
 * Solo paran las dos cosas que hacen imposible el cargo: sin precio no hay
 * monto que poner —la ruta de generar lo exige— y sin secciones no hay a
 * quién. El tipo de cobro NO para: la colegiatura también se carga desde
 * aquí, con sus límites (ver `avisoDeLaCarga` y `necesitaMes`).
 */
export function motivoParaNoCargar(d: {
  montoCentavos: number | null;
  cursoIds: number[];
}): string | null {
  if (d.montoCentavos === null || d.montoCentavos <= 0) {
    return 'Ponle precio a esta fila para poder cobrárselo a sus alumnos.';
  }
  if (d.cursoIds.length === 0) {
    return 'Esta fila todavía no tiene secciones con alumnos.';
  }
  return null;
}

/**
 * Una colegiatura se cobra POR MES, y por mes se decide también quién la tiene
 * ya: sin mes, a quien se le cobró septiembre se le daría por cobrado octubre.
 *
 * La inscripción no lo necesita: va una vez por año escolar, que es justo como
 * la ruta de generar cuenta los repetidos cuando no se manda mes.
 */
export function necesitaMes(tipoDeConcepto: string): boolean {
  return tipoDeConcepto === 'mensualidad';
}

/**
 * Lo que hay que decir en ámbar, dentro del diálogo y otra vez al confirmar,
 * cuando el cobro es de los que tienen plan propio.
 *
 * Antes esto era un botón apagado. Lo que lo apagaba sigue siendo verdad —aquí
 * todos pagan la tarifa de la fila, y las becas y las tarifas personales del
 * alumno viven en su matrícula—, pero apagarlo dejaba sin salida al colegio
 * que necesita ponerle la colegiatura a los seis alumnos que entraron tarde.
 * Así que no se prohíbe: se avisa, se enseña uno por uno a quién se le va a
 * poner, y los que ya la tienen salen en gris y no se pueden marcar.
 */
export function avisoDeLaCarga(tipoDeConcepto: string): string | null {
  if (tipoDeConcepto === 'mensualidad') {
    return 'Es una colegiatura: normalmente la pone el plan del año. Desde aquí todos pagan la tarifa de esta fila, sin beca ni tarifa personal del alumno.';
  }
  if (tipoDeConcepto === 'inscripcion') {
    return 'Es la inscripción: va una vez por año escolar. Desde aquí todos pagan la tarifa de esta fila, sin beca ni tarifa personal del alumno.';
  }
  return null;
}

/** Los dos cobros con plan propio, por si hace falta tratarlos juntos. */
export function tienePlanPropio(tipoDeConcepto: string): boolean {
  return esCobroFijo(tipoDeConcepto);
}

/**
 * El aviso de que este cobro ya tiene calendario, y por tanto quien lo pone es
 * el plan del año y no esta pantalla.
 *
 * Es el choque que ninguna de las dos partes ve. Son dos controles de
 * duplicado con llaves distintas: el plan pregunta «¿ya hice la cuota P1 de
 * este alumno?» y mira `cuota_id`; esta pantalla pregunta «¿ya tiene este
 * concepto en este año (y este mes)?» y no mira las cuotas. Un cargo creado
 * aquí nace sin `cuota_id`, así que cuando luego corre el plan no lo encuentra
 * y crea el suyo: dos cargos de lo mismo.
 *
 * Hacia el otro lado sí hay red —a quien ya tenga un cargo de este concepto se
 * le marca «ya lo tiene», lo haya puesto el plan o una persona—, pero eso no
 * alcanza a lo que el plan hará DESPUÉS. Por eso se avisa en vez de prometer
 * que no pasará nada.
 */
export function avisoDeCalendario(cuotas: number): string | null {
  if (cuotas <= 0) return null;
  const cuantas = cuotas === 1 ? 'una cuota' : `${cuotas} cuotas`;
  return `Este cobro tiene calendario (${cuantas}): normalmente lo pone el plan del año, cuota por cuota. Lo que cobres aquí el plan no lo verá, y creará igual el cargo de su cuota.`;
}

/** Nombre de la etiqueta de la acción. Una sola, y se dice igual en todas las filas. */
export const ETIQUETA_CARGAR = 'Cargar a estudiantes';

/**
 * Lo que se enseña encima de la lista: a cuántos les falta el cargo y cuántos
 * ya lo tienen.
 *
 * Se cuentan los dos porque la pregunta de la oficina es «¿ya se lo cobré a
 * todos?», y una lista con ciento cuarenta nombres no la contesta. «Ya lo
 * tiene» es lo que decide el servidor (mismo alumno, mismo concepto, mismo año
 * escolar, sin contar los anulados), más lo que se ve al listar los cargos de
 * ese concepto.
 */
export function conteoDeLaCarga(d: { aCobrar: number; yaLoTienen: number }): string {
  const faltan = d.aCobrar === 1 ? '1 alumno no lo tiene todavía' : `${d.aCobrar} alumnos no lo tienen todavía`;
  if (d.yaLoTienen === 0) return faltan;
  const tienen = d.yaLoTienen === 1 ? '1 ya lo tiene' : `${d.yaLoTienen} ya lo tienen`;
  return `${faltan} · ${tienen}`;
}

/** Cuando ya lo tienen todos no hay nada que cobrar, y hay que decirlo así. */
export function todosLoTienen(d: { aCobrar: number; yaLoTienen: number }): boolean {
  return d.aCobrar === 0 && d.yaLoTienen > 0;
}

/**
 * Por qué no se pudo, dicho para quien está en la oficina y con el nombre del
 * botón que tiene delante («Volver a mirar»), no con el de otra pantalla.
 *
 * `volverAMirar` es lo que decide si se puede pulsar «Cobrar» otra vez. Un
 * 4xx al crear garantiza que no se escribió nada y se puede repetir tal cual;
 * sin respuesta o con un 5xx no se sabe si los cargos se crearon, y entonces
 * lo único que se ofrece es volver a mirar la lista: a quien ya lo tenga le
 * saldrá «ya lo tiene» y no se le cobra dos veces.
 */
export function errorDeLaCarga(
  fase: 'mirar' | 'cobrar', status: number, crudo?: unknown,
): { texto: string; volverAMirar: boolean } {
  const dicho = typeof crudo === 'string' ? crudo.trim() : '';
  if (fase === 'mirar') {
    const texto = status === 0
      ? 'No se pudo buscar a los alumnos. Revisa tu conexión y vuelve a mirar.'
      : status === 401 ? 'Tu sesión se cerró. Entra otra vez.'
      : status === 403 ? 'No tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.'
      : status === 404 ? 'Esto ya no existe en tu colegio. Cierra y recarga la página.'
      : 'No se pudo buscar a los alumnos. Vuelve a mirar.';
    return { texto, volverAMirar: false };
  }
  if (status === 0 || status >= 500) {
    return {
      texto: 'No llegó respuesta y no sabemos si los cargos se crearon. Vuelve a mirar la lista: a quien ya lo tenga le saldrá «ya lo tiene». A nadie se le cobra dos veces.',
      volverAMirar: true,
    };
  }
  const texto = status === 402 ? `No se creó nada. ${dicho || 'Tu colegio no tiene un plan activo.'}`
    : status === 403 ? 'No se creó nada: no tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.'
    : status === 401 ? 'No se creó nada: tu sesión se cerró. Entra otra vez.'
    : status === 404 ? 'No se creó nada: esto ya no existe en tu colegio. Cierra y recarga la página.'
    : 'No se creó nada. Vuelve a mirar la lista e inténtalo otra vez.';
  return { texto, volverAMirar: false };
}

/** No se pudo saber quién tiene ya el cargo: sin eso la lista no se enseña. */
export const ERRORES_AL_COMPROBAR = {
  'sin-respuesta': 'No se pudo comprobar quién tiene ya este cargo. Revisa tu conexión y vuelve a mirar.',
  demasiados: 'Este concepto ya tiene demasiados cargos este año escolar para comprobarlo desde aquí. Cóbralo desde «Cargo a varios alumnos».',
} as const;
