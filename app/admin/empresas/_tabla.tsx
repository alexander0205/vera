'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { TablaServidor, type EstadoTabla, type FiltroUI } from '@/components/admin/TablaServidor';
import type { FilaEmpresa } from '@/lib/admin/tablas';
import { fechaCorta } from '@/lib/admin/fecha';

const num = (n: number) => n.toLocaleString('es-DO');
const fecha = fechaCorta;

const ESTADO: Record<string, { texto: string; fondo: string; color: string }> = {
  admin: { texto: 'Asignado por Zero', fondo: '#eef2fe', color: '#2a45c4' },
  active: { texto: 'Activa', fondo: '#f0fdf4', color: '#166534' },
  trialing: { texto: 'En prueba', fondo: '#fffbeb', color: '#92400e' },
  past_due: { texto: 'Pago vencido', fondo: '#fef2f2', color: '#b91c1c' },
  canceled: { texto: 'Cancelada', fondo: '#f3f4f6', color: '#4b5563' },
  unpaid: { texto: 'Sin pagar', fondo: '#fef2f2', color: '#b91c1c' },
  paused: { texto: 'Pausada', fondo: '#f3f4f6', color: '#4b5563' },
};

const etiquetaEstado = (e: string) => ESTADO[e]?.texto ?? e;

export function TablaEmpresas(p: {
  filas: FilaEmpresa[]; total: number; estado: EstadoTabla; planes: string[]; estados: string[];
}) {
  const router = useRouter();

  const columnas: GridColDef<FilaEmpresa>[] = [
    {
      field: 'nombre', headerName: 'Empresa', flex: 1.6, minWidth: 240, sortable: true,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{row.nombre}</Typography>
          {row.razonSocial && <Typography noWrap sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.razonSocial}</Typography>}
        </Box>
      ),
    },
    { field: 'rnc', headerName: 'RNC', width: 130, renderCell: ({ value }) => <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#4b5563' }}>{value ?? '—'}</Box> },
    {
      field: 'plan', headerName: 'Plan', width: 150,
      renderCell: ({ value }) => value ? <Chip size="small" label={value} sx={{ bgcolor: '#f3f4f6', fontSize: '0.75rem', height: 22 }} /> : <Box component="span" sx={{ color: '#9ca3af' }}>—</Box>,
    },
    {
      field: 'estado', headerName: 'Suscripción', width: 150, sortable: false,
      renderCell: ({ value }) => {
        if (!value) return <Box component="span" sx={{ color: '#9ca3af' }}>—</Box>;
        const e = ESTADO[value as string] ?? { texto: value as string, fondo: '#f3f4f6', color: '#4b5563' };
        return <Chip size="small" label={e.texto} sx={{ bgcolor: e.fondo, color: e.color, fontWeight: 600, fontSize: '0.6875rem', height: 22 }} />;
      },
    },
    { field: 'usuarios', headerName: 'Usuarios', type: 'number', width: 100, headerAlign: 'right', align: 'right', valueFormatter: (v: number) => num(v) },
    { field: 'facturas', headerName: 'Facturas', type: 'number', width: 100, headerAlign: 'right', align: 'right', valueFormatter: (v: number) => num(v) },
    {
      field: 'modulos', headerName: 'Módulos', width: 220, sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {row.escolar && <Chip size="small" label="POS escolar" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#f5f3ff', color: '#5b21b6' }} />}
          {row.pos && <Chip size="small" label="POS" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#ecfeff', color: '#155e75' }} />}
          {row.caja && <Chip size="small" label="Caja" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#fff7ed', color: '#9a3412' }} />}
          {row.dgii && <Chip size="small" label="DGII" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#f0fdf4', color: '#166534' }} />}
        </Box>
      ),
    },
    { field: 'creada', headerName: 'Creada', width: 130, valueFormatter: (v: string) => fecha(v) },
  ];

  const filtros: FiltroUI[] = [
    { id: 'plan', etiqueta: 'Plan', tipo: 'select', todos: 'Todos los planes', opciones: p.planes.map((v) => ({ valor: v, etiqueta: v })) },
    { id: 'estado', etiqueta: 'Suscripción', tipo: 'select', todos: 'Todas', opciones: p.estados.map((v) => ({ valor: v, etiqueta: etiquetaEstado(v) })) },
    {
      id: 'modulo', etiqueta: 'Módulo', tipo: 'select', todos: 'Todos',
      opciones: [{ valor: 'escolar', etiqueta: 'POS escolar' }, { valor: 'pos', etiqueta: 'POS' }, { valor: 'caja', etiqueta: 'Caja' }, { valor: 'dgii', etiqueta: 'Habilitada en DGII' }],
    },
  ];

  return (
    <TablaServidor<FilaEmpresa>
      id="empresas" exportar="empresas" filas={p.filas} total={p.total} columnas={columnas} estado={p.estado}
      ordenPorDefecto={{ campo: 'creada', dir: 'desc' }} filtros={filtros}
      busqueda="Buscar por nombre o RNC…" ocultasEnMovil={['rnc', 'plan', 'estado', 'modulos', 'creada', 'facturas']}
      onFilaClick={(f) => router.push(`/admin/empresas/${f.id}`)}
      vacio={{ titulo: 'Todavía no hay empresas', detalle: 'Crea la primera con «Nueva empresa».' }}
    />
  );
}
