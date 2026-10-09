'use client';

import { useState, useEffect, useCallback } from 'react';
import { BILLING_ENABLED } from '@/lib/config/billing';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Link from 'next/link';
import {
  Users, UserPlus, Mail, Trash2, Shield,
  Crown, BookOpen, ShoppingBag, User, Clock, Copy, CheckCheck,
  AlertTriangle, Eye, UserCog,
} from 'lucide-react';
import { ROLES as ROLE_DEFS } from '@/lib/config/roles';

/** Módulos que otorga un rol de sistema (según sus permisos modulo:*). Para
 *  roles custom sin catálogo estático devuelve null (no se muestra el hint). */
function modulosDeRol(roleKey: string): { facturacion: boolean; pos: boolean } | null {
  const def = ROLE_DEFS.find(r => r.key === roleKey);
  if (!def) return null;
  return {
    facturacion: def.permissions.includes('modulo:facturacion'),
    pos:         def.permissions.includes('modulo:pos'),
  };
}

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
  roles: RoleOpt[];
  userLimit: number; // -1 = ilimitado
}

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLE_ICON_MAP: Record<string, React.ElementType> = {
  Crown, Shield, BookOpen, ShoppingBag, User, Eye, UserCog,
};

// Config estática de los roles de sistema (fallback si aún no llegan los del team).
const ROLES = Object.fromEntries(
  ROLE_DEFS.map(r => [r.key, {
    label:       r.label,
    descripcion: r.description,
    icon:        ROLE_ICON_MAP[r.ui.icon] ?? User,
    color:       r.ui.color,
  }])
) as Record<string, { label: string; descripcion: string; icon: React.ElementType; color: string }>;

// Rol del team (sistema o custom) tal como llega de /api/equipo/miembros.
interface RoleOpt {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

interface RoleCfg { label: string; descripcion: string; icon: React.ElementType; color: string }

// Resuelve la config visual de un rol: primero el catálogo dinámico del team,
// luego el estático, y por último un fallback genérico.
function resolveRoleCfg(roleKey: string, dynamic?: RoleOpt[]): RoleCfg {
  const d = dynamic?.find(r => r.key === roleKey);
  if (d) {
    return {
      label:       d.label,
      descripcion: d.description ?? '',
      icon:        ROLE_ICON_MAP[d.icon ?? ''] ?? UserCog,
      color:       d.color ?? 'text-gray-600 bg-gray-50 border-gray-200',
    };
  }
  return ROLES[roleKey] ?? ROLES.user;
}

// ─── Paleta: mapea las clases tailwind (`text-*`, `bg-*`, `border-*`) a hex ─────
// Conserva la intención visual original de cada rol al pintar el Chip en MUI.
const TW_COLOR_HEX: Record<string, string> = {
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280',
  'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937',
  'gray-900': '#111827',
  'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca',
  'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c',
  'amber-50': '#fffbeb', 'amber-100': '#fef3c7', 'amber-200': '#fde68a',
  'amber-500': '#f59e0b', 'amber-600': '#d97706', 'amber-700': '#b45309',
  'amber-800': '#92400e',
  'yellow-50': '#fefce8', 'yellow-100': '#fef9c3', 'yellow-200': '#fef08a',
  'yellow-600': '#ca8a04', 'yellow-700': '#a16207', 'yellow-800': '#854d0e',
  'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0',
  'green-600': '#16a34a', 'green-700': '#15803d', 'green-800': '#166534',
  'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0',
  'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065f46',
  'zero-50': '#eef2fe', 'zero-100': '#e0e7fd', 'zero-200': '#c7d2fc',
  'zero-600': '#3658e1', 'zero-700': '#2a45c4', 'zero-800': '#253a9e',
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe',
  'blue-600': '#2563eb', 'blue-700': '#1d4ed8', 'blue-800': '#1e40af',
  'indigo-50': '#eef2ff', 'indigo-100': '#e0e7ff', 'indigo-200': '#c7d2fe',
  'indigo-600': '#4f46e5', 'indigo-700': '#4338ca', 'indigo-800': '#3730a3',
  'purple-50': '#faf5ff', 'purple-100': '#f3e8ff', 'purple-200': '#e9d5ff',
  'purple-600': '#9333ea', 'purple-700': '#7e22ce', 'purple-800': '#6b21a8',
  'violet-50': '#f5f3ff', 'violet-100': '#ede9fe', 'violet-200': '#ddd6fe',
  'violet-600': '#7c3aed', 'violet-700': '#6d28d9', 'violet-800': '#5b21b6',
  'pink-50': '#fdf2f8', 'pink-100': '#fce7f3', 'pink-200': '#fbcfe8',
  'pink-600': '#db2777', 'pink-700': '#be185d', 'pink-800': '#9d174d',
  'orange-50': '#fff7ed', 'orange-100': '#ffedd5', 'orange-200': '#fed7aa',
  'orange-600': '#ea580c', 'orange-700': '#c2410c', 'orange-800': '#9a3412',
  'cyan-50': '#ecfeff', 'cyan-100': '#cffafe', 'cyan-200': '#a5f5fe',
  'cyan-600': '#0891b2', 'cyan-700': '#0e7490', 'cyan-800': '#155e75',
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0',
  'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b',
};

function twToBadgeStyle(color: string): { color: string; bg: string; border: string } {
  const out = { color: '#4b5563', bg: '#f9fafb', border: '#e5e7eb' };
  for (const token of color.split(/\s+/)) {
    const m = token.match(/^(text|bg|border)-(.+)$/);
    if (!m) continue;
    const hex = TW_COLOR_HEX[m[2]];
    if (!hex) continue;
    if (m[1] === 'text') out.color = hex;
    else if (m[1] === 'bg') out.bg = hex;
    else if (m[1] === 'border') out.border = hex;
  }
  return out;
}

function RoleBadge({ cfg }: { cfg: RoleCfg }) {
  const Icon = cfg.icon;
  const c = twToBadgeStyle(cfg.color);
  return (
    <Chip
      size="small"
      icon={<Icon style={{ width: 12, height: 12, color: c.color }} />}
      label={cfg.label}
      sx={{
        height: 'auto',
        py: 0.25,
        px: 0.25,
        fontSize: '0.75rem',
        fontWeight: 500,
        color: c.color,
        bgcolor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '9999px',
        '& .MuiChip-label': { px: 0.75 },
        '& .MuiChip-icon': { ml: 0.75, mr: -0.25, color: c.color },
      }}
    />
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} sx={{ color: '#3658e1' }} />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box component="section" sx={{ p: 3 }}>
        <Box
          sx={{
            bgcolor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '12px',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontWeight: 500 }}>{error ?? 'Error cargando equipo'}</Typography>
          <Button
            variant="outlined"
            onClick={cargar}
            sx={{
              mt: 1.5,
              textTransform: 'none',
              color: '#374151',
              borderColor: '#d1d5db',
              '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
            }}
          >
            Reintentar
          </Button>
        </Box>
      </Box>
    );
  }

  const canManage = data.isOwner;
  const memberCount = data.members.length;
  const userLimit = data.userLimit;
  const atLimit = userLimit > 0 && memberCount >= userLimit;
  const isIlimitado = userLimit < 0;

  return (
    <Box component="section" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h1"
            sx={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Users style={{ width: 24, height: 24, color: '#3658e1' }} />
            Equipo
          </Typography>
          <Typography
            component="p"
            sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5, display: 'flex', alignItems: 'center' }}
          >
            Administra los usuarios con acceso a tu empresa
            {!isIlimitado && (
              <Box
                component="span"
                sx={{
                  ml: 1,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  px: 1,
                  py: 0.25,
                  borderRadius: '9999px',
                  border: '1px solid',
                  ...(atLimit
                    ? { bgcolor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }
                    : { bgcolor: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }),
                }}
              >
                {memberCount}/{userLimit} usuarios
              </Box>
            )}
          </Typography>
        </Box>
        {canManage && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            <Button
              variant="contained"
              onClick={() => !atLimit && setShowInvitar(true)}
              disabled={atLimit}
              title={atLimit ? `Tu plan solo permite ${userLimit} usuario(s)` : undefined}
              startIcon={<UserPlus style={{ width: 16, height: 16 }} />}
              sx={{
                textTransform: 'none',
                bgcolor: '#3658e1',
                color: '#fff',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#2a45c4', boxShadow: 'none' },
                '&.Mui-disabled': { bgcolor: '#3658e1', color: '#fff', opacity: 0.5 },
              }}
            >
              Invitar usuario
            </Button>
            {atLimit && BILLING_ENABLED && (
              <Typography component="p" sx={{ fontSize: '0.75rem', color: '#dc2626' }}>
                Límite alcanzado —{' '}
                <Box
                  component={Link}
                  href="/dashboard/suscripcion"
                  sx={{ textDecoration: 'underline', color: 'inherit', '&:hover': { color: '#b91c1c' } }}
                >
                  actualiza tu plan
                </Box>
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Miembros activos */}
      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
          {/* component="div": Typography por defecto renderiza <p>, y el Chip
              de MUI es un <div> — anidarlo dentro de <p> es HTML inválido y
              React lo reporta como error en consola. */}
          <Typography
            component="div"
            sx={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#4b5563',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Users style={{ width: 16, height: 16 }} />
            Miembros activos
            <Chip
              label={data.members.length}
              size="small"
              sx={{ ml: 0.5, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 500, height: 20 }}
            />
          </Typography>
        </Box>
        <Box>
          {data.members.map((m) => {
            const isSelf  = m.userId === data.myUserId;
            const isOwner = m.role === 'owner';
            const canEditThis = canManage && !isSelf;

            return (
              <Box
                key={m.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  px: 3,
                  py: 2,
                  borderTop: '1px solid #f3f4f6',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: '#f9fafb' },
                }}
              >
                {/* Avatar */}
                <Box
                  sx={{
                    height: 40,
                    width: 40,
                    borderRadius: '9999px',
                    bgcolor: '#e0e7fd',
                    color: '#2a45c4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(m.name, m.email)}
                </Box>

                {/* Info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography
                      component="p"
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.name ?? m.email}
                      {isSelf && (
                        <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400, ml: 0.5 }}>(tú)</Box>
                      )}
                    </Typography>
                    <RoleBadge cfg={resolveRoleCfg(m.role, data?.roles)} />
                  </Box>
                  <Typography
                    component="p"
                    sx={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.email}
                  </Typography>
                  <Typography component="p" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Miembro desde {formatFecha(m.joinedAt)}
                  </Typography>

                  {/* Módulos a los que entra este usuario (según su rol). El
                      owner siempre entra a todo. Deja ver de un vistazo quién
                      usa Facturación, quién el POS o ambos. */}
                  {(() => {
                    const mods = isOwner
                      ? { facturacion: true, pos: true }
                      : modulosDeRol(m.role);
                    if (!mods) return null;
                    const activos = [
                      mods.facturacion && 'Facturación',
                      mods.pos && 'Punto de Venta',
                    ].filter(Boolean) as string[];
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                        <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
                          Acceso a:
                        </Typography>
                        {activos.length === 0 ? (
                          <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#b45309' }}>
                            ningún módulo
                          </Typography>
                        ) : activos.map(nombre => (
                          <Box
                            key={nombre}
                            component="span"
                            sx={{
                              fontSize: '0.6875rem', fontWeight: 600, px: 0.875, py: '2px',
                              borderRadius: '6px', bgcolor: '#eef2fe', color: '#2a45c4',
                              border: '1px solid #c7d2fc',
                            }}
                          >
                            {nombre}
                          </Box>
                        ))}
                      </Box>
                    );
                  })()}
                </Box>

                {/* Acciones */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  {canEditThis && (
                    changingRole === m.id
                      ? <CircularProgress size={16} sx={{ color: '#9ca3af' }} />
                      : (
                        <Select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          disabled={changingRole !== null}
                          size="small"
                          sx={{
                            height: 32,
                            width: 144,
                            fontSize: '0.75rem',
                            '& .MuiSelect-select': { py: 0.5 },
                          }}
                        >
                          {(data?.roles ?? []).filter(r => r.key !== 'owner').map(r => (
                            <MenuItem key={r.key} value={r.key} sx={{ fontSize: '0.75rem' }}>
                              {r.label}
                            </MenuItem>
                          ))}
                        </Select>
                      )
                  )}

                  {(canEditThis || (isSelf && !isOwner)) && (
                    <IconButton
                      size="small"
                      onClick={() => { setRemoveError(null); setMemberToRemove(m); }}
                      title={isSelf ? 'Salir del equipo' : 'Eliminar miembro'}
                      sx={{
                        height: 32,
                        width: 32,
                        color: '#ef4444',
                        '&:hover': { color: '#b91c1c', bgcolor: '#fef2f2' },
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* Invitaciones pendientes */}
      {data.invitations.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
            <Typography
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Mail style={{ width: 16, height: 16 }} />
              Invitaciones pendientes
              <Chip
                label={data.invitations.length}
                size="small"
                sx={{ ml: 0.5, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 500, height: 20 }}
              />
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.5 }}>
              Usuarios invitados que aún no se han registrado
            </Typography>
          </Box>
          <Box>
            {data.invitations.map((inv) => (
              <Box
                key={inv.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  px: 3,
                  py: 2,
                  borderTop: '1px solid #f3f4f6',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: '#f9fafb' },
                }}
              >
                <Box
                  sx={{
                    height: 40,
                    width: 40,
                    borderRadius: '9999px',
                    bgcolor: '#f3f4f6',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Clock style={{ width: 16, height: 16 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    component="p"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#111827',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inv.email}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <RoleBadge cfg={resolveRoleCfg(inv.role, data?.roles)} />
                    <Box component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      Invitado el {formatFecha(inv.invitedAt)}
                    </Box>
                  </Box>
                </Box>
                {canManage && (
                  <IconButton
                    size="small"
                    onClick={() => setInvToCancel(inv)}
                    title="Cancelar invitación"
                    sx={{
                      height: 32,
                      width: 32,
                      color: '#ef4444',
                      '&:hover': { color: '#b91c1c', bgcolor: '#fef2f2' },
                    }}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* ── Modal: Invitar usuario ──────────────────────────────────────────────── */}
      <Dialog
        open={showInvitar}
        onClose={() => resetInviteModal()}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UserPlus style={{ width: 20, height: 20, color: '#3658e1' }} />
          Invitar usuario
        </DialogTitle>

        {inviteUrl ? (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                bgcolor: '#eef2fe',
                border: '1px solid #c7d2fc',
                borderRadius: '12px',
                p: 2,
                textAlign: 'center',
              }}
            >
              <CheckCheck style={{ width: 32, height: 32, color: '#3658e1', margin: '0 auto 8px' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#253a9e' }}>
                ¡Invitación creada!
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#3658e1', mt: 0.5 }}>
                Comparte este enlace con <strong>{invEmail}</strong>:
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                value={inviteUrl}
                slotProps={{
                  input: {
                    readOnly: true,
                    sx: { fontSize: '0.75rem', fontFamily: 'monospace', bgcolor: '#f9fafb' },
                  },
                }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={copyInviteUrl}
                sx={{
                  minWidth: 40,
                  textTransform: 'none',
                  color: copied ? '#3658e1' : '#374151',
                  borderColor: copied ? '#a5b4f9' : '#d1d5db',
                  '&:hover': { borderColor: copied ? '#a5b4f9' : '#9ca3af' },
                }}
              >
                {copied
                  ? <CheckCheck style={{ width: 16, height: 16 }} />
                  : <Copy style={{ width: 16, height: 16 }} />}
              </Button>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
              El enlace es válido hasta que el usuario se registre con ese correo
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                onClick={resetInviteModal}
                sx={{
                  textTransform: 'none',
                  color: '#374151',
                  borderColor: '#d1d5db',
                  '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
                }}
              >
                Cerrar
              </Button>
            </Box>
          </DialogContent>
        ) : (
          <>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {invError && (
                <Box
                  sx={{
                    bgcolor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    p: 1.5,
                  }}
                >
                  {invError}
                </Box>
              )}

              <TextField
                id="inv-email"
                label="Correo electrónico"
                type="email"
                size="small"
                fullWidth
                placeholder="usuario@empresa.com"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvitar()}
                disabled={invitando}
                autoFocus
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <FormControl size="small" fullWidth disabled={invitando}>
                <InputLabel id="inv-role-label" shrink>Rol</InputLabel>
                <Select
                  labelId="inv-role-label"
                  id="inv-role"
                  label="Rol"
                  value={invRole}
                  onChange={(e) => setInvRole(e.target.value)}
                  displayEmpty
                >
                  {(data?.roles ?? []).filter(r => r.key !== 'owner').map(r => {
                    const cfg = resolveRoleCfg(r.key, data?.roles);
                    const Icon = cfg.icon;
                    return (
                      <MenuItem key={r.key} value={r.key}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Icon style={{ width: 14, height: 14 }} />
                          <Box component="span">{cfg.label}</Box>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
                {invRole && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.75 }}>
                    {resolveRoleCfg(invRole, data?.roles).descripcion}
                  </Typography>
                )}
                {/* Acceso a módulos que otorga el rol elegido — así el owner ve
                    de una si el empleado entra a POS, Facturación o ambos. */}
                {(() => {
                  const m = modulosDeRol(invRole);
                  if (!m) return null;
                  const chips = [
                    ...(m.facturacion ? [{ label: 'Facturación', bg: '#eff6ff', fg: '#1d4ed8' }] : []),
                    ...(m.pos ? [{ label: 'Punto de Venta', bg: '#eef2fe', fg: '#2a45c4' }] : []),
                  ];
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Acceso:</Typography>
                      {chips.length === 0
                        ? <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>Ningún módulo</Typography>
                        : chips.map(c => (
                            <Box key={c.label} component="span" sx={{ fontSize: '0.6875rem', fontWeight: 600, px: 0.875, py: '2px', borderRadius: '6px', bgcolor: c.bg, color: c.fg }}>{c.label}</Box>
                          ))}
                    </Box>
                  );
                })()}
              </FormControl>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                variant="outlined"
                onClick={resetInviteModal}
                disabled={invitando}
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
                variant="contained"
                onClick={handleInvitar}
                disabled={invitando || !invEmail.trim()}
                startIcon={
                  invitando
                    ? <CircularProgress size={16} color="inherit" />
                    : <UserPlus style={{ width: 16, height: 16 }} />
                }
                sx={{
                  textTransform: 'none',
                  bgcolor: '#3658e1',
                  color: '#fff',
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#2a45c4', boxShadow: 'none' },
                }}
              >
                {invitando ? 'Invitando…' : 'Enviar invitación'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Modal: Confirmar eliminación de miembro ────────────────────────────── */}
      <Dialog
        open={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#dc2626' }}>
          <AlertTriangle style={{ width: 20, height: 20 }} />
          {memberToRemove?.userId === data.myUserId ? '¿Salir del equipo?' : '¿Eliminar miembro?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {memberToRemove?.userId === data.myUserId
              ? 'Perderás acceso a todos los datos de esta empresa.'
              : <>
                  <strong>{memberToRemove?.name ?? memberToRemove?.email}</strong> perderá
                  acceso a todos los datos de la empresa. Esta acción no se puede deshacer.
                </>
            }
          </Typography>
          {removeError && (
            <Box
              sx={{
                bgcolor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.875rem',
                borderRadius: '8px',
                p: 1.5,
                mt: 1.5,
              }}
            >
              {removeError}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setMemberToRemove(null)}
            disabled={removing}
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
            variant="contained"
            onClick={handleRemove}
            disabled={removing}
            startIcon={
              removing
                ? <CircularProgress size={16} color="inherit" />
                : undefined
            }
            sx={{
              textTransform: 'none',
              bgcolor: '#dc2626',
              color: '#fff',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
            }}
          >
            {removing ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Modal: Confirmar cancelación de invitación ─────────────────────────── */}
      <Dialog
        open={!!invToCancel}
        onClose={() => setInvToCancel(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle style={{ width: 20, height: 20, color: '#f59e0b' }} />
          ¿Cancelar invitación?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
            La invitación para <strong>{invToCancel?.email}</strong> será cancelada y
            el enlace de registro dejará de funcionar.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setInvToCancel(null)}
            disabled={cancelling}
            sx={{
              textTransform: 'none',
              color: '#374151',
              borderColor: '#d1d5db',
              '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
            }}
          >
            No, mantener
          </Button>
          <Button
            variant="contained"
            onClick={handleCancelInvite}
            disabled={cancelling}
            startIcon={
              cancelling
                ? <CircularProgress size={16} color="inherit" />
                : undefined
            }
            sx={{
              textTransform: 'none',
              bgcolor: '#dc2626',
              color: '#fff',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
            }}
          >
            {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
