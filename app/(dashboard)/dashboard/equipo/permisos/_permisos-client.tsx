'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  Crown, Shield, User, Eye, UserCog, Plus, Lock, ArrowLeft, Trash2,
  Loader2, Check, Pencil, AlertTriangle,
  FileText, Users, Package, FileSpreadsheet, ShoppingCart, BarChart3,
  Wallet, Settings, CreditCard,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface PermDef { key: string; label: string }
interface PermGroup { module: string; icon: string; permissions: PermDef[] }
interface Role {
  id: number;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}
interface Data { roles: Role[]; catalog: PermGroup[] }

const ICONS: Record<string, React.ElementType> = {
  Crown, Shield, User, Eye, UserCog,
  FileText, Users, Package, FileSpreadsheet, ShoppingCart, BarChart3,
  Wallet, Settings, CreditCard,
};
function Icon({ name, className }: { name: string | null; className?: string }) {
  const C = (name && ICONS[name]) || UserCog;
  return <C className={className} />;
}

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

export default function PermisosClient() {
  const { data, isLoading, mutate } = useSWR<Data>('/api/equipo/permisos', fetcher);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = data?.roles.find(r => r.id === selectedId) ?? null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!data) {
    return <div className="py-20 text-center text-gray-500">No se pudieron cargar los roles.</div>;
  }

  if (selected) {
    return (
      <RoleEditor
        role={selected}
        catalog={data.catalog}
        onBack={() => setSelectedId(null)}
        onSaved={() => mutate()}
        onDeleted={() => { setSelectedId(null); mutate(); }}
      />
    );
  }

  return (
    <>
      <RolesList
        roles={data.roles}
        onSelect={setSelectedId}
        onCreate={() => setShowCreate(true)}
      />
      {showCreate && (
        <CreateRoleDialog
          roles={data.roles}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); mutate(); setSelectedId(id); }}
        />
      )}
    </>
  );
}

// ─── Lista de roles ───────────────────────────────────────────────────────────
function RolesList({ roles, onSelect, onCreate }: {
  roles: Role[];
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Roles y permisos</h1>
          <p className="text-sm text-gray-500">Define qué puede hacer cada rol. Aplica solo a tu empresa.</p>
        </div>
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo rol
        </Button>
      </div>

      <div className="space-y-2">
        {roles.map(r => {
          const isOwner = r.key === 'owner';
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                  <Icon name={r.icon} className="h-[18px] w-[18px] text-gray-600" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{r.label}</span>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 ${r.isSystem ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'}`}>
                      {r.isSystem ? 'sistema' : 'personalizado'}
                    </span>
                  </div>
                  <div className="truncate text-xs text-gray-500">{r.description ?? `${r.permissions.length} permisos`}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <User className="h-3.5 w-3.5" />{r.memberCount}
                </span>
                {isOwner
                  ? <Lock className="h-4 w-4 text-gray-400" />
                  : <Pencil className="h-4 w-4 text-gray-400" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Editor de un rol ─────────────────────────────────────────────────────────
function RoleEditor({ role, catalog, onBack, onSaved, onDeleted }: {
  role: Role;
  catalog: PermGroup[];
  onBack: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isOwner = role.key === 'owner';
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role.permissions));
  const [label, setLabel] = useState(role.label);
  const [editingLabel, setEditingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (label !== role.label) return true;
    const a = perms, b = new Set(role.permissions);
    if (a.size !== b.size) return true;
    for (const p of a) if (!b.has(p)) return true;
    return false;
  }, [perms, label, role]);

  const toggle = useCallback((key: string) => {
    if (isOwner) return;
    setSaved(false);
    setPerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [isOwner]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/equipo/permisos/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, permissions: [...perms] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Error al guardar');
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/equipo/permisos/${role.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Error al borrar');
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Volver a roles
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50">
            <Icon name={role.icon} className="h-5 w-5 text-gray-600" />
          </span>
          <div className="min-w-0">
            {editingLabel && !isOwner ? (
              <Input
                autoFocus
                value={label}
                onChange={e => { setLabel(e.target.value); setSaved(false); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={e => { if (e.key === 'Enter') setEditingLabel(false); }}
                className="h-8 w-56"
                maxLength={60}
              />
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{label}</h1>
                {!isOwner && (
                  <button onClick={() => setEditingLabel(true)} className="text-gray-400 hover:text-gray-700">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {isOwner && <Lock className="h-4 w-4 text-gray-400" />}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {isOwner ? 'Acceso completo. No editable.' : role.isSystem ? 'Rol de sistema — permisos editables.' : 'Rol personalizado.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!role.isSystem && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)} className="gap-2 text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" /> Borrar
            </Button>
          )}
          {!isOwner && (
            <Button onClick={save} disabled={!dirty || saving} className="gap-2 min-w-[130px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" />
                : saved && !dirty ? <><Check className="h-4 w-4" /> Guardado</>
                : 'Guardar cambios'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <Card>
        <CardContent className="divide-y divide-gray-100 p-0">
          {catalog.map(group => (
            <div key={group.module} className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                <Icon name={group.icon} className="h-3.5 w-3.5" /> {group.module}
              </div>
              <div className="space-y-1">
                {group.permissions.map(p => {
                  const on = isOwner || perms.has(p.key);
                  return (
                    <div key={p.key} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-gray-700">{p.label}</span>
                      <Toggle on={on} disabled={isOwner} onClick={() => toggle(p.key)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {confirmDelete && (
        <Dialog open onOpenChange={(o) => !o && setConfirmDelete(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Borrar rol &ldquo;{role.label}&rdquo;</DialogTitle>
              <DialogDescription>
                {role.memberCount > 0
                  ? `${role.memberCount} usuario(s) con este rol pasarán a Vendedor.`
                  : 'Esta acción no se puede deshacer.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button onClick={doDelete} disabled={saving} className="gap-2 bg-red-600 hover:bg-red-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Borrar rol
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-[22px] w-[38px] rounded-full border transition-colors ${
        on ? 'border-teal-600 bg-teal-600' : 'border-gray-300 bg-gray-100'
      } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  );
}

// ─── Crear rol ──────────────────────────────────────────────────────────────
function CreateRoleDialog({ roles, onClose, onCreated }: {
  roles: Role[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [label, setLabel] = useState('');
  const [basedOn, setBasedOn] = useState<string>('user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!label.trim()) { setError('Escribe un nombre'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/equipo/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), basedOn }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Error al crear');
      onCreated(json.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo rol</DialogTitle>
          <DialogDescription>Empieza desde un rol existente y ajusta sus permisos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-label">Nombre del rol</Label>
            <Input id="role-label" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Cajero turno noche" maxLength={60} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Basado en</Label>
            <Select value={basedOn} onValueChange={setBasedOn}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.filter(r => r.key !== 'owner').map(r => (
                  <SelectItem key={r.id} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Copia los permisos de ese rol como punto de partida.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={create} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear rol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
