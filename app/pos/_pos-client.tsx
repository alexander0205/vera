'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';
import { toast } from 'sonner';

// ─── Tipos (subset de las props del server) ──────────────────────────────────

interface TerminalProp {
  id:             number;
  nombre:         string;
  almacenId:      number;
  almacenNombre:  string | null;
  listaNombre:    string | null;
  tipoEcf:        string;
}
interface TurnoProp {
  id:                    number;
  terminalId:            number | null;
  montoAperturaCentavos: number;
}
interface ProductoPos {
  id:                   number;
  nombre:               string;
  referencia:           string | null;
  precio:               number;  // centavos (BASE, sin ITBIS)
  tasaItbis:            string;  // '0.18' | '0.16' | '0' | 'exento'
  tipo:                 string;  // 'bien' | 'servicio'
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  stockAlmacen:         number | null;
}
interface LineaCarrito extends ProductoPos { qty: number; }

const METODOS = ['efectivo', 'tarjeta', 'transferencia'] as const;
type Metodo = typeof METODOS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tasaFloat(t: string): number {
  if (!t || t === 'exento') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
function fmt(centavos: number): string {
  return 'RD$ ' + (centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** base + ITBIS encima (espejo de calcularTotales del motor de facturas). */
function totalesCarrito(items: LineaCarrito[]) {
  let subtotal = 0, itbis = 0;
  for (const it of items) {
    const base = it.precio * it.qty;
    subtotal += base;
    itbis += Math.round(base * tasaFloat(it.tasaItbis));
  }
  return { subtotal, itbis, total: subtotal + itbis };
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
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [cobrando, setCobrando] = useState(false);

  const cargarCatalogo = useCallback(async () => {
    if (!turno.terminalId) { setCargando(false); return; }
    setCargando(true);
    const res = await fetch(`/api/pos/catalogo?terminalId=${turno.terminalId}`);
    if (res.ok) {
      const data = await res.json();
      setProductos(data.productos ?? []);
    } else {
      toast.error('No se pudo cargar el catálogo');
    }
    setCargando(false);
  }, [turno.terminalId]);

  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.referencia ?? '').toLowerCase().includes(q),
    );
  }, [productos, busqueda]);

  const totales = useMemo(() => totalesCarrito(carrito), [carrito]);

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

  function cambiarQty(id: number, delta: number) {
    setCarrito((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  }

  async function cobrar(metodo: Metodo, recibidoCentavos: number) {
    setCobrando(true);
    const items = carrito.map((c) => ({
      nombreItem:             c.nombre,
      cantidadItem:           c.qty,
      precioUnitarioItem:     c.precio / 100,         // base en pesos
      tasaItbis:              tasaFloat(c.tasaItbis) as 0 | 0.16 | 0.18,
      indicadorBienoServicio: (c.tipo === 'bien' ? 1 : 2) as 1 | 2,
      productoId:             c.id,
    }));

    const payload = {
      modo:                 'borrador',
      tipoEcf:              terminal?.tipoEcf ?? 'sin-ncf',
      razonSocialComprador: 'Consumidor Final',
      tipoPago:             1,
      items,
      pagoRecibido:         true,
      pagos:                [{ metodo, valor: totales.total / 100 }],
      almacenId:            terminal?.almacenId ?? null,
    };

    const res = await fetch('/api/ecf/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setCobrando(false);

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo completar la venta');
      return;
    }
    const cambio = recibidoCentavos - totales.total;
    toast.success(cambio > 0 ? `Venta cobrada. Cambio: ${fmt(cambio)}` : 'Venta cobrada');
    setCarrito([]);
    cargarCatalogo();   // refresca stock
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50" title="Volver al panel">
            <ArrowLeft className="h-4 w-4" /> Panel
          </Link>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{terminal?.nombre ?? 'Punto de venta'}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{terminal?.almacenNombre ?? ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700">Turno abierto</span>
          <Link href="/dashboard/caja" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50" title="Ir a cierre de caja">
            <LogOut className="h-4 w-4" /> Cerrar turno
          </Link>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[1.55fr_1fr] gap-3 p-3">
        {/* Grilla */}
        <div className="flex flex-col">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o referencia…"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando catálogo…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-gray-500">Sin productos para esta terminal.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 overflow-auto">
              {filtrados.map((p) => {
                const agotado = p.controlaInventario && !p.permiteVentaSinStock && (p.stockAlmacen ?? 0) <= 0;
                return (
                  <button
                    key={p.id}
                    disabled={agotado}
                    onClick={() => agregar(p)}
                    className={`flex min-h-[92px] flex-col justify-between rounded-lg border border-gray-200 bg-white p-2.5 text-left ${
                      agotado ? 'opacity-50' : 'hover:border-blue-400'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium leading-tight">{p.nombre}</div>
                      <div className="text-[11px] text-gray-400">
                        {p.referencia ? p.referencia + ' · ' : ''}
                        {p.controlaInventario ? (agotado ? 'agotado' : `${p.stockAlmacen} disp.`) : ''}
                      </div>
                    </div>
                    <div className="text-sm font-medium">{fmt(p.precio)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrito */}
        <CarritoPanel
          carrito={carrito}
          totales={totales}
          cambiarQty={cambiarQty}
          cobrando={cobrando}
          onCobrar={cobrar}
        />
      </div>
    </div>
  );
}

// ─── Panel de carrito + cobro ────────────────────────────────────────────────

function CarritoPanel({
  carrito, totales, cambiarQty, cobrando, onCobrar,
}: {
  carrito: LineaCarrito[];
  totales: { subtotal: number; itbis: number; total: number };
  cambiarQty: (id: number, delta: number) => void;
  cobrando: boolean;
  onCobrar: (metodo: Metodo, recibidoCentavos: number) => void;
}) {
  const [abrirCobro, setAbrirCobro] = useState(false);

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 text-[11px] text-gray-400">Carrito ({carrito.length})</div>
      <div className="flex-1 overflow-auto">
        {carrito.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Toca productos para agregarlos</p>
        ) : (
          carrito.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-gray-100 py-2">
              <div className="leading-tight">
                <div className="text-sm">{c.nombre}</div>
                <div className="text-[11px] text-gray-400">{fmt(c.precio)} c/u</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => cambiarQty(c.id, -1)} className="h-6 w-6 rounded border border-gray-200 text-gray-600">−</button>
                <span className="w-5 text-center text-sm">{c.qty}</span>
                <button onClick={() => cambiarQty(c.id, 1)} className="h-6 w-6 rounded border border-gray-200 text-gray-600">+</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="mb-0.5 flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{fmt(totales.subtotal)}</span></div>
        <div className="mb-2 flex justify-between text-xs text-gray-500"><span>ITBIS</span><span>{fmt(totales.itbis)}</span></div>
        <div className="mb-3 flex justify-between text-lg font-medium"><span>Total</span><span>{fmt(totales.total)}</span></div>
        <button
          disabled={carrito.length === 0}
          onClick={() => setAbrirCobro(true)}
          className="w-full rounded-lg bg-green-600 py-3 font-medium text-white disabled:opacity-50"
        >
          Cobrar {fmt(totales.total)}
        </button>
      </div>

      {abrirCobro && (
        <CobroModal
          total={totales.total}
          cobrando={cobrando}
          onClose={() => setAbrirCobro(false)}
          onConfirm={(m, recibido) => { onCobrar(m, recibido); setAbrirCobro(false); }}
        />
      )}
    </div>
  );
}

// ─── Modal de cobro ──────────────────────────────────────────────────────────

function CobroModal({
  total, cobrando, onClose, onConfirm,
}: {
  total: number;
  cobrando: boolean;
  onClose: () => void;
  onConfirm: (metodo: Metodo, recibidoCentavos: number) => void;
}) {
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [recibido, setRecibido] = useState('');

  const recibidoCentavos = Math.round((Number(recibido) || 0) * 100);
  const cambio = metodo === 'efectivo' ? recibidoCentavos - total : 0;
  const faltaEfectivo = metodo === 'efectivo' && recibidoCentavos < total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium">Cobrar venta</span>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Total a cobrar</div>
          <div className="text-2xl font-medium">{fmt(total)}</div>
        </div>

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

        <button
          disabled={cobrando || faltaEfectivo}
          onClick={() => onConfirm(metodo, metodo === 'efectivo' ? recibidoCentavos : total)}
          className="w-full rounded-lg bg-green-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {cobrando ? 'Procesando…' : faltaEfectivo ? 'Efectivo insuficiente' : 'Confirmar venta'}
        </button>
      </div>
    </div>
  );
}
