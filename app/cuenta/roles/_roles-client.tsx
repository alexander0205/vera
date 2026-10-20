'use client';

import { useState, useMemo, useCallback, useId, type ElementType, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import {
  Crown, Shield, User, Eye, UserCog, Plus, Lock, Trash2,
  Check, Pencil, AlertTriangle, KeyRound, Users as UsersIcon, SlidersHorizontal, Columns3,
  FileText, Package, FileSpreadsheet, ShoppingCart, BarChart3,
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
import { usePermissions } from '@/lib/hooks/usePermissions';
import { MODULOS, type ModuloId } from '@/lib/config/pantallas';
import {
  MatrizPantallas, ModuloDelRol, ResumenGobernanza, useGobernanza,
  pantallasVisibles, accionesActivas,
  type DatosGobernanza,
} from '@/components/gobernanza/Gobernanza';

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
  FileText, Users: UsersIcon, Package, FileSpreadsheet, ShoppingCart, BarChart3,
  Wallet, Settings, CreditCard,
};
function Icon({ name, style }: { name: string | null; style?: React.CSSProperties }) {
  const C = (name && ICONS[name]) || UserCog;
  return <C style={style} aria-hidden />;
}

const AZUL = '#3658e1';
const AZUL_OSCURO = '#2a45c4';
const AZUL_SUAVE = '#eef2fe';

/** Cada rol de sistema tiene su color: se reconoce de un vistazo en la lista. */
const ACENTOS: Record<string, { fondo: string; tinta: string }> = {
  owner: { fondo: '#fef3c7', tinta: '#b45309' },
  admin: { fondo: '#ede9fe', tinta: '#6d28d9' },
  user: { fondo: '#d1fae5', tinta: '#047857' },
  lector: { fondo: '#e0f2fe', tinta: '#0369a1' },
  cajero: { fondo: '#ccfbf1', tinta: '#0f766e' },
  'personal-escolar': { fondo: '#e0e7ff', tinta: '#4338ca' },
};
const ACENTO_PROPIO = { fondo: AZUL_SUAVE, tinta: AZUL_OSCURO };
const acentoDe = (key: string) => ACENTOS[key] ?? ACENTO_PROPIO;

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

type Vista = 'rol' | 'comparar';

export default function RolesClient() {
  const { data, isLoading, mutate } = useSWR<Data>('/api/equipo/permisos', fetcher);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>('rol');
  const [showCreate, setShowCreate] = useState(false);
  const { modules } = usePermissions();
  // Los módulos de gobernanza que tiene esta empresa (y a los que ella entra).
  const modulosEmpresa = useMemo(
    () => MODULOS.map(m => m.id).filter(id => (modules as string[]).includes(id)),
    [modules],
  );
  const { data: gobernanza } = useGobernanza(modulosEmpresa.length > 0);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, color: '#64748b' }}>
        <CircularProgress size={20} color="inherit" aria-label="Cargando roles" />
      </Box>
    );
  }
  if (!data) {
    return (
      <Box sx={{ py: 10, textAlign: 'center', color: '#64748b' }}>
        No se pudieron cargar los roles.
      </Box>
    );
  }

  // Siempre hay un rol a la vista: el que se eligió o el primero.
  const activo = data.roles.find(r => r.id === selectedId) ?? data.roles[0];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      {/* Cabecera */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a' }}>
            Roles y permisos
          </Typography>
          <Typography sx={{ fontSize: '0.9375rem', color: '#64748b' }}>
            Decide qué módulos, pantallas y acciones tiene cada rol. Aplica solo a tu empresa.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {modulosEmpresa.length > 0 && (
            <Box role="group" aria-label="Vista" sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#f1f5f9', borderRadius: '12px' }}>
              {([['rol', 'Por rol', SlidersHorizontal], ['comparar', 'Comparar roles', Columns3]] as const).map(([id, texto, Ic]) => (
                <ButtonBase
                  key={id}
                  aria-pressed={vista === id}
                  onClick={() => setVista(id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.75, borderRadius: '9px',
                    fontSize: '0.875rem', fontWeight: 600,
                    color: vista === id ? '#0f172a' : '#64748b',
                    bgcolor: vista === id ? '#fff' : 'transparent',
                    boxShadow: vista === id ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
                  }}
                >
                  <Ic size={15} aria-hidden />{texto}
                </ButtonBase>
              ))}
            </Box>
          )}
          <Button
            onClick={() => setShowCreate(true)}
            variant="contained"
            startIcon={<Plus style={{ width: 16, height: 16 }} aria-hidden />}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', bgcolor: AZUL, color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: AZUL_OSCURO, boxShadow: 'none' } }}
          >
            Nuevo rol
          </Button>
        </Box>
      </Box>

      {vista === 'comparar' && modulosEmpresa.length > 0 ? (
        <MatrizPantallas
          modulosEmpresa={modulosEmpresa}
          onAbrirRol={id => { setSelectedId(id); setVista('rol'); }}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: '300px minmax(0,1fr)' }, alignItems: 'start' }}>
          <Box component="nav" aria-label="Roles" sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: { md: 'sticky' }, top: { md: 16 } }}>
            <RolesNav
              roles={data.roles}
              activoId={activo.id}
              onSelect={setSelectedId}
              gobernanza={modulosEmpresa.length > 0 ? gobernanza : undefined}
            />
            <MiPinCard />
          </Box>
          <RolePanel
            key={activo.id}
            role={activo}
            catalog={data.catalog}
            modulosEmpresa={modulosEmpresa}
            onSaved={() => mutate()}
            onDeleted={() => { setSelectedId(null); mutate(); }}
          />
        </Box>
      )}

      {showCreate && (
        <CreateRoleDialog
          roles={data.roles}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); mutate(); setSelectedId(id); setVista('rol'); }}
        />
      )}
    </Box>
  );
}

// ─── Lista de roles (columna izquierda) ───────────────────────────────────────
function RolesNav({ roles, activoId, onSelect, gobernanza }: {
  roles: Role[];
  activoId: number;
  onSelect: (id: number) => void;
  /** Lo que cada rol ve y puede hacer por módulo; solo si la empresa tiene alguno. */
  gobernanza?: DatosGobernanza;
}) {
  return (
    <Box
      component="ul"
      sx={{
        m: 0, p: 0, listStyle: 'none', display: 'flex', gap: 1,
        flexDirection: { xs: 'row', md: 'column' },
        overflowX: { xs: 'auto', md: 'visible' },
        pb: { xs: 1, md: 0 },
      }}
    >
      {roles.map(r => {
        const acento = acentoDe(r.key);
        const activo = r.id === activoId;
        const rg = gobernanza?.roles.find(x => x.id === r.id);
        return (
          <Box component="li" key={r.id} sx={{ flexShrink: 0, minWidth: { xs: 240, md: 0 } }}>
            <ButtonBase
              onClick={() => onSelect(r.id)}
              aria-current={activo ? 'true' : undefined}
              sx={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left',
                p: 1.5, borderRadius: '14px',
                border: '1px solid', borderColor: activo ? '#c7d2fe' : '#e5e7eb',
                bgcolor: activo ? '#f5f7ff' : '#fff',
                boxShadow: activo ? '0 1px 3px rgba(54,88,225,0.14)' : 'none',
                position: 'relative', overflow: 'hidden',
                transition: 'background-color .15s, border-color .15s',
                '&:hover': { bgcolor: activo ? '#f5f7ff' : '#f8fafc', borderColor: activo ? '#c7d2fe' : '#cbd5e1' },
                '&::before': activo ? { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: AZUL } : undefined,
              }}
            >
              <Box component="span" sx={{ display: 'flex', height: 40, width: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '12px', bgcolor: acento.fondo, color: acento.tinta }}>
                <Icon name={r.icon} style={{ width: 19, height: 19 }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </Box>
                  {r.key === 'owner' && <Lock size={13} style={{ color: '#64748b', flexShrink: 0 }} aria-label="No editable" />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: '#64748b' }}>
                  <UsersIcon size={12} aria-hidden />
                  {r.memberCount} {r.memberCount === 1 ? 'usuario' : 'usuarios'}
                  {!r.isSystem && <Box component="span" sx={{ ml: 0.5, px: 0.75, borderRadius: '9999px', bgcolor: AZUL_SUAVE, color: AZUL_OSCURO, fontWeight: 600 }}>propio</Box>}
                </Box>
                {rg && gobernanza && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    <ResumenGobernanza rol={rg} modulos={gobernanza.modulos} />
                  </Box>
                )}
              </Box>
            </ButtonBase>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Mi PIN de autorización POS ──────────────────────────────────────────────
// Un supervisor (admin/owner) fija aquí su PIN. Con él, un cajero puede quitar
// un ítem de un recibo ya cobrado (permiso pos:quitar-item-pin).
function MiPinCard() {
  const { data, mutate } = useSWR<{ tienePin: boolean }>('/api/pos/mi-pin', fetcher);
  const [editando, setEditando] = useState(false);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = /^\d{4,6}$/.test(pin);

  async function guardar(nuevo: string | null) {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/pos/mi-pin', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: nuevo }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Error al guardar');
      setEditando(false); setPin('');
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '14px', p: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <Box sx={{ display: 'flex', height: 36, width: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', bgcolor: AZUL_SUAVE }}>
          <KeyRound style={{ width: 18, height: 18, color: AZUL_OSCURO }} aria-hidden />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>Mi PIN del POS</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
            Con tu PIN autorizas que un cajero quite un ítem de un recibo ya cobrado.
            {data && (
              <Box component="span" sx={{ ml: 0.5, fontWeight: 700, color: data.tienePin ? '#047857' : '#64748b' }}>
                {data.tienePin ? '· Configurado' : '· Sin configurar'}
              </Box>
            )}
          </Typography>

          {editando ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              <TextField
                autoFocus size="small" type="password" inputMode="numeric" label="Nuevo PIN (4–6 dígitos)"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                sx={{ width: 190 }}
              />
              <Button onClick={() => guardar(pin)} disabled={!valido || saving} variant="contained" size="small"
                sx={{ textTransform: 'none', bgcolor: AZUL, boxShadow: 'none', '&:hover': { bgcolor: AZUL_OSCURO, boxShadow: 'none' }, '&.Mui-disabled': { bgcolor: AZUL, opacity: 0.5, color: '#fff' } }}>
                {saving ? 'Guardando…' : 'Guardar PIN'}
              </Button>
              <Button onClick={() => { setEditando(false); setPin(''); setError(null); }} disabled={saving} variant="outlined" size="small"
                sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>
                Cancelar
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
              <Button onClick={() => setEditando(true)} variant="outlined" size="small"
                sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>
                {data?.tienePin ? 'Cambiar PIN' : 'Configurar PIN'}
              </Button>
              {data?.tienePin && (
                <Button onClick={() => guardar(null)} disabled={saving} variant="outlined" size="small"
                  sx={{ textTransform: 'none', color: '#b91c1c', borderColor: '#fecaca' }}>
                  Quitar
                </Button>
              )}
            </Box>
          )}
          {error && <Typography role="alert" sx={{ fontSize: '0.75rem', color: '#b91c1c', mt: 1 }}>{error}</Typography>}
        </Box>
      </Box>
    </Paper>
  );
}

// ─── Panel de un rol (columna derecha) ────────────────────────────────────────

type IdPestana = ModuloId | 'otros';

function RolePanel({ role, catalog, modulosEmpresa, onSaved, onDeleted }: {
  role: Role;
  catalog: PermGroup[];
  /** Los módulos de gobernanza de la empresa: cada uno trae su pestaña. */
  modulosEmpresa: ModuloId[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isOwner = role.key === 'owner';
  const acento = acentoDe(role.key);
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role.permissions));
  const [label, setLabel] = useState(role.label);
  const [editingLabel, setEditingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modulos = useMemo(() => MODULOS.filter(m => modulosEmpresa.includes(m.id)), [modulosEmpresa]);
  const [elegida, setPestana] = useState<IdPestana | null>(null);
  const idBase = useId();
  const { data: gob } = useGobernanza(modulos.length > 0);
  const rg = gob?.roles.find(r => r.id === role.id);

  // Con módulos, sus permisos viven en su pestaña: en «Otros permisos» no se
  // repiten. Siguen en `perms`, así que al guardar no se pierden.
  const catalogVisible = useMemo(() => {
    if (modulos.length === 0) return catalog;
    const sueltos = new Set<string>(
      modulos.flatMap(m => [
        ...m.acceso,
        ...m.acciones.map(a => a.permiso),
        ...m.pantallas.flatMap(p => (p.permiso ? [p.permiso] : [])),
      ]),
    );
    return catalog
      .map(g => ({ ...g, permissions: g.permissions.filter(p => !sueltos.has(p.key)) }))
      .filter(g => g.permissions.length > 0);
  }, [catalog, modulos]);
  const activosOtros = catalogVisible.reduce(
    (n, g) => n + g.permissions.filter(p => isOwner || perms.has(p.key)).length, 0,
  );
  const totalOtros = catalogVisible.reduce((n, g) => n + g.permissions.length, 0);

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

  // Pestañas: las flechas ← → cambian de una a otra (patrón WAI-ARIA).
  const pestanas: { id: IdPestana; titulo: string; icono: ElementType; cifra: string; detalle: string; progreso: number | null; sinAcceso?: boolean }[] = [
    ...modulos.map(m => {
      const entra = isOwner || (rg ? m.acceso.every(p => rg.permisos.includes(p)) : true);
      const n = rg ? pantallasVisibles(rg, m) : 0;
      const a = rg ? accionesActivas(rg, m) : 0;
      return {
        id: m.id as IdPestana,
        titulo: m.corto,
        icono: m.id === 'escolar' ? Eye : FileText,
        cifra: entra ? `${n} de ${m.pantallas.length}` : 'Sin acceso',
        detalle: entra ? `pantallas · ${a}/${m.acciones.length} acciones` : 'No entra a este módulo',
        progreso: entra ? n / m.pantallas.length : null,
        sinAcceso: !entra,
      };
    }),
    {
      id: 'otros' as IdPestana, titulo: 'Otros permisos', icono: SlidersHorizontal,
      cifra: `${activosOtros}`, detalle: `de ${totalOtros} · POS, reportes, nómina…`,
      progreso: totalOtros ? activosOtros / totalOtros : 0,
    },
  ];
  const pestana: IdPestana = pestanas.find(t => t.id === elegida)?.id ?? pestanas[0].id;
  function teclas(e: KeyboardEvent<HTMLElement>) {
    const i = pestanas.findIndex(t => t.id === pestana);
    const salto = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!salto) return;
    e.preventDefault();
    const sig = pestanas[(i + salto + pestanas.length) % pestanas.length];
    setPestana(sig.id);
    document.getElementById(`${idBase}-tab-${sig.id}`)?.focus();
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
      {/* Encabezado del rol */}
      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '18px', p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ display: 'flex', height: 56, width: 56, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '16px', bgcolor: acento.fondo, color: acento.tinta }}>
          <Icon name={role.icon} style={{ width: 26, height: 26 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          {editingLabel && !isOwner ? (
            <TextField
              autoFocus
              size="small"
              value={label}
              slotProps={{ htmlInput: { 'aria-label': 'Nombre del rol', maxLength: 60 } }}
              onChange={e => { setLabel(e.target.value); setSaved(false); }}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingLabel(false); }}
              sx={{ width: 260 }}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h2" sx={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a' }}>
                {label}
              </Typography>
              {!isOwner && (
                <IconButton
                  onClick={() => setEditingLabel(true)}
                  size="small"
                  aria-label="Cambiar el nombre del rol"
                  sx={{ color: '#64748b' }}
                >
                  <Pencil size={15} aria-hidden />
                </IconButton>
              )}
              {isOwner && <Lock size={16} style={{ color: '#64748b' }} aria-label="No editable" />}
            </Box>
          )}
          <Typography sx={{ fontSize: '0.875rem', color: '#64748b' }}>
            {isOwner ? 'Acceso completo. No se puede editar.' : role.description ?? (role.isSystem ? 'Rol de sistema: sus permisos se pueden ajustar.' : 'Rol personalizado.')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', fontWeight: 600, px: 1, py: 0.25, borderRadius: '9999px', bgcolor: '#f1f5f9', color: '#475569' }}>
              <UsersIcon size={12} aria-hidden />{role.memberCount} {role.memberCount === 1 ? 'usuario' : 'usuarios'}
            </Box>
            <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, px: 1, py: 0.25, borderRadius: '9999px', bgcolor: role.isSystem ? '#f1f5f9' : AZUL_SUAVE, color: role.isSystem ? '#475569' : AZUL_OSCURO }}>
              {role.isSystem ? 'Rol de sistema' : 'Rol propio'}
            </Box>
            {dirty && (
              <Box component="span" role="status" sx={{ fontSize: '0.75rem', fontWeight: 700, px: 1, py: 0.25, borderRadius: '9999px', bgcolor: '#fef3c7', color: '#92400e' }}>
                Cambios sin guardar
              </Box>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!role.isSystem && (
            <Button
              variant="outlined"
              onClick={() => setConfirmDelete(true)}
              startIcon={<Trash2 style={{ width: 16, height: 16 }} aria-hidden />}
              sx={{ textTransform: 'none', borderRadius: '10px', color: '#b91c1c', borderColor: '#fecaca', '&:hover': { borderColor: '#f87171', bgcolor: '#fef2f2' } }}
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
                  : saved && !dirty ? <Check style={{ width: 16, height: 16 }} aria-hidden />
                  : undefined
              }
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: '10px', minWidth: 140,
                bgcolor: AZUL, color: '#fff', boxShadow: 'none',
                '&:hover': { bgcolor: AZUL_OSCURO, boxShadow: 'none' },
                '&.Mui-disabled': { bgcolor: AZUL, color: '#fff', opacity: 0.45 },
              }}
            >
              {saving ? '' : saved && !dirty ? 'Guardado' : 'Guardar cambios'}
            </Button>
          )}
        </Box>
      </Paper>

      {error && (
        <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '12px', border: '1px solid #fecaca', bgcolor: '#fef2f2', px: 1.5, py: 1, fontSize: '0.875rem', color: '#b91c1c' }}>
          <AlertTriangle style={{ width: 16, height: 16 }} aria-hidden /> {error}
        </Box>
      )}

      {/* Pestañas-resumen: cada una dice cuánto tiene este rol de ese módulo. */}
      <Box
        role="tablist"
        aria-label="Qué configurar de este rol"
        onKeyDown={teclas}
        sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: `repeat(${pestanas.length}, minmax(0,1fr))` } }}
      >
        {pestanas.map(t => {
          const activa = t.id === pestana;
          const Ic = t.icono;
          return (
            <ButtonBase
              key={t.id}
              id={`${idBase}-tab-${t.id}`}
              role="tab"
              aria-selected={activa}
              aria-controls={`${idBase}-panel-${t.id}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => setPestana(t.id)}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, textAlign: 'left',
                p: 1.75, borderRadius: '16px', border: '1px solid',
                borderColor: activa ? AZUL : '#e5e7eb',
                bgcolor: activa ? '#f5f7ff' : '#fff',
                boxShadow: activa ? `0 0 0 3px rgba(54,88,225,0.12)` : 'none',
                transition: 'border-color .15s, box-shadow .15s, background-color .15s',
                '&:hover': { borderColor: activa ? AZUL : '#cbd5e1' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: activa ? AZUL_OSCURO : '#475569', fontSize: '0.8125rem', fontWeight: 700 }}>
                <Ic size={15} aria-hidden />{t.titulo}
              </Box>
              <Typography sx={{ fontSize: '1.375rem', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: t.sinAcceso ? '#64748b' : '#0f172a' }}>
                {t.cifra}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>{t.detalle}</Typography>
              {t.progreso !== null && (
                <Box aria-hidden sx={{ height: 5, width: '100%', borderRadius: '9999px', bgcolor: '#e2e8f0', overflow: 'hidden', mt: 0.5 }}>
                  <Box sx={{ height: '100%', width: `${Math.round(t.progreso * 100)}%`, bgcolor: activa ? AZUL : '#94a3b8', borderRadius: '9999px', transition: 'width .25s' }} />
                </Box>
              )}
            </ButtonBase>
          );
        })}
      </Box>

      {/* Contenido de la pestaña */}
      {pestanas.map(t => t.id === pestana && (
        <Box key={t.id} role="tabpanel" id={`${idBase}-panel-${t.id}`} aria-labelledby={`${idBase}-tab-${t.id}`} tabIndex={0} sx={{ outline: 'none' }}>
          {t.id === 'otros' ? (
            <OtrosPermisos catalog={catalogVisible} perms={perms} isOwner={isOwner} onToggle={toggle} />
          ) : (
            <ModuloDelRol
              roleId={role.id}
              moduloId={t.id}
              onPermisos={(claves, activo) => {
                // Lo que el panel ya aplicó en el servidor: sin esto, «Guardar
                // cambios» mandaría la copia vieja y lo desharía.
                setPerms(prev => {
                  const next = new Set(prev);
                  for (const k of claves) { if (activo) next.add(k); else next.delete(k); }
                  return next;
                });
                onSaved();
              }}
            />
          )}
        </Box>
      ))}

      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(false)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '18px' } } }}>
          <DialogTitle>Borrar rol &ldquo;{role.label}&rdquo;</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: '0.875rem', color: '#475569' }}>
              {role.memberCount > 0
                ? `${role.memberCount} usuario(s) con este rol pasarán a Vendedor.`
                : 'Esta acción no se puede deshacer.'}
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setConfirmDelete(false)}
              sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db', '&:hover': { borderColor: '#64748b', bgcolor: '#f9fafb' } }}
            >
              Cancelar
            </Button>
            <Button
              onClick={doDelete}
              disabled={saving}
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Trash2 style={{ width: 16, height: 16 }} aria-hidden />}
              sx={{ textTransform: 'none', bgcolor: '#dc2626', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' } }}
            >
              Borrar rol
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

// ─── Otros permisos ───────────────────────────────────────────────────────────
function OtrosPermisos({ catalog, perms, isOwner, onToggle }: {
  catalog: PermGroup[];
  perms: Set<string>;
  isOwner: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>Otros permisos</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#64748b' }}>
          POS, reportes, contabilidad, nómina, equipo y configuración. Estos se aplican al pulsar «Guardar cambios».
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'repeat(2, minmax(0,1fr))' }, alignItems: 'start' }}>
        {catalog.map(group => (
          <Paper key={group.module} component="section" aria-label={group.module} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid #eef0f4' }}>
              <Box sx={{ display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: AZUL_SUAVE, color: AZUL_OSCURO }}>
                <Icon name={group.icon} style={{ width: 15, height: 15 }} />
              </Box>
              <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{group.module}</Typography>
              <Typography sx={{ ml: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
                {group.permissions.filter(p => isOwner || perms.has(p.key)).length}/{group.permissions.length}
              </Typography>
            </Box>
            <Box>
              {group.permissions.map((p, i) => {
                const on = isOwner || perms.has(p.key);
                return (
                  <Box
                    key={p.key}
                    component="label"
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 0.75,
                      borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                      cursor: isOwner ? 'default' : 'pointer',
                      '&:hover': isOwner ? undefined : { bgcolor: '#f8fafc' },
                      '&:focus-within': { bgcolor: '#f1f5f9' },
                    }}
                  >
                    <Box component="span" sx={{ fontSize: '0.875rem', color: on ? '#0f172a' : '#475569' }}>{p.label}</Box>
                    <Toggle on={on} disabled={isOwner} onClick={() => onToggle(p.key)} etiqueta={p.label} />
                  </Box>
                );
              })}
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

function Toggle({ on, disabled, onClick, etiqueta }: { on: boolean; disabled?: boolean; onClick: () => void; etiqueta?: string }) {
  return (
    <Switch
      checked={on}
      disabled={disabled}
      onChange={onClick}
      slotProps={{ input: { 'aria-label': etiqueta } }}
      disableRipple
      sx={{
        width: 38,
        height: 22,
        padding: 0,
        flexShrink: 0,
        '& .MuiSwitch-switchBase': {
          padding: '2px',
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            color: '#fff',
            '& + .MuiSwitch-track': { backgroundColor: AZUL, borderColor: AZUL, opacity: 1 },
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
          border: '1px solid #cbd5e1',
          backgroundColor: '#e2e8f0',
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
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '18px' } } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Nuevo rol</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '0.875rem', color: '#475569', mb: 2 }}>
          Empieza desde un rol existente y ajusta lo que ve y puede hacer.
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
            error={!!error && !label.trim()}
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
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.75 }}>
              Copia los permisos de ese rol como punto de partida.
            </Typography>
          </FormControl>
          {error && <Typography role="alert" sx={{ fontSize: '0.875rem', color: '#b91c1c' }}>{error}</Typography>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db', '&:hover': { borderColor: '#64748b', bgcolor: '#f9fafb' } }}
        >
          Cancelar
        </Button>
        <Button
          onClick={create}
          disabled={saving}
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Plus style={{ width: 16, height: 16 }} aria-hidden />}
          sx={{ textTransform: 'none', fontWeight: 600, bgcolor: AZUL, color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: AZUL_OSCURO, boxShadow: 'none' } }}
        >
          Crear rol
        </Button>
      </DialogActions>
    </Dialog>
  );
}
