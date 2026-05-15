'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, UserPlus, Loader2, CheckCircle, ExternalLink } from 'lucide-react';
import { INVITABLE_ROLES } from '@/lib/config/roles';

/**
 * Card embebido en /dashboard/configuracion para que el owner pueda invitar usuarios
 * rápidamente sin salir de la pantalla de configuración. La gestión completa de
 * miembros (ver lista, cambiar roles, remover) vive en /dashboard/equipo.
 */
export function EquipoCard() {
  const [email, setEmail]       = useState('');
  const [role, setRole]         = useState<string>(INVITABLE_ROLES[0]?.key ?? 'member');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleInvite() {
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError('Ingresa un email.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/equipo/invitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo enviar la invitación.');
        return;
      }
      setSuccess(`Invitación enviada a ${email.trim()}.`);
      setEmail('');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-600" />
          Equipo y permisos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Invita a otros usuarios para que colaboren en este negocio. Recibirán un correo con
          un enlace para aceptar la invitación.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Correo electrónico</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colega@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleInvite(); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Rol</Label>
            <Select value={role} onValueChange={setRole} disabled={loading}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleInvite}
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-700 text-white h-10"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
              : <><UserPlus className="h-4 w-4 mr-2" />Invitar</>}
          </Button>
        </div>

        {success && (
          <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-lg p-3 text-sm text-teal-800">
            <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <Link
            href="/dashboard/equipo"
            className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 hover:underline"
          >
            Ver y gestionar todos los miembros del equipo
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
