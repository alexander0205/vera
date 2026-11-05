'use client';

/**
 * La tabla de las pantallas de volumen del panel (empresas, usuarios, registros,
 * tareas): MUI X Data Grid con paginación, orden y filtros en el SERVIDOR.
 *
 * El estado vive en la URL (`?pagina&tamano&orden=campo:dir&q&filtros`): cada
 * cambio navega y la página (servidor) vuelve a consultar. Así el enlace se
 * puede compartir, el botón «atrás» funciona y nada de lo que se ve depende de
 * un estado escondido en el navegador. Lo que sí se recuerda aquí, por persona
 * y por tabla, es qué columnas se ven y la densidad (localStorage, con respaldo
 * si el navegador no lo deja).
 *
 * Quién puede ver los datos NO se decide aquí: es la página la que exige ser
 * administrador antes de consultar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DataGrid, GridToolbarColumnsButton, GridToolbarContainer, GridToolbarDensitySelector,
  type GridColDef, type GridColumnVisibilityModel, type GridDensity, type GridSortModel,
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Download, Search, SearchX, X } from 'lucide-react';

export interface FiltroUI {
  id: string;
  etiqueta: string;
  tipo: 'select' | 'fecha';
  opciones?: { valor: string; etiqueta: string }[];
  /** Texto de «sin filtro» en el selector (por defecto «Todos»). Ausente si el filtro siempre tiene un valor. */
  todos?: string | null;
}

export interface EstadoTabla {
  q: string;
  pagina: number;
  tamano: number;
  orden: { campo: string; dir: 'asc' | 'desc' };
  filtros: Record<string, string>;
}

export interface TablaServidorProps<R extends { id: number }> {
  /** Clave para recordar columnas y densidad de esta tabla. */
  id: string;
  /** Qué exporta el botón CSV (`/api/admin/exportar/<tabla>`). */
  exportar: 'empresas' | 'usuarios' | 'logs' | 'tareas';
  filas: R[];
  total: number;
  columnas: GridColDef<R>[];
  estado: EstadoTabla;
  /** El orden con que arranca la tabla (el que no hace falta poner en la URL). */
  ordenPorDefecto: { campo: string; dir: 'asc' | 'desc' };
  /** Los valores que valen sin decir nada en la URL: seleccionarlos no ensucia el enlace y no cuentan como filtro puesto. */
  filtrosPorDefecto?: Record<string, string>;
  /** Columna (`field`) → nombre del campo de orden en la URL, si no es el mismo. */
  campoDeOrden?: Record<string, string>;
  filtros: FiltroUI[];
  busqueda?: string;
  /** Columnas que se esconden de entrada en pantallas chicas. */
  ocultasEnMovil?: string[];
  onFilaClick?: (fila: R) => void;
  /** Fila resaltada (por ejemplo, la tarea a la que lleva una notificación). */
  resaltarId?: number | null;
  vacio: { titulo: string; detalle: string };
  acciones?: ReactNode;
}

const claveLocal = (id: string, que: 'cols' | 'dens') => `zero-admin:${que}:${id}`;

function leerLocal<T>(clave: string): T | null {
  try { const v = window.localStorage.getItem(clave); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function guardarLocal(clave: string, valor: unknown) {
  try { window.localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: no pasa nada */ }
}

function BarraDeHerramientas({ hrefCsv }: { hrefCsv: string }) {
  return (
    <GridToolbarContainer sx={{ px: 1, py: 0.75, gap: 0.5, borderBottom: '1px solid #f3f4f6' }}>
      <GridToolbarColumnsButton />
      <GridToolbarDensitySelector />
      <Box sx={{ flex: 1 }} />
      <Button component="a" href={hrefCsv} size="small" startIcon={<Download size={15} />} sx={{ textTransform: 'none', fontWeight: 600 }}>
        Exportar CSV
      </Button>
    </GridToolbarContainer>
  );
}

export function TablaServidor<R extends { id: number }>(p: TablaServidorProps<R>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, empezar] = useTransition();
  const movil = useMediaQuery('(max-width:700px)');

  // ── Navegar = cambiar la URL ──────────────────────────────────────────────
  const navegar = useCallback((cambios: Record<string, string | null>, reiniciarPagina = true) => {
    // Se parte de la URL de AHORA, no del valor que tenía el hook al pintar: dos
    // cambios seguidos (escribir y elegir un filtro) no deben pisarse.
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(cambios)) { if (v == null || v === '') next.delete(k); else next.set(k, v); }
    if (reiniciarPagina && !('pagina' in cambios)) next.delete('pagina');
    // `tarea` (o cualquier otro parámetro de resaltado) no sobrevive a un cambio de filtro.
    const qs = next.toString();
    empezar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }, [pathname, router]);

  // ── Búsqueda con espera de 350 ms ─────────────────────────────────────────
  const [q, setQ] = useState(p.estado.q);
  useEffect(() => setQ(p.estado.q), [p.estado.q]);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (q.trim() === p.estado.q) return;
    const t = setTimeout(() => navegar({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ── Columnas y densidad recordadas por persona ────────────────────────────
  const ocultasInicial = useMemo<GridColumnVisibilityModel>(
    () => (movil ? Object.fromEntries((p.ocultasEnMovil ?? []).map((c) => [c, false])) : {}),
    [movil, p.ocultasEnMovil],
  );
  const [columnasVisibles, setColumnasVisibles] = useState<GridColumnVisibilityModel | null>(null);
  const [densidad, setDensidad] = useState<GridDensity>('standard');
  useEffect(() => {
    setColumnasVisibles(leerLocal<GridColumnVisibilityModel>(claveLocal(p.id, 'cols')));
    const d = leerLocal<GridDensity>(claveLocal(p.id, 'dens'));
    if (d === 'compact' || d === 'standard' || d === 'comfortable') setDensidad(d);
  }, [p.id]);

  // ── Orden ─────────────────────────────────────────────────────────────────
  const campoUrl = (field: string) => p.campoDeOrden?.[field] ?? field;
  const campoGrid = (campo: string) => Object.entries(p.campoDeOrden ?? {}).find(([, v]) => v === campo)?.[0] ?? campo;
  const sortModel: GridSortModel = [{ field: campoGrid(p.estado.orden.campo), sort: p.estado.orden.dir }];
  const alOrdenar = (m: GridSortModel) => {
    const s = m[0];
    if (!s?.sort) { navegar({ orden: null }); return; }
    const hay = `${campoUrl(s.field)}:${s.sort}`;
    const base = `${p.ordenPorDefecto.campo}:${p.ordenPorDefecto.dir}`;
    navegar({ orden: hay === base ? null : hay });
  };

  // ── Filtros ───────────────────────────────────────────────────────────────
  const porDefecto = p.filtrosPorDefecto ?? {};
  const hayFiltros = Boolean(p.estado.q) || Object.entries(p.estado.filtros).some(([k, v]) => v !== porDefecto[k]);
  const limpiar = () => {
    const cambios: Record<string, string | null> = { q: null, orden: null };
    for (const f of p.filtros) cambios[f.id] = null;
    navegar(cambios);
  };

  const hrefCsv = useMemo(() => {
    const e = new URLSearchParams(params.toString());
    e.delete('pagina'); e.delete('tamano'); e.delete('tarea');
    const qs = e.toString();
    return `/api/admin/exportar/${p.exportar}${qs ? `?${qs}` : ''}`;
  }, [params, p.exportar]);

  const Vacio = useMemo(() => function Vacio() {
    return (
      <Box sx={{ height: '100%', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75, textAlign: 'center', p: 3 }}>
        <SearchX size={36} color="#d1d5db" />
        <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>{hayFiltros ? 'Nada coincide con estos filtros' : p.vacio.titulo}</Typography>
        <Typography sx={{ color: '#6b7280', fontSize: '0.8125rem', maxWidth: 360 }}>{hayFiltros ? 'Prueba con otra búsqueda o quita algún filtro.' : p.vacio.detalle}</Typography>
        {hayFiltros && <Button onClick={limpiar} size="small" sx={{ textTransform: 'none', mt: 1 }}>Quitar los filtros</Button>}
      </Box>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayFiltros, p.vacio.titulo, p.vacio.detalle, params]);

  const campoCss = { '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff', fontSize: '0.875rem' } };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {p.busqueda && (
          <TextField
            size="small" value={q} onChange={(e) => setQ(e.target.value)} placeholder={p.busqueda}
            sx={{ ...campoCss, flex: { xs: '1 1 100%', sm: '0 1 300px' } }}
            slotProps={{ htmlInput: { 'aria-label': p.busqueda, maxLength: 100 }, input: {
              startAdornment: <InputAdornment position="start"><Search size={16} color="#9ca3af" /></InputAdornment>,
              endAdornment: q ? <InputAdornment position="end"><X size={14} style={{ cursor: 'pointer' }} onClick={() => setQ('')} aria-label="Borrar búsqueda" /></InputAdornment> : undefined,
            } }}
          />
        )}
        {p.filtros.map((f) => f.tipo === 'select' ? (
          <TextField key={f.id} select size="small" label={f.etiqueta} sx={{ ...campoCss, minWidth: { xs: 0, sm: 150 }, flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' } }}
            value={p.estado.filtros[f.id] ?? ''} onChange={(e) => navegar({ [f.id]: e.target.value || null })}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            {f.todos !== null && <MenuItem value="">{f.todos ?? 'Todos'}</MenuItem>}
            {(f.opciones ?? []).map((o) => <MenuItem key={o.valor} value={o.valor}>{o.etiqueta}</MenuItem>)}
          </TextField>
        ) : (
          <TextField key={f.id} type="date" size="small" label={f.etiqueta} sx={{ ...campoCss, width: { xs: 'calc(50% - 8px)', sm: 160 } }}
            value={p.estado.filtros[f.id] ?? ''} onChange={(e) => navegar({ [f.id]: e.target.value || null })}
            slotProps={{ inputLabel: { shrink: true } }} />
        ))}
        {hayFiltros && <Button onClick={limpiar} size="small" startIcon={<X size={14} />} sx={{ textTransform: 'none' }}>Quitar filtros</Button>}
        <Box sx={{ flex: 1 }} />
        {p.acciones}
      </Box>

      <Box sx={{ position: 'relative' }}>
        <DataGrid<R>
          aria-label="Tabla de resultados"
          rows={p.filas}
          columns={p.columnas}
          getRowId={(r) => r.id}
          rowCount={p.total}
          loading={pendiente}
          autoHeight
          localeText={esES.components.MuiDataGrid.defaultProps.localeText}
          // Todo en el servidor: la tabla solo enseña lo que la página le trajo.
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          disableColumnFilter
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={{ page: p.estado.pagina - 1, pageSize: p.estado.tamano }}
          onPaginationModelChange={(m) => {
            if (m.pageSize !== p.estado.tamano) navegar({ tamano: String(m.pageSize), pagina: null });
            else navegar({ pagina: m.page === 0 ? null : String(m.page + 1) }, false);
          }}
          sortModel={sortModel}
          onSortModelChange={alOrdenar}
          sortingOrder={['asc', 'desc']}
          columnVisibilityModel={columnasVisibles ?? ocultasInicial}
          onColumnVisibilityModelChange={(m) => { setColumnasVisibles(m); guardarLocal(claveLocal(p.id, 'cols'), m); }}
          density={densidad}
          onDensityChange={(d) => { setDensidad(d); guardarLocal(claveLocal(p.id, 'dens'), d); }}
          onRowClick={p.onFilaClick ? (par) => p.onFilaClick!(par.row) : undefined}
          getRowClassName={(par) => (p.resaltarId === par.row.id ? 'fila-resaltada' : '')}
          showToolbar
          slots={{ toolbar: () => <BarraDeHerramientas hrefCsv={hrefCsv} />, noRowsOverlay: Vacio }}
          sx={{
            bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', fontFamily: 'inherit',
            '& .MuiDataGrid-columnHeaders': { bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
            '& .MuiDataGrid-columnHeaderTitle': { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280' },
            '& .MuiDataGrid-cell': { borderColor: '#f3f4f6', display: 'flex', alignItems: 'center', fontSize: '0.875rem' },
            '& .MuiDataGrid-row:hover': { bgcolor: '#f9fafb' },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': { outline: 'none' },
            '& .MuiDataGrid-cell:focus-visible': { outline: '2px solid #5b73ec', outlineOffset: -2 },
            '& .MuiDataGrid-footerContainer': { borderColor: '#f3f4f6' },
            '& .fila-resaltada': { bgcolor: '#eef2fe', boxShadow: 'inset 3px 0 0 #3658e1' },
            ...(p.onFilaClick ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : {}),
          }}
        />
      </Box>
    </Box>
  );
}
