'use client';

import * as React from 'react';
import Chip from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

interface BadgeProps extends React.ComponentProps<'span'> {
  variant?: BadgeVariant;
  asChild?: boolean;
}

function getChipSx(variant: BadgeVariant): SxProps<Theme> {
  switch (variant) {
    case 'default':
      return { bgcolor: 'primary.main', color: 'primary.contrastText' };
    case 'secondary':
      return { bgcolor: 'grey.100', color: 'text.secondary', border: '1px solid', borderColor: 'grey.200' };
    case 'destructive':
      return { bgcolor: 'error.main', color: '#fff' };
    case 'outline':
      return { bgcolor: 'transparent', color: 'text.primary', border: '1px solid', borderColor: 'divider' };
    default:
      return { bgcolor: 'grey.100', color: 'text.secondary' };
  }
}

function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <Chip
      label={children}
      size="small"
      className={className}
      sx={{
        height:       'auto',
        borderRadius: '6px',
        fontSize:     '0.6875rem',
        fontWeight:   600,
        '& .MuiChip-label': { px: 1, py: '2px' },
        ...getChipSx(variant),
      }}
    />
  );
}

export { Badge };
export type { BadgeProps };
