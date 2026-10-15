/**
 * Tarjeta de un solo registro (una factura, un cliente, una cotización):
 * cifra grande, estado con color y filas de datos. Como el gráfico, viaja como
 * un bloque de texto, así sobrevive al historial y al PDF.
 *
 *   ```tarjeta
 *   titulo: E320000000304
 *   subtitulo: Johan Antonio Mendez Polanco
 *   valor: RD$ 3,300.00
 *   estado: Aceptada por la DGII | ok
 *   fila: Estudiante | Jelani Maria Mendez Dominguez
 *   fila: Pagado | RD$ 3,300.00
 *   ```
 *
 * Sin imports de servidor.
 */

export type TonoTarjeta = 'ok' | 'aviso' | 'malo' | 'neutro';

export interface Tarjeta {
  titulo: string;
  subtitulo: string | null;
  valor: string | null;
  estado: { texto: string; tono: TonoTarjeta } | null;
  filas: { etiqueta: string; valor: string }[];
}

const limpia = (t: string, max: number) => t.replace(/[\r\n`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const MAX_FILAS = 12;

export function textoTarjeta(t: {
  titulo: string; subtitulo?: string | null; valor?: string | null;
  estado?: { texto: string; tono: TonoTarjeta } | null;
  filas: [string, string | number | null | undefined][];
}): string {
  const filas = t.filas
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .slice(0, MAX_FILAS)
    .map(([k, v]) => `fila: ${limpia(k, 40).replace(/\|/g, '/')} | ${limpia(String(v), 120)}`);
  return [
    '```tarjeta',
    `titulo: ${limpia(t.titulo, 80)}`,
    ...(t.subtitulo ? [`subtitulo: ${limpia(t.subtitulo, 120)}`] : []),
    ...(t.valor ? [`valor: ${limpia(t.valor, 40)}`] : []),
    ...(t.estado ? [`estado: ${limpia(t.estado.texto, 60).replace(/\|/g, '/')} | ${t.estado.tono}`] : []),
    ...filas,
    '```',
  ].join('\n');
}

export function parsearTarjeta(cuerpo: string): Tarjeta | null {
  const t: Tarjeta = { titulo: '', subtitulo: null, valor: null, estado: null, filas: [] };
  for (const crudo of cuerpo.replace(/\r/g, '').split('\n')) {
    const linea = crudo.trim();
    if (!linea) continue;
    const m = linea.match(/^(titulo|subtitulo|valor|estado|fila)\s*:\s*(.*)$/i);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'titulo') t.titulo = limpia(v, 80);
    else if (k === 'subtitulo') t.subtitulo = limpia(v, 120) || null;
    else if (k === 'valor') t.valor = limpia(v, 40) || null;
    else if (k === 'estado') {
      const i = v.lastIndexOf('|');
      const texto = limpia(i < 0 ? v : v.slice(0, i), 60);
      const tono = i < 0 ? 'neutro' : v.slice(i + 1).trim();
      if (texto) t.estado = { texto, tono: (['ok', 'aviso', 'malo'] as const).includes(tono as 'ok') ? (tono as TonoTarjeta) : 'neutro' };
    } else {
      const i = v.indexOf('|');
      if (i < 0) return null;
      if (t.filas.length < MAX_FILAS) t.filas.push({ etiqueta: limpia(v.slice(0, i), 40), valor: limpia(v.slice(i + 1), 120) });
    }
  }
  return t.titulo ? t : null;
}
