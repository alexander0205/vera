'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function addYears(n: number): string {
  const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10);
}
function formatEncf(tipo: string, numero: number): string {
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

function Tip({ title }: { title?: string }) {
  return (
    <Tooltip title={title ?? ''} placement="top">
      <HelpCircle style={{ height: 13, width: 13, color: '#9ca3af', display: 'inline', marginLeft: 4, verticalAlign: 'middle', cursor: 'help' }} />
    </Tooltip>
  );
}

const cardSx = {
  bgcolor: '#fff',
  border: '1px solid #f3f4f6',
  borderRadius: '16px',
  overflow: 'hidden',
};

const cardHeaderSx = {
  px: 3,
  py: 2.5,
  borderBottom: '1px solid #f3f4f6',
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function NuevaSecuenciaPage() {
  const router = useRouter();

  const [categoriaId, setCategoriaId] = useState(CATEGORIAS_ECF[0].id);
  const [tipoCodigo, setTipoCodigo]   = useState(CATEGORIAS_ECF[0].tipos[0].codigo);
  const [nombre, setNombre]           = useState('');
  const [desde,  setDesde]            = useState('1');
  const [hasta,  setHasta]            = useState('1000');
  const [venc,   setVenc]             = useState(addYears(1));
  const [preferida, setPreferida]     = useState(false);
  const [prefijo, setPrefijo]         = useState('');
  const [pieDeFactura, setPieDeFactura] = useState('');
  const [sucursal, setSucursal]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [error,  setError]            = useState<string | null>(null);

  const categoria      = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  const tiposCategoria = categoria.tipos;
  const tipoActual     = tiposCategoria.find(t => t.codigo === tipoCodigo) ?? tiposCategoria[0];

  const esSinNcf        = tipoCodigo === 'sin-ncf';
  const showFechaVenc   = !esSinNcf && tipoCodigo !== '32' && tipoCodigo !== '34';
  const showNumeroFinal = !esSinNcf;
  const showPrefijo     = esSinNcf;
  const showPieFactura  = categoriaId === 'factura-venta' || categoriaId === 'nota-credito';

  const desdeNum    = parseInt(desde)  || 0;
  const hastaNum    = parseInt(hasta)  || 0;
  const disponibles = showNumeroFinal ? Math.max(0, hastaNum - desdeNum + 1) : null;

  function handleCategoriaChange(id: string) {
    setCategoriaId(id);
    const cat = CATEGORIAS_ECF.find(c => c.id === id) ?? CATEGORIAS_ECF[0];
    setTipoCodigo(cat.tipos[0].codigo);
    setPrefijo('');
    setPieDeFactura('');
  }

  function handleTipoChange(codigo: string) {
    setTipoCodigo(codigo);
    if (codigo !== 'sin-ncf') setPrefijo('');
    if (!showFechaVenc) setVenc(addYears(1));
  }

  async function handleGuardar() {
    setError(null);
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (desdeNum < 1) { setError('El número inicial debe ser mayor a 0.'); return; }
    if (showNumeroFinal && hastaNum < desdeNum) { setError('El número final debe ser mayor o igual al número inicial.'); return; }
    if (showFechaVenc && !venc) { setError('La fecha de vencimiento es obligatoria para este tipo de comprobante.'); return; }
    if (showFechaVenc && venc <= today()) { setError('La fecha de vencimiento debe ser futura.'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tipoEcf: tipoCodigo,
        nombre: nombre.trim(),
        desde: desdeNum,
        preferida,
        numeracionAutomatica: true,
        sucursal: sucursal.trim() || undefined,
      };
      if (showNumeroFinal)  payload.hasta = hastaNum;
      if (showFechaVenc)    payload.fechaVencimiento = venc;
      if (showPrefijo && prefijo.trim()) payload.prefijo = prefijo.trim();
      if (showPieFactura && pieDeFactura.trim()) payload.pieDeFactura = pieDeFactura.trim();

      const res  = await fetch('/api/secuencias', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push('/dashboard/secuencias');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      setSaving(false);
    }
  }

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e5e7eb', px: 3, py: 2.5 }}>
        <Link href="/dashboard/secuencias" style={{ textDecoration: 'none' }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1, color: '#6b7280', '&:hover': { color: '#111827' }, transition: 'color 0.15s' }}>
            <ArrowLeft style={{ height: 14, width: 14 }} />
            <Typography variant="caption" sx={{ fontSize: '0.8125rem' }}>Secuencias</Typography>
          </Box>
        </Link>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
          Nueva numeración
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.25 }}>
          Crea una numeración para organizar y tener el control de tus comprobantes.{' '}
          <a
            href="https://ayuda.dgii.gov.do"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0d9488', textDecoration: 'none' }}
          >
            Saber más
          </a>
        </Typography>
      </Box>

      {/* Contenido */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', px: 3, py: 3, gap: 2.5 }}>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: '10px' }}>
            {error}
          </Alert>
        )}

        {/* CARD: Configuración general */}
        <Box sx={cardSx}>

          {/* Header con toggle Preferida */}
          <Box sx={{ ...cardHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1f2937', fontSize: '0.9375rem' }}>
                Configuración general
              </Typography>
              <Typography variant="caption" sx={{ color: '#6b7280' }}>
                Agrega los datos principales de tu numeración
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preferida}
                    onChange={(_, v) => setPreferida(v)}
                    size="small"
                    sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0d9488' } }}
                  />
                }
                label={<Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Preferida</Typography>}
                labelPlacement="start"
                sx={{ mx: 0, gap: 0.5 }}
              />
              <Tip title="La secuencia preferida se usará por defecto al crear comprobantes de este tipo." />
            </Box>
          </Box>

          <Box sx={{ px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

            {/* Row 1: Tipo de documento + Tipo e-CF */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Tipo de documento *</InputLabel>
                <Select
                  value={categoriaId}
                  label="Tipo de documento *"
                  onChange={e => handleCategoriaChange(e.target.value)}
                  sx={{ borderRadius: '8px' }}
                >
                  {CATEGORIAS_ECF.map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box>
                <FormControl size="small" fullWidth disabled={tiposCategoria.length === 1}>
                  <InputLabel>
                    Tipo * <Tip title="Código de e-CF según DGII" />
                  </InputLabel>
                  <Select
                    value={tipoCodigo}
                    label="Tipo *"
                    onChange={e => handleTipoChange(e.target.value)}
                    sx={{ borderRadius: '8px' }}
                  >
                    {tiposCategoria.map(t => (
                      <MenuItem key={t.codigo} value={t.codigo}>{t.etiqueta}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {tipoActual && (
                  <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block' }}>
                    {tipoActual.nombre}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Row 2: Numeración automática + Número inicial */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, alignItems: 'start' }}>
              {/* Numeración automática — siempre checked, visual-only */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5 }}>
                <Box sx={{
                  height: 16, width: 16, borderRadius: '4px',
                  bgcolor: '#0d9488', border: '2px solid #0d9488',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg style={{ height: 10, width: 10, color: '#fff' }} fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Box>
                <Typography variant="body2" sx={{ color: '#374151' }}>Numeración automática</Typography>
                <Tip title="El sistema asignará el siguiente número disponible automáticamente." />
              </Box>

              <Box>
                <TextField
                  label={
                    <span>
                      Número inicial *{' '}
                      <Tip title="Primer número de esta secuencia" />
                    </span>
                  }
                  size="small"
                  fullWidth
                  type="number"
                  slotProps={{ htmlInput: { min: 1 } }}
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Box>
            </Box>

            {/* Row 3: Nombre + Número final (condicional) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Nombre *"
                size="small"
                fullWidth
                placeholder="Ej: Facturas de crédito fiscal"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />

              {showNumeroFinal && (
                <Box>
                  <TextField
                    label={
                      <span>
                        Número final <Tip title="Último número permitido en esta secuencia" />
                      </span>
                    }
                    size="small"
                    fullWidth
                    type="number"
                    slotProps={{ htmlInput: { min: 1 } }}
                    value={hasta}
                    onChange={e => setHasta(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                  {disponibles !== null && disponibles > 0 && (
                    <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block' }}>
                      {disponibles.toLocaleString('es-DO')} comprobantes
                    </Typography>
                  )}
                </Box>
              )}
            </Box>

            {/* Row 4: Fecha vencimiento (condicional) + Sucursal */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {showFechaVenc && (
                <TextField
                  label={
                    <span>
                      Fecha de vencimiento * <Tip title="La DGII requiere fecha límite para la mayoría de e-NCF" />
                    </span>
                  }
                  size="small"
                  fullWidth
                  type="date"
                  slotProps={{ htmlInput: { min: today() } }}
                  value={venc}
                  onChange={e => setVenc(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              )}

              <TextField
                label={
                  <span>
                    Sucursal <Tip title="Identificador de punto de emisión (opcional)" />
                  </span>
                }
                size="small"
                fullWidth
                placeholder="Opcional"
                value={sucursal}
                onChange={e => setSucursal(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>

            {/* Row 5: Prefijo (solo sin-ncf) */}
            {showPrefijo && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <TextField
                    label={
                      <span>
                        Prefijo <Tip title="Se añade antes del número al generar el documento" />
                      </span>
                    }
                    size="small"
                    fullWidth
                    placeholder="Ej: FAC-"
                    slotProps={{ htmlInput: { maxLength: 20 } }}
                    value={prefijo}
                    onChange={e => setPrefijo(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                  <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block' }}>
                    Se añadirá antes del número al generar el documento
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Row 6: Pie de factura */}
            {showPieFactura && (
              <Box>
                <TextField
                  label={
                    <span>
                      Pie de factura <Tip title="Texto al pie del comprobante (condiciones, términos, etc.)" />
                    </span>
                  }
                  size="small"
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Texto que aparecerá al pie del comprobante..."
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  value={pieDeFactura}
                  onChange={e => setPieDeFactura(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
                <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block', textAlign: 'right' }}>
                  {pieDeFactura.length}/2000 caracteres
                </Typography>
              </Box>
            )}

          </Box>
        </Box>

        {/* Vista previa e-NCF */}
        {!esSinNcf && (
          <Box sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151', fontSize: '0.8125rem' }}>
                Vista previa del e-NCF
              </Typography>
            </Box>
            <Box sx={{ px: 3, py: 2.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: showNumeroFinal ? '1fr 1fr 1fr' : '1fr 1fr', gap: 2, textAlign: 'center' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.75 }}>
                    Código
                  </Typography>
                  <Box component="span" sx={{
                    fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700,
                    color: '#0f766e', bgcolor: '#f0fdfa', border: '1px solid #99f6e4',
                    borderRadius: '8px', px: 1.5, py: 0.75, display: 'inline-block',
                  }}>
                    e{tipoCodigo}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.75 }}>
                    Primer e-NCF
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                    {desdeNum > 0 ? formatEncf(tipoCodigo, desdeNum) : '—'}
                  </Typography>
                </Box>
                {showNumeroFinal && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.75 }}>
                      Último e-NCF
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#6b7280' }}>
                      {hastaNum > 0 ? formatEncf(tipoCodigo, hastaNum) : '—'}
                    </Typography>
                  </Box>
                )}
              </Box>

              {showNumeroFinal && disponibles !== null && disponibles > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>Total disponibles:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: '#0f766e' }}>
                    {disponibles.toLocaleString('es-DO')} comprobantes
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

      </Box>

      {/* Bottom bar */}
      <Box sx={{
        position: 'sticky', bottom: 0, zIndex: 30,
        px: 3, py: 1.5,
        bgcolor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          Los campos con <span style={{ color: '#ef4444' }}>*</span> son obligatorios
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Link href="/dashboard/secuencias" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              disabled={saving}
              sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}
            >
              Cancelar
            </Button>
          </Link>
          <Button
            variant="contained"
            disableElevation
            disabled={saving}
            onClick={handleGuardar}
            startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, px: 3 }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </Box>
      </Box>

    </Box>
  );
}
