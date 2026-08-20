'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  number: number;
  title: string;
  icon?: ComponentType<LucideProps>;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionSection({
  number, title, icon: Icon, hint, defaultOpen = false, children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        sx={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 1.5,
          px: { xs: 2, md: 2.5 }, py: { xs: 1.75, md: 2 },
          textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
          '&:hover': { bgcolor: '#fafafa' }, transition: 'background 0.15s',
        }}
      >
        <Box sx={{ height: 24, width: 24, borderRadius: '6px', bgcolor: '#3658e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.6875rem', flexShrink: 0 }}>
          {number}
        </Box>
        {Icon && <Icon size={16} color="#6b7280" aria-hidden />}
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </Typography>
        {hint && <Typography component="span" sx={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 }}>{hint}</Typography>}
        <Box sx={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0, display: 'flex' }}>
          <ChevronDown size={16} color="#9ca3af" aria-hidden />
        </Box>
      </Box>
      {open && (
        <Box sx={{ px: { xs: 2, md: 2.5 }, pb: { xs: 2, md: 2.5 }, borderTop: '1px solid #f3f4f6', pt: 2 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
