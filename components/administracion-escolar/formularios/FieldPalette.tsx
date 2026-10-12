'use client';

// Portado de crm-escolar/src/components/formularios/FieldPalette.tsx.
// Único cambio real: `TipoCampo` viene de lib/administracion-escolar/formularios
// en vez de @/models/Formulario (Mongo).

import { Box, Stack, Typography, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import {
  Type, Mail, Phone, Hash, AlignLeft,
  ChevronDown, Circle, CheckSquare, Calendar,
  Heading, FileText, Minus,
  User, MapPin, Clock, Star, PenTool, Upload,
  Image as ImageIcon, Files,
} from 'lucide-react';
import type { TipoCampo } from '@/lib/administracion-escolar/formularios';

interface FieldType {
  tipo: TipoCampo;
  label: string;
  icon: React.ElementType;
  group: string;
}

const FIELD_TYPES: FieldType[] = [
  // Básicos
  { tipo: 'text',       label: 'Texto corto',     icon: Type,         group: 'Básicos' },
  { tipo: 'email',      label: 'Email',            icon: Mail,         group: 'Básicos' },
  { tipo: 'phone',      label: 'Teléfono',         icon: Phone,        group: 'Básicos' },
  { tipo: 'number',     label: 'Número',           icon: Hash,         group: 'Básicos' },
  { tipo: 'textarea',   label: 'Texto largo',      icon: AlignLeft,    group: 'Básicos' },
  { tipo: 'date',       label: 'Fecha',            icon: Calendar,     group: 'Básicos' },
  // Opciones
  { tipo: 'select',     label: 'Desplegable',      icon: ChevronDown,  group: 'Opciones' },
  { tipo: 'radio',      label: 'Opción única',     icon: Circle,       group: 'Opciones' },
  { tipo: 'checkboxes', label: 'Opciones múltiples',icon: CheckSquare, group: 'Opciones' },
  // Avanzados
  { tipo: 'nombre_completo', label: 'Nombre completo', icon: User,    group: 'Avanzados' },
  { tipo: 'direccion',  label: 'Dirección',        icon: MapPin,       group: 'Avanzados' },
  { tipo: 'hora',       label: 'Hora',             icon: Clock,        group: 'Avanzados' },
  { tipo: 'estrellas',  label: 'Valoración',       icon: Star,         group: 'Avanzados' },
  { tipo: 'firma',      label: 'Firma',            icon: PenTool,      group: 'Avanzados' },
  { tipo: 'archivo',    label: 'Carga de archivo', icon: Upload,       group: 'Avanzados' },
  // Diseño
  { tipo: 'heading',    label: 'Encabezado',       icon: Heading,      group: 'Diseño' },
  { tipo: 'paragraph',  label: 'Párrafo',          icon: FileText,     group: 'Diseño' },
  { tipo: 'imagen',     label: 'Imagen',           icon: ImageIcon,    group: 'Diseño' },
  { tipo: 'divider',    label: 'Separador',        icon: Minus,        group: 'Diseño' },
  { tipo: 'salto_pagina', label: 'Salto de página', icon: Files,       group: 'Diseño' },
];

interface FieldPaletteProps {
  onAdd: (tipo: TipoCampo) => void;
}

export default function FieldPalette({ onAdd }: FieldPaletteProps) {
  const groups = Array.from(new Set(FIELD_TYPES.map((f) => f.group)));

  return (
    <Stack spacing={2.5}>
      {groups.map((group) => (
        <Box key={group}>
          <Typography variant="overline" sx={{ display: 'block', px: 0.5, mb: 0.5 }}>{group}</Typography>
          <List dense disablePadding>
            {FIELD_TYPES.filter((f) => f.group === group).map((ft) => {
              const Icon = ft.icon;
              return (
                <ListItemButton key={ft.tipo} onClick={() => onAdd(ft.tipo)} sx={{ borderRadius: 1.5 }}>
                  <ListItemIcon sx={{ minWidth: 30, color: 'text.disabled' }}>
                    <Icon size={16} />
                  </ListItemIcon>
                  <ListItemText primary={ft.label} slotProps={{ primary: { variant: 'body2' } }} />
                  <AddIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      ))}
    </Stack>
  );
}

export { FIELD_TYPES };
export type { FieldType };
