'use client';

import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  number: number;
  title: string;
  icon?: ComponentType<LucideProps>;
  children: ReactNode;
  actions?: ReactNode;
}

export function SectionCard({ number, title, icon: Icon, children, actions }: Props) {
  return (
    <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 }, pb: 1.5 }}>
        <Box sx={{ height: 24, width: 24, borderRadius: '6px', bgcolor: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.6875rem', flexShrink: 0 }}>
          {number}
        </Box>
        {Icon && <Icon size={16} color="#6b7280" aria-hidden />}
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </Typography>
        {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
      </Box>
      <Box sx={{ px: { xs: 2, md: 2.5 }, pb: { xs: 2, md: 2.5 } }}>{children}</Box>
    </Box>
  );
}
