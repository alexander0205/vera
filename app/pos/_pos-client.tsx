'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDgiiReadiness } from '@/lib/hooks/useDgiiReadiness';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ConfirmarMetodoPagoDialog, type ResumenMetodo } from '@/components/pagos/ConfirmarMetodoPagoDialog';
import { labelMetodo } from '@/lib/pagos/metodos';
import { ProductoDialog } from '@/components/shared/producto-dialog';
import { ClienteDialog } from '@/components/shared/cliente-dialog';
import { montosRapidos } from '@/lib/pos/montos';
import Link from 'next/link';
import { ArrowLeft, LogOut, FileText, Star, Plus, X, Percent, PauseCircle, ListChecks, UserRound, Zap, Banknote, CreditCard, ArrowLeftRight, MoreHorizontal, LayoutGrid, Rows3, ChevronUp, ChevronDown, Pencil, Volume2, VolumeX, Vibrate, Trash2, Check, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import Chip from '@mui/material/Chip';
import { RncSearch } from '@/components/RncSearch';
import { ModalSeleccionarVariante } from '@/app/(dashboard)/dashboard/facturas/nueva/modals/ModalSeleccionarVariante';
import type { VariantePick } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/types';
import { estaAgotado } from '@/lib/pos/agotado';
import { useFeedbackPos } from '@/lib/hooks/useFeedbackPos';
import type { PrefsFeedback } from '@/lib/pos/feedback';

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
  variantAtributos?:    { nombre: string; valores: string[] }[];
}
interface LineaCarrito extends ProductoPos {
  qty: number;
  precioOverride?: number;
  /** Variante vendida (talla/color…). Presente solo en productos con variantes. */
  variantId?: number;
  variantNombre?: string;
}

/** Precio efectivo de una línea: el editado manualmente o el de catálogo. */
function precioLinea(it: LineaCarrito): number {
  return it.precioOverride ?? it.precio;
}

/** Clave estable de una línea del carrito. Con variante, dos líneas del mismo
 *  producto (tallas distintas) son líneas separadas, así que la clave combina
 *  producto + variante. Sin variante es solo el id del producto. */
function lineKey(c: { id: number; variantId?: number }): string {
  return c.variantId ? `${c.id}:${c.variantId}` : String(c.id);
}

interface ListaPrecio { id: number; nombre: string; }
interface ClienteView { id: number; razonSocial: string; rnc: string | null; email: string | null; dependientes?: string[]; }

const METODOS = ['efectivo', 'tarjeta', 'transferencia'] as const;
type Metodo = typeof METODOS[number];
// Iconos grandes para los botones de método de cobro (táctil).
const METODO_ICONO: Record<Metodo, LucideIcon> = {
  efectivo: Banknote, tarjeta: CreditCard, transferencia: ArrowLeftRight,
};
// 'credito' = fiado: la venta se registra SIN pago y queda con saldo
// pendiente, así aparece sola en cuentas por cobrar (facturación y POS
// leen la misma cartera). No confundir con 'cuenta-estudiante', que es el
// monedero prepago y sí descuenta saldo en el momento.
type MetodoCobro = Metodo | 'cuenta-estudiante' | 'credito';

// Tipo de orden POS (dato operativo, no fiscal — no entra al XML DGII). Sirve
// para clasificar/filtrar el historial de recibos. 'comer-aqui' solo aplica a
// órdenes con mesa (comanda); las ventas rápidas sin mesa usan 'mostrador'.
type TipoOrden = 'comer-aqui' | 'para-llevar' | 'delivery' | 'mostrador';
const TIPO_ORDEN_LABEL: Record<TipoOrden, string> = {
  'comer-aqui':  'Comer aquí',
  'para-llevar': 'Para llevar',
  'delivery':    'Delivery',
  'mostrador':   'Mostrador',
};
/** Opciones ofrecidas según el contexto: con mesa se puede comer aquí; sin mesa no. */
const tiposOrdenPara = (enMesa: boolean): TipoOrden[] =>
  enMesa ? ['comer-aqui', 'para-llevar', 'delivery'] : ['mostrador', 'para-llevar', 'delivery'];

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
// `ids` son claves de línea (lineKey), no ids de producto — así el descuento se
// aplica a la línea exacta aunque haya varias variantes del mismo producto.
interface DescuentoAplicado { pct: number; ids: Set<string>; }

/** Descuento (centavos) que aplica a una línea del carrito, 0 si no está seleccionada. */
function descuentoLinea(it: LineaCarrito, descuento: DescuentoAplicado | null): number {
  if (!descuento || !descuento.ids.has(lineKey(it))) return 0;
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

// ─── Estilos compartidos (presentación) ──────────────────────────────────────

const MONEY = { fontVariantNumeric: 'tabular-nums' } as const;

/** Botón de acción del header/nav: ícono solo en móvil, ícono + texto en ≥sm.
 *  Dimensionado touch/tablet: altura mínima 48px para dedo. */
const iconActionSx = {
  flexShrink: 0,
  minWidth: 0,
  color: '#4b5563',
  borderColor: '#e5e7eb',
  bgcolor: '#fff',
  fontWeight: 600,
  fontSize: 15,
  borderRadius: '10px',
  width: { xs: 48, sm: 'auto' },
  height: { xs: 48, sm: 48 },
  px: { xs: 0, sm: 2 },
  py: { xs: 0, sm: 1 },
  gap: 0.75,
  '&:hover': { bgcolor: '#f9fafb', borderColor: '#e5e7eb' },
} as const;

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * `fetch` + JSON que no revienta cuando no hay JSON.
 *
 * `r.json()` sobre un cuerpo vacío tira «Unexpected end of JSON input», y eso
 * pasa de verdad: al navegar —cambiar de módulo o de empresa— el navegador
 * aborta las peticiones en vuelo, la promesa resuelve igual y el cuerpo llega
 * vacío. El POS carga varias cosas al montar, así que es fácil pillarlo a
 * medias. También cubre el 401/403 con cuerpo vacío.
 *
 * Devuelve `null` en vez de lanzar: quien llama decide con qué se queda.
 */
async function traerJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const texto = await r.text();
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
}

export default function PosClient({
  terminales, turnoInicial, terminalInicial, escolarHabilitado, alertaMetodoPago,
}: {
  terminales:        TerminalProp[];
  turnoInicial:      TurnoProp | null;
  terminalInicial:   TerminalProp | null;
  escolarHabilitado: boolean;
  /** Doble confirmación del método de pago antes de cobrar (ajuste de empresa). */
  alertaMetodoPago:  boolean;
}) {
  if (!turnoInicial) {
    return <Apertura terminales={terminales} />;
  }
  return (
    <Venta
      turno={turnoInicial}
      terminal={terminalInicial}
      escolarHabilitado={escolarHabilitado}
      alertaMetodoPago={alertaMetodoPago}
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

  // Con ensurePosDefaults (server) siempre hay al menos una terminal; este
  // fallback solo cubre el caso extremo de todas desactivadas manualmente.
  if (terminales.length === 0) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 448, textAlign: 'center' }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 500 }}>Todas las terminales están inactivas</Typography>
          <Typography sx={{ mt: 1, fontSize: 14, color: '#6b7280' }}>
            Activa una terminal en Configuración → Terminales POS para vender.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Button
        component={Link}
        href="/dashboard"
        nativeButton={false}
        variant="outlined"
        sx={{
          position: 'absolute', left: 16, top: 16, gap: 0.75,
          color: '#4b5563', borderColor: '#e5e7eb', bgcolor: '#fff', fontWeight: 400,
          '&:hover': { bgcolor: '#f9fafb', borderColor: '#e5e7eb' },
        }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} /> Volver al panel
      </Button>
      <Box sx={{ width: '100%', maxWidth: 448, borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 3 }}>
        <Typography component="h1" sx={{ fontSize: 18, fontWeight: 500 }}>Abrir turno de caja</Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: '#6b7280' }}>Elige la terminal y el fondo inicial.</Typography>

        <Typography component="label" sx={{ display: 'block', mt: 2.5, fontSize: 14, color: '#4b5563' }}>Terminal</Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {terminales.map((t) => (
            <ButtonBase
              key={t.id}
              onClick={() => setTerminalId(t.id)}
              sx={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: '8px', border: '1px solid', px: 1.5, py: 1.25, textAlign: 'left', fontSize: 14,
                borderColor: terminalId === t.id ? '#3658e1' : '#e5e7eb',
                bgcolor: terminalId === t.id ? '#eef2fe' : '#fff',
              }}
            >
              <Box component="span" sx={{ fontWeight: 500 }}>{t.nombre}</Box>
              <Box component="span" sx={{ fontSize: 12, color: '#6b7280' }}>{t.almacenNombre ?? 'Sin almacén'}</Box>
            </ButtonBase>
          ))}
        </Box>

        <Typography component="label" sx={{ display: 'block', mt: 2.5, fontSize: 14, color: '#4b5563' }}>Fondo inicial (efectivo para cambio)</Typography>
        <TextField
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0.00"
          fullWidth
          slotProps={{
            input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
            htmlInput: { min: 0, step: 0.01 },
          }}
          sx={{ mt: 1, '& input': { fontSize: 18, py: 1.25 } }}
        />

        <Button
          onClick={abrir} disabled={loading}
          variant="contained" color="primary" fullWidth
          sx={{ mt: 3, py: 1.5, fontWeight: 500 }}
        >
          {loading ? 'Abriendo…' : 'Abrir turno y empezar a vender'}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Pantalla de venta ───────────────────────────────────────────────────────

function Venta({
  turno, terminal, escolarHabilitado, alertaMetodoPago,
}: {
  turno: TurnoProp;
  terminal: TerminalProp | null;
  escolarHabilitado: boolean;
  alertaMetodoPago: boolean;
}) {
  const router = useRouter();
  // Sin `facturas:precio-editar` el cajero vende al precio del catálogo. El
  // servidor rechaza la venta con precio manual, así que el atajo se apaga aquí
  // en vez de dejar que el cobro reviente al final.
  const { can, isLoading: permLoading } = usePermissions();
  const bloquearPrecios = !permLoading && !can('facturas:precio-editar');
  const [productos, setProductos] = useState<ProductoPos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<number | 'todas'>('todas');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  // Producto con variantes tocado en la grilla: abre el selector de variante.
  const [variantePickPos, setVariantePickPos] = useState<ProductoPos | null>(null);
  const [cobrando, setCobrando] = useState(false);
  /**
   * Cuando el envío a DGII falla, el backend deja el e-NCF reservado en un
   * borrador y devuelve su id. Guardarlo hace que el siguiente intento reuse
   * ese mismo número en vez de consumir el siguiente de la secuencia.
   * Solo aplica a tipos con secuencia fiscal; `sin-ncf` no reserva nada.
   */
  const [reservaDocId, setReservaDocId] = useState<number | null>(null);
  const [estudiante, setEstudiante] = useState<MonederoView | null>(null);
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [listaPreciosId, setListaPreciosId] = useState<number | 'general'>('general');
  const [tipoEcf, setTipoEcf] = useState<string>(terminal?.tipoEcf ?? 'sin-ncf');
  const [cliente, setCliente] = useState<ClienteView | null>(null);
  const [nuevoProductoAbierto, setNuevoProductoAbierto] = useState(false);
  const [ventaSimpleAbierta, setVentaSimpleAbierta] = useState(false);

  /**
   * Cuadrícula o lista compacta.
   *
   * La foto ayuda cuando se busca «esa bolsa amarilla»; estorba cuando se busca
   * un nombre, porque cada tarjeta ocupa el alto de cuatro renglones. La lista
   * cabe el doble de productos en la misma pantalla. Cuál sirve depende del
   * catálogo —una cafetería de 30 golosinas no es una papelería de 300— así que
   * lo elige quien atiende, y se recuerda para no repetir el gesto cada turno.
   */
  const [densidad, setDensidad] = useState<'grid' | 'lista'>('grid');
  useEffect(() => {
    try {
      const g = localStorage.getItem('pos-densidad');
      if (g === 'lista' || g === 'grid') setDensidad(g);
    } catch { /* almacenamiento bloqueado: se queda en cuadrícula */ }
  }, []);
  function cambiarDensidad(d: 'grid' | 'lista') {
    setDensidad(d);
    try { localStorage.setItem('pos-densidad', d); } catch { /* da igual */ }
  }

  /**
   * Tamaño de la zona de productos.
   *
   * Las tarjetas están dimensionadas para un dedo y una tableta a un brazo de
   * distancia. En una pantalla grande, o para quien conoce su catálogo de
   * memoria, esa letra enorme solo significa menos productos por pantalla y más
   * desplazamiento. Reducir la escala mete más mercancía a la vista sin tocar
   * nada más.
   *
   * Se aplica con `zoom` y no con `transform: scale` a propósito: `zoom`
   * REFLUYE —la rejilla recoloca sus columnas y el desplazamiento sigue siendo
   * el de siempre—, mientras que `scale` solo estira el dibujo y deja la caja
   * ocupando el sitio de antes, con el contenido desbordando o sobrando.
   *
   * No toca el carrito: ahí se leen importes que se cobran, y encoger eso para
   * ver más productos es un mal cambio.
   */
  const ESCALAS = [0.8, 0.9, 1, 1.15] as const;
  const [escala, setEscala] = useState<number>(1);
  useEffect(() => {
    try {
      const g = Number(localStorage.getItem('pos-escala'));
      if (ESCALAS.includes(g as typeof ESCALAS[number])) setEscala(g);
    } catch { /* almacenamiento bloqueado: se queda en el tamaño normal */ }
    // ESCALAS es una constante literal; no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function cambiarEscala(direccion: 1 | -1) {
    setEscala((prev) => {
      const i = ESCALAS.indexOf(prev as typeof ESCALAS[number]);
      const j = Math.min(ESCALAS.length - 1, Math.max(0, (i < 0 ? 2 : i) + direccion));
      const siguiente = ESCALAS[j];
      try { localStorage.setItem('pos-escala', String(siguiente)); } catch { /* da igual */ }
      return siguiente;
    });
  }

  /** Filtro de favoritos, como una categoría más. */
  const [soloFavoritos, setSoloFavoritos] = useState(false);

  /** Menú «⋯» con lo que se usa una o dos veces por turno. */
  const [menuAcciones, setMenuAcciones] = useState<HTMLElement | null>(null);

  /** Sonido y vibración: el aviso que no obliga a mirar la pantalla. */
  const {
    prefs: feedback, cambiar: cambiarFeedback, subirVolumen, senal, conVibracion,
    nivel: nivelVolumen, nivelMaximo: nivelMaximoVolumen,
  } = useFeedbackPos();

  /**
   * Destello del producto recién agregado, en la tarjeta y en su línea del
   * carrito.
   *
   * Sin señal de que el toque entró, el cajero toca otra vez «por si acaso» y
   * factura dos. El destello dura lo justo para verse de reojo sin quedarse
   * encendido mientras se agrega el siguiente.
   */
  const [flash, setFlash] = useState<{ productId: number; key: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  /** Pastilla «entró esto, llevas tantas», anclada al panel de productos. */
  const [aviso, setAviso] = useState<{ nombre: string; unidades: number } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!aviso) return;
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 1400);
    return () => { if (avisoTimer.current) clearTimeout(avisoTimer.current); };
  }, [aviso]);

  /** Confirma que la línea entró: destello + aviso con el acumulado. */
  const confirmarAgregado = useCallback((productId: number, key: string, nombre: string, unidades: number) => {
    senal('agregar');
    setFlash({ productId, key });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 700);
    /**
     * El aviso NO es un toast.
     *
     * El de la librería trae dos renglones, icono grande y ancho de tarjeta:
     * casi el tamaño de una tarjeta de producto para decir que entró una unidad.
     * Y vive en una esquina fija de la ventana, así que se plantaba encima del
     * buscador o de la barra del carrito según dónde se pusiera.
     *
     * Anclado al panel de productos cae siempre en el mismo sitio útil —arriba,
     * centrado, sobre el borde de la rejilla— sin números mágicos y sin tapar
     * nada de lo que se está usando. El acumulado y no «+1»: lo que hay que
     * comprobar es CUÁNTAS llevas, que es el número con el que uno se equivoca.
     */
    setAviso({ nombre, unidades });
  }, [senal]);

  /** Venta simple: línea de monto libre sin producto de catálogo (id negativo). */
  function agregarVentaSimple(concepto: string, precioCentavos: number, tasaItbis: string) {
    const id = -Date.now();  // sintético — nunca colisiona con ids de catálogo
    setCarrito((prev) => [...prev, {
      id, nombre: concepto || 'Venta simple', referencia: null, codigoBarras: null,
      precio: precioCentavos, tasaItbis, tipo: 'servicio',
      controlaInventario: false, permiteVentaSinStock: true, favorito: false,
      stockAlmacen: null, categoriaId: null, categoriaNombre: null, imagen: null,
      qty: 1,
    }]);
    confirmarAgregado(id, String(id), concepto || 'Venta simple', 1);
    setVentaSimpleAbierta(false);
  }
  const [descuentoAplicado, setDescuentoAplicado] = useState<DescuentoAplicado | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [aparcadas, setAparcadas] = useState<VentaAparcada[]>([]);
  const [aparcadasAbierto, setAparcadasAbierto] = useState(false);


  useEffect(() => {
    void traerJson<{ listasPrecios?: ListaPrecio[] }>('/api/listas-precios')
      .then((d) => setListas(d?.listasPrecios ?? []));
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

  /** Sin ningún favorito marcado el chip no aporta: filtraría a una lista vacía. */
  const hayFavoritos = useMemo(() => productos.some((p) => p.favorito), [productos]);


  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (soloFavoritos && !p.favorito) return false;
      if (categoriaActiva !== 'todas' && p.categoriaId !== categoriaActiva) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) || (p.referencia ?? '').toLowerCase().includes(q);
    });
  }, [productos, busqueda, categoriaActiva, soloFavoritos]);

  const totales = useMemo(() => totalesCarrito(carrito, descuentoAplicado), [carrito, descuentoAplicado]);

  const unidadesCarrito = useMemo(() => carrito.reduce((n, c) => n + c.qty, 0), [carrito]);

  /** Los últimos productos agregados, del más reciente al más viejo. */
  const resumenMovil = useMemo(() => {
    if (carrito.length === 0) return 'Carrito vacío';
    const nombres = [...carrito].reverse().map((c) => (c.qty > 1 ? `${c.qty}× ${c.nombre}` : c.nombre));
    const cabeza = nombres.slice(0, 2).join(', ');
    const resto = nombres.length - 2;
    return resto > 0 ? `${cabeza} +${resto}` : cabeza;
  }, [carrito]);

  function qtyEnLinea(key: string) {
    return carrito.find((c) => lineKey(c) === key)?.qty ?? 0;
  }

  function agregar(p: ProductoPos) {
    // Producto con variantes: hay que elegir cuál (talla/color) antes de sumar.
    if ((p.variantAtributos?.length ?? 0) > 0) { setVariantePickPos(p); return; }
    const key = lineKey(p);
    const yaEnCarrito = qtyEnLinea(key);
    if (p.controlaInventario && !p.permiteVentaSinStock) {
      const disp = p.stockAlmacen ?? 0;
      if (yaEnCarrito + 1 > disp) {
        senal('rechazo');
        toast.error(`Sin stock suficiente de "${p.nombre}" (${disp} disp.)`);
        return;
      }
    }
    setCarrito((prev) => {
      const ex = prev.find((c) => lineKey(c) === key);
      if (ex) return prev.map((c) => (lineKey(c) === key ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { ...p, qty: 1 }];
    });
    confirmarAgregado(p.id, key, p.nombre, yaEnCarrito + 1);
  }

  /** Agrega una variante concreta al carrito como su propia línea. */
  function agregarVariante(p: ProductoPos, v: VariantePick) {
    const linea: LineaCarrito = {
      ...p,
      qty:           1,
      variantId:     v.id,
      variantNombre: v.nombre,
      nombre:        `${p.nombre} · ${v.nombre}`,
      precio:        Math.round(v.precioDOP * 100),
      referencia:    v.referencia ?? p.referencia,
      // El chequeo de stock por línea usa el stock de ESTA variante.
      stockAlmacen:  v.stockActual,
    };
    const key = lineKey(linea);
    if (p.controlaInventario && !p.permiteVentaSinStock) {
      const disp = v.stockActual ?? 0;
      if (qtyEnLinea(key) + 1 > disp) {
        senal('rechazo');
        toast.error(`Sin stock suficiente de "${linea.nombre}" (${disp} disp.)`);
        return;
      }
    }
    setCarrito((prev) => {
      const ex = prev.find((c) => lineKey(c) === key);
      if (ex) return prev.map((c) => (lineKey(c) === key ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, linea];
    });
    confirmarAgregado(p.id, key, linea.nombre, qtyEnLinea(key) + 1);
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
    else { senal('rechazo'); toast.error(`Sin producto para "${code}"`); }
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

  /**
   * Sube o baja una línea con los botones «−» y «+».
   *
   * Suena igual que tocar el producto en la grilla: subir es agregar y bajar es
   * quitar, se haga desde donde se haga. Que el mismo hecho suene distinto según
   * el botón que lo provoque enseña una diferencia que no existe.
   */
  function cambiarQty(key: string, delta: number) {
    const antes = qtyEnLinea(key);
    const despues = Math.max(0, antes + delta);
    if (despues === antes) return;
    senal(delta > 0 ? 'agregar' : 'quitar');
    setCarrito((prev) =>
      prev
        .map((c) => (lineKey(c) === key ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  }

  /**
   * Fija la cantidad exacta de una línea. 0 la quita.
   *
   * Escribir «12» donde había 3 son nueve unidades que entran: suena a agregar.
   * Escribir «1» donde había 8 es lo contrario. Se compara con lo que había en
   * vez de suponer, porque desde el teclado se puede ir en las dos direcciones.
   */
  function fijarQty(key: string, qty: number) {
    const antes = qtyEnLinea(key);
    const despues = Math.max(0, Math.floor(qty));
    if (despues !== antes) senal(despues > antes ? 'agregar' : 'quitar');
    setCarrito((prev) => prev
      .map((c) => (lineKey(c) === key ? { ...c, qty: despues } : c))
      .filter((c) => c.qty > 0));
  }

  /** Fija un precio manual (centavos) a la línea; null restaura el de catálogo. */
  function editarPrecio(key: string, centavos: number | null) {
    setCarrito((prev) =>
      prev.map((c) => (lineKey(c) === key
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
      descuentoPct: descuentoAplicado?.ids.has(lineKey(c)) ? descuentoAplicado.pct : 0,
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

  /**
   * Cobrar DOS VECES la misma venta es el peor fallo de una caja, y había tres
   * puertas abiertas para que pasara:
   *
   *  1. El modal se cierra al confirmar, pero el carrito no se vacía hasta que
   *     contesta el servidor. En ese hueco el botón «Cobrar» del panel volvía a
   *     estar ahí, con el mismo carrito, y NO miraba si ya se estaba cobrando:
   *     dos toques, dos ventas, dos comprobantes fiscales.
   *  2. `setCobrando(false)` se hacía nada más volver del fetch, ANTES de vaciar
   *     el carrito — otro hueco con el botón vivo y la venta ya emitida.
   *  3. Sin `finally`: si el fetch reventaba (se cayó el wifi del colegio) el
   *     botón quedaba bloqueado para siempre y había que recargar la página en
   *     medio de la fila.
   *
   * El candado de verdad es la ref, no el estado: dos toques seguidos caen en el
   * mismo lote de React y los dos leerían `cobrando === false`. La ref cambia en
   * el acto.
   */
  const cobrandoRef = useRef(false);

  async function cobrar(
    pagos: { metodo: MetodoCobro; valorCentavos: number }[],
    recibidoCentavos: number,
    propinaCentavos = 0,
    tipoOrden: TipoOrden = comandaId != null ? 'comer-aqui' : 'mostrador',
  ): Promise<boolean> {
    if (cobrandoRef.current) return false;
    cobrandoRef.current = true;
    setCobrando(true);
    try {
      const ok = await ejecutarCobro(pagos, recibidoCentavos, propinaCentavos, tipoOrden);
      // La hoja del carrito del teléfono se cierra sola al terminar: quedarse
      // abierta sobre un carrito ya vacío hace dudar de si la venta pasó.
      if (ok) setCarritoMovilAbierto(false);
      return ok;
    } finally {
      cobrandoRef.current = false;
      setCobrando(false);
    }
  }

  async function ejecutarCobro(
    pagos: { metodo: MetodoCobro; valorCentavos: number }[],
    recibidoCentavos: number,
    propinaCentavos = 0,
    tipoOrden: TipoOrden = comandaId != null ? 'comer-aqui' : 'mostrador',
  ) {
    const esMonedero = pagos.length === 1 && pagos[0].metodo === 'cuenta-estudiante';
    // Fiado: sin pagos. El motor calcula estado_pago = PENDIENTE y el documento
    // entra a cuentas por cobrar, la misma cartera que lee Facturación.
    const esCredito = pagos.length === 0;
    const totalConPropina = totales.total + propinaCentavos;

    // Sin alguien a quien cobrarle, la deuda queda huérfana en la cartera.
    if (esCredito && !cliente && !estudiante) {
      toast.error('Para fiar hay que elegir el cliente o el estudiante');
      return false;
    }

    // Crédito fiscal (e31) exige RNC del comprador (DGII #38). El servidor lo
    // revalida, pero se corta aquí para no perder la venta con un error tardío.
    if (tipoEcf === '31' && !cliente?.rnc) {
      toast.error('El crédito fiscal (e31) requiere el RNC del comprador');
      return false;
    }

    // Pre-chequeo del monedero (el servidor lo re-valida atómicamente).
    if (esMonedero) {
      if (!estudiante) { toast.error('Selecciona un estudiante'); return false; }
      if (estudiante.saldoCentavos < totalConPropina) { toast.error('Saldo insuficiente en el monedero'); return false; }
      if (estudiante.disponibleHoyCentavos != null && totalConPropina > estudiante.disponibleHoyCentavos) {
        toast.error('La venta excede el límite diario del estudiante'); return false;
      }
    }

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
        // Venta simple usa ids sintéticos negativos — sin producto de catálogo
        // ni descuento de inventario.
        productoId:             c.id > 0 ? c.id : (undefined as unknown as number),
        // Variante vendida → el descuento de stock pega a la variante.
        variantId:              c.variantId ?? undefined,
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
        variantId:              undefined,
      });
    }

    // Persistir las líneas (detalle de venta + ticket). Forma compatible con ItemLinea[].
    const lineasBase = carrito.map((c, i) => ({
      id: i + 1, productoId: c.id > 0 ? c.id : 0,
      variantId: c.variantId ?? null, variantNombre: c.variantNombre ?? null,
      nombreItem: c.nombre, referencia: c.referencia ?? '',
      descripcionItem: '', cantidadItem: c.qty, precioUnitarioItem: precioLinea(c) / 100,
      descuentoPct: (descuentoAplicado?.ids.has(lineKey(c)) ? descuentoAplicado.pct : 0),
      tasaItbis: c.tasaItbis, indicadorBienoServicio: c.tipo === 'bien' ? '1' : '2',
    }));
    if (propinaCentavos > 0) {
      lineasBase.push({
        id: lineasBase.length + 1, productoId: 0, variantId: null, variantNombre: null,
        nombreItem: 'Propina', referencia: '',
        descripcionItem: '', cantidadItem: 1, precioUnitarioItem: propinaCentavos / 100,
        descuentoPct: 0, tasaItbis: 'exento', indicadorBienoServicio: '2',
      });
    }
    const lineasJson = JSON.stringify(lineasBase);

    const payload = {
      modo:                 'borrador',
      tipoEcf,
      razonSocialComprador: esMonedero || (esCredito && !cliente)
                              ? estudiante!.nombre
                              : (cliente?.razonSocial ?? 'Consumidor Final'),
      clientId:             !esMonedero && cliente ? cliente.id : undefined,
      rncComprador:         esMonedero ? undefined : (cliente?.rnc ?? undefined),
      emailComprador:       esMonedero ? undefined : (cliente?.email ?? undefined),
      // Fiar a un estudiante ata la deuda a él, igual que el monedero: si no,
      // la cartera muestra el nombre pero no a quién corresponde.
      dependienteId:        esMonedero || (esCredito && !cliente && estudiante)
                              ? estudiante!.dependienteId : undefined,
      dependienteNombre:    esMonedero || (esCredito && !cliente && estudiante)
                              ? estudiante!.nombre : undefined,
      // 2 = crédito (DGII). El motor exige fechaLimitePago solo al emitir a la
      // DGII, no en borrador; el POS guarda en borrador.
      tipoPago:             esCredito ? 2 : 1,
      items,
      lineasJson,
      pagoRecibido:         !esCredito,
      pagos:                pagos.map((p) => ({ metodo: p.metodo, valor: p.valorCentavos / 100 })),
      almacenId:            terminal?.almacenId ?? null,
      // Clasificación operativa del POS (no fiscal). El motor la estampa en
      // ecf_documents.tipo_orden para el historial de recibos.
      tipoOrden,
    };

    // Cobro con monedero: saga atómica server-side (descuenta → emite → revierte
    // si falla). Una sola llamada; el saldo nunca queda descuadrado.
    if (esMonedero && estudiante) {
      const res = await fetch('/api/pos/venta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monederoId: estudiante.id, emitPayload: payload }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El e-NCF quedó reservado en un borrador: guardarlo para que el
        // próximo intento lo reuse en vez de consumir otro número.
        if (typeof r.docId === 'number') setReservaDocId(r.docId);
        senal('rechazo');
        toast.error(r.error ?? 'No se pudo completar la venta');
        await refrescarEstudiante(estudiante.dependienteId);  // refleja la reversa
        return false;
      }
      setReservaDocId(null);
      senal('cobrar');
      toast.success(`Cobrado a ${estudiante.nombre}. Saldo: ${fmt(r.saldoCentavos)}`);
      await refrescarEstudiante(estudiante.dependienteId);
      if (r.documentoId) { docId = r.documentoId; }
    } else {
      // Reintento tras un fallo: usar el borrador que conserva el e-NCF ya
      // reservado, para no quemar otro número de la secuencia.
      const res = reservaDocId
        ? await fetch(`/api/facturas/${reservaDocId}/emitir-ecf`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipoEcf: payload.tipoEcf,
              ...(payload.rncComprador         ? { rncComprador:         payload.rncComprador }         : {}),
              ...(payload.razonSocialComprador ? { razonSocialComprador: payload.razonSocialComprador } : {}),
            }),
          })
        : await fetch('/api/ecf/emitir', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const venta = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof venta.docId === 'number') setReservaDocId(venta.docId);
        senal('rechazo');
        toast.error(venta.error ?? 'No se pudo completar la venta');
        return false;
      }
      setReservaDocId(null);
      const cambio = recibidoCentavos - totalConPropina;
      senal('cobrar');
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
      return true;
    }

    setCarrito([]);
    setDescuentoAplicado(null);
    cargarCatalogo(true);   // refresca stock sin parpadeo
    return true;
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
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
      {mesaActiva && (
        <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #fde68a', bgcolor: '#fffbeb', px: { xs: 1.5, sm: 2 }, py: 0.75, fontSize: 14 }}>
          <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 1 }}>
            <ButtonBase onClick={guardarYVolver} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: '8px', border: '1px solid #fcd34d', bgcolor: '#fff', px: 1.25, py: 0.75, fontSize: 12, fontWeight: 500, color: '#92400e', '&:hover': { bgcolor: '#fef3c7' } }}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> Mesas
            </ButtonBase>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#78350f' }}>{mesaActiva.nombre}</Box>
            {mesero && <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#b45309' }}>· {mesero.nombre}</Box>}
          </Box>
          <Button onClick={() => guardarComanda(false)} variant="contained" disableElevation sx={{ borderRadius: '8px', bgcolor: '#d97706', px: 1.5, py: 0.75, fontSize: 12, fontWeight: 500, color: '#fff', '&:hover': { bgcolor: '#b45309' } }}>
            Guardar comanda
          </Button>
        </Box>
      )}
      {/* `nowrap`: la cabecera de la caja es UNA línea, pase lo que pase.
          Con `wrap`, en cuanto el nombre de la terminal y el del almacén no
          dejaban sitio, el buscador o los botones caían a un segundo renglón —
          y cada renglón de cabecera es una fila de productos menos. Ahora lo
          que sobra se encoge o se esconde por orden de importancia: primero el
          nombre del almacén, después la palabra «Panel», y el buscador se
          estrecha; nada se va a otra línea. */}
      <Box component="header" sx={{ zIndex: 20, display: 'flex', flexShrink: 0, flexWrap: 'nowrap', alignItems: 'center', gap: 1, borderBottom: '1px solid #e5e7eb', bgcolor: '#fff', px: { xs: 1.5, sm: 2 }, py: 1 }}>
        {/* En el teléfono esta fila entera desaparece.
            La flecha de volver ya está en la barra de la app, justo encima, y
            repetirla gastaba un renglón completo de los pocos que caben; el
            nombre de la caja se lee en el menú «⋯». En tablet y escritorio sí
            hay sitio de sobra y se quedan donde estaban. */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 1, minWidth: 0, alignItems: 'center', gap: { sm: 1, lg: 1.5 } }}>
          <Button component={Link} href="/dashboard" nativeButton={false} variant="outlined" title="Volver al panel" sx={{ ...iconActionSx, flexShrink: 0 }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
            {/* La palabra se va antes que el nombre de la caja: la flecha sola
                ya se entiende, y saber en qué terminal estás no. */}
            <Box component="span" sx={{ display: { sm: 'none', lg: 'inline' }, fontSize: 14 }}>Panel</Box>
          </Button>
          <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 1, fontSize: 14, fontWeight: 500 }}>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{terminal?.nombre ?? 'Punto de venta'}</Box>
            {/* El almacén es lo primero que sobra: casi siempre hay uno solo. */}
            <Box component="span" sx={{ display: { xs: 'none', xl: 'inline' }, color: '#9ca3af' }}>·</Box>
            <Box component="span" sx={{ display: { xs: 'none', xl: 'inline' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280' }}>{terminal?.almacenNombre ?? ''}</Box>
          </Box>
        </Box>
        <TextField
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); escanear(); } }}
          /**
           * `id` a mano, no el que inventa MUI.
           *
           * Sin él, MUI lo genera con `useId`, que depende de la posición en el
           * árbol ENTERO: cualquier cambio por encima del POS —una capa del
           * layout, el loader de cambio de módulo— le daba al servidor un id
           * distinto del que calculaba el cliente, y React avisaba de un
           * desajuste de hidratación nada más cargar la pantalla. Escrito a
           * mano, el campo deja de depender de lo que pase más arriba.
           */
          id="pos-buscar-producto"
          placeholder="Buscar o escanear (nombre, referencia o código de barras)…"
          autoFocus
          sx={{
            // Comparte fila con Aparcar y «⋯» también en el teléfono: ahí ya no
            // hay nada más en la cabecera con lo que competir.
            order: 0,
            width: 'auto',
            flex: 1,
            // En tablet el mínimo evita que los botones lo aplasten a nada; en
            // el teléfono tiene que poder encogerse o desborda la fila.
            minWidth: { xs: 0, sm: 260 },
            maxWidth: { sm: 380, md: 460 },
            mx: { sm: 1.5 },
            '& .MuiInputBase-root': { height: { xs: 52, sm: 52 }, fontSize: 16, borderRadius: '10px' },
          }}
        />
        {/* Barra de acciones.
            «Aparcar» se queda fuera porque se usa EN MEDIO de una venta —el
            cliente que se olvidó la cartera en el carro— y esconderla tras dos
            toques con alguien esperando no vale la pena. Aparcadas, Reporte X y
            Cerrar turno se usan una o dos veces por turno: al menú. Lo que gana
            el sitio que dejan es la búsqueda, que es por donde pasa casi todo. */}
        <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: { xs: 0.75, sm: 1 } }}>
          <Button
            onClick={aparcar}
            disabled={carrito.length === 0}
            variant="outlined"
            title="Aparcar venta (F3)"
            sx={{ ...iconActionSx, '&.Mui-disabled': { opacity: 0.4 } }}
          >
            <PauseCircle style={{ width: 18, height: 18 }} /> <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, fontSize: 14 }}>Aparcar</Box>
          </Button>
          <Button
            onClick={(e) => setMenuAcciones(e.currentTarget)}
            variant="outlined"
            title="Más acciones"
            aria-label="Más acciones"
            sx={{ ...iconActionSx, position: 'relative', minWidth: 48, px: 1.25 }}
          >
            <MoreHorizontal style={{ width: 20, height: 20 }} />
            {aparcadas.length > 0 && (
              <Box component="span" sx={{ position: 'absolute', right: -4, top: -4, display: 'flex', height: 20, minWidth: 20, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: '#3658e1', px: 0.5, fontSize: 11, fontWeight: 600, color: '#fff' }}>{aparcadas.length}</Box>
            )}
          </Button>
          <Menu
            anchorEl={menuAcciones}
            open={Boolean(menuAcciones)}
            onClose={() => setMenuAcciones(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 232, borderRadius: '12px', mt: 0.5 } } }}
          >
            {/* En el teléfono el menú es también el sitio donde se dice en qué
                caja se está y por dónde se sale: son las dos cosas que se
                quitaron de la cabecera para ganar el renglón. */}
            <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 2, pt: 0.5, pb: 1 }}>
              <Box sx={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{terminal?.nombre ?? 'Punto de venta'}</Box>
              <Box sx={{ fontSize: 12, color: '#6b7280' }}>{terminal?.almacenNombre ?? ''}</Box>
            </Box>
            <MenuItem
              component={Link}
              href="/dashboard"
              onClick={() => setMenuAcciones(null)}
              sx={{ display: { xs: 'flex', sm: 'none' }, gap: 1.25, minHeight: 48, fontSize: 15 }}
            >
              <ArrowLeft style={{ width: 18, height: 18, color: '#6b7280' }} />
              Volver al panel
            </MenuItem>
            <Divider sx={{ display: { xs: 'block', sm: 'none' }, my: 0.5 }} />
            {/* Dar de alta un producto en medio de una venta pasa una vez cada
                muchas ventas. Ocupaba un botón fijo en la fila de categorías —la
                que no puede partirse en dos— y ese sitio vale más para los
                chips. Aquí sigue a un toque de distancia. */}
            <MenuItem
              onClick={() => { setMenuAcciones(null); setNuevoProductoAbierto(true); }}
              sx={{ gap: 1.25, minHeight: 48, fontSize: 15 }}
            >
              <Plus style={{ width: 18, height: 18, color: '#6b7280' }} />
              Nuevo producto
            </MenuItem>
            <MenuItem
              onClick={() => { setMenuAcciones(null); setAparcadasAbierto(true); }}
              sx={{ gap: 1.25, minHeight: 48, fontSize: 15 }}
            >
              <ListChecks style={{ width: 18, height: 18, color: '#6b7280' }} />
              Ventas aparcadas
              {aparcadas.length > 0 && (
                <Box component="span" sx={{ ml: 'auto', display: 'flex', height: 22, minWidth: 22, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: '#eef2fe', px: 0.75, fontSize: 12, fontWeight: 700, color: '#2a45c4' }}>{aparcadas.length}</Box>
              )}
            </MenuItem>
            <MenuItem
              onClick={() => { setMenuAcciones(null); window.open(`/pos-reporte/${turno.id}`, '_blank', 'width=420,height=680'); }}
              sx={{ gap: 1.25, minHeight: 48, fontSize: 15 }}
            >
              <FileText style={{ width: 18, height: 18, color: '#6b7280' }} />
              Reporte X
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />

            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => { setMenuAcciones(null); setCierreAbierto(true); }}
              sx={{ gap: 1.25, minHeight: 48, fontSize: 15, color: '#b91c1c' }}
            >
              <LogOut style={{ width: 18, height: 18 }} />
              Cerrar turno
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', minHeight: 0, flex: 1, gridTemplateColumns: { xs: '1fr', md: '1.55fr 1fr' }, gap: 1.5, p: 1.5 }}>
        {/* Grilla */}
        {/* `minWidth: 0` en las DOS columnas: un ítem de rejilla nace con
            min-width:auto, o sea que se niega a encogerse por debajo del ancho
            mínimo de su contenido. Un nombre largo sin cortar en el carrito
            ensanchaba su pista, la suma de las dos pistas pasaba del contenedor
            y el pie —con el botón de Cobrar— se salía por el borde derecho. */}
        <Box sx={{ display: 'flex', minWidth: 0, minHeight: 0, flexDirection: 'column', zoom: escala }}>
          {/* Una sola línea, pase lo que pase.
              La tira de chips se desplaza y el botón de ajustes se queda fijo a
              la derecha. Antes esto se medía para decidir si el botón cabía y,
              cuando no, la fila se partía en dos renglones — cuatro productos
              menos a la vista en una pantalla donde lo que se mira es la
              mercancía. Con un botón en vez de tres, no hay nada que medir. */}
          <Box sx={{ mb: 1.5, display: 'flex', flexShrink: 0, flexWrap: 'nowrap', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', flex: 1, minWidth: 0, overflowX: 'auto', pb: 0.5 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {/* Favoritos va PRIMERO y existe aunque no haya categorías: es
                    el atajo del cajero a lo que vende todo el día. Antes, sin
                    categorías configuradas, la única forma de llegar a un
                    producto era escribir su nombre. */}
                {hayFavoritos && (
                  <ButtonBase
                    onClick={() => setSoloFavoritos((v) => !v)}
                    sx={{
                      flexShrink: 0, borderRadius: '9999px', border: '1px solid', px: 2.5, minHeight: 44, fontSize: 16, fontWeight: 500, gap: 0.75,
                      borderColor: soloFavoritos ? '#f59e0b' : '#e5e7eb',
                      bgcolor: soloFavoritos ? '#fffbeb' : 'transparent',
                      color: soloFavoritos ? '#b45309' : '#4b5563',
                    }}
                  >
                    <Star style={{ width: 16, height: 16, fill: soloFavoritos ? '#f59e0b' : 'none', color: soloFavoritos ? '#f59e0b' : 'currentColor' }} />
                    Favoritos
                  </ButtonBase>
                )}
                {categorias.length > 0 && (
                  <>
                    <ButtonBase
                      onClick={() => { setCategoriaActiva('todas'); setSoloFavoritos(false); }}
                      sx={{
                        flexShrink: 0, borderRadius: '9999px', border: '1px solid', px: 2.5, minHeight: 44, fontSize: 16, fontWeight: 500, gap: 0.75,
                        borderColor: categoriaActiva === 'todas' && !soloFavoritos ? '#3658e1' : '#e5e7eb',
                        bgcolor: categoriaActiva === 'todas' && !soloFavoritos ? '#eef2fe' : 'transparent',
                        color: categoriaActiva === 'todas' && !soloFavoritos ? '#2a45c4' : '#4b5563',
                      }}
                    >
                      Todas
                    </ButtonBase>
                    {categorias.map((c) => (
                      <ButtonBase
                        key={c.id}
                        onClick={() => { setCategoriaActiva(c.id); setSoloFavoritos(false); }}
                        sx={{
                          flexShrink: 0, borderRadius: '9999px', border: '1px solid', px: 2.5, minHeight: 44, fontSize: 16, fontWeight: 500, gap: 0.75,
                          borderColor: categoriaActiva === c.id ? '#3658e1' : '#e5e7eb',
                          bgcolor: categoriaActiva === c.id ? '#eef2fe' : 'transparent',
                          color: categoriaActiva === c.id ? '#2a45c4' : '#4b5563',
                        }}
                      >
                        {c.nombre}
                      </ButtonBase>
                    ))}
                  </>
                )}
              </Box>
            </Box>
            {/* Un solo botón para vista + aviso. Antes eran dos botones fijos
                más el de «Nuevo producto», y con seis categorías la fila se
                partía en dos renglones — que en una caja son cuatro productos
                menos a la vista. Lo que no cabe se va al menú «⋯». */}
            <AjustesCaja
              densidad={densidad}
              onDensidad={cambiarDensidad}
              escala={escala}
              escalas={ESCALAS}
              onEscala={cambiarEscala}
              prefs={feedback}
              onPrefs={cambiarFeedback}
              onVolumen={subirVolumen}
              nivel={nivelVolumen}
              nivelMaximo={nivelMaximoVolumen}
              conVibracion={conVibracion}
            />
          </Box>
          {cargando ? (
            <Typography sx={{ fontSize: 14, color: '#6b7280' }}>Cargando catálogo…</Typography>
          ) : (
            <Box sx={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            {/* La pastilla vive DENTRO del panel de productos, no en una esquina
                fija de la ventana: así cae siempre en el mismo sitio útil —el
                borde de arriba de la rejilla— sin tapar el buscador, los chips
                ni la barra del carrito, y sin depender de medir alturas. */}
            {aviso && (
              <Box
                onClick={() => setAviso(null)}
                sx={{
                  position: 'absolute', left: '50%', top: 8, zIndex: 4, transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', pointerEvents: 'auto',
                  maxWidth: 'calc(100% - 16px)', borderRadius: '9999px', bgcolor: '#111827', color: '#fff',
                  pl: 1.25, pr: 0.75, py: 0.75, boxShadow: 4,
                }}
              >
                <Check style={{ width: 15, height: 15, color: '#4ade80', flexShrink: 0 }} />
                <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 500 }}>
                  {aviso.nombre}
                </Box>
                <Box component="span" sx={{ flexShrink: 0, borderRadius: '9999px', bgcolor: 'rgba(255,255,255,0.16)', px: 0.875, fontSize: 12.5, fontWeight: 700, ...MONEY }}>
                  {aviso.unidades}
                </Box>
              </Box>
            )}
            <Box
              sx={densidad === 'lista'
                ? { display: 'flex', flex: 1, flexDirection: 'column', gap: 0.75, overflow: 'auto', pb: { xs: 12, md: 1.5 } }
                /* Columnas por ANCHO MÍNIMO y no un número fijo por breakpoint.
                   Con `repeat(3, 1fr)` el tamaño no hacía nada visible: al
                   achicar, las tres columnas simplemente se ensanchaban y se
                   veían los mismos productos. Con `auto-fill` + `minmax`, la
                   rejilla mete tantas tarjetas como quepan — que es justo lo
                   que se pide al bajar el tamaño. A los anchos de siempre da
                   las mismas columnas de siempre. */
                : { display: 'grid', flex: 1, gridAutoRows: 'max-content', gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(148px, 1fr))', md: 'repeat(auto-fill, minmax(210px, 1fr))' }, alignContent: 'start', gap: 2, overflow: 'auto', pb: { xs: 12, md: 1.5 } }}
            >
              {/* Venta simple: monto libre sin producto (patrón Alegra) */}
              <ButtonBase
                onClick={() => setVentaSimpleAbierta(true)}
                sx={densidad === 'lista'
                  ? { display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, borderRadius: '12px', border: '2px dashed #d1d5db', bgcolor: '#fff', px: 1.5, py: 1.25, justifyContent: 'flex-start',
                      '&:hover': { borderColor: '#8193f5', bgcolor: '#eef2fe' }, '&:active': { transform: 'scale(0.99)' } }
                  : { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
                      borderRadius: '16px', border: '2px dashed #d1d5db', bgcolor: '#fff', minHeight: 180,
                      '&:hover': { borderColor: '#8193f5', bgcolor: '#eef2fe' }, '&:active': { transform: 'scale(0.97)' } }}
              >
                <Box sx={{ display: 'flex', height: densidad === 'lista' ? 44 : 60, width: densidad === 'lista' ? 44 : 60, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: '#f3f4f6', flexShrink: 0 }}>
                  <Zap style={{ width: densidad === 'lista' ? 20 : 28, height: densidad === 'lista' ? 20 : 28, color: '#3658e1' }} />
                </Box>
                <Box component="span" sx={{ fontSize: densidad === 'lista' ? 15 : 17, fontWeight: 700, color: '#374151' }}>Venta simple</Box>
              </ButtonBase>
              {filtrados.length === 0 && (
                <Box sx={{ gridColumn: densidad === 'lista' ? undefined : '2 / -1', display: 'flex', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 14, color: '#6b7280' }}>
                    {soloFavoritos
                      ? 'Ningún favorito todavía — toca la estrella de un producto para marcarlo.'
                      : 'Sin productos para esta terminal — crea el primero o usa Venta simple.'}
                  </Typography>
                </Box>
              )}
              {filtrados.map((p) => {
                const agotado = estaAgotado(p);
                // Suma de todas las líneas de este producto (incluye sus variantes).
                const qty = carrito.filter((c) => c.id === p.id).reduce((s, c) => s + c.qty, 0);
                const destella = flash?.productId === p.id;
                const stockTexto = p.controlaInventario ? (agotado ? 'agotado' : `${p.stockAlmacen} disp.`) : '';

                // El borde y el fondo azules dicen «esto ya está en el carrito»
                // sin obligar a leer el panel de la derecha, que es donde el
                // cajero tenía que ir a comprobarlo.
                const enCarrito = {
                  borderColor: qty > 0 ? '#8193f5' : '#e5e7eb',
                  boxShadow:   qty > 0 ? '0 0 0 1px #8193f5' : 'none',
                  bgcolor:     destella ? '#dbeafe' : qty > 0 ? '#f5f7ff' : '#fff',
                  // El destello entra de golpe y se va despacio: aparecer es la
                  // señal, desaparecer no debe robar la vista del siguiente toque.
                  transition:  destella ? 'none' : 'background-color .45s ease-out',
                };

                const insignia = qty > 0 && (
                  <Box component="span" sx={{ position: 'absolute', left: densidad === 'lista' ? 4 : 8, top: densidad === 'lista' ? 4 : 8, display: 'flex', height: densidad === 'lista' ? 22 : 32, minWidth: densidad === 'lista' ? 22 : 32, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: '#3658e1', px: 0.75, fontSize: densidad === 'lista' ? 12 : 14, fontWeight: 700, color: '#fff', boxShadow: 1, ...MONEY }}>
                    {qty}
                  </Box>
                );

                if (densidad === 'lista') {
                  return (
                    <ButtonBase
                      key={p.id}
                      disabled={agotado}
                      onClick={() => agregar(p)}
                      sx={{
                        position: 'relative', display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1.5,
                        borderRadius: '12px', border: '1px solid', px: 1.5, py: 1.25, textAlign: 'left',
                        minHeight: 60, opacity: agotado ? 0.5 : 1, ...enCarrito,
                        '&:active': { transform: 'scale(0.99)' },
                        '&:hover': { borderColor: agotado ? '#e5e7eb' : '#8193f5' },
                      }}
                    >
                      <Box sx={{ position: 'relative', height: 44, width: 44, flexShrink: 0, overflow: 'hidden', borderRadius: '10px', bgcolor: '#f9fafb' }}>
                        {p.imagen ? (
                          <Box component="img" src={p.imagen} alt={p.nombre} sx={{ display: 'block', height: '100%', width: '100%', objectFit: 'cover' }} />
                        ) : (() => {
                          const c = tileColor(p.nombre);
                          return (
                            <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
                              <Box component="span" sx={{ fontSize: 15, fontWeight: 700, color: c.fg }}>{iniciales(p.nombre)}</Box>
                            </Box>
                          );
                        })()}
                        {insignia}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{p.nombre}</Box>
                        {(p.categoriaNombre || stockTexto) && (
                          <Box sx={{ mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: agotado ? '#b91c1c' : '#9ca3af' }}>
                            {[p.categoriaNombre, stockTexto].filter(Boolean).join(' · ')}
                          </Box>
                        )}
                      </Box>
                      <Box component="span" sx={{ flexShrink: 0, fontSize: 18, fontWeight: 800, color: '#111827', ...MONEY }}>{fmt(p.precio)}</Box>
                      <Box
                        component="span"
                        role="button"
                        title={p.favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                        onClick={(e) => { e.stopPropagation(); toggleFavorito(p); }}
                        sx={{ display: 'flex', height: 44, width: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', cursor: 'pointer', '&:hover': { bgcolor: '#f3f4f6' } }}
                      >
                        <Star style={{ width: 18, height: 18, color: p.favorito ? '#fbbf24' : '#d1d5db', fill: p.favorito ? '#fbbf24' : 'none' }} />
                      </Box>
                    </ButtonBase>
                  );
                }

                return (
                  <ButtonBase
                    key={p.id}
                    disabled={agotado}
                    onClick={() => agregar(p)}
                    sx={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden', borderRadius: '12px', border: '1px solid', textAlign: 'left',
                      '&:active': { transform: 'scale(0.97)' },
                      opacity: agotado ? 0.5 : 1,
                      ...enCarrito,
                      '&:hover': { borderColor: agotado ? '#e5e7eb' : '#8193f5' },
                    }}
                  >
                    {/* El marco es cuadrado y la foto se recorta dentro (objectFit
                        cover). `minHeight: 0` no es adorno: la tarjeta es una
                        columna flex, y en una columna flex cada hijo recibe
                        min-height:auto = el alto de su contenido. La <img> pide
                        height:100% contra un padre de alto aún indefinido, así
                        que cae a su alto REAL — y ese mínimo pisa el
                        aspect-ratio. Con una foto vertical el marco crecía, la
                        tarjeta se estiraba y los precios de la fila dejaban de
                        alinearse. Las apaisadas no lo enseñaban. */}
                    <Box sx={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', minHeight: 0, flexShrink: 0, bgcolor: '#f9fafb' }}>
                      {p.imagen ? (
                        <Box component="img" src={p.imagen} alt={p.nombre} sx={{ display: 'block', height: '100%', width: '100%', objectFit: 'cover' }} />
                      ) : (
                        (() => {
                          const c = tileColor(p.nombre);
                          return (
                            <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
                              <Box component="span" sx={{ fontSize: { xs: 36, sm: 48 }, fontWeight: 700, color: c.fg }}>{iniciales(p.nombre)}</Box>
                            </Box>
                          );
                        })()
                      )}
                      {insignia}
                      <Box
                        component="span"
                        role="button"
                        title={p.favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                        onClick={(e) => { e.stopPropagation(); toggleFavorito(p); }}
                        sx={{ position: 'absolute', right: 4, top: 4, display: 'flex', height: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', bgcolor: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
                      >
                        <Star style={{ width: 22, height: 22, color: p.favorito ? '#fbbf24' : '#9ca3af', fill: p.favorito ? '#fbbf24' : 'none' }} />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', p: 2 }}>
                      <Box>
                        <Box sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 700, lineHeight: 1.25 }}>{p.nombre}</Box>
                        <Box sx={{ mt: 0.5, fontSize: 14, color: agotado ? '#b91c1c' : '#9ca3af' }}>
                          {p.referencia ? p.referencia + ' · ' : ''}
                          {stockTexto}
                        </Box>
                      </Box>
                      <Box sx={{ mt: 1, fontSize: 24, fontWeight: 800, color: '#111827', ...MONEY }}>{fmt(p.precio)}</Box>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Box>
            </Box>
          )}
        </Box>

        {/* Carrito — panel fijo en escritorio, hoja deslizable en móvil */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, minWidth: 0, minHeight: 0, width: { md: '100%' } }}>
          <CarritoPanel
            carrito={carrito}
            totales={totales}
            cambiarQty={cambiarQty}
            fijarQty={fijarQty}
            editarPrecio={editarPrecio}
            flashKey={flash?.key ?? null}
            cobrando={cobrando}
            onCobrar={cobrar}
            escolar={escolarHabilitado}
            alertaMetodoPago={alertaMetodoPago}
            bloquearPrecios={bloquearPrecios}
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
            enMesa={comandaId != null}
          />
        </Box>
      </Box>

      {/* Barra flotante móvil: total + abrir carrito */}
      <ButtonBase
        onClick={() => setCarritoMovilAbierto(true)}
        disabled={cobrando || carrito.length === 0}
        sx={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 30, display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px', bgcolor: '#3658e1', px: 2, py: 1.75, color: '#fff', boxShadow: 4, '&.Mui-disabled': { opacity: 0.5 } }}
      >
        <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left', lineHeight: 1.3 }}>
          {/* En el teléfono la barra es TODO lo que se ve del carrito: la lista
              está detrás de un toque. «3 artículos» no deja comprobar nada;
              con los nombres, el cajero ve lo último que agregó sin abrirla —
              que es justo cuando se detecta el toque de más. */}
          <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 600 }}>
            {resumenMovil}
          </Box>
          <Box component="span" sx={{ display: 'block', fontSize: 11.5, opacity: 0.85 }}>
            {carrito.length} {carrito.length === 1 ? 'línea' : 'líneas'} · {unidadesCarrito} u.
          </Box>
        </Box>
        <Box component="span" sx={{ flexShrink: 0, ml: 1.5, fontWeight: 600, ...MONEY }}>{fmt(totales.total)}</Box>
      </ButtonBase>

      {carritoMovilAbierto && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 40, display: { xs: 'flex', md: 'none' }, flexDirection: 'column', bgcolor: 'rgba(0,0,0,0.45)' }} onClick={() => setCarritoMovilAbierto(false)}>
          {/* La hoja se queda en 85vh y REPARTE esa altura: cabecera fija y el
              panel ocupando el resto. Antes el panel crecía dentro de la hoja
              y el botón de cobrar quedaba por debajo del borde del teléfono. */}
          <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', maxHeight: '85vh', minHeight: 0, borderRadius: '16px 16px 0 0', bgcolor: '#fff', p: 1.5 }} onClick={(e) => e.stopPropagation()}>
            <Box sx={{ mb: 0.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box component="span" sx={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>Tu carrito</Box>
              {/* 44px de lado: era un botón «small» con un icono de 18 en la
                  esquina superior de una hoja a pantalla completa — el objetivo
                  más difícil de acertar de toda la caja, y el que se toca con
                  prisa para volver a la rejilla. */}
              <IconButton
                onClick={() => setCarritoMovilAbierto(false)}
                aria-label="Cerrar el carrito"
                sx={{ height: 44, width: 44, color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6' } }}
              >
                <X style={{ width: 24, height: 24 }} />
              </IconButton>
            </Box>
            <CarritoPanel
              carrito={carrito}
              totales={totales}
              cambiarQty={cambiarQty}
              fijarQty={fijarQty}
              editarPrecio={editarPrecio}
              flashKey={flash?.key ?? null}
              cobrando={cobrando}
              onCobrar={cobrar}
              escolar={escolarHabilitado}
              alertaMetodoPago={alertaMetodoPago}
              bloquearPrecios={bloquearPrecios}
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
              enMesa={comandaId != null}
            />
          </Box>
        </Box>
      )}

      {nuevoProductoAbierto && (
        <ProductoDialog
          open
          onClose={() => setNuevoProductoAbierto(false)}
          onCreated={() => { setNuevoProductoAbierto(false); cargarCatalogo(); }}
        />
      )}

      {ventaSimpleAbierta && (
        <VentaSimpleModal
          onClose={() => setVentaSimpleAbierta(false)}
          onAgregar={agregarVentaSimple}
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

      {variantePickPos && (
        <ModalSeleccionarVariante
          open
          productoId={variantePickPos.id}
          productoNombre={variantePickPos.nombre}
          almacenId={terminal?.almacenId ?? null}
          onClose={() => setVariantePickPos(null)}
          onPick={(v) => {
            agregarVariante(variantePickPos, v);
            setVariantePickPos(null);
          }}
        />
      )}
    </Box>
  );
}

// ─── Panel de carrito + cobro ────────────────────────────────────────────────

function CarritoPanel({
  carrito, totales, cambiarQty, fijarQty, editarPrecio, flashKey = null, cobrando, onCobrar, escolar, alertaMetodoPago, bloquearPrecios, estudiante, onSelectEstudiante,
  listas, listaPreciosId, onSelectLista, tipoEcf, onSelectTipoEcf, cliente, onSelectCliente,
  descuentoAplicado, onAplicarDescuento, cobroDirecto = false, onCobroConsumido, enMesa = false,
}: {
  carrito: LineaCarrito[];
  totales: { subtotal: number; itbis: number; total: number; descuentoTotal: number };
  cambiarQty: (key: string, delta: number) => void;
  /** Fija la cantidad de una línea a un número escrito (0 = quitar). */
  fijarQty: (key: string, qty: number) => void;
  editarPrecio: (key: string, centavos: number | null) => void;
  /** Línea recién agregada: destella y se centra sola en la lista. */
  flashKey?: string | null;
  cobrando: boolean;
  /** Doble confirmación del método antes de cerrar el cobro. */
  alertaMetodoPago: boolean;
  /** Sin `facturas:precio-editar`: precio de catálogo, sin retoques. */
  bloquearPrecios: boolean;
  /** Resuelve a true solo si la venta quedó emitida: es lo que decide si el
   *  modal de cobro puede cerrarse o tiene que quedarse para reintentar. */
  onCobrar: (pagos: { metodo: MetodoCobro; valorCentavos: number }[], recibidoCentavos: number, propinaCentavos: number, tipoOrden: TipoOrden) => Promise<boolean>;
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
  /** true si la venta se cobra desde una mesa (comanda) → habilita "Comer aquí". */
  enMesa?: boolean;
}) {
  const [abrirCobro, setAbrirCobro] = useState(false);
  const [panelDescuento, setPanelDescuento] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);

  const listaNombre = listaPreciosId === 'general'
    ? 'General'
    : (listas.find((l) => l.id === listaPreciosId)?.nombre ?? 'General');
  const numeracionNombre = tipoEcf === '31' ? 'Crédito fiscal'
    : tipoEcf === '32' ? 'Consumo'
    : 'Ticket';

  const unidadesTotales = carrito.reduce((n, c) => n + c.qty, 0);

  /**
   * Cuántas líneas quedan fuera de vista, arriba y abajo.
   *
   * Se cuenta en LÍNEAS y no en píxeles porque «2 líneas más» se entiende de un
   * vistazo y «quedan 130 px» no. La cuenta usa el alto medio de una línea: no
   * hay que ser exacto, hay que no mentir en el orden de magnitud.
   */
  const listaRef = useRef<HTMLDivElement>(null);
  const lineaFlashRef = useRef<HTMLDivElement>(null);
  const [ocultasArriba, setOcultasArriba] = useState(0);
  const [ocultasAbajo, setOcultasAbajo] = useState(0);

  const medirScroll = useCallback(() => {
    const el = listaRef.current;
    if (!el || carrito.length === 0) { setOcultasArriba(0); setOcultasAbajo(0); return; }
    const altoLinea = el.scrollHeight / carrito.length;
    if (altoLinea <= 0) return;
    // Medio renglón de margen: una línea asomando por el borde ya se ve, y
    // anunciarla como oculta haría parpadear la pastilla al desplazarse.
    const arriba = Math.floor((el.scrollTop + altoLinea / 2) / altoLinea);
    const restante = el.scrollHeight - el.scrollTop - el.clientHeight;
    const abajo = Math.floor((restante + altoLinea / 2) / altoLinea);
    setOcultasArriba(Math.max(0, arriba));
    setOcultasAbajo(Math.max(0, abajo));
  }, [carrito.length]);

  useEffect(() => { medirScroll(); }, [medirScroll, carrito]);

  // La línea recién tocada se trae a la vista. Sin esto, agregar el producto
  // número doce lo mandaba a un sitio del carrito que el cajero no está viendo,
  // y el destello se lo perdía entero.
  useEffect(() => {
    if (!flashKey) return;
    lineaFlashRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flashKey]);

  // Gate DGII: sin conexión DGII lista, el POS solo emite tickets sin NCF.
  // Oculta e31/e32 del selector y fuerza sin-ncf si la terminal traía otro
  // default (defensa adicional en /api/ecf/emitir).
  const { ready: dgiiReady, motivo: motivoDgii } = useDgiiReadiness();
  useEffect(() => {
    if (!dgiiReady && tipoEcf !== 'sin-ncf') onSelectTipoEcf('sin-ncf');
  }, [dgiiReady, tipoEcf, onSelectTipoEcf]);

  // Crédito fiscal sin RNC: el cobro está bloqueado y la salida es cargar el
  // comprador. Se abre el panel solo, en vez de dejar «Cambiar» como acertijo.
  useEffect(() => {
    if (tipoEcf === '31' && !cliente?.rnc) setConfigAbierta(true);
  }, [tipoEcf, cliente?.rnc]);

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
    // `height: 100%` + `minHeight: 0` es lo que hace que el panel se ajuste a
    // la pantalla en vez de crecer con el carrito. Sin ellos, con ocho líneas
    // el total y el botón de cobrar se iban por debajo del borde y no había
    // scroll que los alcanzara: el cajero veía la lista y ningún sitio donde
    // cobrar. Lo que se desplaza es la LISTA; la cabecera y el pie se quedan.
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, width: '100%', flexDirection: 'column', overflow: 'hidden', borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 1.5 }}>
      {/* Resumen plegado de la configuración de la venta.
          Lista de precio, Numeración y Cliente se tocan una vez por turno —a
          veces ninguna— y ocupaban un tercio del panel con dos selectores altos
          y un buscador. Plegados en una línea, ese tercio se lo queda el
          carrito: son tres o cuatro líneas más de venta a la vista, que es
          donde el cajero mira. Se abre solo cuando hay que tocar algo. */}
      <Box sx={{ mb: 1, flexShrink: 0, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: '1px solid #e5e7eb', bgcolor: '#fafbff', px: 1.25, minHeight: 44 }}>
        <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#4b5563' }}>
          <Box component="span" sx={{ fontWeight: 600, color: '#111827' }}>{cliente?.razonSocial ?? 'Consumidor Final'}</Box>
          <Box component="span" sx={{ color: '#c7cedd' }}> · </Box>{listaNombre}
          <Box component="span" sx={{ color: '#c7cedd' }}> · </Box>{numeracionNombre}
        </Box>
        <ButtonBase
          onClick={() => setConfigAbierta((v) => !v)}
          sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: '8px', px: 1, minHeight: 36, fontSize: 13, fontWeight: 600, color: '#2a45c4', '&:hover': { bgcolor: '#eef2fe' } }}
        >
          {configAbierta ? <ChevronUp style={{ width: 15, height: 15 }} /> : <Pencil style={{ width: 14, height: 14 }} />}
          {configAbierta ? 'Listo' : 'Cambiar'}
        </ButtonBase>
      </Box>

      <Box sx={{ mb: configAbierta ? 1.5 : 0, flexShrink: 0, display: configAbierta ? 'flex' : 'none', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          <Box>
            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Lista de precio</Typography>
            <TextField
              select
              id="pos-lista-precio"
              value={listaPreciosId}
              onChange={(e) => onSelectLista(e.target.value === 'general' ? 'general' : Number(e.target.value))}
              fullWidth
              sx={{ '& .MuiInputBase-root': { height: 52, fontSize: 16 } }}
            >
              <MenuItem value="general">General (precio base)</MenuItem>
              {listas.map((l) => <MenuItem key={l.id} value={l.id}>{l.nombre}</MenuItem>)}
            </TextField>
          </Box>
          <Box>
            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Numeración</Typography>
            <TextField
              select
              id="pos-numeracion"
              value={tipoEcf}
              onChange={(e) => onSelectTipoEcf(e.target.value)}
              fullWidth
              sx={{ '& .MuiInputBase-root': { height: 52, fontSize: 16 } }}
            >
              <MenuItem value="sin-ncf">Ticket (sin NCF)</MenuItem>
              {dgiiReady && <MenuItem value="32">Consumo (e32)</MenuItem>}
              {dgiiReady && <MenuItem value="31">Crédito fiscal (e31)</MenuItem>}
            </TextField>
            {/* Sin tipos fiscales, decir POR QUÉ: si no, el cajero ve el
                selector con una sola opción y no sabe si es un error. */}
            {!dgiiReady && motivoDgii && (
              <Typography sx={{ mt: 0.75, fontSize: 12, color: '#92400e', lineHeight: 1.35 }}>
                {motivoDgii}
              </Typography>
            )}
          </Box>
        </Box>
        <ClientePicker cliente={cliente} onSelect={onSelectCliente} />
      </Box>

      {/* El RNC del crédito fiscal NO se pliega: sin él no se puede cobrar, y
          esconder el único campo que desbloquea la venta detrás de «Cambiar»
          deja al cajero con un botón apagado y ninguna pista. */}
      <Box sx={{ flexShrink: 0 }}>
        {tipoEcf === '31' && (
          <Box sx={{ mb: 1, borderRadius: '8px', border: '1px solid #fde68a', bgcolor: '#fffbeb', p: 1.25 }}>
            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, fontWeight: 500, color: '#92400e' }}>
              RNC del comprador · obligatorio para crédito fiscal
            </Typography>
            {cliente?.rnc ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: '#78350f' }}>
                  {cliente.rnc} · {cliente.razonSocial}
                </Box>
                <Box component="button" onClick={() => onSelectCliente(null)} sx={{ flexShrink: 0, border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 12, color: '#b45309', textDecoration: 'underline' }}>cambiar</Box>
              </Box>
            ) : (
              <RncSearch
                placeholder="Buscar RNC / cédula o razón social…"
                showSyncHint={false}
                onSelect={(r) => onSelectCliente({ id: 0, razonSocial: r.nombre || 'Sin nombre', rnc: r.rnc, email: null })}
              />
            )}
          </Box>
        )}
      </Box>
      {escolar && <EstudiantePicker estudiante={estudiante} onSelect={onSelectEstudiante} />}
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>
          Carrito{carrito.length > 0 && ` · ${carrito.length} ${carrito.length === 1 ? 'línea' : 'líneas'} · ${unidadesTotales} u.`}
        </Box>
        <ButtonBase
          onClick={() => setPanelDescuento(true)}
          disabled={carrito.length === 0 || bloquearPrecios}
          title={bloquearPrecios ? 'Tu rol no puede aplicar descuentos' : 'Descuentos globales'}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: '9999px', border: '1px solid #e5e7eb', px: 1.25, py: 0.75, fontSize: 12, color: '#6b7280', '&:hover': { bgcolor: '#f9fafb' }, '&.Mui-disabled': { opacity: 0.4 } }}
        >
          <Percent style={{ width: 14, height: 14 }} /> Descuento
        </ButtonBase>
      </Box>
      {/* `minHeight: 0` no es cosmético: sin él un hijo flex se niega a
          encoger por debajo de su contenido, así que la lista empujaba al pie
          fuera de la pantalla en vez de llevarse el scroll. */}
      {/* La lista lleva su propio scroll y el pie no se mueve. Lo que faltaba
          era decir que hay más: una línea cortada por el borde se lee como un
          fallo de pintado, no como «seguí bajando». Las pastillas dicen CUÁNTAS
          quedan y llevan hasta ellas de un toque. */}
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {ocultasArriba > 0 && (
          <ButtonBase
            onClick={() => listaRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            sx={{ position: 'absolute', left: '50%', top: 4, zIndex: 2, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: '9999px', border: '1px solid #dbe2f5', bgcolor: 'rgba(255,255,255,0.96)', px: 1.5, minHeight: 32, fontSize: 12, fontWeight: 600, color: '#2a45c4', boxShadow: 2 }}
          >
            <ChevronUp style={{ width: 14, height: 14 }} />
            {ocultasArriba} {ocultasArriba === 1 ? 'línea arriba' : 'líneas arriba'}
          </ButtonBase>
        )}
        {ocultasAbajo > 0 && (
          <ButtonBase
            onClick={() => listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: 'smooth' })}
            sx={{ position: 'absolute', left: '50%', bottom: 4, zIndex: 2, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: '9999px', border: '1px solid #dbe2f5', bgcolor: 'rgba(255,255,255,0.96)', px: 1.5, minHeight: 32, fontSize: 12, fontWeight: 600, color: '#2a45c4', boxShadow: 2 }}
          >
            <ChevronDown style={{ width: 14, height: 14 }} />
            {ocultasAbajo} {ocultasAbajo === 1 ? 'línea más' : 'líneas más'}
          </ButtonBase>
        )}
        <Box ref={listaRef} onScroll={medirScroll} sx={{ height: '100%', overflow: 'auto' }}>
        {carrito.length === 0 ? (
          <Typography sx={{ py: 4, textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>Toca productos para agregarlos</Typography>
        ) : (
          carrito.map((c) => {
            const desc = descuentoLinea(c, descuentoAplicado);
            const key = lineKey(c);
            const destella = flashKey === key;
            return (
              <LineaCarritoDeslizable
                key={key}
                destella={destella}
                refFlash={destella ? lineaFlashRef : undefined}
                /* La señal de «quitar» la emite fijarQty: si se disparara
                   también aquí sonaría dos veces por un solo gesto. */
                onBorrar={() => fijarQty(key, 0)}
              >
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
                  borderBottom: '1px solid #f3f4f6', py: 1.75, px: 0.75, mx: -0.75, borderRadius: '8px',
                  bgcolor: destella ? '#dbeafe' : 'transparent',
                  transition: destella ? 'none' : 'background-color .45s ease-out',
                }}
              >
                <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
                  <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 600 }}>{c.nombre}</Box>
                  <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 15, color: '#9ca3af' }}>
                    <PrecioEditable linea={c} onEditar={(cents) => editarPrecio(key, cents)} bloqueado={bloquearPrecios} />
                    {desc > 0 && <Box component="span" sx={{ color: '#059669' }}>−{descuentoAplicado!.pct}%</Box>}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1.25 }}>
                  <ButtonBase onClick={() => cambiarQty(key, -1)} sx={{ display: 'flex', height: 52, width: 52, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 28, color: '#4b5563', '&:active': { bgcolor: '#f9fafb' } }}>−</ButtonBase>
                  <CantidadEditable qty={c.qty} nombre={c.nombre} onFijar={(n) => fijarQty(key, n)} />
                  <ButtonBase onClick={() => cambiarQty(key, 1)} sx={{ display: 'flex', height: 52, width: 52, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 28, color: '#4b5563', '&:active': { bgcolor: '#f9fafb' } }}>+</ButtonBase>
                </Box>
              </Box>
              </LineaCarritoDeslizable>
            );
          })
        )}
        </Box>
      </Box>

      {/* El pie —totales y Cobrar— nunca se desplaza ni se encoge: es lo que
          el cajero necesita tener siempre a mano, con dos ítems o con veinte. */}
      <Box sx={{ mt: 1.5, flexShrink: 0, borderTop: '1px solid #f3f4f6', pt: 1.5 }}>
        {descuentoAplicado && (
          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px', bgcolor: '#ecfdf5', px: 1.25, py: 0.75, fontSize: 12, color: '#047857' }}>
            <Box component="span">Descuento {descuentoAplicado.pct}% ({descuentoAplicado.ids.size} {descuentoAplicado.ids.size === 1 ? 'ítem' : 'ítems'})</Box>
            <Box component="button" onClick={() => onAplicarDescuento(null)} sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', color: 'inherit', fontWeight: 500, textDecoration: 'underline' }}>quitar</Box>
          </Box>
        )}
        <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}><Box component="span">Subtotal</Box><Box component="span" sx={MONEY}>{fmt(totales.subtotal + totales.descuentoTotal)}</Box></Box>
        {totales.descuentoTotal > 0 && (
          <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#059669' }}><Box component="span">Descuento</Box><Box component="span" sx={MONEY}>−{fmt(totales.descuentoTotal)}</Box></Box>
        )}
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}><Box component="span">ITBIS</Box><Box component="span" sx={MONEY}>{fmt(totales.itbis)}</Box></Box>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><Box component="span" sx={{ fontSize: 20, fontWeight: 700 }}>Total</Box><Box component="span" sx={{ fontSize: 30, fontWeight: 800, ...MONEY }}>{fmt(totales.total)}</Box></Box>
        {tipoEcf === '31' && !cliente?.rnc && carrito.length > 0 && (
          <Typography sx={{ mb: 1, textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#d97706' }}>Carga el RNC del comprador para el crédito fiscal</Typography>
        )}
        {/* Bloqueado mientras se cobra. Aunque el modal ahora se queda
            encima, el botón sigue existiendo debajo: dejarlo tocable era una
            de las puertas por las que se colaba una segunda venta. */}
        <Button
          disabled={cobrando || carrito.length === 0 || (tipoEcf === '31' && !cliente?.rnc)}
          onClick={() => setAbrirCobro(true)}
          variant="contained"
          fullWidth
          disableElevation
          sx={{ borderRadius: '14px', bgcolor: '#10b981', py: 2.5, fontSize: 22, fontWeight: 700, color: '#fff', gap: 1.5, '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' }, ...MONEY }}
        >
          {cobrando
            ? <><CircularProgress size={22} thickness={5} sx={{ color: '#fff' }} />Cobrando…</>
            : `Cobrar ${fmt(totales.total)}`}
        </Button>
      </Box>

      {abrirCobro && (
        <CobroModal
          alertaMetodoPago={alertaMetodoPago}
          total={totales.total}
          cobrando={cobrando}
          estudiante={estudiante}
          cliente={cliente}
          enMesa={enMesa}
          onClose={() => setAbrirCobro(false)}
          /* El modal NO se cierra al confirmar: se queda con el «Cobrando…»
             y solo se va cuando la venta está emitida. Cerrarlo antes dejaba
             al cajero mirando el carrito lleno y un botón de cobrar activo,
             sin saber si la venta había pasado — y tocándolo otra vez. Si
             falla, se queda abierto para reintentar sin rehacer el cobro. */
          onConfirm={async (pagos, recibido, propina, tipoOrden) => {
            const ok = await onCobrar(pagos, recibido, propina, tipoOrden);
            if (ok) setAbrirCobro(false);
          }}
        />
      )}
    </Box>
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
  const [seleccion, setSeleccion] = useState<Set<string>>(aplicado?.ids ?? new Set(carrito.map((c) => lineKey(c))));

  function toggle(key: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleTodos() {
    setSeleccion((prev) => (prev.size === carrito.length ? new Set() : new Set(carrito.map((c) => lineKey(c)))));
  }

  const pctNum = Number(pct);
  const puedeAplicar = pctNum > 0 && pctNum <= 100 && seleccion.size > 0;

  return (
    <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 1.5 }}>
      <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Descuentos globales</Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
      </Box>
      <Typography sx={{ mb: 1.5, fontSize: 12, color: '#6b7280' }}>Añade descuentos a los ítems de esta venta de forma rápida.</Typography>

      <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Porcentaje</Typography>
      <TextField
        type="number"
        value={pct}
        onChange={(e) => setPct(e.target.value)}
        placeholder="0"
        fullWidth
        slotProps={{
          input: { endAdornment: <InputAdornment position="end" sx={{ color: '#9ca3af' }}>%</InputAdornment> },
          htmlInput: { min: 0, max: 100, step: 1 },
        }}
        sx={{ mb: 1.5 }}
      />

      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', pb: 1, fontSize: 12, color: '#6b7280' }}>
        <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
          <Checkbox checked={seleccion.size === carrito.length && carrito.length > 0} onChange={toggleTodos} size="small" sx={{ p: 0 }} />
          Seleccionar todo
        </Box>
        <Box component="span">{carrito.length} productos</Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {carrito.map((c) => (
          <Box component="label" key={lineKey(c)} sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f9fafb', py: 1 }}>
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox checked={seleccion.has(lineKey(c))} onChange={() => toggle(lineKey(c))} size="small" sx={{ p: 0 }} />
              <Box component="span" sx={{ fontSize: 14 }}>{c.nombre}</Box>
            </Box>
            <Box component="span" sx={{ textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
              <Box sx={MONEY}>{fmt(c.precio * c.qty)}</Box>
              <Box sx={{ color: '#059669', ...MONEY }}>
                {seleccion.has(lineKey(c)) && pctNum > 0 ? `−${fmt(Math.round(c.precio * c.qty * pctNum / 100))}` : '--'}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      <Button
        disabled={!puedeAplicar}
        onClick={() => onAplicar({ pct: pctNum, ids: seleccion })}
        variant="contained" color="primary" fullWidth
        sx={{ mt: 1.5, py: 1.5, fontWeight: 500, '&.Mui-disabled': { opacity: 0.4 } }}
      >
        Aplicar descuento
      </Button>
    </Box>
  );
}

// ─── Selector de cliente (opcional; default Consumidor Final) ───────────────

function ClientePicker({ cliente, onSelect }: {
  cliente: ClienteView | null;
  onSelect: (c: ClienteView | null) => void;
}) {
  const [q, setQ] = useState('');
  const [iniciales, setIniciales] = useState<ClienteView[]>([]);
  const [resultados, setResultados] = useState<ClienteView[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Carga inicial acotada (primeros 100) para poder abrir el dropdown y ojear
  // sin escribir. Antes traía la tabla COMPLETA de clientes en cada apertura.
  const cargarIniciales = useCallback(() => {
    void traerJson<{ clientes?: ClienteView[] }>('/api/clientes?limit=100')
      .then((d) => setIniciales(d?.clientes ?? []));
  }, []);

  useEffect(() => { cargarIniciales(); }, [cargarIniciales]);

  // Búsqueda server-side al tipear (índice trigram): encuentra cualquier cliente,
  // no solo los primeros 100. Debounce 300ms.
  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2) { setResultados([]); return; }
    const t = setTimeout(() => {
      void traerJson<{ clientes?: ClienteView[] }>(`/api/clientes?q=${encodeURIComponent(qq)}&limit=50`)
        .then((d) => setResultados(d?.clientes ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sin texto → lista inicial; con texto → resultados del servidor.
  const filtrados = q.trim().length >= 2 ? resultados : iniciales;

  if (cliente) {
    return (
      <Box sx={{ mb: 1, borderRadius: '8px', bgcolor: '#f9fafb', px: 1.5, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{cliente.razonSocial}</Box>
          <Box component="button" onClick={() => onSelect(null)} sx={{ flexShrink: 0, border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 12, color: '#2a45c4' }}>quitar</Box>
        </Box>
        {cliente.rnc && <Box sx={{ fontSize: 11, color: '#9ca3af' }}>RNC: {cliente.rnc}</Box>}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', mb: 1 }} ref={wrapperRef}>
      <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Cliente</Typography>
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        placeholder="Consumidor Final (elige o busca)…"
        fullWidth
        sx={{ '& .MuiInputBase-root': { height: 44 } }}
      />
      {abierto && (
        <Box sx={{ position: 'absolute', zIndex: 10, mt: 0.5, maxHeight: 224, width: '100%', overflow: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff', boxShadow: 3 }}>
          <Box component="button" onClick={() => { onSelect(null); setQ(''); setAbierto(false); }}
            sx={{ display: 'flex', width: '100%', alignItems: 'center', border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 1, textAlign: 'left', fontSize: 14, color: '#6b7280', '&:hover': { bgcolor: '#f9fafb' } }}>
            Consumidor Final
          </Box>
          {filtrados.length === 0 ? (
            <Typography sx={{ px: 1.5, py: 1, fontSize: 12, color: '#9ca3af' }}>Sin clientes registrados</Typography>
          ) : (
            filtrados.map((r) => (
              <Box component="button" key={r.id} onClick={() => { onSelect(r); setQ(''); setAbierto(false); }}
                sx={{ display: 'block', width: '100%', border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 1, textAlign: 'left', fontSize: 14, '&:hover': { bgcolor: '#f9fafb' } }}>
                <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                  <Box component="span" title={r.razonSocial} sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.razonSocial}</Box>
                  <Box component="span" sx={{ flexShrink: 0, fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' }}>{r.rnc ?? '—'}</Box>
                </Box>
                {!!r.dependientes?.length && (
                  <Box component="span" sx={{ display: 'block', mt: 0.5, pt: 0.5, borderTop: '1px solid #e5e7eb' }}>
                    {r.dependientes.map((d) => (
                      <Box component="span" key={d} title={d} sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#2563eb' }}>{d}</Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))
          )}
          <Box component="button"
            onClick={() => { setAbierto(false); setNuevoAbierto(true); }}
            sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 0.75, borderTop: '1px solid #f3f4f6', border: 'none', borderTopColor: '#f3f4f6', bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 1, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#3658e1', '&:hover': { bgcolor: '#eef2fe' } }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Nuevo cliente
          </Box>
        </Box>
      )}
      {nuevoAbierto && (
        <ClienteDialog
          open
          nombreInicial={q}
          onClose={() => setNuevoAbierto(false)}
          onCreated={(c) => { setNuevoAbierto(false); setQ(''); cargarIniciales(); onSelect(c); }}
        />
      )}
    </Box>
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
        <Box sx={{ mb: 1, borderRadius: '8px', bgcolor: '#eef2fe', px: 1.5, py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box component="span" sx={{ fontSize: 14, fontWeight: 500, color: '#253a9e' }}>{estudiante.nombre}</Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box component="button" onClick={() => setGestion(true)} sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 12, color: '#2a45c4', textDecoration: 'underline' }}>saldo</Box>
              <Box component="button" onClick={() => onSelect(null)} sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 12, color: '#2a45c4' }}>quitar</Box>
            </Box>
          </Box>
          <Box sx={{ mt: 0.25, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#2a45c4' }}>
            <Box component="span" sx={MONEY}>Saldo: {fmt(estudiante.saldoCentavos)}</Box>
            <Box component="span" sx={MONEY}>{limiteTxt}</Box>
          </Box>
        </Box>
        {gestion && (
          <MonederoModal estudiante={estudiante} onClose={() => setGestion(false)} onUpdated={onSelect} />
        )}
      </>
    );
  }

  return (
    <Box sx={{ position: 'relative', mb: 1 }}>
      <TextField
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Estudiante (opcional)…"
        fullWidth
      />
      {resultados.length > 0 && (
        <Box sx={{ position: 'absolute', zIndex: 10, mt: 0.5, maxHeight: 192, width: '100%', overflow: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff', boxShadow: 3 }}>
          {resultados.map((r) => (
            <Box component="button" key={r.dependienteId} onClick={() => elegir(r.dependienteId)}
              sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 1, textAlign: 'left', fontSize: 14, '&:hover': { bgcolor: '#f9fafb' } }}>
              <Box component="span">{r.nombre}</Box>
              <Box component="span" sx={{ fontSize: 12, color: '#9ca3af', ...MONEY }}>{fmt(r.saldoCentavos)}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Modal de cobro ──────────────────────────────────────────────────────────

function CobroModal({
  total, cobrando, estudiante, cliente, alertaMetodoPago, enMesa = false, onClose, onConfirm,
}: {
  total: number;
  cobrando: boolean;
  /** Si está activa, pide reconfirmar el método antes de finalizar. */
  alertaMetodoPago: boolean;
  estudiante: MonederoView | null;
  /** Necesario para el fiado: sin alguien a quien cobrarle no hay crédito. */
  cliente: ClienteView | null;
  /** true si se cobra desde una mesa (comanda) → ofrece "Comer aquí". */
  enMesa?: boolean;
  onClose: () => void;
  onConfirm: (pagos: { metodo: MetodoCobro; valorCentavos: number }[], recibidoCentavos: number, propinaCentavos: number, tipoOrden: TipoOrden) => void | Promise<void>;
}) {
  const [propina, setPropina] = useState('');
  /** El campo de propina solo aparece si se pide: casi ninguna venta lleva. */
  const [propinaAbierta, setPropinaAbierta] = useState(false);
  const [split, setSplit] = useState(false);
  /**
   * Cobro a la espera de que se reconfirme el método.
   *
   * Cobrar efectivo apuntándolo como tarjeta descuadra el cierre de caja y no
   * se nota hasta el arqueo, cuando ya nadie recuerda cuál venta fue.
   */
  const [pendienteConfirm, setPendienteConfirm] = useState<
    null | { pagos: { metodo: MetodoCobro; valorCentavos: number }[]; recibidoCentavos: number }
  >(null);

  // Tipo de orden: por defecto "Comer aquí" en mesa, "Mostrador" en venta rápida.
  const opcionesTipoOrden = tiposOrdenPara(enMesa);
  const [tipoOrden, setTipoOrden] = useState<TipoOrden>(opcionesTipoOrden[0]);

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
  const esCredito  = metodo === 'credito' && !split;
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

  /**
   * Una tecla del teclado numérico sobre «efectivo recibido».
   *
   * Se escribe la cadena tal cual en vez de acumular centavos: teclear «5» y
   * ver 0.05 desconcierta a quien está cobrando 50 pesos. Se corta a dos
   * decimales y se impide un segundo punto —lo único que puede dejar el campo
   * en un número que no existe.
   */
  function teclear(k: string) {
    setRecibido((prev) => {
      if (k === '⌫') return prev.slice(0, -1);
      const siguiente = prev + k;
      const [, dec] = siguiente.split('.');
      if ((siguiente.match(/\./g)?.length ?? 0) > 1) return prev;
      if (dec != null && dec.length > 2) return prev;
      // Sin ceros a la izquierda: «007» no es una cantidad.
      return siguiente.replace(/^0+(?=\d)/, '');
    });
  }

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

  /**
   * Con la alerta encendida abre el doble-check; apagada, cobra directo.
   *
   * El crédito y el monedero no pasan por aquí: no hay método que confundir.
   */
  function pedirOFinalizar(
    pagos: { metodo: MetodoCobro; valorCentavos: number }[],
    recibidoCentavos: number,
  ) {
    // El tipo de orden viaja hasta el final por los dos caminos. Si se quedara
    // fuera del que pasa por el doble-check, reconfirmar el método convertiría
    // un "para llevar" en lo que diga el valor por defecto — y eso cambia el
    // recibo que se imprime.
    if (alertaMetodoPago) setPendienteConfirm({ pagos, recibidoCentavos });
    else onConfirm(pagos, recibidoCentavos, propinaCentavos, tipoOrden);
  }

  function confirmar() {
    if (split) {
      if (!splitCuadra) return;
      const pagos = filas
        .map((f) => ({ metodo: f.metodo as MetodoCobro, valorCentavos: Math.round((Number(f.valor) || 0) * 100) }))
        .filter((p) => p.valorCentavos > 0);
      pedirOFinalizar(pagos, totalCobrar);
      return;
    }
    if (esMonedero) {
      onConfirm([{ metodo: 'cuenta-estudiante', valorCentavos: totalCobrar }], totalCobrar, propinaCentavos, tipoOrden);
      return;
    }
    // Crédito: se confirma SIN pagos. El motor calcula estado_pago = PENDIENTE
    // y el documento entra a la cartera.
    if (esCredito) {
      onConfirm([], 0, propinaCentavos, tipoOrden);
      return;
    }
    const recibidoOut = metodo === 'efectivo' ? recibidoCentavos : totalCobrar;
    pedirOFinalizar([{ metodo, valorCentavos: totalCobrar }], recibidoOut);
  }

  const puedeConfirmar = !cobrando && (split ? splitCuadra : (!faltaEfectivo && !monederoBloqueado));

  /**
   * En el teléfono es una hoja a pantalla completa, no un diálogo centrado.
   *
   * Antes había que recorrer todo —total, tipo de orden, propina, dividido,
   * métodos, efectivo, atajos— para llegar al botón de confirmar, que quedaba
   * por debajo del borde. En una caja eso es un cliente esperando mientras
   * alguien busca el botón con el pulgar.
   *
   * Tres zonas: la cabecera con el total y el pie con el botón se quedan
   * clavados; solo se desplaza lo de en medio. Así el importe que se cobra y la
   * acción que lo cobra están SIEMPRE a la vista, con dos opciones o con ocho.
   */
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth={false}
      slotProps={{ paper: { sx: {
        maxWidth: { xs: '100%', sm: 560 },
        width: { xs: '100%', sm: 'auto' },
        height: { xs: '100%', sm: 'auto' },
        maxHeight: { xs: '100%', sm: '94vh' },
        m: { xs: 0, sm: 2 },
        borderRadius: { xs: 0, sm: '16px' },
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      } } }}
    >
      {/* ── Cabecera fija: qué se cobra y cuánto ── */}
      <Box sx={{ flexShrink: 0, borderBottom: '1px solid #f3f4f6', px: { xs: 2, sm: 3 }, pt: { xs: 1.5, sm: 2.5 }, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box component="span" sx={{ fontSize: 17, fontWeight: 700 }}>Cobrar venta</Box>
          <IconButton onClick={onClose} sx={{ color: '#9ca3af', mr: -1 }}><X style={{ width: 22, height: 22 }} /></IconButton>
        </Box>
        {/* El importe en UNA línea y sin partirse: a 34px el «RD$» se caía a un
            renglón propio en el teléfono y el total parecía otro número. */}
        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
          <Box component="span" sx={{ flexShrink: 0, fontSize: 13, color: '#6b7280' }}>Total a cobrar</Box>
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: { xs: 26, sm: 30 }, fontWeight: 800, ...MONEY }}>
            {fmt(totalCobrar)}
          </Box>
        </Box>
        {propinaCentavos > 0 && (
          <Box sx={{ mt: 0.25, textAlign: 'right', fontSize: 12, color: '#9ca3af', ...MONEY }}>Incluye propina {fmt(propinaCentavos)}</Box>
        )}
      </Box>

      {/* ── Cuerpo: lo único que se desplaza ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}>
        {/* Tipo de orden (operativo, no fiscal) — clasifica el recibo en el
            historial. Con una sola opción no hay nada que elegir: se calla. */}
        {opcionesTipoOrden.length > 1 && (
          <Box sx={{ mb: 1.5, display: 'flex', gap: 0.75 }}>
            {opcionesTipoOrden.map((t) => (
              <Button
                key={t}
                onClick={() => setTipoOrden(t)}
                disableElevation
                variant={tipoOrden === t ? 'contained' : 'outlined'}
                sx={{
                  flex: 1, textTransform: 'none', borderRadius: '10px', fontSize: 14, fontWeight: 600, minHeight: 44, py: 0.75, minWidth: 0,
                  ...(tipoOrden === t
                    ? { bgcolor: '#10b981', color: '#fff', '&:hover': { bgcolor: '#059669' } }
                    : { color: '#374151', borderColor: '#d1d5db' }),
                }}
              >
                {TIPO_ORDEN_LABEL[t]}
              </Button>
            ))}
          </Box>
        )}

        {/* Propina y pago dividido: dos fichas, no dos bloques.
            Casi ninguna venta lleva propina y casi ninguna se divide, y entre
            las dos ocupaban 140px por encima de los métodos de pago — que es lo
            que de verdad hay que tocar. La propina se abre solo si se pide. */}
        <Box sx={{ mb: 2, display: 'flex', gap: 0.75 }}>
          <ButtonBase
            onClick={() => setPropinaAbierta((v) => !v)}
            sx={{
              flex: 1, minHeight: 44, gap: 0.75, borderRadius: '10px', border: '1px solid', fontSize: 14, fontWeight: 600,
              borderColor: propinaCentavos > 0 ? '#10b981' : '#e5e7eb',
              bgcolor: propinaCentavos > 0 ? '#f0fdf4' : 'transparent',
              color: propinaCentavos > 0 ? '#15803d' : '#6b7280',
            }}
          >
            <Plus style={{ width: 15, height: 15 }} />
            {propinaCentavos > 0 ? `Propina ${fmt(propinaCentavos)}` : 'Propina'}
          </ButtonBase>
          <ButtonBase
            onClick={() => setSplit((v) => !v)}
            sx={{
              flex: 1, minHeight: 44, gap: 0.75, borderRadius: '10px', border: '1px solid', fontSize: 14, fontWeight: 600,
              borderColor: split ? '#3658e1' : '#e5e7eb',
              bgcolor: split ? '#eef2fe' : 'transparent',
              color: split ? '#2a45c4' : '#6b7280',
            }}
          >
            <ArrowLeftRight style={{ width: 15, height: 15 }} />
            Dividir pago
          </ButtonBase>
        </Box>

        {(propinaAbierta || propinaCentavos > 0) && (
          <TextField
            type="number"
            value={propina}
            onChange={(e) => setPropina(e.target.value)}
            placeholder="0.00"
            label="Propina"
            fullWidth
            slotProps={{
              input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
              htmlInput: { min: 0, step: 0.01 },
            }}
            sx={{ mb: 2 }}
          />
        )}

        {!split ? (
          <>
            <Box sx={{ mb: 2, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              {METODOS.map((m) => {
                const Ico = METODO_ICONO[m];
                return (
                  <ButtonBase
                    key={m}
                    onClick={() => setMetodo(m)}
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                      borderRadius: '14px', border: '1px solid', minHeight: 72, px: 0.5, py: 1, fontWeight: 600, textTransform: 'capitalize',
                      // «Transferencia» no cabe a 14px en un tercio del ancho y
                      // se salía de su tarjeta: se encoge solo esa palabra.
                      fontSize: m.length > 9 ? 12.5 : 14, lineHeight: 1.2, textAlign: 'center',
                      borderColor: metodo === m ? '#3658e1' : '#e5e7eb',
                      bgcolor: metodo === m ? '#eef2fe' : 'transparent',
                      color: metodo === m ? '#2a45c4' : '#4b5563',
                      '&:active': { transform: 'scale(0.97)' },
                    }}
                  >
                    <Ico style={{ width: 24, height: 24 }} />
                    {m}
                  </ButtonBase>
                );
              })}
            </Box>

            {estudiante && (
              <ButtonBase
                onClick={() => setMetodo('cuenta-estudiante')}
                sx={{
                  mb: 1.5, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  borderRadius: '8px', border: '1px solid', px: 1.5, py: 1, fontSize: 14,
                  borderColor: metodo === 'cuenta-estudiante' ? '#3658e1' : '#e5e7eb',
                  bgcolor: metodo === 'cuenta-estudiante' ? '#eef2fe' : 'transparent',
                  color: metodo === 'cuenta-estudiante' ? '#2a45c4' : '#4b5563',
                }}
              >
                <Box component="span">Cuenta de {estudiante.nombre}</Box>
                <Box component="span" sx={{ fontSize: 12, ...MONEY }}>saldo {fmt(estudiante.saldoCentavos)}</Box>
              </ButtonBase>
            )}

            {(cliente || estudiante) && (
              <ButtonBase
                onClick={() => setMetodo('credito')}
                sx={{
                  mb: 1.5, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  borderRadius: '8px', border: '1px solid', px: 1.5, py: 1, fontSize: 14,
                  borderColor: metodo === 'credito' ? '#3658e1' : '#e5e7eb',
                  bgcolor: metodo === 'credito' ? '#eef2fe' : 'transparent',
                  color: metodo === 'credito' ? '#2a45c4' : '#4b5563',
                }}
              >
                <Box component="span">A crédito (fiado)</Box>
                <Box component="span" sx={{ fontSize: 12 }}>queda en cuentas por cobrar</Box>
              </ButtonBase>
            )}

            {esCredito && (
              <Box sx={{ mb: 1.5, borderRadius: '8px', bgcolor: '#fffbeb', px: 1.5, py: 1, fontSize: 12, color: '#92400e' }}>
                Se registra la venta sin cobrar. Queda como deuda de{' '}
                {estudiante?.nombre ?? cliente?.razonSocial} en cuentas por cobrar.
              </Box>
            )}

            {monederoBloqueado && (
              <Box sx={{ mb: 1.5, borderRadius: '8px', bgcolor: '#fef2f2', px: 1.5, py: 1, fontSize: 12, color: '#b91c1c' }}>
                {saldoCorto ? 'Saldo insuficiente en el monedero.' : 'Excede el límite diario del estudiante.'}
              </Box>
            )}

            {metodo === 'efectivo' && (
              <>
                <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Efectivo recibido</Typography>
                <TextField
                  type="number"
                  value={recibido}
                  autoFocus
                  onChange={(e) => setRecibido(e.target.value)}
                  fullWidth
                  slotProps={{
                    input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
                    htmlInput: { min: 0, step: 0.01 },
                  }}
                  sx={{ mb: 1, '& input': { fontSize: 18, py: 1.25 } }}
                />
                {/* Montos rápidos: exacto + redondeos comunes de billetes.
                    Sin el «RD$» en cada botón: el campo de arriba ya lo dice y
                    repetirlo tres veces obligaba a partir el número en dos
                    renglones en un teléfono. */}
                <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                  {montosRapidos(totalCobrar).map((mc) => (
                    <ButtonBase
                      key={mc}
                      onClick={() => setRecibido((mc / 100).toFixed(2))}
                      sx={{
                        borderRadius: '10px', border: '1px solid', minHeight: 48, fontSize: 15, fontWeight: 700, ...MONEY,
                        borderColor: recibidoCentavos === mc ? '#3658e1' : '#e5e7eb',
                        bgcolor: recibidoCentavos === mc ? '#eef2fe' : 'transparent',
                        color: recibidoCentavos === mc ? '#2a45c4' : '#4b5563',
                      }}
                    >
                      {fmt(mc).replace('RD$', '').trim()}
                    </ButtonBase>
                  ))}
                </Box>
                {/* Teclado propio.
                    En una tableta, tocar el campo levanta el teclado del sistema
                    y se come media pantalla —justo la mitad donde están los
                    métodos y el botón de cobrar—, así que hay que bajarlo para
                    seguir. Con teclas dentro del diálogo no aparece nunca y las
                    cifras se escriben con el pulgar, que es como se cobra de
                    pie. El campo sigue aceptando el teclado físico: en el
                    mostrador con computadora eso es más rápido. */}
                <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                  {(['1','2','3','4','5','6','7','8','9','00','0','⌫'] as const).map((k) => (
                    <ButtonBase
                      key={k}
                      onClick={() => teclear(k)}
                      aria-label={k === '⌫' ? 'Borrar' : k}
                      sx={{
                        minHeight: 52, borderRadius: '10px', border: '1px solid #e5e7eb',
                        fontSize: k === '⌫' ? 18 : 20, fontWeight: 700,
                        color: k === '⌫' ? '#b91c1c' : '#111827',
                        '&:active': { bgcolor: '#eef2fe', transform: 'scale(0.97)' },
                        ...MONEY,
                      }}
                    >
                      {k}
                    </ButtonBase>
                  ))}
                </Box>
                {recibidoCentavos > 0 && !faltaEfectivo && (
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', borderRadius: '8px', bgcolor: '#f0fdf4', p: 1.5, color: '#15803d' }}>
                    <Box component="span" sx={{ fontSize: 14 }}>Cambio</Box>
                    <Box component="span" sx={{ fontWeight: 500, ...MONEY }}>{fmt(cambio)}</Box>
                  </Box>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Box sx={{ mb: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {filas.map((f, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    select
                    value={f.metodo}
                    onChange={(e) => setFilaMetodo(i, e.target.value as Metodo)}
                    sx={{ minWidth: 132, '& .MuiInputBase-root': { height: 52, fontSize: 15 }, '& .MuiSelect-select': { textTransform: 'capitalize' } }}
                  >
                    {METODOS.map((m) => <MenuItem key={m} value={m} sx={{ textTransform: 'capitalize', fontSize: 15, py: 1.25 }}>{m}</MenuItem>)}
                  </TextField>
                  <TextField
                    type="number"
                    value={f.valor}
                    onChange={(e) => setFilaValor(i, e.target.value)}
                    placeholder="0.00"
                    sx={{ flex: 1, '& .MuiInputBase-root': { height: 52 }, '& input': { fontSize: 16 } }}
                    slotProps={{
                      input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
                      htmlInput: { min: 0, step: 0.01 },
                    }}
                  />
                  <ButtonBase onClick={() => autollenarResto(i)} title="Completar el resto"
                    sx={{ flexShrink: 0, borderRadius: '10px', border: '1px solid #e5e7eb', minWidth: 56, height: 52, fontSize: 14, fontWeight: 600, color: '#6b7280', '&:hover': { bgcolor: '#f9fafb' } }}>resto</ButtonBase>
                  {filas.length > 2 && (
                    <Box component="button" onClick={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))}
                      sx={{ flexShrink: 0, border: 'none', bgcolor: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 52, color: '#d1d5db', '&:hover': { color: '#ef4444' } }}><X style={{ width: 20, height: 20 }} /></Box>
                  )}
                </Box>
              ))}
            </Box>
            <ButtonBase
              onClick={() => setFilas((prev) => [...prev, { metodo: 'transferencia', valor: '' }])}
              sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, width: '100%', minHeight: 48, borderRadius: '10px', border: '1px dashed #c7d2fe', fontSize: 15, fontWeight: 600, color: '#3658e1', '&:hover': { bgcolor: '#eef2fe' } }}
            >
              <Plus style={{ width: 18, height: 18 }} /> Agregar método
            </ButtonBase>
            <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '10px', px: 1.75, py: 1.5, fontSize: 15, fontWeight: 600, bgcolor: splitCuadra ? '#f0fdf4' : '#fffbeb', color: splitCuadra ? '#15803d' : '#b45309' }}>
              <Box component="span">{splitCuadra ? 'Cuadra' : (restanteSplit > 0 ? 'Falta' : 'Sobra')}</Box>
              <Box component="span" sx={{ fontWeight: 700, fontSize: 17, ...MONEY }}>{fmt(Math.abs(restanteSplit))}</Box>
            </Box>
          </>
        )}

      </Box>

      {/* ── Pie fijo: el botón nunca se va por debajo del borde ── */}
      <Box sx={{ flexShrink: 0, borderTop: '1px solid #f3f4f6', px: { xs: 2, sm: 3 }, pt: 1.5, pb: { xs: 2, sm: 2.5 } }}>
        <Button
          disabled={!puedeConfirmar}
          onClick={confirmar}
          variant="contained"
          fullWidth
          disableElevation
          sx={{ borderRadius: '14px', bgcolor: '#10b981', minHeight: 56, fontSize: 18, fontWeight: 700, textTransform: 'none', color: '#fff', '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' } }}
        >
          {cobrando ? <><CircularProgress size={20} thickness={5} sx={{ color: '#fff', mr: 1.5 }} />Cobrando…</>
            : split ? (splitCuadra ? 'Confirmar venta' : 'El pago no cuadra')
            : faltaEfectivo ? 'Efectivo insuficiente'
            : monederoBloqueado ? (saldoCorto ? 'Saldo insuficiente' : 'Excede límite diario')
            : 'Confirmar venta'}
        </Button>
      </Box>

      {pendienteConfirm && (
        <ConfirmarMetodoPagoDialog
          lineas={pendienteConfirm.pagos.map<ResumenMetodo>((pg) => ({
            label: labelMetodo(pg.metodo),
            montoFmt: fmt(pg.valorCentavos),
          }))}
          procesando={cobrando}
          onCancel={() => setPendienteConfirm(null)}
          onConfirm={() => {
            const pend = pendienteConfirm;
            setPendienteConfirm(null);
            onConfirm(pend.pagos, pend.recibidoCentavos, propinaCentavos, tipoOrden);
          }}
        />
      )}
    </Dialog>
  );
}

// ─── Ajustes de la caja (vista + aviso) ──────────────────────────────────────

/**
 * Un solo botón para «cómo se ve y cómo suena esta caja».
 *
 * Antes eran dos botones fijos —cuadrícula y lista— comiendo sitio en la fila de
 * categorías, que es la que no puede partirse en dos renglones. Un botón que
 * abre un panel ocupa la mitad y cabe todo lo demás: el volumen, que no tenía
 * dónde vivir, y la vibración.
 *
 * Todo se guarda en el navegador, por aparato. La caja de la cafetería y la de
 * administración entran con la misma cuenta y no quieren lo mismo.
 */
function AjustesCaja({
  densidad, onDensidad, escala, escalas, onEscala,
  prefs, onPrefs, onVolumen, nivel, nivelMaximo, conVibracion,
}: {
  densidad: 'grid' | 'lista';
  onDensidad: (d: 'grid' | 'lista') => void;
  escala: number;
  escalas: readonly number[];
  onEscala: (d: 1 | -1) => void;
  prefs: PrefsFeedback;
  onPrefs: (p: Partial<PrefsFeedback>) => void;
  onVolumen: (d: 1 | -1) => void;
  nivel: number;
  nivelMaximo: number;
  conVibracion: boolean;
}) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const mudo = !prefs.sonido || nivel === 0;

  return (
    <>
      <ButtonBase
        onClick={(e) => setAncla(e.currentTarget)}
        title="Vista y avisos de la caja"
        aria-label="Vista y avisos de la caja"
        sx={{
          position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5,
          height: 44, px: 1.25, borderRadius: '10px', border: '1px solid #e5e7eb', color: '#4b5563',
          '&:hover': { borderColor: '#8193f5', bgcolor: '#f5f7ff' },
        }}
      >
        {densidad === 'grid'
          ? <LayoutGrid style={{ width: 18, height: 18 }} />
          : <Rows3 style={{ width: 18, height: 18 }} />}
        <ChevronDown style={{ width: 14, height: 14, opacity: 0.6 }} />
        {/* Punto rojo cuando el aviso está mudo: si no, apagarlo sin querer se
            descubre media hora después, cuando ya se facturó de más. */}
        {mudo && (
          <Box component="span" sx={{ position: 'absolute', right: 6, top: 6, height: 6, width: 6, borderRadius: '9999px', bgcolor: '#ef4444' }} />
        )}
      </ButtonBase>

      <Menu
        anchorEl={ancla}
        open={Boolean(ancla)}
        onClose={() => setAncla(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 268, borderRadius: '12px', mt: 0.5, p: 1 } } }}
      >
        <Box sx={{ px: 1, pb: 0.75, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: '#9ca3af' }}>VISTA</Box>
        <Box sx={{ display: 'flex', gap: 0.75, px: 0.5, pb: 1 }}>
          {([
            { modo: 'grid'  as const, Icono: LayoutGrid, texto: 'Cuadrícula' },
            { modo: 'lista' as const, Icono: Rows3,      texto: 'Lista' },
          ]).map(({ modo, Icono, texto }) => (
            <ButtonBase
              key={modo}
              onClick={() => onDensidad(modo)}
              aria-pressed={densidad === modo}
              sx={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5, py: 1, borderRadius: '10px',
                border: '1px solid', fontSize: 12.5, fontWeight: 600,
                borderColor: densidad === modo ? '#3658e1' : '#e5e7eb',
                bgcolor:     densidad === modo ? '#eef2fe' : 'transparent',
                color:       densidad === modo ? '#2a45c4' : '#6b7280',
              }}
            >
              <Icono style={{ width: 18, height: 18 }} />
              {texto}
            </ButtonBase>
          ))}
        </Box>

        <Divider sx={{ my: 0.75 }} />

        {/* Tamaño de la mercancía a la vista. No toca el carrito: ahí se leen
            importes que se cobran, y encogerlos para ver más productos sería un
            mal cambio. */}
        <Box sx={{ px: 1, pb: 0.75, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: '#9ca3af' }}>TAMAÑO</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, pb: 1 }}>
          {/* Las dos «A» dicen de un vistazo para qué es esto: una letra chica y
              una grande se leen sin etiqueta y en cualquier idioma. */}
          <Box component="span" sx={{ flexShrink: 0, width: 40, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>A</Box>
          <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', gap: 0.5 }}>
            {escalas.map((e) => (
              <Box
                key={e}
                sx={{
                  flex: 1, height: 4, borderRadius: '2px',
                  bgcolor: e <= escala ? '#3658e1' : '#e5e7eb',
                }}
              />
            ))}
          </Box>
          <Box component="span" sx={{ flexShrink: 0, width: 44, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', ...MONEY }}>
            {Math.round(escala * 100)}%
          </Box>
          <ButtonBase
            onClick={() => onEscala(-1)}
            disabled={escala <= escalas[0]}
            title="Achicar productos"
            aria-label="Achicar productos"
            sx={{ flexShrink: 0, display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 20, color: '#4b5563', '&.Mui-disabled': { opacity: 0.35 } }}
          >−</ButtonBase>
          <ButtonBase
            onClick={() => onEscala(1)}
            disabled={escala >= escalas[escalas.length - 1]}
            title="Agrandar productos"
            aria-label="Agrandar productos"
            sx={{ flexShrink: 0, display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 20, color: '#4b5563', '&.Mui-disabled': { opacity: 0.35 } }}
          >+</ButtonBase>
        </Box>

        <Divider sx={{ my: 0.75 }} />

        <Box sx={{ px: 1, pb: 0.75, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: '#9ca3af' }}>AVISO AL TOCAR</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, pb: 1 }}>
          <ButtonBase
            onClick={() => (mudo ? onPrefs({ sonido: true }) : onPrefs({ sonido: false }))}
            title={mudo ? 'Activar sonido' : 'Silenciar'}
            aria-label={mudo ? 'Activar sonido' : 'Silenciar'}
            sx={{ flexShrink: 0, display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', color: mudo ? '#9ca3af' : '#2a45c4', '&:hover': { bgcolor: '#f3f4f6' } }}
          >
            {mudo ? <VolumeX style={{ width: 20, height: 20 }} /> : <Volume2 style={{ width: 20, height: 20 }} />}
          </ButtonBase>

          {/* Barritas en vez de un número: se lee de un vistazo cuánto queda por
              subir, que es lo único que hace falta saber para decidir. */}
          <Box sx={{ display: 'flex', flex: 1, alignItems: 'flex-end', gap: 0.5, height: 22 }}>
            {Array.from({ length: nivelMaximo }, (_, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1, borderRadius: '2px',
                  height: `${40 + i * 20}%`,
                  bgcolor: !mudo && i < nivel ? '#3658e1' : '#e5e7eb',
                }}
              />
            ))}
          </Box>

          <ButtonBase
            onClick={() => onVolumen(-1)}
            disabled={nivel === 0}
            title="Bajar volumen"
            aria-label="Bajar volumen"
            sx={{ flexShrink: 0, display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 20, color: '#4b5563', '&.Mui-disabled': { opacity: 0.35 } }}
          >−</ButtonBase>
          <ButtonBase
            onClick={() => onVolumen(1)}
            disabled={nivel === nivelMaximo}
            title="Subir volumen"
            aria-label="Subir volumen"
            sx={{ flexShrink: 0, display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: 20, color: '#4b5563', '&.Mui-disabled': { opacity: 0.35 } }}
          >+</ButtonBase>
        </Box>

        {/* Solo donde el aparato puede vibrar: Safari (iPad, iPhone) no tiene la
            API, y un interruptor que no hace nada se lee como avería. */}
        {conVibracion && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 0.5, minHeight: 44 }}>
            <Vibrate style={{ width: 18, height: 18, color: prefs.vibracion ? '#2a45c4' : '#9ca3af' }} />
            <Box component="span" sx={{ flex: 1, fontSize: 14, color: '#374151' }}>Vibración</Box>
            <Switch checked={prefs.vibracion} size="small" onChange={() => onPrefs({ vibracion: !prefs.vibracion })} />
          </Box>
        )}
      </Menu>
    </>
  );
}

// ─── Deslizar una línea del carrito para quitarla ────────────────────────────

/** Píxeles de arrastre a partir de los cuales la línea se da por quitada. */
const UMBRAL_BORRAR = 96;
/** Antes de esto no se decide nada: hay que saber si el dedo va de lado o baja. */
const UMBRAL_INTENCION = 10;

/**
 * Deslizar hacia la izquierda para quitar una línea.
 *
 * Quitar un producto obligaba a bajar la cantidad a cero con el «−»: cuatro
 * toques para deshacer uno. El deslizamiento es el gesto que ya trae aprendido
 * cualquiera que use un teléfono.
 *
 * Lo delicado es no pelearse con el scroll vertical de la lista. Hasta que el
 * dedo no recorre UMBRAL_INTENCION píxeles no se decide nada; y si en ese tramo
 * mandó la vertical, la línea no se mueve en todo el gesto — se deja bajar en
 * paz. Sin eso, intentar desplazar la lista arrastraba las líneas de lado.
 */
function useDeslizarParaBorrar(onBorrar: () => void) {
  const [dx, setDx] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const eje = useRef<'indeciso' | 'horizontal' | 'vertical'>('indeciso');

  const onPointerDown = (e: React.PointerEvent) => {
    // Solo dedo o ratón; con lápiz y rueda se queda quieto.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    inicio.current = { x: e.clientX, y: e.clientY };
    eje.current = 'indeciso';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p0 = inicio.current;
    if (!p0) return;
    const ddx = e.clientX - p0.x;
    const ddy = e.clientY - p0.y;

    if (eje.current === 'indeciso') {
      if (Math.abs(ddx) < UMBRAL_INTENCION && Math.abs(ddy) < UMBRAL_INTENCION) return;
      eje.current = Math.abs(ddx) > Math.abs(ddy) ? 'horizontal' : 'vertical';
      // Ganó la vertical: es un scroll, no un borrado. Fuera hasta el próximo dedo.
      if (eje.current === 'vertical') { inicio.current = null; return; }
      // Ganó la horizontal: se captura el puntero para seguir recibiendo el
      // movimiento aunque el dedo se salga de la línea.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    // Solo hacia la izquierda; a la derecha no hay nada que hacer.
    setDx(Math.min(0, ddx));
  };

  const soltar = () => {
    if (dx <= -UMBRAL_BORRAR) onBorrar();
    setDx(0);
    inicio.current = null;
    eje.current = 'indeciso';
  };

  return {
    dx,
    /** true cuando soltar ahora mismo borraría: sirve para teñir de rojo. */
    armado: dx <= -UMBRAL_BORRAR,
    manejadores: {
      onPointerDown,
      onPointerMove,
      onPointerUp: soltar,
      onPointerCancel: soltar,
      onPointerLeave: () => { if (eje.current !== 'horizontal') { inicio.current = null; } },
    },
  };
}

/** Una línea del carrito con su gesto de borrado. */
function LineaCarritoDeslizable({ children, destella, refFlash, onBorrar }: {
  children: React.ReactNode;
  destella: boolean;
  refFlash?: React.Ref<HTMLDivElement>;
  onBorrar: () => void;
}) {
  const { dx, armado, manejadores } = useDeslizarParaBorrar(onBorrar);
  const arrastrando = dx !== 0;

  return (
    <Box ref={refFlash} sx={{ position: 'relative', overflow: 'hidden', borderRadius: '8px' }}>
      {/* El fondo rojo solo existe mientras se arrastra: si estuviera siempre,
          asomaría por los bordes en cada repintado. */}
      {arrastrando && (
        <Box sx={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          borderRadius: '8px', bgcolor: armado ? '#dc2626' : '#fee2e2', px: 2,
          color: armado ? '#fff' : '#b91c1c', fontSize: 13, fontWeight: 600, gap: 0.75,
        }}>
          <Trash2 style={{ width: 16, height: 16 }} />
          {armado ? 'Soltar para quitar' : 'Quitar'}
        </Box>
      )}
      <Box
        {...manejadores}
        sx={{
          position: 'relative',
          transform: `translateX(${dx}px)`,
          // Sin transición mientras el dedo manda (tiene que ir pegado a él) y
          // con ella al soltar, para que vuelva a su sitio con suavidad.
          transition: arrastrando ? 'none' : 'transform .18s ease-out',
          bgcolor: destella ? '#dbeafe' : '#fff',
          borderRadius: '8px',
          touchAction: 'pan-y',
          userSelect: 'none',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// ─── Cantidad editable en línea del carrito ──────────────────────────────────

/**
 * La cantidad es un campo, no solo un número entre − y +.
 *
 * Doce unidades de lo mismo son doce toques en el «+», y a mitad de camino nadie
 * sabe si va por siete o por ocho. Tocando el número se escribe directo. Los
 * botones se quedan: para pasar de 1 a 2 siguen siendo lo más rápido.
 */
function CantidadEditable({ qty, nombre, onFijar }: {
  qty: number;
  nombre: string;
  onFijar: (n: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');

  function confirmar() {
    const n = parseInt(valor, 10);
    // Vacío o basura: se deja como estaba. Poner 0 sí es válido —es quitar la
    // línea— pero tiene que escribirlo, no salir de un dedo resbalado.
    if (Number.isFinite(n) && n >= 0) onFijar(n);
    setEditando(false);
  }

  if (editando) {
    return (
      <Box
        component="input"
        type="number"
        inputMode="numeric"
        autoFocus
        value={valor}
        aria-label={`Cantidad de ${nombre}`}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValor(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditando(false); }
        }}
        onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
        sx={{
          width: 56, height: 44, borderRadius: '8px', border: '2px solid #3658e1', textAlign: 'center',
          fontSize: 20, fontWeight: 700, color: '#111827', outline: 'none', p: 0,
          '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
          MozAppearance: 'textfield',
          ...MONEY,
        }}
      />
    );
  }

  return (
    <ButtonBase
      onClick={() => { setValor(String(qty)); setEditando(true); }}
      title="Tocar para escribir la cantidad"
      aria-label={`Cantidad de ${nombre}: ${qty}. Tocar para escribirla.`}
      sx={{
        width: 56, height: 44, borderRadius: '8px', fontSize: 20, fontWeight: 700,
        color: '#111827', '&:hover': { bgcolor: '#f3f4f6' }, ...MONEY,
      }}
    >
      {qty}
    </ButtonBase>
  );
}

// ─── Precio editable en línea del carrito ────────────────────────────────────

function PrecioEditable({ linea, onEditar, bloqueado = false }: {
  linea: LineaCarrito;
  onEditar: (centavos: number | null) => void;
  /** Sin permiso el precio se ve pero no se toca. */
  bloqueado?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const editado = linea.precioOverride != null;

  function abrir() {
    if (bloqueado) return;
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
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="span" sx={{ color: '#9ca3af' }}>RD$</Box>
        <Box
          component="input"
          type="number"
          value={valor}
          autoFocus
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValor(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false); }}
          onBlur={guardar}
          sx={{ width: 64, borderRadius: '4px', border: '1px solid #a5b4f9', px: 0.5, py: 0.25, fontSize: 12, outline: 'none', ...MONEY }}
        />
      </Box>
    );
  }

  return (
    <Box component="button" onClick={abrir} title="Editar precio" sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2, color: editado ? '#3658e1' : '#9ca3af', ...MONEY }}>
      {fmt(precioLinea(linea))} c/u{editado ? '*' : ''}
    </Box>
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 448, maxHeight: '85vh', m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Ventas aparcadas ({aparcadas.length})</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>
        {aparcadas.length === 0 ? (
          <Typography sx={{ py: 4, textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>No hay ventas aparcadas.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {aparcadas.map((a) => {
              const t = totalesCarrito(a.carrito);
              return (
                <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderRadius: '8px', border: '1px solid #e5e7eb', px: 1.5, py: 1.25 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500 }}>{a.etiqueta}</Box>
                    <Box sx={{ fontSize: 12, color: '#9ca3af', ...MONEY }}>
                      {a.carrito.length} {a.carrito.length === 1 ? 'ítem' : 'ítems'} · {fmt(t.total)}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1 }}>
                    <Button onClick={() => onRetomar(a)} variant="contained" color="primary" disableElevation sx={{ borderRadius: '8px', px: 1.5, py: 0.75, fontSize: 12, fontWeight: 500 }}>Retomar</Button>
                    <Box component="button" onClick={() => onDescartar(a.id)} sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', display: 'flex', color: '#d1d5db', '&:hover': { color: '#ef4444' } }}><X style={{ width: 16, height: 16 }} /></Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Dialog>
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
    void traerJson<{ desglose?: { esperado?: number } }>('/api/caja/turnos').then((d) => {
      setEstado((s) => ({ ...s, esperado: d?.desglose?.esperado ?? 0 }));
      setCargando(false);
    });
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 384, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Cerrar turno (corte Z)</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        {cargando ? (
          <Typography sx={{ py: 3, textAlign: 'center', fontSize: 14, color: '#9ca3af' }}>Calculando esperado…</Typography>
        ) : (
          <>
            <Box sx={{ mb: 1.5, borderRadius: '8px', bgcolor: '#f9fafb', p: 1.5, textAlign: 'center' }}>
              <Box sx={{ fontSize: 12, color: '#6b7280' }}>Efectivo esperado en caja</Box>
              <Box sx={{ fontSize: 24, fontWeight: 500, ...MONEY }}>{fmt(estado.esperado)}</Box>
            </Box>

            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Efectivo contado (RD$)</Typography>
            <TextField
              type="number"
              value={estado.contado}
              autoFocus
              onChange={(e) => setEstado((s) => ({ ...s, contado: e.target.value }))}
              fullWidth
              slotProps={{
                input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
                htmlInput: { min: 0, step: 0.01 },
              }}
              sx={{ mb: 1.5, '& input': { fontSize: 18, py: 1.25 } }}
            />

            {estado.contado !== '' && (
              <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', borderRadius: '8px', px: 1.5, py: 1, fontSize: 14, bgcolor: hayDiff ? '#fef2f2' : '#f0fdf4', color: hayDiff ? '#b91c1c' : '#15803d' }}>
                <Box component="span" sx={MONEY}>{hayDiff ? `Diferencia ${diferencia > 0 ? '+' : ''}${fmt(diferencia)}` : 'Cuadrada'}</Box>
              </Box>
            )}

            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Observaciones {hayDiff && <Box component="span" sx={{ color: '#ef4444' }}>*</Box>}</Typography>
            <TextField
              value={estado.obs}
              onChange={(e) => setEstado((s) => ({ ...s, obs: e.target.value }))}
              multiline
              rows={2}
              placeholder={hayDiff ? 'Explica el descuadre…' : 'Opcional'}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ mb: 1.5 }}
            />

            <Button
              disabled={enviando || estado.contado === ''}
              onClick={enviar}
              variant="contained"
              fullWidth
              disableElevation
              sx={{ bgcolor: '#10b981', py: 1.5, fontWeight: 500, color: '#fff', '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' } }}
            >
              {enviando ? 'Enviando…' : 'Firmar y enviar cierre'}
            </Button>
          </>
        )}
      </Box>
    </Dialog>
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 384, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Saldo de {estudiante.nombre}</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        <Box sx={{ mb: 2, borderRadius: '8px', bgcolor: '#f9fafb', p: 1.5, textAlign: 'center' }}>
          <Box sx={{ fontSize: 12, color: '#6b7280' }}>Saldo actual</Box>
          <Box sx={{ fontSize: 24, fontWeight: 500, ...MONEY }}>{fmt(estudiante.saldoCentavos)}</Box>
        </Box>

        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Recargar (RD$)</Typography>
        <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
          <TextField type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00" sx={{ flex: 1 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          <Button onClick={recargar} disabled={busy} variant="contained" disableElevation sx={{ bgcolor: '#10b981', px: 2, fontWeight: 500, color: '#fff', '&:hover': { bgcolor: '#059669' }, '&.Mui-disabled': { opacity: 0.6, color: '#fff' } }}>Recargar</Button>
        </Box>

        <Typography component="label" sx={{ mb: 0.5, mt: 2, display: 'block', fontSize: 12, color: '#6b7280' }}>Límite diario (RD$, vacío = sin límite)</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField type="number" value={limite} onChange={(e) => setLimite(e.target.value)}
            placeholder="sin límite" sx={{ flex: 1 }} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          <Button onClick={guardarLimite} disabled={busy} variant="outlined" sx={{ px: 2, color: '#374151', borderColor: '#d1d5db', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}>Guardar</Button>
        </Box>
      </Box>
    </Dialog>
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
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
      <Box component="header" sx={{ zIndex: 20, display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #e5e7eb', bgcolor: '#fff', px: { xs: 1.5, sm: 2 }, py: 1 }}>
        <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 1 }}>
          <Button component={Link} href="/dashboard" nativeButton={false} variant="outlined" title="Volver al panel" sx={iconActionSx}>
            <ArrowLeft style={{ width: 18, height: 18 }} /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: 14 }}>Panel</Box>
          </Button>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500 }}>{terminalNombre}</Box>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, color: '#9ca3af' }}>· Salón</Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {mesero ? (
            <ButtonBase onClick={onCambiarMesero} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, borderRadius: '8px', border: '1px solid #c7d2fc', bgcolor: '#eef2fe', px: 1.5, py: 0.75, fontSize: 12, fontWeight: 500, color: '#2a45c4' }}>
              <UserRound style={{ width: 14, height: 14 }} /> {mesero.nombre} · cambiar
            </ButtonBase>
          ) : (
            <Chip label="Elige mesa → PIN" sx={{ bgcolor: '#f3f4f6', color: '#6b7280', borderRadius: '9999px', px: 0.5, py: 0.75, fontSize: 12, fontWeight: 400 }} />
          )}
          <Button onClick={() => setNuevaAbierto(true)} variant="contained" color="primary" disableElevation sx={{ display: 'flex', alignItems: 'center', gap: 0.75, borderRadius: '8px', px: 1.5, py: 0.75, fontSize: 12, fontWeight: 500 }}>
            <Plus style={{ width: 16, height: 16 }} /> Mesa
          </Button>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {cargando ? (
          <Typography sx={{ fontSize: 14, color: '#6b7280' }}>Cargando salón…</Typography>
        ) : mesas.length === 0 ? (
          <Box sx={{ mx: 'auto', mt: 8, maxWidth: 384, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 14, color: '#6b7280' }}>No hay mesas configuradas en esta terminal.</Typography>
            <Button onClick={() => setNuevaAbierto(true)} variant="contained" color="primary" disableElevation sx={{ mt: 1.5, borderRadius: '8px', px: 2, py: 1, fontSize: 14, fontWeight: 500 }}>Crear primera mesa</Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1.5 }}>
            {mesas.map((m) => (
              <ButtonBase
                key={m.id}
                onClick={() => onAbrirMesa(m)}
                sx={{
                  display: 'flex', aspectRatio: '4 / 3', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '12px', border: '1px solid', p: 1.5, textAlign: 'left',
                  borderColor: m.ocupada ? '#fcd34d' : '#e5e7eb',
                  bgcolor: m.ocupada ? '#fffbeb' : '#fff',
                  '&:hover': { borderColor: m.ocupada ? '#fcd34d' : '#8193f5' },
                }}
              >
                <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{m.nombre}</Box>
                  <Box component="span" sx={{ height: 10, width: 10, borderRadius: '9999px', bgcolor: m.ocupada ? '#f59e0b' : '#34d399' }} />
                </Box>
                {m.ocupada ? (
                  <Box sx={{ width: '100%', lineHeight: 1.2 }}>
                    <Box sx={{ fontSize: 14, fontWeight: 600, color: '#92400e', ...MONEY }}>{fmt(m.totalCentavos)}</Box>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#d97706' }}>
                      {m.items} {m.items === 1 ? 'ítem' : 'ítems'}{m.meseroNombre ? ` · ${m.meseroNombre}` : ''}
                    </Box>
                  </Box>
                ) : (
                  <Box component="span" sx={{ fontSize: 12, color: '#9ca3af' }}>{m.zona ?? 'Libre'}</Box>
                )}
              </ButtonBase>
            ))}
          </Box>
        )}
      </Box>

      {nuevaAbierto && (
        <NuevaMesaModal terminalId={terminalId} onClose={() => setNuevaAbierto(false)} onCreated={() => { setNuevaAbierto(false); cargar(); }} />
      )}
    </Box>
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 320, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Identifícate</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>
        <Typography sx={{ mb: 1.5, fontSize: 12, color: '#6b7280' }}>Ingresa tu PIN de mesero.</Typography>
        <TextField
          type="password"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') verificar(pin); }}
          placeholder="••••"
          fullWidth
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ mb: 1.5, '& input': { textAlign: 'center', fontSize: 24, letterSpacing: '0.5em', py: 1.5 } }}
        />
        <Button
          disabled={verificando || pin.length < 4}
          onClick={() => verificar(pin)}
          variant="contained" color="primary" fullWidth
          sx={{ py: 1.5, fontWeight: 500 }}
        >
          {verificando ? 'Verificando…' : 'Entrar'}
        </Button>
        <Box component="button" onClick={() => setGestion(true)} sx={{ mt: 1.5, width: '100%', border: 'none', bgcolor: 'transparent', cursor: 'pointer', textAlign: 'center', fontSize: 12, color: '#3658e1' }}>
          Registrar nuevo mesero
        </Box>
        {gestion && <NuevoMeseroModal onClose={() => setGestion(false)} onCreated={() => setGestion(false)} />}
      </Box>
    </Dialog>
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} sx={{ zIndex: 1400 }} slotProps={{ paper: { sx: { maxWidth: 320, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Nuevo mesero</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Nombre</Typography>
        <TextField value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus fullWidth sx={{ mb: 1.5 }} />
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>PIN (4–6 dígitos)</Typography>
        <TextField value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} fullWidth slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ mb: 1.5 }} />
        <Button disabled={busy} onClick={guardar} variant="contained" color="primary" fullWidth sx={{ py: 1.25, fontSize: 14, fontWeight: 500 }}>
          {busy ? 'Creando…' : 'Registrar'}
        </Button>
      </Box>
    </Dialog>
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
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 320, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Nueva mesa</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Nombre / número</Typography>
        <TextField value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Mesa 1" fullWidth sx={{ mb: 1.5 }} />
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Zona (opcional)</Typography>
        <TextField value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Terraza" fullWidth sx={{ mb: 1.5 }} />
        <Button disabled={busy} onClick={guardar} variant="contained" color="primary" fullWidth sx={{ py: 1.25, fontSize: 14, fontWeight: 500 }}>
          {busy ? 'Creando…' : 'Crear mesa'}
        </Button>
      </Box>
    </Dialog>
  );
}

// Crear producto/cliente rápido: modales compartidos en components/shared/
// (producto-dialog.tsx y cliente-dialog.tsx) — mismos que usa Facturación.

// ─── Venta simple (monto libre, sin producto de catálogo) ────────────────────

function VentaSimpleModal({ onClose, onAgregar }: {
  onClose: () => void;
  onAgregar: (concepto: string, precioCentavos: number, tasaItbis: string) => void;
}) {
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [tasaItbis, setTasaItbis] = useState('0.18');

  function agregar() {
    const p = Number(monto);
    if (!monto || isNaN(p) || p <= 0) { toast.error('Monto inválido'); return; }
    onAgregar(concepto.trim(), Math.round(p * 100), tasaItbis);
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 384, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>Venta simple</Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Monto (DOP)</Typography>
        <TextField
          type="number" value={monto} autoFocus
          onChange={(e) => setMonto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
          placeholder="0.00" fullWidth
          slotProps={{
            input: { startAdornment: <InputAdornment position="start" sx={{ color: '#9ca3af' }}>RD$</InputAdornment> },
            htmlInput: { min: 0, step: 0.01 },
          }}
          sx={{ mb: 1.5, '& input': { fontSize: 18, py: 1.25 } }}
        />

        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Concepto (opcional)</Typography>
        <TextField value={concepto} onChange={(e) => setConcepto(e.target.value)}
          placeholder="Venta simple" fullWidth sx={{ mb: 1.5 }} />

        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>ITBIS</Typography>
        <TextField select value={tasaItbis} onChange={(e) => setTasaItbis(e.target.value)} fullWidth sx={{ mb: 2 }}>
          <MenuItem value="0.18">18%</MenuItem>
          <MenuItem value="0.16">16%</MenuItem>
          <MenuItem value="0">0%</MenuItem>
          <MenuItem value="exento">Exento</MenuItem>
        </TextField>

        <Button onClick={agregar} variant="contained" color="primary" fullWidth sx={{ py: 1.5, fontWeight: 500 }}>
          Agregar al carrito
        </Button>
      </Box>
    </Dialog>
  );
}

