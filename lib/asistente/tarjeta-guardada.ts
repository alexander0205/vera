/**
 * Las tarjetas «Confirmar» de una respuesta se guardan junto a sus consultas
 * (`asistente_mensajes.herramientas`) con este nombre: el panel no las enseña
 * como «consulté», y al modelo le vuelven en el historial para que sepa que
 * esos montos los calculó Zero. Sin dependencias: lo importa también el panel.
 */
export const TARJETA_GUARDADA = 'Tarjeta para confirmar';

/**
 * El texto de una respuesta anterior como lo ve el modelo: con las tarjetas que
 * dejó. Sin ellas dudaba de sus propios montos («no salieron de ninguna
 * herramienta») y se disculpaba por cifras que sí calculó Zero.
 */
export function conTarjetas(texto: string, herramientas: unknown): string {
  const tarjetas = Array.isArray(herramientas)
    ? herramientas.filter((h): h is { nombre: string; resumen: string } => h?.nombre === TARJETA_GUARDADA && typeof h.resumen === 'string')
    : [];
  if (tarjetas.length === 0) return texto;
  return `${texto}\n\n[Tarjetas para confirmar que dejé en esta respuesta, con lo que calculó Zero:\n${tarjetas.map((t) => `- ${t.resumen}`).join('\n')}]`;
}
