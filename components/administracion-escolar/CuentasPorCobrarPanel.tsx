'use client';

/**
 * Cuentas por cobrar de un responsable, dentro de Gobernanza.
 *
 * Es la pantalla de `Facturación > Cuentas por cobrar` reusada y acotada a un
 * cliente (`?clientId=`): las facturas con saldo del responsable, con su mismo
 * cobro, su panel de detalle y su export. Lo propio de aquí es que va EMBEBIDA
 * en la ficha —de la familia y del estudiante— y que separa en DOS secciones lo
 * que la pantalla general folda en una sola fila:
 *
 *   · «Cuentas por cobrar» → las facturas (su saldo propio, sin la mora).
 *   · «Notas de débito»     → la mora, en su sección aparte (Alex la quiere al
 *      lado, no sumada dentro del saldo de la factura).
 *
 * El cobro sigue siendo uno solo: `PagoModal` cobra la factura y, si tiene mora,
 * el resto va a la mora —por eso el botón de cobrar de la sección de notas abre
 * el mismo modal sobre la factura padre—.
 *
 * No reimplementa el cobro ni el detalle: monta `PagoModal` y `DetallePanel`,
 * los mismos que usa la cartera general (comparten el shape `Cuenta`).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle, Eye, PanelRightOpen, Wallet2, Loader2 } from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { PagoModal, nombreDeCuenta, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { DetallePanel } from '@/components/cuentas-por-cobrar/DetallePanel';
import { NotasMoraTable, type NotaMoraFila } from '@/components/notas-mora-table';
import { ExportarListado } from '@/components/reportes/exportar-listado';
import { Button } from '@/components/ui/button';
import { fmtDOP, fmtFechaCorta, fmtCodigoCorto } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { armarEnvioTabla, type ExportTabla } from '@/lib/export/tabla';

/**
 * La cuenta tal como la devuelve `/api/cuentas-por-cobrar`. Es el shape
 * compartido `Cuenta`, con `moraNotas` en su versión ancha (monto y estado):
 * la general lo trae así y la sección de notas de débito lo necesita.
 */
type CuentaCxC = Omit<Cuenta, 'moraNotas'> & {
  moraNotas?: { id: number; codigo: string | null; montoTotal: number; saldo: number; estado: 'PENDIENTE' | 'PARCIAL'; fechaEmision: string | null; periodo: string | null }[];
};

const TAMANO_PAGINA = 2000; // Máximo aceptado por la API.

async function fetcher(url: string): Promise<{ cuentas: CuentaCxC[] }> {
  const cuentas: CuentaCxC[] = [];
  let total = Infinity;
  while (cuentas.length < total) {
    const pagina = new URL(url, window.location.origin);
    pagina.searchParams.set('limit', String(TAMANO_PAGINA));
    pagina.searchParams.set('offset', String(cuentas.length));
    const r = await fetch(pagina);
    if (!r.ok) throw new Error('No se pudieron leer las cuentas por cobrar');
    const datos = await r.json() as { cuentas: CuentaCxC[]; totales: { count: number } };
    total = datos.totales.count;
    cuentas.push(...datos.cuentas);
    if (datos.cuentas.length === 0 && cuentas.length < total) {
      throw new Error('La consulta de cuentas por cobrar quedó incompleta');
    }
  }
  return { cuentas };
}

const isHistorica = (c: CuentaCxC) => c.estado === 'HISTORICA' || c.tipoEcf === '00';

/** Imprimir / PDF / Excel de las facturas (regla: todo listado se exporta). */
const EXPORTAR: ExportTabla<CuentaCxC> = {
  titulo: 'Cuentas por cobrar',
  archivo: 'cuentas-por-cobrar',
  columnas: [
    { titulo: 'Emisión', valor: (c) => fmtFechaCorta(c.fechaEmision), ancho: 0.9 },
    { titulo: 'Documento', valor: (c) => c.codigo ?? `#${c.id}`, sub: (c) => (/^E\d{12}$/.test(c.encf) ? c.encf : null), ancho: 1.6 },
    { titulo: 'Vence', valor: (c) => (c.fechaLimitePago ? fmtFechaCorta(c.fechaLimitePago) : null), ancho: 0.9 },
    { titulo: 'Atraso', valor: (c) => (c.vencida ? `${c.diasVencido} d` : 'Al día'), ancho: 0.7 },
    { titulo: 'Facturado', valor: (c) => c.montoTotal, tipo: 'moneda', ancho: 1 },
    { titulo: 'Pagado', valor: (c) => c.pagado, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Saldo', valor: (c) => c.saldoFactura, tipo: 'moneda', total: true, ancho: 1 },
  ],
  kpis: (rows) => {
    const vencidas = rows.filter((c) => c.vencida);
    return [
      { label: 'Por cobrar', valor: fmtDOP(rows.reduce((s, c) => s + c.saldoFactura, 0)), sub: `${rows.length} factura${rows.length === 1 ? '' : 's'}` },
      { label: 'Vencido', valor: fmtDOP(vencidas.reduce((s, c) => s + c.saldoFactura, 0)), sub: `${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}` },
    ];
  },
};

type NotaExport = NotaMoraFila & { factura: string };
const EXPORTAR_NOTAS: ExportTabla<NotaExport> = {
  titulo: 'Notas de débito por mora',
  archivo: 'notas-debito-mora',
  columnas: [
    { titulo: 'Factura', valor: (n) => n.factura, ancho: 1.2 },
    { titulo: 'Nota', valor: (n) => n.codigo ?? `ND #${n.id}`, ancho: 1.2 },
    { titulo: 'Emisión', valor: (n) => fmtFechaCorta(n.fechaEmision), ancho: 0.9 },
    { titulo: 'Período', valor: (n) => fmtFechaCorta(n.periodo), ancho: 0.9 },
    { titulo: 'Recargo', valor: (n) => n.montoTotal, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Pagado', valor: (n) => n.montoTotal - n.saldo, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Saldo', valor: (n) => n.saldo, tipo: 'moneda', total: true, ancho: 1 },
  ],
};

export function CuentasPorCobrarPanel({
  clientId,
  puedePagos,
  onCambio,
  seccion = 'cuentas',
}: {
  /** El responsable de pago: sus facturas son las cuentas por cobrar. */
  clientId: number;
  /** Sin este permiso no se enseña el botón de cobrar (solo mirar). */
  puedePagos: boolean;
  /** Avisa a la ficha para que refresque sus cifras tras un cobro. */
  onCambio?: () => void;
  /**
   * Qué sección pinta este panel. Son pestañas hermanas (Alex las quiere una al
   * lado de la otra), no apiladas: cada ficha monta dos instancias, una por
   * sección. Comparten el mismo `?clientId=` de SWR, así que es una sola
   * consulta de red aunque haya dos paneles.
   */
  seccion?: 'cuentas' | 'notas';
}) {
  const { can, modules, isLoading: permisosCargando } = usePermissions();
  const puedeVer = can('facturas:ver');
  const puedeCobrar = puedePagos && (can('pagos:registrar') || can('facturas:crear'));
  const puedeAbrirFactura = modules.includes('facturacion');
  const puedeGestionarCobro = can('facturas:crear');
  const { data, error, isLoading, mutate } = useSWR(
    puedeVer ? `/api/cuentas-por-cobrar?clientId=${clientId}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    busca: '', estado: '', fecha_desde: '', fecha_hasta: '',
  });
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);
  const [detalle, setDetalle] = useState<CuentaCxC | null>(null);

  const cuentas = useMemo(() => data?.cuentas ?? [], [data]);

  // «Cuentas por cobrar» = facturas con saldo propio. La mora va en su sección.
  const facturas = useMemo(() => {
    let rows = cuentas.filter((c) => c.saldoFactura > 0);
    const q = (filterValues.busca ?? '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        (c.codigo ?? '').toLowerCase().includes(q) ||
        (c.encf ?? '').toLowerCase().includes(q),
      );
    }
    if (filterValues.estado === 'vencidas') rows = rows.filter((c) => c.vencida);
    else if (filterValues.estado === 'al-dia') rows = rows.filter((c) => !c.vencida);
    if (filterValues.fecha_desde) rows = rows.filter((c) => c.fechaEmision.slice(0, 10) >= filterValues.fecha_desde);
    if (filterValues.fecha_hasta) rows = rows.filter((c) => c.fechaEmision.slice(0, 10) <= filterValues.fecha_hasta);
    return rows;
  }, [cuentas, filterValues.busca, filterValues.estado, filterValues.fecha_desde, filterValues.fecha_hasta]);

  // «Notas de débito» = las facturas que arrastran mora pendiente.
  const conMora = useMemo(() => cuentas.filter((c) => c.moraSaldo > 0), [cuentas]);
  const totalMora = conMora.reduce((s, c) => s + c.moraSaldo, 0);
  const notasExportar = conMora.flatMap((c): NotaExport[] => (c.moraNotas ?? []).map((n) => ({
    ...n, factura: c.codigo ?? `Factura #${c.id}`,
  })));

  const columnas: DataTableColumn<CuentaCxC>[] = useMemo(() => {
    const base: DataTableColumn<CuentaCxC>[] = [
      {
        id: 'codigo',
        header: 'Documento',
        render: (c) => (
          <div className="flex items-center gap-1.5">
            {puedeAbrirFactura ? (
              <Link
                href={`/dashboard/facturas/${c.id}`}
                title={c.codigo ?? `Factura #${c.id}`}
                className="whitespace-nowrap font-mono text-xs font-medium text-zero-600 hover:underline"
              >
                {c.codigo ? fmtCodigoCorto(c.codigo) : `#${c.id}`}
              </Link>
            ) : <span className="whitespace-nowrap font-mono text-xs font-medium text-gray-700">{c.codigo ? fmtCodigoCorto(c.codigo) : `#${c.id}`}</span>}
            {isHistorica(c) && (
              <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">histórica</span>
            )}
          </div>
        ),
      },
      {
        id: 'fechaEmision',
        header: 'Emisión',
        visibleAt: 'md',
        sortable: true,
        sortAccessor: (c) => c.fechaEmision ?? '',
        render: (c) => <span className="text-xs tabular-nums text-gray-600">{fmtFechaCorta(c.fechaEmision)}</span>,
      },
      {
        id: 'vence',
        header: 'Vence',
        visibleAt: 'lg',
        sortable: true,
        sortAccessor: (c) => c.fechaLimitePago ?? '',
        render: (c) => c.fechaLimitePago
          ? <span className={`text-xs tabular-nums ${c.vencida ? 'font-medium text-red-700' : 'text-gray-700'}`}>{fmtFechaCorta(c.fechaLimitePago)}</span>
          : null,
      },
      {
        id: 'atraso',
        header: 'Atraso',
        visibleAt: 'md',
        sortable: true,
        sortAccessor: (c) => (c.vencida ? c.diasVencido : -1),
        render: (c) => c.vencida
          ? <span className={`whitespace-nowrap text-xs tabular-nums text-red-600 ${c.diasVencido > 30 ? 'font-semibold' : ''}`}>{c.diasVencido} {c.diasVencido === 1 ? 'día' : 'días'}</span>
          : null,
      },
      {
        id: 'saldo',
        header: 'Saldo',
        align: 'right',
        sortable: true,
        sortAccessor: (c) => c.saldoFactura,
        render: (c) => (
          <span className={`whitespace-nowrap text-[15px] font-bold tabular-nums ${c.vencida ? 'text-red-700' : 'text-gray-900'}`}>
            {fmtDOP(c.saldoFactura)}
          </span>
        ),
      },
    ];
    // Fuera las columnas sin nada que enseñar: un colegio al contado no tiene
    // vencimientos ni atrasos, y «Vence»/«Atraso» ocuparían el ancho con guiones.
    const conDatos: Record<string, boolean> = {
      vence: cuentas.some((c) => !!c.fechaLimitePago),
      atraso: cuentas.some((c) => c.diasVencido > 0),
    };
    return base.filter((col) => conDatos[col.id] ?? true);
  }, [cuentas, puedeAbrirFactura]);

  const rowActions = (c: CuentaCxC): RowAction[] => [
    ...(puedeCobrar ? [{ icon: Wallet2, title: 'Registrar pago', onClick: () => setPagoModal(c), primary: true } as RowAction] : []),
    ...(puedeAbrirFactura ? [{ icon: Eye, title: 'Ver factura', href: `/dashboard/facturas/${c.id}`, primary: true } as RowAction] : []),
    { icon: PanelRightOpen, title: 'Ver movimientos', onClick: () => setDetalle(c), primary: true },
  ];

  const refrescar = () => { void mutate(); onCambio?.(); };

  if (permisosCargando) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>;
  if (!puedeVer) return <p className="text-sm text-gray-500">Sin permiso para consultar facturas.</p>;

  return (
    <div className="space-y-6">
      {/* ── Cuentas por cobrar (facturas) ──────────────────────────────── */}
      {seccion === 'cuentas' && (
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Cuentas por cobrar</h3>
          <p className="text-xs text-gray-500">
            Facturas de Facturación con saldo pendiente a nombre del responsable. La mora va aparte, en «Notas de débito».
          </p>
        </div>
        <DataTable<CuentaCxC>
          data={facturas}
          loading={isLoading && !data}
          error={error ? 'No se pudieron leer las cuentas por cobrar.' : null}
          columns={columnas}
          filters={[
            { type: 'search', id: 'busca', placeholder: 'Buscar documento o NCF…' },
            { type: 'select', id: 'estado', label: 'Estado', placeholder: 'Vencidas y al día', options: [
              { value: 'vencidas', label: 'Solo vencidas' },
              { value: 'al-dia', label: 'Solo al día' },
            ] },
            { type: 'daterange', id: 'fecha', label: 'Emisión' },
          ]}
          filterValues={filterValues}
          onFilterChange={setFilterValues}
          exportar={EXPORTAR}
          defaultSort={{ columnId: 'atraso', dir: 'desc' }}
          rowActions={rowActions}
          onRowClick={(c) => setDetalle(c)}
          emptyState={{
            icon: CheckCircle,
            title: 'Sin cuentas por cobrar',
            hint: (filterValues.busca || filterValues.estado || filterValues.fecha_desde || filterValues.fecha_hasta)
              ? 'Ninguna factura coincide con los filtros.'
              : 'El responsable no tiene facturas con saldo pendiente.',
          }}
        />
      </section>
      )}

      {/* ── Notas de débito (mora), en su sección aparte ───────────────── */}
      {seccion === 'notas' && (
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Notas de débito</h3>
            <p className="text-xs text-gray-500">Recargos por mora pendientes. Se cobran junto con la factura de la que cuelgan.</p>
          </div>
          <div className="flex items-center gap-3">
            {totalMora > 0 && (
              <span className="text-sm font-semibold tabular-nums text-red-600">{fmtDOP(totalMora)} en mora</span>
            )}
            <ExportarListado
              armar={() => armarEnvioTabla(EXPORTAR_NOTAS, notasExportar, 'Notas pendientes del responsable')}
              deshabilitado={isLoading || !!error || notasExportar.length === 0}
            />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">No se pudieron leer las notas de débito.</p>
        ) : conMora.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
            Sin notas de débito por mora.
          </p>
        ) : (
          <div className="space-y-3">
            {conMora.map((c) => {
              const notas: NotaMoraFila[] = (c.moraNotas ?? []).map((n) => ({
                id: n.id, codigo: n.codigo, montoTotal: n.montoTotal, saldo: n.saldo, estado: n.estado,
                fechaEmision: n.fechaEmision, periodo: n.periodo,
              }));
              return (
                <div key={c.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      {puedeAbrirFactura ? (
                        <Link href={`/dashboard/facturas/${c.id}`} className="font-mono text-xs text-zero-600 hover:underline">
                          {c.codigo ? fmtCodigoCorto(c.codigo) : `Factura #${c.id}`}
                        </Link>
                      ) : <span className="font-mono text-xs text-gray-700">{c.codigo ? fmtCodigoCorto(c.codigo) : `Factura #${c.id}`}</span>}
                      <span className="ml-1.5 text-gray-400">· {nombreDeCuenta(c) ?? 'Consumidor final'}</span>
                    </div>
                    {puedeCobrar && (
                      <Button variant="outline" size="sm" onClick={() => setPagoModal(c)}>
                        <Wallet2 className="mr-1.5 h-4 w-4" />Registrar pago
                      </Button>
                    )}
                  </div>
                  {/* La subtabla de recargos: sin estado, porque aquí solo cuelgan
                      los que tienen saldo. */}
                  {notas.length > 0 && <NotasMoraTable notas={notas} conEstado={false} enlazarDocumentos={puedeAbrirFactura} />}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Cobro — el mismo modal de la cartera general. Cobra la factura y, si
          hay mora, el resto se aplica a la mora. */}
      {pagoModal && (
        <PagoModal
          cuenta={pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); refrescar(); }}
        />
      )}

      {/* Detalle — timeline + gestión de cobro, sin salir de la ficha. */}
      {detalle && (
        <DetallePanel
          cuenta={detalle}
          onClose={() => setDetalle(null)}
          onCobrar={(cuentaActual) => { setPagoModal(cuentaActual); setDetalle(null); }}
          puedeCobrar={puedeCobrar}
          puedeAbrirFactura={puedeAbrirFactura}
          puedeGestionarCobro={puedeGestionarCobro}
        />
      )}
    </div>
  );
}
