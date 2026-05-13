'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight tooltip implementation — no external deps.
 *
 * Usage:
 *   <Tooltip text="DGII #38 · NUM · max 11">
 *     <InfoIcon className="h-3 w-3" />
 *   </Tooltip>
 *
 * Accessibility:
 *  - The trigger gets `aria-describedby` pointing to the tooltip content
 *  - Tooltip is shown on hover AND on focus (keyboard accessible)
 *  - The tooltip itself has role="tooltip"
 */
export function Tooltip({
  text,
  children,
  side = 'top',
  className,
}: {
  text: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);

  if (!text) return <>{children}</>;

  return (
    <span className="relative inline-flex items-center">
      <span
        aria-describedby={open ? id : undefined}
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className="inline-flex cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-sm"
      >
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-md pointer-events-none',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            className,
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
