'use client';

/**
 * <DataTable> — tabla maestra reutilizable.
 *
 * Diseño objetivo: una sola implementación de tabla para TODOS los listados
 * de EmiteDO (facturas, clientes, productos, AR, recurrentes, etc.). Cuando
 * mejoras filtros, sort, export o accesibilidad — todo el sistema mejora.
 *
 * Uso típico:
 *
 *   <DataTable
 *     data={facturas}
 *     loading={loading}
 *     columns={[
 *       { id: 'encf',    header: 'e-NCF',  render: r => <Link>{r.encf}</Link> },
 *       { id: 'cliente', header: 'Cliente', sortable: true },
 *       { id: 'total',   header: 'Total',  align: 'right', render: r => fmtDOP(r.total) },
 *     ]}
 *     filters={[
 *       { type: 'search',     id: 'q',      placeholder: 'Buscar...' },
 *       { type: 'select',     id: 'estado', label: 'Estado', options: [...] },
 *       { type: 'daterange',  id: 'fecha',  label: 'Fechas' },
 *     ]}
 *     onFilterChange={f => fetchData(f)}
 *     bulkActions={[{ label: 'Anular', onClick: ids => bulkAnular(ids) }]}
 *     rowActions={r => [
 *       { icon: FileText, title: 'Ver PDF', onClick: () => openPdf(r.id) },
 *       { icon: Mail,     title: 'Enviar',  onClick: () => sendEmail(r) },
 *     ]}
 *     pagination={{ page, pageSize, total, onPageChange: setPage }}
 *     emptyState={{ icon: FileText, title: 'Sin facturas', cta: ... }}
 *     rowHref={r => `/dashboard/facturas/${r.id}`}
 *   />
 */

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Loader2, X, MoreVertical } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'right' | 'center';
export type ColumnBreakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface DataTableColumn<T> {
  id:            string;
  header:        React.ReactNode;
  /** Render custom para la celda. Default: row[id] como string. */
  render?:       (row: T) => React.ReactNode;
  align?:        ColumnAlign;
  /** Oculta la columna por debajo del breakpoint indicado. */
  visibleAt?:    ColumnBreakpoint;
  /** Ancho aproximado en px o "auto". */
  width?:        string | number;
  /** Permite click en el header para ordenar. */
  sortable?:     boolean;
  /** Llave para extraer valor de sort. Default: row[id]. */
  sortAccessor?: (row: T) => string | number | Date | null;
}

export interface DataTableFilterBase {
  id:      string;
  label?:  string;
}

export type DataTableFilter =
  | (DataTableFilterBase & { type: 'search';    placeholder?: string })
  | (DataTableFilterBase & { type: 'select';    options: { value: string; label: string }[]; placeholder?: string })
  | (DataTableFilterBase & { type: 'daterange'; });

export interface BulkAction<T> {
  label:   string;
  icon?:   React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'danger';
  onClick: (selectedIds: (string | number)[], selectedRows: T[]) => void | Promise<void>;
}

export interface RowAction {
  icon:    React.ComponentType<{ className?: string }>;
  title:   string;
  href?:   string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  /** Si true, se muestra como botón ícono inline (antes del menú de 3 puntos). */
  primary?: boolean;
}

export interface PaginationConfig {
  page:         number;
  pageSize:     number;
  total:        number;
  onPageChange: (page: number) => void;
}

export interface EmptyStateConfig {
  icon?:  React.ComponentType<{ className?: string }>;
  title:  string;
  hint?:  string;
  cta?:   React.ReactNode;
}

export interface DataTableProps<T> {
  data:           T[];
  columns:        DataTableColumn<T>[];
  loading?:       boolean;
  error?:         string | null;
  rowId?:         (row: T) => string | number;
  filters?:       DataTableFilter[];
  filterValues?:  Record<string, string>;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BREAKPOINT_CLASS: Record<ColumnBreakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

function alignClass(a?: ColumnAlign): string {
  if (a === 'right')  return 'text-right';
  if (a === 'center') return 'text-center';
  return 'text-left';
}

// ─── Componente ───────────────────────────────────────────────────────────────

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
}: DataTableProps<T>) {
  // Estado interno de filtros si no se controla externamente.
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({});
  const filterValues = filterValuesProp ?? internalFilters;
  const updateFilter = (id: string, value: string) => {
    const next = { ...filterValues, [id]: value };
    if (onFilterChange) onFilterChange(next);
    else setInternalFilters(next);
  };

  // Sort interno (no soporta server-side sort por ahora — fácil de agregar).
  const [sortBy, setSortBy] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);
  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    const col = columns.find(c => c.id === sortBy.id);
    if (!col?.sortable) return data;
    const accessor = col.sortAccessor ?? ((r: T) => (r as Record<string, unknown>)[sortBy.id] as string | number);
    const sorted = [...data].sort((a, b) => {
      const av = accessor(a); const bv = accessor(b);
      if (av == null) return 1; if (bv == null) return -1;
      if (av < bv) return sortBy.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortBy.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [data, sortBy, columns]);

  // Bulk selection.
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const allSelected = sortedData.length > 0 && sortedData.every(r => selectedIds.has(rowId(r)));
  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allSelected) return new Set();
      return new Set(sortedData.map(rowId));
    });
  };
  const toggleOne = (id: string | number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectedRows = useMemo(
    () => sortedData.filter(r => selectedIds.has(rowId(r))),
    [sortedData, selectedIds, rowId],
  );

  // Paginación client-side cuando NO se controla server-side vía `pagination`.
  const serverPaginated = !!pagination;
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(25);
  const clientTotalPages = Math.max(1, Math.ceil(sortedData.length / clientPageSize));

  // Volver a página 1 cuando cambia el tamaño del dataset (búsqueda/filtro) o el sort.
  const prevLenRef = useRef(sortedData.length);
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

  // Vista unificada de paginación (server o client) para el pie de tabla.
  const pageView = serverPaginated
    ? {
        page: pagination!.page,
        pageSize: pagination!.pageSize,
        total: pagination!.total,
        totalPages: Math.max(1, Math.ceil(pagination!.total / pagination!.pageSize)),
        onChange: pagination!.onPageChange,
      }
    : {
        page: clientPage,
        pageSize: clientPageSize,
        total: sortedData.length,
        totalPages: clientTotalPages,
        onChange: setClientPage,
      };
  const rangeFrom = pageView.total === 0 ? 0 : (pageView.page - 1) * pageView.pageSize + 1;
  const rangeTo   = Math.min(pageView.page * pageView.pageSize, pageView.total);

  const hasFilters = filters.length > 0;
  const hasBulk    = bulkActions.length > 0;
  const cols = columns.length + (hasBulk ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* ── Header opcional ── */}
      {(title || description || headerActions) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          {(title || description) && (
            <div>
              {title && <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>}
              {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
            </div>
          )}
          {headerActions && <div className="flex items-center gap-2 flex-wrap">{headerActions}</div>}
        </div>
      )}

      {/* ── Card unificada: filtros + tabla + paginación ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

      {/* ── Filtros ── */}
      {hasFilters && (
        <div className="flex gap-2 flex-wrap items-center p-3 border-b border-gray-100 bg-gray-50/60">
          {filters.map(f => {
            if (f.type === 'search') {
              return (
                <div key={f.id} className="relative flex-1 min-w-48 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
                  <input
                    type="text"
                    value={filterValues[f.id] ?? ''}
                    onChange={e => updateFilter(f.id, e.target.value)}
                    placeholder={f.placeholder ?? 'Buscar…'}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              );
            }
            if (f.type === 'select') {
              return (
                <select
                  key={f.id}
                  value={filterValues[f.id] ?? ''}
                  onChange={e => updateFilter(f.id, e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="">{f.placeholder ?? f.label ?? 'Todos'}</option>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              );
            }
            if (f.type === 'daterange') {
              const desde = filterValues[`${f.id}_desde`] ?? '';
              const hasta = filterValues[`${f.id}_hasta`] ?? '';
              return (
                <div key={f.id} className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                  <input
                    type="date"
                    value={desde}
                    onChange={e => updateFilter(`${f.id}_desde`, e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-xs text-gray-400">→</span>
                  <input
                    type="date"
                    value={hasta}
                    onChange={e => updateFilter(`${f.id}_hasta`, e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {(desde || hasta) && (
                    <button
                      onClick={() => { updateFilter(`${f.id}_desde`, ''); updateFilter(`${f.id}_hasta`, ''); }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Limpiar fechas"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* ── Bulk actions bar ── */}
      {hasBulk && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-teal-50 border-b border-teal-100 px-4 py-2.5">
          <span className="text-sm font-medium text-teal-800">{selectedIds.size} seleccionado(s)</span>
          {bulkActions.map((a, i) => {
            const Icon = a.icon;
            const danger = a.variant === 'danger';
            return (
              <button
                key={i}
                onClick={() => a.onClick([...selectedIds], selectedRows)}
                className={`flex items-center gap-1 text-sm px-3 py-1 rounded-lg border ${
                  danger
                    ? 'text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50'
                    : 'text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {a.label}
              </button>
            );
          })}
          <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-500 hover:text-gray-700 ml-auto">
            Cancelar
          </button>
        </div>
      )}

      {/* ── Tabla ── */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : sortedData.length === 0 ? (
          <EmptyState config={emptyState} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {hasBulk && (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                    </th>
                  )}
                  {columns.map(col => {
                    const isSorted = sortBy?.id === col.id;
                    const breakpoint = col.visibleAt ? BREAKPOINT_CLASS[col.visibleAt] : '';
                    return (
                      <th
                        key={col.id}
                        style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                        className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide ${alignClass(col.align)} ${breakpoint} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                        onClick={col.sortable ? () => setSortBy(prev => {
                          if (!prev || prev.id !== col.id) return { id: col.id, dir: 'asc' };
                          if (prev.dir === 'asc')         return { id: col.id, dir: 'desc' };
                          return null;
                        }) : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.header}
                          {col.sortable && (
                            isSorted
                              ? (sortBy?.dir === 'asc'
                                  ? <ChevronUp className="h-3 w-3 text-teal-600" />
                                  : <ChevronDown className="h-3 w-3 text-teal-600" />)
                              : <ChevronsUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {rowActions && <th className="w-12 px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageData.map(row => {
                  const id = rowId(row);
                  const isSelected = selectedIds.has(id);
                  const href = rowHref?.(row);
                  return (
                    <tr
                      key={String(id)}
                      className={`transition-colors ${isSelected ? 'bg-teal-50/50' : 'hover:bg-gray-50'} ${href ? 'cursor-pointer' : ''}`}
                      onClick={href ? (e) => {
                        // No navegar si click vino de checkbox/botón/link interno
                        const target = e.target as HTMLElement;
                        if (target.closest('input,button,a')) return;
                        window.location.href = href;
                      } : undefined}
                    >
                      {hasBulk && (
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(id)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                        </td>
                      )}
                      {columns.map(col => {
                        const breakpoint = col.visibleAt ? BREAKPOINT_CLASS[col.visibleAt] : '';
                        const content = col.render ? col.render(row) : ((row as Record<string, unknown>)[col.id] as React.ReactNode);
                        return (
                          <td
                            key={col.id}
                            className={`px-3 py-3 ${alignClass(col.align)} ${breakpoint}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                      {rowActions && (() => {
                        const acts = rowActions(row);
                        const primary = acts.filter(a => a.primary);
                        const rest    = acts.filter(a => !a.primary);
                        return (
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              {primary.map((a, i) => <RowActionInline key={i} action={a} />)}
                              <RowActionsMenu actions={rest} />
                            </div>
                          </td>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pie: paginación (siempre visible cuando hay datos) ── */}
      {!loading && !error && sortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50/40">
          <div className="flex items-center gap-3">
            {!serverPaginated && (
              <select
                value={clientPageSize}
                onChange={e => { setClientPageSize(Number(e.target.value)); setClientPage(1); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                aria-label="Filas por página"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / pág.</option>)}
              </select>
            )}
            <p className="text-sm text-gray-500">
              Mostrando {rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()} de {pageView.total.toLocaleString()}
            </p>
          </div>
          {pageView.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => pageView.onChange(Math.max(1, pageView.page - 1))}
                disabled={pageView.page === 1}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-700">Página {pageView.page} de {pageView.totalPages}</span>
              <button
                onClick={() => pageView.onChange(Math.min(pageView.totalPages, pageView.page + 1))}
                disabled={pageView.page === pageView.totalPages}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ config }: { config?: EmptyStateConfig }) {
  if (!config) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">Sin resultados</div>
    );
  }
  const Icon = config.icon;
  return (
    <div className="py-16 text-center">
      {Icon && <Icon className="h-10 w-10 text-gray-200 mx-auto mb-3" />}
      <p className="text-sm font-medium text-gray-700">{config.title}</p>
      {config.hint && <p className="text-xs text-gray-500 mt-1">{config.hint}</p>}
      {config.cta && <div className="mt-4">{config.cta}</div>}
    </div>
  );
}

function RowActionInline({ action }: { action: RowAction }) {
  const Icon = action.icon;
  const danger = action.variant === 'danger';
  const cls = `p-1.5 rounded-lg transition-colors ${
    danger
      ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
      : 'text-gray-400 hover:text-teal-700 hover:bg-teal-50'
  }`;
  if (action.href) {
    const external = action.href.startsWith('http') || action.href.startsWith('/api/');
    return (
      <Link href={action.href} target={external ? '_blank' : undefined}
        aria-label={action.title} title={action.title}
        onClick={e => e.stopPropagation()} className={cls}>
        <Icon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={action.title} title={action.title}
      onClick={e => { e.stopPropagation(); action.onClick?.(); }} className={cls}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          aria-label="Acciones"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors data-[state=open]:bg-gray-100 data-[state=open]:text-gray-700"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((a, i) => {
          const Icon = a.icon;
          const variant = a.variant === 'danger' ? 'destructive' : 'default';
          if (a.href) {
            const external = a.href.startsWith('http') || a.href.startsWith('/api/');
            return (
              <DropdownMenuItem key={i} asChild variant={variant}>
                <Link href={a.href} target={external ? '_blank' : undefined}>
                  <Icon className="h-4 w-4" />
                  {a.title}
                </Link>
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem key={i} variant={variant} onSelect={() => a.onClick?.()}>
              <Icon className="h-4 w-4" />
              {a.title}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
