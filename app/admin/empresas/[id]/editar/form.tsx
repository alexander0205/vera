'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { actualizarEmpresa } from './actions';
import { PLANS, FREE_PLAN, type PlanDef } from '@/lib/config/plans';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';

interface CatalogItem { codigo: string; nombre: string; }

interface InitialData {
  teamId:          number;
  rnc:             string;
  razonSocial:     string;
  nombreComercial: string;
  direccion:       string;
  telefono:        string;
  emailFacturacion:string;
  sitioWeb:        string;
  provincia:       string;
  municipio:       string;
  planName:        string; // key lowercase
}

interface Props {
  initial:    InitialData;
  provincias: CatalogItem[];
}

export function EditarEmpresaForm({ initial, provincias }: Props) {
  const [rnc,             setRnc]             = useState(initial.rnc);
  const [razonSocial,     setRazonSocial]     = useState(initial.razonSocial);
  const [nombreComercial, setNombreComercial] = useState(initial.nombreComercial);
  const [direccion,       setDireccion]       = useState(initial.direccion);
  const [telefono,        setTelefono]        = useState(initial.telefono);
  const [emailFact,       setEmailFact]       = useState(initial.emailFacturacion);
  const [sitioWeb,        setSitioWeb]        = useState(initial.sitioWeb);
  const [provincia,       setProvincia]       = useState(initial.provincia);
  const [municipio,       setMunicipio]       = useState(initial.municipio);
  const [municipios,      setMunicipios]      = useState<CatalogItem[]>([]);
  const [loadingMunic,    setLoadingMunic]    = useState(false);
  const [planKey,         setPlanKey]         = useState(initial.planName);

  // Cargar municipios al montar (si ya hay provincia) y al cambiar provincia
  const loadMunicipios = useCallback(async (prov: string, keepMunicipio = false) => {
    if (!prov) { setMunicipios([]); if (!keepMunicipio) setMunicipio(''); return; }
    setLoadingMunic(true);
    try {
      const res  = await fetch(`/api/catalogos/municipios?provincia=${encodeURIComponent(prov)}`);
      const data: CatalogItem[] = await res.json();
      setMunicipios(data);
    } catch { setMunicipios([]); }
    finally { setLoadingMunic(false); }
  }, []);

  // Al montar: carga municipios manteniendo el municipio actual
  useEffect(() => { loadMunicipios(initial.provincia, true); }, []);

  function handleProvincia(val: string) {
    setProvincia(val);
    setMunicipio('');
    loadMunicipios(val, false);
  }

  return (
    <Box
      component="form"
      action={actualizarEmpresa}
      sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}
    >
      <input type="hidden" name="teamId" value={initial.teamId} />

      {/* Datos fiscales */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 2 }}>
          Datos fiscales
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>

          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Razón social <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              name="razonSocial"
              required
              value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              RNC <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              name="rnc"
              required
              value={rnc}
              onChange={e => setRnc(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 11 } }}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontFamily: 'monospace' } }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Nombre comercial
            </Typography>
            <TextField
              name="nombreComercial"
              value={nombreComercial}
              onChange={e => setNombreComercial(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Dirección
            </Typography>
            <TextField
              name="direccion"
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          {/* Provincia */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Provincia
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                name="provincia"
                value={provincia}
                onChange={e => handleProvincia(e.target.value)}
                displayEmpty
                sx={{ borderRadius: '8px' }}
                MenuProps={{ sx: { '& .MuiPaper-root': { borderRadius: '8px' } } }}
              >
                <MenuItem value=""><em style={{ color: '#9ca3af' }}>— Seleccionar —</em></MenuItem>
                {provincias.map(p => (
                  <MenuItem key={p.codigo} value={p.codigo}>{p.nombre}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Municipio */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              Municipio
              {loadingMunic && <CircularProgress size={12} sx={{ color: '#0d9488' }} />}
            </Typography>
            <FormControl size="small" fullWidth disabled={!provincia || loadingMunic}>
              <Select
                name="municipio"
                value={municipio}
                onChange={e => setMunicipio(e.target.value)}
                displayEmpty
                sx={{ borderRadius: '8px' }}
                MenuProps={{ sx: { '& .MuiPaper-root': { borderRadius: '8px' } } }}
              >
                <MenuItem value="">
                  <em style={{ color: '#9ca3af' }}>
                    {!provincia ? 'Selecciona provincia primero' : '— Seleccionar —'}
                  </em>
                </MenuItem>
                {municipios.map(m => (
                  <MenuItem key={m.codigo} value={m.codigo}>{m.nombre}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Teléfono
            </Typography>
            <TextField
              name="telefono"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Email facturación
            </Typography>
            <TextField
              name="emailFacturacion"
              type="email"
              value={emailFact}
              onChange={e => setEmailFact(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Sitio web
            </Typography>
            <TextField
              name="sitioWeb"
              value={sitioWeb}
              onChange={e => setSitioWeb(e.target.value)}
              placeholder="https://empresa.com"
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

        </Box>
      </Box>

      {/* Plan */}
      <input type="hidden" name="planName" value={planKey} />
      <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 1.5 }}>Plan</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)' }, gap: 1 }}>
          <PlanCard plan={FREE_PLAN} selected={planKey === ''} onSelect={() => setPlanKey('')} />
          {PLANS.map(p => (
            <PlanCard key={p.key} plan={p} selected={planKey === p.key} onSelect={() => setPlanKey(p.key)} />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, pt: 1 }}>
        <Button
          type="submit"
          variant="contained"
          disableElevation
          sx={{
            textTransform: 'none',
            borderRadius: '8px',
            bgcolor: '#0d9488',
            fontWeight: 500,
            '&:hover': { bgcolor: '#0f766e' },
          }}
        >
          Guardar cambios
        </Button>
        <Button
          component="a"
          href={`/admin/empresas/${initial.teamId}`}
          variant="text"
          sx={{ textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}
        >
          Cancelar
        </Button>
      </Box>
    </Box>
  );
}

function PlanCard({ plan, selected, onSelect }: { plan: PlanDef; selected: boolean; onSelect: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      sx={{
        position: 'relative', textAlign: 'left', borderRadius: '8px',
        border: `2px solid ${selected ? '#0d9488' : '#e5e7eb'}`,
        bgcolor: selected ? '#f0fdfa' : '#fff',
        px: 1.5, py: 1.25, cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': { borderColor: selected ? '#0d9488' : '#d1d5db' },
      }}
    >
      {selected && (
        <Box sx={{
          position: 'absolute', top: 8, right: 8,
          bgcolor: '#0d9488', borderRadius: '50%', p: '2px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check style={{ width: 12, height: 12, color: '#fff' }} />
        </Box>
      )}
      <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', pr: 2.5 }}>
        {plan.name}
      </Typography>
      <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.25, display: 'block' }}>
        {plan.price === 0 ? 'Sin plan' : `$${plan.price}/mes`}
      </Typography>
      {plan.price > 0 && (
        <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block', lineHeight: 1.3 }}>
          {plan.limits.docs === -1 ? '∞ docs' : `${plan.limits.docs} docs/mes`}
          {' · '}
          {plan.limits.users === -1 ? '∞ usuarios' : `${plan.limits.users} usuario${plan.limits.users !== 1 ? 's' : ''}`}
        </Typography>
      )}
    </Box>
  );
}
