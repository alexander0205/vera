'use client';

import * as React from 'react';
import MuiTooltip from '@mui/material/Tooltip';

export function Tooltip({
  text,
  children,
  side = 'top',
  className,
}: {
  text: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  if (!text) return <>{children}</>;
  return (
    <MuiTooltip
      title={text}
      placement={side}
      arrow
      classes={{ tooltip: className }}
    >
      <span className="inline-flex items-center">{children}</span>
    </MuiTooltip>
  );
}

// Radix-compatible exports for pages that import these names
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export function TooltipRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export const TooltipTrigger = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(
  ({ children, ...props }, ref) => <span ref={ref} {...props}>{children}</span>
);
TooltipTrigger.displayName = 'TooltipTrigger';

export const TooltipContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ children, ...props }, ref) => (
    <div
      ref={ref}
      className="z-50 overflow-hidden rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-md"
      {...props}
    >
      {children}
    </div>
  )
);
TooltipContent.displayName = 'TooltipContent';
