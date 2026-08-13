'use client';

// Portado de crm-escolar/src/components/formularios/FormularioRenderer.tsx.
//
// Adaptaciones respecto al CRM:
//  - `_id: string` (ObjectId de Mongo) → `id: number` (serial de Postgres).
//  - El endpoint de envío (`/api/.../respuestas`) y el de subida de archivos
//    (`/api/.../upload-url`) TODAVÍA NO EXISTEN — esta tarea es solo el
//    constructor, no la página pública ni el envío de respuestas (ver tarea).
//    `handleSubmit` ya cortaba en seco si `isPreview` (igual que el CRM), así
//    que el POST de envío nunca se dispara desde el constructor. Lo que SÍ
//    hacía falta tocar es `subirArchivo`: en el CRM llamaba a la red sin mirar
//    `isPreview`, y aquí esa red no existe todavía. En vista previa se acepta
//    el archivo en el momento (sin subirlo) para poder ver el campo funcionando.
//  - `configuracion` deja fuera `crearProspecto` (no hay leads en Zero).
import { useState, useMemo } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, FormControlLabel, Checkbox,
  Radio, RadioGroup, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Typography, MenuItem, IconButton, LinearProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SignaturePad from './SignaturePad';
import type { ICampo } from '@/lib/administracion-escolar/formularios';

/** ¿Está vacío el valor de un campo? Maneja objetos para los campos compuestos. */
export function isCampoVacio(tipo: string, val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'number') return false;
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    if (tipo === 'archivo') return !v.key;
    return Object.values(v).every((x) => !x);
  }
  return false;
}

interface RendererFormulario {
  id: number;
  nombre: string;
  descripcion?: string | null;
  campos: ICampo[];
  configuracion: {
    mensajeConfirmacion: string;
    urlRedireccion?: string;
    colorPrimario: string;
    colorFondo?: string;
    colorTarjeta?: string;
    logoUrl?: string;
    captchaActivo?: boolean;
    bilingue?: boolean;
  };
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

// Carga reCAPTCHA v3 una sola vez y devuelve un token para la acción dada.
// Resuelve null cuando no hay site key configurada (queda solo el honeypot).
function getRecaptchaToken(): Promise<string | null> {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const w = window as unknown as { grecaptcha?: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } };
    const run = () => {
      w.grecaptcha!.ready(() => {
        w.grecaptcha!.execute(RECAPTCHA_SITE_KEY!, { action: 'submit' })
          .then(resolve).catch(() => resolve(null));
      });
    };
    if (w.grecaptcha) { run(); return; }
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.onload = run;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

interface FormularioRendererProps {
  formulario: RendererFormulario;
  isPreview?: boolean;
  onSuccess?: () => void;
}

function CampoRenderer({
  campo,
  value,
  error,
  onChange,
  colorPrimario,
  isPreview,
  idioma,
}: {
  campo: ICampo;
  value: unknown;
  error?: string;
  onChange: (val: unknown) => void;
  colorPrimario: string;
  isPreview: boolean;
  idioma: 'es' | 'en';
}) {
  const [subiendo, setSubiendo] = useState(false);

  // Texto mostrado según idioma (el español sigue siendo el valor canónico).
  const en = idioma === 'en';
  const label = (en && campo.labelEn) || campo.label;
  const placeholder = (en && campo.placeholderEn) || campo.placeholder;
  const ayuda = (en && campo.ayudaEn) || campo.ayuda;
  const opcionLabel = (op: string, i: number) => (en && campo.opcionesEn?.[i]) || op;

  // En vista previa no hay a dónde subir todavía (el endpoint de envío es
  // trabajo futuro), así que se acepta el archivo localmente para poder ver
  // el campo funcionando sin pegarle a una ruta que no existe.
  const subirArchivo = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) { alert('Archivo muy grande (máx 15MB)'); return; }
    if (isPreview) {
      onChange({ nombre: file.name, tipo: file.type, size: file.size, key: 'preview-local' });
      return;
    }
    setSubiendo(true);
    try {
      const res = await fetch(`/api/administracion-escolar/formularios/${campo.id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo preparar la subida');

      const put = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) throw new Error('Error al subir el archivo');

      onChange({ nombre: file.name, tipo: file.type, size: file.size, key: data.key });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir el archivo');
    } finally {
      setSubiendo(false);
    }
  };

  if (campo.tipo === 'imagen') {
    if (!campo.imagenUrl) return null;
    return (
      <Box component="figure" sx={{ textAlign: 'center', m: 0 }}>
        <Box
          component="img"
          src={campo.imagenUrl}
          alt={label || ''}
          sx={{ maxWidth: '100%', height: 'auto', borderRadius: 1, mx: 'auto' }}
        />
        {label && (
          <Typography component="figcaption" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {label}
          </Typography>
        )}
      </Box>
    );
  }

  if (campo.tipo === 'heading') {
    return (
      <Box sx={{ pt: 1 }}>
        <Typography variant="h6">{label}</Typography>
        {ayuda && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{ayuda}</Typography>}
      </Box>
    );
  }

  if (campo.tipo === 'paragraph') {
    return <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{label}</Typography>;
  }

  if (campo.tipo === 'divider') {
    return <Divider sx={{ my: 1 }} />;
  }

  return (
    <Stack spacing={0.75}>
      <Typography component="label" htmlFor={campo.id} variant="body2" sx={{ fontWeight: 600 }}>
        {label}
        {campo.requerido && <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>}
      </Typography>

      {ayuda && <Typography variant="caption">{ayuda}</Typography>}

      {(campo.tipo === 'text' || campo.tipo === 'email' || campo.tipo === 'phone' || campo.tipo === 'number') && (
        <TextField
          id={campo.id}
          type={campo.tipo === 'phone' ? 'tel' : campo.tipo === 'number' ? 'number' : campo.tipo}
          placeholder={placeholder}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          error={!!error}
        />
      )}

      {campo.tipo === 'textarea' && (
        <TextField
          id={campo.id}
          placeholder={placeholder}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          multiline
          rows={4}
          error={!!error}
        />
      )}

      {campo.tipo === 'date' && (
        <TextField
          id={campo.id}
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          error={!!error}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}

      {campo.tipo === 'select' && (
        <TextField
          id={campo.id}
          select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          error={!!error}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">{placeholder || (en ? 'Select an option' : 'Selecciona una opción')}</MenuItem>
          {campo.opciones?.map((op, i) => (
            <MenuItem key={op} value={op}>{opcionLabel(op, i)}</MenuItem>
          ))}
        </TextField>
      )}

      {campo.tipo === 'radio' && (
        <RadioGroup
          name={campo.id}
          value={(value as string) ?? ''}
          onChange={(_, v) => onChange(v)}
        >
          {campo.opciones?.map((op, i) => (
            <FormControlLabel
              key={op}
              value={op}
              control={<Radio size="small" sx={{ color: colorPrimario, '&.Mui-checked': { color: colorPrimario } }} />}
              label={<Typography variant="body2">{opcionLabel(op, i)}</Typography>}
            />
          ))}
        </RadioGroup>
      )}

      {campo.tipo === 'checkboxes' && (
        <Stack>
          {campo.opciones?.map((op, i) => {
            const selected = (value as string[]) || [];
            const checked = selected.includes(op);
            return (
              <FormControlLabel
                key={op}
                control={
                  <Checkbox
                    size="small"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? selected.filter((v) => v !== op) : [...selected, op];
                      onChange(next);
                    }}
                    sx={{ color: colorPrimario, '&.Mui-checked': { color: colorPrimario } }}
                  />
                }
                label={<Typography variant="body2">{opcionLabel(op, i)}</Typography>}
              />
            );
          })}
        </Stack>
      )}

      {/* ── Campos avanzados ───────────────────────────────────── */}

      {campo.tipo === 'nombre_completo' && (() => {
        const v = (value as { nombre?: string; apellido?: string }) || {};
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <Box>
              <TextField
                placeholder="Nombre"
                value={v.nombre || ''}
                onChange={(e) => onChange({ ...v, nombre: e.target.value })}
                error={!!error}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Nombre</Typography>
            </Box>
            <Box>
              <TextField
                placeholder="Apellido"
                value={v.apellido || ''}
                onChange={(e) => onChange({ ...v, apellido: e.target.value })}
                error={!!error}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Apellido</Typography>
            </Box>
          </Box>
        );
      })()}

      {campo.tipo === 'direccion' && (() => {
        const v = (value as Record<string, string>) || {};
        const set = (k: string, val: string) => onChange({ ...v, [k]: val });
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <Box sx={{ gridColumn: 'span 2' }}>
              <TextField placeholder="Calle y número" value={v.calle || ''} onChange={(e) => set('calle', e.target.value)} error={!!error} />
            </Box>
            <TextField placeholder="Ciudad" value={v.ciudad || ''} onChange={(e) => set('ciudad', e.target.value)} error={!!error} />
            <TextField placeholder="Provincia / Estado" value={v.estado || ''} onChange={(e) => set('estado', e.target.value)} error={!!error} />
            <TextField placeholder="Código postal" value={v.cp || ''} onChange={(e) => set('cp', e.target.value)} error={!!error} />
            <TextField placeholder="País" value={v.pais || ''} onChange={(e) => set('pais', e.target.value)} error={!!error} />
          </Box>
        );
      })()}

      {campo.tipo === 'hora' && (() => {
        const v = (value as { hora?: string; min?: string; ampm?: string }) || { ampm: 'AM' };
        const set = (k: string, val: string) => onChange({ ...v, [k]: val });
        return (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              select
              value={v.hora || ''}
              onChange={(e) => set('hora', e.target.value)}
              error={!!error}
              slotProps={{ select: { displayEmpty: true } }}
              sx={{ minWidth: 80 }}
            >
              <MenuItem value="">HH</MenuItem>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
            </TextField>
            <Typography color="text.secondary">:</Typography>
            <TextField
              select
              value={v.min || ''}
              onChange={(e) => set('min', e.target.value)}
              error={!!error}
              slotProps={{ select: { displayEmpty: true } }}
              sx={{ minWidth: 80 }}
            >
              <MenuItem value="">MM</MenuItem>
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <TextField
              select
              value={v.ampm || 'AM'}
              onChange={(e) => set('ampm', e.target.value)}
              error={!!error}
              sx={{ minWidth: 80 }}
            >
              <MenuItem value="AM">AM</MenuItem>
              <MenuItem value="PM">PM</MenuItem>
            </TextField>
          </Stack>
        );
      })()}

      {campo.tipo === 'estrellas' && (() => {
        const rating = (value as number) || 0;
        return (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <IconButton
                key={n}
                type="button"
                size="small"
                onClick={() => onChange(n)}
                sx={{ p: 0.25, transition: 'transform .15s', '&:hover': { transform: 'scale(1.1)' } }}
              >
                <StarIcon sx={{ fontSize: 28, color: n <= rating ? colorPrimario : 'action.disabled' }} />
              </IconButton>
            ))}
            {rating > 0 && <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>{rating}/5</Typography>}
          </Stack>
        );
      })()}

      {campo.tipo === 'firma' && (
        <SignaturePad
          value={value as string}
          onChange={(dataUrl) => onChange(dataUrl)}
          color={colorPrimario}
          error={!!error}
        />
      )}

      {campo.tipo === 'archivo' && (() => {
        const v = value as { nombre?: string; tipo?: string; size?: number; key?: string } | undefined;
        return (
          <Box>
            {v?.key ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center', p: 1.5, borderRadius: 1,
                  border: '1px solid', borderColor: 'success.light',
                  bgcolor: 'rgba(22, 163, 74, 0.08)',
                }}
              >
                <TaskAltIcon sx={{ color: 'success.main', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{v.nombre}</Typography>
                  <Typography variant="caption">{v.size ? `${Math.round(v.size / 1024)} KB` : ''} · subido</Typography>
                </Box>
                <IconButton type="button" size="small" onClick={() => onChange(undefined)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : subiendo ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center', p: 3, borderRadius: 1, border: '2px dashed', borderColor: 'divider' }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Subiendo archivo...</Typography>
              </Stack>
            ) : (
              <Button
                component="label"
                fullWidth
                variant="outlined"
                color={error ? 'error' : 'inherit'}
                sx={{ borderStyle: 'dashed', borderWidth: 2, flexDirection: 'column', gap: 0.5, py: 3, color: 'text.secondary' }}
              >
                <CloudUploadIcon />
                <Typography variant="body2" color="text.secondary">{campo.placeholder || 'Haz clic para subir un archivo'}</Typography>
                <Typography variant="caption">Máx 15MB · PDF, imágenes</Typography>
                <Box
                  component="input"
                  type="file"
                  accept="image/*,application/pdf"
                  sx={{ display: 'none' }}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) subirArchivo(file);
                  }}
                />
              </Button>
            )}
          </Box>
        );
      })()}

      {error && (
        <Typography variant="caption" sx={{ color: 'error.main', mt: 0.5 }}>{error}</Typography>
      )}
    </Stack>
  );
}

export default function FormularioRenderer({
  formulario,
  isPreview = false,
  onSuccess,
}: FormularioRendererProps) {
  const [datos, setDatos] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pagina, setPagina] = useState(0);
  const [idioma, setIdioma] = useState<'es' | 'en'>('es');

  const color = formulario.configuracion?.colorPrimario || '#2563eb';
  const bilingue = !!formulario.configuracion?.bilingue;

  const t = (es: string, enText: string) => (idioma === 'en' ? enText : es);

  const NO_INPUT = ['heading', 'paragraph', 'divider', 'imagen', 'salto_pagina'];

  // Reparte los campos en páginas en cada 'salto_pagina'.
  const paginas = useMemo(() => {
    const pages: ICampo[][] = [[]];
    for (const c of formulario.campos) {
      if (c.tipo === 'salto_pagina') pages.push([]);
      else pages[pages.length - 1].push(c);
    }
    return pages;
  }, [formulario.campos]);

  const esMultiPagina = paginas.length > 1;
  const esUltima = pagina >= paginas.length - 1;
  const camposPagina = paginas[Math.min(pagina, paginas.length - 1)] || [];

  const validarCampos = (campos: ICampo[]): Record<string, string> => {
    const errs: Record<string, string> = {};
    for (const campo of campos) {
      if (!campo.requerido || NO_INPUT.includes(campo.tipo)) continue;
      if (isCampoVacio(campo.tipo, datos[campo.id])) errs[campo.id] = t('Este campo es requerido', 'This field is required');
    }
    return errs;
  };

  const scrollTop = () => {
    if (typeof document !== 'undefined') {
      document.querySelector('[data-form-top]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const irSiguiente = () => {
    const errs = validarCampos(camposPagina);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setPagina((p) => Math.min(p + 1, paginas.length - 1));
    scrollTop();
  };

  const irAtras = () => {
    setErrors({});
    setPagina((p) => Math.max(p - 1, 0));
    scrollTop();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // El envío de respuestas (página pública /f/[slug]) es trabajo futuro:
    // aquí solo se ejercita desde la vista previa del constructor, que nunca
    // debe pegarle a la red.
    if (isPreview) return;

    const allErrors = validarCampos(formulario.campos);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      const badPage = paginas.findIndex((pg) => pg.some((c) => allErrors[c.id]));
      if (badPage >= 0 && badPage !== pagina) { setPagina(badPage); scrollTop(); }
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const captchaToken = formulario.configuracion?.captchaActivo
        ? await getRecaptchaToken()
        : null;

      const res = await fetch(`/api/administracion-escolar/formularios/${formulario.id}/respuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datos,
          captchaToken,
          referrer: typeof window !== 'undefined' ? window.location.href : '',
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al enviar el formulario');

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 8 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: `${color}20` }}>
          <CheckCircleIcon sx={{ fontSize: 36, color }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('¡Formulario enviado!', 'Form submitted!')}</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 448 }}>
            {formulario.configuracion?.mensajeConfirmacion || t('¡Gracias! Tu solicitud fue recibida.', 'Thank you! Your submission was received.')}
          </Typography>
        </Box>
      </Stack>
    );
  }

  // Layout: grilla de 6 columnas. El ancho del campo se traduce en columnas
  // ocupadas; los bloques de diseño ocupan la fila completa.
  const spanFor = (campo: ICampo) => {
    if (NO_INPUT.includes(campo.tipo)) return { xs: 'span 6' };
    switch (campo.ancho) {
      case 'medio':  return { xs: 'span 6', sm: 'span 3' };
      case 'tercio': return { xs: 'span 6', sm: 'span 2' };
      default:       return { xs: 'span 6' };
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Box component="span" data-form-top />
      {/* Honeypot anti-spam */}
      <Box component="input" type="text" name="__hp" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

      {/* Selector de idioma (formularios bilingües) */}
      {bilingue && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={idioma}
            onChange={(_, l) => { if (l) setIdioma(l as 'es' | 'en'); }}
            sx={{ '& .Mui-selected': { bgcolor: `${color} !important`, color: '#fff !important' } }}
          >
            {(['es', 'en'] as const).map((l) => (
              <ToggleButton key={l} value={l}>{l === 'es' ? 'Español' : 'English'}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Barra de progreso (solo multi-página) */}
      {esMultiPagina && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
            <Typography variant="caption">{t('Paso', 'Step')} {pagina + 1} {t('de', 'of')} {paginas.length}</Typography>
            <Typography variant="caption">{Math.round(((pagina + 1) / paginas.length) * 100)}%</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={((pagina + 1) / paginas.length) * 100}
            sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: color } }}
          />
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', columnGap: 2, rowGap: 2.5 }}>
        {camposPagina.map((campo) => (
          <Box key={campo.id} sx={{ gridColumn: spanFor(campo) }}>
            <CampoRenderer
              campo={campo}
              value={datos[campo.id]}
              error={errors[campo.id]}
              colorPrimario={color}
              isPreview={isPreview}
              idioma={idioma}
              onChange={(val) => {
                setDatos((prev) => ({ ...prev, [campo.id]: val }));
                if (errors[campo.id]) setErrors((prev) => ({ ...prev, [campo.id]: '' }));
              }}
            />
          </Box>
        ))}

        {submitError && (
          <Box sx={{ gridColumn: 'span 6' }}>
            <Alert severity="error">{submitError}</Alert>
          </Box>
        )}

        {/* Navegación */}
        <Stack direction="row" spacing={1.5} sx={{ gridColumn: 'span 6', alignItems: 'center', pt: 0.5 }}>
          {esMultiPagina && pagina > 0 && (
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              onClick={irAtras}
              disabled={isPreview}
              startIcon={<ArrowBackIcon />}
              sx={{ height: 44, px: 2.5 }}
            >
              {t('Atrás', 'Back')}
            </Button>
          )}

          {esMultiPagina && !esUltima ? (
            <Button
              type="button"
              variant="contained"
              onClick={isPreview ? undefined : irSiguiente}
              endIcon={<ArrowForwardIcon />}
              sx={{ height: 44, px: 3, ml: 'auto', fontSize: '1rem', bgcolor: color, '&:hover': { bgcolor: color } }}
            >
              {t('Seguir', 'Next')}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || isPreview}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{
                height: 44, fontSize: '1rem',
                bgcolor: color, '&:hover': { bgcolor: color },
                ...(esMultiPagina ? { px: 3, ml: 'auto' } : { width: '100%' }),
              }}
            >
              {submitting ? t('Enviando...', 'Submitting...') : t('Enviar formulario', 'Submit form')}
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
