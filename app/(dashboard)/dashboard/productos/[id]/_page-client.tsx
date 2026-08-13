'use client';

import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Package, ShoppingBag, TrendingUp, CalendarClock, ShoppingCart, Truck, Tags, Camera } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { fmtFechaCorta, fmtDOP } from '@/lib/utils/format';
import { useVolver } from '@/lib/hooks/useVolver';
import AlmacenesPosSection from './_almacenes-pos';

interface Producto {
  id:                   number;
  nombre:               string;
  descripcion:          string | null;
  referencia:           string | null;
  precioDOP:            number;
  costoDOP:             number;
  tasaItbis:            string;
  tipo:                 string;
  activo:               string;
  unidadMedida:         string;
  stockActual:          number;
  stockMinimo:          number;
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  visiblePos:           boolean;
  imagen:               string | null;
}

interface VentaProducto {
  movimientoId:      number;
  ecfId:              number;
  encf:                string;
  estado:              string;
  fecha:               string;
  cliente:             string;
  vendedor:            string;
  cantidad:            number;
  precioUnitario:      number | null;
  subtotal:            number | null;
  montoTotalFactura:   number;
}

interface CompraProducto {
  itemId:         number;
  compraId:       number;
  fecha:          string;
  proveedor:      string;
  proveedorRnc:   string | null;
  referenciaEncf: string | null;
  registradoPor:  string;
  cantidad:       number;
  costoUnitario:  number;   // centavos
  subtotal:       number;   // centavos
}

interface MaestroValor { id: number; valor: string; }
interface MaestroAplicable {
  id:       number;
  nombre:   string;
  multiple: boolean;
  valores:  MaestroValor[];
}
interface MaestrosResponse {
  maestros?:     MaestroAplicable[];
  asignaciones?: { maestroId: number; valorId: number }[];
}

const IMG_MAX_BYTES = 800_000; // ~800KB, mismo tope que el resto de imágenes de la app

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TASA_LABELS: Record<string, string> = {
  '0.18': 'ITBIS 18%', '0.16': 'ITBIS 16%', '0': 'ITBIS 0%', exento: 'Exento',
};

const ESTADO_BADGE: Record<string, object> = {
  ACEPTADO:             { bgcolor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  ACEPTADO_CONDICIONAL: { bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' },
  RECHAZADO:            { bgcolor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
  EN_PROCESO:           { bgcolor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' },
  BORRADOR:             { bgcolor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' },
  ANULADO:              { bgcolor: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb', textDecoration: 'line-through' },
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

const columnsVentas: DataTableColumn<VentaProducto>[] = [
  {
    id: 'encf',
    header: 'e-NCF',
    render: v => (
      <MuiLink component={Link} href={`/dashboard/facturas/${v.ecfId}`}
        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#2a45c4', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
        {v.encf}
      </MuiLink>
    ),
  },
  {
    id: 'fecha',
    header: 'Fecha',
    visibleAt: 'md',
    render: v => <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtFechaCorta(v.fecha)}</Typography>,
  },
  {
    id: 'cliente',
    header: 'Cliente',
    render: v => <Typography component="span" sx={{ fontSize: '0.875rem', color: '#111827', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente}</Typography>,
  },
  {
    id: 'vendedor',
    header: 'Vendedor',
    visibleAt: 'lg',
    render: v => <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{v.vendedor}</Typography>,
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    render: v => (
      <Box component="span" sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        px: 1, py: 0.25, borderRadius: '9999px', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap',
        ...(ESTADO_BADGE[v.estado] ?? { bgcolor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }),
      }}>
        {v.estado}
      </Box>
    ),
  },
  {
    id: 'cantidad',
    header: 'Cant.',
    align: 'right',
    render: v => <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{v.cantidad}</Typography>,
  },
  {
    id: 'precioUnitario',
    header: 'Precio unit.',
    align: 'right',
    visibleAt: 'md',
    render: v => (
      <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>
        {v.precioUnitario !== null ? `RD$${v.precioUnitario.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </Typography>
    ),
  },
  {
    id: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    render: v => (
      <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {v.subtotal !== null ? `RD$${v.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </Typography>
    ),
  },
];

const columnsCompras: DataTableColumn<CompraProducto>[] = [
  {
    id: 'compra',
    header: 'Compra',
    render: c => (
      <MuiLink component={Link} href={`/dashboard/compras/local/${c.compraId}`}
        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#2a45c4', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
        #{c.compraId}
      </MuiLink>
    ),
  },
  {
    id: 'fecha',
    header: 'Fecha',
    render: c => <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtFechaCorta(c.fecha)}</Typography>,
  },
  {
    id: 'proveedor',
    header: 'Proveedor',
    render: c => (
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.proveedor}</Typography>
        {c.proveedorRnc && <Typography sx={{ fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{c.proveedorRnc}</Typography>}
      </Box>
    ),
  },
  {
    id: 'referencia',
    header: 'e-NCF',
    visibleAt: 'md',
    render: c => <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#4b5563' }}>{c.referenciaEncf ?? '—'}</Typography>,
  },
  {
    id: 'registradoPor',
    header: 'Registrado por',
    visibleAt: 'lg',
    render: c => <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{c.registradoPor}</Typography>,
  },
  {
    id: 'cantidad',
    header: 'Cant.',
    align: 'right',
    render: c => <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{c.cantidad}</Typography>,
  },
  {
    id: 'costoUnitario',
    header: 'Costo unit.',
    align: 'right',
    visibleAt: 'md',
    render: c => <Typography component="span" sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{fmtDOP(c.costoUnitario)}</Typography>,
  },
  {
    id: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    render: c => <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDOP(c.subtotal)}</Typography>,
  },
];

export default function ProductoDetalleClient({ productoId, posHabilitado = false }: { productoId: number; posHabilitado?: boolean }) {
  const { data: prodData, isLoading: loadingProd, mutate: mutateProd } = useSWR<{ producto?: Producto; error?: string }>(
    `/api/productos/${productoId}`, fetcher,
  );
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [tab, setTab] = useState('detalle');
  const { data: ventasData, isLoading: loadingVentas } = useSWR<{ ventas?: VentaProducto[]; error?: string }>(
    `/api/productos/${productoId}/ventas`, fetcher,
  );
  const { data: comprasData, isLoading: loadingCompras } = useSWR<{ compras?: CompraProducto[]; error?: string }>(
    `/api/productos/${productoId}/compras`, fetcher,
  );
  const { data: maestrosData } = useSWR<MaestrosResponse>(
    `/api/productos/${productoId}/maestros`, fetcher,
  );

  const volver = useVolver('/dashboard/productos');

  const producto = prodData?.producto;
  const ventas    = ventasData?.ventas ?? [];
  const compras   = comprasData?.compras ?? [];

  async function handleImagenFile(file: File) {
    if (!producto) return;
    if (!file.type.startsWith('image/')) { alert('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { alert('Imagen demasiado grande (máx 800 KB)'); return; }
    setSubiendoImagen(true);
    const imagen = await fileToBase64(file);
    await guardarImagen(imagen);
  }

  async function guardarImagen(imagen: string | null) {
    if (!producto) return;
    setSubiendoImagen(true);
    try {
      const res = await fetch(`/api/productos/${productoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          referencia: producto.referencia,
          precio: producto.precioDOP,
          tasaItbis: producto.tasaItbis,
          tipo: producto.tipo,
          unidadMedida: producto.unidadMedida,
          costo: producto.costoDOP,
          stockActual: producto.stockActual,
          stockMinimo: producto.stockMinimo,
          controlaInventario: producto.controlaInventario,
          permiteVentaSinStock: producto.permiteVentaSinStock,
          imagen,
        }),
      });
      if (res.ok) await mutateProd();
      else alert('No se pudo guardar la imagen');
    } finally {
      setSubiendoImagen(false);
    }
  }

  const resumen = useMemo(() => {
    const unidades   = ventas.reduce((acc, v) => acc + v.cantidad, 0);
    const totalVendido = ventas.reduce((acc, v) => acc + (v.subtotal ?? 0), 0);
    const ultimaVenta  = ventas[0]?.fecha ?? null;
    return { unidades, totalVendido, ultimaVenta };
  }, [ventas]);

  // Atributos (maestros) asignados — solo lectura, agrupados por maestro.
  const atributos = useMemo(() => {
    const ms  = maestrosData?.maestros ?? [];
    const asg = maestrosData?.asignaciones ?? [];
    return ms
      .map(m => {
        const valores = asg
          .filter(a => a.maestroId === m.id)
          .map(a => m.valores.find(v => v.id === a.valorId)?.valor)
          .filter((v): v is string => !!v);
        return { id: m.id, nombre: m.nombre, valores };
      })
      .filter(m => m.valores.length > 0);
  }, [maestrosData]);

  const resumenCompras = useMemo(() => {
    const unidades     = compras.reduce((acc, c) => acc + c.cantidad, 0);
    const totalComprado = compras.reduce((acc, c) => acc + c.subtotal, 0);
    const ultimaCompra  = compras[0]?.fecha ?? null;
    return { unidades, totalComprado, ultimaCompra };
  }, [compras]);

  if (!loadingProd && !producto) {
    return (
      <Box component="section" sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 5, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>{prodData?.error ?? 'Producto no encontrado.'}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <MuiLink component="button" type="button" onClick={volver}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', p: 0, textDecoration: 'none', alignSelf: 'flex-start', '&:hover': { color: '#374151' } }}>
        <ArrowLeft style={{ width: 16, height: 16 }} /> Productos
      </MuiLink>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box component="label" title={producto?.imagen ? 'Cambiar imagen' : 'Agregar imagen'}
          sx={{
            position: 'relative', height: 56, width: 56, flexShrink: 0, cursor: 'pointer',
            overflow: 'hidden', borderRadius: '12px', bgcolor: '#eef2fe',
            '&:hover [data-overlay]': { bgcolor: 'rgba(0,0,0,0.4)', opacity: 1 },
          }}>
          <input type="file" accept="image/*" disabled={subiendoImagen} style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImagenFile(f); e.target.value = ''; }} />
          {producto?.imagen
            ? <Box component="img" src={producto.imagen} alt={producto.nombre} sx={{ height: '100%', width: '100%', objectFit: 'cover' }} />
            : <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center' }}><Package style={{ width: 24, height: 24, color: '#3658e1' }} /></Box>}
          <Box data-overlay sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0)', color: '#fff', opacity: 0, transition: 'all 0.2s' }}>
            {subiendoImagen ? <Box component="span" sx={{ fontSize: '10px' }}>…</Box> : <Camera style={{ width: 16, height: 16 }} />}
          </Box>
        </Box>
        <Box>
          <Typography component="h1" sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>{producto?.nombre ?? '—'}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.25 }}>{producto?.referencia ? `Ref. ${producto.referencia}` : 'Sin referencia'}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        <ResumenCard icon={<TrendingUp style={{ width: 18, height: 18, color: '#059669' }} />} iconBg="#ecfdf5"
          label="Total vendido"
          valor={`RD$${resumen.totalVendido.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <ResumenCard icon={<ShoppingBag style={{ width: 18, height: 18, color: '#0284c7' }} />} iconBg="#f0f9ff"
          label="Unidades vendidas" valor={String(resumen.unidades)} />
        <ResumenCard icon={<CalendarClock style={{ width: 18, height: 18, color: '#d97706' }} />} iconBg="#fffbeb"
          label="Última venta" valor={resumen.ultimaVenta ? fmtFechaCorta(resumen.ultimaVenta) : '—'} />
      </Box>

      {posHabilitado && producto && (
        <AlmacenesPosSection productoId={productoId} visiblePos={producto.visiblePos} />
      )}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{
            borderBottom: '1px solid #e5e7eb', minHeight: 40,
            '& .MuiTabs-indicator': { backgroundColor: '#3658e1' },
            '& .MuiTab-root': { textTransform: 'none', minHeight: 40, py: 1, fontSize: '0.875rem', fontWeight: 500, color: '#6b7280', '&.Mui-selected': { color: '#2a45c4' } },
          }}>
          <Tab value="detalle" label="Detalle" />
          <Tab value="ventas" label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
              Historial de ventas
              {ventas.length > 0 && <Box component="span" sx={{ ml: 0.75, fontSize: '11px', color: '#9ca3af' }}>({ventas.length})</Box>}
            </Box>
          } />
          <Tab value="compras" label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
              Historial de compras
              {compras.length > 0 && <Box component="span" sx={{ ml: 0.75, fontSize: '11px', color: '#9ca3af' }}>({compras.length})</Box>}
            </Box>
          } />
        </Tabs>

        {tab === 'detalle' && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
              <Campo label="Tipo" valor={producto?.tipo === 'bien' ? 'Producto' : 'Servicio'} />
              <Campo label="Precio" valor={producto ? `RD$${producto.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'} />
              <Campo label="Costo" valor={producto ? `RD$${producto.costoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'} />
              <Campo label="ITBIS" valor={producto ? (TASA_LABELS[producto.tasaItbis] ?? producto.tasaItbis) : '—'} />
              <Campo label="Unidad" valor={producto?.unidadMedida ?? '—'} />
              <Campo label="Estado" valor={producto?.activo === 'true' ? 'Activo' : 'Inactivo'} />
              {producto?.controlaInventario && (
                <>
                  <Campo label="Stock actual" valor={String(producto.stockActual)} />
                  <Campo label="Stock mínimo" valor={String(producto.stockMinimo)} />
                  <Campo label="Venta sin stock" valor={producto.permiteVentaSinStock ? 'Permitida' : 'Bloqueada'} />
                </>
              )}
              {producto?.descripcion && (
                <Box sx={{ gridColumn: { xs: 'span 2', sm: 'span 3' } }}>
                  <Campo label="Descripción" valor={producto.descripcion} />
                </Box>
              )}
            </Box>

            {/* Atributos asignados (maestros) — solo lectura */}
            {atributos.length > 0 && (
              <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2.5, mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Tags style={{ width: 16, height: 16, color: '#9ca3af' }} />
                  <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Atributos</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {atributos.map(a => (
                    <Box key={a.id}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{a.nombre}</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                        {a.valores.map(v => (
                          <Chip key={v} label={v} size="small"
                            sx={{ height: 22, borderRadius: '9999px', bgcolor: '#f3f4f6', color: '#374151', fontSize: '0.75rem', '& .MuiChip-label': { px: 1 } }} />
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {tab === 'ventas' && (
          <Box sx={{ mt: 2 }}>
            <DataTable<VentaProducto>
              data={ventas}
              loading={loadingVentas}
              columns={columnsVentas}
              rowId={v => v.movimientoId}
              title="Facturas con este producto"
              emptyState={{
                icon:  ShoppingBag,
                title: 'Sin ventas registradas todavía',
                hint:  'Aquí aparecerán las facturas guardadas o emitidas que incluyan este producto.',
              }}
            />
          </Box>
        )}

        {tab === 'compras' && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2 }}>
              <ResumenCard icon={<ShoppingCart style={{ width: 18, height: 18, color: '#4f46e5' }} />} iconBg="#eef2ff"
                label="Total comprado" valor={fmtDOP(resumenCompras.totalComprado)} />
              <ResumenCard icon={<Truck style={{ width: 18, height: 18, color: '#7c3aed' }} />} iconBg="#f5f3ff"
                label="Unidades compradas" valor={String(resumenCompras.unidades)} />
              <ResumenCard icon={<CalendarClock style={{ width: 18, height: 18, color: '#d97706' }} />} iconBg="#fffbeb"
                label="Última compra" valor={resumenCompras.ultimaCompra ? fmtFechaCorta(resumenCompras.ultimaCompra) : '—'} />
            </Box>

            <DataTable<CompraProducto>
              data={compras}
              loading={loadingCompras}
              columns={columnsCompras}
              rowId={c => c.itemId}
              title="Compras con este producto"
              emptyState={{
                icon:  ShoppingCart,
                title: 'Sin compras registradas todavía',
                hint:  'Aquí aparecerán las compras manuales que registres incluyendo este producto.',
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{valor}</Typography>
    </Box>
  );
}

function ResumenCard({ icon, iconBg, label, valor }: { icon: ReactNode; iconBg: string; label: string; valor: string }) {
  return (
    <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ height: 36, width: 36, borderRadius: '8px', bgcolor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{valor}</Typography>
      </Box>
    </Box>
  );
}
