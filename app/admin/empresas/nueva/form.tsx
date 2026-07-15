'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Building2, Check } from 'lucide-react';
import { crearEmpresa } from './actions';
import { PLANS, FREE_PLAN, type PlanDef } from '@/lib/config/plans';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';

interface RncResult {
  rnc:             string;
  nombre:          string;
  nombreComercial: string | null;
  estadoLabel:     string;
}

interface CatalogItem {
  codigo: string;
  nombre: string;
}

interface Props {
  provincias: CatalogItem[];
}

export function NuevaEmpresaForm({ provincias }: Props) {
  // Campos del formulario
  const [rnc,             setRnc]             = useState('');
  const [razonSocial,     setRazonSocial]     = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [direccion,       setDireccion]       = useState('');
  const [telefono,        setTelefono]        = useState('');
  const [emailFact,       setEmailFact]       = useState('');
  const [provincia,       setProvincia]       = useState('');
  const [municipio,       setMunicipio]       = useState('');
  const [municipios,      setMunicipios]      = useState<CatalogItem[]>([]);
  const [loadingMunic,    setLoadingMunic]    = useState(false);
  const [planKey,         setPlanKey]         = useState('');
  const [inviteEmail,     setInviteEmail]     = useState('');

  // Buscador RNC
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<RncResult[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const wrapperRef              = useRef<HTMLDivElement>(null);
  const timer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Cargar municipios al cambiar provincia
  useEffect(() => {
    if (!provincia) { setMunicipios([]); setMunicipio(''); return; }
    setLoadingMunic(true);
    setMunicipio('');
    fetch(`/api/catalogos/municipios?provincia=${encodeURIComponent(provincia)}`)
      .then(r => r.json())
      .then((data: CatalogItem[]) => setMunicipios(data))
      .catch(() => setMunicipios([]))
      .finally(() => setLoadingMunic(false));
  }, [provincia]);

  const buscar = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    // El endpoint exige mínimo 3 caracteres (índice trigram).
    if (q.trim().length < 3) { setResults([]); setOpen(false); return; }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/rnc/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  function seleccionar(r: RncResult) {
    setRnc(r.rnc);
    setRazonSocial(r.nombre);
    setNombreComercial(r.nombreComercial ?? '');
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function limpiarBusqueda() {
    setQuery('');
    setResults([]);
    setOpen(false);
    setRnc('');
    setRazonSocial('');
    setNombreComercial('');
  }

  const rncSeleccionado = !!rnc && !!razonSocial;

  return (
    <Box
      component="form"
      action={crearEmpresa}
      sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}
    >

      {/* ─── Buscador de empresa ──────────────────────────────────────────── */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 1.5 }}>
          Buscar empresa en el padrón DGII
        </Typography>

        {rncSeleccionado ? (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            bgcolor: '#f0fdfa', border: '1px solid #99f6e4',
            borderRadius: '8px', px: 2, py: 1.5,
          }}>
            <Building2 style={{ width: 16, height: 16, color: '#0d9488', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#134e4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {razonSocial}
              </Typography>
              <Typography variant="caption" sx={{ color: '#0d9488', fontFamily: 'monospace' }}>
                RNC {rnc}
              </Typography>
            </Box>
            <Box
              component="button"
              type="button"
              onClick={limpiarBusqueda}
              sx={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d9488', '&:hover': { color: '#0f766e' }, flexShrink: 0, p: 0, display: 'flex' }}
            >
              <X style={{ width: 16, height: 16 }} />
            </Box>
          </Box>
        ) : (
          <Box ref={wrapperRef} sx={{ position: 'relative' }}>
            <TextField
              type="text"
              value={query}
              onChange={e => buscar(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder="Nombre o RNC de la empresa..."
              size="small"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: <Search style={{ width: 16, height: 16, color: '#9ca3af', marginRight: 8 }} />,
                  endAdornment: loading ? <CircularProgress size={16} sx={{ color: '#0d9488' }} /> : null,
                },
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />

            {open && results.length > 0 && (
              <Box
                component="ul"
                sx={{
                  position: 'absolute', zIndex: 20, width: '100%', mt: '4px',
                  bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', maxHeight: 256,
                  overflowY: 'auto', m: 0, p: 0, listStyle: 'none',
                }}
              >
                {results.map(r => (
                  <Box
                    component="li"
                    key={r.rnc}
                    sx={{ borderBottom: '1px solid #f3f4f6', '&:last-child': { borderBottom: 'none' } }}
                  >
                    <Box
                      component="button"
                      type="button"
                      onClick={() => seleccionar(r)}
                      sx={{
                        width: '100%', textAlign: 'left', px: 2, py: 1.5,
                        background: 'none', border: 'none', cursor: 'pointer',
                        '&:hover': { bgcolor: '#f9fafb' },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.nombre}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{r.rnc}</Typography>
                        {r.nombreComercial && (
                          <Typography variant="caption" sx={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            · {r.nombreComercial}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          sx={{ ml: 'auto', flexShrink: 0, color: r.estadoLabel === 'Activo' ? '#16a34a' : '#d97706' }}
                        >
                          {r.estadoLabel}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {open && !loading && results.length === 0 && query.length >= 2 && (
              <Box sx={{
                position: 'absolute', zIndex: 20, width: '100%', mt: '4px',
                bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', px: 2, py: 1.5,
              }}>
                <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                  Sin resultados para &quot;{query}&quot;
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Campos ocultos con valores del buscador */}
      <input type="hidden" name="rnc"             value={rnc} />
      <input type="hidden" name="razonSocial"     value={razonSocial} />
      <input type="hidden" name="nombreComercial" value={nombreComercial} />

      {/* ─── Datos complementarios ───────────────────────────────────────── */}
      <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 2 }}>
          Datos complementarios
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>

          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
              Razón social <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              required
              placeholder="EMPRESA EJEMPLO SRL"
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
              value={rnc}
              onChange={e => setRnc(e.target.value)}
              required
              slotProps={{ htmlInput: { maxLength: 11 } }}
              placeholder="131000000"
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
              value={nombreComercial}
              onChange={e => setNombreComercial(e.target.value)}
              placeholder="Empresa Ejemplo"
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
              placeholder="Calle, No., Sector"
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
                onChange={e => setProvincia(e.target.value)}
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

          {/* Municipio — dependiente de provincia */}
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
                    {!provincia ? 'Selecciona provincia primero' : loadingMunic ? 'Cargando...' : '— Seleccionar —'}
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
              placeholder="809-000-0000"
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
              placeholder="facturas@empresa.com"
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

        </Box>
      </Box>

      {/* ─── Plan ────────────────────────────────────────────────────────── */}
      <input type="hidden" name="planName" value={planKey} />
      <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 0.5 }}>Plan</Typography>
        <Typography variant="caption" sx={{ color: '#6b7280', mb: 2, display: 'block' }}>
          Asignado manualmente — no requiere Stripe.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)' }, gap: 1 }}>
          <PlanCard
            plan={FREE_PLAN}
            selected={planKey === ''}
            onSelect={() => setPlanKey('')}
          />
          {PLANS.map(p => (
            <PlanCard
              key={p.key}
              plan={p}
              selected={planKey === p.key}
              onSelect={() => setPlanKey(p.key)}
            />
          ))}
        </Box>
      </Box>

      {/* ─── Invitación ───────────────────────────────────────────────────── */}
      <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', mb: 0.5 }}>Invitar usuario</Typography>
        <Typography variant="caption" sx={{ color: '#6b7280', mb: 2, display: 'block' }}>
          Opcional — le llegará un correo para crear su cuenta y acceder a esta empresa.
        </Typography>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
            Email del cliente
          </Typography>
          <TextField
            name="inviteEmail"
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="cliente@suempresa.com"
            size="small"
            fullWidth
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
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
          Crear empresa
        </Button>
        <Button
          component="a"
          href="/admin/empresas"
          variant="text"
          sx={{ textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}
        >
          Cancelar
        </Button>
      </Box>
    </Box>
  );
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan, selected, onSelect,
}: {
  plan: PlanDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const isFree = plan.price === 0;

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
        {isFree ? 'Sin plan' : `$${plan.price}/mes`}
      </Typography>
      {!isFree && (
        <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block', lineHeight: 1.3 }}>
          {plan.limits.docs === -1 ? '∞ docs' : `${plan.limits.docs} docs/mes`}
          {' · '}
          {plan.limits.users === -1 ? '∞ usuarios' : `${plan.limits.users} usuario${plan.limits.users !== 1 ? 's' : ''}`}
        </Typography>
      )}
    </Box>
  );
}
