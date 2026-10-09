'use client';

/** Piezas que comparten las tres pestañas. */

import Box from '@mui/material/Box';
import { CheckCircle2, Clock, XCircle, FileEdit, HelpCircle } from 'lucide-react';

export const CARD  = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;
export const INPUT = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;

/**
 * Los estados de Meta más el nuestro.
 *
 * BORRADOR no viene de Meta: es lo que todavía no se ha mandado y se puede
 * reescribir. Va primero porque es donde vive el trabajo en curso.
 */
export const ESTADOS: Record<string, { etiqueta: string; color: string; fondo: string; icono: typeof CheckCircle2 }> = {
  BORRADOR:       { etiqueta: 'Borrador',   color: '#374151', fondo: '#f3f4f6', icono: FileEdit },
  APPROVED:       { etiqueta: 'Aprobada',   color: '#065f46', fondo: '#d1fae5', icono: CheckCircle2 },
  PENDING:        { etiqueta: 'En revisión', color: '#92400e', fondo: '#fef3c7', icono: Clock },
  PENDING_REVIEW: { etiqueta: 'En revisión', color: '#92400e', fondo: '#fef3c7', icono: Clock },
  REJECTED:       { etiqueta: 'Rechazada',  color: '#991b1b', fondo: '#fee2e2', icono: XCircle },
  PAUSED:         { etiqueta: 'Pausada',    color: '#991b1b', fondo: '#fee2e2', icono: XCircle },
  DISABLED:       { etiqueta: 'Desactivada', color: '#991b1b', fondo: '#fee2e2', icono: XCircle },
  DESCONOCIDO:    { etiqueta: 'Sin estado', color: '#4b5563', fondo: '#f3f4f6', icono: HelpCircle },
};

export function Chip({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? ESTADOS.DESCONOCIDO;
  const Icono = e.icono;
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
      px: 1, py: 0.25, bgcolor: e.fondo, color: e.color,
      borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <Icono size={11} /> {e.etiqueta}
    </Box>
  );
}

/**
 * Las categorías de Meta, que no son un rótulo: cambian cuánto cuesta el
 * mensaje y si el padre puede cortarlo de un toque.
 */
export const CATEGORIAS: Record<string, { etiqueta: string; color: string; fondo: string; resumen: string }> = {
  utility: {
    etiqueta: 'Utility', color: '#1e40af', fondo: '#dbeafe',
    resumen: 'Transaccional: avisa sobre algo que la persona ya tiene, como una factura suya. Es la que corresponde a los avisos de cobro.',
  },
  marketing: {
    etiqueta: 'Marketing', color: '#92400e', fondo: '#fef3c7',
    resumen: 'Promocional. Exige que el destinatario haya aceptado recibirla, cuesta más, tiene tope diario y se bloquea desde el propio mensaje.',
  },
  authentication: {
    etiqueta: 'Authentication', color: '#5b21b6', fondo: '#ede9fe',
    resumen: 'Solo para códigos de un solo uso. No sirve para avisar de un cobro.',
  },
};

export function ChipCategoria({ categoria }: { categoria: string }) {
  const c = CATEGORIAS[categoria?.toLowerCase()] ?? {
    etiqueta: categoria || '—', color: '#4b5563', fondo: '#f3f4f6', resumen: '',
  };
  return (
    <Box component="span" title={c.resumen}
      sx={{
        px: 1, py: 0.25, bgcolor: c.fondo, color: c.color, borderRadius: '6px',
        fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
      {c.etiqueta}
    </Box>
  );
}

export function Etiqueta({ texto, color, fondo }: { texto: string; color: string; fondo: string }) {
  return (
    <Box component="span" sx={{
      px: 1, py: 0.25, bgcolor: fondo, color, borderRadius: '6px',
      fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {texto}
    </Box>
  );
}

export function Boton({ children, onClick, disabled, variante = 'primario', title }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variante?: 'primario' | 'suave' | 'peligro';
  title?: string;
}) {
  const estilos = {
    primario: { bgcolor: '#3658e1', color: '#fff', border: 'none', '&:hover': { bgcolor: '#2a45c4' } },
    suave:    { bgcolor: '#fff', color: '#4b5563', border: '1px solid #e5e7eb', '&:hover': { bgcolor: '#f9fafb' } },
    peligro:  { bgcolor: '#fff', color: '#b91c1c', border: '1px solid #fecaca', '&:hover': { bgcolor: '#fef2f2' } },
  }[variante];

  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled} title={title}
      sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
        borderRadius: '8px', px: 1.75, py: 0.875, cursor: 'pointer',
        fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap',
        '&:disabled': { opacity: 0.5, cursor: 'default' },
        ...estilos,
      }}>
      {children}
    </Box>
  );
}

export interface VariableVista { pos: number; nombre: string; tipo: string; ejemplo: string }

export interface PlantillaVista {
  id: number | null;
  nombre: string;
  idioma: string;
  categoria: string;
  estado: string;
  aprobado: boolean;
  motivoRechazo: string | null;
  cuerpo: string;
  encabezado: string | null;
  pie: string | null;
  variables: VariableVista[];
  boton: { texto: string; url: string; ejemplo: string } | null;
  esBorrador: boolean;
  soloEnMeta: boolean;
  usoAvisos: number;
  usoNegocios: number;
}
