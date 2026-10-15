'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { pasoTour, posicionTour, siguientePasoTour, urlDeTour } from '@/lib/asistente/tour';
import s from './tour-guiado.module.css';

/**
 * Tour guiado: con `?tour=<paso>` en la URL oscurece la pantalla y resalta el
 * elemento marcado con `data-tour`. El elemento resaltado sigue siendo
 * clicable (el foco no lo tapa). Si el elemento no existe, el paso se explica
 * igual en el centro: el tour nunca bloquea la pantalla.
 */

const ESPERA_MS = 10_000;
const MARGEN = 8;

function buscar(destino: string): HTMLElement | null {
  const todos = document.querySelectorAll<HTMLElement>(`[data-tour="${destino}"]`);
  for (const el of todos) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function Tour() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.get('tour');
  const paso = pasoTour(id);
  // Si la URL dice un paso de otra pantalla, no se dibuja nada.
  const activo = paso && pathname === paso.ruta ? paso : null;

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [sinElemento, setSinElemento] = useState(false);
  const objetivo = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Cuántas veces se trajo el elemento a la vista (la pantalla puede restaurar su scroll al cargar).
  const correcciones = useRef(0);

  const cerrar = useCallback(() => {
    const q = new URLSearchParams(Array.from(params.entries()));
    q.delete('tour');
    const resto = q.toString();
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // Encuentra el elemento (las pantallas cargan datos antes de pintarlo).
  useEffect(() => {
    if (!activo) return;
    setRect(null);
    setSinElemento(false);
    objetivo.current = null;
    correcciones.current = 0;
    const inicio = Date.now();
    let parado = false;
    const intento = () => {
      if (parado) return;
      const el = buscar(activo.destino);
      if (el) {
        objetivo.current = el;
        // Solo se desplaza si el elemento no está a la vista; si ya se ve, la pantalla no se mueve.
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center' });
        setRect(el.getBoundingClientRect());
        return;
      }
      if (Date.now() - inicio > ESPERA_MS) { setSinElemento(true); return; }
      setTimeout(intento, 250);
    };
    intento();
    return () => { parado = true; };
  }, [activo]);

  // Sigue al elemento si la pantalla se mueve o cambia de tamaño.
  useEffect(() => {
    if (!activo) return;
    let raf = 0;
    const medir = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let el = objetivo.current;
        // La pantalla pudo repintarse (datos que llegan después): se vuelve a buscar.
        if (!el || !el.isConnected || el.getBoundingClientRect().width === 0) {
          el = buscar(activo.destino);
          objetivo.current = el;
        }
        if (el) {
          const r = el.getBoundingClientRect();
          if ((r.bottom < 0 || r.top > window.innerHeight) && correcciones.current < 3) {
            correcciones.current += 1;
            el.scrollIntoView({ block: 'center' });
          }
          setRect(el.getBoundingClientRect());
        }
      });
    };
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
      ro?.disconnect();
    };
  }, [activo]);

  // Escape cierra; el foco pasa al cuadro para que lo lea el lector de pantalla.
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [activo, cerrar]);

  useEffect(() => {
    if (activo && (rect || sinElemento)) popRef.current?.focus({ preventScroll: true });
  }, [activo, rect, sinElemento]);

  if (!activo || (!rect && !sinElemento)) return null;

  const sig = siguientePasoTour(activo.id);
  const { actual, total } = posicionTour(activo.id);

  function siguiente() {
    if (!sig) { cerrar(); return; }
    const url = urlDeTour(sig.id);
    if (url) router.push(url);
  }

  // El cuadro va debajo del elemento; si no cabe, encima; sin elemento, al centro.
  const ancho = Math.min(340, (typeof window !== 'undefined' ? window.innerWidth : 360) - 24);
  let estiloCuadro: React.CSSProperties = { width: ancho, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const aLaVista = !!rect && typeof window !== 'undefined' && rect.bottom > 0 && rect.top < window.innerHeight;
  if (rect && aLaVista) {
    const alto = 200;
    const debajo = rect.bottom + MARGEN + 12 + alto < window.innerHeight;
    const crudo = debajo ? rect.bottom + MARGEN + 12 : rect.top - MARGEN - 12 - alto;
    const top = Math.min(Math.max(12, crudo), Math.max(12, window.innerHeight - alto - 12));
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - ancho - 12));
    estiloCuadro = { width: ancho, left, top };
  }

  return (
    <div className={s.capa} data-testid="tour-guiado">
      {rect && aLaVista ? (
        <div
          className={s.foco}
          style={{ top: rect.top - MARGEN, left: rect.left - MARGEN, width: rect.width + MARGEN * 2, height: rect.height + MARGEN * 2 }}
          aria-hidden
        />
      ) : (
        <div className={s.fondo} aria-hidden />
      )}
      <div
        ref={popRef}
        className={s.cuadro}
        style={estiloCuadro}
        role="dialog"
        aria-modal="false"
        aria-label={activo.titulo}
        tabIndex={-1}
      >
        <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Salir de la guía">
          <X size={16} aria-hidden />
        </button>
        <span className={s.paso}>Paso {actual} de {total}</span>
        <h2>{activo.titulo}</h2>
        <p>{activo.texto}</p>
        {sinElemento && <p className={s.aviso}>No veo ese botón en esta pantalla ahora mismo, pero aquí es donde se hace.</p>}
        <div className={s.acciones}>
          <button type="button" className={s.secundario} onClick={cerrar}>Salir</button>
          <button type="button" className={s.primario} onClick={siguiente}>
            {sig ? (activo.siguiente ?? 'Siguiente') : 'Terminar'}
            {sig && <ArrowRight size={15} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TourGuiado() {
  // useSearchParams pide Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <Tour />
    </Suspense>
  );
}
