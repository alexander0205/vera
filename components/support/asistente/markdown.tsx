import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { anchoBarra, parsearGrafico, valorGrafico, type Grafico } from '@/lib/asistente/grafico';
import { parsearTarjeta, type Tarjeta } from '@/lib/asistente/tarjeta';
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
    } else if (t.startsWith('**')) partes.push(<strong key={k}>{enLinea(t.slice(2, -2), `${k}s`)}</strong>);
    else if (t.startsWith('`')) partes.push(<code key={k}>{t.slice(1, -1)}</code>);
    else partes.push(<em key={k}>{enLinea(t.slice(1, -1), `${k}e`)}</em>);
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

const PALETA = ['#3658e1', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2', '#db2777', '#64748b'];

function GraficoVista({ g }: { g: Grafico }) {
  const titulo = g.titulo ?? 'Gráfico';

  if (g.tipo === 'linea') {
    const W = 300; const H = 112; const PX = 10; const PT = 12; const PB = 22;
    const max = Math.max(...g.datos.map((d) => d.valor), 1);
    const paso = (W - PX * 2) / (g.datos.length - 1);
    const pts = g.datos.map((d, i) => [PX + i * paso, PT + (H - PT - PB) * (1 - d.valor / max)] as const);
    const alto = g.datos.reduce((a, d) => (d.valor > a.valor ? d : a), g.datos[0]);
    return (
      <figure className={s.grafico} aria-label={titulo}>
        <figcaption className={s.graficoTitulo}>{titulo}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.lineaSvg} role="img" aria-label={`${titulo}: de ${g.datos[0].etiqueta} a ${g.datos[g.datos.length - 1].etiqueta}`}>
          <line x1={PX} y1={H - PB} x2={W - PX} y2={H - PB} className={s.lineaEje} />
          <polyline points={pts.map((p) => p.join(',')).join(' ')} className={s.lineaTrazo} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} className={s.lineaPunto}><title>{`${g.datos[i].etiqueta}: ${valorGrafico(g, g.datos[i].valor)}`}</title></circle>)}
          <text x={PX} y={H - 6} className={s.lineaTexto}>{g.datos[0].etiqueta}</text>
          <text x={W - PX} y={H - 6} textAnchor="end" className={s.lineaTexto}>{g.datos[g.datos.length - 1].etiqueta}</text>
        </svg>
        <p className={s.graficoNota}>Más alto: <strong>{alto.etiqueta}</strong> · {valorGrafico(g, alto.valor)}</p>
      </figure>
    );
  }

  if (g.tipo === 'torta') {
    const total = g.datos.reduce((a, d) => a + d.valor, 0) || 1;
    let acc = 0;
    const tramos = g.datos.map((d, i) => {
      const ini = (acc / total) * 100;
      acc += d.valor;
      return `${PALETA[i % PALETA.length]} ${ini.toFixed(2)}% ${((acc / total) * 100).toFixed(2)}%`;
    });
    return (
      <figure className={s.grafico} aria-label={titulo}>
        <figcaption className={s.graficoTitulo}>{titulo}</figcaption>
        <div className={s.tortaCaja}>
          <span className={s.torta} style={{ background: `conic-gradient(${tramos.join(', ')})` }} role="img" aria-label={titulo} />
          <ul className={s.tortaLeyenda}>
            {g.datos.map((d, i) => (
              <li key={i}>
                <span className={s.tortaMuestra} style={{ background: PALETA[i % PALETA.length] }} aria-hidden />
                <span className={s.tortaEtiqueta} title={d.etiqueta}>{d.etiqueta}</span>
                <span className={s.barraValor}>{Math.round((d.valor / total) * 100)}% · {valorGrafico(g, d.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      </figure>
    );
  }

  return (
    <figure className={s.grafico} aria-label={titulo}>
      {g.titulo && <figcaption className={s.graficoTitulo}>{g.titulo}</figcaption>}
      {g.datos.map((d, j) => (
        <div className={s.barraFila} key={j}>
          <span className={s.barraEtiqueta} title={d.etiqueta}>{d.etiqueta}</span>
          <span className={s.barraRiel}><span className={s.barra} style={{ width: `${anchoBarra(g, d.valor)}%` }} /></span>
          <span className={s.barraValor}>{valorGrafico(g, d.valor)}</span>
        </div>
      ))}
    </figure>
  );
}

function TarjetaVista({ t }: { t: Tarjeta }) {
  return (
    <section className={s.tarjeta} aria-label={t.titulo}>
      <header className={s.tarjetaCabecera}>
        <div>
          <p className={s.tarjetaTitulo}>{t.titulo}</p>
          {t.subtitulo && <p className={s.tarjetaSub}>{t.subtitulo}</p>}
        </div>
        {t.estado && <span className={`${s.tarjetaEstado} ${s[`tono_${t.estado.tono}`] ?? ''}`}>{t.estado.texto}</span>}
      </header>
      {t.valor && <p className={s.tarjetaValor}>{t.valor}</p>}
      {t.filas.length > 0 && (
        <dl className={s.tarjetaFilas}>
          {t.filas.map((f, i) => (
            <div key={i}><dt>{f.etiqueta}</dt><dd>{f.valor}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}

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

    // Bloque con vallas: «grafico» se dibuja; cualquier otro se muestra como texto.
    if (/^\s*```/.test(l)) {
      const lenguaje = l.trim().slice(3).trim().toLowerCase();
      const cuerpo: string[] = [];
      i++;
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) { cuerpo.push(lineas[i]); i++; }
      i++;
      const g = lenguaje === 'grafico' ? parsearGrafico(cuerpo.join('\n')) : null;
      const tj = lenguaje === 'tarjeta' ? parsearTarjeta(cuerpo.join('\n')) : null;
      if (g) {
        bloques.push(<GraficoVista key={`b${n++}`} g={g} />);
      } else if (tj) {
        bloques.push(<TarjetaVista key={`b${n++}`} t={tj} />);
      } else if (cuerpo.some((x) => x.trim())) {
        bloques.push(<pre className={s.codigo} key={`b${n++}`}>{cuerpo.join('\n')}</pre>);
      }
      continue;
    }

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
