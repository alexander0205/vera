'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { ZeroLoader } from '@/components/zero-loader';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import {
  Building2, Plus, Check, ArrowRight, Loader2,
  CreditCard, Crown, AlertCircle,
} from 'lucide-react';

interface Empresa {
  id: number;
  name: string;
  rnc: string | null;
  razonSocial: string | null;
  nombreComercial: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  role: string;
  logo: string | null;
}

interface Props {
  empresas: Empresa[];
  activeTeamId: number | null;
}

function planBadge(planName: string | null, status: string | null): { label: string; bgcolor: string; color: string; border: string } {
  const s = status?.toLowerCase();
  if (status === 'admin')
    return { label: 'Admin', bgcolor: '#ecfdf5', color: '#065f46', border: '#6ee7b7' };
  if (!planName || planName.toLowerCase() === 'gratis')
    return { label: 'Sin plan', bgcolor: '#f3f4f6', color: '#4b5563', border: '#d1d5db' };
  if (s === 'trialing')
    return { label: `${planName} · Trial`, bgcolor: '#fffbeb', color: '#92400e', border: '#fde68a' };
  if (s === 'canceled' || s === 'unpaid')
    return { label: `${planName} · Cancelado`, bgcolor: '#fef2f2', color: '#991b1b', border: '#fca5a5' };
  const plan = planName.toLowerCase();
  if (plan === 'pro')      return { label: planName, bgcolor: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' };
  if (plan === 'business') return { label: planName, bgcolor: '#eef2fe', color: '#2a45c4', border: '#c7d2fc' };
  return { label: planName, bgcolor: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
}

function hasActivePlan(planName: string | null, status: string | null) {
  if (status === 'admin') return true;
  if (!planName || planName.toLowerCase() === 'gratis') return false;
  const s = status?.toLowerCase();
  return s === 'active' || s === 'trialing';
}

export function EmpresasClient({ empresas, activeTeamId }: Props) {
  const router = useRouter();
  const [showCrear, setShowCrear] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);
  const [cambiandoA, setCambiandoA] = useState<string | null>(null);

  // Red de seguridad: que el loader no se quede pegado tapando la app.
  useEffect(() => {
    if (!cambiandoA) return;
    const t = setTimeout(() => setCambiandoA(null), 15000);
    return () => clearTimeout(t);
  }, [cambiandoA]);

  const [razonSocial, setRazonSocial]         = useState('');
  const [rnc, setRnc]                         = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [creando, setCreando]                 = useState(false);
  const [crearError, setCrearError]           = useState<string | null>(null);

  async function handleSwitch(teamId: number) {
    if (teamId === activeTeamId) return;
    setSwitching(teamId);
    const destino = empresas.find(e => e.id === teamId);
    setCambiandoA(destino?.razonSocial ?? destino?.name ?? null);
    try {
      await fetch('/api/empresa/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      // El loader se queda puesto a propósito: la navegación tarda y taparlo
      // es justo el punto. Lo baja el unmount al cambiar de página, o el
      // timeout de seguridad si algo se cuelga.
      router.push('/dashboard'); router.refresh();
    } catch {
      setCambiandoA(null);
    } finally { setSwitching(null); }
  }

  async function handleCrear() {
    setCrearError(null); setCreando(true);
    try {
      const res  = await fetch('/api/empresa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razonSocial, rnc, nombreComercial: nombreComercial || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error creando empresa');
      router.push(BILLING_ENABLED ? '/pricing?new_company=1' : '/dashboard');
    } catch (e) {
      setCrearError(e instanceof Error ? e.message : 'Error desconocido');
      setCreando(false);
    }
  }

  function resetCrear() {
    setShowCrear(false); setRazonSocial(''); setRnc(''); setNombreComercial(''); setCrearError(null);
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      <ZeroLoader open={!!cambiandoA} subtitulo={cambiandoA ? `Abriendo ${cambiandoA}` : undefined} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Building2 size={22} color="#3658e1" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Mis empresas</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'} — cada una tiene su propio plan y facturación
          </Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<Plus size={18} />} onClick={() => setShowCrear(true)}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
          Nueva empresa
        </Button>
      </Box>

      {/* Lista de empresas */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {empresas.map(empresa => {
          const isActive  = empresa.id === activeTeamId;
          const isOwner   = empresa.role === 'owner';
          const hasPlan   = hasActivePlan(empresa.planName, empresa.subscriptionStatus);
          const badge     = planBadge(empresa.planName, empresa.subscriptionStatus);
          const isLoading = switching === empresa.id;

          return (
            <Box key={empresa.id} sx={{
              display: 'flex', alignItems: 'center', gap: 2, p: 2.5, borderRadius: '12px', border: '1px solid', transition: 'all 0.15s',
              borderColor: isActive ? '#3658e1' : '#e5e7eb',
              bgcolor: isActive ? '#eef2feCC' : '#fff',
              '&:hover': { borderColor: isActive ? '#3658e1' : '#d1d5db' },
            }}>
              {/* Avatar */}
              {empresa.logo ? (
                <img src={empresa.logo} alt={empresa.razonSocial ?? empresa.name}
                  style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <Box sx={{
                  height: 48, width: 48, borderRadius: '12px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: '1.125rem',
                  bgcolor: isActive ? '#3658e1' : '#f3f4f6', color: isActive ? '#fff' : '#6b7280',
                }}>
                  {(empresa.razonSocial ?? empresa.name)?.[0]?.toUpperCase() ?? 'E'}
                </Box>
              )}

              {/* Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {empresa.razonSocial ?? empresa.name}
                  </Typography>
                  {isActive && (
                    <Chip label="Activa" size="small" sx={{ bgcolor: '#eef2fe', color: '#2a45c4', border: '1px solid #c7d2fc', fontSize: '0.6875rem', height: 20 }} />
                  )}
                  {isOwner && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#d97706' }}>
                      <Crown size={12} />
                      <Typography sx={{ fontSize: '0.75rem', color: '#d97706' }}>Propietario</Typography>
                    </Box>
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {empresa.rnc && (
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                      RNC {empresa.rnc}
                    </Typography>
                  )}
                  {/* Badge del plan solo con billing activo (lib/config/billing). */}
                  {BILLING_ENABLED && (
                    <Chip label={badge.label} size="small" sx={{ bgcolor: badge.bgcolor, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '0.6875rem', height: 20, fontWeight: 500 }} />
                  )}
                </Box>
              </Box>

              {/* Acciones */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                {BILLING_ENABLED && isOwner && !hasPlan && (
                  <Button variant="outlined" size="small"
                    startIcon={<CreditCard size={14} />}
                    onClick={async () => {
                      if (!isActive) await fetch('/api/empresa/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: empresa.id }) });
                      router.push('/pricing?reason=no-plan');
                    }}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#c7d2fc', color: '#2a45c4', '&:hover': { bgcolor: '#eef2fe', borderColor: '#3658e1' } }}>
                    Elegir plan
                  </Button>
                )}
                {BILLING_ENABLED && isOwner && hasPlan && (
                  <Button variant="text" size="small"
                    startIcon={<CreditCard size={14} />}
                    onClick={async () => {
                      if (!isActive) await fetch('/api/empresa/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: empresa.id }) });
                      router.push('/dashboard/suscripcion');
                    }}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f9fafb' } }}>
                    Suscripción
                  </Button>
                )}
                {!isActive && (
                  <Button variant="contained" disableElevation size="small"
                    onClick={() => handleSwitch(empresa.id)} disabled={isLoading}
                    endIcon={isLoading ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <ArrowRight size={14} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
                    {isLoading ? '' : 'Cambiar'}
                  </Button>
                )}
                {isActive && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#3658e1', pr: 0.5 }}>
                    <Check size={16} />
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#3658e1' }}>Usando</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Info footer */}
      <Alert severity="info" icon={<AlertCircle size={16} />} sx={{ borderRadius: '12px', fontSize: '0.75rem' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e40af' }}>
          Cada empresa tiene su propio plan y facturación
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#1d4ed8', mt: 0.25 }}>
          Puedes tener tantas empresas como necesites. Cada una paga su plan de forma independiente.
        </Typography>
      </Alert>

      {/* Modal: Crear empresa */}
      <Dialog open={showCrear} onClose={() => { if (!creando) resetCrear(); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 440 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Building2 size={20} color="#3658e1" />
          Nueva empresa
        </DialogTitle>
        <DialogContentText sx={{ px: 3, pb: 1, color: '#6b7280', fontSize: '0.875rem' }}>
          Al crear la empresa podrás elegir su plan de inmediato.
        </DialogContentText>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {crearError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{crearError}</Alert>}
          <TextField label="Razón social *" size="small" fullWidth placeholder="Ej: Soluciones SRL"
            value={razonSocial} onChange={e => setRazonSocial(e.target.value)} disabled={creando} autoFocus
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
          <Box>
            <TextField label="RNC *" size="small" fullWidth placeholder="9-11 dígitos"
              value={rnc} onChange={e => setRnc(e.target.value.replace(/\D/g, ''))}
              slotProps={{ htmlInput: { maxLength: 11 } }} disabled={creando}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.5 }}>Solo números, sin guiones</Typography>
          </Box>
          <TextField label="Nombre comercial (opcional)" size="small" fullWidth placeholder="Nombre que aparece en las facturas"
            value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} disabled={creando}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
          <Alert severity="info" icon={<CreditCard size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
            Al continuar, te redirigiremos a elegir el plan para esta empresa. Incluye <strong>15 días de prueba gratis</strong>.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={resetCrear} disabled={creando}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation onClick={handleCrear}
            disabled={creando || !razonSocial.trim() || rnc.length < 9}
            startIcon={creando ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            endIcon={!creando ? <ArrowRight size={16} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
            {creando ? 'Creando…' : 'Crear y elegir plan'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
