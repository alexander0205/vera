'use client';

import { useTransition } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { switchPlanAction } from './actions';

const PLANS = [
  { key: 'starter',  label: 'Starter',  price: '$15' },
  { key: 'business', label: 'Business', price: '$35' },
  { key: 'pro',      label: 'Pro',      price: '$65' },
] as const;

export function PlanSwitcher({ currentPlan }: { currentPlan: string }) {
  const [pending, startTransition] = useTransition();
  const currentKey = currentPlan.toLowerCase();

  function handleSwitch(planKey: string) {
    const fd = new FormData();
    fd.set('plan', planKey);
    startTransition(() => switchPlanAction(fd));
  }

  return (
    <Box sx={{ border: '1px dashed #fcd34d', bgcolor: '#fffbeb', borderRadius: '12px', p: 2 }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
        Cambiar plan (dev)
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {PLANS.map(({ key, label, price }) => (
          <Button
            key={key}
            size="small"
            variant={key === currentKey ? 'contained' : 'outlined'}
            disableElevation
            onClick={() => handleSwitch(key)}
            disabled={pending || key === currentKey}
            startIcon={pending && key !== currentKey ? <CircularProgress size={12} /> : undefined}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '0.8125rem',
              ...(key === currentKey
                ? { bgcolor: '#0d9488', '&:hover': { bgcolor: '#0d9488' } }
                : { borderColor: '#d1d5db', color: '#374151', '&:hover': { borderColor: '#0d9488', color: '#0d9488' } }),
            }}
          >
            {label} <Box component="span" sx={{ fontSize: '0.6875rem', opacity: 0.7, ml: 0.5 }}>{price}/mes</Box>
          </Button>
        ))}
      </Box>
    </Box>
  );
}
