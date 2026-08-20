'use client';

// Portado de crm-escolar/src/components/formularios/FieldPropertiesPanel.tsx.
//
// Adaptaciones respecto al CRM:
//  - `MapeoProspecto` → `MapeoCampoZero` (ver lib/administracion-escolar/formularios):
//    ya no se mapea a un lead sino a una columna de estudiante/tutor.
//  - Se quitó `useCatalogos()` y el botón "Cargar grados de la escuela": era
//    una integración con el catálogo del CRM que no existe aquí. La tarjeta
//    de Opciones queda genérica (añadir/quitar/reordenar a mano), sin ese atajo.
import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Divider, IconButton,
  MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { ICampo, AnchoCampo } from '@/lib/administracion-escolar/formularios';
import { MAPEO_CAMPO_OPCIONES, type MapeoCampoZero } from '@/lib/administracion-escolar/formularios';

const ANCHO_OPTIONS: { value: AnchoCampo; label: string }[] = [
  { value: 'full',   label: 'Completo' },
  { value: 'medio',  label: 'Medio' },
  { value: 'tercio', label: 'Tercio' },
];

const TIPO_LABELS: Record<string, string> = {
  text: 'Texto corto', email: 'Email', phone: 'Teléfono', number: 'Número',
  textarea: 'Texto largo', select: 'Desplegable', radio: 'Opción única',
  checkboxes: 'Opciones múltiples', date: 'Fecha',
  heading: 'Encabezado', paragraph: 'Párrafo', divider: 'Separador',
};

interface FieldPropertiesPanelProps {
  campo: ICampo;
  bilingue?: boolean;
  onUpdate: (updates: Partial<ICampo>) => void;
  onClose: () => void;
  onDelete: () => void;
}

export default function FieldPropertiesPanel({
  campo,
  bilingue,
  onUpdate,
  onClose,
  onDelete,
}: FieldPropertiesPanelProps) {
  const [newOpcion, setNewOpcion] = useState('');
  const isLayout = ['heading', 'paragraph', 'divider', 'imagen', 'salto_pagina'].includes(campo.tipo);
  const hasOpciones = ['select', 'radio', 'checkboxes'].includes(campo.tipo);

  const handleImagenUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 500 * 1024) { alert('Imagen muy grande (máx 500KB)'); return; }
    const reader = new FileReader();
    reader.onload = () => onUpdate({ imagenUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const addOpcion = () => {
    const trimmed = newOpcion.trim();
    if (!trimmed) return;
    const existing = campo.opciones || [];
    if (!existing.includes(trimmed)) {
      onUpdate({ opciones: [...existing, trimmed] });
    }
    setNewOpcion('');
  };

  const removeOpcion = (op: string) => {
    onUpdate({ opciones: (campo.opciones || []).filter((o) => o !== op) });
  };

  const moveOpcion = (index: number, dir: -1 | 1) => {
    const ops = [...(campo.opciones || [])];
    const target = index + dir;
    if (target < 0 || target >= ops.length) return;
    [ops[index], ops[target]] = [ops[target], ops[index]];
    onUpdate({ opciones: ops });
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>Propiedades</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{TIPO_LABELS[campo.tipo] || campo.tipo}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.disabled' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
        <Stack spacing={2}>

          {/* Salto de página */}
          {campo.tipo === 'salto_pagina' && (
            <Alert severity="info" variant="outlined">
              <Typography variant="body2">
                Todo lo que esté <strong>debajo</strong> de este salto aparece en una <strong>página nueva</strong>. El formulario mostrará botones "Atrás / Seguir" y una barra de progreso.
              </Typography>
            </Alert>
          )}

          {/* Imagen */}
          {campo.tipo === 'imagen' && (
            <Card>
              <CardHeader title="Imagen" />
              <CardContent>
                <Stack spacing={1.5}>
                  {campo.imagenUrl ? (
                    <Stack spacing={1}>
                      <Box
                        component="img"
                        src={campo.imagenUrl}
                        alt=""
                        sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                      />
                      <Button
                        type="button"
                        size="small"
                        color="error"
                        startIcon={<CloseIcon />}
                        onClick={() => onUpdate({ imagenUrl: undefined })}
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        Quitar imagen
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      component="label"
                      variant="outlined"
                      color="inherit"
                      startIcon={<AddPhotoAlternateIcon />}
                      sx={{ borderStyle: 'dashed', py: 2, color: 'text.secondary' }}
                    >
                      Subir imagen (máx 500KB)
                      <Box component="input" type="file" accept="image/*" onChange={handleImagenUpload} sx={{ display: 'none' }} />
                    </Button>
                  )}
                  <TextField
                    label="Pie de imagen (opcional)"
                    value={campo.label}
                    onChange={(e) => onUpdate({ label: e.target.value })}
                    placeholder="Texto debajo de la imagen"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Contenido base del campo */}
          {(!['divider', 'imagen', 'salto_pagina'].includes(campo.tipo) || !isLayout) && (
            <Card>
              <CardHeader title="Contenido" />
              <CardContent>
                <Stack spacing={2}>
                  {/* Label */}
                  {!['divider', 'imagen', 'salto_pagina'].includes(campo.tipo) && (
                    campo.tipo === 'paragraph' ? (
                      <TextField
                        label="Contenido"
                        value={campo.label}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        multiline
                        rows={3}
                        placeholder="Texto del párrafo..."
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    ) : (
                      <TextField
                        label={campo.tipo === 'heading' ? 'Contenido' : 'Etiqueta'}
                        value={campo.label}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        placeholder="Etiqueta del campo"
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    )
                  )}

                  {/* Placeholder */}
                  {!isLayout && ['text', 'email', 'phone', 'number', 'textarea', 'select'].includes(campo.tipo) && (
                    <TextField
                      label="Placeholder"
                      value={campo.placeholder || ''}
                      onChange={(e) => onUpdate({ placeholder: e.target.value })}
                      placeholder="Texto de ejemplo..."
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}

                  {/* Texto de ayuda */}
                  {!isLayout && (
                    <TextField
                      label="Texto de ayuda"
                      value={campo.ayuda || ''}
                      onChange={(e) => onUpdate({ ayuda: e.target.value })}
                      placeholder="Instrucción opcional..."
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Comportamiento */}
          {!isLayout && (
            <Card>
              <CardHeader title="Comportamiento" />
              <CardContent>
                <Stack spacing={2}>
                  {/* Requerido */}
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Campo requerido</Typography>
                    <Switch
                      checked={campo.requerido}
                      onChange={(_, v) => onUpdate({ requerido: v })}
                    />
                  </Stack>

                  {/* Ancho */}
                  <Box>
                    <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>Ancho del campo</Typography>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="small"
                      value={campo.ancho || 'full'}
                      onChange={(_, v) => { if (v) onUpdate({ ancho: v as AnchoCampo }); }}
                    >
                      {ANCHO_OPTIONS.map((opt) => (
                        <ToggleButton key={opt.value} value={opt.value}>{opt.label}</ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                      Medio = 2 por fila · Tercio = 3 por fila (en pantallas grandes).
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Opciones */}
          {hasOpciones && (
            <Card>
              <CardHeader title="Opciones" />
              <CardContent>
                <Stack spacing={1}>
                  {(campo.opciones || []).map((op, i) => (
                    <Stack key={op} direction="row" spacing={0.5} sx={{ alignItems: 'center', '&:hover [data-hover-remove]': { opacity: 1 } }}>
                      <Stack sx={{ alignItems: 'center' }}>
                        <IconButton
                          type="button"
                          size="small"
                          onClick={() => moveOpcion(i, -1)}
                          disabled={i === 0}
                          sx={{ p: 0, color: 'text.disabled' }}
                        >
                          <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton
                          type="button"
                          size="small"
                          onClick={() => moveOpcion(i, 1)}
                          disabled={i === (campo.opciones?.length ?? 0) - 1}
                          sx={{ p: 0, color: 'text.disabled' }}
                        >
                          <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                      <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ flex: 1, bgcolor: 'action.hover', borderRadius: 1, px: 1, py: 0.5 }}
                      >
                        {op}
                      </Typography>
                      <IconButton
                        type="button"
                        size="small"
                        onClick={() => removeOpcion(op)}
                        data-hover-remove
                        sx={{
                          color: 'text.disabled', opacity: 0, transition: 'opacity .15s',
                          '&:hover': { color: 'error.main' },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  ))}
                  <Stack direction="row" spacing={1}>
                    <TextField
                      value={newOpcion}
                      onChange={(e) => setNewOpcion(e.target.value)}
                      placeholder="Nueva opción..."
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOpcion(); } }}
                    />
                    <Button type="button" size="small" variant="outlined" color="inherit" onClick={addOpcion} sx={{ minWidth: 40, px: 1 }}>
                      <AddIcon fontSize="small" />
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Traducción (formularios bilingües) */}
          {bilingue && campo.tipo !== 'divider' && campo.tipo !== 'salto_pagina' && (
            <Card>
              <CardHeader title="Traducción (English)" />
              <CardContent>
                <Stack spacing={1.5}>
                  {campo.tipo !== 'imagen' && (
                    <TextField
                      label={campo.tipo === 'heading' || campo.tipo === 'paragraph' ? 'Content (EN)' : 'Label (EN)'}
                      value={campo.labelEn || ''}
                      onChange={(e) => onUpdate({ labelEn: e.target.value })}
                      placeholder="English…"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                  {['text', 'email', 'phone', 'number', 'textarea', 'select'].includes(campo.tipo) && (
                    <TextField
                      label="Placeholder (EN)"
                      value={campo.placeholderEn || ''}
                      onChange={(e) => onUpdate({ placeholderEn: e.target.value })}
                      placeholder="English…"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                  {hasOpciones && (campo.opciones?.length ?? 0) > 0 && (
                    <Box>
                      <Typography variant="overline" sx={{ display: 'block' }}>Opciones (EN)</Typography>
                      <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Una por cada opción, en el mismo orden.</Typography>
                      <Stack spacing={1}>
                        {(campo.opciones || []).map((op, i) => (
                          <Stack key={op} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="caption" noWrap sx={{ width: 80, flexShrink: 0 }}>{op}</Typography>
                            <TextField
                              value={campo.opcionesEn?.[i] || ''}
                              onChange={(e) => {
                                const arr = [...(campo.opcionesEn || [])];
                                while (arr.length < (campo.opciones?.length ?? 0)) arr.push('');
                                arr[i] = e.target.value;
                                onUpdate({ opcionesEn: arr });
                              }}
                              placeholder="English…"
                            />
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Mapeo a estudiante/tutor — divergencia deliberada del CRM: allí
              mapea a un lead; aquí a la ficha real de un estudiante o tutor.
              Solo declara el destino: la capa que de verdad copia el valor
              se construye después (ver lib/administracion-escolar/formularios.ts). */}
          {!isLayout && (
            <Card>
              <CardHeader title="Mapear a campo del estudiante/tutor" />
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="caption">
                    Si se selecciona, este valor podrá aplicarse a la ficha del estudiante o del tutor cuando alguien revise la respuesta.
                  </Typography>
                  <TextField
                    select
                    value={campo.mapaA || ''}
                    onChange={(e) => onUpdate({ mapaA: (e.target.value as MapeoCampoZero) || undefined })}
                  >
                    <MenuItem value="">Sin mapear</MenuItem>
                    {MAPEO_CAMPO_OPCIONES.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          type="button"
          fullWidth
          size="small"
          variant="contained"
          color="error"
          startIcon={<DeleteOutlinedIcon />}
          onClick={onDelete}
        >
          Eliminar campo
        </Button>
      </Box>
    </Box>
  );
}
