'use client';

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Filter, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, ChevronsUpDown, Loader2, X, MoreVertical,
} from 'lucide-react';
import Link from 'next/link';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiTable from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import InputBase from '@mui/material/InputBase';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'right' | 'center';
export type ColumnBreakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface DataTableColumn<T> {
  id:            string;
  header:        React.ReactNode;
  render?:       (row: T) => React.ReactNode;
  align?:        ColumnAlign;
  visibleAt?:    ColumnBreakpoint;
  width?:        string | number;
  sortable?:     boolean;
  sortAccessor?: (row: T) => string | number | Date | null;
}

export interface DataTableFilterBase {
  id:     string;
  label?: string;
}

export type DataTableFilter =
  | (DataTableFilterBase & { type: 'search';    placeholder?: string })
  | (DataTableFilterBase & { type: 'select';    options: { value: string; label: string }[]; placeholder?: string })
  | (DataTableFilterBase & { type: 'daterange'; });

export interface BulkAction<T> {
  label:    string;
  icon?:    React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  variant?: 'default' | 'danger';
  onClick:  (selectedIds: (string | number)[], selectedRows: T[]) => void | Promise<void>;
}

export interface RowAction {
  icon:     React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title:    string;
  href?:    string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  primary?: boolean;
}

export interface PaginationConfig {
  page:         number;
  pageSize:     number;
  total:        number;
  onPageChange: (page: number) => void;
}

export interface EmptyStateConfig {
  icon?:  React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title:  string;
  hint?:  string;
  cta?:   React.ReactNode;
}

export interface DataTableProps<T> {
  data:            T[];
  columns:         DataTableColumn<T>[];
  loading?:        boolean;
  error?:          string | null;
  rowId?:          (row: T) => string | number;
  filters?:        DataTableFilter[];
  filterValues?:   Record<string, string>;
  onFilterChange?: (values: Record<string, string>) => void;
  bulkActions?:   BulkAction<T>[];
  rowActions?:    (row: T) => RowAction[];
  rowHref?:       (row: T) => string;
  pagination?:    PaginationConfig;
  emptyState?:    EmptyStateConfig;
  /** Acciones extra en el header (export, "Nuevo X", etc.) */
  headerActions?: React.ReactNode;
  title?:         string;
  description?:   string;
  /**
   * Agrupa las filas por la clave devuelta. Cuando se activa, se desactiva la
   * paginación interna (se muestran todos los grupos) y se inserta una fila de
   * encabezado por grupo. El sort sigue aplicando dentro de cada grupo.
   */
  groupBy?:       (row: T) => string;
  /** Render del encabezado de cada grupo (clave, sus filas y el colSpan total). */
  renderGroupHeader?: (groupKey: string, rows: T[], colSpan: number) => React.ReactNode;
}

// ─── Breakpoint helpers ───────────────────────────────────────────────────────

const BREAKPOINT_SX: Record<ColumnBreakpoint, object> = {
  sm: { display: { xs: 'none', sm: 'table-cell' } },
  md: { display: { xs: 'none', md: 'table-cell' } },
  lg: { display: { xs: 'none', lg: 'table-cell' } },
  xl: { display: { xs: 'none', xl: 'table-cell' } },
};

function alignSx(a?: ColumnAlign) {
  if (a === 'right')  return 'right' as const;
  if (a === 'center') return 'center' as const;
  return 'left' as const;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  loading = false,
  error = null,
  rowId = (r: T) => (r as { id: string | number }).id,
  filters = [],
  filterValues: filterValuesProp,
  onFilterChange,
  bulkActions = [],
  rowActions,
  rowHref,
  pagination,
  emptyState,
  headerActions,
  title,
  description,
  groupBy,
  renderGroupHeader,
}: DataTableProps<T>) {
  // Filter state
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({});
  const filterValues = filterValuesProp ?? internalFilters;
  const updateFilter = (id: string, value: string) => {
    const next = { ...filterValues, [id]: value };
    if (onFilterChange) onFilterChange(next);
    else setInternalFilters(next);
  };

  // Sort state
  const [sortBy, setSortBy] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);
  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    const col = columns.find(c => c.id === sortBy.id);
    if (!col?.sortable) return data;
    const accessor = col.sortAccessor ?? ((r: T) => (r as Record<string, unknown>)[sortBy.id] as string | number);
    return [...data].sort((a, b) => {
      const av = accessor(a); const bv = accessor(b);
      if (av == null) return 1; if (bv == null) return -1;
      if (av < bv) return sortBy.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortBy.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortBy, columns]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const allSelected = sortedData.length > 0 && sortedData.every(r => selectedIds.has(rowId(r)));
  const toggleAll   = () => setSelectedIds(prev => allSelected ? new Set() : new Set(sortedData.map(rowId)));
  const toggleOne   = (id: string | number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedRows = useMemo(() => sortedData.filter(r => selectedIds.has(rowId(r))), [sortedData, selectedIds, rowId]);

  // Pagination state
  const serverPaginated   = !!pagination;
  const [clientPage, setClientPage]         = useState(1);
  const [clientPageSize, setClientPageSize] = useState(25);
  const clientTotalPages  = Math.max(1, Math.ceil(sortedData.length / clientPageSize));
  const prevLenRef        = useRef(sortedData.length);

  useEffect(() => {
    if (prevLenRef.current !== sortedData.length) {
      prevLenRef.current = sortedData.length;
      setClientPage(1);
    }
  }, [sortedData.length]);
  useEffect(() => { setClientPage(1); }, [sortBy]);
  useEffect(() => {
    if (clientPage > clientTotalPages) setClientPage(clientTotalPages);
  }, [clientPage, clientTotalPages]);

  const pageData = serverPaginated
    ? sortedData
    : sortedData.slice((clientPage - 1) * clientPageSize, clientPage * clientPageSize);

  const pageView = serverPaginated
    ? { page: pagination!.page, pageSize: pagination!.pageSize, total: pagination!.total, totalPages: Math.max(1, Math.ceil(pagination!.total / pagination!.pageSize)), onChange: pagination!.onPageChange }
    : { page: clientPage, pageSize: clientPageSize, total: sortedData.length, totalPages: clientTotalPages, onChange: setClientPage };

  const rangeFrom = pageView.total === 0 ? 0 : (pageView.page - 1) * pageView.pageSize + 1;
  const rangeTo   = Math.min(pageView.page * pageView.pageSize, pageView.total);

  const hasFilters = filters.length > 0;
  const hasBulk    = bulkActions.length > 0;
  const cols       = (hasBulk ? 1 : 0) + columns.length + (rowActions ? 1 : 0);

  // Agrupación opcional: parte el dataset (ya ordenado) en grupos por clave,
  // preservando el orden de primera aparición. Cada clave aparece una sola vez
  // con todas sus filas. Desactiva la paginación interna.
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const m = new Map<string, T[]>();
    for (const r of sortedData) {
      const k = groupBy(r);
      const arr = m.get(k);
      if (arr) arr.push(r); else m.set(k, [r]);
    }
    return Array.from(m.entries());
  }, [sortedData, groupBy]);
  const grouped = !!groups;

  const renderRow = (row: T) => {
    const id         = rowId(row);
    const isSelected = selectedIds.has(id);
    const href       = rowHref?.(row);
    return (
      <TableRow
        key={String(id)}
        hover={!isSelected}
        selected={isSelected}
        onClick={href ? (e) => {
          // No navegar si click vino de checkbox/botón/link interno
          const target = e.target as HTMLElement;
          if (target.closest('input,button,a')) return;
          window.location.href = href;
        } : undefined}
        sx={{
          cursor:  href ? 'pointer' : 'default',
          bgcolor: isSelected ? '#f0fdfa' : undefined,
          '&.MuiTableRow-hover:hover': { bgcolor: '#fafafa' },
          '& .MuiTableCell-root': { borderBottom: '1px solid #f3f4f6' },
        }}
      >
        {hasBulk && (
          <TableCell padding="checkbox" sx={{ pl: 2 }} onClick={e => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onChange={() => toggleOne(id)}
              size="small"
              color="primary"
            />
          </TableCell>
        )}
        {columns.map(col => {
          const content = col.render
            ? col.render(row)
            : ((row as Record<string, unknown>)[col.id] as React.ReactNode);
          return (
            <TableCell
              key={col.id}
              align={alignSx(col.align)}
              sx={{
                fontSize: '0.875rem',
                color:    '#374151',
                py:       1.5,
                ...(col.visibleAt ? BREAKPOINT_SX[col.visibleAt] : {}),
              }}
            >
              {content}
            </TableCell>
          );
        })}
        {rowActions && (() => {
          const acts    = rowActions(row);
          const primary = acts.filter(a => a.primary);
          const rest    = acts.filter(a => !a.primary);
          return (
            <TableCell sx={{ py: 0.75 }} onClick={e => e.stopPropagation()}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                {primary.map((a, i) => <RowActionInline key={i} action={a} />)}
                <RowActionsMenu actions={rest} />
              </Box>
            </TableCell>
          );
        })()}
      </TableRow>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header */}
      {(title || description || headerActions) && (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, justifyContent: 'space-between', gap: 1.5 }}>
          {(title || description) && (
            <Box>
              {title && (
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {title}
                </Typography>
              )}
              {description && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                  {description}
                </Typography>
              )}
            </Box>
          )}
          {headerActions && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {headerActions}
            </Box>
          )}
        </Box>
      )}

      {/* Card */}
      <Paper
        elevation={0}
        sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}
      >
        {/* Filters */}
        {hasFilters && (
          <Box
            sx={{
              display:    'flex',
              gap:        1,
              flexWrap:   'wrap',
              alignItems: 'center',
              p:          1.5,
              borderBottom: '1px solid #f3f4f6',
              bgcolor:    '#fafafa',
            }}
          >
            {filters.map(f => {
              if (f.type === 'search') {
                return (
                  <Box
                    key={f.id}
                    sx={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          1,
                      flex:         '1 1 200px',
                      maxWidth:     360,
                      bgcolor:      '#ffffff',
                      border:       '1px solid #e5e7eb',
                      borderRadius: '8px',
                      px:           1.5,
                      py:           0.875,
                      transition:   'border-color 0.15s',
                      '&:focus-within': { borderColor: '#0d9488', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' },
                    }}
                  >
                    <Search style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
                    <InputBase
                      value={filterValues[f.id] ?? ''}
                      onChange={e => updateFilter(f.id, e.target.value)}
                      placeholder={f.placeholder ?? 'Buscar…'}
                      sx={{ flex: 1, fontSize: '0.875rem' }}
                    />
                    {filterValues[f.id] && (
                      <IconButton size="small" onClick={() => updateFilter(f.id, '')} sx={{ p: 0.25 }}>
                        <X style={{ width: 12, height: 12 }} />
                      </IconButton>
                    )}
                  </Box>
                );
              }
              if (f.type === 'select') {
                return (
                  <Select
                    key={f.id}
                    value={filterValues[f.id] ?? ''}
                    onChange={e => updateFilter(f.id, e.target.value as string)}
                    size="small"
                    displayEmpty
                    sx={{
                      fontSize:     '0.875rem',
                      borderRadius: '8px',
                      minWidth:     140,
                      bgcolor:      '#ffffff',
                    }}
                  >
                    <MenuItem value=""><em>{f.placeholder ?? f.label ?? 'Todos'}</em></MenuItem>
                    {f.options.map(o => (
                      <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.875rem' }}>{o.label}</MenuItem>
                    ))}
                  </Select>
                );
              }
              if (f.type === 'daterange') {
                const desde = filterValues[`${f.id}_desde`] ?? '';
                const hasta = filterValues[`${f.id}_hasta`] ?? '';
                return (
                  <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Filter style={{ width: 14, height: 14, color: '#9ca3af' }} />
                    <Box
                      component="input"
                      type="date"
                      value={desde}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFilter(`${f.id}_desde`, e.target.value)}
                      sx={{
                        border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 0.875,
                        fontSize: '0.8125rem', bgcolor: '#ffffff', outline: 'none',
                        '&:focus': { borderColor: '#0d9488' },
                      }}
                    />
                    <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>→</Box>
                    <Box
                      component="input"
                      type="date"
                      value={hasta}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFilter(`${f.id}_hasta`, e.target.value)}
                      sx={{
                        border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 0.875,
                        fontSize: '0.8125rem', bgcolor: '#ffffff', outline: 'none',
                        '&:focus': { borderColor: '#0d9488' },
                      }}
                    />
                    {(desde || hasta) && (
                      <IconButton
                        size="small"
                        onClick={() => { updateFilter(`${f.id}_desde`, ''); updateFilter(`${f.id}_hasta`, ''); }}
                        title="Limpiar fechas"
                      >
                        <X style={{ width: 14, height: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                );
              }
              return null;
            })}
          </Box>
        )}

        {/* Bulk actions bar */}
        {hasBulk && selectedIds.size > 0 && (
          <Box
            sx={{
              display:    'flex',
              alignItems: 'center',
              gap:        1.5,
              px:         2,
              py:         1.25,
              bgcolor:    '#f0fdfa',
              borderBottom: '1px solid #ccfbf1',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
              {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </Typography>
            {bulkActions.map((a, i) => {
              const Icon    = a.icon;
              const isDanger = a.variant === 'danger';
              return (
                <Box
                  key={i}
                  component="button"
                  onClick={() => a.onClick([...selectedIds], selectedRows)}
                  sx={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         0.5,
                    fontSize:    '0.8125rem',
                    fontWeight:  500,
                    px:          1.5,
                    py:          0.625,
                    borderRadius: '8px',
                    border:      '1px solid',
                    borderColor: isDanger ? '#fecaca' : '#e5e7eb',
                    color:       isDanger ? '#ef4444' : 'text.secondary',
                    bgcolor:     'transparent',
                    cursor:      'pointer',
                    transition:  'all 0.15s',
                    '&:hover':   { bgcolor: isDanger ? '#fef2f2' : 'grey.50' },
                  }}
                >
                  {Icon && <Icon style={{ width: 14, height: 14 }} />}
                  {a.label}
                </Box>
              );
            })}
            <Box
              component="button"
              onClick={() => setSelectedIds(new Set())}
              sx={{
                ml:      'auto',
                fontSize: '0.875rem',
                color:   'text.secondary',
                bgcolor:  'transparent',
                border:  'none',
                cursor:  'pointer',
                '&:hover': { color: 'text.primary' },
              }}
            >
              Cancelar
            </Box>
          </Box>
        )}

        {/* Table */}
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} color="primary" />
          </Box>
        ) : error ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="error">{error}</Typography>
          </Box>
        ) : sortedData.length === 0 ? (
          <EmptyStateView config={emptyState} />
        ) : (
          <TableContainer>
            <MuiTable size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  {hasBulk && (
                    <TableCell padding="checkbox" sx={{ pl: 2 }}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={selectedIds.size > 0 && !allSelected}
                        onChange={toggleAll}
                        size="small"
                        color="primary"
                      />
                    </TableCell>
                  )}
                  {columns.map(col => {
                    const isSorted = sortBy?.id === col.id;
                    return (
                      <TableCell
                        key={col.id}
                        align={alignSx(col.align)}
                        style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                        onClick={col.sortable ? () => setSortBy(prev => {
                          if (!prev || prev.id !== col.id) return { id: col.id, dir: 'asc' };
                          if (prev.dir === 'asc') return { id: col.id, dir: 'desc' };
                          return null;
                        }) : undefined}
                        sx={{
                          fontWeight:    700,
                          fontSize:      '0.6875rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color:         '#6b7280',
                          py:            1.25,
                          cursor:        col.sortable ? 'pointer' : 'default',
                          userSelect:    'none',
                          borderBottom:  '1px solid #e5e7eb',
                          ...(col.visibleAt ? BREAKPOINT_SX[col.visibleAt] : {}),
                          '&:hover': col.sortable ? { color: '#374151' } : {},
                        }}
                      >
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          {col.header}
                          {col.sortable && (
                            isSorted
                              ? (sortBy?.dir === 'asc'
                                  ? <ChevronUp   style={{ width: 12, height: 12, color: '#0d9488' }} />
                                  : <ChevronDown style={{ width: 12, height: 12, color: '#0d9488' }} />)
                              : <ChevronsUpDown style={{ width: 12, height: 12, opacity: 0.3 }} />
                          )}
                        </Box>
                      </TableCell>
                    );
                  })}
                  {rowActions && <TableCell sx={{ width: 48, borderBottom: '1px solid #e5e7eb' }} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {grouped
                  ? groups!.map(([key, rows]) => (
                      <React.Fragment key={`grp-${key}`}>
                        <TableRow sx={{ bgcolor: '#f3f4f6' }}>
                          <TableCell colSpan={cols} sx={{ py: 1, borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                            {renderGroupHeader
                              ? renderGroupHeader(key, rows, cols)
                              : (
                                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                                  {key} <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>· {rows.length}</Box>
                                </Typography>
                              )}
                          </TableCell>
                        </TableRow>
                        {rows.map(renderRow)}
                      </React.Fragment>
                    ))
                  : pageData.map(renderRow)}
              </TableBody>
            </MuiTable>
          </TableContainer>
        )}

        {/* Footer pagination */}
        {!loading && !error && sortedData.length > 0 && (
          <Box
            sx={{
              display:        'flex',
              flexDirection:  { xs: 'column', sm: 'row' },
              alignItems:     { sm: 'center' },
              justifyContent: 'space-between',
              gap:            1,
              px:             2,
              py:             1.5,
              borderTop:      '1px solid #f3f4f6',
              bgcolor:        '#fafafa',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {!serverPaginated && !grouped && (
                <Select
                  value={clientPageSize}
                  onChange={e => { setClientPageSize(Number(e.target.value)); setClientPage(1); }}
                  size="small"
                  sx={{ fontSize: '0.8125rem', borderRadius: '8px', minWidth: 'auto' }}
                >
                  {[10, 25, 50, 100].map(n => (
                    <MenuItem key={n} value={n} sx={{ fontSize: '0.875rem' }}>{n} / pág.</MenuItem>
                  ))}
                </Select>
              )}
              <Typography variant="body2" color="text.secondary">
                {grouped
                  ? `${sortedData.length.toLocaleString()} fila(s) en ${groups!.length.toLocaleString()} grupo(s)`
                  : `${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()} de ${pageView.total.toLocaleString()}`}
              </Typography>
            </Box>

            {!grouped && pageView.totalPages > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton
                  size="small"
                  onClick={() => pageView.onChange(Math.max(1, pageView.page - 1))}
                  disabled={pageView.page === 1}
                  sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', '&:hover': { bgcolor: 'grey.50' } }}
                >
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </IconButton>
                <Typography variant="body2" color="text.secondary">
                  Pág. {pageView.page} de {pageView.totalPages}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => pageView.onChange(Math.min(pageView.totalPages, pageView.page + 1))}
                  disabled={pageView.page === pageView.totalPages}
                  sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', '&:hover': { bgcolor: 'grey.50' } }}
                >
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyStateView({ config }: { config?: EmptyStateConfig }) {
  if (!config) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">Sin resultados</Typography>
      </Box>
    );
  }
  const Icon = config.icon;
  return (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      {Icon && (
        <Box sx={{ width: 48, height: 48, bgcolor: 'grey.100', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Icon style={{ width: 24, height: 24, color: '#9ca3af' }} />
        </Box>
      )}
      <Typography variant="body2" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
        {config.title}
      </Typography>
      {config.hint && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
          {config.hint}
        </Typography>
      )}
      {config.cta && <Box sx={{ mt: 2 }}>{config.cta}</Box>}
    </Box>
  );
}

function RowActionInline({ action }: { action: RowAction }) {
  const Icon    = action.icon;
  const isDanger = action.variant === 'danger';

  if (action.href) {
    const external = action.href.startsWith('http') || action.href.startsWith('/api/');
    return (
      <Tooltip title={action.title} placement="top" arrow>
        <IconButton
          component={Link}
          href={action.href}
          target={external ? '_blank' : undefined}
          size="small"
          onClick={e => e.stopPropagation()}
          sx={{
            color:     isDanger ? 'error.main' : 'text.secondary',
            borderRadius: '6px',
            '&:hover': { bgcolor: isDanger ? '#fef2f2' : 'grey.100' },
          }}
        >
          <Icon style={{ width: 16, height: 16 }} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={action.title} placement="top" arrow>
      <IconButton
        size="small"
        onClick={e => { e.stopPropagation(); action.onClick?.(); }}
        sx={{
          color:     isDanger ? 'error.main' : 'text.secondary',
          borderRadius: '6px',
          '&:hover': { bgcolor: isDanger ? '#fef2f2' : 'grey.100' },
        }}
      >
        <Icon style={{ width: 16, height: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  if (!actions || actions.length === 0) return null;

  return (
    <>
      <IconButton
        size="small"
        onClick={e => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{
          color:     'text.secondary',
          borderRadius: '6px',
          '&:hover': { bgcolor: 'grey.100' },
        }}
        aria-label="Acciones"
      >
        <MoreVertical style={{ width: 16, height: 16 }} />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              borderRadius: '10px',
              border:       '1px solid #e5e7eb',
              boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              minWidth:     160,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {actions.map((a, i) => {
          const Icon    = a.icon;
          const isDanger = a.variant === 'danger';
          if (a.href) {
            const external = a.href.startsWith('http') || a.href.startsWith('/api/');
            return (
              <MenuItem
                key={i}
                component={Link}
                href={a.href}
                target={external ? '_blank' : undefined}
                sx={{
                  borderRadius: '6px',
                  mx:           0.5,
                  fontSize:     '0.875rem',
                  color:        isDanger ? 'error.main' : 'text.primary',
                  gap:          1,
                  py:           '6px',
                  '&:hover': { bgcolor: isDanger ? '#fef2f2' : 'grey.50' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 'auto', color: 'inherit' }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </ListItemIcon>
                {a.title}
              </MenuItem>
            );
          }
          return (
            <MenuItem
              key={i}
              onClick={a.onClick}
              sx={{
                borderRadius: '6px',
                mx:           0.5,
                fontSize:     '0.875rem',
                color:        isDanger ? 'error.main' : 'text.primary',
                gap:          1,
                py:           '6px',
                '&:hover': { bgcolor: isDanger ? '#fef2f2' : 'grey.50' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 'auto', color: 'inherit' }}>
                <Icon style={{ width: 16, height: 16 }} />
              </ListItemIcon>
              {a.title}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
