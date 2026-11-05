'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { TablaServidor, type EstadoTabla, type FiltroUI } from '@/components/admin/TablaServidor';
import type { FilaLog } from '@/lib/admin/tablas';
import { fechaHora } from '@/lib/admin/fecha';

const NIVEL = {
  error: { icono: XCircle, color: '#ef4444', texto: 'Error' },
  warn: { icono: AlertTriangle, color: '#f59e0b', texto: 'Aviso' },
  info: { icono: Info, color: '#3b82f6', texto: 'Info' },
} as const;

const cuando = fechaHora;

export function TablaLogs(p: { filas: FilaLog[]; total: number; estado: EstadoTabla; colegios: { id: number; nombre: string }[] }) {
  const [abierto, setAbierto] = useState<FilaLog | null>(null);

  const columnas: GridColDef<FilaLog>[] = [
    { field: 'fecha', headerName: 'Fecha', width: 170, valueFormatter: (v: string) => cuando(v) },
    {
      field: 'nivel', headerName: 'Nivel', width: 110,
      renderCell: ({ value }) => {
        const n = NIVEL[value as keyof typeof NIVEL] ?? NIVEL.info;
        const Icono = n.icono;
        return <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: n.color, fontWeight: 600, fontSize: '0.8125rem' }}><Icono size={15} />{n.texto}</Box>;
      },
    },
    { field: 'origen', headerName: 'Origen', width: 220, renderCell: ({ value }) => value ? <Box component="code" sx={{ fontSize: '0.75rem', lineHeight: 1.6, color: '#6b7280', bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Box> : <Box component="span" sx={{ color: '#9ca3af' }}>—</Box> },
    { field: 'empresa', headerName: 'Empresa', width: 200, renderCell: ({ value }) => <Typography noWrap sx={{ fontSize: '0.8125rem', color: value ? '#374151' : '#9ca3af' }}>{value ?? '—'}</Typography> },
    { field: 'mensaje', headerName: 'Mensaje', flex: 1, minWidth: 280, sortable: false, renderCell: ({ value }) => <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#111827' }}>{value}</Typography> },
  ];

  const filtros: FiltroUI[] = [
    { id: 'nivel', etiqueta: 'Nivel', tipo: 'select', todos: 'Todos', opciones: [{ valor: 'error', etiqueta: 'Errores' }, { valor: 'warn', etiqueta: 'Avisos' }, { valor: 'info', etiqueta: 'Información' }] },
    { id: 'empresa', etiqueta: 'Empresa', tipo: 'select', todos: 'Todas', opciones: p.colegios.map((c) => ({ valor: String(c.id), etiqueta: c.nombre })) },
    { id: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
    { id: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
  ];

  const nivel = abierto ? (NIVEL[abierto.nivel as keyof typeof NIVEL] ?? NIVEL.info) : null;
  return (
    <>
      <TablaServidor<FilaLog>
        id="logs" exportar="logs" filas={p.filas} total={p.total} columnas={columnas} estado={p.estado}
        campoDeOrden={{ fecha: 'fecha' }}
        ordenPorDefecto={{ campo: 'fecha', dir: 'desc' }} filtros={filtros}
        busqueda="Buscar en el mensaje u origen…" ocultasEnMovil={['origen', 'empresa', 'fecha']}
        onFilaClick={setAbierto}
        vacio={{ titulo: 'Sin registros', detalle: 'Cuando el sistema anote un error o un aviso, aparece aquí.' }}
      />
      <Dialog open={!!abierto} onClose={() => setAbierto(null)} fullWidth maxWidth="md">
        {abierto && nivel && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
              <nivel.icono size={18} color={nivel.color} />
              <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem' }}>Registro #{abierto.id}</Typography>
              <IconButton aria-label="Cerrar" onClick={() => setAbierto(null)} sx={{ position: 'absolute', right: 8, top: 8 }} size="small"><X size={18} /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1 }}>
                {cuando(abierto.fecha)}{abierto.origen ? ` · ${abierto.origen}` : ''}{abierto.empresa ? ` · ${abierto.empresa}` : ''}
              </Typography>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', wordBreak: 'break-word', mb: 1.5 }}>{abierto.mensaje}</Typography>
              {abierto.detalle
                ? <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.75rem', color: '#374151', overflow: 'auto', maxHeight: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{abierto.detalle}</Box>
                : <Typography sx={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Sin detalle.</Typography>}
            </DialogContent>
          </>
        )}
      </Dialog>
    </>
  );
}
