'use client';

/**
 * Las cuatro cifras del agente, contando hacia arriba al entrar en pantalla.
 *
 * No son resultados de un cliente —eso sería inventar un caso de éxito—: son
 * las medidas del servicio, las mismas que están escritas más abajo en «lo que
 * preguntan los que compran en serio». La animación es para que se lean; el
 * dato es el mismo con o sin ella.
 *
 * Arranca cuando el bloque se ve, no al cargar la página: un contador que ya
 * terminó antes de que bajes no lo ve nadie.
 */

import { useEffect, useRef, useState } from 'react';

type Cifra = { valor: number; antes?: string; despues?: string; decimales?: number; etiqueta: string };

const CIFRAS: Cifra[] = [
  { valor: 5, antes: 'menos de', despues: ' s', etiqueta: 'en contestar' },
  { valor: 6, etiqueta: 'canales, una bandeja' },
  { valor: 24, despues: '/7', etiqueta: 'sin turnos ni horarios' },
  { valor: 0, etiqueta: 'personas para el primer contacto' },
];

function Contador({ cifra, corriendo }: { cifra: Cifra; corriendo: boolean }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!corriendo) return;
    if (cifra.valor === 0) { setN(0); return; }
    const inicio = performance.now();
    const duracion = 900;
    let marco = 0;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // Desacelera al final: un contador lineal parece un reloj, y uno que
      // frena parece que llegó a un número.
      setN(cifra.valor * (1 - Math.pow(1 - t, 3)));
      if (t < 1) marco = requestAnimationFrame(paso);
    };
    marco = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(marco);
  }, [corriendo, cifra.valor]);

  // El prefijo va en pequeño y en su propia línea: metido dentro del número
  // grande, «menos de 5 s» partía el 5 y la unidad en dos renglones.
  return (
    <span className="block">
      {cifra.antes && (
        <span className="block text-[12px] font-medium text-white/55">{cifra.antes}</span>
      )}
      <span className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.75rem)] font-semibold tabular-nums tracking-[-.05em] text-white">
        {Math.round(n)}
        {cifra.despues}
      </span>
    </span>
  );
}

export function CifrasIA() {
  const caja = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = caja.current;
    if (!nodo) return;
    // Sin IntersectionObserver (o con «menos movimiento»), sale el número
    // final y ya: el dato no depende de la animación.
    if (typeof IntersectionObserver === 'undefined'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observador = new IntersectionObserver(
      entradas => { if (entradas[0].isIntersecting) { setVisible(true); observador.disconnect(); } },
      { threshold: 0.35 },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={caja} className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      {CIFRAS.map(c => (
        <div key={c.etiqueta} className="min-w-0">
          <Contador cifra={c} corriendo={visible} />
          <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.45] text-white/60">{c.etiqueta}</p>
        </div>
      ))}
    </div>
  );
}
