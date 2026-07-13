'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  Crown, Shield, User, Eye, UserCog, Plus, Lock, ArrowLeft, Trash2,
  Check, Pencil, AlertTriangle,
  FileText, Users, Package, FileSpreadsheet, ShoppingCart, BarChart3,
  Wallet, Settings, CreditCard,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ButtonBase from '@mui/material/ButtonBase';

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
function Icon({ name, style }: { name: string | null; style?: React.CSSProperties }) {
  const C = (name && ICONS[name]) || UserCog;
  return <C style={style} />;
}

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

export default function PermisosClient() {
  const { data, isLoading, mutate } = useSWR<Data>('/api/equipo/permisos', fetcher);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = data?.roles.find(r => r.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, color: '#9ca3af' }}>
        <CircularProgress size={20} color="inherit" />
      </Box>
    );
  }
  if (!data) {
    return (
      <Box sx={{ py: 10, textAlign: 'center', color: '#6b7280' }}>
        No se pudieron cargar los roles.
      </Box>
    );
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
            Roles y permisos
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Define qué puede hacer cada rol. Aplica solo a tu empresa.
          </Typography>
        </Box>
        <Button
          onClick={onCreate}
          variant="contained"
          startIcon={<Plus style={{ width: 16, height: 16 }} />}
          sx={{
            textTransform: 'none',
            bgcolor: '#0d9488',
            color: '#fff',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#0f766e', boxShadow: 'none' },
          }}
        >
          Nuevo rol
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {roles.map(r => {
          const isOwner = r.key === 'owner';
          return (
            <ButtonBase
              key={r.id}
              onClick={() => onSelect(r.id)}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                bgcolor: '#fff',
                px: 2,
                py: 1.5,
                textAlign: 'left',
                transition: 'background-color 0.15s, border-color 0.15s',
                '&:hover': { borderColor: '#d1d5db', bgcolor: '#f9fafb' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Box
                  component="span"
                  sx={{
                    display: 'flex',
                    height: 36,
                    width: 36,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    bgcolor: '#f9fafb',
                  }}
                >
                  <Icon name={r.icon} style={{ width: 18, height: 18, color: '#4b5563' }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                      {r.label}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        fontSize: '10px',
                        borderRadius: '9999px',
                        px: 1,
                        py: 0.25,
                        ...(r.isSystem
                          ? { bgcolor: '#f3f4f6', color: '#6b7280' }
                          : { bgcolor: '#f0fdfa', color: '#0f766e' }),
                      }}
                    >
                      {r.isSystem ? 'sistema' : 'personalizado'}
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                    }}
                  >
                    {r.description ?? `${r.permissions.length} permisos`}
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1.5 }}>
                <Box
                  component="span"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: '#9ca3af' }}
                >
                  <User style={{ width: 14, height: 14 }} />{r.memberCount}
                </Box>
                {isOwner
                  ? <Lock style={{ width: 16, height: 16, color: '#9ca3af' }} />
                  : <Pencil style={{ width: 16, height: 16, color: '#9ca3af' }} />}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <ButtonBase
        onClick={onBack}
        sx={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.875rem',
          color: '#6b7280',
          '&:hover': { color: '#1f2937' },
        }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} /> Volver a roles
      </ButtonBase>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Box
            component="span"
            sx={{
              display: 'flex',
              height: 40,
              width: 40,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              bgcolor: '#f9fafb',
            }}
          >
            <Icon name={role.icon} style={{ width: 20, height: 20, color: '#4b5563' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {editingLabel && !isOwner ? (
              <TextField
                autoFocus
                size="small"
                value={label}
                onChange={e => { setLabel(e.target.value); setSaved(false); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={e => { if (e.key === 'Enter') setEditingLabel(false); }}
                slotProps={{ htmlInput: { maxLength: 60 } }}
                sx={{ width: 224, '& .MuiInputBase-root': { height: 32 } }}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h1" sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
                  {label}
                </Typography>
                {!isOwner && (
                  <IconButton
                    onClick={() => setEditingLabel(true)}
                    size="small"
                    sx={{ color: '#9ca3af', p: 0.25, '&:hover': { color: '#374151', bgcolor: 'transparent' } }}
                  >
                    <Pencil style={{ width: 14, height: 14 }} />
                  </IconButton>
                )}
                {isOwner && <Lock style={{ width: 16, height: 16, color: '#9ca3af' }} />}
              </Box>
            )}
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {isOwner ? 'Acceso completo. No editable.' : role.isSystem ? 'Rol de sistema — permisos editables.' : 'Rol personalizado.'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!role.isSystem && (
            <Button
              variant="outlined"
              onClick={() => setConfirmDelete(true)}
              startIcon={<Trash2 style={{ width: 16, height: 16 }} />}
              sx={{
                textTransform: 'none',
                color: '#dc2626',
                borderColor: '#d1d5db',
                '&:hover': { color: '#b91c1c', borderColor: '#9ca3af', bgcolor: '#f9fafb' },
              }}
            >
              Borrar
            </Button>
          )}
          {!isOwner && (
            <Button
              onClick={save}
              disabled={!dirty || saving}
              variant="contained"
              startIcon={
                saving ? <CircularProgress size={16} color="inherit" />
                  : saved && !dirty ? <Check style={{ width: 16, height: 16 }} />
                  : undefined
              }
              sx={{
                textTransform: 'none',
                minWidth: 130,
                bgcolor: '#0d9488',
                color: '#fff',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#0f766e', boxShadow: 'none' },
                '&.Mui-disabled': { bgcolor: '#0d9488', color: '#fff', opacity: 0.5 },
              }}
            >
              {saving ? '' : saved && !dirty ? 'Guardado' : 'Guardar cambios'}
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderRadius: '8px',
            border: '1px solid #fecaca',
            bgcolor: '#fef2f2',
            px: 1.5,
            py: 1,
            fontSize: '0.875rem',
            color: '#b91c1c',
          }}
        >
          <AlertTriangle style={{ width: 16, height: 16 }} /> {error}
        </Box>
      )}

      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        {catalog.map((group, gi) => (
          <Box key={group.module} sx={{ px: 2, py: 1.5, borderTop: gi === 0 ? 'none' : '1px solid #f3f4f6' }}>
            <Box
              sx={{
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: '0.75rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#9ca3af',
              }}
            >
              <Icon name={group.icon} style={{ width: 14, height: 14 }} /> {group.module}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {group.permissions.map(p => {
                const on = isOwner || perms.has(p.key);
                return (
                  <Box
                    key={p.key}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75 }}
                  >
                    <Box component="span" sx={{ fontSize: '0.875rem', color: '#374151' }}>{p.label}</Box>
                    <Toggle on={on} disabled={isOwner} onClick={() => toggle(p.key)} />
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Paper>

      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(false)} fullWidth maxWidth="xs">
          <DialogTitle>Borrar rol &ldquo;{role.label}&rdquo;</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {role.memberCount > 0
                ? `${role.memberCount} usuario(s) con este rol pasarán a Vendedor.`
                : 'Esta acción no se puede deshacer.'}
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setConfirmDelete(false)}
              sx={{
                textTransform: 'none',
                color: '#374151',
                borderColor: '#d1d5db',
                '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={doDelete}
              disabled={saving}
              variant="contained"
              startIcon={
                saving ? <CircularProgress size={16} color="inherit" />
                  : <Trash2 style={{ width: 16, height: 16 }} />
              }
              sx={{
                textTransform: 'none',
                bgcolor: '#dc2626',
                color: '#fff',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
              }}
            >
              Borrar rol
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Switch
      checked={on}
      disabled={disabled}
      onChange={onClick}
      disableRipple
      sx={{
        width: 38,
        height: 22,
        padding: 0,
        '& .MuiSwitch-switchBase': {
          padding: '2px',
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            color: '#fff',
            '& + .MuiSwitch-track': { backgroundColor: '#0d9488', borderColor: '#0d9488', opacity: 1 },
          },
          '&.Mui-disabled': { opacity: 0.6 },
          '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.6 },
        },
        '& .MuiSwitch-thumb': {
          width: 16,
          height: 16,
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          backgroundColor: '#fff',
        },
        '& .MuiSwitch-track': {
          borderRadius: '9999px',
          border: '1px solid #d1d5db',
          backgroundColor: '#f3f4f6',
          opacity: 1,
          boxSizing: 'border-box',
        },
      }}
    />
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
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Nuevo rol</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 2 }}>
          Empieza desde un rol existente y ajusta sus permisos.
        </DialogContentText>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            id="role-label"
            label="Nombre del rol"
            size="small"
            fullWidth
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Cajero turno noche"
            autoFocus
            slotProps={{ htmlInput: { maxLength: 60 }, inputLabel: { shrink: true } }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="based-on-label" shrink>Basado en</InputLabel>
            <Select
              labelId="based-on-label"
              label="Basado en"
              value={basedOn}
              onChange={e => setBasedOn(e.target.value)}
              displayEmpty
            >
              {roles.filter(r => r.key !== 'owner').map(r => (
                <MenuItem key={r.id} value={r.key}>{r.label}</MenuItem>
              ))}
            </Select>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.75 }}>
              Copia los permisos de ese rol como punto de partida.
            </Typography>
          </FormControl>
          {error && <Typography sx={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</Typography>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            color: '#374151',
            borderColor: '#d1d5db',
            '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
          }}
        >
          Cancelar
        </Button>
        <Button
          onClick={create}
          disabled={saving}
          variant="contained"
          startIcon={
            saving ? <CircularProgress size={16} color="inherit" />
              : <Plus style={{ width: 16, height: 16 }} />
          }
          sx={{
            textTransform: 'none',
            bgcolor: '#0d9488',
            color: '#fff',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#0f766e', boxShadow: 'none' },
          }}
        >
          Crear rol
        </Button>
      </DialogActions>
    </Dialog>
  );
}
