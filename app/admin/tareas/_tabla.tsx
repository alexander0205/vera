'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { ExternalLink, Sparkles } from 'lucide-react';
import { TablaServidor, type EstadoTabla, type FiltroUI } from '@/components/admin/TablaServidor';
import type { FilaTarea } from '@/lib/admin/tablas';
import { etiquetaAtiende, inicialesDe } from '@/lib/administracion-escolar/tareas-equipo';
import { fechaDeDia, fechaRelativa as cuandoLlego } from '@/lib/admin/fecha';

const ESTADO = {
  abierta: { texto: 'Abierta', fondo: '#eef2fe', color: '#2a45c4' },
  en_proceso: { texto: 'En proceso', fondo: '#f5f3ff', color: '#5b21b6' },
  en_revision: { texto: 'En revisión', fondo: '#fffbeb', color: '#92400e' },
  completada: { texto: 'Completada', fondo: '#f0fdf4', color: '#166534' },
} as const;
const DE = { alumno: 'Alumno', familia: 'Familia', colegio: 'Colegio' } as const;

const dia = fechaDeDia;

/**
 * Entra al colegio de la tarea y la abre en «Por revisar». El panel no la
 * resuelve aquí: la conversación, los archivos y los cambios de estado viven en
 * el colegio, con sus permisos de siempre.
 */
async function abrirEnElColegio(f: FilaTarea): Promise<boolean> {
  try {
    const r = await fetch('/api/empresa/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: f.colegioId }) });
    if (!r.ok) throw new Error();
    window.location.href = `/escolar/por-revisar?tarea=${f.id}`;
    return true;
  } catch {
    toast.error('No se pudo entrar a ese colegio.');
    return false;
  }
}

function BotonAbrir({ fila, grande }: { fila: FilaTarea; grande?: boolean }) {
  const [yendo, setYendo] = useState(false);
  return (
    <Button size={grande ? 'medium' : 'small'} variant={grande ? 'contained' : 'text'} disableElevation disabled={yendo}
      startIcon={yendo ? <CircularProgress size={13} color="inherit" /> : <ExternalLink size={14} />}
      aria-label={`Abrir la tarea ${fila.id} en el colegio`}
      onClick={async (e) => { e.stopPropagation(); setYendo(true); if (!(await abrirEnElColegio(fila))) setYendo(false); }}
      sx={{ textTransform: 'none', whiteSpace: 'nowrap', borderRadius: '8px' }}>
      {grande ? 'Abrir en el colegio' : 'Abrir'}
    </Button>
  );
}

export function TablaTareas(p: {
  filas: FilaTarea[]; total: number; estado: EstadoTabla; colegios: { id: number; nombre: string }[]; resaltada: FilaTarea | null;
}) {
  const columnas: GridColDef<FilaTarea>[] = [
    { field: 'colegio', headerName: 'Colegio', width: 170, renderCell: ({ value }) => <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>{value}</Typography> },
    {
      field: 'titulo', headerName: 'Tarea', flex: 1.5, minWidth: 220, sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography noWrap sx={{ fontSize: '0.875rem', color: '#111827' }}>{row.titulo}</Typography>
          {row.creadaPorIa && <Sparkles size={13} color="#7c3aed" aria-label="La abrió Zero AI" />}
          {row.mensajes > 0 && <Chip size="small" label={row.mensajes} sx={{ height: 18, fontSize: '0.6875rem', bgcolor: '#f3f4f6' }} />}
        </Box>
      ),
    },
    { field: 'de', headerName: 'De', width: 90, sortable: false, valueFormatter: (v: FilaTarea['de']) => DE[v] },
    {
      field: 'asignada', headerName: 'Asignada a', width: 150, sortable: false,
      renderCell: ({ row }) => row.asignadaA === 'soporte'
        ? <Chip size="small" label="Soporte IT · Zero" sx={{ bgcolor: '#eef2fe', color: '#2a45c4', fontWeight: 600, fontSize: '0.6875rem', height: 22 }} />
        : <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#374151' }}>{row.asignadaNombre ?? 'Una persona del colegio'}</Typography>,
    },
    {
      field: 'atiende', headerName: 'La atiende', width: 170, sortable: false,
      valueGetter: (_v, row) => (row.atiende ? etiquetaAtiende(row.atiende) : ''),
      renderCell: ({ row }) => row.atiende
        ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Avatar src={row.atiende.fotoUrl ?? undefined} alt="" sx={{ width: 22, height: 22, fontSize: '0.625rem', bgcolor: '#eef2fe', color: '#2a45c4', fontWeight: 700 }}>
              {inicialesDe(row.atiende.nombre)}
            </Avatar>
            <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#374151' }}>{etiquetaAtiende(row.atiende)}</Typography>
          </Box>
        )
        : <Box component="span" sx={{ color: '#9ca3af' }}>—</Box>,
    },
    {
      field: 'estado', headerName: 'Estado', width: 115,
      renderCell: ({ row }) => <Chip size="small" label={ESTADO[row.estado].texto} sx={{ bgcolor: ESTADO[row.estado].fondo, color: ESTADO[row.estado].color, fontWeight: 600, fontSize: '0.6875rem', height: 22 }} />,
    },
    {
      field: 'vence', headerName: 'Vence', width: 125,
      renderCell: ({ row }) => row.vence
        ? <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: row.vencida ? 700 : 400, color: row.vencida ? '#b91c1c' : '#374151' }}>{dia(row.vence)}{row.vencida ? ' · vencida' : ''}</Box>
        : <Box component="span" sx={{ color: '#9ca3af' }}>—</Box>,
    },
    {
      field: 'actividad', headerName: 'Actividad', width: 140,
      renderCell: ({ row }) => (
        <Box>
          <Box component="span" sx={{ fontSize: '0.8125rem', color: '#374151' }}>{cuandoLlego(row.actividad)}</Box>
          {row.horasSinMover != null && row.horasSinMover >= 24 && (
            <Box component="span" sx={{ ml: 0.75, px: 0.75, py: 0.125, borderRadius: '4px', bgcolor: '#fef2f2', color: '#b91c1c', fontSize: '0.6875rem', fontWeight: 700 }}>{row.horasSinMover >= 48 ? `${Math.floor(row.horasSinMover / 24)} d` : `${row.horasSinMover} h`}</Box>
          )}
        </Box>
      ),
    },
    { field: 'accion', headerName: '', width: 110, sortable: false, disableColumnMenu: true, hideable: false, align: 'right', renderCell: ({ row }) => <BotonAbrir fila={row} /> },
  ];

  const filtros: FiltroUI[] = [
    {
      id: 'estado', etiqueta: 'Estado', tipo: 'select', todos: null,
      opciones: [
        { valor: 'pendientes', etiqueta: 'Pendientes' }, { valor: 'abierta', etiqueta: 'Abiertas' },
        { valor: 'en_proceso', etiqueta: 'En proceso' }, { valor: 'en_revision', etiqueta: 'En revisión' }, { valor: 'completada', etiqueta: 'Completadas' }, { valor: 'todas', etiqueta: 'Todas' },
      ],
    },
    { id: 'atiende', etiqueta: 'Atiende', tipo: 'select', todos: 'Todas', opciones: [{ valor: 'mias', etiqueta: 'Mis tareas' }] },
    { id: 'colegio', etiqueta: 'Colegio', tipo: 'select', todos: 'Todos los colegios', opciones: p.colegios.map((c) => ({ valor: String(c.id), etiqueta: c.nombre })) },
    { id: 'asignada', etiqueta: 'Asignada a', tipo: 'select', todos: 'Cualquiera', opciones: [{ valor: 'soporte', etiqueta: 'Soporte IT · Zero' }, { valor: 'persona', etiqueta: 'Una persona del colegio' }] },
    { id: 'vence', etiqueta: 'Vencimiento', tipo: 'select', todos: 'Cualquiera', opciones: [{ valor: 'vencidas', etiqueta: 'Vencidas' }, { valor: 'hoy', etiqueta: 'Vencen hoy' }, { valor: '7dias', etiqueta: 'Próximos 7 días' }, { valor: 'sin_fecha', etiqueta: 'Sin fecha' }] },
  ];

  const r = p.resaltada;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {r && (
        <Alert severity="info" icon={false} sx={{ borderRadius: '12px', alignItems: 'center', '& .MuiAlert-message': { width: '100%' } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#2a45c4' }}>Tarea #{r.id} · {r.colegio}</Typography>
              <Typography sx={{ fontWeight: 600, color: '#111827' }}>{r.titulo}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>
                {ESTADO[r.estado].texto} · {r.asignadaA === 'soporte' ? 'Soporte IT · Zero' : (r.asignadaNombre ?? 'una persona del colegio')}{r.atiende ? ` · la atiende ${etiquetaAtiende(r.atiende)}` : ''} · última actividad {cuandoLlego(r.actividad)}
              </Typography>
            </Box>
            <BotonAbrir fila={r} grande />
          </Box>
        </Alert>
      )}
      <TablaServidor<FilaTarea>
        id="tareas" exportar="tareas" filas={p.filas} total={p.total} columnas={columnas} estado={p.estado}
        campoDeOrden={{ actividad: 'actividad', vence: 'vence', creada: 'creada', colegio: 'colegio', estado: 'estado' }}
        ordenPorDefecto={{ campo: 'actividad', dir: 'desc' }} filtrosPorDefecto={{ estado: 'pendientes' }}
        filtros={filtros} busqueda="Buscar en el título de la tarea…"
        ocultasEnMovil={['de', 'asignada', 'atiende', 'vence', 'actividad']}
        resaltarId={r?.id ?? null}
        vacio={{ titulo: 'No hay tareas pendientes', detalle: 'Cuando un colegio abra una tarea para Soporte, aparece aquí.' }}
      />
    </Box>
  );
}
