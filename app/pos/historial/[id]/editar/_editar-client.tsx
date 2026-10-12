'use client';

/**
 * Editor de un recibo POS ya cobrado (Fase 1: solo AÑADIR + cobrar diferencia).
 *
 * Pantalla espejo de la de venta: grilla de productos a la izquierda, panel de
 * "cuenta" a la derecha. Las líneas ya facturadas salen en gris/bloqueadas (chip
 * "En la factura"); las nuevas se editan como un carrito. "Cobrar diferencia"
 * abre un cobro por el delta y llama POST /api/pos/venta/[id]/editar.
 *
 * Autocontenido a propósito: no reusa el carrito del POS (2400 líneas, muy
 * acoplado) para no arriesgar la pantalla de venta que ya funciona. Quitar
 * líneas (con PIN) llega en una fase posterior.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import Chip from '@mui/material/Chip';
import { ArrowLeft, X, Plus, Lock, Trash2 } from 'lucide-react';
import { montosRapidos } from '@/lib/pos/montos';
import { estaAgotado } from '@/lib/pos/agotado';

const MONEY = { fontVariantNumeric: 'tabular-nums' } as const;
const fmt = (c: number) => (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Factor ITBIS a partir del string del catálogo ('exento' → 0). */
function tasaFactor(t: string | undefined): number {
  if (t === '0.18') return 0.18;
  if (t === '0.16') return 0.16;
  return 0; // '0' | 'exento' | undefined
}
function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}
function tileColor(nombre: string): { bg: string; fg: string } {
  const paleta = [
    { bg: '#eef2fe', fg: '#3658e1' }, { bg: '#ecfdf5', fg: '#059669' },
    { bg: '#fef3c7', fg: '#b45309' }, { bg: '#fce7f3', fg: '#be185d' },
    { bg: '#ede9fe', fg: '#6d28d9' }, { bg: '#e0f2fe', fg: '#0369a1' },
  ];
  let h = 0; for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}

interface Terminal { id: number; nombre: string; almacenId: number; listaPreciosId: number | null; mesas: boolean }
interface ProductoPos {
  id: number; nombre: string; referencia: string | null; precio: number; tasaItbis: string;
  tipo: string; controlaInventario: boolean; permiteVentaSinStock: boolean; favorito: boolean;
  stockAlmacen: number | null; categoriaId: number | null; categoriaNombre: string | null; imagen: string | null;
}
interface LineaVieja { nombreItem: string; cantidadItem: number; precioUnitarioItem: number; tasaItbis?: string }
interface LineaNueva extends ProductoPos { qty: number }
type Metodo = 'efectivo' | 'tarjeta' | 'transferencia';

export default function EditarReciboClient({ docId, terminal }: { docId: number; terminal: Terminal | null }) {
  const router = useRouter();
  const [productos, setProductos] = useState<ProductoPos[]>([]);
  const [viejas, setViejas] = useState<LineaVieja[]>([]);
  const [totalViejo, setTotalViejo] = useState(0);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevas, setNuevas] = useState<LineaNueva[]>([]);
  const [quitados, setQuitados] = useState<Set<number>>(new Set());     // índices en `viejas`
  const [confirmarQuitar, setConfirmarQuitar] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<number | 'todas'>('todas');
  const [abrirCobro, setAbrirCobro] = useState(false);
  const [devolverAbierto, setDevolverAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Carga el recibo (líneas viejas) y el catálogo de la terminal del turno.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const rT = await fetch(`/api/pos/ticket/${docId}`);
        if (!rT.ok) throw new Error((await rT.json().catch(() => ({}))).error || 'No se pudo cargar el recibo');
        const t = await rT.json();
        if (!vivo) return;
        setViejas(t.lineas ?? []);
        setTotalViejo(t.doc?.montoTotal ?? 0);
        setCodigo(t.doc?.codigo ?? null);
        setCliente(t.doc?.dependiente || t.doc?.cliente || 'Consumidor Final');

        if (terminal) {
          const p = new URLSearchParams({ terminalId: String(terminal.id) });
          if (terminal.listaPreciosId) p.set('listaPreciosId', String(terminal.listaPreciosId));
          const rC = await fetch(`/api/pos/catalogo?${p}`);
          if (rC.ok && vivo) setProductos((await rC.json()).productos ?? []);
        }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [docId, terminal]);

  const categorias = useMemo(() => {
    const vistas = new Map<number, string>();
    for (const p of productos) if (p.categoriaId != null && !vistas.has(p.categoriaId)) vistas.set(p.categoriaId, p.categoriaNombre ?? '—');
    return [...vistas.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (categoria !== 'todas' && p.categoriaId !== categoria) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) || (p.referencia ?? '').toLowerCase().includes(q);
    });
  }, [productos, busqueda, categoria]);

  const qtyDe = useCallback((id: number) => nuevas.find((n) => n.id === id)?.qty ?? 0, [nuevas]);

  function agregar(p: ProductoPos) {
    setNuevas((prev) => {
      const i = prev.findIndex((n) => n.id === p.id);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...prev, { ...p, qty: 1 }];
    });
  }
  function cambiarQty(id: number, delta: number) {
    setNuevas((prev) => prev.flatMap((n) => {
      if (n.id !== id) return [n];
      const q = n.qty + delta;
      return q <= 0 ? [] : [{ ...n, qty: q }];
    }));
  }

  // Total de una línea ya facturada (con su ITBIS), en centavos.
  const totalVieja = (l: LineaVieja) => Math.round(l.precioUnitarioItem * l.cantidadItem * 100 * (1 + tasaFactor(l.tasaItbis)));

  const deltaCts = useMemo(
    () => nuevas.reduce((s, n) => s + Math.round(n.precio * n.qty * (1 + tasaFactor(n.tasaItbis))), 0),
    [nuevas],
  );
  const quitadoCts = useMemo(
    () => viejas.reduce((s, l, i) => (quitados.has(i) ? s + totalVieja(l) : s), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viejas, quitados],
  );
  const netoCts = deltaCts - quitadoCts;          // > 0 cobrar, < 0 devolver
  const totalNuevoCts = totalViejo + netoCts;
  const hayCambios = nuevas.length > 0 || quitados.size > 0;

  async function enviar(pagos: { metodo: string; valorCentavos: number }[]) {
    setGuardando(true);
    try {
      const itemsNuevos = nuevas.map((n) => ({
        productoId: n.id > 0 ? n.id : null,
        nombreItem: n.nombre,
        referencia: n.referencia ?? '',
        cantidadItem: n.qty,
        precioUnitarioItem: n.precio / 100,          // pesos
        tasaItbis: n.tasaItbis || 'exento',
        indicadorBienoServicio: n.tipo === 'bien' ? '1' : '2',
      }));
      const res = await fetch(`/api/pos/venta/${docId}/editar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemsNuevos, itemsQuitados: [...quitados], pagos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? 'No se pudo actualizar'); return; }
      if (data.requiereNotaCredito) {
        toast.info('Requiere Nota de Crédito — te llevo al formulario');
        router.push(data.redirectTo);
        return;
      }
      toast.success('Factura actualizada');
      router.push('/pos/historial');
    } finally {
      setGuardando(false);
      setAbrirCobro(false);
      setDevolverAbierto(false);
    }
  }

  // Botón principal según el neto: cobrar (sube), devolver (baja) o guardar (=).
  function accionPrincipal() {
    if (netoCts > 0) setAbrirCobro(true);
    else if (netoCts < 0) setDevolverAbierto(true);
    else enviar([]);   // neto 0: solo se reordena la cuenta, sin dinero
  }
  const labelAccion = netoCts > 0 ? `Cobrar diferencia ${fmt(netoCts)}`
    : netoCts < 0 ? `Devolver ${fmt(-netoCts)}`
    : 'Guardar cambios';

  if (cargando) return <Centro>Cargando recibo…</Centro>;
  if (error) return <Centro color="#991b1b">{error}</Centro>;

  return (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f9fafb' }}>
      {/* Encabezado */}
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #e5e7eb', bgcolor: '#fff', px: { xs: 1.5, sm: 2 }, py: 1 }}>
        <Button onClick={() => router.push('/pos/historial')} variant="outlined"
          sx={{ minWidth: 0, gap: 0.5, textTransform: 'none', color: '#374151', borderColor: '#d1d5db', px: 1.5, py: 1 }}>
          <ArrowLeft style={{ width: 18, height: 18 }} /> Historial
        </Button>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }} noWrap>
            Editar recibo {codigo ?? `#${docId}`}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>{cliente} · añade ítems y cobra la diferencia</Typography>
        </Box>
      </Box>

      {!terminal ? (
        <Centro>No hay un turno de caja abierto en una terminal. Abre un turno para editar recibos.</Centro>
      ) : (
        <Box sx={{ display: 'grid', minHeight: 0, flex: 1, gridTemplateColumns: { xs: '1fr', md: '1.55fr 1fr' }, gap: 1.5, p: 1.5 }}>
          {/* Grilla de productos */}
          <Box sx={{ display: 'flex', minHeight: 0, flexDirection: 'column' }}>
            <TextField
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto (nombre o referencia)…"
              sx={{ mb: 1.5, '& .MuiInputBase-root': { height: 48, fontSize: 15, borderRadius: '10px' } }}
            />
            {categorias.length > 0 && (
              <Box sx={{ mb: 1.5, display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                <CatChip label="Todas" activo={categoria === 'todas'} onClick={() => setCategoria('todas')} />
                {categorias.map((c) => <CatChip key={c.id} label={c.nombre} activo={categoria === c.id} onClick={() => setCategoria(c.id)} />)}
              </Box>
            )}
            <Box sx={{ display: 'grid', flex: 1, gridAutoRows: 'max-content', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, alignContent: 'start', gap: 2, overflow: 'auto', pb: 1.5 }}>
              {filtrados.length === 0 && (
                <Typography sx={{ gridColumn: '1 / -1', fontSize: 14, color: '#6b7280' }}>Sin productos.</Typography>
              )}
              {filtrados.map((p) => {
                const agotado = estaAgotado(p);
                const qty = qtyDe(p.id);
                return (
                  <ButtonBase key={p.id} disabled={agotado} onClick={() => agregar(p)}
                    sx={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden',
                      borderRadius: '12px', border: '1px solid', bgcolor: '#fff', textAlign: 'left', opacity: agotado ? 0.5 : 1,
                      borderColor: qty > 0 ? '#8193f5' : '#e5e7eb', boxShadow: qty > 0 ? '0 0 0 1px #8193f5' : 'none',
                      '&:active': { transform: 'scale(0.97)' }, '&:hover': { borderColor: agotado ? '#e5e7eb' : '#8193f5' },
                    }}>
                    {/* Cuadrado siempre: sin minHeight:0 el alto real de una foto
                        vertical pisa el aspect-ratio y estira la tarjeta.
                        Ver la nota larga en app/pos/_pos-client.tsx. */}
                    <Box sx={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', minHeight: 0, flexShrink: 0, bgcolor: '#f9fafb' }}>
                      {p.imagen ? (
                        <Box component="img" src={p.imagen} alt={p.nombre} sx={{ display: 'block', height: '100%', width: '100%', objectFit: 'cover' }} />
                      ) : (() => {
                        const c = tileColor(p.nombre);
                        return <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', bgcolor: c.bg }}>
                          <Box component="span" sx={{ fontSize: { xs: 32, sm: 44 }, fontWeight: 700, color: c.fg }}>{iniciales(p.nombre)}</Box>
                        </Box>;
                      })()}
                      {qty > 0 && (
                        <Box component="span" sx={{ position: 'absolute', left: 8, top: 8, display: 'flex', height: 30, minWidth: 30, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: '#3658e1', px: 1, fontSize: 14, fontWeight: 700, color: '#fff', ...MONEY }}>{qty}</Box>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', p: 1.5 }}>
                      <Box sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 700, lineHeight: 1.25 }}>{p.nombre}</Box>
                      <Box sx={{ mt: 1, fontSize: 20, fontWeight: 800, color: '#111827', ...MONEY }}>{fmt(p.precio)}</Box>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>

          {/* Panel de cuenta */}
          <Box sx={{ display: 'flex', minHeight: 0, width: '100%', flexDirection: 'column', borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 1.5 }}>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {/* Líneas ya facturadas (bloqueadas) */}
              <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                <Lock style={{ width: 13, height: 13 }} /> En la factura ({viejas.length})
              </Box>
              {viejas.map((l, i) => {
                const quitada = quitados.has(i);
                return (
                  <Box key={`v${i}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #f3f4f6', py: 1, opacity: quitada ? 0.5 : 0.75 }}>
                    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 500, color: '#6b7280', textDecoration: quitada ? 'line-through' : 'none' }} component="div">{l.cantidadItem}× {l.nombreItem}</Box>
                      {quitada && <Chip label="Se quita" size="small" sx={{ flexShrink: 0, height: 20, fontSize: 11, bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }} />}
                    </Box>
                    <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 0.5 }}>
                      <Box component="span" sx={{ fontSize: 14, color: '#6b7280', textDecoration: quitada ? 'line-through' : 'none', ...MONEY }}>{fmt(totalVieja(l))}</Box>
                      {quitada ? (
                        <ButtonBase onClick={() => setQuitados((prev) => { const s = new Set(prev); s.delete(i); return s; })} sx={{ px: 0.75, py: 0.25, borderRadius: '6px', fontSize: 12, color: '#2a45c4', fontWeight: 500 }}>Deshacer</ButtonBase>
                      ) : (
                        <IconButton onClick={() => setConfirmarQuitar(i)} size="small" title="Quitar de la factura" sx={{ color: '#dc2626' }}><Trash2 style={{ width: 15, height: 15 }} /></IconButton>
                      )}
                    </Box>
                  </Box>
                );
              })}

              {/* Líneas nuevas (editables) */}
              <Box sx={{ mt: 2, mb: 1, fontSize: 12, fontWeight: 600, color: '#3658e1' }}>Nuevos ({nuevas.length})</Box>
              {nuevas.length === 0 ? (
                <Typography sx={{ py: 2, textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>Toca productos para añadirlos a la factura</Typography>
              ) : nuevas.map((n) => (
                <Box key={n.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #f3f4f6', py: 1.25 }}>
                  <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 600 }}>{n.nombre}</Box>
                    <Box sx={{ mt: 0.25, fontSize: 14, color: '#9ca3af', ...MONEY }}>{fmt(n.precio)}</Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1 }}>
                    <ButtonBase onClick={() => cambiarQty(n.id, -1)} sx={{ display: 'flex', height: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 24, color: '#4b5563' }}>−</ButtonBase>
                    <Box component="span" sx={{ width: 28, textAlign: 'center', fontSize: 18, fontWeight: 700, ...MONEY }}>{n.qty}</Box>
                    <ButtonBase onClick={() => cambiarQty(n.id, 1)} sx={{ display: 'flex', height: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 24, color: '#4b5563' }}>+</ButtonBase>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Totales */}
            <Box sx={{ mt: 1.5, borderTop: '1px solid #f3f4f6', pt: 1.5 }}>
              <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}><span>Ya facturado</span><Box component="span" sx={MONEY}>{fmt(totalViejo)}</Box></Box>
              {deltaCts > 0 && <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#3658e1', fontWeight: 600 }}><span>Nuevo (+)</span><Box component="span" sx={MONEY}>{fmt(deltaCts)}</Box></Box>}
              {quitadoCts > 0 && <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#dc2626', fontWeight: 600 }}><span>Quitado (−)</span><Box component="span" sx={MONEY}>{fmt(quitadoCts)}</Box></Box>}
              <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><Box component="span" sx={{ fontSize: 18, fontWeight: 700 }}>Total</Box><Box component="span" sx={{ fontSize: 26, fontWeight: 800, ...MONEY }}>{fmt(totalNuevoCts)}</Box></Box>
              <Button disabled={!hayCambios || guardando} onClick={accionPrincipal} variant="contained" fullWidth disableElevation
                sx={{ borderRadius: '14px', bgcolor: netoCts < 0 ? '#d97706' : '#10b981', py: 2, fontSize: 19, fontWeight: 700, color: '#fff', '&:hover': { bgcolor: netoCts < 0 ? '#b45309' : '#059669' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' }, ...MONEY }}>
                {labelAccion}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {abrirCobro && (
        <CobroDiferenciaModal total={netoCts} guardando={guardando} onClose={() => setAbrirCobro(false)} onConfirm={enviar} />
      )}

      {devolverAbierto && (
        <DevolverModal total={-netoCts} guardando={guardando} onClose={() => setDevolverAbierto(false)}
          onConfirm={() => enviar([{ metodo: 'efectivo', valorCentavos: netoCts }])} />
      )}

      {confirmarQuitar != null && (
        <ConfirmarQuitarDialog
          nombre={viejas[confirmarQuitar]?.nombreItem ?? 'este ítem'}
          onCancel={() => setConfirmarQuitar(null)}
          onOk={() => { setQuitados((prev) => new Set(prev).add(confirmarQuitar)); setConfirmarQuitar(null); }}
        />
      )}
    </Box>
  );
}

// ─── Confirmación de quitar una línea ya facturada ───────────────────────────

function ConfirmarQuitarDialog({ nombre, onCancel, onOk }: { nombre: string; onCancel: () => void; onOk: () => void }) {
  return (
    <Dialog open onClose={onCancel} fullWidth slotProps={{ paper: { sx: { maxWidth: 380, m: 2, borderRadius: '14px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>¿Estás seguro que lo quieres eliminar?</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
          Se quitará <b>{nombre}</b> de la factura. Al confirmar los cambios se devolverá lo pagado por ese ítem y se restaurará su inventario.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button fullWidth variant="outlined" onClick={onCancel} sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>Cancelar</Button>
          <Button fullWidth variant="contained" disableElevation onClick={onOk} startIcon={<Trash2 style={{ width: 15, height: 15 }} />}
            sx={{ textTransform: 'none', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>Sí, eliminar</Button>
        </Box>
      </Box>
    </Dialog>
  );
}

// ─── Confirmación de devolución (neto negativo) ──────────────────────────────

function DevolverModal({ total, guardando, onClose, onConfirm }: { total: number; guardando: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth slotProps={{ paper: { sx: { maxWidth: 360, m: 2, borderRadius: '14px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 700 }}>Devolver diferencia</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>
        <Box sx={{ mb: 2, borderRadius: '8px', bgcolor: '#fffbeb', p: 1.5, textAlign: 'center' }}>
          <Box sx={{ fontSize: 12, color: '#92400e' }}>A devolver en efectivo</Box>
          <Box sx={{ fontSize: 24, fontWeight: 700, color: '#b45309', ...MONEY }}>{fmt(total)}</Box>
        </Box>
        <Button disabled={guardando} onClick={onConfirm} variant="contained" fullWidth disableElevation
          sx={{ bgcolor: '#d97706', py: 1.5, fontWeight: 600, color: '#fff', '&:hover': { bgcolor: '#b45309' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' } }}>
          {guardando ? 'Procesando…' : 'Confirmar devolución'}
        </Button>
      </Box>
    </Dialog>
  );
}

function Centro({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center', fontSize: 14, color: color ?? '#6b7280' }}>{children}</Box>;
}

function CatChip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <ButtonBase onClick={onClick} sx={{ flexShrink: 0, borderRadius: '9999px', border: '1px solid', px: 2, py: 1, fontSize: 14, fontWeight: 500, borderColor: activo ? '#3658e1' : '#e5e7eb', bgcolor: activo ? '#eef2fe' : 'transparent', color: activo ? '#2a45c4' : '#4b5563' }}>{label}</ButtonBase>
  );
}

// ─── Modal: cobrar la diferencia ─────────────────────────────────────────────

const METODOS: Metodo[] = ['efectivo', 'tarjeta', 'transferencia'];

function CobroDiferenciaModal({ total, guardando, onClose, onConfirm }: {
  total: number; guardando: boolean; onClose: () => void;
  onConfirm: (pagos: { metodo: string; valorCentavos: number }[]) => void;
}) {
  const [split, setSplit] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [recibido, setRecibido] = useState('');
  const [filas, setFilas] = useState<{ metodo: Metodo; valor: string }[]>([
    { metodo: 'efectivo', valor: '' }, { metodo: 'tarjeta', valor: '' },
  ]);

  const recibidoCts = Math.round((Number(recibido) || 0) * 100);
  const cambio = metodo === 'efectivo' && !split ? recibidoCts - total : 0;
  const faltaEfectivo = metodo === 'efectivo' && !split && recibidoCts < total;

  const sumaSplit = filas.reduce((s, f) => s + Math.round((Number(f.valor) || 0) * 100), 0);
  const splitCuadra = split && sumaSplit === total && total > 0;
  const restante = total - sumaSplit;

  function confirmar() {
    if (split) {
      if (!splitCuadra) return;
      onConfirm(filas.map((f) => ({ metodo: f.metodo, valorCentavos: Math.round((Number(f.valor) || 0) * 100) })).filter((p) => p.valorCentavos > 0));
      return;
    }
    onConfirm([{ metodo, valorCentavos: total }]);
  }

  const puede = !guardando && (split ? splitCuadra : !faltaEfectivo);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 384, maxHeight: '92vh', m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Cobrar diferencia</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        <Box sx={{ mb: 1.5, borderRadius: '8px', bgcolor: '#f9fafb', p: 1.5, textAlign: 'center' }}>
          <Box sx={{ fontSize: 12, color: '#6b7280' }}>A cobrar</Box>
          <Box sx={{ fontSize: 24, fontWeight: 500, ...MONEY }}>{fmt(total)}</Box>
        </Box>

        <Box component="label" sx={{ mb: 1.5, display: 'flex', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px', border: '1px solid #e5e7eb', px: 1.5, py: 1, fontSize: 14 }}>
          <Box component="span" sx={{ color: '#374151' }}>Pago dividido</Box>
          <Checkbox checked={split} onChange={(e) => setSplit(e.target.checked)} size="small" sx={{ p: 0 }} />
        </Box>

        {!split ? (
          <>
            <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {METODOS.map((m) => (
                <ButtonBase key={m} onClick={() => setMetodo(m)}
                  sx={{ borderRadius: '8px', border: '1px solid', py: 1, fontSize: 12, textTransform: 'capitalize', borderColor: metodo === m ? '#3658e1' : '#e5e7eb', bgcolor: metodo === m ? '#eef2fe' : 'transparent', color: metodo === m ? '#2a45c4' : '#4b5563' }}>{m}</ButtonBase>
              ))}
            </Box>
            {metodo === 'efectivo' && (
              <>
                <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Efectivo recibido</Typography>
                <TextField type="number" value={recibido} autoFocus onChange={(e) => setRecibido(e.target.value)} fullWidth
                  slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> }, htmlInput: { min: 0, step: 0.01 } }}
                  sx={{ mb: 1, '& input': { fontSize: 18, py: 1.25 } }} />
                <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                  {montosRapidos(total).map((mc) => (
                    <ButtonBase key={mc} onClick={() => setRecibido((mc / 100).toFixed(2))}
                      sx={{ borderRadius: '8px', border: '1px solid', py: 0.875, fontSize: 12, ...MONEY, borderColor: recibidoCts === mc ? '#3658e1' : '#e5e7eb', bgcolor: recibidoCts === mc ? '#eef2fe' : 'transparent', color: recibidoCts === mc ? '#2a45c4' : '#4b5563' }}>{fmt(mc)}</ButtonBase>
                  ))}
                </Box>
                {recibidoCts > 0 && !faltaEfectivo && (
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', borderRadius: '8px', bgcolor: '#f0fdf4', p: 1.5, color: '#15803d' }}>
                    <Box component="span" sx={{ fontSize: 14 }}>Cambio</Box><Box component="span" sx={{ fontWeight: 500, ...MONEY }}>{fmt(cambio)}</Box>
                  </Box>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Box sx={{ mb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filas.map((f, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField select value={f.metodo} onChange={(e) => setFilas((prev) => prev.map((x, idx) => idx === i ? { ...x, metodo: e.target.value as Metodo } : x))}
                    sx={{ '& .MuiInputBase-root': { height: 40 }, '& .MuiSelect-select': { textTransform: 'capitalize' } }}>
                    {METODOS.map((m) => <MenuItem key={m} value={m} sx={{ textTransform: 'capitalize' }}>{m}</MenuItem>)}
                  </TextField>
                  <TextField type="number" value={f.valor} onChange={(e) => setFilas((prev) => prev.map((x, idx) => idx === i ? { ...x, valor: e.target.value } : x))} placeholder="0.00" sx={{ flex: 1 }}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af', '& .MuiTypography-root': { fontSize: 12 } }}>RD$</InputAdornment> }, htmlInput: { min: 0, step: 0.01 } }} />
                  {filas.length > 2 && (
                    <Box component="button" onClick={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))} sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', display: 'flex', color: '#d1d5db', '&:hover': { color: '#ef4444' } }}><X style={{ width: 16, height: 16 }} /></Box>
                  )}
                </Box>
              ))}
            </Box>
            <Box component="button" onClick={() => setFilas((prev) => [...prev, { metodo: 'transferencia', valor: '' }])}
              sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#3658e1' }}>
              <Plus style={{ width: 14, height: 14 }} /> Agregar método
            </Box>
            <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', borderRadius: '8px', px: 1.5, py: 1, fontSize: 14, bgcolor: splitCuadra ? '#f0fdf4' : '#fffbeb', color: splitCuadra ? '#15803d' : '#b45309' }}>
              <Box component="span">{splitCuadra ? 'Cuadra' : restante > 0 ? 'Falta' : 'Sobra'}</Box><Box component="span" sx={{ fontWeight: 500, ...MONEY }}>{fmt(Math.abs(restante))}</Box>
            </Box>
          </>
        )}

        <Button disabled={!puede} onClick={confirmar} variant="contained" fullWidth disableElevation
          sx={{ bgcolor: '#10b981', py: 1.5, fontWeight: 500, color: '#fff', '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' } }}>
          {guardando ? 'Procesando…' : split ? (splitCuadra ? 'Confirmar' : 'El pago no cuadra') : faltaEfectivo ? 'Efectivo insuficiente' : 'Confirmar'}
        </Button>
      </Box>
    </Dialog>
  );
}
