'use client';

// Portado de crm-escolar/src/components/formularios/FieldCard.tsx.
// El drag ref/attributes/listeners de dnd-kit se dejan intactos; solo cambia
// el import de `ICampo` (viene de lib/administracion-escolar/formularios, no
// del modelo Mongo) y se añadió @dnd-kit/* como dependencia de Zero (no
// existía: el proyecto no tenía listas reordenables por arrastre).
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Card, Chip, IconButton, Stack, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import TuneIcon from '@mui/icons-material/Tune';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import MailIcon from '@mui/icons-material/Mail';
import PhoneIcon from '@mui/icons-material/Phone';
import NumbersIcon from '@mui/icons-material/Numbers';
import NotesIcon from '@mui/icons-material/Notes';
import ArrowDropDownCircleIcon from '@mui/icons-material/ArrowDropDownCircle';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TitleIcon from '@mui/icons-material/Title';
import ArticleIcon from '@mui/icons-material/Article';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import ScheduleIcon from '@mui/icons-material/Schedule';
import StarIcon from '@mui/icons-material/Star';
import DrawIcon from '@mui/icons-material/Draw';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import type { ICampo } from '@/lib/administracion-escolar/formularios';

const TIPO_ICONS: Record<string, React.ElementType> = {
  text: TextFieldsIcon, email: MailIcon, phone: PhoneIcon, number: NumbersIcon,
  textarea: NotesIcon, select: ArrowDropDownCircleIcon, radio: RadioButtonCheckedIcon,
  checkboxes: CheckBoxIcon, date: CalendarMonthIcon, heading: TitleIcon,
  paragraph: ArticleIcon, divider: RemoveIcon,
  nombre_completo: PersonIcon, direccion: PlaceIcon, hora: ScheduleIcon,
  estrellas: StarIcon, firma: DrawIcon, archivo: UploadFileIcon,
  imagen: ImageIcon, salto_pagina: AutoStoriesIcon,
};

const TIPO_LABELS: Record<string, string> = {
  text: 'Texto corto', email: 'Email', phone: 'Teléfono', number: 'Número',
  textarea: 'Texto largo', select: 'Desplegable', radio: 'Opción única',
  checkboxes: 'Opciones múltiples', date: 'Fecha',
  heading: 'Encabezado', paragraph: 'Párrafo', divider: 'Separador',
  nombre_completo: 'Nombre completo', direccion: 'Dirección', hora: 'Hora',
  estrellas: 'Valoración', firma: 'Firma', archivo: 'Carga de archivo',
  imagen: 'Imagen', salto_pagina: 'Salto de página',
};

interface FieldCardProps {
  campo: ICampo;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// Cluster de acciones que solo aparece al pasar el mouse: la lista se queda
// tranquila y cada tarjeta guarda sus controles a un pixel de distancia.
const HOVER_ACTIONS = {
  opacity: 0,
  transition: 'opacity .15s',
  flexShrink: 0,
} as const;

function selectedSx(isSelected: boolean) {
  return {
    borderColor: isSelected ? 'primary.main' : 'divider',
    boxShadow: isSelected ? 1 : 0,
    '&:hover [data-hover-actions]': { opacity: 1 },
  };
}

export default function FieldCard({ campo, isSelected, onSelect, onDelete }: FieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: campo.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = TIPO_ICONS[campo.tipo] || TextFieldsIcon;

  const dragHandle = (
    <IconButton
      {...attributes}
      {...listeners}
      size="small"
      disableRipple
      onClick={(e) => e.stopPropagation()}
      type="button"
      sx={{ touchAction: 'none', cursor: 'grab', color: 'text.disabled', flexShrink: 0, '&:active': { cursor: 'grabbing' } }}
    >
      <DragIndicatorIcon fontSize="small" />
    </IconButton>
  );

  if (campo.tipo === 'salto_pagina') {
    return (
      <Card
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        sx={{
          ...selectedSx(isSelected),
          borderStyle: isSelected ? 'solid' : 'dashed',
          bgcolor: 'action.hover',
          px: 1.5, py: 1,
          display: 'flex', alignItems: 'center', gap: 1,
        }}
      >
        {dragHandle}
        <Box sx={{ flex: 1, borderTop: '1px dashed', borderColor: 'divider' }} />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'info.main', whiteSpace: 'nowrap' }}>
          <AutoStoriesIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>Nueva página</Typography>
        </Stack>
        <Box sx={{ flex: 1, borderTop: '1px dashed', borderColor: 'divider' }} />
        <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} data-hover-actions sx={{ ...HOVER_ACTIONS, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Card>
    );
  }

  if (campo.tipo === 'imagen') {
    return (
      <Card
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        sx={{ ...selectedSx(isSelected), px: 1.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
      >
        {dragHandle}
        {campo.imagenUrl ? (
          <Box
            component="img"
            src={campo.imagenUrl}
            alt=""
            sx={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
          />
        ) : (
          <Box sx={{ height: 48, width: 48, borderRadius: 1, bgcolor: 'action.hover', display: 'grid', placeItems: 'center', color: 'text.disabled' }}>
            <ImageIcon fontSize="small" />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>Imagen</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {campo.imagenUrl ? (campo.label || 'Imagen subida') : 'Sin imagen — haz clic para subir'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} data-hover-actions sx={HOVER_ACTIONS}>
          <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} sx={{ color: 'text.disabled' }}>
            <TuneIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </Card>
    );
  }

  if (campo.tipo === 'divider') {
    return (
      <Card
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        sx={{
          ...selectedSx(isSelected),
          borderStyle: isSelected ? 'solid' : 'dashed',
          px: 1.5, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1,
        }}
      >
        {dragHandle}
        <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
        <Typography variant="caption">Separador</Typography>
        <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
        <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} data-hover-actions sx={{ ...HOVER_ACTIONS, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Card>
    );
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      sx={{ ...selectedSx(isSelected), px: 1.5, py: 1.75, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
    >
      {/* Manija de arrastre */}
      {dragHandle}

      {/* Icono + contenido */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <Box sx={{ width: 20, height: 20, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.secondary' }}>
            <Icon sx={{ fontSize: 13 }} />
          </Box>
          <Typography variant="overline" sx={{ lineHeight: 1.4 }}>
            {TIPO_LABELS[campo.tipo]}
          </Typography>
          {campo.requerido && (
            <Typography variant="caption" sx={{ color: 'error.main' }}>*requerido</Typography>
          )}
        </Stack>

        {campo.tipo === 'heading' && (
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{campo.label || 'Encabezado'}</Typography>
        )}
        {campo.tipo === 'paragraph' && (
          <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {campo.label || 'Párrafo de texto'}
          </Typography>
        )}
        {!['heading', 'paragraph', 'divider'].includes(campo.tipo) && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{campo.label || 'Campo sin etiqueta'}</Typography>
            {campo.placeholder && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }} noWrap>{campo.placeholder}</Typography>
            )}
            {['select', 'radio', 'checkboxes'].includes(campo.tipo) && campo.opciones && campo.opciones.length > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                {campo.opciones.slice(0, 3).join(' · ')}
                {campo.opciones.length > 3 && ` +${campo.opciones.length - 3} más`}
              </Typography>
            )}
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}>
              {campo.mapaA && (
                <Chip size="small" variant="outlined" color="success" label={`→ ${campo.mapaA}`} />
              )}
              {campo.ancho && campo.ancho !== 'full' && (
                <Chip size="small" variant="outlined" color="info" label={campo.ancho === 'medio' ? '½ ancho' : '⅓ ancho'} />
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {/* Acciones */}
      <Stack direction="row" spacing={0.5} data-hover-actions sx={HOVER_ACTIONS}>
        <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} sx={{ color: 'text.disabled' }}>
          <TuneIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
    </Card>
  );
}
