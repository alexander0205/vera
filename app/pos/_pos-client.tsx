'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, FileText, Star, Plus, Camera, X, Percent, PauseCircle, ListChecks, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { RncSearch } from '@/components/RncSearch';

// ─── Tipos (subset de las props del server) ──────────────────────────────────

interface TerminalProp {
  id:             number;
  nombre:         string;
  almacenId:      number;
  almacenNombre:  string | null;
  listaPreciosId: number | null;
  listaNombre:    string | null;
  tipoEcf:        string;
  mesas:          boolean;
}

interface MesaVista {
  id: number; nombre: string; zona: string | null;
  ocupada: boolean; comandaId: number | null;
  meseroNombre: string | null; totalCentavos: number; items: number;
}
interface MeseroVista { id: number; nombre: string; }
interface TurnoProp {
  id:                    number;
  terminalId:            number | null;
  montoAperturaCentavos: number;
}
interface ProductoPos {
  id:                   number;
  nombre:               string;
  referencia:           string | null;
  codigoBarras:         string | null;
  precio:               number;  // centavos efectivos para la terminal
  tasaItbis:            string;  // '0.18' | '0.16' | '0' | 'exento'
  tipo:                 string;  // 'bien' | 'servicio'
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  favorito:             boolean;
  stockAlmacen:         number | null;
  categoriaId:          number | null;
  categoriaNombre:      string | null;
  imagen:               string | null;
}
interface LineaCarrito extends ProductoPos { qty: number; precioOverride?: number; }

/** Precio efectivo de una línea: el editado manualmente o el de catálogo. */
function precioLinea(it: LineaCarrito): number {
  return it.precioOverride ?? it.precio;
}

interface ListaPrecio { id: number; nombre: string; }
interface ClienteView { id: number; razonSocial: string; rnc: string | null; email: string | null; }

const METODOS = ['efectivo', 'tarjeta', 'transferencia'] as const;
type Metodo = typeof METODOS[number];
type MetodoCobro = Metodo | 'cuenta-estudiante';

/** Venta aparcada (hold) — se persiste en localStorage por turno para no perder
 *  el carrito al atender otra venta o si se recarga la página. */
interface VentaAparcada {
  id:        string;   // marca de tiempo/etiqueta única
  etiqueta:  string;   // nombre visible (cliente o "Venta N")
  ts:        number;
  carrito:   LineaCarrito[];
  tipoEcf:   string;
  cliente:   ClienteView | null;
}

function claveAparcadas(turnoId: number): string {
  return `pos:aparcadas:${turnoId}`;
}
function leerAparcadas(turnoId: number): VentaAparcada[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(claveAparcadas(turnoId));
    return raw ? (JSON.parse(raw) as VentaAparcada[]) : [];
  } catch { return []; }
}
function guardarAparcadas(turnoId: number, lista: VentaAparcada[]) {
  try { window.localStorage.setItem(claveAparcadas(turnoId), JSON.stringify(lista)); } catch { /* cuota llena: ignora */ }
}

interface MonederoView {
  id:                    number;
  dependienteId:         number;
  nombre:                string;
  saldoCentavos:         number;
  limiteDiarioCentavos:  number | null;
  gastadoHoyCentavos:    number;
  disponibleHoyCentavos: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tasaFloat(t: string): number {
  if (!t || t === 'exento') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Color de fondo estable por nombre (tile de producto sin foto, estilo POS). */
function tileColor(nombre: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 55% 90%)`, fg: `hsl(${h} 45% 32%)` };
}

/** Inicial(es) para el tile: primeras letras de las dos primeras palabras. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? '';
  const b = partes[1]?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}
function fmt(centavos: number): string {
  return 'RD$ ' + (centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
interface DescuentoAplicado { pct: number; ids: Set<number>; }

/** Descuento (centavos) que aplica a una línea del carrito, 0 si no está seleccionada. */
function descuentoLinea(it: LineaCarrito, descuento: DescuentoAplicado | null): number {
  if (!descuento || !descuento.ids.has(it.id)) return 0;
  return Math.round(precioLinea(it) * it.qty * descuento.pct / 100);
}

/** base + ITBIS encima (espejo de calcularTotales del motor de facturas). Descuento
 *  global reduce la base imponible de las líneas seleccionadas antes del ITBIS. */
function totalesCarrito(items: LineaCarrito[], descuento: DescuentoAplicado | null = null) {
  let subtotal = 0, itbis = 0, descuentoTotal = 0;
  for (const it of items) {
    const baseSinDescuento = precioLinea(it) * it.qty;
    const desc = descuentoLinea(it, descuento);
    const base = baseSinDescuento - desc;
    descuentoTotal += desc;
    subtotal += base;
    itbis += Math.round(base * tasaFloat(it.tasaItbis));
  }
  return { subtotal, itbis, total: subtotal + itbis, descuentoTotal };
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PosClient({
  terminales, turnoInicial, terminalInicial, escolarHabilitado,
}: {
  terminales:        TerminalProp[];
  turnoInicial:      TurnoProp | null;
  terminalInicial:   TerminalProp | null;
  escolarHabilitado: boolean;
}) {
  if (!turnoInicial) {
    return <Apertura terminales={terminales} />;
  }
  return (
    <Venta
      turno={turnoInicial}
      terminal={terminalInicial}
      escolarHabilitado={escolarHabilitado}
    />
  );
}

// ─── Apertura de turno ───────────────────────────────────────────────────────

function Apertura({ terminales }: { terminales: TerminalProp[] }) {
  const router = useRouter();
  const [terminalId, setTerminalId] = useState<number | null>(terminales[0]?.id ?? null);
  const [monto, setMonto] = useState('');
  const [loading, setLoading] = useState(false);

  async function abrir() {
    if (!terminalId) { toast.error('Elige una terminal'); return; }
    setLoading(true);
    const res = await fetch('/api/pos/turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, montoApertura: Number(monto) || 0 }),
    });
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo abrir el turno');
      return;
    }
    router.refresh();
  }

  if (terminales.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-medium">No hay terminales configuradas</h1>
          <p className="mt-2 text-sm text-gray-500">
            Pide a un administrador que cree una terminal de punto de venta antes de vender.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <Link
        href="/dashboard"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al panel
      </Link>
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-medium">Abrir turno de caja</h1>
        <p className="mt-1 text-sm text-gray-500">Elige la terminal y el fondo inicial.</p>

        <label className="mt-5 block text-sm text-gray-600">Terminal</label>
        <div className="mt-2 space-y-2">
          {terminales.map((t) => (
            <button
              key={t.id}
              onClick={() => setTerminalId(t.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm ${
                terminalId === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <span className="font-medium">{t.nombre}</span>
              <span className="text-xs text-gray-500">{t.almacenNombre ?? 'Sin almacén'}</span>
            </button>
          ))}
        </div>

        <label className="mt-5 block text-sm text-gray-600">Fondo inicial (efectivo para cambio)</label>
        <div className="mt-2 flex items-center rounded-lg border border-gray-300 px-3">
          <span className="text-gray-400">RD$</span>
          <input
            type="number" min="0" step="0.01" value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent px-2 py-2.5 text-lg outline-none"
          />
        </div>

        <button
          onClick={abrir} disabled={loading}
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Abriendo…' : 'Abrir turno y empezar a vender'}
        </button>
      </div>
    </div>
  );
}

// ─── Pantalla de venta ───────────────────────────────────────────────────────

function Venta({
  turno, terminal, escolarHabilitado,
}: {
  turno: TurnoProp;
  terminal: TerminalProp | null;
  escolarHabilitado: boolean;
}) {
  const router = useRouter();
  const [productos, setProductos] = useState<ProductoPos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<number | 'todas'>('todas');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [estudiante, setEstudiante] = useState<MonederoView | null>(null);
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [listaPreciosId, setListaPreciosId] = useState<number | 'general'>('general');
  const [tipoEcf, setTipoEcf] = useState<string>(terminal?.tipoEcf ?? 'sin-ncf');
  const [cliente, setCliente] = useState<ClienteView | null>(null);
  const [nuevoProductoAbierto, setNuevoProductoAbierto] = useState(false);
  const [descuentoAplicado, setDescuentoAplicado] = useState<DescuentoAplicado | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [aparcadas, setAparcadas] = useState<VentaAparcada[]>([]);
  const [aparcadasAbierto, setAparcadasAbierto] = useState(false);

  // El botón "Nuevo producto" vive SIEMPRE en la misma fila que los chips de
  // categoría (a su misma altura, alineado a la derecha). Cuando el botón con
  // texto + todos los chips no caben en el ancho de la fila colapsa al ícono "+"
  // para que los chips quepan sin recortarse (se veía como colisión). Se decide
  // por medición real —no por breakpoints— porque el ancho disponible depende
  // del split de dos columnas (md) y de cuántas categorías haya, así que el
  // umbral no es monótono respecto al viewport.
  const filaCategoriasRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // 'pill' = botón con texto en línea; 'compacto' = botón "+" en línea con los
  // chips; 'abajo' = botón "+" en su propia fila debajo (cuando ni el "+" en
  // línea deja espacio a los chips sin recortarlos feo — móviles angostos).
  const [dispNuevo, setDispNuevo] = useState<'pill' | 'compacto' | 'abajo'>('pill');

  useEffect(() => {
    fetch('/api/listas-precios').then((r) => r.json()).then((d) => setListas(d.listasPrecios ?? []));
  }, []);

  const refrescarEstudiante = useCallback(async (dependienteId: number) => {
    const res = await fetch(`/api/pos/monedero?dependienteId=${dependienteId}`);
    if (res.ok) setEstudiante((await res.json()).monedero);
  }, []);

  // `silencioso` refresca en segundo plano sin mostrar el spinner "Cargando…"
  // (p.ej. tras una venta, para refrescar stock sin blanquear la grilla).
  const cargarCatalogo = useCallback(async (silencioso = false) => {
    if (!turno.terminalId) { setCargando(false); return; }
    if (!silencioso) setCargando(true);
    const params = new URLSearchParams({ terminalId: String(turno.terminalId) });
    if (listaPreciosId !== 'general') params.set('listaPreciosId', String(listaPreciosId));
    const res = await fetch(`/api/pos/catalogo?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProductos(data.productos ?? []);
    } else if (!silencioso) {
      toast.error('No se pudo cargar el catálogo');
    }
    if (!silencioso) setCargando(false);
  }, [turno.terminalId, listaPreciosId]);

  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  /** Categorías presentes en el catálogo de esta terminal, en orden de aparición. */
  const categorias = useMemo(() => {
    const vistas = new Map<number, string>();
    for (const p of productos) {
      if (p.categoriaId != null && !vistas.has(p.categoriaId)) vistas.set(p.categoriaId, p.categoriaNombre ?? '');
    }
    return [...vistas.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  useEffect(() => {
    const fila = filaCategoriasRef.current;
    if (!fila) return;
    const ANCHO_PILL = 160; // ancho aprox del botón con el texto "Nuevo producto"
    const ANCHO_COMPACTO = 40; // círculo "+" (h-10 w-10)
    const GAP = 8; // gap-2 entre el scroller de chips y el botón
    const TOL = 12; // recorte tolerable de chips antes de bajar el botón a otra fila
    const medir = () => {
      const anchoChips = chipsRef.current?.scrollWidth ?? 0;
      const disponible = fila.clientWidth;
      if (anchoChips + GAP + ANCHO_PILL <= disponible) setDispNuevo('pill');
      else if (anchoChips + GAP + ANCHO_COMPACTO <= disponible + TOL) setDispNuevo('compacto');
      else setDispNuevo('abajo');
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(fila);
    return () => ro.disconnect();
  }, [categorias]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (categoriaActiva !== 'todas' && p.categoriaId !== categoriaActiva) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) || (p.referencia ?? '').toLowerCase().includes(q);
    });
  }, [productos, busqueda, categoriaActiva]);

  const totales = useMemo(() => totalesCarrito(carrito, descuentoAplicado), [carrito, descuentoAplicado]);

  function qtyEnCarrito(id: number) {
    return carrito.find((c) => c.id === id)?.qty ?? 0;
  }

  function agregar(p: ProductoPos) {
    const yaEnCarrito = qtyEnCarrito(p.id);
    if (p.controlaInventario && !p.permiteVentaSinStock) {
      const disp = p.stockAlmacen ?? 0;
      if (yaEnCarrito + 1 > disp) {
        toast.error(`Sin stock suficiente de "${p.nombre}" (${disp} disp.)`);
        return;
      }
    }
    setCarrito((prev) => {
      const ex = prev.find((c) => c.id === p.id);
      if (ex) return prev.map((c) => (c.id === p.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { ...p, qty: 1 }];
    });
  }

  /** Escaneo (lector USB) o Enter: match exacto por código de barras o referencia. */
  function escanear() {
    const code = busqueda.trim();
    if (!code) return;
    const lc = code.toLowerCase();
    let p = productos.find((x) => x.codigoBarras && x.codigoBarras.toLowerCase() === lc)
         ?? productos.find((x) => x.referencia && x.referencia.toLowerCase() === lc);
    if (!p && filtrados.length === 1) p = filtrados[0];   // único resultado de la búsqueda
    if (p) { agregar(p); setBusqueda(''); }
    else toast.error(`Sin producto para "${code}"`);
  }

  async function toggleFavorito(p: ProductoPos) {
    const favorito = !p.favorito;
    setProductos((prev) => prev
      .map((x) => (x.id === p.id ? { ...x, favorito } : x))
      .sort((a, b) => (Number(b.favorito) - Number(a.favorito)) || a.nombre.localeCompare(b.nombre)));
    const res = await fetch('/api/pos/favorito', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: p.id, favorito }),
    });
    if (!res.ok) { toast.error('No se pudo cambiar favorito'); cargarCatalogo(); }
  }

  function cambiarQty(id: number, delta: number) {
    setCarrito((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  }

  /** Fija un precio manual (centavos) a la línea; null restaura el de catálogo. */
  function editarPrecio(id: number, centavos: number | null) {
    setCarrito((prev) =>
      prev.map((c) => (c.id === id
        ? { ...c, precioOverride: centavos == null ? undefined : Math.max(0, centavos) }
        : c)),
    );
  }

  // Carga las ventas aparcadas del turno al montar.
  useEffect(() => { setAparcadas(leerAparcadas(turno.id)); }, [turno.id]);

  /** Aparca el carrito actual (hold) y limpia la venta para atender otra. */
  function aparcar() {
    if (carrito.length === 0) return;
    const nueva: VentaAparcada = {
      id:       String(carrito[0].id) + '-' + carrito.length + '-' + (aparcadas.length + 1),
      etiqueta: cliente?.razonSocial ?? `Venta ${aparcadas.length + 1}`,
      ts:       Date.now(),
      carrito,
      tipoEcf,
      cliente,
    };
    const lista = [...aparcadas, nueva];
    setAparcadas(lista);
    guardarAparcadas(turno.id, lista);
    setCarrito([]);
    setDescuentoAplicado(null);
    setCliente(null);
    toast.success('Venta aparcada');
  }

  /** Retoma una venta aparcada al carrito activo (si el actual está vacío). */
  function retomar(a: VentaAparcada) {
    if (carrito.length > 0) { toast.error('Cobra o aparca la venta actual antes de retomar otra'); return; }
    setCarrito(a.carrito);
    setTipoEcf(a.tipoEcf);
    setCliente(a.cliente);
    descartarAparcada(a.id);
    setAparcadasAbierto(false);
  }

  function descartarAparcada(id: string) {
    const lista = aparcadas.filter((x) => x.id !== id);
    setAparcadas(lista);
    guardarAparcadas(turno.id, lista);
  }

  // Atajos de teclado (no interfieren cuando se escribe en un input/textarea/select).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'F2') { e.preventDefault(); setCobroDirecto(true); }
      else if (e.key === 'F3') { e.preventDefault(); aparcar(); }
      else if (e.key === 'F4') { e.preventDefault(); setAparcadasAbierto(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito, aparcadas, cliente, tipoEcf]);

  // F2 abre el cobro directamente desde el panel de carrito.
  const [cobroDirecto, setCobroDirecto] = useState(false);

  // ── Modo restaurante (capacidad `mesas` de la terminal) ────────────────────
  const modoMesas = !!terminal?.mesas;
  const [mesaActiva, setMesaActiva] = useState<MesaVista | null>(null);
  const [comandaId, setComandaId] = useState<number | null>(null);
  const [mesero, setMesero] = useState<MeseroVista | null>(null);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [mesaPendiente, setMesaPendiente] = useState<MesaVista | null>(null);
  const [refrescoMesas, setRefrescoMesas] = useState(0);

  /** Reconstruye el carrito desde las líneas persistidas de la comanda. */
  const hidratarComanda = useCallback((items: { productoId: number | null; nombre: string; precioCentavos: number; qty: number; tasaItbis: string; tipo: string }[]): LineaCarrito[] => {
    return items.map((it) => {
      const prod = productos.find((p) => p.id === it.productoId);
      if (prod) {
        return { ...prod, qty: it.qty, precioOverride: it.precioCentavos !== prod.precio ? it.precioCentavos : undefined };
      }
      // Línea mínima (producto fuera de catálogo o sin id, p.ej. propina).
      return {
        id: it.productoId ?? -Math.abs(it.precioCentavos + it.nombre.length),
        nombre: it.nombre, referencia: null, codigoBarras: null, precio: it.precioCentavos,
        tasaItbis: it.tasaItbis, tipo: it.tipo, controlaInventario: false, permiteVentaSinStock: true,
        favorito: false, stockAlmacen: null, categoriaId: null, categoriaNombre: null, imagen: null, qty: it.qty,
      };
    });
  }, [productos]);

  async function abrirMesa(m: MesaVista) {
    if (!mesero) { setMesaPendiente(m); setPinAbierto(true); return; }
    await entrarComanda(m);
  }

  async function entrarComanda(m: MesaVista, meseroOverride?: MeseroVista) {
    const mid = (meseroOverride ?? mesero)?.id ?? null;
    const res = await fetch('/api/pos/comandas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId: turno.terminalId, mesaId: m.id, meseroId: mid, turnoId: turno.id }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'No se pudo abrir la mesa'); return; }
    setComandaId(d.comanda.id);
    setCarrito(hidratarComanda(d.items ?? []));
    setDescuentoAplicado(null);
    setMesaActiva(m);
  }

  /** Persiste el carrito actual en la comanda (sin cobrar). */
  async function guardarComanda(silencioso = false): Promise<boolean> {
    if (comandaId == null) return true;
    const items = carrito.map((c) => ({
      productoId: c.id > 0 ? c.id : null,
      nombre: c.nombre, precioCentavos: precioLinea(c), qty: c.qty,
      tasaItbis: c.tasaItbis, tipo: c.tipo,
      descuentoPct: descuentoAplicado?.ids.has(c.id) ? descuentoAplicado.pct : 0,
    }));
    const res = await fetch(`/api/pos/comandas/${comandaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, meseroId: mesero?.id ?? null }),
    });
    if (!res.ok) { toast.error('No se pudo guardar la comanda'); return false; }
    if (!silencioso) toast.success('Comanda guardada');
    return true;
  }

  function volverAMesas() {
    setMesaActiva(null);
    setComandaId(null);
    setCarrito([]);
    setDescuentoAplicado(null);
    setRefrescoMesas((n) => n + 1);
  }

  async function guardarYVolver() {
    if (await guardarComanda(true)) { toast.success('Comanda guardada'); volverAMesas(); }
  }

  async function cobrar(
    pagos: { metodo: MetodoCobro; valorCentavos: number }[],
    recibidoCentavos: number,
    propinaCentavos = 0,
  ) {
    const esMonedero = pagos.length === 1 && pagos[0].metodo === 'cuenta-estudiante';
    const totalConPropina = totales.total + propinaCentavos;

    // Crédito fiscal (e31) exige RNC del comprador (DGII #38). El servidor lo
    // revalida, pero se corta aquí para no perder la venta con un error tardío.
    if (tipoEcf === '31' && !cliente?.rnc) {
      toast.error('El crédito fiscal (e31) requiere el RNC del comprador');
      return;
    }

    // Pre-chequeo del monedero (el servidor lo re-valida atómicamente).
    if (esMonedero) {
      if (!estudiante) { toast.error('Selecciona un estudiante'); return; }
      if (estudiante.saldoCentavos < totalConPropina) { toast.error('Saldo insuficiente en el monedero'); return; }
      if (estudiante.disponibleHoyCentavos != null && totalConPropina > estudiante.disponibleHoyCentavos) {
        toast.error('La venta excede el límite diario del estudiante'); return;
      }
    }

    setCobrando(true);
    let docId: number | null = null;
    const items = carrito.map((c) => {
      const descCentavos = descuentoLinea(c, descuentoAplicado);
      return {
        nombreItem:             c.nombre,
        cantidadItem:           c.qty,
        precioUnitarioItem:     precioLinea(c) / 100,   // base en pesos (precio editado o de catálogo)
        descuentoMonto:         descCentavos > 0 ? descCentavos / 100 : undefined,
        tasaItbis:              tasaFloat(c.tasaItbis) as 0 | 0.16 | 0.18,
        indicadorBienoServicio: (c.tipo === 'bien' ? 1 : 2) as 1 | 2,
        productoId:             c.id,
      };
    });

    // La propina va como línea de servicio exenta: entra en el NCF y el ticket,
    // y reconcilia en caja como parte del cobro (no distorsiona el ITBIS).
    if (propinaCentavos > 0) {
      items.push({
        nombreItem:             'Propina',
        cantidadItem:           1,
        precioUnitarioItem:     propinaCentavos / 100,
        descuentoMonto:         undefined,
        tasaItbis:              0,
        indicadorBienoServicio: 2,
        productoId:             undefined as unknown as number,
      });
    }

    // Persistir las líneas (detalle de venta + ticket). Forma compatible con ItemLinea[].
    const lineasBase = carrito.map((c, i) => ({
      id: i + 1, productoId: c.id, nombreItem: c.nombre, referencia: c.referencia ?? '',
      descripcionItem: '', cantidadItem: c.qty, precioUnitarioItem: precioLinea(c) / 100,
      descuentoPct: (descuentoAplicado?.ids.has(c.id) ? descuentoAplicado.pct : 0),
      tasaItbis: c.tasaItbis, indicadorBienoServicio: c.tipo === 'bien' ? '1' : '2',
    }));
    if (propinaCentavos > 0) {
      lineasBase.push({
        id: lineasBase.length + 1, productoId: 0, nombreItem: 'Propina', referencia: '',
        descripcionItem: '', cantidadItem: 1, precioUnitarioItem: propinaCentavos / 100,
        descuentoPct: 0, tasaItbis: 'exento', indicadorBienoServicio: '2',
      });
    }
    const lineasJson = JSON.stringify(lineasBase);

    const payload = {
      modo:                 'borrador',
      tipoEcf,
      razonSocialComprador: esMonedero ? estudiante!.nombre : (cliente?.razonSocial ?? 'Consumidor Final'),
      rncComprador:         esMonedero ? undefined : (cliente?.rnc ?? undefined),
      emailComprador:       esMonedero ? undefined : (cliente?.email ?? undefined),
      dependienteId:        esMonedero ? estudiante!.dependienteId : undefined,
      dependienteNombre:    esMonedero ? estudiante!.nombre : undefined,
      tipoPago:             1,
      items,
      lineasJson,
      pagoRecibido:         true,
      pagos:                pagos.map((p) => ({ metodo: p.metodo, valor: p.valorCentavos / 100 })),
      almacenId:            terminal?.almacenId ?? null,
    };

    // Cobro con monedero: saga atómica server-side (descuenta → emite → revierte
    // si falla). Una sola llamada; el saldo nunca queda descuadrado.
    if (esMonedero && estudiante) {
      const res = await fetch('/api/pos/venta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monederoId: estudiante.id, emitPayload: payload }),
      });
      setCobrando(false);
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(r.error ?? 'No se pudo completar la venta');
        await refrescarEstudiante(estudiante.dependienteId);  // refleja la reversa
        return;
      }
      toast.success(`Cobrado a ${estudiante.nombre}. Saldo: ${fmt(r.saldoCentavos)}`);
      await refrescarEstudiante(estudiante.dependienteId);
      if (r.documentoId) { docId = r.documentoId; }
    } else {
      const res = await fetch('/api/ecf/emitir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setCobrando(false);
      const venta = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(venta.error ?? 'No se pudo completar la venta');
        return;
      }
      const cambio = recibidoCentavos - totalConPropina;
      toast.success(cambio > 0 ? `Venta cobrada. Cambio: ${fmt(cambio)}` : 'Venta cobrada');
      if (venta.documentoId) { docId = venta.documentoId; }
    }

    // Modo restaurante: cierra la comanda contra el e-CF emitido y libera la mesa.
    if (comandaId != null && docId != null) {
      await fetch(`/api/pos/comandas/${comandaId}/cobrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecfDocumentId: docId }),
      }).catch(() => {});
      volverAMesas();
      cargarCatalogo(true);   // refresca stock sin parpadeo
      return;
    }

    setCarrito([]);
    setDescuentoAplicado(null);
    cargarCatalogo(true);   // refresca stock sin parpadeo
  }

  const [carritoMovilAbierto, setCarritoMovilAbierto] = useState(false);

  // Modo restaurante: sin mesa activa → pantalla de salón (grid de mesas).
  if (modoMesas && !mesaActiva) {
    return (
      <>
        <GridMesas
          terminalNombre={terminal?.nombre ?? 'Salón'}
          terminalId={turno.terminalId ?? 0}
          mesero={mesero}
          refresco={refrescoMesas}
          onAbrirMesa={abrirMesa}
          onCambiarMesero={() => setMesero(null)}
        />
        {pinAbierto && (
          <PinMeseroModal
            onClose={() => { setPinAbierto(false); setMesaPendiente(null); }}
            onOk={(m) => {
              setMesero(m); setPinAbierto(false);
              const mp = mesaPendiente; setMesaPendiente(null);
              if (mp) entrarComanda(mp, m);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {mesaActiva && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-sm sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={guardarYVolver} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">
              <ArrowLeft className="h-3.5 w-3.5" /> Mesas
            </button>
            <span className="truncate font-semibold text-amber-900">{mesaActiva.nombre}</span>
            {mesero && <span className="truncate text-xs text-amber-700">· {mesero.nombre}</span>}
          </div>
          <button onClick={() => guardarComanda(false)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            Guardar comanda
          </button>
        </div>
      )}
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2" title="Volver al panel">
            <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm sm:inline">Panel</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span className="truncate">{terminal?.nombre ?? 'Punto de venta'}</span>
            <span className="hidden text-gray-400 sm:inline">·</span>
            <span className="hidden truncate text-gray-500 sm:inline">{terminal?.almacenNombre ?? ''}</span>
          </div>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); escanear(); } }}
          placeholder="Buscar o escanear (nombre, referencia o código de barras)…"
          autoFocus
          className="order-last h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 sm:order-none sm:mx-3 sm:h-10 sm:max-w-xs md:max-w-sm"
        />
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 lg:inline">Turno abierto</span>
          <button
            onClick={aparcar}
            disabled={carrito.length === 0}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
            title="Aparcar venta (F3)"
          >
            <PauseCircle className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm md:inline">Aparcar</span>
          </button>
          <button
            onClick={() => setAparcadasAbierto(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
            title="Ventas aparcadas (F4)"
          >
            <ListChecks className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm md:inline">Aparcadas</span>
            {aparcadas.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-semibold text-white">{aparcadas.length}</span>
            )}
          </button>
          <button
            onClick={() => window.open(`/pos-reporte/${turno.id}`, '_blank', 'width=420,height=680')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
            title="Corte X del turno"
          >
            <FileText className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm md:inline">Reporte X</span>
          </button>
          <button
            onClick={() => setCierreAbierto(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
            title="Cerrar turno (corte Z)"
          >
            <LogOut className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm md:inline">Cerrar turno</span>
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[1.55fr_1fr]">
        {/* Grilla */}
        <div className="flex min-h-0 flex-col">
          <div
            ref={filaCategoriasRef}
            className={`mb-3 flex shrink-0 ${dispNuevo === 'abajo' ? 'flex-col gap-3' : 'items-center gap-2'}`}
          >
            {/* Chips scrolleables + botón "Nuevo producto". El wrapper interno
                (chipsRef) mide el ancho natural de los chips para decidir la
                disposición del botón: 'pill' con texto en línea, 'compacto' como
                ícono "+" en línea, o 'abajo' en su propia fila cuando ni el "+"
                cabría sin recortar los chips (móviles angostos). En 'abajo' hay
                gap-3 vertical para que no se confunda al tocar una categoría. */}
            <div className={`flex min-w-0 overflow-x-auto pb-1 ${dispNuevo === 'abajo' ? 'w-full' : 'flex-1'}`}>
              <div ref={chipsRef} className="flex gap-2">
                {categorias.length > 0 && (
                  <>
                    <button
                      onClick={() => setCategoriaActiva('todas')}
                      className={`shrink-0 rounded-full border px-5 py-2.5 text-base font-medium ${
                        categoriaActiva === 'todas' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Todas
                    </button>
                    {categorias.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategoriaActiva(c.id)}
                        className={`shrink-0 rounded-full border px-5 py-2.5 text-base font-medium ${
                          categoriaActiva === c.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => setNuevoProductoAbierto(true)}
              title="Nuevo producto"
              className={`flex shrink-0 items-center justify-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 ${
                dispNuevo === 'pill' ? 'rounded-lg px-4 py-2' : 'h-10 w-10 rounded-full'
              } ${dispNuevo === 'abajo' ? 'self-end' : ''}`}
            >
              <Plus className={dispNuevo === 'pill' ? 'h-4 w-4' : 'h-5 w-5'} />
              {dispNuevo === 'pill' && <span className="text-sm font-medium">Nuevo producto</span>}
            </button>
          </div>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando catálogo…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-gray-500">Sin productos para esta terminal.</p>
          ) : (
            <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-auto pb-24 sm:grid-cols-3 md:pb-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtrados.map((p) => {
                const agotado = p.controlaInventario && !p.permiteVentaSinStock && (p.stockAlmacen ?? 0) <= 0;
                const qty = qtyEnCarrito(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={agotado}
                    onClick={() => agregar(p)}
                    className={`relative flex flex-col overflow-hidden rounded-xl border bg-white text-left active:scale-[0.97] ${
                      qty > 0 ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-200'
                    } ${agotado ? 'opacity-50' : 'hover:border-blue-400'}`}
                  >
                    <div className="relative aspect-square w-full bg-gray-50">
                      {p.imagen ? (
                        <img src={p.imagen} alt={p.nombre} className="h-full w-full object-cover" />
                      ) : (
                        (() => {
                          const c = tileColor(p.nombre);
                          return (
                            <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                              <span className="text-4xl font-bold sm:text-5xl" style={{ color: c.fg }}>{iniciales(p.nombre)}</span>
                            </div>
                          );
                        })()
                      )}
                      {qty > 0 && (
                        <span className="absolute left-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-600 px-2 text-sm font-bold text-white shadow">
                          {qty}
                        </span>
                      )}
                      <span
                        role="button"
                        title={p.favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                        onClick={(e) => { e.stopPropagation(); toggleFavorito(p); }}
                        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-white/85"
                      >
                        <Star className={`h-6 w-6 ${p.favorito ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <div>
                        <div className="text-base font-semibold leading-tight sm:text-lg">{p.nombre}</div>
                        <div className="mt-1 text-sm text-gray-400">
                          {p.referencia ? p.referencia + ' · ' : ''}
                          {p.controlaInventario ? (agotado ? 'agotado' : `${p.stockAlmacen} disp.`) : ''}
                        </div>
                      </div>
                      <div className="mt-1.5 text-xl font-bold text-gray-900">{fmt(p.precio)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrito — panel fijo en escritorio, hoja deslizable en móvil */}
        <div className="hidden md:flex md:w-full">
          <CarritoPanel
            carrito={carrito}
            totales={totales}
            cambiarQty={cambiarQty}
            editarPrecio={editarPrecio}
            cobrando={cobrando}
            onCobrar={cobrar}
            escolar={escolarHabilitado}
            estudiante={estudiante}
            onSelectEstudiante={setEstudiante}
            listas={listas}
            listaPreciosId={listaPreciosId}
            onSelectLista={setListaPreciosId}
            tipoEcf={tipoEcf}
            onSelectTipoEcf={setTipoEcf}
            cliente={cliente}
            onSelectCliente={setCliente}
            descuentoAplicado={descuentoAplicado}
            onAplicarDescuento={setDescuentoAplicado}
            cobroDirecto={cobroDirecto}
            onCobroConsumido={() => setCobroDirecto(false)}
          />
        </div>
      </div>

      {/* Barra flotante móvil: total + abrir carrito */}
      <button
        onClick={() => setCarritoMovilAbierto(true)}
        disabled={carrito.length === 0}
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-xl bg-blue-600 px-4 py-3.5 text-white shadow-lg disabled:opacity-50 md:hidden"
      >
        <span className="text-sm font-medium">{carrito.length} {carrito.length === 1 ? 'artículo' : 'artículos'}</span>
        <span className="font-medium">Ver carrito · {fmt(totales.total)}</span>
      </button>

      {carritoMovilAbierto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/45 md:hidden" onClick={() => setCarritoMovilAbierto(false)}>
          <div className="mt-auto max-h-[85vh] rounded-t-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Tu carrito</span>
              <button onClick={() => setCarritoMovilAbierto(false)} className="p-2 text-gray-400">✕</button>
            </div>
            <CarritoPanel
              carrito={carrito}
              totales={totales}
              cambiarQty={cambiarQty}
              editarPrecio={editarPrecio}
              cobrando={cobrando}
              onCobrar={cobrar}
              escolar={escolarHabilitado}
              estudiante={estudiante}
              onSelectEstudiante={setEstudiante}
              listas={listas}
              listaPreciosId={listaPreciosId}
              onSelectLista={setListaPreciosId}
              tipoEcf={tipoEcf}
              onSelectTipoEcf={setTipoEcf}
              cliente={cliente}
              onSelectCliente={setCliente}
              descuentoAplicado={descuentoAplicado}
              onAplicarDescuento={setDescuentoAplicado}
            />
          </div>
        </div>
      )}

      {nuevoProductoAbierto && (
        <NuevoProductoModal
          onClose={() => setNuevoProductoAbierto(false)}
          onCreated={() => { setNuevoProductoAbierto(false); cargarCatalogo(); }}
        />
      )}

      {aparcadasAbierto && (
        <AparcadasModal
          aparcadas={aparcadas}
          onRetomar={retomar}
          onDescartar={descartarAparcada}
          onClose={() => setAparcadasAbierto(false)}
        />
      )}

      {cierreAbierto && (
        <CierreModal
          turnoId={turno.id}
          onClose={() => setCierreAbierto(false)}
          onCerrado={() => { setCierreAbierto(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Panel de carrito + cobro ────────────────────────────────────────────────

function CarritoPanel({
  carrito, totales, cambiarQty, editarPrecio, cobrando, onCobrar, escolar, estudiante, onSelectEstudiante,
  listas, listaPreciosId, onSelectLista, tipoEcf, onSelectTipoEcf, cliente, onSelectCliente,
  descuentoAplicado, onAplicarDescuento, cobroDirecto = false, onCobroConsumido,
}: {
  carrito: LineaCarrito[];
  totales: { subtotal: number; itbis: number; total: number; descuentoTotal: number };
  cambiarQty: (id: number, delta: number) => void;
  editarPrecio: (id: number, centavos: number | null) => void;
  cobrando: boolean;
  onCobrar: (pagos: { metodo: MetodoCobro; valorCentavos: number }[], recibidoCentavos: number, propinaCentavos: number) => void;
  escolar: boolean;
  estudiante: MonederoView | null;
  onSelectEstudiante: (e: MonederoView | null) => void;
  listas: ListaPrecio[];
  listaPreciosId: number | 'general';
  onSelectLista: (id: number | 'general') => void;
  tipoEcf: string;
  onSelectTipoEcf: (t: string) => void;
  cliente: ClienteView | null;
  onSelectCliente: (c: ClienteView | null) => void;
  descuentoAplicado: DescuentoAplicado | null;
  onAplicarDescuento: (d: DescuentoAplicado | null) => void;
  cobroDirecto?: boolean;
  onCobroConsumido?: () => void;
}) {
  const [abrirCobro, setAbrirCobro] = useState(false);
  const [panelDescuento, setPanelDescuento] = useState(false);

  // F2: abre el cobro desde el panel si hay ítems en el carrito.
  useEffect(() => {
    if (cobroDirecto) {
      if (carrito.length > 0) setAbrirCobro(true);
      onCobroConsumido?.();
    }
  }, [cobroDirecto, carrito.length, onCobroConsumido]);

  if (panelDescuento) {
    return (
      <DescuentosPanel
        carrito={carrito}
        aplicado={descuentoAplicado}
        onAplicar={(d) => { onAplicarDescuento(d); setPanelDescuento(false); }}
        onClose={() => setPanelDescuento(false)}
      />
    );
  }

  return (
    <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Lista de precio</label>
            <select
              value={listaPreciosId}
              onChange={(e) => onSelectLista(e.target.value === 'general' ? 'general' : Number(e.target.value))}
              className="h-11 w-full rounded-lg border border-gray-300 px-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="general">General (precio base)</option>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Numeración</label>
            <select
              value={tipoEcf}
              onChange={(e) => onSelectTipoEcf(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 px-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="sin-ncf">Ticket (sin NCF)</option>
              <option value="32">Consumo (e32)</option>
              <option value="31">Crédito fiscal (e31)</option>
            </select>
          </div>
        </div>
        <ClientePicker cliente={cliente} onSelect={onSelectCliente} />
        {tipoEcf === '31' && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <label className="mb-1 block text-xs font-medium text-amber-800">
              RNC del comprador · obligatorio para crédito fiscal
            </label>
            {cliente?.rnc ? (
              <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-amber-900">
                  {cliente.rnc} · {cliente.razonSocial}
                </span>
                <button onClick={() => onSelectCliente(null)} className="shrink-0 text-xs text-amber-700 underline">cambiar</button>
              </div>
            ) : (
              <RncSearch
                placeholder="Buscar RNC / cédula o razón social…"
                showSyncHint={false}
                onSelect={(r) => onSelectCliente({ id: 0, razonSocial: r.nombre || 'Sin nombre', rnc: r.rnc, email: null })}
              />
            )}
          </div>
        )}
      </div>
      {escolar && <EstudiantePicker estudiante={estudiante} onSelect={onSelectEstudiante} />}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Carrito ({carrito.length})</span>
        <button
          onClick={() => setPanelDescuento(true)}
          disabled={carrito.length === 0}
          title="Descuentos globales"
          className="flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <Percent className="h-3.5 w-3.5" /> Descuento
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {carrito.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Toca productos para agregarlos</p>
        ) : (
          carrito.map((c) => {
            const desc = descuentoLinea(c, descuentoAplicado);
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-3">
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-base font-medium">{c.nombre}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm text-gray-400">
                    <PrecioEditable linea={c} onEditar={(cents) => editarPrecio(c.id, cents)} />
                    {desc > 0 && <span className="text-emerald-600">−{descuentoAplicado!.pct}%</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => cambiarQty(c.id, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-2xl text-gray-600 active:bg-gray-50">−</button>
                  <span className="w-7 text-center text-lg font-semibold">{c.qty}</span>
                  <button onClick={() => cambiarQty(c.id, 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-2xl text-gray-600 active:bg-gray-50">+</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {descuentoAplicado && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
            <span>Descuento {descuentoAplicado.pct}% ({descuentoAplicado.ids.size} {descuentoAplicado.ids.size === 1 ? 'ítem' : 'ítems'})</span>
            <button onClick={() => onAplicarDescuento(null)} className="font-medium underline">quitar</button>
          </div>
        )}
        <div className="mb-1 flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(totales.subtotal + totales.descuentoTotal)}</span></div>
        {totales.descuentoTotal > 0 && (
          <div className="mb-1 flex justify-between text-sm text-emerald-600"><span>Descuento</span><span>−{fmt(totales.descuentoTotal)}</span></div>
        )}
        <div className="mb-2 flex justify-between text-sm text-gray-500"><span>ITBIS</span><span>{fmt(totales.itbis)}</span></div>
        <div className="mb-3 flex items-baseline justify-between"><span className="text-lg font-semibold">Total</span><span className="text-2xl font-bold">{fmt(totales.total)}</span></div>
        {tipoEcf === '31' && !cliente?.rnc && carrito.length > 0 && (
          <p className="mb-2 text-center text-sm font-medium text-amber-600">Carga el RNC del comprador para el crédito fiscal</p>
        )}
        <button
          disabled={carrito.length === 0 || (tipoEcf === '31' && !cliente?.rnc)}
          onClick={() => setAbrirCobro(true)}
          className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          Cobrar {fmt(totales.total)}
        </button>
      </div>

      {abrirCobro && (
        <CobroModal
          total={totales.total}
          cobrando={cobrando}
          estudiante={estudiante}
          onClose={() => setAbrirCobro(false)}
          onConfirm={(pagos, recibido, propina) => { onCobrar(pagos, recibido, propina); setAbrirCobro(false); }}
        />
      )}
    </div>
  );
}

// ─── Descuentos globales ─────────────────────────────────────────────────────

function DescuentosPanel({ carrito, aplicado, onAplicar, onClose }: {
  carrito: LineaCarrito[];
  aplicado: DescuentoAplicado | null;
  onAplicar: (d: DescuentoAplicado | null) => void;
  onClose: () => void;
}) {
  const [pct, setPct] = useState(aplicado ? String(aplicado.pct) : '');
  const [seleccion, setSeleccion] = useState<Set<number>>(aplicado?.ids ?? new Set(carrito.map((c) => c.id)));

  function toggle(id: number) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    setSeleccion((prev) => (prev.size === carrito.length ? new Set() : new Set(carrito.map((c) => c.id))));
  }

  const pctNum = Number(pct);
  const puedeAplicar = pctNum > 0 && pctNum <= 100 && seleccion.size > 0;

  return (
    <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-base font-medium">Descuentos globales</span>
        <button onClick={onClose} className="text-gray-400">✕</button>
      </div>
      <p className="mb-3 text-xs text-gray-500">Añade descuentos a los ítems de esta venta de forma rápida.</p>

      <label className="mb-1 block text-xs text-gray-500">Porcentaje</label>
      <div className="mb-3 flex items-center rounded-lg border border-gray-300 px-3">
        <input
          type="number" min="0" max="100" step="1" value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
        <span className="text-gray-400">%</span>
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 text-xs text-gray-500">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={seleccion.size === carrito.length && carrito.length > 0} onChange={toggleTodos} />
          Seleccionar todo
        </label>
        <span>{carrito.length} productos</span>
      </div>

      <div className="flex-1 overflow-auto">
        {carrito.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center justify-between border-b border-gray-50 py-2">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="text-sm">{c.nombre}</span>
            </span>
            <span className="text-right text-xs text-gray-500">
              <div>{fmt(c.precio * c.qty)}</div>
              <div className="text-emerald-600">
                {seleccion.has(c.id) && pctNum > 0 ? `−${fmt(Math.round(c.precio * c.qty * pctNum / 100))}` : '--'}
              </div>
            </span>
          </label>
        ))}
      </div>

      <button
        disabled={!puedeAplicar}
        onClick={() => onAplicar({ pct: pctNum, ids: seleccion })}
        className="mt-3 w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-40"
      >
        Aplicar descuento
      </button>
    </div>
  );
}

// ─── Selector de cliente (opcional; default Consumidor Final) ───────────────

function ClientePicker({ cliente, onSelect }: {
  cliente: ClienteView | null;
  onSelect: (c: ClienteView | null) => void;
}) {
  const [q, setQ] = useState('');
  const [todos, setTodos] = useState<ClienteView[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cargarClientes = useCallback(() => {
    fetch('/api/clientes').then((r) => r.json()).then((d) => setTodos(d.clientes ?? []));
  }, []);

  // Carga la lista completa una sola vez — el dropdown se abre con todos los
  // clientes disponibles (no hace falta escribir nada), y se filtra al tipear.
  useEffect(() => { cargarClientes(); }, [cargarClientes]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return todos;
    return todos.filter((c) =>
      c.razonSocial.toLowerCase().includes(qq) || (c.rnc ?? '').toLowerCase().includes(qq));
  }, [todos, q]);

  if (cliente) {
    return (
      <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium text-gray-800">{cliente.razonSocial}</span>
          <button onClick={() => onSelect(null)} className="shrink-0 text-xs text-blue-700">quitar</button>
        </div>
        {cliente.rnc && <div className="text-[11px] text-gray-400">RNC: {cliente.rnc}</div>}
      </div>
    );
  }

  return (
    <div className="relative mb-2" ref={wrapperRef}>
      <label className="mb-1 block text-xs font-medium text-gray-500">Cliente</label>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        placeholder="Consumidor Final (elige o busca)…"
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
      />
      {abierto && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow">
          <button onClick={() => { onSelect(null); setQ(''); setAbierto(false); }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50">
            Consumidor Final
          </button>
          {filtrados.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Sin clientes registrados</p>
          ) : (
            filtrados.map((r) => (
              <button key={r.id} onClick={() => { onSelect(r); setQ(''); setAbierto(false); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span className="truncate">{r.razonSocial}</span>
                <span className="text-xs text-gray-400">{r.rnc ?? ''}</span>
              </button>
            ))
          )}
          <button
            onClick={() => { setAbierto(false); setNuevoAbierto(true); }}
            className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo cliente
          </button>
        </div>
      )}
      {nuevoAbierto && (
        <NuevoClienteModal
          nombreInicial={q}
          onClose={() => setNuevoAbierto(false)}
          onCreated={(c) => { setNuevoAbierto(false); setQ(''); cargarClientes(); onSelect(c); }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({ nombreInicial, onClose, onCreated }: {
  nombreInicial: string;
  onClose: () => void;
  onCreated: (c: ClienteView) => void;
}) {
  const [razonSocial, setRazonSocial] = useState(nombreInicial);
  const [rnc, setRnc] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!razonSocial.trim()) { toast.error('El nombre es obligatorio'); return; }
    setGuardando(true);
    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razonSocial, rnc: rnc || null, telefono: telefono || null, email: email || null }),
    });
    setGuardando(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error ?? 'No se pudo crear el cliente'); return; }
    toast.success('Cliente creado');
    onCreated(data.cliente);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Nuevo cliente</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        <label className="mb-1 block text-xs text-gray-500">Nombre / Razón social</label>
        <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} autoFocus
          placeholder="Nombre del cliente"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />

        <label className="mb-1 block text-xs text-gray-500">RNC / Cédula (opcional)</label>
        <input value={rnc} onChange={(e) => setRnc(e.target.value)}
          placeholder="000-0000000-0"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Teléfono (opcional)</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Email (opcional)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
        </div>

        <button
          disabled={guardando}
          onClick={guardar}
          className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {guardando ? 'Creando…' : 'Crear y seleccionar'}
        </button>
      </div>
    </div>
  );
}

// ─── Selector de estudiante (capa escolar) ───────────────────────────────────

function EstudiantePicker({ estudiante, onSelect }: {
  estudiante: MonederoView | null;
  onSelect: (e: MonederoView | null) => void;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<{ dependienteId: number; nombre: string; saldoCentavos: number }[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) { setResultados([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pos/estudiantes?q=${encodeURIComponent(q)}`);
      if (res.ok && !cancel) setResultados((await res.json()).estudiantes ?? []);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  async function elegir(dependienteId: number) {
    const res = await fetch(`/api/pos/monedero?dependienteId=${dependienteId}`);
    if (res.ok) { onSelect((await res.json()).monedero); setQ(''); setResultados([]); }
    else toast.error('No se pudo cargar el monedero');
  }

  const [gestion, setGestion] = useState(false);

  if (estudiante) {
    const limiteTxt = estudiante.limiteDiarioCentavos == null
      ? 'sin límite'
      : `${fmt(estudiante.gastadoHoyCentavos)} / ${fmt(estudiante.limiteDiarioCentavos)} hoy`;
    return (
      <>
        <div className="mb-2 rounded-lg bg-blue-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">{estudiante.nombre}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setGestion(true)} className="text-xs text-blue-700 underline">saldo</button>
              <button onClick={() => onSelect(null)} className="text-xs text-blue-700">quitar</button>
            </div>
          </div>
          <div className="mt-0.5 flex justify-between text-[11px] text-blue-700">
            <span>Saldo: {fmt(estudiante.saldoCentavos)}</span>
            <span>{limiteTxt}</span>
          </div>
        </div>
        {gestion && (
          <MonederoModal estudiante={estudiante} onClose={() => setGestion(false)} onUpdated={onSelect} />
        )}
      </>
    );
  }

  return (
    <div className="relative mb-2">
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Estudiante (opcional)…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
      {resultados.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow">
          {resultados.map((r) => (
            <button key={r.dependienteId} onClick={() => elegir(r.dependienteId)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
              <span>{r.nombre}</span>
              <span className="text-xs text-gray-400">{fmt(r.saldoCentavos)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal de cobro ──────────────────────────────────────────────────────────

function CobroModal({
  total, cobrando, estudiante, onClose, onConfirm,
}: {
  total: number;
  cobrando: boolean;
  estudiante: MonederoView | null;
  onClose: () => void;
  onConfirm: (pagos: { metodo: MetodoCobro; valorCentavos: number }[], recibidoCentavos: number, propinaCentavos: number) => void;
}) {
  const [propina, setPropina] = useState('');
  const [split, setSplit] = useState(false);

  // Modo simple (un método) — o cuenta-estudiante.
  const [metodo, setMetodo] = useState<MetodoCobro>('efectivo');
  const [recibido, setRecibido] = useState('');

  // Modo dividido — filas {método, valor en pesos}.
  const [filas, setFilas] = useState<{ metodo: Metodo; valor: string }[]>([
    { metodo: 'efectivo', valor: '' },
    { metodo: 'tarjeta', valor: '' },
  ]);

  const propinaCentavos = Math.max(0, Math.round((Number(propina) || 0) * 100));
  const totalCobrar = total + propinaCentavos;

  const esMonedero = metodo === 'cuenta-estudiante' && !split;
  const recibidoCentavos = Math.round((Number(recibido) || 0) * 100);
  const cambio = metodo === 'efectivo' && !split ? recibidoCentavos - totalCobrar : 0;
  const faltaEfectivo = metodo === 'efectivo' && !split && recibidoCentavos < totalCobrar;

  // Suma del split (centavos) y si cuadra exacto con el total a cobrar.
  const sumaSplit = filas.reduce((s, f) => s + Math.round((Number(f.valor) || 0) * 100), 0);
  const splitCuadra = split && sumaSplit === totalCobrar && totalCobrar > 0;
  const restanteSplit = totalCobrar - sumaSplit;

  // Validación del monedero (solo modo simple).
  const saldoCorto   = esMonedero && !!estudiante && estudiante.saldoCentavos < totalCobrar;
  const excedeLimite = esMonedero && !!estudiante
    && estudiante.disponibleHoyCentavos != null && totalCobrar > estudiante.disponibleHoyCentavos;
  const monederoBloqueado = esMonedero && (saldoCorto || excedeLimite);

  function setFilaMetodo(i: number, m: Metodo) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, metodo: m } : f)));
  }
  function setFilaValor(i: number, v: string) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, valor: v } : f)));
  }
  function autollenarResto(i: number) {
    const otros = filas.reduce((s, f, idx) => (idx === i ? s : s + Math.round((Number(f.valor) || 0) * 100)), 0);
    const resto = Math.max(0, totalCobrar - otros);
    setFilaValor(i, (resto / 100).toFixed(2));
  }

  function confirmar() {
    if (split) {
      if (!splitCuadra) return;
      const pagos = filas
        .map((f) => ({ metodo: f.metodo as MetodoCobro, valorCentavos: Math.round((Number(f.valor) || 0) * 100) }))
        .filter((p) => p.valorCentavos > 0);
      onConfirm(pagos, totalCobrar, propinaCentavos);
      return;
    }
    if (esMonedero) {
      onConfirm([{ metodo: 'cuenta-estudiante', valorCentavos: totalCobrar }], totalCobrar, propinaCentavos);
      return;
    }
    const recibidoOut = metodo === 'efectivo' ? recibidoCentavos : totalCobrar;
    onConfirm([{ metodo, valorCentavos: totalCobrar }], recibidoOut, propinaCentavos);
  }

  const puedeConfirmar = !cobrando && (split ? splitCuadra : (!faltaEfectivo && !monederoBloqueado));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-sm overflow-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Cobrar venta</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        <div className="mb-3 rounded-lg bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Total a cobrar</div>
          <div className="text-2xl font-medium">{fmt(totalCobrar)}</div>
          {propinaCentavos > 0 && (
            <div className="mt-0.5 text-[11px] text-gray-400">Incluye propina {fmt(propinaCentavos)}</div>
          )}
        </div>

        {/* Propina */}
        <label className="mb-1 block text-xs text-gray-500">Propina (opcional)</label>
        <div className="mb-3 flex items-center rounded-lg border border-gray-300 px-3">
          <span className="text-gray-400">RD$</span>
          <input
            type="number" min="0" step="0.01" value={propina}
            onChange={(e) => setPropina(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent px-2 py-2 text-sm outline-none"
          />
        </div>

        {/* Toggle pago dividido */}
        <label className="mb-3 flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="text-gray-700">Pago dividido</span>
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        </label>

        {!split ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetodo(m)}
                  className={`rounded-lg border py-2 text-xs capitalize ${
                    metodo === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {estudiante && (
              <button
                onClick={() => setMetodo('cuenta-estudiante')}
                className={`mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  metodo === 'cuenta-estudiante' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                }`}
              >
                <span>Cuenta de {estudiante.nombre}</span>
                <span className="text-xs">saldo {fmt(estudiante.saldoCentavos)}</span>
              </button>
            )}

            {monederoBloqueado && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {saldoCorto ? 'Saldo insuficiente en el monedero.' : 'Excede el límite diario del estudiante.'}
              </div>
            )}

            {metodo === 'efectivo' && (
              <>
                <label className="mb-1 block text-xs text-gray-500">Efectivo recibido</label>
                <div className="mb-3 flex items-center rounded-lg border border-gray-300 px-3">
                  <span className="text-gray-400">RD$</span>
                  <input
                    type="number" min="0" step="0.01" value={recibido} autoFocus
                    onChange={(e) => setRecibido(e.target.value)}
                    className="w-full bg-transparent px-2 py-2.5 text-lg outline-none"
                  />
                </div>
                {recibidoCentavos > 0 && !faltaEfectivo && (
                  <div className="mb-3 flex justify-between rounded-lg bg-green-50 p-3 text-green-700">
                    <span className="text-sm">Cambio</span>
                    <span className="font-medium">{fmt(cambio)}</span>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 space-y-2">
              {filas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={f.metodo}
                    onChange={(e) => setFilaMetodo(i, e.target.value as Metodo)}
                    className="h-10 rounded-lg border border-gray-300 px-2 text-sm capitalize outline-none focus:border-blue-500"
                  >
                    {METODOS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                  </select>
                  <div className="flex flex-1 items-center rounded-lg border border-gray-300 px-2">
                    <span className="text-xs text-gray-400">RD$</span>
                    <input
                      type="number" min="0" step="0.01" value={f.valor}
                      onChange={(e) => setFilaValor(i, e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent px-1.5 py-2 text-sm outline-none"
                    />
                  </div>
                  <button onClick={() => autollenarResto(i)} title="Completar el resto"
                    className="rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-500 hover:bg-gray-50">resto</button>
                  {filas.length > 2 && (
                    <button onClick={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setFilas((prev) => [...prev, { metodo: 'transferencia', valor: '' }])}
              className="mb-2 flex items-center gap-1 text-xs font-medium text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar método
            </button>
            <div className={`mb-3 flex justify-between rounded-lg px-3 py-2 text-sm ${
              splitCuadra ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <span>{splitCuadra ? 'Cuadra' : (restanteSplit > 0 ? 'Falta' : 'Sobra')}</span>
              <span className="font-medium">{fmt(Math.abs(restanteSplit))}</span>
            </div>
          </>
        )}

        <button
          disabled={!puedeConfirmar}
          onClick={confirmar}
          className="w-full rounded-lg bg-green-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {cobrando ? 'Procesando…'
            : split ? (splitCuadra ? 'Confirmar venta' : 'El pago no cuadra')
            : faltaEfectivo ? 'Efectivo insuficiente'
            : monederoBloqueado ? (saldoCorto ? 'Saldo insuficiente' : 'Excede límite diario')
            : 'Confirmar venta'}
        </button>
      </div>
    </div>
  );
}

// ─── Precio editable en línea del carrito ────────────────────────────────────

function PrecioEditable({ linea, onEditar }: {
  linea: LineaCarrito;
  onEditar: (centavos: number | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const editado = linea.precioOverride != null;

  function abrir() {
    setValor((precioLinea(linea) / 100).toFixed(2));
    setEditando(true);
  }
  function guardar() {
    const n = Number(valor);
    onEditar(Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null);
    setEditando(false);
  }

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-gray-400">RD$</span>
        <input
          type="number" min="0" step="0.01" value={valor} autoFocus
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false); }}
          onBlur={guardar}
          className="w-16 rounded border border-blue-300 px-1 py-0.5 text-xs outline-none"
        />
      </span>
    );
  }

  return (
    <button onClick={abrir} title="Editar precio" className={`underline decoration-dotted underline-offset-2 ${editado ? 'text-blue-600' : 'text-gray-400'}`}>
      {fmt(precioLinea(linea))} c/u{editado ? '*' : ''}
    </button>
  );
}

// ─── Ventas aparcadas (hold) ─────────────────────────────────────────────────

function AparcadasModal({ aparcadas, onRetomar, onDescartar, onClose }: {
  aparcadas: VentaAparcada[];
  onRetomar: (a: VentaAparcada) => void;
  onDescartar: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Ventas aparcadas ({aparcadas.length})</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        {aparcadas.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No hay ventas aparcadas.</p>
        ) : (
          <div className="space-y-2">
            {aparcadas.map((a) => {
              const t = totalesCarrito(a.carrito);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.etiqueta}</div>
                    <div className="text-xs text-gray-400">
                      {a.carrito.length} {a.carrito.length === 1 ? 'ítem' : 'ítems'} · {fmt(t.total)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => onRetomar(a)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">Retomar</button>
                    <button onClick={() => onDescartar(a.id)} className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cierre de turno (corte Z) dentro del POS ────────────────────────────────

function CierreModal({ turnoId, onClose, onCerrado }: {
  turnoId: number;
  onClose: () => void;
  onCerrado: () => void;
}) {
  const [estado, setEstado] = useState<{
    esperado: number; contado: string; obs: string;
  }>({ esperado: 0, contado: '', obs: '' });
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch('/api/caja/turnos').then((r) => r.json()).then((d) => {
      setEstado((s) => ({ ...s, esperado: d.desglose?.esperado ?? 0 }));
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  const contadoCentavos = Math.round((Number(estado.contado) || 0) * 100);
  const diferencia = contadoCentavos - estado.esperado;
  const hayDiff = estado.contado !== '' && diferencia !== 0;

  async function enviar() {
    if (hayDiff && !estado.obs.trim()) { toast.error('Hay diferencia: justifica el cierre'); return; }
    setEnviando(true);
    const res = await fetch(`/api/caja/turnos/${turnoId}/cierre`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efectivoContado: Number(estado.contado) || 0, observaciones: estado.obs || undefined }),
    });
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'No se pudo cerrar'); return; }
    toast.success('Cierre enviado — pendiente de aprobación del administrador');
    onCerrado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Cerrar turno (corte Z)</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        {cargando ? (
          <p className="py-6 text-center text-sm text-gray-400">Calculando esperado…</p>
        ) : (
          <>
            <div className="mb-3 rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-xs text-gray-500">Efectivo esperado en caja</div>
              <div className="text-2xl font-medium">{fmt(estado.esperado)}</div>
            </div>

            <label className="mb-1 block text-xs text-gray-500">Efectivo contado (RD$)</label>
            <div className="mb-3 flex items-center rounded-lg border border-gray-300 px-3">
              <span className="text-gray-400">RD$</span>
              <input
                type="number" min="0" step="0.01" value={estado.contado} autoFocus
                onChange={(e) => setEstado((s) => ({ ...s, contado: e.target.value }))}
                className="w-full bg-transparent px-2 py-2.5 text-lg outline-none"
              />
            </div>

            {estado.contado !== '' && (
              <div className={`mb-3 flex justify-between rounded-lg px-3 py-2 text-sm ${
                hayDiff ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                <span>{hayDiff ? `Diferencia ${diferencia > 0 ? '+' : ''}${fmt(diferencia)}` : 'Cuadrada'}</span>
              </div>
            )}

            <label className="mb-1 block text-xs text-gray-500">Observaciones {hayDiff && <span className="text-red-500">*</span>}</label>
            <textarea
              value={estado.obs}
              onChange={(e) => setEstado((s) => ({ ...s, obs: e.target.value }))}
              rows={2} maxLength={500}
              placeholder={hayDiff ? 'Explica el descuadre…' : 'Opcional'}
              className="mb-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <button
              disabled={enviando || estado.contado === ''}
              onClick={enviar}
              className="w-full rounded-lg bg-green-600 py-3 font-medium text-white disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Firmar y enviar cierre'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Gestión de saldo del estudiante (recarga + límite) ──────────────────────

function MonederoModal({ estudiante, onClose, onUpdated }: {
  estudiante: MonederoView;
  onClose: () => void;
  onUpdated: (e: MonederoView) => void;
}) {
  const [monto, setMonto] = useState('');
  const [limite, setLimite] = useState(estudiante.limiteDiarioCentavos != null ? String(estudiante.limiteDiarioCentavos / 100) : '');
  const [busy, setBusy] = useState(false);

  async function recargar() {
    const m = Number(monto);
    if (!m || m <= 0) { toast.error('Monto inválido'); return; }
    setBusy(true);
    const res = await fetch('/api/pos/monedero/recarga', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependienteId: estudiante.dependienteId, monto: m }),
    });
    setBusy(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Error al recargar'); return; }
    const { monedero } = await res.json();
    toast.success(`Recargado. Saldo: ${fmt(monedero.saldoCentavos)}`);
    onUpdated(monedero); setMonto('');
  }

  async function guardarLimite() {
    setBusy(true);
    const res = await fetch('/api/pos/monedero', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependienteId: estudiante.dependienteId, limiteDiario: limite.trim() === '' ? null : Number(limite) }),
    });
    setBusy(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Sin permiso o error'); return; }
    const { monedero } = await res.json();
    toast.success('Límite actualizado');
    onUpdated(monedero);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Saldo de {estudiante.nombre}</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Saldo actual</div>
          <div className="text-2xl font-medium">{fmt(estudiante.saldoCentavos)}</div>
        </div>

        <label className="mb-1 block text-xs text-gray-500">Recargar (RD$)</label>
        <div className="mb-2 flex gap-2">
          <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="0.00" />
          <button onClick={recargar} disabled={busy} className="rounded-lg bg-green-600 px-4 text-sm font-medium text-white disabled:opacity-60">Recargar</button>
        </div>

        <label className="mb-1 mt-4 block text-xs text-gray-500">Límite diario (RD$, vacío = sin límite)</label>
        <div className="flex gap-2">
          <input type="number" min="0" step="0.01" value={limite} onChange={(e) => setLimite(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="sin límite" />
          <button onClick={guardarLimite} disabled={busy} className="rounded-lg border border-gray-300 px-4 text-sm">Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modo restaurante: grid de mesas (salón) ─────────────────────────────────

function GridMesas({ terminalNombre, terminalId, mesero, refresco, onAbrirMesa, onCambiarMesero }: {
  terminalNombre: string;
  terminalId: number;
  mesero: MeseroVista | null;
  refresco: number;
  onAbrirMesa: (m: MesaVista) => void;
  onCambiarMesero: () => void;
}) {
  const [mesas, setMesas] = useState<MesaVista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevaAbierto, setNuevaAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/pos/mesas?terminalId=${terminalId}`);
    if (res.ok) setMesas((await res.json()).mesas ?? []);
    setCargando(false);
  }, [terminalId]);

  useEffect(() => { cargar(); }, [cargar, refresco]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2" title="Volver al panel">
            <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="hidden text-sm sm:inline">Panel</span>
          </Link>
          <span className="truncate text-sm font-medium">{terminalNombre}</span>
          <span className="hidden text-gray-400 sm:inline">· Salón</span>
        </div>
        <div className="flex items-center gap-2">
          {mesero ? (
            <button onClick={onCambiarMesero} className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
              <UserRound className="h-3.5 w-3.5" /> {mesero.nombre} · cambiar
            </button>
          ) : (
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-500">Elige mesa → PIN</span>
          )}
          <button onClick={() => setNuevaAbierto(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Mesa
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {cargando ? (
          <p className="text-sm text-gray-500">Cargando salón…</p>
        ) : mesas.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <p className="text-sm text-gray-500">No hay mesas configuradas en esta terminal.</p>
            <button onClick={() => setNuevaAbierto(true)} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Crear primera mesa</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {mesas.map((m) => (
              <button
                key={m.id}
                onClick={() => onAbrirMesa(m)}
                className={`flex aspect-[4/3] flex-col justify-between rounded-xl border p-3 text-left ${
                  m.ocupada ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-blue-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">{m.nombre}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${m.ocupada ? 'bg-amber-500' : 'bg-emerald-400'}`} />
                </div>
                {m.ocupada ? (
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-amber-800">{fmt(m.totalCentavos)}</div>
                    <div className="truncate text-[11px] text-amber-600">
                      {m.items} {m.items === 1 ? 'ítem' : 'ítems'}{m.meseroNombre ? ` · ${m.meseroNombre}` : ''}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">{m.zona ?? 'Libre'}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {nuevaAbierto && (
        <NuevaMesaModal terminalId={terminalId} onClose={() => setNuevaAbierto(false)} onCreated={() => { setNuevaAbierto(false); cargar(); }} />
      )}
    </div>
  );
}

function PinMeseroModal({ onClose, onOk }: { onClose: () => void; onOk: (m: MeseroVista) => void }) {
  const [pin, setPin] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [gestion, setGestion] = useState(false);

  async function verificar(p: string) {
    if (p.length < 4) return;
    setVerificando(true);
    const res = await fetch('/api/pos/meseros?verificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: p }),
    });
    setVerificando(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'PIN no reconocido'); setPin(''); return; }
    onOk(d.mesero);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Identifícate</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <p className="mb-3 text-xs text-gray-500">Ingresa tu PIN de mesero.</p>
        <input
          type="password" inputMode="numeric" autoFocus value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') verificar(pin); }}
          placeholder="••••"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-blue-500"
        />
        <button
          disabled={verificando || pin.length < 4}
          onClick={() => verificar(pin)}
          className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {verificando ? 'Verificando…' : 'Entrar'}
        </button>
        <button onClick={() => setGestion(true)} className="mt-3 w-full text-center text-xs text-blue-600">
          Registrar nuevo mesero
        </button>
        {gestion && <NuevoMeseroModal onClose={() => setGestion(false)} onCreated={() => setGestion(false)} />}
      </div>
    </div>
  );
}

function NuevoMeseroModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error('PIN de 4 a 6 dígitos'); return; }
    setBusy(true);
    const res = await fetch('/api/pos/meseros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, pin }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'No se pudo crear'); return; }
    toast.success('Mesero registrado');
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Nuevo mesero</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <label className="mb-1 block text-xs text-gray-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <label className="mb-1 block text-xs text-gray-500">PIN (4–6 dígitos)</label>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <button disabled={busy} onClick={guardar} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Creando…' : 'Registrar'}
        </button>
      </div>
    </div>
  );
}

function NuevaMesaModal({ terminalId, onClose, onCreated }: { terminalId: number; onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('');
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!nombre.trim()) { toast.error('Nombre requerido'); return; }
    setBusy(true);
    const res = await fetch('/api/pos/mesas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, nombre, zona: zona || null }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'No se pudo crear la mesa'); return; }
    toast.success('Mesa creada');
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Nueva mesa</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <label className="mb-1 block text-xs text-gray-500">Nombre / número</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Mesa 1"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <label className="mb-1 block text-xs text-gray-500">Zona (opcional)</label>
        <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Terraza"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <button disabled={busy} onClick={guardar} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Creando…' : 'Crear mesa'}
        </button>
      </div>
    </div>
  );
}

// ─── Crear producto rápido desde el POS ──────────────────────────────────────

const IMG_MAX_BYTES = 800_000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function NuevoProductoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [tasaItbis, setTasaItbis] = useState('0.18');
  const [imagen, setImagen] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function handleImagen(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { toast.error('Imagen demasiado grande (máx 800 KB)'); return; }
    setImagen(await fileToBase64(file));
  }

  async function guardar() {
    const p = Number(precio);
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!precio || isNaN(p) || p < 0) { toast.error('Precio inválido'); return; }
    setGuardando(true);
    const res = await fetch('/api/productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, precio: p, tasaItbis, tipo: 'bien', imagen: imagen || null }),
    });
    setGuardando(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo crear el producto');
      return;
    }
    toast.success('Producto creado');
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Nuevo producto</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        <label className="relative mx-auto mb-3 flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImagen(f); }} />
          {imagen ? <img src={imagen} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
        </label>

        <label className="mb-1 block text-xs text-gray-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
          placeholder="Ej. Café con leche"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Precio (DOP)</label>
            <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">ITBIS</label>
            <select value={tasaItbis} onChange={(e) => setTasaItbis(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
              <option value="0.18">18%</option>
              <option value="0.16">16%</option>
              <option value="0">0%</option>
              <option value="exento">Exento</option>
            </select>
          </div>
        </div>

        <button
          disabled={guardando}
          onClick={guardar}
          className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {guardando ? 'Creando…' : 'Crear y agregar al catálogo'}
        </button>
      </div>
    </div>
  );
}
