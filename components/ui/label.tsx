'use client';

import * as React from 'react';

function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={[
        'block text-sm font-medium text-gray-700 leading-none select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export { Label };
