'use client';

/**
 * La barra de prueba fija abajo, solo en el teléfono.
 *
 * En el teléfono la portada mide unas once pantallas, la cabecera no tiene
 * botón (solo el menú) y el llamado del hero se va en el primer deslizamiento:
 * el que ya se convenció en la sección de precios tenía que volver arriba para
 * encontrar dónde empezar. La barra está siempre a un dedo.
 *
 * No estorba: aparece cuando el llamado del hero ya salió de la pantalla y se
 * esconde mientras haya otro llamado grande a la vista (los marcados con
 * `data-llamado`) o el pie de página. Sin JavaScript no existe, y tampoco hace
 * falta: los llamados de cada sección siguen ahí.
 */

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { textoPrueba } from './_llamados';
import { CONTACTO, IconoWhatsApp } from './_piezas';

export function BarraPrueba() {
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const vistos = new Set<Element>();
    const decidir = () => setVisible(window.scrollY > 480 && vistos.size === 0);
    const observador = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (e.isIntersecting) vistos.add(e.target); else vistos.delete(e.target);
      }
      decidir();
    });
    document.querySelectorAll('[data-llamado], footer').forEach(el => observador.observe(el));
    window.addEventListener('scroll', decidir, { passive: true });
    decidir();
    return () => { observador.disconnect(); window.removeEventListener('scroll', decidir); };
  }, [ruta]);

  // Los colegios prueban 30 días; todo lo demás, los de facturación.
  const familia = ruta?.startsWith('/colegios') ? 'colegio' : 'ecf';

  return (
    <div
      inert={!visible}
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#e3e8f5] bg-white/95 px-4 pt-3 backdrop-blur-md transition-transform duration-300 motion-reduce:transition-none md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2.5">
        <a
          href="/sign-up"
          className="flex h-11 flex-1 items-center justify-center rounded-xl bg-zero-600 px-4 font-[family-name:var(--font-display)] text-[14.5px] font-semibold text-white shadow-[0_14px_28px_-16px_rgba(54,88,225,.8)] active:translate-y-px"
        >
          {textoPrueba(familia)}
        </a>
        <a
          href={CONTACTO.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escríbenos por WhatsApp"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#dce3f2] bg-white text-[#1faa59]"
        >
          <IconoWhatsApp tamano={20} />
        </a>
      </div>
    </div>
  );
}
