import { timingSafeEqual } from 'node:crypto';

/**
 * ¿La llamada trae el secreto de las tareas programadas?
 *
 * Antes cada ruta comparaba `authorization !== \`Bearer ${process.env.CRON_SECRET}\``.
 * Si el secreto NO estaba definido en un entorno (producción mal configurada,
 * una vista previa, local), la cadena esperada era «Bearer undefined» y bastaba
 * escribir ese encabezado para ejecutar las tareas (cobros de suscripción,
 * migraciones…). Ahora, sin un secreto configurado y razonable, ninguna llamada
 * es válida; y la comparación es de tiempo constante.
 */
export function llamadaDeCronValida(authorization: string | null | undefined): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || secreto.length < 16) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(authorization ?? '');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
