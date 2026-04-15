'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Users, UserPlus, Mail, Trash2, Shield, Loader2,
  Crown, BookOpen, ShoppingBag, User, Clock, Copy, CheckCheck,
  AlertTriangle,
} from 'lucide-react';
import { ROLES as ROLE_DEFS, INVITABLE_ROLES } from '@/lib/config/roles';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Member {
  id: number;
  userId: number;
  role: string;
  joinedAt: string;
  name: string | null;
  email: string;
}

interface Invitation {
  id: number;
  email: string;
  role: string;
  invitedAt: string;
  status: string;
}

interface TeamData {
  myUserId: number;
  isOwner: boolean;
  members: Member[];
  invitations: Invitation[];
  userLimit: number; // -1 = ilimitado
}

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLE_ICON_MAP: Record<string, React.ElementType> = {
  Crown, Shield, BookOpen, ShoppingBag, User,
};

const ROLES = Object.fromEntries(
  ROLE_DEFS.map(r => [r.key, {
    label:       r.label,
    descripcion: r.description,
    icon:        ROLE_ICON_MAP[r.ui.icon] ?? User,
    color:       r.ui.color,
  }])
) as Record<string, { label: string; descripcion: string; icon: React.ElementType; color: string }>;

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLES[role] ?? ROLES.member;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return email[0].toUpperCase();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EquipoPage() {
  const [data, setData]       = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Modal invitar
  const [showInvitar, setShowInvitar] = useState(false);
  const [invEmail, setInvEmail]       = useState('');
  const [invRole, setInvRole]         = useState('member');
  const [invitando, setInvitando]     = useState(false);
  const [invError, setInvError]       = useState<string | null>(null);
  const [inviteUrl, setInviteUrl]     = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  // Modal eliminar miembro
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removeError, setRemoveError]       = useState<string | null>(null);
  const [removing, setRemoving]             = useState(false);

  // Modal cancelar invitación
  const [invToCancel, setInvToCancel] = useState<Invitation | null>(null);
  const [cancelling, setCancelling]   = useState(false);

  // Cambiar rol
  const [changingRole, setChangingRole] = useState<number | null>(null);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/equipo/miembros');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando equipo');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Invitar ────────────────────────────────────────────────────────────────

  async function handleInvitar() {
    if (!invEmail.trim()) return;
    setInvitando(true);
    setInvError(null);
    setInviteUrl(null);
    try {
      const res  = await fetch('/api/equipo/invitaciones', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: invEmail.trim(), role: invRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error enviando invitación');
      setInviteUrl(json.inviteUrl);
      await cargar();
    } catch (e: unknown) {
      setInvError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setInvitando(false);
    }
  }

  function resetInviteModal() {
    setShowInvitar(false);
    setInvEmail('');
    setInvRole('member');
    setInvError(null);
    setInviteUrl(null);
    setCopied(false);
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Eliminar miembro ────────────────────────────────────────────────────────

  async function handleRemove() {
    if (!memberToRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res  = await fetch(`/api/equipo/miembros/${memberToRemove.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error eliminando miembro');
      setMemberToRemove(null);
      await cargar();
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : 'Error eliminando miembro');
    } finally {
      setRemoving(false);
    }
  }

  // ─── Cancelar invitación ─────────────────────────────────────────────────────

  async function handleCancelInvite() {
    if (!invToCancel) return;
    setCancelling(true);
    try {
      const res  = await fetch(`/api/equipo/invitaciones/${invToCancel.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cancelando invitación');
      setInvToCancel(null);
      await cargar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error cancelando invitación');
    } finally {
      setCancelling(false);
    }
  }

  // ─── Cambiar rol ─────────────────────────────────────────────────────────────

  async function handleRoleChange(memberId: number, newRole: string) {
    setChangingRole(memberId);
    try {
      const res  = await fetch(`/api/equipo/miembros/${memberId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cambiando rol');
      await cargar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error cambiando rol');
    } finally {
      setChangingRole(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
          <p className="font-medium">{error ?? 'Error cargando equipo'}</p>
          <Button variant="outline" className="mt-3" onClick={cargar}>Reintentar</Button>
        </div>
      </section>
    );
  }

  const canManage = data.isOwner;
  const memberCount = data.members.length;
  const userLimit = data.userLimit;
  const atLimit = userLimit > 0 && memberCount >= userLimit;
  const isIlimitado = userLimit < 0;

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-teal-600" />
            Equipo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Administra los usuarios con acceso a tu empresa
            {!isIlimitado && (
              <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full border ${
                atLimit
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                {memberCount}/{userLimit} usuarios
              </span>
            )}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-col items-end gap-1">
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => !atLimit && setShowInvitar(true)}
              disabled={atLimit}
              title={atLimit ? `Tu plan solo permite ${userLimit} usuario(s)` : undefined}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invitar usuario
            </Button>
            {atLimit && (
              <p className="text-xs text-red-600">
                Límite alcanzado —{' '}
                <a href="/dashboard/suscripcion" className="underline hover:text-red-700">
                  actualiza tu plan
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Roles explicados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600">Roles disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(ROLES).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className={`flex items-start gap-2 p-3 rounded-lg border ${cfg.color}`}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{cfg.label}</p>
                    <p className="text-xs opacity-75">{cfg.descripcion}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Miembros activos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Miembros activos
            <Badge variant="secondary" className="ml-1">{data.members.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {data.members.map((m) => {
              const isSelf  = m.userId === data.myUserId;
              const isOwner = m.role === 'owner';
              const canEditThis = canManage && !isSelf;

              return (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold text-sm shrink-0">
                    {getInitials(m.name, m.email)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.name ?? m.email}
                        {isSelf && <span className="text-gray-400 font-normal ml-1">(tú)</span>}
                      </p>
                      <RoleBadge role={m.role} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    <p className="text-xs text-gray-400">Miembro desde {formatFecha(m.joinedAt)}</p>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditThis && (
                      changingRole === m.id
                        ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        : (
                          <Select
                            value={m.role}
                            onValueChange={(val) => handleRoleChange(m.id, val)}
                            disabled={changingRole !== null}
                          >
                            <SelectTrigger className="h-8 text-xs w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ROLES).map(([key, cfg]) => (
                                <SelectItem key={key} value={key} className="text-xs">
                                  {cfg.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                    )}

                    {(canEditThis || (isSelf && !isOwner)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                        onClick={() => { setRemoveError(null); setMemberToRemove(m); }}
                        title={isSelf ? 'Salir del equipo' : 'Eliminar miembro'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invitaciones pendientes */}
      {data.invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Invitaciones pendientes
              <Badge variant="secondary" className="ml-1">{data.invitations.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Usuarios invitados que aún no se han registrado
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="h-10 w-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RoleBadge role={inv.role} />
                      <span className="text-xs text-gray-400">Invitado el {formatFecha(inv.invitedAt)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                      onClick={() => setInvToCancel(inv)}
                      title="Cancelar invitación"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Modal: Invitar usuario ──────────────────────────────────────────────── */}
      <Dialog
        open={showInvitar}
        onOpenChange={(open) => { if (!open) resetInviteModal(); else setShowInvitar(true); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-teal-600" />
              Invitar usuario
            </DialogTitle>
          </DialogHeader>

          {inviteUrl ? (
            <div className="py-4 space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                <CheckCheck className="h-8 w-8 text-teal-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-teal-800">¡Invitación creada!</p>
                <p className="text-xs text-teal-600 mt-1">
                  Comparte este enlace con <strong>{invEmail}</strong>:
                </p>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} className="text-xs font-mono bg-gray-50" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInviteUrl}
                  className={copied ? 'text-teal-600 border-teal-300' : ''}
                >
                  {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                El enlace es válido hasta que el usuario se registre con ese correo
              </p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={resetInviteModal}>Cerrar</Button>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {invError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {invError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="inv-email">Correo electrónico</Label>
                <Input
                  id="inv-email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvitar()}
                  disabled={invitando}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inv-role">Rol</Label>
                <Select value={invRole} onValueChange={setInvRole} disabled={invitando}>
                  <SelectTrigger id="inv-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLES)
                      .filter(([k]) => INVITABLE_ROLES.some(r => r.key === k))
                      .map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" />
                              <span>{cfg.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })
                    }
                  </SelectContent>
                </Select>
                {invRole && ROLES[invRole] && (
                  <p className="text-xs text-gray-500">{ROLES[invRole].descripcion}</p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetInviteModal} disabled={invitando}>
                  Cancelar
                </Button>
                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleInvitar}
                  disabled={invitando || !invEmail.trim()}
                >
                  {invitando
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invitando…</>
                    : <><UserPlus className="h-4 w-4 mr-2" />Enviar invitación</>
                  }
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación de miembro ────────────────────────────── */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {memberToRemove?.userId === data.myUserId ? '¿Salir del equipo?' : '¿Eliminar miembro?'}
            </DialogTitle>
            <DialogDescription>
              {memberToRemove?.userId === data.myUserId
                ? 'Perderás acceso a todos los datos de esta empresa.'
                : <>
                    <strong>{memberToRemove?.name ?? memberToRemove?.email}</strong> perderá
                    acceso a todos los datos de la empresa. Esta acción no se puede deshacer.
                  </>
              }
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mx-6">
              {removeError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)} disabled={removing}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</>
                : 'Sí, eliminar'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar cancelación de invitación ─────────────────────────── */}
      <Dialog open={!!invToCancel} onOpenChange={(open) => { if (!open) setInvToCancel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              ¿Cancelar invitación?
            </DialogTitle>
            <DialogDescription>
              La invitación para <strong>{invToCancel?.email}</strong> será cancelada y
              el enlace de registro dejará de funcionar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvToCancel(null)} disabled={cancelling}>
              No, mantener
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelInvite}
              disabled={cancelling}
            >
              {cancelling
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Cancelando…</>
                : 'Sí, cancelar'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}
