'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { ShieldCheck } from 'lucide-react';
import { TablaServidor, type EstadoTabla, type FiltroUI } from '@/components/admin/TablaServidor';
import type { FilaUsuario } from '@/lib/admin/tablas';
import { fechaCorta } from '@/lib/admin/fecha';

const fecha = fechaCorta;

const si = (texto: string, on: boolean) => (
  <Chip size="small" label={texto} sx={{
    height: 22, fontSize: '0.6875rem', fontWeight: 600, border: '1px solid', borderColor: on ? '#bbf7d0' : '#e5e7eb',
    bgcolor: on ? '#f0fdf4' : '#f3f4f6', color: on ? '#166534' : '#6b7280',
  }} />
);

export function TablaUsuarios(p: { filas: FilaUsuario[]; total: number; estado: EstadoTabla }) {
  const columnas: GridColDef<FilaUsuario>[] = [
    {
      field: 'nombre', headerName: 'Usuario', flex: 1.6, minWidth: 260,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{row.nombre ?? '—'}</Typography>
          <Typography noWrap sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.email}</Typography>
        </Box>
      ),
    },
    {
      field: 'rol', headerName: 'Rol', width: 150,
      renderCell: ({ row }) => row.admin
        ? <Chip size="small" icon={<ShieldCheck size={12} />} label="Administrador" sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 600, bgcolor: '#eef2fe', color: '#2a45c4' }} />
        : <Box component="span" sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>Usuario</Box>,
    },
    { field: 'empresas', headerName: 'Empresas', type: 'number', width: 100, headerAlign: 'right', align: 'right' },
    { field: 'verificado', headerName: 'Correo', width: 120, sortable: false, renderCell: ({ row }) => si(row.verificado ? 'Verificado' : 'Pendiente', row.verificado) },
    { field: 'dosFactores', headerName: '2FA', width: 90, sortable: false, renderCell: ({ row }) => si(row.dosFactores ? 'Activo' : 'No', row.dosFactores) },
    { field: 'creado', headerName: 'Registrado', width: 130, valueFormatter: (v: string) => fecha(v) },
  ];

  const filtros: FiltroUI[] = [
    { id: 'rol', etiqueta: 'Rol', tipo: 'select', todos: 'Todos', opciones: [{ valor: 'admin', etiqueta: 'Administradores' }, { valor: 'member', etiqueta: 'Usuarios' }] },
    { id: 'verificado', etiqueta: 'Correo', tipo: 'select', todos: 'Todos', opciones: [{ valor: 'si', etiqueta: 'Verificado' }, { valor: 'no', etiqueta: 'Pendiente' }] },
    { id: 'dosfa', etiqueta: '2FA', tipo: 'select', todos: 'Todos', opciones: [{ valor: 'si', etiqueta: 'Activo' }, { valor: 'no', etiqueta: 'Sin 2FA' }] },
  ];

  return (
    <TablaServidor<FilaUsuario>
      id="usuarios" exportar="usuarios" filas={p.filas} total={p.total} columnas={columnas} estado={p.estado}
      ordenPorDefecto={{ campo: 'creado', dir: 'desc' }} filtros={filtros}
      busqueda="Buscar por nombre o correo…" ocultasEnMovil={['rol', 'empresas', 'verificado', 'dosFactores', 'creado']}
      vacio={{ titulo: 'No hay usuarios', detalle: 'Aquí aparecen las cuentas cuando alguien se registra.' }}
    />
  );
}
