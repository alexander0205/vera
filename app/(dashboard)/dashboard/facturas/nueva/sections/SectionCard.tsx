'use client';

import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';

interface Props {
  number: number;
  title: string;
  icon?: ComponentType<LucideProps>;
  children: ReactNode;
  /** Optional right-aligned actions in the header. */
  actions?: ReactNode;
}

/**
 * Numbered card with teal badge + title. Used for the main form sections
 * (cliente, detalles, productos…). Matches the mockup's split-layout cards.
 */
export function SectionCard({ number, title, icon: Icon, children, actions }: Props) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 md:px-5 md:pt-5">
        <div className="h-6 w-6 rounded-md bg-teal-600 text-white flex items-center justify-center font-semibold text-[11px] shrink-0">
          {number}
        </div>
        {Icon && <Icon className="h-4 w-4 text-gray-500 shrink-0" aria-hidden="true" />}
        <h2 className="text-sm font-semibold text-gray-900 flex-1 truncate">{title}</h2>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="px-4 pb-4 md:px-5 md:pb-5">{children}</div>
    </section>
  );
}
