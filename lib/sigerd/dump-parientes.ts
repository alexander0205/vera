/**
 * ¿Trae la descarga de SIGERD los responsables (padre, madre, tutor)?
 *
 * La clave del volcado es `estudianteParientes` —una lista de
 * `{ idEstudiante, parientes[] }` donde solo salen los alumnos que tienen al
 * menos uno—. El asistente miraba `dump.parientes`, que NO existe, así que
 * decía «no hay padres» aunque la descarga los trajera.
 *
 * Sin `server-only`: lo usan el plan (servidor) y las pruebas.
 */
export function hayParientesEnDump(dump: Record<string, unknown> | null | undefined): boolean {
  const lista = dump?.estudianteParientes;
  if (!Array.isArray(lista)) return false;
  return lista.some((e) => {
    const parientes = (e as { parientes?: unknown } | null)?.parientes;
    return Array.isArray(parientes) && parientes.length > 0;
  });
}
