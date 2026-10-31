/**
 * ¿Una descarga de SIGERD puede reemplazar a la que ya está guardada?
 *
 * SIGERD a veces contesta la estructura del centro y falla el reporte de
 * estudiantes de cada sección (HTTP 500), o el personal. La descarga «termina»
 * igual: secciones sin alumnos y cero empleados. Guardarla encima de una buena
 * dejaba al colegio sin nadie que matricular y sin su personal (CEMM, 26-10:
 * 12 de 12 secciones con error, 0 estudiantes y 0 empleados donde había 79 y
 * 19).
 *
 * Aquí solo se decide; quien guarda conserva la anterior cuando esto dice que
 * no. Sin descarga anterior no hay nada que proteger: se guarda lo que llegó.
 */

export interface TotalesDescarga {
  secciones: number;
  estudiantes: number;
  empleados: number;
  seccionesConError: number;
}

/**
 * El motivo por el que `nueva` no debe reemplazar a `anterior`, o `null` si
 * puede. Un descenso normal (alumnos que se fueron) pasa; lo que no pasa es
 * una sección que no se pudo leer, o quedarse en cero donde había gente.
 */
export function motivoDescargaIncompleta(
  nueva: TotalesDescarga,
  anterior: Partial<TotalesDescarga> | null,
): string | null {
  if (nueva.seccionesConError > 0) {
    return nueva.seccionesConError >= nueva.secciones
      ? `SIGERD no devolvió los estudiantes de ninguna de las ${nueva.secciones} secciones.`
      : `SIGERD no devolvió los estudiantes de ${nueva.seccionesConError} de ${nueva.secciones} secciones.`;
  }
  if (!anterior) return null;
  if ((anterior.estudiantes ?? 0) > 0 && nueva.estudiantes === 0) {
    return 'SIGERD devolvió 0 estudiantes.';
  }
  if ((anterior.empleados ?? 0) > 0 && nueva.empleados === 0) {
    return 'SIGERD no devolvió el personal del centro.';
  }
  return null;
}
