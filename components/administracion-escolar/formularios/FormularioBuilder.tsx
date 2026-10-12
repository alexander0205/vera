'use client';

// Portado de crm-escolar/src/components/formularios/FormularioBuilder.tsx.
//
// Adaptaciones respecto al CRM (todas deliberadas):
//  - Se quitó TODA la captura de leads: `REQUERIDOS_LEAD`, el aviso "faltan
//    campos obligatorios", `addCampoRequerido`, y la tarjeta "Captura de
//    leads" con el destino de Kanban (`tableroDestino`/`estadoDestino`,
//    `SelectBuscable`, el fetch a `/api/tableros`). Zero no tiene leads ni
//    Kanban: un formulario contestado aquí genera una RESPUESTA que alguien
//    revisa, no una tarjeta que se mueve sola a un tablero.
//  - `useTerminologia()` y `useCatalogos()` (hooks del CRM) desaparecieron
//    con lo anterior — no quedó nada que los necesitara.
//  - Guarda contra `PATCH /api/administracion-escolar/formularios/[id]` en
//    vez de `PUT /api/formularios/[id]`, y el id es numérico (Postgres
//    serial), no un ObjectId de Mongo.
//  - "Mapear a campo de prospecto" → "Mapear a campo del estudiante/tutor"
//    vive en FieldPropertiesPanel, no aquí.
//  - `EmptyState` de components/app/Primitivos (CRM) → ./EmptyState (propio).
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Chip,
  CircularProgress, Divider, IconButton, Link as MuiLink, Stack,
  Switch, Tab as MuiTab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LinkIcon from '@mui/icons-material/Link';
import CheckIcon from '@mui/icons-material/Check';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import { toast } from 'sonner';
import { EmptyState } from './EmptyState';
import FieldPalette from './FieldPalette';
import FieldCard from './FieldCard';
import FieldPropertiesPanel from './FieldPropertiesPanel';
import FormularioRenderer from './FormularioRenderer';
import type { ICampo, IFormularioConfig, TipoCampo } from '@/lib/administracion-escolar/formularios';
import { configuracionPorDefecto } from '@/lib/administracion-escolar/formularios';
import type { AdminEscolarFormulario } from '@/lib/db/schema';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultCampo(tipo: TipoCampo): ICampo {
  const labels: Partial<Record<TipoCampo, string>> = {
    text: 'Nombre', email: 'Correo electrónico', phone: 'Teléfono',
    number: 'Número', textarea: 'Mensaje', select: 'Selecciona una opción',
    radio: 'Elige una opción', checkboxes: 'Selecciona las que apliquen',
    date: 'Fecha', heading: 'Título de sección', paragraph: 'Escribe aquí tu texto de presentación...',
    divider: '—',
    nombre_completo: 'Nombre completo', direccion: 'Dirección', hora: 'Hora',
    estrellas: 'Tu valoración', firma: 'Firma', archivo: 'Adjunta un archivo',
    imagen: '', salto_pagina: '',
  };
  const hasOpciones = ['select', 'radio', 'checkboxes'].includes(tipo);
  return {
    id: generateId(),
    tipo,
    label: labels[tipo] || 'Campo',
    requerido: !['heading', 'paragraph', 'divider', 'imagen', 'salto_pagina'].includes(tipo),
    opciones: hasOpciones ? ['Opción 1', 'Opción 2'] : undefined,
  };
}

interface FormularioBuilderProps {
  formulario: AdminEscolarFormulario;
}

type Tab = 'campos' | 'configuracion';

// Fila de selector de color: swatch nativo + campo hex. Usada por los tres
// colores del tema en la pestaña Config.
function ColorField({
  label, value, fallback, onChange, onClear, placeholder,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  return (
    <Box>
      <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>{label}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          component="input"
          type="color"
          value={value || fallback}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          sx={{
            width: 32, height: 32, p: 0, cursor: 'pointer',
            borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'transparent',
          }}
        />
        <TextField
          value={onClear ? (value || '') : (value || fallback)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          slotProps={{ htmlInput: { maxLength: 7, style: { fontFamily: 'monospace' } } }}
        />
        {onClear && value && (
          <IconButton size="small" type="button" onClick={onClear} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

export default function FormularioBuilder({ formulario: initial }: FormularioBuilderProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState(initial.nombre);
  const [descripcion, setDescripcion] = useState(initial.descripcion || '');
  const [campos, setCampos] = useState<ICampo[]>((initial.campos as unknown as ICampo[]) || []);
  const [config, setConfig] = useState<IFormularioConfig>(
    (initial.configuracion as unknown as IFormularioConfig) || configuracionPorDefecto(),
  );
  const [activo, setActivo] = useState(initial.activo);
  const [selectedCampoId, setSelectedCampoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>('campos');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedCampo = campos.find((c) => c.id === selectedCampoId) || null;
  const activeCampo = campos.find((c) => c.id === activeId) || null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecciona una imagen'); return; }
    if (file.size > 200 * 1024) { toast.error('Imagen muy grande (máx 200KB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setConfig((c) => ({ ...c, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const addCampo = useCallback((tipo: TipoCampo) => {
    const nuevo = defaultCampo(tipo);
    setCampos((prev) => [...prev, nuevo]);
    setSelectedCampoId(nuevo.id);
  }, []);

  const updateCampo = useCallback((id: string, updates: Partial<ICampo>) => {
    setCampos((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const deleteCampo = useCallback((id: string) => {
    setCampos((prev) => prev.filter((c) => c.id !== id));
    setSelectedCampoId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCampos((prev) => {
        const oldIndex = prev.findIndex((c) => c.id === active.id);
        const newIndex = prev.findIndex((c) => c.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/administracion-escolar/formularios/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, descripcion, campos, configuracion: config, activo }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast.success('Formulario guardado');
    } catch {
      toast.error('Error al guardar el formulario');
    } finally {
      setSaving(false);
    }
  };

  // El slug puede cambiar al guardar si se renombró el formulario (ver
  // PATCH del API), así que el enlace mostrado usa siempre el último que
  // devolvió el servidor... salvo que aún no se haya guardado, en cuyo caso
  // se muestra el que trajo la carga inicial. Es informativo nada más: la
  // ruta /f/[slug] todavía no existe (ver nota de la tarjeta "Enlace público").
  const [slugActual] = useState(initial.slug);

  const copyLink = () => {
    const url = `${window.location.origin}/f/${slugActual}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Enlace copiado');
    });
  };

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/f/${slugActual}`
    : `/f/${slugActual}`;

  return (
    // `height: '100%'` y no '100vh': el constructor vive DENTRO del shell del
    // módulo (rail + ModuleHeader ya ocupan su propio espacio arriba). Un
    // 100vh aquí se sale del contenedor y empuja la barra superior fuera de
    // vista — el mismo gotcha que ya se documentó para el 100vh del POS.
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Barra superior */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center', flexShrink: 0, px: 2, py: 1.5,
          bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <IconButton size="small" type="button" onClick={() => router.push('/escolar/documentos/formularios')}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del formulario"
            variant="standard"
            fullWidth={false}
            slotProps={{ input: { disableUnderline: true, sx: { fontSize: '1rem', fontWeight: 600 } } }}
            sx={{ maxWidth: 320 }}
          />
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {/* Activo/inactivo */}
          <Tooltip title={activo ? 'Formulario activo' : 'Formulario inactivo'}>
            <Chip
              size="small"
              clickable
              onClick={() => setActivo((v) => !v)}
              color={activo ? 'success' : 'default'}
              variant={activo ? 'filled' : 'outlined'}
              label={activo ? 'Activo' : 'Inactivo'}
            />
          </Tooltip>

          {/* Copiar enlace */}
          <Button
            type="button"
            variant="outlined"
            color="inherit"
            size="small"
            onClick={copyLink}
            startIcon={copied ? <CheckIcon /> : <LinkIcon />}
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>

          {/* Vista previa */}
          <Button
            type="button"
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => setPreview((v) => !v)}
            startIcon={preview ? <VisibilityOffIcon /> : <VisibilityIcon />}
          >
            {preview ? 'Editor' : 'Vista previa'}
          </Button>

          {/* Guardar */}
          <Button
            type="button"
            variant="contained"
            size="small"
            onClick={save}
            disabled={saving}
            startIcon={saving
              ? <CircularProgress size={14} color="inherit" />
              : saved
              ? <CheckIcon />
              : <SaveIcon />}
          >
            {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
          </Button>
        </Stack>
      </Stack>

      {/* Cuerpo */}
      {preview ? (
        /* Vista previa */
        <Box
          sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', p: 4 }}
          style={{ backgroundColor: config.colorFondo || '#f3f4f6' }}
        >
          <Box
            sx={{ width: '100%', maxWidth: 672, borderRadius: 3, overflow: 'hidden', boxShadow: 1 }}
            style={{ backgroundColor: config.colorTarjeta || '#ffffff' }}
          >
            <Box sx={{ height: 8, width: '100%' }} style={{ backgroundColor: config.colorPrimario || '#2563eb' }} />
            <Box sx={{ p: 4 }}>
              {config.logoUrl && (
                <Box component="img" src={config.logoUrl} alt="Logo" sx={{ height: 40, mb: 3, objectFit: 'contain' }} />
              )}
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>{nombre || 'Sin título'}</Typography>
              {descripcion && <Typography color="text.secondary" sx={{ mb: 4 }}>{descripcion}</Typography>}
              <FormularioRenderer
                formulario={{
                  id: initial.id,
                  nombre,
                  descripcion,
                  campos,
                  configuracion: config,
                }}
                isPreview
              />
            </Box>
          </Box>
        </Box>
      ) : (
        /* Editor */
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Panel izquierdo: paleta + config */}
          <Box sx={{
            width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
            bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider',
          }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as Tab)}
              variant="fullWidth"
              sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <MuiTab value="campos" label="Campos" />
              <MuiTab value="configuracion" label="Config" icon={<SettingsIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
            </Tabs>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
              {tab === 'campos' && <FieldPalette onAdd={addCampo} />}

              {tab === 'configuracion' && (
                <Stack spacing={2}>
                  <Card>
                    <CardHeader title="Apariencia" />
                    <CardContent>
                      <Stack spacing={2}>
                        <TextField
                          label="Descripción"
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          multiline
                          rows={3}
                          placeholder="Descripción del formulario..."
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <ColorField
                          label="Color principal"
                          value={config.colorPrimario}
                          fallback="#2563eb"
                          onChange={(v) => setConfig((c) => ({ ...c, colorPrimario: v }))}
                        />
                        <ColorField
                          label="Fondo de página"
                          value={config.colorFondo}
                          fallback="#f9fafb"
                          placeholder="#f9fafb"
                          onChange={(v) => setConfig((c) => ({ ...c, colorFondo: v || undefined }))}
                          onClear={() => setConfig((c) => ({ ...c, colorFondo: undefined }))}
                        />
                        <ColorField
                          label="Fondo de la tarjeta"
                          value={config.colorTarjeta}
                          fallback="#ffffff"
                          placeholder="#ffffff"
                          onChange={(v) => setConfig((c) => ({ ...c, colorTarjeta: v || undefined }))}
                          onClear={() => setConfig((c) => ({ ...c, colorTarjeta: undefined }))}
                        />

                        {/* Logo */}
                        <Box>
                          <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>Logo del formulario</Typography>
                          {config.logoUrl ? (
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                              <Box
                                component="img"
                                src={config.logoUrl}
                                alt="Logo"
                                sx={{ height: 40, width: 40, objectFit: 'contain', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
                              />
                              <Button
                                type="button"
                                size="small"
                                color="error"
                                startIcon={<CloseIcon />}
                                onClick={() => setConfig((c) => ({ ...c, logoUrl: undefined }))}
                              >
                                Quitar
                              </Button>
                            </Stack>
                          ) : (
                            <Button
                              component="label"
                              fullWidth
                              variant="outlined"
                              color="inherit"
                              startIcon={<AddPhotoAlternateIcon />}
                              sx={{ borderStyle: 'dashed', color: 'text.secondary' }}
                            >
                              Subir logo (máx 200KB)
                              <Box component="input" type="file" accept="image/*" onChange={handleLogoUpload} sx={{ display: 'none' }} />
                            </Button>
                          )}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader title="Tras el envío" />
                    <CardContent>
                      <Stack spacing={2}>
                        <TextField
                          label="Mensaje de confirmación"
                          value={config.mensajeConfirmacion || ''}
                          onChange={(e) => setConfig((c) => ({ ...c, mensajeConfirmacion: e.target.value }))}
                          multiline
                          rows={3}
                          placeholder="¡Gracias! Tu formulario fue recibido."
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <TextField
                          label="Notificar envíos a email"
                          type="email"
                          value={config.notificarEmail || ''}
                          onChange={(e) => setConfig((c) => ({ ...c, notificarEmail: e.target.value || undefined }))}
                          placeholder="admin@colegio.edu.do"
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader title="Opciones avanzadas" />
                    <CardContent>
                      <Stack spacing={2}>
                        {/* Bilingüe */}
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="body2">Formulario bilingüe (ES/EN)</Typography>
                            <Typography variant="caption">Muestra un selector de idioma y usa las traducciones</Typography>
                          </Box>
                          <Switch
                            checked={!!config.bilingue}
                            onChange={(_, v) => setConfig((c) => ({ ...c, bilingue: v }))}
                          />
                        </Stack>

                        <Divider />

                        {/* Captcha anti-spam */}
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="body2">Captcha anti-spam</Typography>
                            <Typography variant="caption">reCAPTCHA v3 (requiere claves)</Typography>
                          </Box>
                          <Switch
                            checked={!!config.captchaActivo}
                            onChange={(_, v) => setConfig((c) => ({ ...c, captchaActivo: v }))}
                          />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader title="Enlace público" />
                    <CardContent>
                      <Stack spacing={1}>
                        <MuiLink
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="caption"
                          sx={{ wordBreak: 'break-all' }}
                        >
                          {publicUrl}
                        </MuiLink>
                        {/* La página pública /f/[slug] todavía no existe: este
                            constructor es la primera mitad del módulo. El
                            enlace se muestra igual porque el slug ya queda
                            fijado desde ahora. */}
                        <Typography variant="caption" color="text.disabled">
                          Aún no publicado — la página pública se activa en una fase posterior.
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              )}
            </Box>
          </Box>

          {/* Centro: lienzo */}
          <Box
            sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: 3 }}
            onClick={() => setSelectedCampoId(null)}
          >
            <Box sx={{ maxWidth: 672, mx: 'auto' }}>
              {/* Cabecera del formulario, en vivo */}
              <Card sx={{ mb: 1.5, overflow: 'hidden' }}>
                <Box sx={{ height: 6, width: '100%' }} style={{ backgroundColor: config.colorPrimario || '#2563eb' }} />
                <CardContent>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{nombre || 'Sin título'}</Typography>
                  {descripcion && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{descripcion}</Typography>}
                </CardContent>
              </Card>

              {/* Campos */}
              <Card onClick={(e) => e.stopPropagation()}>
                <CardContent>
                  {campos.length === 0 ? (
                    <Box onClick={() => setTab('campos')} sx={{ cursor: 'pointer' }}>
                      <EmptyState
                        icon={<AddCircleIcon sx={{ fontSize: 40 }} />}
                        titulo="Agrega campos desde el panel izquierdo"
                        descripcion="Haz clic en cualquier tipo de campo para agregarlo"
                      />
                    </Box>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                      <SortableContext
                        items={campos.map((c) => c.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <Stack spacing={1}>
                          {campos.map((campo) => (
                            <FieldCard
                              key={campo.id}
                              campo={campo}
                              isSelected={selectedCampoId === campo.id}
                              onSelect={() => setSelectedCampoId(campo.id)}
                              onDelete={() => deleteCampo(campo.id)}
                            />
                          ))}
                        </Stack>
                      </SortableContext>
                      <DragOverlay>
                        {activeCampo ? (
                          <Card sx={{ borderColor: 'primary.main', boxShadow: 6, px: 1.5, py: 1.75, opacity: 0.95 }}>
                            <Typography variant="overline" sx={{ display: 'block' }}>{activeCampo.tipo}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{activeCampo.label || 'Campo'}</Typography>
                          </Card>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}

                  {campos.length > 0 && (
                    <Button
                      type="button"
                      fullWidth
                      variant="outlined"
                      color="inherit"
                      onClick={() => setTab('campos')}
                      startIcon={<AddCircleIcon />}
                      sx={{ mt: 1.5, borderStyle: 'dashed', color: 'text.secondary' }}
                    >
                      Agregar campo
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Vista previa del botón de envío */}
              <Card sx={{ mt: 1.5 }}>
                <CardContent>
                  <Box
                    sx={{
                      width: '100%', py: 1.5, borderRadius: 1, textAlign: 'center',
                      color: '#fff', fontSize: '0.875rem', fontWeight: 600,
                      opacity: 0.75, cursor: 'not-allowed',
                    }}
                    style={{ backgroundColor: config.colorPrimario || '#2563eb' }}
                  >
                    Enviar formulario
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Panel derecho: propiedades */}
          <Box sx={{
            flexShrink: 0,
            width: selectedCampo ? 288 : 0,
            overflow: selectedCampo ? 'visible' : 'hidden',
            transition: 'width .2s',
            bgcolor: 'background.paper',
            borderLeft: '1px solid', borderColor: 'divider',
          }}>
            {selectedCampo && (
              <FieldPropertiesPanel
                campo={selectedCampo}
                bilingue={!!config.bilingue}
                onUpdate={(updates) => updateCampo(selectedCampo.id, updates)}
                onClose={() => setSelectedCampoId(null)}
                onDelete={() => deleteCampo(selectedCampo.id)}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
