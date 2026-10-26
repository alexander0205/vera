/** Evita que Excel ejecute como fórmula un texto recibido de un usuario. */
export function protegerFormulaCsv(valor: string): string {
  return /^[\s]*[=+\-@]/.test(valor) ? `'${valor}` : valor;
}
