'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
} from '@mui/material';
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
  beneficiario: { id: number; nombre: string } | null;
  producto: {
    id: number;
    nombre: string;
    descripcion: string | null;
    referencia: string | null;
    precioDOP: number;
    tasaItbis: ItemLinea['tasaItbis'];
    tipo: 'bien' | 'servicio';
    unidadMedida: string | null;
  } | null;
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
    if (!initialPlan?.items) {
      if (!contextoEscolar?.producto) return undefined;
      const producto = contextoEscolar.producto;
      return [{
        id: 1,
        productoId: producto.id,
        nombreItem: producto.nombre,
        referencia: producto.referencia ?? '',
        descripcionItem: producto.descripcion ?? '',
        cantidadItem: 1,
        precioUnitarioItem: producto.precioDOP,
        descuentoPct: 0,
        tasaItbis: producto.tasaItbis,
        indicadorBienoServicio: producto.tipo === 'bien' ? '1' : '2',
        unidadMedida: producto.unidadMedida ?? '',
        dependienteId: contextoEscolar.beneficiario?.id ?? null,
        dependienteNombre: contextoEscolar.beneficiario?.nombre ?? '',
      }];
    }
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
  }, [contextoEscolar, initialPlan?.items]);
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
    // contexto=facturacion: excluye lo que es solo del POS (cafetería).
    const res  = await fetch(`/api/productos?contexto=facturacion&q=${encodeURIComponent(q)}`);
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
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 2.5 }, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {contextoEscolar && !isEdit && (
          <div className="mb-4 rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-sm text-zero-900">
            Mensualidad de <b>{contextoEscolar.estudianteNombre}</b> · {contextoEscolar.periodo}. Tutor responsable: <b>{contextoEscolar.tutorNombre}</b>.
            Al guardar, plan queda ligado a esta matrícula; cron creará factura y cargo del mismo mes.
          </div>
        )}

        {/* Back nav */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Button
            component={Link}
            href="/dashboard/facturas-recurrentes"
            variant="text"
            size="small"
            startIcon={<ArrowLeft size={16} />}
            sx={{ textTransform: 'none', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            Volver
          </Button>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {isEdit ? 'Editar factura recurrente' : 'Nueva factura recurrente'}
          </Typography>
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) e.preventDefault();
          }}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* ── SPLIT LAYOUT: form left, sticky resumen right (solo xl+) ──── */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1fr) 320px' },
              gap: { xs: 2, xl: 2.5 },
            }}>
              {/* LEFT column */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>

                {/* Empresa card — logo + nombre + RNC + Estado + Moneda */}
                <Box sx={{
                  bgcolor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  px: { xs: 2, md: 2.5 },
                  py: 2,
                }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <EmpresaBlock empresa={empresa} showCambiarEmpresa logoSize="md" />

                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Estado
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, justifyContent: 'flex-end' }}>
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{ height: 8, width: 8, borderRadius: '50%', bgcolor: '#fbbf24', display: 'inline-block' }}
                          />
                          <Typography sx={{ fontSize: '14px', fontWeight: 500, color: 'text.primary' }}>
                            Sin emitir
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Moneda
                        </Typography>
                        <Typography sx={{ fontSize: '14px', fontWeight: 500, color: 'text.primary', mt: 0.5 }}>
                          DOP
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* ── SECCIÓN 1: Tipo de comprobante fiscal ──────────────────────── */}
                <SectionCard number={1} title="Tipo de comprobante fiscal" icon={Receipt}>
                  <Typography sx={{ fontSize: '12px', color: 'text.secondary', mb: 2 }}>
                    Este tipo de comprobante se usará para todas las facturas generadas por esta suscripción.
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Tipo de factura *</InputLabel>
                    <Select
                      value={tipoEcf}
                      label="Tipo de factura *"
                      onChange={(e) => handleChangeTipo(e.target.value)}
                      sx={{ borderRadius: '8px' }}
                    >
                      {TIPOS_ECF.filter(t => tipoVisible(t.value)).map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box sx={{
                    mt: 2,
                    bgcolor: '#eef2fe',
                    border: '1px solid #e0e7fd',
                    borderRadius: '8px',
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.25,
                  }}>
                    <Info size={16} style={{ color: '#2a45c4', marginTop: 2, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '12px', color: '#24377d', lineHeight: 1.6 }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>Importante:</Box>{' '}
                      Cambiar el tipo de comprobante afectará las próximas facturas de esta suscripción. Las facturas ya emitidas no se modificarán.
                    </Typography>
                  </Box>
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

                    {/* Row 1: Nombre del plan + Descripción */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Nombre del plan <Box component="span" sx={{ color: 'error.main' }}>*</Box>
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Ej: Mensualidad colegio - Juan Pérez"
                          value={nombre}
                          onChange={e => setNombre(e.target.value)}
                          required
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        />
                        <Typography sx={{ fontSize: '10px', color: 'text.disabled', mt: 0.5 }}>
                          Nombre interno para identificar este plan
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Descripción{' '}
                          <Box component="span" sx={{ color: 'text.disabled', fontSize: '11px', fontWeight: 400, textTransform: 'none' }}>(opcional)</Box>
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Ej: Mensualidad por servicios educativos"
                          value={descripcion}
                          onChange={e => setDescripcion(e.target.value.slice(0, 200))}
                          slotProps={{ htmlInput: { maxLength: 200 } }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        />
                        <Typography sx={{ fontSize: '10px', color: 'text.disabled', mt: 0.5, textAlign: 'right' }}>
                          {descripcion.length}/200
                        </Typography>
                      </Box>
                    </Box>

                    {/* ── Subheader RECURRENCIA ── */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        bgcolor: '#eef2fe',
                        color: '#2a45c4',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        px: 1.25,
                        py: 0.5,
                        borderRadius: '6px',
                      }}>
                        <RefreshCw size={14} />
                        Recurrencia
                      </Box>
                      <Box sx={{ flex: 1, height: '1px', bgcolor: '#e5e7eb' }} />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4,1fr)' }, gap: 1.5 }}>
                      {/* Frecuencia */}
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Frecuencia <Box component="span" sx={{ color: 'error.main' }}>*</Box>
                        </Typography>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={frecuencia}
                            onChange={(e) => setFrecuencia(e.target.value)}
                            sx={{ borderRadius: '8px' }}
                            displayEmpty
                          >
                            {FRECUENCIAS.map(f => (
                              <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>

                      {/* Fecha de inicio */}
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Fecha de inicio <Box component="span" sx={{ color: 'error.main' }}>*</Box>
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          type="date"
                          value={fechaInicio}
                          onChange={e => setFechaInicio(e.target.value)}
                          slotProps={{ htmlInput: { min: isEdit ? undefined : today } }}
                          required
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        />
                      </Box>

                      {/* Fecha de fin */}
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Fecha de fin{' '}
                          <Box component="span" sx={{ color: 'text.disabled', fontSize: '11px', fontWeight: 400, textTransform: 'none' }}>(opcional)</Box>
                        </Typography>
                        <Box sx={{ position: 'relative' }}>
                          <TextField
                            size="small"
                            fullWidth
                            type="date"
                            value={fechaFin}
                            onChange={e => setFechaFin(e.target.value)}
                            slotProps={{ htmlInput: { min: fechaInicio || today } }}
                            sx={{
                              '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                              '& input': { pr: fechaFin ? 4.5 : undefined },
                            }}
                          />
                          {fechaFin && (
                            <IconButton
                              size="small"
                              onClick={() => setFechaFin('')}
                              title="Quitar fecha de fin"
                              sx={{
                                position: 'absolute',
                                right: 6,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                p: 0.25,
                                color: 'text.disabled',
                                '&:hover': { color: 'text.secondary' },
                              }}
                            >
                              <X size={14} />
                            </IconButton>
                          )}
                        </Box>
                      </Box>

                      {/* Día de cobro */}
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Día de cobro <Box component="span" sx={{ color: 'error.main' }}>*</Box>
                        </Typography>
                        <FormControl size="small" fullWidth disabled={!fechaInicio}>
                          <Select
                            value={diaCobro ? String(diaCobro) : ''}
                            displayEmpty
                            renderValue={(v) => v || '—'}
                            onChange={(e) => {
                              if (!fechaInicio) return;
                              const [y, m] = fechaInicio.split('-');
                              const nuevoDia = String(e.target.value).padStart(2, '0');
                              setFechaInicio(`${y}-${m}-${nuevoDia}`);
                            }}
                            sx={{ borderRadius: '8px' }}
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                              <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    </Box>

                    {/* Info pill: día de cobro */}
                    {diaCobro && (
                      <Box sx={{
                        bgcolor: '#eef2fe',
                        border: '1px solid #e0e7fd',
                        borderRadius: '8px',
                        px: 1.5,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                      }}>
                        <Info size={16} style={{ color: '#2a45c4', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '14px', color: '#24377d' }}>
                          {frecuencia === 'semanal'    && <>Se cobrará cada <Box component="span" sx={{ fontWeight: 600 }}>{new Date(fechaInicio + 'T00:00').toLocaleDateString('es-DO', { weekday: 'long' })}</Box>.</>}
                          {frecuencia === 'quincenal'  && <>Se cobrará cada <Box component="span" sx={{ fontWeight: 600 }}>15 días</Box> desde {formatFechaCorta(fechaInicio)}.</>}
                          {frecuencia === 'mensual'    && <>Se cobrará el día <Box component="span" sx={{ fontWeight: 600 }}>{diaCobro}</Box> de cada mes.</>}
                          {frecuencia === 'trimestral' && <>Se cobrará cada <Box component="span" sx={{ fontWeight: 600 }}>3 meses</Box> el día {diaCobro}.</>}
                          {frecuencia === 'anual'      && <>Se cobrará cada <Box component="span" sx={{ fontWeight: 600 }}>año</Box> el día {diaCobro}.</>}
                        </Typography>
                      </Box>
                    )}

                    {/* ── Subheader PAGO ── */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 1 }}>
                      <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        bgcolor: '#eef2fe',
                        color: '#2a45c4',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        px: 1.25,
                        py: 0.5,
                        borderRadius: '6px',
                      }}>
                        <CreditCard size={14} />
                        Pago
                      </Box>
                      <Box sx={{ flex: 1, height: '1px', bgcolor: '#e5e7eb' }} />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                      {/* Condición de pago */}
                      <Box>
                        <Typography sx={{ fontSize: '11px', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                          Condición de pago <Box component="span" sx={{ color: 'error.main' }}>*</Box>
                        </Typography>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={tipoPago}
                            onChange={(e) => setTipoPago(e.target.value)}
                            sx={{ borderRadius: '8px' }}
                          >
                            {TIPOS_PAGO.map(t => (
                              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>

                      {/* Plazo de vencimiento */}
                      <Box>
                        <Typography sx={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          mb: 0.5,
                          color: tipoPago === '2' ? 'text.secondary' : 'text.disabled',
                        }}>
                          Plazo de vencimiento{' '}
                          {tipoPago === '2' && <Box component="span" sx={{ color: 'error.main' }}>*</Box>}
                        </Typography>
                        <Box sx={{ position: 'relative', width: 112 }}>
                          <TextField
                            size="small"
                            type="number"
                            value={diasParaPago}
                            onChange={(e) => setDiasParaPago(e.target.value)}
                            disabled={tipoPago !== '2'}
                            slotProps={{ htmlInput: { min: 1 } }}
                            sx={{
                              '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                              '& input': { pr: 5 },
                            }}
                          />
                          <Typography sx={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '12px',
                            color: 'text.disabled',
                            pointerEvents: 'none',
                          }}>
                            días
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Info pill: vencimiento */}
                    {tipoPago === '2' && diasParaPago && (
                      <Box sx={{
                        bgcolor: '#eef2fe',
                        border: '1px solid #e0e7fd',
                        borderRadius: '8px',
                        px: 1.5,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                      }}>
                        <Info size={16} style={{ color: '#2a45c4', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '14px', color: '#24377d' }}>
                          Vence <Box component="span" sx={{ fontWeight: 600 }}>{diasParaPago} días</Box> después de cada emisión.
                        </Typography>
                      </Box>
                    )}

                  </Box>
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
                  <Box sx={{ pt: 2, mt: 1.5, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                    <Box sx={{ width: 288, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Subtotal</Typography>
                        <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>{formatDOP(totales.subtotal)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>ITBIS</Typography>
                        <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>{formatDOP(totales.itbis)}</Typography>
                      </Box>
                      <Box sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #e5e7eb',
                        pt: 1,
                        mt: 0.5,
                      }}>
                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: 'text.primary' }}>Total estimado</Typography>
                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: 'text.primary' }}>{formatDOP(totales.total)}</Typography>
                      </Box>
                    </Box>
                  </Box>
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

                {/* Cobro automático con tarjeta — feature no implementada */}
                <Box
                  component="button"
                  type="button"
                  onClick={() => openProximamente('Cobro automático con tarjeta')}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    bgcolor: '#fff',
                    border: '1px dashed #d1d5db',
                    borderRadius: '12px',
                    p: 1.5,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background-color 0.15s',
                    '&:hover': {
                      borderColor: '#8193f5',
                      bgcolor: 'rgba(240,253,250,0.4)',
                      '& .chevron-icon': { color: '#3658e1' },
                    },
                  }}
                >
                  <Box sx={{
                    height: 36,
                    width: 36,
                    borderRadius: '8px',
                    bgcolor: '#e0e7fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <CreditCard size={18} style={{ color: '#2a45c4' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '14px', fontWeight: 500, color: 'text.primary' }}>
                      Cobro automático con tarjeta
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: 'text.secondary' }}>
                      Descuenta el monto de una tarjeta cada período. Sin registrar pagos a mano.{' '}
                      <Box component="span" sx={{ color: '#92400e' }}>(próximamente)</Box>
                    </Typography>
                  </Box>
                  <Box sx={{ color: '#d1d5db', flexShrink: 0, transition: 'color 0.15s' }}>
                    <ChevronRight size={16} />
                  </Box>
                </Box>
              </Box>

              {/* RIGHT column — sticky sidebar */}
              <Box
                component="aside"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  xl: { position: 'sticky', top: 16, alignSelf: 'flex-start' },
                  position: { xl: 'sticky' },
                  top: { xl: 16 },
                  alignSelf: { xl: 'flex-start' },
                }}
              >
                {/* Resumen del plan */}
                <Box component="section" sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                  <Box
                    component="header"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 2,
                      py: 1.5,
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <FileText size={16} style={{ color: '#4b5563' }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>
                      Resumen del plan
                    </Typography>
                  </Box>
                  <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Tipo de comprobante</Typography>
                      <Chip
                        label={
                          tipoEcf === '31' ? `Crédito fiscal (${tipoEcf})` :
                          tipoEcf === '32' ? `Consumo (${tipoEcf})` :
                          `e-CF (${tipoEcf})`
                        }
                        size="small"
                        sx={{ bgcolor: '#eef2fe', color: '#2a45c4', fontWeight: 500, height: 22, fontSize: '12px' }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Frecuencia</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.primary' }}>{FRECUENCIA_LABEL[frecuencia] ?? frecuencia}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Día de cobro</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.primary' }}>{diaCobro ?? '—'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Fecha de inicio</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.primary' }}>{fechaInicio ? formatFechaCorta(fechaInicio) : '—'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Próxima factura</Typography>
                      <Typography sx={{ fontSize: '14px', color: '#2a45c4', fontWeight: 500 }}>
                        {proximaEmisionPreview ? formatFechaCorta(proximaEmisionPreview) : '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Clientes</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.primary' }}>{clienteSeleccionado ? 1 : 0}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ borderTop: '1px solid #f3f4f6', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Subtotal</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>{formatDOP(totales.subtotal)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>Impuestos</Typography>
                      <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>{formatDOP(totales.itbis)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ borderTop: '1px solid #f3f4f6', px: 2, py: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>Total estimado</Typography>
                      <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#2a45c4' }}>{formatDOP(totales.total)}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: '10px', color: 'text.disabled', mt: 0.5 }}>
                      Este es un cálculo estimado por emisión.
                    </Typography>
                  </Box>
                </Box>

                {/* Próximas facturas (3) */}
                {proximas3Emisiones.length > 0 && (
                  <Box component="section" sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                    <Box
                      component="header"
                      sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6' }}
                    >
                      <Typography sx={{ fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>
                        Próximas facturas ({proximas3Emisiones.length})
                      </Typography>
                    </Box>
                    <Box component="ul" sx={{ px: 2, py: 1, m: 0, listStyle: 'none', p: 0 }}>
                      {proximas3Emisiones.map((fecha, i) => (
                        <Box
                          key={i}
                          component="li"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            py: 1,
                            borderBottom: i < proximas3Emisiones.length - 1 ? '1px solid #f3f4f6' : 'none',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Calendar size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            <Typography sx={{ fontSize: '14px', color: 'text.primary' }}>{formatFechaCorta(fecha)}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <Chip
                              label={FRECUENCIA_LABEL[frecuencia] ?? frecuencia}
                              size="small"
                              sx={{ bgcolor: '#eef2fe', color: '#2a45c4', fontWeight: 500, height: 18, fontSize: '10px' }}
                            />
                            <Typography sx={{ fontSize: '12px', fontWeight: 500, color: 'text.primary' }}>
                              {formatDOP(totales.total)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Notas info */}
                <Box component="section" sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', px: 2, py: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <StickyNote size={16} style={{ color: '#4b5563' }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>Notas</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '12px', color: 'text.secondary', lineHeight: 1.6 }}>
                    Las facturas se generarán automáticamente según la frecuencia y configuración definidas.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          <BottomActionBar
            items={items}
            loading={loading}
            primaryLabel={isEdit ? 'Guardar cambios' : 'Guardar y activar suscripción'}
            loadingPrimaryLabel="Guardando…"
            onCancelar={() => router.push('/dashboard/facturas-recurrentes')}
          />
        </Box>
      </Box>

      {proximamenteDialog}
    </Box>
  );
}
