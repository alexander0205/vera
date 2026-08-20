'use client';

import * as React from 'react';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={['w-full text-sm border-collapse', className].filter(Boolean).join(' ')}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      className={['bg-gray-50', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={['divide-y divide-gray-50', className].filter(Boolean).join(' ')} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={['border-t border-gray-100 bg-gray-50/50 font-medium', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={['border-b border-gray-50 transition-colors hover:bg-gray-50/60', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={[
        'px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      className={['px-3 py-3 text-sm text-gray-700 align-middle', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      className={['mt-4 text-sm text-gray-500', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
