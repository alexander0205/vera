'use client';

import * as React from 'react';
import MuiAvatar from '@mui/material/Avatar';

interface AvatarProps {
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

interface AvatarImageProps {
  src?: string;
  alt?: string;
  className?: string;
}

interface AvatarFallbackProps {
  className?: string;
  children?: React.ReactNode;
}

function Avatar({ className, children, style }: AvatarProps) {
  return (
    <div
      className={['relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

function AvatarImage({ src, alt = '', className }: AvatarImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={['aspect-square h-full w-full object-cover', className].filter(Boolean).join(' ')}
    />
  );
}

function AvatarFallback({ className, children }: AvatarFallbackProps) {
  return (
    <div
      className={[
        'flex h-full w-full items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xs font-semibold',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
