'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ChevronRight, Eye, Search, Users, FileText } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import MuiButton from '@mui/material/Button';
import { fmtDOP, fmtFechaRD } from '@/lib/utils/format';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago-calc';

/** Facturas por página. La consulta va acotada por clientId y a esta tanda. */
const PAGE_SIZE = 50;

// Etiquetas legibles — mismas que el listado de facturas, sin arrastrar todo
// su componente.
const ESTADO_LABEL: Record<string, string> = {
  ACEPTADO: 'Aceptado', ACEPTADO_CONDICIONAL: 'Cond.', EN_PROCESO: 'En proceso',
  RECHAZADO: 'Rechazado', BORRADOR: 'Sin comprobante', ANULADO: 'Anulado',
  HISTORICA: 'Histórica',
};
const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito', '34': 'Nota Crédito',
  '41': 'Compras', '43': 'Gastos Men.', '44': 'Reg. Único', '45': 'Gub.',
  '46': 'Export.', '47': 'Otros', '00': 'Histórica', 'sin-ncf': '—',
};

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
}

interface Doc {
  id: number; encf: string; codigo: string | null; tipoEcf: string;
  estado: string; tipoPago: number | null; montoTotal: number;
  pagado: number; createdAt: string; fechaEmision: string;
}

/** Comprobante compacto: E310000000252 → «E31-252». Borradores → fallback. */
function fmtEncf(encf: string | null): string | null {
  if (!encf || !/^E\d{12}$/.test(encf)) return null;
  return `${encf.slice(0, 3)}-${encf.slice(3).replace(/^0+/, '') || '0'}`;
}

/** Fetcher de SWR. Fuera del componente para no recrearlo en cada render. */
const traerFacturas = (url: string): Promise<{ docs: Doc[]; total: number }> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('No se pudo cargar');
    return r.json();
  });

export default function FacturasClienteClient() {
  const [opciones, setOpciones] = useState<Cliente[]>([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [page, setPage] = useState(1);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La respuesta más reciente gana: al teclear rápido, una consulta lenta de
  // hace dos letras no puede pisar la lista de la letra actual.
  const buscaId = useRef(0);

  /**
   * Busca clientes por lo que se teclea. Solo clientes, nunca facturas: escribir
   * en el selector no dispara ninguna carga de facturas. Sin término no
   * consulta —así no se trae la lista completa como paso previo.
   */
  const buscarClientes = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 2) {
      setOpciones([]);
      setBuscandoClientes(false);
      return;
    }
    setBuscandoClientes(true);
    debounce.current = setTimeout(async () => {
      const id = ++buscaId.current;
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(term)}&limit=20`);
        const data = await res.json();
        if (id !== buscaId.current) return; // llegó tarde, hay una búsqueda posterior
        setOpciones(
          (data.clientes ?? []).map((c: Cliente) => ({
            id: c.id, razonSocial: c.razonSocial, rnc: c.rnc,
          })),
        );
      } catch {
        if (id === buscaId.current) setOpciones([]);
      } finally {
        if (id === buscaId.current) setBuscandoClientes(false);
      }
    }, 300);
  }, []);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  /**
   * Una PÁGINA de facturas del cliente elegido, vía SWR. Cada combinación
   * (cliente, página) se cachea por su URL: volver a una página ya vista —o
   * re-seleccionar un cliente ya consultado— se sirve del caché SIN pegarle
   * otra vez a la base. `dedupingInterval` no repite la misma consulta en
   * ráfaga; `keepPreviousData` deja las filas actuales mientras llega la
   * siguiente página, sin parpadeo. Reemplaza —no acumula—: en memoria solo
   * viven las 50 de la página en pantalla.
   */
  const key = cliente
    ? `/api/facturas?clientId=${cliente.id}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`
    : null;
  const { data, isLoading, isValidating } = useSWR(key, traerFacturas, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60_000,
  });
  const docs = data?.docs ?? [];
  const total = data?.total ?? 0;
  const cargando = isLoading || isValidating;

  function elegirCliente(c: Cliente | null) {
    setCliente(c);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      {/* Breadcrumb, igual que los demás reportes */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, color: '#6b7280' }}>
        <Link href="/dashboard/reportes" style={{ textDecoration: 'none' }}>
          <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280', '&:hover': { color: '#3658e1' } }}>
            Reportes
          </Typography>
        </Link>
        <ChevronRight style={{ width: 14, height: 14 }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>
          Facturas por cliente
        </Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Facturas por cliente
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Elige un cliente para ver sus facturas. Cada una se abre en su pantalla con «Ver factura».
        </Typography>
      </Box>

      {/* Selector de cliente — se alimenta de clientes, no de facturas */}
      <Box sx={{ maxWidth: 460, mb: 3 }}>
        <Autocomplete<Cliente>
          options={opciones}
          value={cliente}
          loading={buscandoClientes}
          onChange={(_e, c) => elegirCliente(c)}
          onInputChange={(_e, v, reason) => { if (reason === 'input') buscarClientes(v); }}
          // El backend ya filtró: no volver a filtrar en el navegador (perdería
          // resultados que matchean por RNC o por dependiente, no por nombre).
          filterOptions={(x) => x}
          getOptionLabel={(o) => o.razonSocial}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText="Escribe para buscar un cliente"
          size="small"
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Buscar cliente por nombre, RNC o beneficiario…"
              slotProps={{
                ...params.slotProps,
                input: {
                  ...params.slotProps.input,
                  startAdornment: <Search style={{ width: 16, height: 16, color: '#9ca3af', marginRight: 6 }} />,
                  endAdornment: (
                    <>
                      {buscandoClientes ? <CircularProgress size={16} /> : null}
                      {params.slotProps.input.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
          renderOption={(props, o) => {
            const { key, ...resto } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
            return (
              <Box component="li" key={key ?? o.id} {...resto} sx={{ display: 'block !important', py: 0.75 }}>
                <Typography variant="body2" sx={{ fontSize: '0.875rem', lineHeight: 1.35 }}>{o.razonSocial}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace' }}>
                  {o.rnc ?? 'Sin RNC / cédula'}
                </Typography>
              </Box>
            );
          }}
        />
      </Box>

      {/* Estado inicial: sin cliente, sin listado. No hay consulta global. */}
      {!cliente ? (
        <Vacio
          icon={Users}
          titulo="Ningún cliente seleccionado"
          detalle="Busca y elige un cliente arriba para ver sus facturas."
        />
      ) : cargando && docs.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : docs.length === 0 ? (
        <Vacio
          icon={FileText}
          titulo="Sin facturas"
          detalle={`${cliente.razonSocial} no tiene facturas registradas.`}
        />
      ) : (
        <>
          <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                {cliente.razonSocial}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {total} {total === 1 ? 'factura' : 'facturas'}
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <Box component="thead">
                  <Box component="tr">
                    <Th>Comprobante</Th>
                    <Th>Emisión</Th>
                    <Th>Tipo</Th>
                    <Th>Estado</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Cobro</Th>
                    <Th align="right" />
                  </Box>
                </Box>
                <Box component="tbody">
                  {docs.map((d) => {
                    const compacto = fmtEncf(d.encf);
                    const ep = calcularEstadoPago({
                      estado: d.estado, tipoPago: d.tipoPago,
                      montoTotal: d.montoTotal, totalPagado: d.pagado ?? 0,
                    });
                    return (
                      <Box component="tr" key={d.id}
                        sx={{ borderTop: '1px solid #f3f4f6', '&:hover': { bgcolor: '#f9fafb' } }}>
                        <Td>
                          <Link href={`/dashboard/facturas/${d.id}`}
                            style={{ textDecoration: 'none', color: '#2a45c4', fontWeight: 600, fontFamily: 'monospace' }}>
                            {compacto ?? (d.codigo ?? `#${d.id}`)}
                          </Link>
                        </Td>
                        <Td sx={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{fmtFechaRD(d.createdAt)}</Td>
                        <Td sx={{ color: '#374151' }}>{TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf}</Td>
                        <Td sx={{ color: '#374151' }}>{ESTADO_LABEL[d.estado] ?? d.estado}</Td>
                        <Td align="right" sx={{ fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtDOP(d.montoTotal)}
                        </Td>
                        <Td align="right"><CobroBadge estado={ep} /></Td>
                        <Td align="right">
                          <Link href={`/dashboard/facturas/${d.id}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3658e1', fontSize: '0.8125rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <Eye style={{ width: 15, height: 15 }} /> Ver factura
                          </Link>
                        </Td>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </Box>

          {total > PAGE_SIZE && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                {desde}–{hasta} de {total} · página {page} de {totalPaginas}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MuiButton variant="outlined" size="small" disabled={cargando || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  sx={{ borderRadius: '8px', textTransform: 'none' }}>
                  Anterior
                </MuiButton>
                <MuiButton variant="outlined" size="small" disabled={cargando || page >= totalPaginas}
                  onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                  startIcon={cargando ? <CircularProgress size={14} color="inherit" /> : undefined}
                  sx={{ borderRadius: '8px', textTransform: 'none' }}>
                  Siguiente
                </MuiButton>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <Box component="th" sx={{
      px: 2, py: 1.5, textAlign: align, fontSize: '0.6875rem', fontWeight: 600,
      color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
      bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
    }}>
      {children}
    </Box>
  );
}

function Td({ children, align = 'left', sx }: {
  children?: React.ReactNode; align?: 'left' | 'right'; sx?: object;
}) {
  return (
    <Box component="td" sx={{ px: 2, py: 1.5, textAlign: align, fontSize: '0.875rem', whiteSpace: 'nowrap', ...sx }}>
      {children}
    </Box>
  );
}

const COBRO: Record<string, { label: string; bg: string; fg: string }> = {
  PAGADA:    { label: 'Pagada',    bg: '#ecfdf5', fg: '#047857' },
  PARCIAL:   { label: 'Parcial',   bg: '#fffbeb', fg: '#b45309' },
  PENDIENTE: { label: 'Pendiente', bg: '#fffbeb', fg: '#b45309' },
  GRATUITA:  { label: 'Gratuita',  bg: '#f3f4f6', fg: '#6b7280' },
  USO:       { label: 'Uso',       bg: '#f3f4f6', fg: '#6b7280' },
  ANULADA:   { label: '—',         bg: '#f3f4f6', fg: '#9ca3af' },
};

function CobroBadge({ estado }: { estado: string }) {
  const c = COBRO[estado] ?? { label: estado, bg: '#f3f4f6', fg: '#6b7280' };
  return (
    <Box component="span" sx={{
      display: 'inline-block', px: 1, py: 0.25, borderRadius: '999px',
      fontSize: '0.6875rem', fontWeight: 600, bgcolor: c.bg, color: c.fg,
    }}>
      {c.label}
    </Box>
  );
}

function Vacio({ icon: Icon, titulo, detalle }: {
  icon: React.ElementType; titulo: string; detalle: string;
}) {
  return (
    <Box sx={{
      border: '1px dashed #d1d5db', borderRadius: '12px', py: 6, px: 3,
      textAlign: 'center', color: '#6b7280',
    }}>
      <Icon style={{ width: 28, height: 28, margin: '0 auto 8px', color: '#9ca3af' }} />
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: '0.8125rem', mt: 0.5 }}>{detalle}</Typography>
    </Box>
  );
}
