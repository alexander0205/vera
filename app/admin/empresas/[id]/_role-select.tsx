'use client';

import { useState, useTransition } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { ROLES } from '@/lib/config/roles';

interface Props {
  teamId: number;
  userId: number;
  currentRole: string;
  isLastOwner: boolean;
  action: (formData: FormData) => Promise<void>;
}

/**
 * Dropdown que permite al platform-admin cambiar el rol de un miembro de una empresa.
 * Bloquea downgrade del último owner — debe siempre haber ≥1 owner por team.
 */
export function RoleSelect({ teamId, userId, currentRole, isLastOwner, action }: Props) {
  const [role, setRole]     = useState(currentRole);
  const [error, setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nuevoRole = e.target.value;
    setError(null);

    if (isLastOwner && currentRole === 'owner' && nuevoRole !== 'owner') {
      setError('No puedes quitar el rol de owner al último propietario.');
      e.target.value = currentRole;
      return;
    }
    if (nuevoRole === currentRole) return;

    setRole(nuevoRole);
    const fd = new FormData();
    fd.set('teamId', String(teamId));
    fd.set('userId', String(userId));
    fd.set('newRole', nuevoRole);

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
    <div className="flex items-center gap-2">
      <select
        value={role}
        onChange={handleChange}
        disabled={pending}
        className="text-xs bg-white border border-gray-300 rounded px-2 py-1 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 cursor-pointer"
      >
        {ROLES.map(r => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600" title={error}>
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
