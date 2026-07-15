'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, X, User, Package, Calendar, ScrollText, StickyNote, FileText,
  CreditCard, ChevronRight, Info, Receipt, RefreshCw,
} from 'lucide-react';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';

import { SectionCard } from '../../facturas/nueva/sections/SectionCard';
import { AccordionSection } from '../../facturas/nueva/sections/AccordionSection';
import { ClienteSection } from '../../facturas/nueva/sections/ClienteSection';
import { ItemsTable } from '../../facturas/nueva/sections/ItemsTable';
import { ColumnasToggle } from '../../facturas/nueva/sections/ColumnasToggle';
import { Terminos, Notas } from '../../facturas/nueva/sections/TerminosNotas';
import { PieFactura } from '../../facturas/nueva/sections/PieFactura';

import { useItemsState } from '../../facturas/nueva/hooks/useFacturaState';
import { calcularTotales } from '../../facturas/nueva/utils/calculos';
import { BottomActionBar } from '../../facturas/nueva/sections/BottomActionBar';
import { EmpresaBlock } from '../../facturas/nueva/sections/EmpresaBlock';
import type { Cliente, ItemLinea, Producto, EmpresaPerfil } from '../../facturas/nueva/utils/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_ECF = [
  { value: '31', label: 'Factura de crédito fiscal (31)' },
  { value: '32', label: 'Factura de consumo (32)' },
  { value: '41', label: 'Compras (41)' },
  { value: '43', label: 'Gastos menores (43)' },
  { value: '44', label: 'Regímenes especiales (44)' },
  { value: '45', label: 'Gubernamental (45)' },
];

// tipoPago recurrente: 1 = contado, 2 = crédito (con N días para pago)
const TIPOS_PAGO = [
  { value: '1', label: 'De contado' },
  { value: '2', label: 'Crédito' },
];

const FRECUENCIAS = [
  { value: 'semanal',    label: 'Semanal' },
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'mensual',    label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual',      label: 'Anual' },
];

function formatDOP(val: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
}

/** Suma un período (según frecuencia) a una fecha YYYY-MM-DD. */
function sumarPeriodo(fecha: string, frecuencia: string): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  switch (frecuencia) {
    case 'semanal':    dt.setDate(dt.getDate() + 7); break;
    case 'quincenal':  dt.setDate(dt.getDate() + 15); break;
    case 'mensual':    dt.setMonth(dt.getMonth() + 1); break;
    case 'trimestral': dt.setMonth(dt.getMonth() + 3); break;
    case 'anual':      dt.setFullYear(dt.getFullYear() + 1); break;
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Próxima emisión real: si fechaInicio es futuro, es exactamente fechaInicio.
 * Si ya pasó, suma períodos hasta superar hoy. Esto refleja lo que el cron
 * realmente emitirá en su próxima corrida.
 */
function calcularProximaEmision(fechaInicio: string, frecuencia: string): string {
  if (!fechaInicio) return '';
  const hoy = new Date().toISOString().slice(0, 10);
  if (fechaInicio >= hoy) return fechaInicio;
  let current = fechaInicio;
  // safety cap 10000 iteraciones (cubre semanal × 200 años)
  for (let i = 0; i < 10000 && current < hoy; i++) {
    current = sumarPeriodo(current, frecuencia);
    if (!current) break;
  }
  return current;
}

/**
 * Calcula las próximas N emisiones empezando por la próxima REAL (que puede
 * ser la propia fechaInicio si aún no ha pasado).
 */
function calcularProximasEmisiones(fechaInicio: string, frecuencia: string, count: number): string[] {
  if (!fechaInicio) return [];
  const result: string[] = [];
  let current = calcularProximaEmision(fechaInicio, frecuencia);
  for (let i = 0; i < count; i++) {
    if (!current) break;
    result.push(current);
    current = sumarPeriodo(current, frecuencia);
  }
  return result;
}

/** Formatea YYYY-MM-DD → DD/MM/YYYY */
function formatFechaCorta(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const FRECUENCIA_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * Plan recurrente serializado desde la DB para pre-rellenar el form en modo edición.
 * Las fechas vienen como strings 'YYYY-MM-DD' (drizzle `date()` mode 'string').
 * `items` es JSON crudo (text column).
 */
export interface InitialPlan {
  id:           number;
  nombre:       string;
  descripcion:  string | null;
  tipoEcf:      string;
  tipoPago:     number;
  diasParaPago: number | null;
  frecuencia:   string;
  diaCobro:     number | null;
  fechaInicio:  string;
  fechaFin:     string | null;
  estado:       string;
  clientId:     number | null;
  items:        string; // JSON: ItemLinea[]
  notas:        string | null;
}

export interface ContextoEscolar {
  matriculaId: number;
  conceptoId: number;
  conceptoNombre: string;
  estudianteNombre: string;
  tutorNombre: string;
  clientId: number;
  clienteRazonSocial: string;
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
}

interface Props {
  initialPerfil: EmpresaPerfil | null;
  /** Si se pasa, el form opera en modo edición (PUT en lugar de POST). */
  initialPlan?: InitialPlan;
  contextoEscolar?: ContextoEscolar;
}

export default function NuevaFacturaRecurrenteForm({ initialPerfil, initialPlan, contextoEscolar }: Props) {
  const router = useRouter();
  const empresa = initialPerfil;
  const isEdit = Boolean(initialPlan);
  const { tipoVisible } = useTiposDisponibles();

  // Plazo de pago por defecto del team (solo aplica al crear, no al editar).
  // null/undefined → contado; N → crédito a N días.
  const defaultDias = empresa?.plazoPagoDefaultDias;
  // ── Cabecera ───────────────────────────────────────────────────────────────
  const [tipoEcf, setTipoEcf]           = useState(initialPlan?.tipoEcf ?? '31');
  const [tipoPago, setTipoPago]         = useState(
    initialPlan
      ? String(initialPlan.tipoPago)
      : (defaultDias != null && defaultDias > 0 ? '2' : '1'),
  );
  const [diasParaPago, setDiasParaPago] = useState(
    initialPlan?.diasParaPago != null
      ? String(initialPlan.diasParaPago)
      : (defaultDias != null && defaultDias > 0 ? String(defaultDias) : '5'),
  ); // solo aplica si tipoPago=2 (crédito)
  const [frecuencia, setFrecuencia]     = useState(initialPlan?.frecuencia ?? (contextoEscolar ? 'mensual' : 'mensual'));
  const [nombre, setNombre]             = useState(initialPlan?.nombre ?? (contextoEscolar ? `${contextoEscolar.conceptoNombre} — ${contextoEscolar.estudianteNombre}` : ''));
  const [descripcion, setDescripcion]   = useState(initialPlan?.descripcion ?? '');
  const [fechaInicio, setFechaInicio]   = useState(initialPlan?.fechaInicio ?? contextoEscolar?.fechaInicio ?? '');
  const [fechaFin, setFechaFin]         = useState(initialPlan?.fechaFin ?? contextoEscolar?.fechaFin ?? '');

  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // ── Cliente / comprador ────────────────────────────────────────────────────
  // En modo edición: pre-llenar con shape mínimo desde initialPlan.clientId.
  // Esto garantiza que un Guardar antes de que termine la hidratación no borre el
  // clientId del plan (la hidratación luego enriquece con razonSocial/email/etc.).
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(
    initialPlan?.clientId || contextoEscolar?.clientId
      ? {
        id: initialPlan?.clientId ?? contextoEscolar!.clientId,
        razonSocial: contextoEscolar?.clienteRazonSocial ?? 'Cargando…', rnc: null, email: null, telefono: null,
      }
      : null
  );
  const [rncManual, setRncManual]             = useState('');
  const [rncManualNombre, setRncManualNombre] = useState('');
  const [emailManual, setEmailManual]         = useState('');
  const [telefonoManual, setTelefonoManual]   = useState('');

  // ── Items (useReducer compartido) ──────────────────────────────────────────
  const initialItems = useMemo<ItemLinea[] | undefined>(() => {
    if (!initialPlan?.items) return undefined;
    try {
      const parsed = JSON.parse(initialPlan.items) as Array<Partial<ItemLinea>>;
      if (!Array.isArray(parsed) || !parsed.length) return undefined;
      // Asignar id único (el JSON guardado no lo trae) + normalizar campos.
      return parsed.map((it, i) => ({
        id:                     i + 1,
        productoId:             it.productoId,
        nombreItem:             it.nombreItem ?? '',
        referencia:             it.referencia ?? '',
        descripcionItem:        it.descripcionItem ?? '',
        cantidadItem:           it.cantidadItem ?? 1,
        precioUnitarioItem:     it.precioUnitarioItem ?? 0,
        descuentoPct:           it.descuentoPct ?? 0,
        tasaItbis:              (it.tasaItbis ?? 'exento') as ItemLinea['tasaItbis'],
        indicadorBienoServicio: (it.indicadorBienoServicio ?? '2') as '1' | '2',
        unidadMedida:           it.unidadMedida,
        dependienteId:          it.dependienteId ?? null,
        dependienteNombre:      it.dependienteNombre ?? '',
      }));
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [items, dispatchItems] = useItemsState(initialItems);

  // ── Beneficiarios (dependientes del cliente) — igual que en factura ──────────
  const [dependientesCliente, setDependientesCliente] = useState<
    { id: number; nombre: string; apellido: string }[]
  >([]);

  function cargarDependientes(clienteId: number) {
    fetch(`/api/clientes/${clienteId}/dependientes`)
      .then(r => r.json())
      .then(data => setDependientesCliente(Array.isArray(data.dependientes) ? data.dependientes : []))
      .catch(() => setDependientesCliente([]));
  }

  function handleSelectBeneficiario(itemId: number, depId: number | null, nombreCompleto: string) {
    dispatchItems({ type: 'UPDATE_BENEFICIARIO', id: itemId, dependienteId: depId, dependienteNombre: nombreCompleto });
  }

  // Cargar dependientes al montar si ya hay cliente (editar suscripción existente)
  useEffect(() => {
    if (clienteSeleccionado?.id) cargarDependientes(clienteSeleccionado.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Columnas Referencia/Descripción ────────────────────────────────────────
  const [showItemRef, setShowItemRef]   = useState(false);
  const [showItemDesc, setShowItemDesc] = useState(false);
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      const cols = prefs.itemsCols ?? {};
      setShowItemRef(Boolean(cols.referencia));
      setShowItemDesc(Boolean(cols.descripcion));
    } catch {}
  }, []);
  // Hydrate cliente cuando estamos en modo edición. Hace fetch una vez al montar.
  // Nota: no usamos un useRef-as-guard porque Strict Mode double-mount lo deja
  // bloqueado (primer mount cancela su fetch, segundo lo skipea por el guard).
  // El cancelled flag local + el id en deps son suficientes para evitar setState
  // tras unmount o tras cambio de id.
  useEffect(() => {
    const clientId = initialPlan?.clientId;
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clientes/${clientId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.cliente) return;
        const c: Cliente = {
          id:          data.cliente.id,
          razonSocial: data.cliente.razonSocial,
          rnc:         data.cliente.rnc ?? null,
          email:       data.cliente.email ?? null,
          telefono:    data.cliente.telefono ?? null,
        };
        setClienteSeleccionado(c);
        setRncManual(c.rnc ?? '');
        setEmailManual(c.email ?? '');
        setTelefonoManual(c.telefono ?? '');
      } catch {
        // silencio: el resto del form sigue editable sin cliente hidratado
      }
    })();
    return () => { cancelled = true; };
  }, [initialPlan?.clientId]);

  function persistCols(ref: boolean, desc: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs.itemsCols = { referencia: ref, descripcion: desc };
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }
  function handleToggleRef(v: boolean) { setShowItemRef(v); persistCols(v, showItemDesc); }
  function handleToggleDesc(v: boolean) { setShowItemDesc(v); persistCols(showItemRef, v); }

  // ── Términos / Notas / Pie ─────────────────────────────────────────────────
  // En modo edición no podemos separar términos/notas/pie porque se guardan
  // concatenados en `notas`. Dump completo al campo de notas y se mantienen
  // los otros dos campos vacíos hasta que el usuario los edite explícitamente.
  const [terminosCondiciones, setTerminos] = useState('');
  const [notas, setNotas]                  = useState(initialPlan?.notas ?? '');
  const [pieFactura, setPieFactura]        = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Cobro automático (feature no implementada — dialog Próximamente) ────────
  const { openProximamente, dialog: proximamenteDialog } = useProximamenteDialog();

  const today = new Date().toISOString().slice(0, 10);

  // ─── Búsqueda clientes ──────────────────────────────────────────────────────
  async function buscarClientes(q: string): Promise<Cliente[]> {
    const res  = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.clientes ?? [];
  }

  function seleccionarCliente(c: Cliente) {
    setClienteSeleccionado(c);
    setRncManual(c.rnc ?? '');
    setRncManualNombre('');
    setEmailManual(c.email ?? '');
    setTelefonoManual(c.telefono ?? '');
    setDependientesCliente([]);
    dispatchItems({ type: 'CLEAR_BENEFICIARIOS' });
    cargarDependientes(c.id);
  }

  function limpiarCliente() {
    setClienteSeleccionado(null);
    setRncManual('');
    setRncManualNombre('');
    setEmailManual('');
    setTelefonoManual('');
    setDependientesCliente([]);
    dispatchItems({ type: 'CLEAR_BENEFICIARIOS' });
  }

  // ─── Búsqueda productos ─────────────────────────────────────────────────────
  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId:             p.id,
        nombreItem:             p.nombre,
        referencia:             p.referencia ?? '',
        descripcionItem:        p.descripcion ?? '',
        precioUnitarioItem:     p.precioDOP,
        tasaItbis:              regla?.permiteItbis ? tasa : 'exento',
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida:           (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });
  }

  async function crearProductoLibre(idx: number, texto: string) {
    const nombre = texto.trim();
    if (!nombre) return;
    try {
      const item = items[idx];
      const tasaItem = String(item?.tasaItbis ?? '0.18');
      const tasa: '0.18' | '0.16' | '0' | 'exento' =
        tasaItem === '0.16' ? '0.16' :
        tasaItem === '0'    ? '0'    :
        tasaItem === 'exento' ? 'exento' :
        '0.18';
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          precio:    item?.precioUnitarioItem ?? 0,
          tasaItbis: tasa,
          tipo:      'servicio',
        }),
      });
      const data = await res.json();
      if (res.ok && data.producto) {
        seleccionarProducto(idx, data.producto);
      } else {
        dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
      }
    } catch {
      dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
    }
  }

  // ─── Items CRUD ─────────────────────────────────────────────────────────────
  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number | null) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ─── Cambio de tipo ─────────────────────────────────────────────────────────
  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    limpiarCliente();
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) dispatchItems({ type: 'FORCE_EXENTO' });
  }

  // ─── Totales ────────────────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);

  const proximaEmisionPreview = useMemo(
    () => calcularProximaEmision(fechaInicio, frecuencia),
    [fechaInicio, frecuencia],
  );

  const proximas3Emisiones = useMemo(
    () => calcularProximasEmisiones(fechaInicio, frecuencia, 3),
    [fechaInicio, frecuencia],
  );

  const diaCobro = fechaInicio ? parseInt(fechaInicio.split('-')[2], 10) : null;

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim())      { setError('El nombre identificador es obligatorio'); return; }
    if (!fechaInicio)        { setError('La fecha de inicio es obligatoria'); return; }
    if (items.every(i => !i.nombreItem.trim())) { setError('Agrega al menos un ítem con nombre'); return; }
    if (dependientesCliente.length > 0 && items.filter(i => i.nombreItem.trim()).some(i => !i.dependienteId)) {
      setError('Cada ítem requiere un beneficiario'); return;
    }

    const proximaEmision = fechaInicio; // Primera emisión = fecha de inicio
    const notasFinal = [terminosCondiciones, notas, pieFactura]
      .filter(s => s.trim()).join('\n\n') || null;

    setLoading(true);
    try {
      const url    = isEdit ? `/api/facturas-recurrentes/${initialPlan!.id}` : '/api/facturas-recurrentes';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         nombre.trim(),
          descripcion:    descripcion.trim() || null,
          tipoEcf,
          tipoPago:       parseInt(tipoPago),
          diasParaPago:   parseInt(tipoPago) === 2 ? parseInt(diasParaPago || '0') : null,
          frecuencia,
          diaCobro:       ['mensual','trimestral','anual'].includes(frecuencia) ? diaCobro : null,
          fechaInicio,
          fechaFin:       fechaFin || null,
          proximaEmision,
          estado:         'activa',
          clientId:       clienteSeleccionado?.id ?? null,
          notas:          notasFinal,
          totalEstimado:  totales.total,
          items:          items.filter(i => i.nombreItem.trim()).map(item => ({
            nombreItem:         item.nombreItem,
            referencia:         item.referencia || undefined,
            descripcionItem:    item.descripcionItem || undefined,
            cantidadItem:       item.cantidadItem,
            precioUnitarioItem: item.precioUnitarioItem,
            descuentoPct:       item.descuentoPct,
            tasaItbis:          item.tasaItbis,
            dependienteId:      item.dependienteId ?? null,
            dependienteNombre:  item.dependienteNombre || undefined,
          })),
          ...(contextoEscolar && {
            contextoEscolar: {
              matriculaId: contextoEscolar.matriculaId,
              conceptoId: contextoEscolar.conceptoId,
            },
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      router.push('/dashboard/facturas-recurrentes');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#eef0f7] min-h-full flex flex-col">
      <div className="p-3 sm:p-4 md:p-5 flex-1 flex flex-col">

        {contextoEscolar && !isEdit && (
          <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            Mensualidad de <b>{contextoEscolar.estudianteNombre}</b> · {contextoEscolar.periodo}. Tutor responsable: <b>{contextoEscolar.tutorNombre}</b>.
            Al guardar, plan queda ligado a esta matrícula; cron creará factura y cargo del mismo mes.
          </div>
        )}

        {/* Back nav */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900">
            <Link href="/dashboard/facturas-recurrentes">
              <ArrowLeft className="h-4 w-4 mr-1" />Volver
            </Link>
          </Button>
          <h1 className="text-lg font-semibold text-gray-700">
            {isEdit ? 'Editar factura recurrente' : 'Nueva factura recurrente'}
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <span className="text-red-500 mt-0.5 shrink-0 text-lg leading-none">!</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) e.preventDefault();
          }}
          className="flex-1 flex flex-col space-y-4"
        >
          <div className="space-y-4">
          {/* ── SPLIT LAYOUT: form left, sticky resumen right (solo xl+) ──── */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 xl:gap-5">
            {/* LEFT column */}
            <div className="space-y-4 min-w-0">

              {/* Empresa card — logo + nombre + RNC + Estado + Moneda */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 md:px-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <EmpresaBlock empresa={empresa} showCambiarEmpresa logoSize="md" />

                  <div className="flex items-start gap-8">
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide">Estado</p>
                      <div className="flex items-center gap-1.5 mt-1 justify-end">
                        <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                        <span className="text-sm font-medium text-gray-700">Borrador</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide">Moneda</p>
                      <p className="text-sm font-medium text-gray-700 mt-1">DOP</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SECCIÓN 1: Tipo de comprobante fiscal ──────────────────────── */}
          <SectionCard number={1} title="Tipo de comprobante fiscal" icon={Receipt}>
            <p className="text-xs text-gray-500 mb-4">
              Este tipo de comprobante se usará para todas las facturas generadas por esta suscripción.
            </p>
            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide">
                Tipo de factura <span className="text-red-500">*</span>
              </Label>
              <Select value={tipoEcf} onValueChange={handleChangeTipo}>
                <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ECF.filter(t => tipoVisible(t.value)).map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 bg-teal-50 border border-teal-100 rounded-lg p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-teal-700 mt-0.5 shrink-0" />
              <p className="text-xs text-teal-900 leading-relaxed">
                <span className="font-semibold">Importante:</span> Cambiar el tipo de comprobante afectará las próximas facturas de esta suscripción. Las facturas ya emitidas no se modificarán.
              </p>
            </div>
          </SectionCard>

              {/* ── SECCIÓN 2: Cliente ──────────────────────────────────────────── */}
          <SectionCard number={2} title="Cliente" icon={User}>
            <ClienteSection
              clienteSeleccionado={clienteSeleccionado}
              buscarClientes={buscarClientes}
              onSelectCliente={seleccionarCliente}
              onClearCliente={limpiarCliente}
              onOpenNuevoCliente={() => router.push('/dashboard/clientes/nuevo')}
              regla={regla}
              rncManual={rncManual} rncManualNombre={rncManualNombre}
              setRncManual={setRncManual} setRncManualNombre={setRncManualNombre}
              emailManual={emailManual} setEmailManual={setEmailManual}
              telefonoManual={telefonoManual} setTelefonoManual={setTelefonoManual}
              tipoEcf={tipoEcf} totalDocumento={totales.total}
            />
          </SectionCard>

          {/* ── SECCIÓN 3: Configuración de la suscripción ──────────────────── */}
          <SectionCard number={3} title="Configuración de la suscripción" icon={Calendar}>
            <div className="space-y-5">

              {/* Row 1: Nombre del plan + Descripción */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Nombre del plan <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Ej: Mensualidad colegio - Juan Pérez"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    className="mt-1 h-10"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Nombre interno para identificar este plan</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Descripción <span className="text-gray-400 text-[11px] font-normal normal-case">(opcional)</span>
                  </Label>
                  <Input
                    placeholder="Ej: Mensualidad por servicios educativos"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value.slice(0, 200))}
                    maxLength={200}
                    className="mt-1 h-10"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right">{descripcion.length}/200</p>
                </div>
              </div>

              {/* ── Subheader RECURRENCIA ── */}
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Recurrencia
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Frecuencia <span className="text-red-500">*</span>
                  </Label>
                  <Select value={frecuencia} onValueChange={setFrecuencia}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRECUENCIAS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Fecha de inicio <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={e => setFechaInicio(e.target.value)}
                    /* En edición, permitimos fechas pasadas (el plan ya existe). */
                    min={isEdit ? undefined : today}
                    className="mt-1 h-10"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Fecha de fin <span className="text-gray-400 text-[11px] font-normal normal-case">(opcional)</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="date"
                      value={fechaFin}
                      onChange={e => setFechaFin(e.target.value)}
                      min={fechaInicio || today}
                      className="h-10 pr-8"
                    />
                    {fechaFin && (
                      <button
                        type="button"
                        onClick={() => setFechaFin('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        title="Quitar fecha de fin"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Día de cobro <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={diaCobro ? String(diaCobro) : ''}
                    onValueChange={(v) => {
                      if (!fechaInicio) return;
                      const [y, m] = fechaInicio.split('-');
                      const nuevoDia = String(v).padStart(2, '0');
                      setFechaInicio(`${y}-${m}-${nuevoDia}`);
                    }}
                    disabled={!fechaInicio}
                  >
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Info pill: día de cobro */}
              {diaCobro && (
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                  <Info className="h-4 w-4 text-teal-700 shrink-0" />
                  <p className="text-sm text-teal-900">
                    {frecuencia === 'semanal'    && <>Se cobrará cada <span className="font-semibold">{new Date(fechaInicio + 'T00:00').toLocaleDateString('es-DO', { weekday: 'long' })}</span>.</>}
                    {frecuencia === 'quincenal'  && <>Se cobrará cada <span className="font-semibold">15 días</span> desde {formatFechaCorta(fechaInicio)}.</>}
                    {frecuencia === 'mensual'    && <>Se cobrará el día <span className="font-semibold">{diaCobro}</span> de cada mes.</>}
                    {frecuencia === 'trimestral' && <>Se cobrará cada <span className="font-semibold">3 meses</span> el día {diaCobro}.</>}
                    {frecuencia === 'anual'      && <>Se cobrará cada <span className="font-semibold">año</span> el día {diaCobro}.</>}
                  </p>
                </div>
              )}

              {/* ── Subheader PAGO ── */}
              <div className="flex items-center gap-3 pt-2">
                <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  <CreditCard className="h-3.5 w-3.5" />
                  Pago
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">
                    Condición de pago <span className="text-red-500">*</span>
                  </Label>
                  <Select value={tipoPago} onValueChange={setTipoPago}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_PAGO.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={`text-xs uppercase tracking-wide ${tipoPago === '2' ? 'text-gray-600' : 'text-gray-300'}`}>
                    Plazo de vencimiento {tipoPago === '2' && <span className="text-red-500">*</span>}
                  </Label>
                  <div className="relative mt-1 w-28">
                    <Input
                      type="number"
                      min={1}
                      value={diasParaPago}
                      onChange={(e) => setDiasParaPago(e.target.value)}
                      disabled={tipoPago !== '2'}
                      className="h-10 pr-10 disabled:bg-gray-50 disabled:text-gray-300"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
                  </div>
                </div>
              </div>

              {/* Info pill: vencimiento */}
              {tipoPago === '2' && diasParaPago && (
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                  <Info className="h-4 w-4 text-teal-700 shrink-0" />
                  <p className="text-sm text-teal-900">
                    Vence <span className="font-semibold">{diasParaPago} días</span> después de cada emisión.
                  </p>
                </div>
              )}

            </div>
          </SectionCard>

          {/* ── SECCIÓN 4: Productos o servicios ────────────────────────────── */}
          <SectionCard
            number={4}
            title="Productos o servicios"
            icon={Package}
            actions={
              <ColumnasToggle
                showReferencia={showItemRef}
                showDescripcion={showItemDesc}
                onToggleReferencia={handleToggleRef}
                onToggleDescripcion={handleToggleDesc}
              />
            }
          >
            <ItemsTable
              items={items}
              regla={regla}
              buscarProductos={buscarProductos}
              onSelectProducto={seleccionarProducto}
              onCrearProductoLibre={crearProductoLibre}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateItem={updateItem}
              onSelectBeneficiario={handleSelectBeneficiario}
              onOpenNuevoProducto={() => router.push('/dashboard/productos/nuevo')}
              showReferencia={showItemRef}
              showDescripcion={showItemDesc}
              dependientes={dependientesCliente}
            />

            {/* Totales */}
            <div className="pt-4 mt-3 border-t border-gray-100 flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatDOP(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>ITBIS</span>
                  <span>{formatDOP(totales.itbis)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-2 mt-2">
                  <span>Total estimado</span>
                  <span>{formatDOP(totales.total)}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── SECCIÓN 5: Términos y condiciones ───────────────────────────── */}
          <AccordionSection
            number={5} title="Términos y condiciones" icon={ScrollText}
            defaultOpen={terminosCondiciones.trim().length > 0}
          >
            <Terminos terminosCondiciones={terminosCondiciones} setTerminos={setTerminos} />
          </AccordionSection>

          {/* ── SECCIÓN 6: Notas ────────────────────────────────────────────── */}
          <AccordionSection
            number={6} title="Notas" icon={StickyNote}
            defaultOpen={notas.trim().length > 0}
          >
            <Notas notas={notas} setNotas={setNotas} />
          </AccordionSection>

          {/* ── SECCIÓN 7: Pie de factura ───────────────────────────────────── */}
          <AccordionSection
            number={7} title="Pie de factura" icon={FileText}
            defaultOpen={pieFactura.trim().length > 0}
          >
            <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} />
          </AccordionSection>

              {/* Cobro automático con tarjeta — feature no implementada, va al final del flow */}
              <button
                type="button"
                onClick={() => openProximamente('Cobro automático con tarjeta')}
                className="w-full flex items-center gap-3 bg-white border border-dashed border-gray-300 hover:border-teal-400 hover:bg-teal-50/40 rounded-xl p-3 text-left transition-colors group"
              >
                <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                  <CreditCard className="h-[18px] w-[18px] text-teal-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Cobro automático con tarjeta</p>
                  <p className="text-xs text-gray-500">
                    Descuenta el monto de una tarjeta cada período. Sin registrar pagos a mano. <span className="text-amber-700">(próximamente)</span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 shrink-0" />
              </button>
            </div>

            {/* RIGHT column — sticky sidebar */}
            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              {/* Resumen del plan */}
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                  <FileText className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Resumen del plan</h3>
                </header>
                <div className="px-4 py-3 space-y-2.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Tipo de comprobante</span>
                    <span className="bg-teal-50 text-teal-700 text-xs font-medium px-2 py-0.5 rounded">
                      {tipoEcf === '31' ? `Crédito fiscal (${tipoEcf})` :
                       tipoEcf === '32' ? `Consumo (${tipoEcf})` :
                       `e-CF (${tipoEcf})`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Frecuencia</span>
                    <span className="text-gray-900">{FRECUENCIA_LABEL[frecuencia] ?? frecuencia}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Día de cobro</span>
                    <span className="text-gray-900">{diaCobro ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Fecha de inicio</span>
                    <span className="text-gray-900">{fechaInicio ? formatFechaCorta(fechaInicio) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Próxima factura</span>
                    <span className="text-teal-700 font-medium">{proximaEmisionPreview ? formatFechaCorta(proximaEmisionPreview) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Clientes</span>
                    <span className="text-gray-900">{clienteSeleccionado ? 1 : 0}</span>
                  </div>
                </div>
                <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatDOP(totales.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Impuestos</span>
                    <span>{formatDOP(totales.itbis)}</span>
                  </div>
                </div>
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-gray-900">Total estimado</span>
                    <span className="text-lg font-bold text-teal-700">{formatDOP(totales.total)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Este es un cálculo estimado por emisión.</p>
                </div>
              </section>

              {/* Próximas facturas (3) */}
              {proximas3Emisiones.length > 0 && (
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <header className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Próximas facturas ({proximas3Emisiones.length})</h3>
                  </header>
                  <ul className="px-4 py-2 divide-y divide-gray-100">
                    {proximas3Emisiones.map((fecha, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="text-gray-700">{formatFechaCorta(fecha)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="bg-teal-50 text-teal-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            {FRECUENCIA_LABEL[frecuencia] ?? frecuencia}
                          </span>
                          <span className="text-gray-900 text-xs font-medium">{formatDOP(totales.total)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Notas info */}
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Notas</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Las facturas se generarán automáticamente según la frecuencia y configuración definidas.
                </p>
              </section>
            </aside>
          </div>

          </div>
          <BottomActionBar
            items={items}
            loading={loading}
            primaryLabel={isEdit ? 'Guardar cambios' : 'Guardar y activar suscripción'}
            loadingPrimaryLabel="Guardando…"
            onCancelar={() => router.push('/dashboard/facturas-recurrentes')}
          />
        </form>
      </div>

      {proximamenteDialog}
    </div>
  );
}
