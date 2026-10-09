'use client';

import { useState, useTransition } from 'react';
import { FormControl, Select, MenuItem, CircularProgress, Tooltip } from '@mui/material';
import { Loader2, AlertCircle } from 'lucide-react';
import { ROLES } from '@/lib/config/roles';

interface Props {
  teamId:      number;
  userId:      number;
  currentRole: string;
  isLastOwner: boolean;
  action:      (formData: FormData) => Promise<void>;
}

/**
 * Dropdown que permite al platform-admin cambiar el rol de un miembro de una empresa.
 * Bloquea downgrade del último owner — debe siempre haber ≥1 owner por team.
 */
export function RoleSelect({ teamId, userId, currentRole, isLastOwner, action }: Props) {
  const [role, setRole]     = useState(currentRole);
  const [error, setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(newRole: string) {
    setError(null);

    if (isLastOwner && currentRole === 'owner' && newRole !== 'owner') {
      setError('No puedes quitar el rol de owner al último propietario.');
      return;
    }
    if (newRole === currentRole) return;

    setRole(newRole);
    const fd = new FormData();
    fd.set('teamId', String(teamId));
    fd.set('userId', String(userId));
    fd.set('newRole', newRole);

    startTransition(async () => {
      try {
        await action(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cambiar rol');
        setRole(currentRole);
      }
    });
  }

  return (
    <FormControl size="small" sx={{ minWidth: 120 }}>
      <Select
        value={role}
        onChange={e => handleChange(e.target.value)}
        disabled={pending}
        sx={{
          fontSize: '0.75rem',
          borderRadius: '8px',
          '& .MuiSelect-select': { py: '4px', px: '8px' },
        }}
        MenuProps={{ sx: { '& .MuiPaper-root': { borderRadius: '8px' } } }}
        endAdornment={
          pending ? (
            <CircularProgress size={14} sx={{ color: '#9ca3af', mr: 1 }} />
          ) : error ? (
            <Tooltip title={error}>
              <AlertCircle style={{ width: 14, height: 14, color: '#dc2626', marginRight: 8, cursor: 'pointer' }} />
            </Tooltip>
          ) : null
        }
      >
        {ROLES.map(r => (
          <MenuItem key={r.key} value={r.key} sx={{ fontSize: '0.75rem' }}>
            {r.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
