'use client';

import { useState, useEffect, useRef } from 'react';
import { mutate } from 'swr';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import {
  Building2, Palette, ImageIcon, PenLine,
  CheckCircle, Loader2, Upload, X, Eye, AlertCircle, Wallet, Lock, CreditCard, Store,
} from 'lucide-react';
import { ProvinciaMunicipioSelect } from '@/components/provincia-municipio-select';
import { EquipoCard } from './EquipoCard';
import { WhatsAppCard } from './WhatsAppCard';
import { formatTelefonoDO } from '@/lib/utils/format';
import { roleHasPermission } from '@/lib/config/roles';
import { METODOS_PAGO } from '@/lib/pagos/metodos';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const COLORES = [
  { label: 'Azul DGII',   value: '#1e40af' },
  { label: 'Azul oscuro', value: '#1e3a5f' },
  { label: 'Verde',       value: '#15803d' },
  { label: 'Rojo',        value: '#b91c1c' },
  { label: 'Morado',      value: '#7c3aed' },
  { label: 'Naranja',     value: '#c2410c' },
  { label: 'Gris oscuro', value: '#374151' },
  { label: 'Negro',       value: '#111827' },
];

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };
const cardHeaderSx = { px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 };
const cardContentSx = { px: 3, py: 3 };

// ─── Sub-componente: UploadImagen ─────────────────────────────────────────────

function UploadImagen({
  label, hint, value, onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 800_000) {
      alert('Imagen demasiado grande (máx 800 KB). Comprime antes de subir.');
      return;
    }
    const b64 = await fileToBase64(file);
    onChange(b64);
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.25 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1 }}>{hint}</Typography>
      <Box
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        sx={{
          position: 'relative', border: '2px dashed', borderRadius: '12px', cursor: 'pointer',
          minHeight: 100, transition: 'all 0.15s',
          borderColor: dragging ? '#3b82f6' : '#e5e7eb',
          bgcolor: dragging ? '#eff6ff' : '#f9fafb',
          '&:hover': { borderColor: '#d1d5db' },
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {value ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, gap: 2 }}>
            <img src={value} alt={label} style={{ maxHeight: 80, maxWidth: 180, objectFit: 'contain', borderRadius: 6 }} />
            <Box component="button" type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              sx={{ p: 0.75, borderRadius: '50%', bgcolor: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer', '&:hover': { bgcolor: '#fecaca' }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 4, gap: 0.75, color: '#9ca3af' }}>
            <Upload size={32} />
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Arrastra o haz click para subir</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>PNG, JPG, SVG · Máx 800 KB</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [razonSocial, setRazonSocial]           = useState('');
  const [nombreComercial, setNombreComercial]   = useState('');
  const [rnc, setRnc]                           = useState('');
  const [direccion, setDireccion]               = useState('');
  const [telefono, setTelefono]                 = useState('');
  const [sitioWeb, setSitioWeb]                 = useState('');
  const [emailFacturacion, setEmailFacturacion] = useState('');
  const [colorPrimario, setColorPrimario]       = useState('#1e40af');
  const [logo, setLogo]                         = useState('');
  const [firma, setFirma]                       = useState('');
  const [provincia, setProvincia]               = useState('');
  const [municipio, setMunicipio]               = useState('');
  // Recargo por mora
  const [recargoActivo, setRecargoActivo]               = useState(false);
  const [recargoPorcentaje, setRecargoPorcentaje]       = useState('2.00');   // mostrado como %
  // Módulo cuadre de caja
  const [cajaHabilitada, setCajaHabilitada]             = useState(false);
  // null = sin límite. Es el estado real por defecto: la función nace apagada.
  const [cajaLimiteHoras, setCajaLimiteHoras]           = useState<number | null>(null);
  const [cajaAvisoMinutos, setCajaAvisoMinutos]         = useState(60);
  const [cajaGraciaHoras, setCajaGraciaHoras]           = useState<number | null>(2);
  // Módulo punto de venta (POS)
  const [posHabilitado, setPosHabilitado]               = useState(false);
  const [posEscolarHabilitado, setPosEscolarHabilitado] = useState(false);
  // Plazo de pago por defecto: '' = de contado; '8'/'15'/'30'/'60' = crédito N días
  const [plazoDefaultDias, setPlazoDefaultDias]         = useState('');
  // Métodos de pago que obligan emisión a la DGII (bloquean guardar como borrador)
  const [metodosObligaDgii, setMetodosObligaDgii]      = useState<string[]>([]);

  // Rol del usuario activo → permisos de gestión (read-only para roles sin permiso)
  const [role, setRole]           = useState<string | null>(null);
  const canManage     = roleHasPermission(role, 'configuracion:gestionar');
  const canManageTeam = roleHasPermission(role, 'equipo:gestionar');

  useEffect(() => {
    fetch('/api/equipo/perfil')
      .then(r => r.json())
      .then(d => {
        setRazonSocial(d.razonSocial ?? '');
        setNombreComercial(d.nombreComercial ?? '');
        setRnc(d.rnc ?? '');
        setDireccion(d.direccion ?? '');
        setTelefono(formatTelefonoDO(d.telefono ?? ''));
        setSitioWeb(d.sitioWeb ?? '');
        setEmailFacturacion(d.emailFacturacion ?? '');
        setColorPrimario(d.colorPrimario ?? '#1e40af');
        setLogo(d.logo ?? '');
        setFirma(d.firma ?? '');
        setProvincia(d.provincia ?? '');
        setMunicipio(d.municipio ?? '');
        setRecargoActivo(d.recargoMoraActivo ?? false);
        setRecargoPorcentaje(((d.recargoMoraPorcentaje ?? 200) / 100).toFixed(2));
        setCajaHabilitada(d.cajaHabilitada ?? false);
        setCajaLimiteHoras(d.cajaLimiteHoras ?? null);
        setCajaAvisoMinutos(d.cajaAvisoMinutos ?? 60);
        setCajaGraciaHoras(d.cajaGraciaHoras ?? null);
        // Módulo POS
        setPosHabilitado(d.posHabilitado ?? false);
        setPosEscolarHabilitado(d.posEscolarHabilitado ?? false);
        setPlazoDefaultDias(d.plazoPagoDefaultDias != null ? String(d.plazoPagoDefaultDias) : '');
        setMetodosObligaDgii(Array.isArray(d.metodosObligaDgii) ? d.metodosObligaDgii : []);
        setRole(d.role ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const pctBps = Math.round(parseFloat(recargoPorcentaje || '0') * 100);
      const res = await fetch('/api/equipo/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial, nombreComercial, rnc, direccion,
          provincia, municipio,
          telefono, sitioWeb, emailFacturacion, colorPrimario,
          logo, firma,
          recargoMoraActivo:     recargoActivo,
          recargoMoraPorcentaje: pctBps,
          // Gracia eliminada del config: la mora aplica al vencer.
          recargoMoraDiasGracia: 0,
          cajaHabilitada,
          cajaLimiteHoras,
          cajaAvisoMinutos,
          cajaGraciaHoras,
          posHabilitado,
          posEscolarHabilitado,
          plazoPagoDefaultDias:  plazoDefaultDias ? parseInt(plazoDefaultDias, 10) : null,
          metodosObligaDgii,
        }),
      });
      if (!res.ok) throw new Error('Error guardando');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      mutate('/api/empresa/list');
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={36} sx={{ color: '#0d9488' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Configuración del negocio</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>Estos datos aparecen en todas tus facturas PDF</Typography>
          </Box>
          <Button variant="contained" disableElevation onClick={handleSave} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : saved ? <CheckCircle size={16} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, minWidth: 140 }}>
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert>}

        {/* 1. Datos fiscales */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <Building2 size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Datos fiscales</Typography>
          </Box>
          <Box sx={{ ...cardContentSx, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Razón Social" size="small" fullWidth placeholder="Empresa XYZ SRL"
              value={razonSocial} onChange={e => setRazonSocial(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <TextField label="Nombre Comercial" size="small" fullWidth placeholder="MiTienda (opcional)"
              value={nombreComercial} onChange={e => setNombreComercial(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <TextField label="RNC" size="small" fullWidth placeholder="130123456"
              slotProps={{ htmlInput: { maxLength: 11 } }}
              value={rnc} onChange={e => setRnc(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <TextField label="Teléfono" size="small" fullWidth placeholder="(809) 000-0000"
              slotProps={{ htmlInput: { inputMode: 'tel' } }}
              value={telefono} onChange={e => setTelefono(formatTelefonoDO(e.target.value))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <TextField label="Dirección" size="small" fullWidth placeholder="Calle y número"
              value={direccion} onChange={e => setDireccion(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' }, gridColumn: { md: 'span 2' } }} />
            <Box sx={{ gridColumn: { md: 'span 2' } }}>
              <ProvinciaMunicipioSelect
                provincia={provincia}
                municipio={municipio}
                onProvinciaChange={setProvincia}
                onMunicipioChange={setMunicipio}
              />
            </Box>
            <TextField label="Email de facturación" size="small" fullWidth type="email" placeholder="facturacion@empresa.com"
              value={emailFacturacion} onChange={e => setEmailFacturacion(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <TextField label="Sitio web" size="small" fullWidth placeholder="www.miempresa.com"
              value={sitioWeb} onChange={e => setSitioWeb(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
          </Box>
        </Box>

        {/* 2. Logo */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <ImageIcon size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Logo de la empresa</Typography>
          </Box>
          <Box sx={cardContentSx}>
            <UploadImagen label="Logo"
              hint="Aparece en la esquina superior izquierda de cada factura. Fondo transparente recomendado."
              value={logo} onChange={setLogo} />
          </Box>
        </Box>

        {/* 3. Firma */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <PenLine size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Firma autorizada</Typography>
          </Box>
          <Box sx={cardContentSx}>
            <UploadImagen label="Imagen de firma"
              hint="Aparece en el pie de cada factura. Usa fondo blanco o transparente."
              value={firma} onChange={setFirma} />
          </Box>
        </Box>

        {/* 4. Color de marca */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <Palette size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Color de marca</Typography>
          </Box>
          <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Se usa en el encabezado, tabla y totales del PDF de la factura.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {COLORES.map(c => (
                <Box key={c.value} component="button" type="button" title={c.label}
                  onClick={() => setColorPrimario(c.value)}
                  sx={{
                    width: 36, height: 36, borderRadius: '50%', border: '2px solid', cursor: 'pointer',
                    borderColor: colorPrimario === c.value ? '#111827' : 'transparent',
                    bgcolor: c.value, transition: 'transform 0.15s',
                    transform: colorPrimario === c.value ? 'scale(1.15)' : 'scale(1)',
                    '&:hover': { transform: 'scale(1.1)' },
                    boxShadow: colorPrimario === c.value ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                  }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box component="input" type="color" value={colorPrimario} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColorPrimario(e.target.value)}
                sx={{ width: 40, height: 40, border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', p: 0.5 }} />
              <TextField size="small" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)}
                placeholder="#1e40af" slotProps={{ htmlInput: { maxLength: 7 } }}
                sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontFamily: 'monospace' } }} />
              <Box sx={{ flex: 1, height: 40, borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: colorPrimario }}>
                <Typography sx={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>Vista previa</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Vista previa encabezado */}
        <Box sx={{ ...cardSx, border: '1px dashed #d1d5db' }}>
          <Box sx={cardHeaderSx}>
            <Eye size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Previsualización del encabezado</Typography>
          </Box>
          <Box sx={cardContentSx}>
            <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: colorPrimario }}>
                {logo ? (
                  <img src={logo} alt="Logo" style={{ height: 48, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 4 }} />
                ) : (
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '6px', px: 1.5, py: 1, color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>
                    {(nombreComercial || razonSocial || 'LOGO').substring(0, 8).toUpperCase()}
                  </Box>
                )}
                <Box sx={{ textAlign: 'right', color: '#fff' }}>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.1em' }}>e-CF</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', opacity: 0.8, fontFamily: 'monospace' }}>E320000000001</Typography>
                  <Typography sx={{ fontSize: '0.75rem', opacity: 0.7 }}>Factura de Consumo</Typography>
                </Box>
              </Box>
              <Box sx={{ p: 2, bgcolor: '#fff' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{nombreComercial || razonSocial || 'Nombre de tu empresa'}</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>RNC: {rnc || '000-00000-0'}</Typography>
                {direccion && <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{direccion}</Typography>}
                {telefono && <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>Tel: {telefono}</Typography>}
                {emailFacturacion && <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{emailFacturacion}</Typography>}
              </Box>
            </Box>
          </Box>
        </Box>

        {/* 5. Plazo de pago */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <AlertCircle size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Plazo de pago</Typography>
          </Box>
          <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Plazo de pago por defecto al crear una factura nueva o recurrente. Puedes cambiarlo en cada factura.
            </Typography>
            <Box sx={{ maxWidth: 320 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Plazo de pago por defecto</InputLabel>
                <Select value={plazoDefaultDias || 'contado'} label="Plazo de pago por defecto"
                  onChange={e => setPlazoDefaultDias(e.target.value === 'contado' ? '' : e.target.value)}
                  sx={{ borderRadius: '8px' }}>
                  <MenuItem value="contado">De contado</MenuItem>
                  <MenuItem value="8">8 días</MenuItem>
                  <MenuItem value="15">15 días</MenuItem>
                  <MenuItem value="30">30 días</MenuItem>
                  <MenuItem value="60">60 días</MenuItem>
                </Select>
              </FormControl>
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.75 }}>
                «De contado» no genera fecha de vencimiento.
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* 6. Recargo por mora */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <AlertCircle size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Recargo por mora</Typography>
          </Box>
          <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Aplica automáticamente un recargo a facturas a crédito vencidas. El recargo se suma al saldo de cobranza — el documento fiscal original no se modifica.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 1.5 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Activar recargo por mora</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>
                  El cron diario (09:00 UTC) aplicará el recargo una sola vez por factura.
                </Typography>
              </Box>
              <Switch checked={recargoActivo} onChange={(_, v) => setRecargoActivo(v)} color="primary"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }} />
            </Box>
            <Box sx={{ opacity: recargoActivo ? 1 : 0.4, pointerEvents: recargoActivo ? 'auto' : 'none', transition: 'opacity 0.2s', maxWidth: 320 }}>
              <TextField label="Porcentaje de recargo (%)" size="small" fullWidth type="number"
                slotProps={{ htmlInput: { step: 0.01, min: 0.01, max: 100 }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                placeholder="2.00" value={recargoPorcentaje} onChange={e => setRecargoPorcentaje(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.75 }}>
                Se aplica al vencer la factura. Default: 2.00% (200 basis points).
              </Typography>
            </Box>
            {recargoActivo && (
              <Alert severity="warning" sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
                <strong>Nota fiscal:</strong> El recargo NO modifica la factura electrónica emitida ante la DGII.
                Solo se suma al saldo visible en Cuentas por cobrar y en tickets de cobranza.
              </Alert>
            )}
          </Box>
        </Box>

        {/* 7. Módulo de caja */}
        <Box sx={cardSx}>
          <Box sx={cardHeaderSx}>
            <Wallet size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Cuadre de Caja</Typography>
          </Box>
          <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Habilita el módulo de apertura y cierre de turnos de caja. Los cajeros deberán abrir un turno antes de emitir facturas, y el sistema calculará automáticamente el efectivo esperado al cierre.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 1.5 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Activar cuadre de caja</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>
                  Aparecerá el menú "Caja" en el panel y se requerirá turno abierto para facturar.
                </Typography>
              </Box>
              <Switch checked={cajaHabilitada} onChange={(_, v) => setCajaHabilitada(v)} color="primary"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }} />
            </Box>
            {cajaHabilitada && (
              <>
                {/* Límite de duración del turno */}
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
                  <Box>
                    <Typography variant="body2" component="label" htmlFor="caja-limite" sx={{ fontWeight: 500, color: '#1f2937' }}>
                      Límite del turno (horas)
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25, mb: 0.75 }}>
                      Vacío = sin límite ni avisos.
                    </Typography>
                    <TextField
                      id="caja-limite"
                      type="number"
                      size="small"
                      fullWidth
                      placeholder="8"
                      value={cajaLimiteHoras ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        setCajaLimiteHoras(v === '' ? null : parseInt(v, 10));
                      }}
                      slotProps={{ htmlInput: { min: 1, max: 24 } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" component="label" htmlFor="caja-aviso" sx={{ fontWeight: 500, color: '#1f2937' }}>
                      Avisar desde (min antes)
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25, mb: 0.75 }}>
                      Cuándo aparece el contador arriba.
                    </Typography>
                    <TextField
                      id="caja-aviso"
                      type="number"
                      size="small"
                      fullWidth
                      placeholder="60"
                      value={cajaAvisoMinutos}
                      onChange={(e) => setCajaAvisoMinutos(parseInt(e.target.value, 10) || 60)}
                      slotProps={{ htmlInput: { min: 5, max: 240 } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" component="label" htmlFor="caja-gracia" sx={{ fontWeight: 500, color: '#1f2937' }}>
                      Gracia antes de bloquear (h)
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25, mb: 0.75 }}>
                      Vacío o 0 = nunca bloquea, solo avisa.
                    </Typography>
                    <TextField
                      id="caja-gracia"
                      type="number"
                      size="small"
                      fullWidth
                      placeholder="2"
                      value={cajaGraciaHoras ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        setCajaGraciaHoras(v === '' ? null : parseInt(v, 10));
                      }}
                      slotProps={{ htmlInput: { min: 0, max: 12 } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    />
                  </Box>
                </Box>

                <Alert severity="info" sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
                  <strong>Activo:</strong> El módulo "Caja" aparecerá en el menú lateral. Cada cajero
                  debe abrir su turno antes de emitir o cobrar. Los cierres con descuadre requieren
                  aprobación de un admin u owner.
                </Alert>

                {cajaLimiteHoras ? (
                  <Alert severity={cajaGraciaHoras ? 'warning' : 'info'} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
                    {cajaGraciaHoras ? (
                      <>
                        <strong>Bloqueo activo:</strong> el contador aparece a las{' '}
                        {cajaLimiteHoras}h menos {cajaAvisoMinutos} min. A las {cajaLimiteHoras}h el
                        turno vence, y a las {cajaLimiteHoras + cajaGraciaHoras}h el cajero{' '}
                        <strong>no podrá facturar ni cobrar</strong> hasta cerrar caja.
                      </>
                    ) : (
                      <>
                        <strong>Solo avisa:</strong> el contador aparece a las {cajaLimiteHoras}h menos{' '}
                        {cajaAvisoMinutos} min y el turno vence a las {cajaLimiteHoras}h, pero el cajero
                        puede seguir facturando indefinidamente.
                      </>
                    )}
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
                    Sin límite de duración: los turnos pueden quedar abiertos indefinidamente y no se
                    muestra contador.
                  </Alert>
                )}
              </>
            )}
          </Box>
        </Box>

        {/* 8. Punto de venta (POS) */}
        <Box sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Store style={{ width: 16, height: 16, color: '#0d9488' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Punto de venta (POS)</Typography>
            </Box>
            <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                Habilita la pantalla de punto de venta para ventas rápidas de mostrador. Ideal para tiendas, colmados, cafeterías y cantinas escolares.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Activar punto de venta</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>
                    Aparecerá el módulo «POS» en el panel para registrar ventas rápidas de mostrador.
                  </Typography>
                </Box>
                <Switch checked={posHabilitado} onChange={(_, v) => setPosHabilitado(v)} color="primary"
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Modo monedero escolar</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>
                    Habilita saldos por estudiante y consumo con monedero prepago en el punto de venta.
                  </Typography>
                </Box>
                <Switch checked={posEscolarHabilitado} onChange={(_, v) => setPosEscolarHabilitado(v)} color="primary"
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }} />
              </Box>
            </Box>
          </Box>

        {/* 9. Métodos que obligan facturar a la DGII */}
        <Box sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <CreditCard size={16} color="#0d9488" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Métodos que obligan facturar a la DGII</Typography>
            </Box>
            <Box sx={{ ...cardContentSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                Cuando una factura registra un cobro con alguno de estos métodos, no se podrá guardar como borrador: habrá que emitirla a la DGII.
              </Typography>
              <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                {METODOS_PAGO.map((m, i) => (
                  <Box key={m.value}
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      px: 2, py: 1.25,
                      borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                    }}>
                    <Typography variant="body2" sx={{ color: '#1f2937' }}>{m.label}</Typography>
                    <Switch
                      checked={metodosObligaDgii.includes(m.value)}
                      onChange={(_, v) => setMetodosObligaDgii(
                        v ? [...metodosObligaDgii, m.value] : metodosObligaDgii.filter(x => x !== m.value)
                      )}
                      color="primary"
                      sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }} />
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

        {/* WhatsApp Business */}
        <WhatsAppCard />

        {/* Equipo y permisos */}
        <EquipoCard />

      </Box>

      {/* Sticky bottom bar */}
      <Box sx={{
        position: 'sticky', bottom: 0, zIndex: 30,
        mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, mt: 'auto', py: 1.5,
        bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e5e7eb', boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <Button variant="contained" disableElevation onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : saved ? <CheckCircle size={16} /> : <Loader2 size={16} style={{ opacity: 0 }} />}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, minWidth: 160 }}>
          {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
        </Button>
      </Box>
    </Box>
  );
}
