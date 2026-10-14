import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import s from './asistente.module.css';

/**
 * Markdown mínimo para las respuestas del asistente: negritas, cursivas,
 * código, listas, tablas y párrafos. Todo se arma con elementos de React (nada
 * de innerHTML), así que el texto del modelo —que puede traer nombres de
 * clientes— nunca se interpreta como HTML.
 */

function enLinea(texto: string, clave: string): ReactNode[] {
  // «<br>» dentro de una celda: salto de línea (solo ese token; nada de HTML libre).
  if (/<br\s*\/?>/i.test(texto)) {
    return texto.split(/<br\s*\/?>/i).flatMap((trozo, k) => [
      ...(k > 0 ? [<br key={`${clave}-br${k}`} />] : []),
      ...enLinea(trozo.trim(), `${clave}-${k}`),
    ]);
  }
  const partes: ReactNode[] = [];
  const re = /(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\s][^*]*\*(?!\w)|(?<!\w)_[^_\s][^_]*_(?!\w))/g;
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > ultimo) partes.push(texto.slice(ultimo, idx));
    const t = m[0];
    const k = `${clave}-${i++}`;
    if (t.startsWith('[')) {
      // Solo enlaces internos de Zero (/ruta): nada de salir a sitios externos.
      const enlace = t.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
      if (enlace && !enlace[2].startsWith('//')) {
        partes.push(<Link key={k} href={enlace[2]} className={s.enlace}>{enlace[1]}</Link>);
      } else {
        partes.push(t);
      }
    } else if (t.startsWith('**')) partes.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) partes.push(<code key={k}>{t.slice(1, -1)}</code>);
    else partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = idx + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

const celdas = (linea: string) =>
  linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const esSeparador = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const esFilaTabla = (l: string) => l.includes('|') && l.trim().length > 1;
const esNumero = (t: string) => /^(RD\$\s?)?-?[\d,]+(\.\d+)?%?$/.test(t.trim());
const RE_VINETA = /^\s*([-*•])\s+/;
const RE_NUMERADA = /^\s*\d+[.)]\s+/;

export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const bloques: ReactNode[] = [];
  let i = 0;
  let n = 0;

  const empiezaTabla = (j: number) =>
    esFilaTabla(lineas[j]) && j + 1 < lineas.length && esSeparador(lineas[j + 1]);

  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }

    // Tabla: encabezado + separador + filas.
    if (empiezaTabla(i)) {
      const cab = celdas(l);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim() && esFilaTabla(lineas[i])) { filas.push(celdas(lineas[i])); i++; }
      bloques.push(
        <div className={s.tablaCaja} key={`b${n++}`}>
          <table className={s.tabla}>
            <thead><tr>{cab.map((c, j) => <th key={j}>{enLinea(c, `h${j}`)}</th>)}</tr></thead>
            <tbody>
              {filas.map((f, r) => (
                <tr key={r}>{f.map((c, j) => (
                  <td key={j} className={esNumero(c.replace(/\*/g, '')) ? s.num : undefined}>{enLinea(c, `c${r}-${j}`)}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Listas.
    if (RE_VINETA.test(l) || RE_NUMERADA.test(l)) {
      const ordenada = RE_NUMERADA.test(l);
      const re = ordenada ? RE_NUMERADA : RE_VINETA;
      const items: string[] = [];
      while (i < lineas.length && re.test(lineas[i])) { items.push(lineas[i].replace(re, '')); i++; }
      const Tag = ordenada ? 'ol' : 'ul';
      bloques.push(
        <Tag className={s.lista} key={`b${n++}`}>
          {items.map((it, j) => <li key={j}>{enLinea(it, `l${j}`)}</li>)}
        </Tag>,
      );
      continue;
    }

    // Encabezados: un párrafo en negrita (el chat es angosto).
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) { bloques.push(<p className={s.parrafoTitulo} key={`b${n++}`}>{enLinea(h[1], 'h')}</p>); i++; continue; }

    // Párrafo: junta las líneas seguidas.
    const buf: string[] = [];
    while (
      i < lineas.length && lineas[i].trim() && !RE_VINETA.test(lineas[i]) && !RE_NUMERADA.test(lineas[i])
      && !empiezaTabla(i) && !/^#{1,4}\s+/.test(lineas[i])
    ) { buf.push(lineas[i]); i++; }
    if (buf.length === 0) { i++; continue; }
    bloques.push(
      <p className={s.parrafo} key={`b${n++}`}>
        {buf.map((b, j) => <Fragment key={j}>{j > 0 && <br />}{enLinea(b, `p${j}`)}</Fragment>)}
      </p>,
    );
  }
  return <>{bloques}</>;
}
