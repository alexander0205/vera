/**
 * Reglas de Meta para una plantilla, SIN base de datos: las usan el servidor al
 * publicar y la pantalla mientras se escribe, para que ambos digan lo mismo.
 */

export interface VariableRegla { pos: number; nombre: string; tipo: string; ejemplo: string }

/** Cuenta cuántas variables `{{n}}` distintas tiene un texto. */
export function contarVariables(texto: string): number {
  return new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
}

export const MAX_CUERPO = 1024;
export const MAX_PIE = 60;
export const MAX_ENCABEZADO = 60;
export const MAX_BOTON = 25;

/** Lo que Meta rechaza y se ve sin preguntarle. Devuelve la lista de pegas. */
export function pegasDeMeta(p: {
  cuerpo: string;
  encabezado?: string | null;
  pie?: string | null;
  variables: VariableRegla[];
  boton?: { texto: string; url: string; ejemplo: string } | null;
}): string[] {
  const pegas: string[] = [];
  const cuerpo = p.cuerpo.trim();
  const usadas = [...new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

  if (!cuerpo) pegas.push('El mensaje no puede ir vacío.');
  if (cuerpo.length > MAX_CUERPO) pegas.push(`El mensaje pasa de ${MAX_CUERPO} caracteres.`);
  if (usadas.some((n, i) => n !== i + 1)) {
    pegas.push('Las variables deben ser {{1}}, {{2}}, {{3}}… seguidas y sin saltos.');
  }
  const sinEjemplo = usadas.filter((n) => !p.variables.find((v) => v.pos === n)?.ejemplo?.trim());
  if (sinEjemplo.length > 0) {
    pegas.push(`Falta el valor de ejemplo de ${sinEjemplo.map((n) => `{{${n}}}`).join(', ')}. Meta lo exige.`);
  }
  if (/^\{\{\d+\}\}/.test(cuerpo)) pegas.push('El mensaje no puede empezar con una variable.');
  if (/\{\{\d+\}\}$/.test(cuerpo)) pegas.push('El mensaje no puede terminar con una variable.');
  if (/\}\}\s*\{\{/.test(cuerpo))  pegas.push('Dos variables no pueden ir pegadas: pon texto entre ellas.');
  if (usadas.length > 0 && cuerpo.replace(/\{\{\d+\}\}/g, '').trim().length < usadas.length * 8) {
    pegas.push('Hay demasiadas variables para tan poco texto. Meta rechaza esas plantillas.');
  }
  if ((p.encabezado ?? '').length > MAX_ENCABEZADO) pegas.push(`El encabezado pasa de ${MAX_ENCABEZADO} caracteres.`);
  if ((p.pie ?? '').length > MAX_PIE) pegas.push(`El pie pasa de ${MAX_PIE} caracteres.`);
  if (/\{\{\d+\}\}/.test(p.pie ?? '')) pegas.push('El pie no admite variables.');
  if (p.boton?.texto && p.boton.texto.length > MAX_BOTON) pegas.push(`El texto del botón pasa de ${MAX_BOTON} caracteres.`);
  return pegas;
}

