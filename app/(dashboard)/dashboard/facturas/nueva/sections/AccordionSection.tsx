'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface Props {
  number: number;
  title: string;
  icon?: ComponentType<LucideProps>;
  /** Optional badge/text shown next to the title (e.g. count, "Configurado"). */
  hint?: ReactNode;
  /** Initial open state. Forced open if content is present (caller decides). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible numbered section. Used for less-frequently-edited form blocks
 * (términos, notas, pie, comentario, pago recibido) per the mockup spec.
 *
 * Light-weight, no Radix dep — just a button + conditional render with a
 * subtle chevron-rotate animation. State is local; for "auto-open when
 * content exists" callers should pass `defaultOpen={Boolean(value)}`.
 */
export function AccordionSection({
  number, title, icon: Icon, hint, defaultOpen = false, children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="h-6 w-6 rounded-md bg-teal-600 text-white flex items-center justify-center font-semibold text-[11px] shrink-0">
          {number}
        </div>
        {Icon && <Icon className="h-4 w-4 text-gray-500 shrink-0" aria-hidden="true" />}
        <h2 className="text-sm font-semibold text-gray-900 flex-1 truncate">{title}</h2>
        {hint && <span className="text-xs text-gray-500 shrink-0">{hint}</span>}
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-4 pb-4 md:px-5 md:pb-5 border-t border-gray-100 pt-4">{children}</div>
      )}
    </section>
  );
}
