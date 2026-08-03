'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import { Building2, ChevronDown } from 'lucide-react';
import { ProvinciaMunicipioSelect } from '@/components/provincia-municipio-select';

interface Form {
  razonSocial: string;
  rnc: string;
  nombreComercial: string;
  telefono: string;
  direccion: string;
  provincia: string;
  municipio: string;
  actividadEconomica: string;
  cedulaRepresentante: string;
  nombreRepresentante: string;
  correoRepresentante: string;
}

const EMPTY: Form = {
  razonSocial: '', rnc: '', nombreComercial: '', telefono: '', direccion: '',
  provincia: '', municipio: '', actividadEconomica: '',
  cedulaRepresentante: '', nombreRepresentante: '', correoRepresentante: '',
};

export function OnboardingNegocioForm() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRep, setShowRep] = useState(false);

  // Prefill con lo que ya tenga el team (por si vuelve a este paso).
  useEffect(() => {
    fetch('/api/equipo/perfil')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        setForm(f => ({
          ...f,
          razonSocial: d.razonSocial ?? '',
          rnc: d.rnc ?? '',
          nombreComercial: d.nombreComercial ?? '',
          telefono: d.telefono ?? '',
          direccion: d.direccion ?? '',
          provincia: d.provincia ?? '',
          municipio: d.municipio ?? '',
          actividadEconomica: d.actividadEconomica ?? '',
          cedulaRepresentante: d.cedulaRepresentante ?? '',
          nombreRepresentante: d.nombreRepresentante ?? '',
          correoRepresentante: d.correoRepresentante ?? '',
        }));
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const rncValido = /^\d{9}$|^\d{11}$/.test(form.rnc.trim());
  const puedeGuardar = form.razonSocial.trim().length >= 2 && rncValido && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/equipo/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar el negocio');
      router.push('/pricing?welcome=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setSaving(false);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', py: { xs: 4, sm: 8 }, px: 2 }}>
      <Box component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 560, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', p: { xs: 3, sm: 4 }, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={22} color="#0d9488" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#0d9488', fontWeight: 600 }}>Paso 2 de 3</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Registra tu negocio</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 3 }}>
          Estos datos identifican tu empresa en las facturas. Luego eliges tu plan.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField label="Razón social" required value={form.razonSocial} onChange={set('razonSocial')} size="small" fullWidth />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="RNC o Cédula" required value={form.rnc} onChange={set('rnc')} size="small" fullWidth
              error={form.rnc.length > 0 && !rncValido}
              helperText={form.rnc.length > 0 && !rncValido ? '9 dígitos (RNC) u 11 (cédula)' : ' '}
            />
            <TextField label="Nombre comercial" value={form.nombreComercial} onChange={set('nombreComercial')} size="small" fullWidth />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Teléfono" value={form.telefono} onChange={set('telefono')} size="small" fullWidth />
            <TextField label="Actividad económica" value={form.actividadEconomica} onChange={set('actividadEconomica')} size="small" fullWidth />
          </Box>
          <TextField label="Dirección" value={form.direccion} onChange={set('direccion')} size="small" fullWidth />
          <ProvinciaMunicipioSelect
            provincia={form.provincia}
            municipio={form.municipio}
            onProvinciaChange={(codigo) => setForm(f => ({ ...f, provincia: codigo }))}
            onMunicipioChange={(codigo) => setForm(f => ({ ...f, municipio: codigo }))}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
          />

          <Button
            type="button" onClick={() => setShowRep(s => !s)}
            sx={{ justifyContent: 'space-between', color: '#374151', textTransform: 'none', px: 0 }}
            endIcon={<ChevronDown size={16} style={{ transform: showRep ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
          >
            Representante legal (opcional — requerido para la DGII)
          </Button>
          <Collapse in={showRep}>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Nombre del representante" value={form.nombreRepresentante} onChange={set('nombreRepresentante')} size="small" fullWidth />
                <TextField label="Cédula del representante" value={form.cedulaRepresentante} onChange={set('cedulaRepresentante')} size="small" fullWidth />
              </Box>
              <TextField label="Correo del representante" type="email" value={form.correoRepresentante} onChange={set('correoRepresentante')} size="small" fullWidth />
            </Box>
          </Collapse>
        </Box>

        <Button
          type="submit" variant="contained" disabled={!puedeGuardar} fullWidth
          sx={{ mt: 3, py: 1.25, borderRadius: '99px', textTransform: 'none', fontWeight: 600, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          {saving ? 'Guardando…' : 'Continuar a elegir plan'}
        </Button>
      </Box>
    </Box>
  );
}
