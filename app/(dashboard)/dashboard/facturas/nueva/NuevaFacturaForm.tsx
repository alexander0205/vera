'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Alert,
  Box,
  Button,
  Chip,
  Typography,
} from '@mui/material';
import {
  AlertTriangle, CheckCircle, User, Calendar, Package, FileText,
  StickyNote, ScrollText, MessageSquare, CreditCard, Send,
  GraduationCap, Loader2, Printer,
} from 'lucide-react';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { getCategoriaDeEcf, CATEGORIAS_ECF, esTipoCompraGasto } from '@/lib/ecf/categorias';

import { NavBar, TopBar } from './sections/TopBar';
import { CompactHeader } from './sections/CompactHeader';
import { ConfirmarMetodoPagoDialog, type ResumenMetodo } from '@/components/pagos/ConfirmarMetodoPagoDialog';
import { labelMetodo } from '@/lib/pagos/metodos';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { FacturaOrigenSection, type FacturaResumen } from './sections/FacturaOrigenSection';
import { SectionCard } from './sections/SectionCard';
import { AccordionSection } from './sections/AccordionSection';
import { ClienteSection } from './sections/ClienteSection';
import { GastoDatosSection } from './sections/GastoDatosSection';
import { DetallesSection, MOTIVOS_NOTA } from './sections/DetallesSection';
import { ItemsTable } from './sections/ItemsTable';
import { ClasificacionFactura, type ClasifAsig } from './sections/ClasificacionFactura';
import { ColumnasToggle } from './sections/ColumnasToggle';
import { RetencionesSection } from './sections/RetencionesSection';
import { ResumenSidebar } from './sections/ResumenSidebar';
import type { PagoLinea } from '@/components/pagos/PagoMetodos';
import { sumaPagos } from '@/components/pagos/PagoMetodos';
import { Terminos, Notas } from './sections/TerminosNotas';
import { PieFactura } from './sections/PieFactura';
import { Comentarios } from './sections/Comentarios';
import { BottomActionBar } from './sections/BottomActionBar';
import { EsqueletoFactura } from './sections/EsqueletoFactura';
import { Pasos } from './sections/Pasos';

import { ModalNuevoCliente } from './modals/ModalNuevoCliente';
import { ModalNuevoProducto } from './modals/ModalNuevoProducto';
import { ModalNuevoAlmacen } from './modals/ModalNuevoAlmacen';
import { ModalNuevaLista } from './modals/ModalNuevaLista';
import { ModalNuevoVendedor } from './modals/ModalNuevoVendedor';
import { ModalAbrirCaja } from './modals/ModalAbrirCaja';
import { ModalSeleccionarVariante } from './modals/ModalSeleccionarVariante';
import { ModalPreviewPDF } from './modals/ModalPreviewPDF';
import { ModalEditarNCF } from './modals/ModalEditarNCF';
import { ModalEnviarCorreo } from './modals/ModalEnviarCorreo';

import { useSecuencia } from './hooks/useSecuencia';
import { useDropdownsCatalog } from './hooks/useDropdownsCatalog';
import { useItemsState } from './hooks/useFacturaState';

import { calcularTotales } from './utils/calculos';
import { buildPayload as buildPayloadFn } from './utils/buildPayload';
import { validate as validateEcf } from '@/lib/factura/validator';
import type {
  BorradorInicial, Cliente, EmpresaPerfil, ItemLinea, Producto,
  ResultadoEmision, Retencion, VariantePick,
} from './utils/types';

// Re-export for callers that import from this module.
export type { BorradorInicial, EmpresaPerfil };

/**
 * Opciones de `emitir()`. `metodoConfirmado` marca que el doble-check del
 * método de pago ya se aceptó, para no reabrir el diálogo en la segunda vuelta.
 */
type EmitirOpts = {
  andThen?: 'nueva' | 'imprimir' | 'correo' | 'cobrar';
  metodoConfirmado?: boolean;
};

export default function NuevaFacturaForm({
  initialPerfil,
  initialData,
  categoriaFija,
  cargosIniciales,
  clienteInicial,
  previsto,
  onVolver,
  sinRedirigirAlVincular = false,
  modoColegio = false,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData?:  BorradorInicial | null;
  /** Fija la categoría de documento por ruta → oculta el selector de categoría. */
  categoriaFija?: string;
  /**
   * Cargos escolares con los que arrancar, equivalente a `?desdeCargos=1,2,3`.
   *
   * Para cuando el formulario NO vive en su propia ruta y no hay URL donde
   * poner el parámetro — hoy, el cajón de la ficha de familia.
   */
  cargosIniciales?: number[];
  /**
   * A quién se le factura, cuando no hay ningún cargo del que deducirlo.
   *
   * El cajón de la familia sacaba el cliente del prefill de los cargos, y una
   * familia al día no tiene ninguno: el formulario abría en blanco —sin
   * comprador, sin beneficiarios y por tanto sin columna de beneficiario— justo
   * en la ficha donde el comprador se está mirando. Con esto, «Nueva factura»
   * arranca con la familia puesta aunque no deba nada.
   *
   * No pisa al prefill: si vienen cargos, manda el comprador que resuelvan
   * ellos, que es el que garantiza que los cargos y la factura sean del mismo.
   */
  clienteInicial?: { id: number; razonSocial: string; rnc: string | null;
    email: string | null; telefono: string | null } | null;
  /**
   * Qué hace «Volver» de la barra de arriba.
   *
   * Por defecto vuelve al listado de facturas. Dentro de un cajón eso navega
   * la página de DEBAJO y se pierde la ficha desde la que se estaba
   * facturando, así que allí «Volver» tiene que cerrar el cajón.
   */
  onVolver?: () => void;
  /**
   * Un mes del calendario que TODAVÍA no es deuda.
   *
   * Llega desde «Adelantar»: la cuota existe en el plan de pagos pero nadie ha
   * creado el cargo. Entra como una línea más y el cargo NACE AL VINCULAR, ya
   * con la factura emitida — si el usuario cierra sin guardar, no queda un mes
   * cobrándose porque alguien abrió una pantalla y se arrepintió.
   */
  previsto?: { matriculaId: number; cuotaId: number; conceptoId: number } | null;
  /**
   * No saltar a la ficha del estudiante después de vincular los cargos.
   *
   * Dentro del cajón el formulario está ENCIMA de la ficha de la familia: el
   * `router.push` cambiaba la página de debajo mientras el cajón seguía
   * abierto, y al cerrarlo se aparecía en otro sitio.
   */
  sinRedirigirAlVincular?: boolean;
  /**
   * Ajusta el formulario a lo que necesita un colegio.
   *
   * Tres cosas, y las tres se OCULTAN Y SE FUERZAN a la vez —enseñar una
   * factura distinta de la que se envía sería el peor de los dos mundos—:
   *
   *   · ITBIS: la enseñanza está exenta, así que la columna de impuesto sobra
   *     y todas las líneas quedan en exento.
   *   · Tipo de ingresos: en una institución educativa siempre es 01, el giro
   *     del negocio. Se manda 01 y no se pregunta.
   *   · Plazo de vencimiento: no aplica al contado, que es como entra todo lo
   *     que se factura desde la ficha de familia. Reaparece si la pasan a
   *     crédito, porque ahí la DGII sí lo exige.
   */
  modoColegio?: boolean;
}) {
  const router  = useRouter();
  const empresa = initialPerfil;

  // ── Items iniciales desde borrador ─────────────────────────────────────────
  const itemsIniciales: ItemLinea[] = useMemo(() => {
    if (!initialData?.lineasJson) return [];
    try {
      const parsed = JSON.parse(initialData.lineasJson) as Array<Partial<ItemLinea>>;
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
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Query params: ?tipo=33|34 [&padreId=N] ─────────────────────────────────
  // tipo → tipo e-CF + categoría iniciales (links "Nueva Nota de Crédito/Débito"
  // y "crear nota desde factura"). Debe resolverse como ESTADO INICIAL, no en un
  // effect: cambiar el value de un Radix Select mientras su item seleccionado se
  // desmonta dispara onValueChange('') y rompe la selección.
  const searchParams = useSearchParams();
  const qpTipo    = !initialData && searchParams.get('tipo') && TIPO_ECF_REGLAS[searchParams.get('tipo')!]
    ? searchParams.get('tipo')!
    : null;
  const qpPadreId = !initialData ? searchParams.get('padreId') : null;
  // ?desdeCargo=N → prefill desde un cargo escolar (cliente=tutor, dependiente=
  // estudiante, línea=producto del concepto). Solo lee/pre-llena; NO toca el
  // motor de emisión. Ver /api/administracion-escolar/cargos/[id]/prefill-factura.
  //
  // `cargosIniciales` hace lo mismo por prop en vez de por URL. Existe porque
  // este formulario ya no solo vive en su ruta: la ficha de la familia lo abre
  // en un cajón lateral, y ahí la URL es la del responsable —no hay dónde
  // colgar el parámetro sin ensuciar su dirección y su historial—.
  const qpDesdeCargo = !initialData ? searchParams.get('desdeCargo') : null;
  // ?desdeCargos=1,2,3 → una sola factura que cubre varios meses (N cargos).
  const qpDesdeCargos = !initialData
    ? searchParams.get('desdeCargos')
    : null;

  // Categoría fija por ruta (factura/NC/ND/compras/gastos). Si está presente,
  // oculta el selector de categoría y el tipo arranca en el de esa categoría.
  const catFijaObj = categoriaFija ? CATEGORIAS_ECF.find(c => c.id === categoriaFija) : null;
  const tipoDefaultCatFija = catFijaObj
    ? (catFijaObj.id === 'factura-venta' ? 'sin-ncf' : catFijaObj.tipos[0].codigo)
    : null;

  // '00' = marcador HISTORICA (sin e-CF real) → en el form equivale a 'sin-ncf'.
  const [tipoEcf, setTipoEcf]         = useState(
    initialData?.tipoEcf && initialData.tipoEcf !== '00'
      ? initialData.tipoEcf
      : (qpTipo ?? tipoDefaultCatFija ?? 'sin-ncf'),
  );
  const [categoriaId, setCategoriaId] = useState(
    categoriaFija
      ?? (initialData?.tipoEcf && initialData.tipoEcf !== '00'
            ? getCategoriaDeEcf(initialData.tipoEcf).id
            : qpTipo
              ? getCategoriaDeEcf(qpTipo).id
              : 'factura-venta'),
  );

  // Ocultar el selector de categoría: con categoría fija por ruta, o al editar
  // un borrador (no se cambia el tipo de un documento ya creado).
  const ocultarCategoria = !!categoriaFija || !!initialData;

  // Gasto (e43/e47): primero un registro interno de salida de dinero. Emitir a
  // la DGII es opcional (queda en el menú "Más opciones"), así que la acción
  // primaria guarda como interno en vez de forzar la emisión fiscal.
  const esGasto = tipoEcf === '43' || tipoEcf === '47';
  // Compra (41) + gasto (43/47): en el editor de líneas registras lo que
  // COMPRASTE, no lo que vendes. Se usa SOLO para el comportamiento de la tabla
  // (texto libre, sin catálogo de venta, precios editables); el resto del
  // formulario sigue distinguiendo compra vs gasto con `esGasto`.
  const esCompraGasto = esTipoCompraGasto(tipoEcf);
  // Compra (e41) vs gasto (e43/e47): mismo chrome de "salida de dinero"
  // (proveedor, pago, sin catálogo de venta), pero con etiquetas propias.
  const esCompra = tipoEcf === '41';
  const nounSalida = esCompra ? 'compra' : 'gasto';

  // Título de la pantalla según la categoría de documento.
  const tituloDoc = ({
    'nota-credito': { nuevo: 'Nueva nota de crédito', editar: 'Editar nota de crédito' },
    'nota-debito':  { nuevo: 'Nueva nota de débito',  editar: 'Editar nota de débito' },
    'compras':      { nuevo: 'Nueva compra',          editar: 'Editar compra' },
    'gastos':       { nuevo: 'Nuevo gasto',           editar: 'Editar gasto' },
  } as Record<string, { nuevo: string; editar: string }>)[categoriaId]
    ?? { nuevo: 'Nueva factura', editar: 'Editar factura' };

  // Acento + nomenclatura por tipo de documento (factura / NC / ND).
  // Distingue la pantalla con el color del botón primario y la etiqueta del total.
  // Clases Tailwind LITERALES — sin interpolar el color — para que el JIT las incluya.
  const docAccent = ({
    'nota-credito': {
      noun: 'nota de crédito', totalLabel: 'Total a acreditar',
      primaryBtnClass: 'bg-amber-600 hover:bg-amber-700 border-amber-700',
    },
    'nota-debito': {
      noun: 'nota de débito', totalLabel: 'Total a debitar',
      primaryBtnClass: 'bg-blue-600 hover:bg-blue-700 border-blue-700',
    },
  } as Record<string, { noun: string; totalLabel: string; primaryBtnClass: string }>)[categoriaId]
    ?? { noun: 'factura', totalLabel: 'Total',
         primaryBtnClass: 'bg-zero-600 hover:bg-zero-700 border-zero-700' };

  // Base de ruta del detalle/listado según el tipo — para que al crear una NC/ND
  // se aterrice en su vista propia (no en la de factura).
  const detalleBase =
    categoriaId === 'nota-credito' ? '/dashboard/notas-credito'
    : categoriaId === 'nota-debito' ? '/dashboard/notas-debito'
    : categoriaId === 'compras' ? '/dashboard/compras'
    : categoriaId === 'gastos' ? '/dashboard/gastos'
    : '/dashboard/facturas';

  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // ── Clasificación por maestros (Plan A) ─────────────────────────────────────
  const [clasificacion, setClasificacion] = useState<ClasifAsig[]>([]);

  // ── Origen: cargo(s) escolar(es) (prefill vía ?desdeCargo / ?desdeCargos) ────
  // Si esta factura nace de cargos escolares, guardamos sus id + saldo para
  // ofrecer, en la pantalla de éxito, "volver al estudiante y vincular". Una
  // sola factura puede cubrir varios meses (N cargos → 1 factura).
  const [origenCargos, setOrigenCargos] = useState<{ id: number; saldoCentavos: number }[]>([]);

  /**
   * Todas las deudas cobrables del alumno —marcadas o no— tal como las devolvió
   * el prefill. Alimentan el buscador de productos para poder añadir otro mes
   * sin salir de la factura.
   */
  type OpcionEscolar = {
    cargoId: number; estudianteId: number; seleccionado: boolean;
    saldoCentavos: number; mes: number | null; anio: number;
    linea?: PrefillCargo['linea']; contexto: string;
  };
  const [opcionesEscolares, setOpcionesEscolares] = useState<OpcionEscolar[]>([]);
  const [saldandoCargo, setSaldandoCargo] = useState(false);

  // ── Cliente / comprador ────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState(initialData?.rncComprador ?? '');
  const [rncManualNombre, setRncManualNombre] = useState(initialData?.razonSocialComprador ?? '');
  const [emailManual, setEmailManual]         = useState(initialData?.emailComprador ?? '');
  const [telefonoManual, setTelefonoManual]   = useState(initialData?.telefonoComprador ?? '');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  // ── Dependientes (por línea) ───────────────────────────────────────────────
  const [dependientesCliente, setDependientesCliente] = useState<
    { id: number; nombre: string; apellido: string }[]
  >([]);
  // Si hay borrador con clientId, cargar dependientes al montar
  useEffect(() => {
    if (!initialData?.clientId) return;
    fetch(`/api/clientes/${initialData.clientId}/dependientes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data.dependientes) ? data.dependientes : [];
        setDependientesCliente(lista);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha de emisión editable — solo roles con este permiso (admin/owner) y
  // solo aplica a sin-ncf. Ver CompactHeader y app/api/ecf/emitir/route.ts.
  const { can, isLoading: permLoading } = usePermissions();
  /**
   * Sin `facturas:precio-editar` el precio y el descuento de cada línea quedan
   * en solo lectura.
   *
   * Mientras el permiso carga NO se bloquea nada: `can()` responde false por
   * defecto y trancaría la pantalla al dueño durante un instante. El servidor
   * revalida al guardar, así que esa ventana no abre nada.
   */
  const bloquearPrecios = !permLoading && !can('facturas:precio-editar');
  const puedeEditarFecha = can('facturas:fecha-personalizada');

  // ── Condición de pago ──────────────────────────────────────────────────────
  // DGII: 1=contado, 2=crédito, 3=gratuito, 4=uso/consumo.
  // Editar borrador → arranca con la fecha guardada (soporta backdating al
  // re-guardar). Factura nueva → hoy.
  const [fechaEmision, setFechaEmision] = useState(
    () => initialData?.fechaEmision ?? new Date().toISOString().slice(0, 10),
  );
  // Datos propios de un gasto. Los nombres rnc/razón social heredados del motor
  // se presentan como proveedor en esta ruta; no se crea ningún cliente.
  const [categoriaGasto, setCategoriaGasto] = useState(initialData?.categoriaGasto ?? 'Materiales y suministros');
  const [ncfProveedor, setNcfProveedor] = useState(initialData?.ncfProveedor ?? '');
  const [fechaGasto, setFechaGasto] = useState(
    () => initialData?.fechaGasto ?? new Date().toISOString().slice(0, 10),
  );
  // Factura NUEVA → arranca con el default del team (si hay plazo > 0 → crédito).
  // Editar borrador → respeta el tipoPago guardado.
  const [condicionPago, setCondicionPago] = useState(() => {
    if (initialData?.tipoPago != null) return String(initialData.tipoPago);
    const dias = empresa?.plazoPagoDefaultDias;
    return dias != null && dias > 0 ? '2' : '1';
  });
  // Días para pago (solo aplica si condición = crédito). Al editar un borrador a
  // crédito con vencimiento guardado, derivamos los días desde la diferencia de fechas.
  const [diasParaPago, setDiasParaPago] = useState(() => {
    if (initialData?.tipoPago === 2 && initialData.fechaLimitePago) {
      const emis = new Date(`${new Date().toISOString().slice(0, 10)}T00:00`);
      const venc = new Date(`${initialData.fechaLimitePago.slice(0, 10)}T00:00`);
      // En edición la fecha de emisión arranca en hoy; usamos hoy como base coherente
      // con el cálculo del effect. Si el borrador trae fechaEmision propia, el effect
      // recalculará el vencimiento; aquí solo inferimos los días iniciales.
      const diff = Math.round((venc.getTime() - emis.getTime()) / 86400000);
      return String(diff >= 1 ? diff : (empresa?.plazoPagoDefaultDias ?? 5));
    }
    return String(empresa?.plazoPagoDefaultDias ?? 5);
  });
  const [fechaLimitePago, setFechaLimitePago] = useState(() => {
    if (initialData) return initialData.fechaLimitePago ?? '';
    const dias = empresa?.plazoPagoDefaultDias;
    if (dias != null && dias > 0) {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      return d.toISOString().slice(0, 10);
    }
    return '';
  });

  // Deriva el vencimiento: crédito → fechaEmision + N días; cualquier otra
  // condición → sin vencimiento.
  useEffect(() => {
    if (condicionPago === '2') {
      const n = parseInt(diasParaPago || '0', 10);
      if (fechaEmision && n > 0) {
        const d = new Date(`${fechaEmision}T00:00`);
        d.setDate(d.getDate() + n);
        setFechaLimitePago(d.toISOString().slice(0, 10));
      } else {
        setFechaLimitePago('');
      }
    } else {
      setFechaLimitePago('');
    }
  }, [condicionPago, diasParaPago, fechaEmision]);
  const [ncfModificado, setNcfModificado]     = useState(initialData?.ncfModificado ?? '');
  const [motivoNota, setMotivoNotaRaw]        = useState<string>('');
  const [codigoModificacion, setCodigoModificacion] = useState<string>('');
  const [fechaNcfModificado, setFechaNcfModificado] = useState<string>('');

  // e-NCF modificado con formato válido (E + 10-12 dígitos). Permite emitir una
  // NC/ND aunque la factura de origen no tenga e-CF en el sistema (p. ej. emitida
  // fuera de emitedo): el usuario escribe el e-NCF real y se confía en él.
  const ncfModificadoValido = /^E\d{10,12}$/.test(ncfModificado.trim());
  const [razonModificacion, setRazonModificacion]   = useState<string>('');

  const setMotivoNota = (v: string) => {
    setMotivoNotaRaw(v);
    const found = MOTIVOS_NOTA.find((m) => m.value === v);
    setCodigoModificacion(found ? String(found.codigo) : '');
    if (v !== 'otro') setRazonModificacion('');
  };
  const [tipoIngresos, setTipoIngresos]       = useState<string>('1');

  // ── Prefill "crear nota desde factura" (?padreId=N) ────────────────────────
  // Pre-llena NCF modificado, fecha, cliente y líneas del padre; persiste el
  // vínculo origenDocumentoId. El tipo/categoría ya quedaron en el estado inicial.
  const [padreNota, setPadreNota] = useState<{
    id: number; codigo: string | null; encf: string; estado: string; conEcfReal: boolean;
    tipoEcf?: string;
    montoTotal?: string; razonSocial?: string; fechaEmision?: string;
  } | null>(null);

  // Factura de origen sin-ncf (sin comprobante fiscal): no tiene e-NCF ni lo
  // tendrá → la nota es interna (borrador), sin referencia DGII (no se pide e-NCF).
  // Sin habilitación en DGII la nota se guarda como documento interno en vez
  // de reservar un e-NCF fiscal que no se puede emitir. Conserva el tipo 33/34
  // para que siga saliendo en su listado: los listados filtran por tipoEcf.
  const { enProduccion } = useTiposDisponibles();
  const esPadreSinNcf = padreNota?.tipoEcf === 'sin-ncf' || !enProduccion;
  // Combina el toggle por-empresa con el permiso por-rol: la alerta sale solo
  // si la empresa la tiene activa Y el rol del usuario puede verla.
  const alertaMetodoPago = !!empresa?.alertaMetodoPagoActivo && can('pagos:alerta-metodo');

  // Aplica una factura padre (payload de /api/facturas/:id) al formulario:
  // e-NCF modificado, fecha, cliente y líneas. Reutilizado por el prefill via
  // ?padreId y por el selector de factura de origen en NC/ND.
  function aplicarPadre(p: {
    id?: number; codigo?: string | null; encf?: string; estado?: string; tipoEcf?: string;
    fechaEmision?: string | null;
    montos?: { montoTotalDOP?: string };
    comprador?: { clienteId?: number; razonSocial?: string | null; rnc?: string | null; email?: string | null; telefono?: string | null };
    lineas?: Array<Record<string, unknown>>;
  }) {
    if (!p?.id) return;
    const conEcfReal = typeof p.encf === 'string' && /^E\d/.test(p.encf);
    setPadreNota({
      id: p.id, codigo: p.codigo ?? null, encf: p.encf ?? '', estado: p.estado ?? '', conEcfReal,
      tipoEcf:      p.tipoEcf,
      montoTotal:   p.montos?.montoTotalDOP,
      razonSocial:  p.comprador?.razonSocial ?? undefined,
      fechaEmision: p.fechaEmision ? String(p.fechaEmision).slice(0, 10) : undefined,
    });
    if (conEcfReal && p.encf) setNcfModificado(p.encf);
    if (p.fechaEmision) setFechaNcfModificado(String(p.fechaEmision).slice(0, 10));
    // Comprador del padre
    if (p.comprador?.clienteId) {
      seleccionarCliente({
        id:          p.comprador.clienteId,
        razonSocial: p.comprador.razonSocial ?? '',
        rnc:         p.comprador.rnc ?? null,
        email:       p.comprador.email ?? null,
        telefono:    p.comprador.telefono ?? null,
      });
    } else {
      const rnc = p.comprador?.rnc ?? '';
      setRncManual(rnc);
      setRncManualNombre(p.comprador?.razonSocial ?? '');
      setEmailManual(p.comprador?.email ?? '');
      // Try to match to a registered client by RNC so the autocomplete prefills
      if (rnc) {
        fetch(`/api/clientes?q=${encodeURIComponent(rnc)}`)
          .then(r => r.json())
          .then((data) => {
            const match = (data.clientes as Cliente[] | undefined)?.find(c => c.rnc === rnc);
            if (match) seleccionarCliente(match);
          })
          .catch(() => {});
      }
    }
    // Copiar líneas del padre — SOLO en NC (devolución/descuento sobre esos ítems).
    // En ND (tipo 33) es un cargo nuevo (mora, interés, flete) → NO se copian; el
    // usuario agrega el cargo manualmente. El cliente sí se carga (arriba).
    if (tipoEcf !== '33' && Array.isArray(p.lineas) && p.lineas.length > 0) {
      const its: ItemLinea[] = p.lineas.map((l: Record<string, unknown>, i: number) => ({
        id:                     i + 1,
        productoId:             typeof l.productoId === 'number' ? l.productoId : undefined,
        nombreItem:             String(l.nombreItem ?? ''),
        referencia:             String(l.referencia ?? ''),
        descripcionItem:        String(l.descripcionItem ?? ''),
        cantidadItem:           Number(l.cantidadItem) || 1,
        precioUnitarioItem:     Number(l.precioUnitarioItem) || 0,
        descuentoPct:           Number(l.descuentoPct) || 0,
        tasaItbis:              (['0.18', '0.16', '0', 'exento'].includes(String(l.tasaItbis))
                                  ? String(l.tasaItbis) : 'exento') as ItemLinea['tasaItbis'],
        indicadorBienoServicio: String(l.indicadorBienoServicio) === '1' ? '1' : '2',
        dependienteId:          typeof l.dependienteId === 'number' ? l.dependienteId : null,
        dependienteNombre:      String(l.dependienteNombre ?? ''),
      }));
      dispatchItems({ type: 'SET', items: its });
    }
  }

  // Carga la factura padre por id (fetch + aplicarPadre).
  function cargarPadre(padreId: number) {
    fetch(`/api/facturas/${padreId}`)
      .then(r => r.json())
      .then(aplicarPadre)
      .catch(() => {});
  }

  type PrefillCargo = {
    cargo?: { id: number; saldoCentavos: number };
    comprador?: { clienteId: number; razonSocial?: string | null; rnc?: string | null; email?: string | null; telefono?: string | null } | null;
    linea?: {
      productoId?: number | null; nombreItem?: string; cantidadItem?: number;
      precioUnitarioItem?: number; tasaItbis?: string; indicadorBienoServicio?: string;
      dependienteId?: number | null; dependienteNombre?: string;
    };
    advertencias?: string[];
  };

  /**
   * Lo que devuelve la ruta plural.
   *
   * Trae dos cosas que la ruta por cargo no tiene y que la factura necesita:
   * de qué MES es cada línea y DÓNDE está matriculado el alumno. Sin eso, la
   * colegiatura de septiembre y la de octubre salen como dos líneas idénticas
   * que dicen «Pago de colegiatura», y meses después la factura no se explica.
   */
  type CtxEscolar = { periodo: string | null; servicio: string | null; grado: string | null; curso: string | null };
  type PrefillPlural = {
    comprador?: PrefillCargo['comprador'];
    estudiantes?: { id: number; contexto: CtxEscolar }[];
    opciones?: {
      cargoId: number;
      estudianteId: number;
      seleccionado: boolean;
      saldoCentavos: number;
      mes: number | null;
      anio: number;
      linea?: PrefillCargo['linea'];
    }[];
  };

  const MESES_LINEA = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  /** «2026-2027 · Primario · Primero A» — igual que lo escribe el diálogo rápido. */
  function contextoATexto(c: CtxEscolar | undefined): string {
    if (!c) return '';
    return [c.periodo, c.servicio, [c.grado, c.curso].filter(Boolean).join(' ')]
      .filter(Boolean).join(' · ');
  }

  // Convierte la línea del prefill en un ItemLinea del formulario.
  function lineaCargoAItem(l: NonNullable<PrefillCargo['linea']>, id: number): ItemLinea {
    return {
      id,
      productoId:             typeof l.productoId === 'number' ? l.productoId : undefined,
      nombreItem:             String(l.nombreItem ?? ''),
      referencia:             '',
      descripcionItem:        '',
      cantidadItem:           Number(l.cantidadItem) || 1,
      precioUnitarioItem:     Number(l.precioUnitarioItem) || 0,
      descuentoPct:           0,
      tasaItbis:              (['0.18', '0.16', '0', 'exento'].includes(String(l.tasaItbis))
                                ? String(l.tasaItbis) : 'exento') as ItemLinea['tasaItbis'],
      indicadorBienoServicio: String(l.indicadorBienoServicio) === '1' ? '1' : '2',
      dependienteId:          typeof l.dependienteId === 'number' ? l.dependienteId : null,
      dependienteNombre:      String(l.dependienteNombre ?? ''),
    };
  }

  // Prefill desde uno o varios cargos escolares. Con varios, cada cargo aporta
  // UNA línea (su mes) y la factura los cubre todos: un solo documento que se
  // vincula a los N cargos al terminar (N cargos → 1 factura). El cliente
  // (tutor) y beneficiario (estudiante) son compartidos. Solo pre-llena.
  function aplicarPrefillCargos(payloads: PrefillCargo[]) {
    const validos = payloads.filter((p) => p?.cargo?.id);
    if (validos.length === 0) return;
    setOrigenCargos(validos.map((p) => ({ id: p.cargo!.id, saldoCentavos: p.cargo!.saldoCentavos })));

    const comprador = validos.find((p) => p.comprador?.clienteId)?.comprador;
    if (comprador?.clienteId) {
      seleccionarCliente({
        id:          comprador.clienteId,
        razonSocial: comprador.razonSocial ?? '',
        rnc:         comprador.rnc ?? null,
        email:       comprador.email ?? null,
        telefono:    comprador.telefono ?? null,
      });
    }

    const items = validos
      .filter((p) => p.linea)
      .map((p, i) => lineaCargoAItem(p.linea!, i + 1));
    if (items.length) dispatchItems({ type: 'SET', items });

    // Advertencias deduplicadas (no repetir la misma por cada mes).
    const vistas = new Set<string>();
    validos.forEach((p) => (p.advertencias ?? []).forEach((msg) => {
      if (!vistas.has(msg)) { vistas.add(msg); toast.warning(msg, { duration: 7000 }); }
    }));
  }

  // Carga el prefill de N cargos (en paralelo) y los aplica.
  function cargarPrefillCargos(cargoIds: number[]) {
    Promise.all(cargoIds.map((cargoId) =>
      fetch(`/api/administracion-escolar/cargos/${cargoId}/prefill-factura`)
        .then((r) => r.ok ? r.json() : Promise.reject()),
    ))
      .then(aplicarPrefillCargos)
      .catch(() => toast.error('No se pudieron cargar los cargos para prefacturar.'))
      .finally(() => setCargandoPrefill(false));
  }

  /**
   * Prefill escolar por la ruta plural. Es la que usa el cajón de la familia.
   *
   * Se prefiere sobre la ruta por cargo por dos motivos. Uno: un mes previsto
   * no tiene id que pedir, y esta lo resuelve contra el plan de pagos sin crear
   * la deuda. Dos: devuelve el mes y el grado de cada línea, que es lo que
   * distingue «Pago de colegiatura — Septiembre 2026 · 2026-2027 · Primario ·
   * Primero A» de un «Pago de colegiatura» a secas repetido diez veces.
   */
  function cargarPrefillEscolar(
    cargoIds: number[], p?: { matriculaId: number; cuotaId: number; conceptoId: number } | null,
  ) {
    fetch('/api/administracion-escolar/cargos/prefill-factura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cargoIds, previsto: p ?? undefined }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? 'No se pudo preparar la factura');
        return j;
      })
      .then((datos: PrefillPlural) => {
        // Solo lo que viene marcado: el resto son las otras deudas del alumno,
        // que aquí se ofrecían para añadir y en el formulario grande se añaden
        // buscando el producto.
        // Las NO marcadas también se guardan: son las otras deudas del alumno,
        // y hasta ahora se tiraban. Sin ellas, quien ya está dentro de la
        // factura y quiere añadir otro mes tiene que salir y empezar de nuevo,
        // porque el buscador solo mira el catálogo y una mensualidad no es un
        // producto. Ahora alimentan el buscador (ver `buscarProductos`).
        const ctxTodos = new Map((datos.estudiantes ?? []).map((e) => [e.id, e.contexto]));
        setOpcionesEscolares(
          (datos.opciones ?? [])
            .filter((o) => o.linea && o.saldoCentavos > 0)
            .map((o) => ({ ...o, contexto: contextoATexto(ctxTodos.get(o.estudianteId)) })),
        );

        const elegidas = (datos.opciones ?? []).filter((o) => o.seleccionado);
        if (elegidas.length === 0) return;

        setOrigenCargos(
          elegidas.filter((o) => o.cargoId > 0)
            .map((o) => ({ id: o.cargoId, saldoCentavos: o.saldoCentavos })),
        );

        const c = datos.comprador;
        if (c?.clienteId) {
          seleccionarCliente({
            id: c.clienteId, razonSocial: c.razonSocial ?? '',
            rnc: c.rnc ?? null, email: c.email ?? null, telefono: c.telefono ?? null,
          });
        }

        // El contexto es el del alumno de CADA línea, no el del primero: con
        // hermanos en grados distintos, una sola descripción pondría «Primero»
        // debajo de la mensualidad del que va en Quinto.
        const ctxPorAlumno = new Map((datos.estudiantes ?? []).map((e) => [e.id, e.contexto]));
        const its = elegidas.filter((o) => o.linea).map((o, i) => {
          const item = lineaCargoAItem(o.linea!, i + 1);
          return {
            ...item,
            nombreItem: o.mes ? `${item.nombreItem} — ${MESES_LINEA[o.mes]} ${o.anio}` : item.nombreItem,
            descripcionItem: contextoATexto(ctxPorAlumno.get(o.estudianteId)) || item.descripcionItem,
          };
        });
        if (its.length) dispatchItems({ type: 'SET', items: its });
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'No se pudo preparar la factura');
      })
      // Pase lo que pase se quita: si la carga falló hay que poder escribir la
      // factura a mano, no quedarse mirando el esqueleto para siempre.
      .finally(() => setCargandoPrefill(false));
  }

  /**
   * Ir a otra pantalla desde el formulario.
   *
   * Dentro del cajón, `router.push` cambia la página que está DEBAJO mientras
   * el cajón sigue encima: se cierra y uno aparece en otro sitio sin haber
   * pedido irse. Ahí la factura se abre en una pestaña aparte y la ficha de la
   * familia se queda donde estaba.
   */
  function irA(url: string) {
    if (sinRedirigirAlVincular) { window.open(url, '_blank', 'noopener'); return; }
    router.push(url);
  }

  // Cierra el loop: vincula la factura recién creada a TODOS los cargos de
  // origen (uno o varios meses) y vuelve al perfil del estudiante. Solo
  // disponible si la factura nació de cargos escolares (?desdeCargo[s]).
  async function saldarCargoConFactura(documentoId: number) {
    if (origenCargos.length === 0 && !previsto) return;
    if (cargosVinculados) return;
    setSaldandoCargo(true);
    let estudianteId: number | undefined;
    try {
      // El mes adelantado se vuelve cargo justo ahora, no al abrir la pantalla:
      // la factura ya existe, así que la deuda que se crea tiene con qué
      // saldarse. Al revés quedaría un mes cobrándose por una factura que
      // quizá nunca se guardó.
      const aVincular = [...origenCargos];
      if (previsto) {
        const r = await fetch(`/api/administracion-escolar/matriculas/${previsto.matriculaId}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cuotaId: previsto.cuotaId, conceptoId: previsto.conceptoId, accion: 'adelantar',
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.cargoId) throw new Error(j.error ?? 'No se pudo preparar el mes por adelantado');
        aVincular.push({ id: j.cargoId, saldoCentavos: 0 });
      }

      for (const oc of aVincular) {
        const res = await fetch(`/api/administracion-escolar/cargos/${oc.id}/saldar-con-factura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ecfDocumentId: documentoId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No se pudo vincular el cargo');
        estudianteId = data.cargo?.estudianteId ?? estudianteId;
      }
      // «Registra el cobro» solo si de verdad falta cobrarlo. Guardando la
      // factura con el pago puesto —el camino normal en el cajón— el aviso
      // mandaba a hacer algo que acababa de hacerse, encima de una pantalla
      // que dice «Estado: Pagada».
      const yaCobrado = pagoRecibido && sumaPagos(pagoLineas) > 0;
      const cuantos = aVincular.length > 1
        ? `${aVincular.length} cargos vinculados a la factura`
        : 'Cargo vinculado a la factura';
      toast.success(yaCobrado ? `${cuantos}.` : `${cuantos}. Registra el cobro en la factura.`);
      setCargosVinculados(true);
      if (sinRedirigirAlVincular) { setSaldandoCargo(false); return; }
      router.push(estudianteId
        ? `/escolar/estudiantes/${estudianteId}`
        : '/escolar/estudiantes');
    } catch (e) {
      setSaldandoCargo(false);
      toast.error(e instanceof Error ? e.message : 'No se pudo vincular el cargo');
    }
  }

  // Limpia el vínculo con la factura de origen (mantiene cliente/líneas editables).
  function limpiarPadre() {
    setPadreNota(null);
    setNcfModificado('');
    setFechaNcfModificado('');
  }

  // Busca facturas candidatas como origen de una NC/ND (excluye notas 33/34).
  async function buscarFacturas(q: string): Promise<FacturaResumen[]> {
    const res  = await fetch(`/api/facturas?search=${encodeURIComponent(q)}&limit=20`);
    const data = await res.json();
    return ((data.docs ?? []) as FacturaResumen[]).filter(d => d.tipoEcf !== '33' && d.tipoEcf !== '34');
  }

  useEffect(() => {
    if (initialData) return; // editar borrador manda sobre los query params
    if (qpPadreId) { cargarPadre(Number(qpPadreId)); return; }
    // El cajón de la familia (cargos por prop) y «Adelantar» van por la plural.
    // Los `?desdeCargo[s]` de la URL siguen por la ruta por cargo: los usan
    // otras pantallas y no hace falta moverlas para esto.
    if (previsto || cargosIniciales?.length) {
      cargarPrefillEscolar(cargosIniciales ?? [], previsto);
      return;
    }
    if (qpDesdeCargos) {
      const ids = qpDesdeCargos.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) cargarPrefillCargos(ids); else setCargandoPrefill(false);
    } else if (qpDesdeCargo) {
      cargarPrefillCargos([Number(qpDesdeCargo)]);
    } else {
      // Sin cargos de los que deducir el comprador, pero la pantalla que abrió
      // el formulario ya sabe a quién le factura. Va por `seleccionarCliente`
      // y no poniendo el RNC a mano porque es lo que además trae los
      // beneficiarios: sin eso la columna del hijo no existe.
      if (clienteInicial) seleccionarCliente(clienteInicial);
      setCargandoPrefill(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Hay un prefill en camino y todavía no hay nada que enseñar.
   *
   * Se decide en el primer render, no dentro del efecto: si arrancara en false
   * el formulario vacío alcanzaría a pintarse un cuadro antes de que el efecto
   * lo pusiera en true, que es justo el parpadeo que esto viene a quitar.
   *
   * Editar un borrador no espera a nadie: sus datos vienen con el HTML.
   */
  /**
   * En qué paso va la factura del cajón: 1 «Factura», 2 «Pago y envío».
   *
   * El 3 no es un paso de este estado sino la pantalla de `resultado`, que ya
   * existía: cuando la factura sale, el formulario entero se sustituye por el
   * comprobante con su e-NCF, su código de seguridad y su PDF.
   *
   * Solo en modo colegio. En la pantalla de siempre el formulario cabe entero
   * con su barra lateral, y partirlo en dos le añadiría un clic a quien hoy
   * factura de una sentada.
   */
  const [paso, setPaso] = useState<1 | 2>(1);
  /**
   * Si el formulario va partido en pasos.
   *
   * Se nombra aparte de `modoColegio` porque lo que decide no es el colegio
   * sino la FORMA: donde hay pasos, hay un «al final» al que mandar la
   * emisión, y donde no lo hay, guardar y emitir siguen siendo el mismo gesto.
   */
  const enPasos = modoColegio;

  /** Los cargos de origen ya quedaron atados a la factura. */
  const [cargosVinculados, setCargosVinculados] = useState(false);

  const [cargandoPrefill, setCargandoPrefill] = useState(
    !initialData && Boolean(previsto || cargosIniciales?.length || qpDesdeCargo || qpDesdeCargos),
  );

  // ── Items (useReducer) ─────────────────────────────────────────────────────
  const [items, dispatchItems] = useItemsState(itemsIniciales);

  // Deja en exento todo lo que entre —precargado, nuevo o traído de un
  // producto— mientras el emisor esté exento.
  useEffect(() => {
    if (!modoColegio) return;
    if (items.some((i) => i.tasaItbis !== 'exento')) dispatchItems({ type: 'FORCE_EXENTO' });
  }, [modoColegio, items]);

  // 01 · Operaciones (giro del negocio). Es lo que se le manda a la DGII con
  // el campo oculto, y se fija por si un borrador traía otro valor.
  useEffect(() => {
    if (modoColegio && tipoIngresos !== '1') setTipoIngresos('1');
  }, [modoColegio, tipoIngresos]);

  /*
    El colegio factura SIN NCF, y punto.

    No es una preferencia: este colegio no emite comprobantes fiscales, y la
    cabecera ofrecía e31 y e32 en un desplegable. Un clic de más convertía la
    factura de una familia en un e-CF firmado camino de la DGII —número de la
    secuencia gastado, sin deshacer—. Se fija aquí además de esconder el
    desplegable, por si el tipo llega de otro sitio (un borrador viejo, la URL).
  */
  useEffect(() => {
    if (modoColegio && tipoEcf !== 'sin-ncf') setTipoEcf('sin-ncf');
  }, [modoColegio, tipoEcf]);

  const [showNuevoProductoIdx, setShowNuevoProductoIdx] = useState<number | null>(null);

  // ── Retenciones ────────────────────────────────────────────────────────────
  const [retenciones, setRetenciones] = useState<Retencion[]>(() => {
    if (!initialData?.retenciones) return [];
    try { return JSON.parse(initialData.retenciones); } catch { return []; }
  });

  // ── Items columns visibility (Referencia/Descripción) — persistido ────────
  const [showItemRef, setShowItemRef] = useState(false);
  const [showItemDesc, setShowItemDesc] = useState(false);
  // Apagado por defecto: la mayoría de las facturas no llevan descuento y la
  // casilla vacía en cada renglón robaba ancho a lo que sí se escribe.
  const [showItemDescuento, setShowItemDescuento] = useState(false);
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      const cols = prefs.itemsCols ?? {};
      // Auto-show si borrador tiene contenido
      const hasRef = (initialData?.lineasJson ? JSON.parse(initialData.lineasJson) : items).some(
        (i: { referencia?: string }) => (i.referencia ?? '').trim().length > 0,
      );
      const hasDesc = (initialData?.lineasJson ? JSON.parse(initialData.lineasJson) : items).some(
        (i: { descripcionItem?: string }) => (i.descripcionItem ?? '').trim().length > 0,
      );
      setShowItemRef(Boolean(cols.referencia) || hasRef);
      setShowItemDesc(Boolean(cols.descripcion) || hasDesc);
      const hasDescuento = (initialData?.lineasJson ? JSON.parse(initialData.lineasJson) : items).some(
        (i: { descuentoPct?: number }) => Number(i.descuentoPct ?? 0) > 0,
      );
      setShowItemDescuento(Boolean(cols.descuento) || hasDescuento);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function persistCols(ref: boolean, desc: boolean, descuento: boolean = showItemDescuento) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs.itemsCols = { referencia: ref, descripcion: desc, descuento };
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }
  function handleToggleRef(v: boolean) { setShowItemRef(v); persistCols(v, showItemDesc); }
  function handleToggleDesc(v: boolean) { setShowItemDesc(v); persistCols(showItemRef, v); }
  function handleToggleDescuento(v: boolean) { setShowItemDescuento(v); persistCols(showItemRef, showItemDesc, v); }

  // ── NCF gear modal ─────────────────────────────────────────────────────────
  const [showEditarNcf, setShowEditarNcf]     = useState(false);
  const [ncfPieFactura, setNcfPieFactura]     = useState('');
  const [ncfSiguienteNum, setNcfSiguienteNum] = useState('');
  const [ncfFechaVenc, setNcfFechaVenc]       = useState('');
  const [ncfSaving, setNcfSaving]             = useState(false);
  const [ncfError,  setNcfError]              = useState<string | null>(null);

  const [notas, setNotas]                  = useState(initialData?.notas ?? '');
  // En una factura nueva se precargan los términos por defecto de la empresa.
  // Al editar una existente NO: si el usuario los borró, borrados se quedan.
  const [terminosCondiciones, setTerminos] = useState(
    initialData ? (initialData.terminosCondiciones ?? '') : (empresa?.terminosCondicionesDefault ?? ''),
  );
  /**
   * Doble confirmación del método de pago.
   *
   * Cuando la factura registra un cobro se pide reconfirmar el método antes de
   * emitir: registrar efectivo como transferencia descuadra el cierre de caja y
   * nadie lo nota hasta el arqueo. Guarda el `emitir()` pendiente.
   */
  const [confirmMetodo, setConfirmMetodo] = useState<
    null | { modo: 'emitir' | 'borrador'; opts?: EmitirOpts }
  >(null);
  const [pieFactura, setPieFactura]        = useState(initialData?.pieFactura ?? '');

  // ── Pago recibido ──────────────────────────────────────────────────────────
  // Al editar un borrador con split, restauramos las líneas desde initialData.
  // Un gasto normalmente ya se pagó al registrarlo (saliste con el dinero), así
  // que arranca como pagado; una venta arranca sin cobro. Se puede desmarcar.
  const [pagoRecibido, setPagoRecibido] = useState(initialData?.pagoRecibido ?? esCompraGasto);
  const [pagoFecha, setPagoFecha]       = useState(
    initialData?.pagoFecha ?? new Date().toISOString().slice(0, 10),
  );
  // Líneas de pago (1 línea = pago normal; el repeater permite agregar más).
  const [pagoLineas, setPagoLineas] = useState<PagoLinea[]>(
    initialData?.pagoLineas && initialData.pagoLineas.length > 0
      ? initialData.pagoLineas
      : [{ metodo: 'efectivo', valor: '', cuenta: '' }],
  );

  // Aviso al guardar una factura de venta marcada "de contado" que queda sin
  // pago y la empresa tiene mora configurada. Guarda el emitir() pendiente.
  const [confirmContado, setConfirmContado] = useState<
    null | { modo: 'emitir' | 'borrador'; opts?: EmitirOpts }
  >(null);

  // Sin turno de caja abierto el backend bloquea guardar/emitir con code
  // CAJA_SIN_TURNO (solo si la empresa tiene caja habilitada). Guarda el
  // emitir() pendiente para reintentarlo al abrir el turno desde el modal.
  const [abrirCajaPend, setAbrirCajaPend] = useState<
    null | { modo: 'emitir' | 'borrador'; opts?: EmitirOpts }
  >(null);

  // Producto con variantes recién elegido en una línea: guarda a qué línea aplica
  // y el producto, hasta que el usuario escoja la variante en el selector.
  const [variantePickFor, setVariantePickFor] = useState<
    null | { idx: number; producto: Producto }
  >(null);
  // "No volver a mostrar": persistido en localStorage (por navegador).
  const [ocultarAvisoContado, setOcultarAvisoContado] = useState(false);
  // Estado del checkbox dentro del diálogo (se reinicia al abrir).
  const [noMostrarContado, setNoMostrarContado] = useState(false);

  function persistOcultarAvisoContado() {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs.ocultarAvisoContado = true;
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
    setOcultarAvisoContado(true);
  }

  const [comentario, setComentario] = useState(initialData?.comentario ?? '');

  // ── Enviar por correo modal ────────────────────────────────────────────────
  const [showEnviarCorreo, setShowEnviarCorreo]   = useState(false);
  const [emailEnviar, setEmailEnviar]             = useState('');
  const [emailSending, setEmailSending]           = useState(false);
  const [correoDocumentoId, setCorreoDocumentoId] = useState<number | null>(null);
  const [correoEncf, setCorreoEncf]               = useState<string>('');

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  /**
   * Si un envío falla, el backend guarda un borrador que CONSERVA el e-NCF ya
   * consumido y devuelve su id. Guardarlo aquí hace que el siguiente intento
   * vaya por /api/facturas/{id}/emitir-ecf, que REUSA ese mismo número en vez
   * de tomar el siguiente y dejar un hueco en la secuencia.
   */
  const [reservaDocId, setReservaDocId] = useState<number | null>(null);
  // Mirror error → toast (más visible, no requiere scroll para verlo)
  useEffect(() => { if (error) toast.error(error, { duration: 6500 }); }, [error]);
  const [resultado, setResultado]       = useState<ResultadoEmision | null>(null);
  // Draft por-categoría: sin el sufijo, `new` era una key compartida y un
  // borrador de gasto (e43/e47) se restauraba en el form de compras/factura,
  // arrastrándolos a modo gasto. Cada ruta nueva tiene su propio borrador.
  //
  // El colegio va aparte por lo mismo: la categoría es «factura-venta» en los
  // dos sitios, así que el cajón de la familia y /dashboard/facturas/nueva
  // compartían borrador y el cajón abría con el tipo de comprobante y el RNC
  // de la última factura normal que alguien empezó y no terminó.
  const [draftKey] = useState(() =>
    `emitedo:draft:${initialData?.id ?? `new-${categoriaId}${modoColegio ? '-colegio' : ''}`}`);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [vistaPrevia, setVistaPrevia]   = useState(false);
  // Vista previa = PDF en blob URL (NO crea factura en DB). Ver /api/pdf/factura/preview.
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // Guard atómico anti doble-submit: el `loading` (state React) no bloquea clicks
  // disparados en el mismo tick. Este ref sí, de forma síncrona.
  const submittingRef = useRef(false);
  // ── Tracking anti-duplicados ────────────────────────────────────────────────
  // fid = id único por MONTAJE del form (distingue 2 pestañas / re-montajes).
  // submitSeq = nº de submit dentro de este montaje (distingue doble-click/retry).
  // Se manda en cada submit como `_traza` y se loguea server-side junto al docId.
  const formInstanceId = useRef('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).current;
  const submitSeqRef   = useRef(0);

  // ── TOP SECTION: Almacén / Lista / Vendedor ───────────────────────────────
  const [showAlmacen, setShowAlmacen]               = useState(false);
  const [showListaPrecios, setShowListaPrecios]     = useState(false);
  const [showVendedor, setShowVendedor]             = useState(false);

  const [almacenId, setAlmacenId]                   = useState<number | null>(initialData?.almacenId ?? null);
  const [almacenNombre, setAlmacenNombre]           = useState('');
  const [listaPreciosId, setListaPreciosId]         = useState<number | null>(initialData?.listaPreciosId ?? null);
  const [listaPreciosNombre, setListaPreciosNombre] = useState('');
  const [vendedorId, setVendedorId]                 = useState<number | null>(initialData?.vendedorId ?? null);
  const [vendedorNombre, setVendedorNombre]         = useState('');

  const {
    almacenes, setAlmacenes,
    listasPrecios, setListasPrecios,
    vendedores, setVendedores,
  } = useDropdownsCatalog();

  const [showNuevoAlmacen, setShowNuevoAlmacen]   = useState(false);
  const [showNuevaLista, setShowNuevaLista]       = useState(false);
  const [showNuevoVendedor, setShowNuevoVendedor] = useState(false);

  // ── Próximo NCF ───────────────────────────────────────────────────────────
  const onPieDeFactura = useCallback((p: string) => setPieFactura(p), []);
  const { secuencia, invalidar: invalidarSecuencia } = useSecuencia(tipoEcf, onPieDeFactura);

  // ── Load visibility prefs from localStorage ───────────────────────────────
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      if (prefs.almacen)      setShowAlmacen(true);
      if (prefs.listaPrecios) setShowListaPrecios(true);
      if (prefs.vendedor)     setShowVendedor(true);
    } catch {}
  }, []);

  // ── Autosave: restore draft on mount (only when no initialData) ───────────
  useEffect(() => {
    if (initialData) { setDraftHydrated(true); return; }
    // Prefill por query params (nota desde factura) manda sobre el draft local.
    if (qpTipo || qpPadreId) { setDraftHydrated(true); return; }
    /*
      El comprador ya viene decidido: el borrador local no pinta nada.

      Este efecto y el del prefill corren los dos al montar, y el borrador
      ganaba: restauraba `rncManual`, `telefonoManual` y `tipoEcf` sueltos, sin
      el objeto `clienteSeleccionado` —que nunca se guarda—. El resultado era
      un cajón con el RNC y el teléfono puestos pero SIN cliente: el buscador
      volvía a salir en vez del cliente bloqueado, no se pedían los
      beneficiarios y la columna del hijo desaparecía de la tabla.

      Y lo peor no se veía: `rncManualNombre` de un cliente podía quedarse
      encima del RNC de otro, que es una factura con el nombre de A y la cédula
      de B camino de la DGII.
    */
    if (clienteInicial || previsto || cargosIniciales?.length || qpDesdeCargo || qpDesdeCargos) {
      setDraftHydrated(true);
      return;
    }
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tipoEcf)             setTipoEcf(data.tipoEcf);
        if (data.rncManual)           setRncManual(data.rncManual);
        if (data.rncManualNombre)     setRncManualNombre(data.rncManualNombre);
        if (data.emailManual)         setEmailManual(data.emailManual);
        if (data.telefonoManual)      setTelefonoManual(data.telefonoManual);
        if (data.notas)               setNotas(data.notas);
        if (data.terminosCondiciones) setTerminos(data.terminosCondiciones);
        if (data.comentario)          setComentario(data.comentario);
        if (data.tipoIngresos)        setTipoIngresos(data.tipoIngresos);
        // Retenciones NO se restauran desde autosave (alto impacto en total — usuario debe re-elegir)
      }
    } catch {}
    setDraftHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave: persist draft (debounced) ───────────────────────────────────
  useEffect(() => {
    if (!draftHydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          tipoEcf, rncManual, rncManualNombre, emailManual, telefonoManual,
          notas, terminosCondiciones, comentario, tipoIngresos, retenciones,
          savedAt: Date.now(),
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [
    draftHydrated, draftKey, tipoEcf, rncManual, rncManualNombre, emailManual,
    telefonoManual, notas, terminosCondiciones, comentario, tipoIngresos, retenciones,
  ]);

  function toggleOpcion(key: string, value: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs[key] = value;
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }

  // ── Apply lista de precios a items ────────────────────────────────────────
  useEffect(() => {
    if (!listaPreciosId) return;
    const lista = listasPrecios.find(l => l.id === listaPreciosId);
    if (!lista || lista.tipo !== 'porcentaje' || lista.porcentaje <= 0) return;
    dispatchItems({ type: 'APPLY_LISTA_PORC', porcentaje: lista.porcentaje });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaPreciosId]);

  const today = new Date().toISOString().slice(0, 10);

  // ─── Búsqueda clientes ────────────────────────────────────────────────────
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
    // Limpiar dependientes y beneficiarios de items al cambiar cliente
    setDependientesCliente([]);
    dispatchItems({ type: 'CLEAR_BENEFICIARIOS' });
    // Fetch dependientes del cliente
    fetch(`/api/clientes/${c.id}/dependientes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data.dependientes) ? data.dependientes : [];
        setDependientesCliente(lista);
      })
      .catch(() => setDependientesCliente([]));
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

  function handleSelectBeneficiario(itemId: number, depId: number | null, nombreCompleto: string) {
    dispatchItems({ type: 'UPDATE_BENEFICIARIO', id: itemId, dependienteId: depId, dependienteNombre: nombreCompleto });
    if (depId) setError(null); // limpiar el banner de "falta beneficiario" al elegir uno
  }

  // ─── Búsqueda productos ───────────────────────────────────────────────────
  /**
   * Cuotas del plan de un alumno, en forma de producto, para que el buscador
   * las pueda ofrecer. Solo las de ESE beneficiario: con hermanos en la misma
   * factura, mezclarlas haría cobrarle a uno la mensualidad del otro.
   *
   * El `id` va en negativo para no chocar nunca con un producto real.
   */
  function cuotasComoProductos(dependienteId: number | null | undefined, q: string): Producto[] {
    if (!dependienteId || opcionesEscolares.length === 0) return [];
    const texto = q.trim().toLowerCase();

    return opcionesEscolares
      .filter((o) => o.estudianteId === dependienteId)
      // Lo que ya está en la factura no se vuelve a ofrecer: añadir dos veces
      // el mismo mes es cobrarlo dos veces.
      .filter((o) => !items.some((it) => it.cuotaClave === `${o.estudianteId}:${o.cargoId}:${o.mes ?? 0}:${o.anio}`))
      .map((o) => {
        const nombre = o.mes
          ? `${o.linea!.nombreItem} — ${MESES_LINEA[o.mes]} ${o.anio}`
          : String(o.linea!.nombreItem);
        return {
          id: -(o.cargoId || (o.estudianteId * 100 + (o.mes ?? 0))),
          nombre,
          descripcion: o.contexto || null,
          precioDOP: Number(o.linea!.precioUnitarioItem) || 0,
          tasaItbis: String(o.linea!.tasaItbis ?? 'exento'),
          tipo: String(o.linea!.indicadorBienoServicio) === '1' ? 'bien' : 'servicio',
          referencia: 'PLAN',
          stockActual: 0, stockMinimo: 0,
          controlaInventario: false, permiteVentaSinStock: true,
          cuotaEscolar: {
            cargoId: o.cargoId, estudianteId: o.estudianteId,
            mes: o.mes, anio: o.anio, saldoCentavos: o.saldoCentavos,
            productoId: typeof o.linea!.productoId === 'number' ? o.linea!.productoId : null,
            contexto: o.contexto,
          },
        } satisfies Producto;
      })
      .filter((p) => !texto || p.nombre.toLowerCase().includes(texto) || (p.descripcion ?? '').toLowerCase().includes(texto));
  }

  /**
   * Reloj de la factura: arranca al montar el formulario.
   *
   * Es tiempo de PARED, no de trabajo — incluye que alguien se levante por un
   * café a mitad de una factura. Se mide igual porque la alternativa es seguir
   * discutiendo con minutos estimados; para leerlo se usa la mediana, que a
   * una pestaña olvidada no la deja arrastrar el número.
   */
  const abiertoEn = useRef<number>(Date.now());

  function apuntarTiempo(extra: { ecfDocumentId: number | null; emitida: boolean }) {
    const cuerpo = {
      ms: Date.now() - abiertoEn.current,
      origen: modoColegio ? 'escolar' : 'formulario',
      lineas: items.length,
      montoCentavos: Math.round(totales.total * 100),
      ...extra,
    };
    // `keepalive` para que sobreviva a la navegación que viene justo después.
    void fetch('/api/metricas/factura-tiempo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      keepalive: true,
    }).catch(() => {});
  }

  async function buscarProductos(q: string, dependienteId?: number | null): Promise<Producto[]> {
    // contexto=facturacion: excluye lo que es solo del POS (cafetería).
    const res  = await fetch(`/api/productos?contexto=facturacion&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    // Las cuotas del alumno van PRIMERO: quien está facturando a una familia
    // busca el mes, no el producto genérico del catálogo.
    return [...cuotasComoProductos(dependienteId, q), ...(data.productos ?? [])];
  }

  /**
   * Buscador del catálogo de COMPRAS (lo que compras), para las líneas de
   * compra/gasto. Separado del catálogo de venta a propósito. Devuelve el
   * mismo shape `Producto` para que el Autocomplete y `seleccionarProducto`
   * funcionen igual. El historial de compras pasadas se sumará aquí después.
   */
  async function buscarCatalogoCompras(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/compras/catalogo?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.items ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    // Una cuota del plan no es un producto: trae su propio precio, su mes y el
    // cargo del que sale. Va por su camino antes de cualquier otra cosa —lo de
    // las variantes no le aplica y el id negativo no debe llegar a la línea.
    if (p.cuotaEscolar) { aplicarCuotaEnLinea(idx, p); return; }

    // Producto con variantes (talla/color…): no se puede vender "el producto" a
    // secas — hay que elegir la variante para saber a qué stock pega el descuento.
    // Se abre el selector y la línea se completa al escoger (aplicarVarianteEnLinea).
    if (p.tipo === 'bien' && (p.variantAtributos?.length ?? 0) > 0) {
      setVariantePickFor({ idx, producto: p });
      return;
    }
    aplicarProductoEnLinea(idx, p);
  }

  /**
   * Añade un mes del plan como línea.
   *
   * Tres cosas que no hace `aplicarProductoEnLinea` y aquí son obligatorias:
   * el `productoId` es el del catálogo, no el id negativo del buscador; el
   * cargo se registra en `origenCargos` para que al emitir se marque pagado; y
   * queda la `cuotaClave` para no volver a ofrecer ese mismo mes.
   */
  function aplicarCuotaEnLinea(idx: number, p: Producto) {
    const c = p.cuotaEscolar!;
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? 'exento';
    const tasaFinal: ItemLinea['tasaItbis'] =
      regla === undefined ? tasa : regla.permiteItbis ? tasa : 'exento';

    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: c.productoId ?? undefined,
        variantId: undefined,
        variantNombre: undefined,
        nombreItem: p.nombre,
        referencia: '',
        descripcionItem: c.contexto,
        precioUnitarioItem: p.precioDOP,
        tasaItbis: tasaFinal,
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        cuotaClave: `${c.estudianteId}:${c.cargoId}:${c.mes ?? 0}:${c.anio}`,
      },
    });

    // Solo si la deuda ya existe. Una cuota prevista todavía no tiene cargo, y
    // apuntar el 0 haría que al emitir se intentara saldar un cargo inexistente.
    if (c.cargoId > 0) {
      setOrigenCargos((prev) => prev.some((x) => x.id === c.cargoId)
        ? prev
        : [...prev, { id: c.cargoId, saldoCentavos: c.saldoCentavos }]);
    }
  }

  /** Aplica un producto SIN variantes a la línea (comportamiento clásico). */
  function aplicarProductoEnLinea(idx: number, p: Producto) {
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    // Si la regla no existe (tipoEcf = 'sin-ncf' o sin tipo) usar la tasa del
    // producto. Solo forzar 'exento' si la regla explícitamente prohíbe ITBIS.
    const tasaFinal: ItemLinea['tasaItbis'] =
      regla === undefined         ? tasa :
      regla.permiteItbis          ? tasa : 'exento';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: p.id,
        variantId: undefined,
        variantNombre: undefined,
        nombreItem: p.nombre,
        referencia: p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis: tasaFinal,
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida: (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });

    if (p.controlaInventario) {
      if (p.stockActual === 0 && !p.permiteVentaSinStock) {
        toast.error(`"${p.nombre}" está agotado y no permite venta sin stock.`, { duration: 7000 });
      } else if (p.stockActual === 0) {
        toast.warning(`"${p.nombre}" está agotado. Stock actual: 0 unidades.`, { duration: 6000 });
      } else if (p.stockActual <= p.stockMinimo) {
        toast.warning(`Stock bajo en "${p.nombre}": ${p.stockActual} unidades (mínimo: ${p.stockMinimo}).`, { duration: 6000 });
      }
    }
  }

  /** Completa la línea con el producto + la variante elegida en el selector. */
  function aplicarVarianteEnLinea(idx: number, p: Producto, v: VariantePick) {
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    const tasaFinal: ItemLinea['tasaItbis'] =
      regla === undefined ? tasa : regla.permiteItbis ? tasa : 'exento';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: p.id,
        variantId: v.id,
        variantNombre: v.nombre,
        nombreItem: `${p.nombre} · ${v.nombre}`,
        referencia: v.referencia ?? p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: v.precioDOP,
        tasaItbis: tasaFinal,
        indicadorBienoServicio: '1',
        unidadMedida: (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });

    if (v.stockActual === 0 && !p.permiteVentaSinStock) {
      toast.error(`"${p.nombre} · ${v.nombre}" está agotada y no permite venta sin stock.`, { duration: 7000 });
    } else if (v.stockActual === 0) {
      toast.warning(`"${p.nombre} · ${v.nombre}" está agotada. Stock: 0.`, { duration: 6000 });
    } else if (v.stockActual <= v.stockMinimo) {
      toast.warning(`Stock bajo en "${p.nombre} · ${v.nombre}": ${v.stockActual} (mínimo: ${v.stockMinimo}).`, { duration: 6000 });
    }
  }

  /**
   * Cuando el user escribe texto libre que no hace match con productos,
   * crear el producto en DB (precio 0 inicial, tasa default 18%) y
   * seleccionarlo. Así el item queda con productoId — próxima vez aparece
   * en el dropdown sin tener que retipearlo.
   */
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
        // Fallback: setear solo el nombre — no se guarda producto pero la línea queda usable
        dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
        toast.error(data.error ?? 'No se pudo crear el producto. Usando texto libre.');
      }
    } catch (e) {
      dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
      toast.error(e instanceof Error ? e.message : 'Error de red creando producto');
    }
  }

  // ─── Cambio de tipo ───────────────────────────────────────────────────────
  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    // No se limpia el cliente: el comprador no depende del tipo de e-CF, y
    // borrarlo obligaba a re-elegir cliente + beneficiarios (perdiendo el
    // prefill de un cargo escolar). El ITBIS sí se ajusta abajo según la regla.
    setNcfModificado('');
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) dispatchItems({ type: 'FORCE_EXENTO' });
    // Si el nuevo tipo no permite la condición de pago actual, caer a la primera permitida.
    const cond = parseInt(condicionPago, 10);
    if (r?.tiposPagoPermitidos && !r.tiposPagoPermitidos.includes(cond)) {
      const primer = r.tiposPagoPermitidos[0] ?? 1;
      setCondicionPago(String(primer));
    }
  }

  // ─── Items ────────────────────────────────────────────────────────────────
  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number | null) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ─── Reset ────────────────────────────────────────────────────────────────
  function resetForm() {
    try { localStorage.removeItem(draftKey); } catch {}
    limpiarCliente(); // also resets dependientesCliente + items beneficiarios
    setCondicionPago('1'); setFechaEmision(new Date().toISOString().slice(0, 10)); setFechaLimitePago(''); setNcfModificado('');
    setCodigoModificacion(''); setFechaNcfModificado(''); setTipoIngresos('1');
    dispatchItems({ type: 'RESET' });
    setRetenciones([]);
    setNotas(''); setTerminos(''); setPieFactura('');
    setPagoRecibido(false); setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoLineas([{ metodo: 'efectivo', valor: '', cuenta: '' }]);
    setComentario('');
    setCategoriaGasto('Materiales y suministros'); setNcfProveedor('');
    setFechaGasto(new Date().toISOString().slice(0, 10));
    setAlmacenId(null); setAlmacenNombre('');
    setListaPreciosId(null); setListaPreciosNombre('');
    setVendedorId(null); setVendedorNombre('');
    setError(null);
    invalidarSecuencia(tipoEcf);
  }

  // ─── Build payload (delegate to util) ─────────────────────────────────────
  function buildPayload(modo: 'emitir' | 'borrador') {
    return buildPayloadFn({
      modo, tipoEcf, fechaEmision, clienteSeleccionado, rncManual, rncManualNombre, emailManual,
      tipoPago: parseInt(condicionPago, 10), fechaLimitePago, ncfModificado, items,
      codigoModificacion, fechaNcfModificado, razonModificacion,
      origenDocumentoId: padreNota?.id ?? null,
      tipoIngresos,
      retenciones, notas, terminosCondiciones, pieFactura, comentario,
      pagoRecibido, pagoLineas, pagoFecha,
      almacenId, listaPreciosId, vendedorId,
      categoriaGasto: esCompraGasto ? categoriaGasto : undefined,
      ncfProveedor: esCompraGasto ? ncfProveedor : undefined,
      fechaGasto: esCompraGasto ? fechaGasto : undefined,
      borradorId: initialData?.id ?? null,
    });
  }

  // ── Memoized totales ───────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);
  const totalRetenciones = useMemo(() => retenciones.reduce((s, r) => s + r.monto, 0), [retenciones]);
  const totalNeto = totales.total - totalRetenciones;

  // Gasto pagado en efectivo por defecto: el monto de pago sigue al total, para
  // que registrar el gasto baje la caja sin escribir nada. Solo mientras haya una
  // sola línea en efectivo; si el usuario cambia el método o agrega líneas (pago
  // dividido / a crédito), se respeta lo que puso y deja de autocompletarse.
  useEffect(() => {
    if (!esCompraGasto || !pagoRecibido || initialData) return;
    if (pagoLineas.length !== 1 || pagoLineas[0].metodo !== 'efectivo') return;
    const objetivo = totalNeto > 0 ? totalNeto.toFixed(2) : '';
    if (pagoLineas[0].valor !== objetivo) {
      setPagoLineas([{ ...pagoLineas[0], valor: objetivo }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCompraGasto, pagoRecibido, totalNeto]);

  // Motivo (código de modificación) obligatorio para notas 33/34 — también al
  // guardar como borrador: la DGII lo exige y evita notas incompletas que luego
  // se traban al emitir.
  function validarMotivoNota(): string | null {
    if (!regla?.requiereNcfModificado) return null;
    if (!motivoNota) return 'Debes seleccionar el motivo de la nota de crédito / débito';
    if (motivoNota === 'otro' && !razonModificacion.trim()) return 'Debes especificar el motivo';
    return null;
  }

  function validar(): string | null {
    const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
    const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
    if (esCompraGasto && !razonFinal.trim()) return 'Indica el nombre del proveedor';
    if (esCompraGasto && !fechaGasto) return `Indica la fecha de la ${nounSalida}`;
    if (regla?.requiereRncComprador && !rncFinal.trim())
      return `El ${regla.rncLabel} es obligatorio para este tipo de comprobante`;
    if (regla?.requiereRazonSocial && !razonFinal.trim())
      return `La razón social del ${regla.compradorLabel} es obligatoria`;
    if (regla?.requiereNcfModificado && !ncfModificado.trim())
      return 'Debes indicar el e-NCF original que se modifica';
    const motivoErr = validarMotivoNota();
    if (motivoErr) return motivoErr;
    if (regla?.requiereNcfModificado && !fechaNcfModificado)
      return 'Debes indicar la fecha del e-NCF original que se modifica';
    if (tipoEcf === '32' && totales.total >= 250000 && !rncFinal.trim())
      return 'Factura de Consumo ≥ DOP 250,000 requiere RNC o cédula del comprador';
    if (condicionPago === '2' && !fechaLimitePago)
      return 'Para tipo de pago Crédito, debes definir el plazo de vencimiento.';
    if (dependientesCliente.length > 0) {
      const itemsConProducto = items.filter(i => i.nombreItem.trim());
      if (itemsConProducto.some(i => !i.dependienteId))
        return 'Cada ítem requiere un beneficiario';
    }
    if (items.every((i) => !i.nombreItem.trim()))
      return 'Agrega al menos un ítem con nombre';
    if (items.filter(i => i.nombreItem.trim()).every(i => i.precioUnitarioItem <= 0))
      return 'Los ítems deben tener un precio mayor a 0';
    return null;
  }

  // Regla cuentas por cobrar: una factura de VENTA que quedaría pendiente de cobro
  // (contado sin pago o crédito) debe identificar a quién cobrarle. Sin cliente
  // (nombre/RNC/cédula) y sin el pago completo registrado, sería una cuenta huérfana
  // en Cuentas por Cobrar (nadie de quién cobrar). Se desbloquea agregando el cliente
  // o registrando el pago total. No aplica a NC/ND, compras/gastos, ni gratuito/uso.
  function validarClienteOPago(): string | null {
    const TIPOS_VENTA = ['31', '32', '45', '46', '47', 'sin-ncf'];
    if (!TIPOS_VENTA.includes(tipoEcf)) return null;
    if (condicionPago === '3' || condicionPago === '4') return null; // gratuito / uso: no es por cobrar
    const rncFinal   = (clienteSeleccionado?.rnc ?? rncManual).trim();
    const razonFinal = (clienteSeleccionado?.razonSocial ?? rncManualNombre).trim();
    if (rncFinal || razonFinal) return null;                          // ya hay a quién cobrarle
    const pagado = pagoRecibido ? sumaPagos(pagoLineas) : 0;
    const pagoCompleto = totalNeto > 0 && Math.round(pagado * 100) >= Math.round(totalNeto * 100);
    if (pagoCompleto) return null;                                    // se cobró completo
    return 'Falta a quién cobrarle: agrega el nombre, RNC o cédula del cliente, o registra el pago completo. Una factura sin cliente no puede quedar pendiente de cobro.';
  }

  /**
   * Renderiza el PDF de vista previa SIN crear la factura.
   * Pega a /api/pdf/factura/preview (stateless) → recibe el PDF como blob →
   * lo muestra vía object URL en el modal. Antes esto creaba un borrador real,
   * lo que duplicaba la factura al darle luego a "Guardar".
   */
  async function handleVistaPrevia() {
    const err = items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null;
    if (err) { setError(err); return; }

    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/pdf/factura/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload('borrador')),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo generar la vista previa');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      // Revocar el blob previo para no acumular memoria.
      setPreviewBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setVistaPrevia(true);
    } catch {
      setError('Error de conexión al generar la vista previa');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function emitir(modo: 'emitir' | 'borrador', opts?: EmitirOpts) {
    // Va ANTES de la traza para no registrar un submit fantasma en el
    // diagnóstico anti-duplicados.
    if (alertaMetodoPago && pagoRecibido && sumaPagos(pagoLineas) > 0 && !opts?.metodoConfirmado) {
      setConfirmMetodo({ modo, opts });
      return;
    }
    // Traza anti-duplicados: identifica el botón y la secuencia de clicks de este
    // montaje. Se loguea aquí (consola) y se manda al server (`_traza`) para ligar
    // cada submit con el documento creado y diagnosticar las facturas duplicadas.
    const traza = {
      fid:   formInstanceId,
      seq:   ++submitSeqRef.current,
      boton: opts?.andThen ? `${modo}+${opts.andThen}` : modo,
      ts:    Date.now(),
    };
    console.log('[factura-submit]', traza, 'submitting=', submittingRef.current, 'loading=', loading);

    /*
      Sin eCF seleccionado → siempre guardar como borrador (no se emite a DGII).
      sin-ncf (factura sin comprobante) o nota sobre factura de origen sin-ncf
      (no hay e-NCF que referenciar) → solo borrador, nunca se emite a la DGII.

      Y en el flujo por pasos, TAMPOCO. Guardar y mandar a la DGII eran el mismo
      botón: quien elegía un comprobante fiscal en el paso 1 se encontraba con
      que «Guardar factura» decía «Emitir e-CF» y el documento salía a la DGII
      en el mismo clic con el que se registraba el pago. Ir a la DGII gasta un
      e-NCF de la secuencia y no se deshace; tiene que ser un acto aparte, al
      final, sobre una factura que ya existe y ya se puede leer.
    */
    const modoEfectivo: 'emitir' | 'borrador' =
      (tipoEcf === 'sin-ncf' || esPadreSinNcf || enPasos) ? 'borrador' : modo;

    const err = modoEfectivo === 'borrador'
      ? (items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : validarMotivoNota())
      : validar();
    if (err) { setError(err); return; }

    // Bloqueo cliente-o-pago al crear la factura definitiva: emitir a DGII o
    // guardar una factura sin-ncf (ambas crean una cuenta cobrable). Los borradores
    // en progreso de tipos con e-CF quedan permitidos.
    if (modoEfectivo === 'emitir' || tipoEcf === 'sin-ncf') {
      const clienteErr = validarClienteOPago();
      if (clienteErr) { setError(clienteErr); return; }
    }

    if (modoEfectivo === 'emitir') {
      try {
        const payload = buildPayload('emitir');
        // Augmentar payload con campos derivados que el mapper computará server-side
        // pero que el validator client-side necesita ver para no marcar REQUIRED missing.
        const tasaToIndicador = (t: string | number): 1 | 2 | 3 | 4 => {
          const s = String(t);
          if (s === '0.18') return 1;
          if (s === '0.16') return 2;
          if (s === '0')    return 3;
          return 4; // exento o fallback
        };
        const tiposExentos = ['43', '44']; // forzar indicador=4
        const itemsAugmented = (payload.items ?? []).map(i => ({
          ...i,
          indicadorFacturacion: tiposExentos.includes(tipoEcf) ? 4 : tasaToIndicador(i.tasaItbis ?? 'exento'),
          montoItem: (i.cantidadItem ?? 0) * (i.precioUnitarioItem ?? 0) - (i.descuentoMonto ?? 0),
        }));
        // indicadorMontoGravado REQUIRED si algún ítem está gravado (indicador 1, 2 o 3)
        // 0 = precios NO incluyen ITBIS (default — nuestro form calcula ITBIS encima)
        // 1 = precios SÍ incluyen ITBIS
        const hayItemsGravados = itemsAugmented.some(i => [1, 2, 3].includes(i.indicadorFacturacion));
        // Bug: validator usa payloadKey 'fechaNCFModificado' (NCF mayúsculas)
        // pero buildPayload emite 'fechaNcfModificado' (Ncf). Renombrar para
        // que el validator no marque required-missing en NC tipo 33/34.
        const fechaNcfMod = (payload as { fechaNcfModificado?: string }).fechaNcfModificado;
        // indicadorNotaCredito (tipo 34) es REQUIRED para el validator: 0 = NC dentro
        // de 30 días de la factura original, 1 = después. Mismo cálculo que el mapper
        // server-side (computeIndicadorNotaCredito); el server recomputa el valor real
        // al emitir, esto solo evita el falso "campo requerido" en la validación client.
        const computeIndicadorNC = (f?: string): 0 | 1 => {
          if (!f) return 0;
          let iso = f;
          if (/^\d{2}-\d{2}-\d{4}$/.test(f)) { const [dd, mm, yyyy] = f.split('-'); iso = `${yyyy}-${mm}-${dd}`; }
          const orig = new Date(iso);
          if (Number.isNaN(orig.getTime())) return 0;
          return Math.floor((Date.now() - orig.getTime()) / 86_400_000) > 30 ? 1 : 0;
        };
        const validationPayload: Record<string, unknown> = {
          ...payload,
          montoTotal: totales.total,
          items: itemsAugmented,
          ...(hayItemsGravados ? { indicadorMontoGravado: 0 } : {}),
          ...(fechaNcfMod ? { fechaNCFModificado: fechaNcfMod } : {}),
          ...(tipoEcf === '34' ? { indicadorNotaCredito: computeIndicadorNC(fechaNcfMod) } : {}),
          // Renombrar campos para tipo 41 (Compras) — usa rncProveedor en lugar de rncComprador
          ...(tipoEcf === '41' ? {
            rncProveedor:         payload.rncComprador,
            razonSocialProveedor: payload.razonSocialComprador,
          } : {}),
          // Tipos 41/43/47: tipoIngresos NO aplica (campo prohibido). Eliminarlo del payload
          // para que el validator no marque "no debe estar presente".
          ...(tipoEcf === '41' || tipoEcf === '43' || tipoEcf === '47'
            ? { tipoIngresos: undefined }
            : {}),
        };
        // Eliminar undefined explícitos para que el validator no los vea
        if ((validationPayload as { tipoIngresos?: unknown }).tipoIngresos === undefined) {
          delete (validationPayload as { tipoIngresos?: unknown }).tipoIngresos;
        }
        const result = validateEcf(tipoEcf, validationPayload, {
          context: {
            tipoPago: parseInt(condicionPago, 10),
            ncfModificado: ncfModificado || undefined,
            montoTotal: totales.total,
            rncComprador: payload.rncComprador,
          },
        });
        if (!result.ok && result.errors.length > 0) {
          setError(result.errors.slice(0, 3).map(e => `${e.nombre}: ${e.message}`).join('; '));
          return;
        }
      } catch (e) {
        console.warn('[validator] fallo silencioso:', e);
      }
    }

    // Guard síncrono: si ya hay un submit en vuelo, ignorar este click.
    // Bloquea el doble-click en el mismo tick (el `loading` se aplica un render
    // después y no llega a tiempo). Se libera en el finally.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true); setError(null);
    try {
      // Si un intento anterior falló, el backend dejó el e-NCF reservado en un
      // borrador. Reintentar por esa ruta REUSA el mismo número; volver a
      // /api/ecf/emitir tomaría el siguiente y abriría un hueco en la secuencia.
      const payload = buildPayload(modoEfectivo);
      const res = reservaDocId
        ? await fetch(`/api/facturas/${reservaDocId}/emitir-ecf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipoEcf: payload.tipoEcf,
              ...(payload.rncComprador         ? { rncComprador:         payload.rncComprador }         : {}),
              ...(payload.razonSocialComprador ? { razonSocialComprador: payload.razonSocialComprador } : {}),
            }),
          })
        : await fetch('/api/ecf/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, _traza: traza }) });
      const data = await res.json();
      if (!res.ok) {
        // Sin turno de caja abierto (solo si la empresa usa el módulo de caja):
        // abrir el modal para abrir caja aquí mismo y reintentar el guardado, en
        // vez de dejar al usuario en un callejón con solo el mensaje de error.
        // CAJA_TURNO_VENCIDO no entra aquí a propósito: abrir un turno no lo
        // resuelve (hay que cerrar el vencido), así que cae al error de abajo.
        if (data.code === 'CAJA_SIN_TURNO') {
          setAbrirCajaPend({ modo, opts });
          return;
        }
        // El backend reservó el e-NCF en un borrador: guardarlo para que el
        // próximo intento lo reuse en vez de consumir otro número.
        if (typeof data.docId === 'number') setReservaDocId(data.docId);
        setError(data.error ?? 'Error al guardar');
        // El método de pago obliga tipo fiscal (ej. tarjeta con «Sin NCF»): llevar
        // al usuario al selector de tipo y resaltarlo para que lo cambie.
        if (data.requiereTipoFiscal) {
          const el = document.getElementById('tipo-comprobante-anchor');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
            setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2'), 4000);
          }
        }
        return;
      }
      // Emitió bien: la reserva quedó consumida por este documento.
      setReservaDocId(null);
      try { localStorage.removeItem(draftKey); } catch {}

      // Cuánto se tardó. Se manda y se olvida: si falla no se entera nadie, y
      // sobre todo no toca el flujo de quien acaba de facturar.
      apuntarTiempo({
        ecfDocumentId: typeof data.id === 'number' ? data.id : null,
        emitida: modoEfectivo === 'emitir',
      });
      // Persistir clasificación por maestros (Plan A) — metadata no fiscal.
      if (data.documentoId) {
        try {
          await fetch(`/api/facturas/${data.documentoId}/maestros`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asignaciones: clasificacion }),
          });
        } catch {}
      }
      if (opts?.andThen === 'nueva') {
        resetForm();
        return;
      }
      if (opts?.andThen === 'imprimir' && data.documentoId) {
        setResultado(data);
        window.open(`/api/pdf/factura/${data.documentoId}`, '_blank');
        return;
      }
      if (opts?.andThen === 'correo') {
        setResultado(data);
        setCorreoDocumentoId(data.documentoId);
        setCorreoEncf(data.encf ?? '');
        setEmailEnviar(emailManual || clienteSeleccionado?.email || '');
        setShowEnviarCorreo(true);
        return;
      }
      if (opts?.andThen === 'cobrar' && data.documentoId) {
        // Abre el detalle con el modal de link de pago (elige pasarela allí).
        irA(`${detalleBase}/${data.documentoId}?cobrar=1`);
        return;
      }
      setResultado(data);

      /**
       * En el cajón, la factura se ata a sus cargos SOLA.
       *
       * Fuera de aquí vincular es un botón que el usuario pulsa en la pantalla
       * de resultado, y tiene sentido: allí la factura pudo nacer de cualquier
       * sitio. Pero al cajón se entra DESDE los cargos —«Nueva factura»,
       * «Adelantar», «Facturar juntos»—, así que no vincular no es una opción,
       * es un olvido. Y el olvido se paga caro: la factura queda emitida, los
       * cargos siguen en «Sin facturar», y la familia aparece debiendo dos
       * veces lo mismo. Pasó, y por eso está esto.
       */
      if (sinRedirigirAlVincular && (origenCargos.length > 0 || previsto)) {
        await saldarCargoConFactura(data.documentoId);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Gasto: la acción primaria guarda como interno; emitir a DGII es opcional.
    await emitir(esCompraGasto ? 'borrador' : 'emitir');
  }

  // ─── Cmd/Ctrl + Enter → emitir ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!loading && !resultado) {
          void emitir(esCompraGasto ? 'borrador' : 'emitir');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, resultado, esCompraGasto]);

  // ─── Guardar NCF modal ────────────────────────────────────────────────────
  async function handleGuardarNcf() {
    if (!secuencia?.id) {
      setNcfError('No hay una secuencia configurada para este tipo de comprobante. Créala primero en Secuencias.');
      return;
    }
    setNcfSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (ncfSiguienteNum) body.siguiente        = parseInt(ncfSiguienteNum);
      if (ncfFechaVenc)    body.fechaVencimiento = ncfFechaVenc;
      body.pieDeFactura = ncfPieFactura.trim() || null;

      const res = await fetch(`/api/secuencias/${secuencia.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setNcfError(data.error ?? 'Error al guardar'); return; }
      setShowEditarNcf(false);
      invalidarSecuencia(tipoEcf);
    } catch {
      setNcfError('Error de conexión');
    } finally {
      setNcfSaving(false);
    }
  }

  // ─── Pantalla de éxito ────────────────────────────────────────────────────
  if (resultado) {
    const esSinEcf = resultado.modo === 'borrador';
    const esNotaBorrador = esSinEcf && (tipoEcf === '33' || tipoEcf === '34');
    return (
      <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: { xs: 2, sm: 3 } }}>
        {/*
          La barra del comprobante ya emitido.

          Solo en el cajón, y por una razón concreta: fuera de él la cabecera
          de la pantalla ya dice de qué documento se trata y hay una barra de
          navegación encima. Dentro del cajón no hay ninguna de las dos —el
          formulario se sustituye entero por esta pantalla— y sin esto no se
          veía por ninguna parte QUÉ número acaba de salir sin bajar a leerlo
          entre los detalles.
        */}
        {sinRedirigirAlVincular && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap',
            maxWidth: 980, mx: 'auto', mb: 2,
            bgcolor: '#fff', border: '1px solid #E6E8F0', borderRadius: '14px',
            px: 2.25, py: 1.75, boxShadow: '0 1px 2px rgba(15,17,24,.03)',
          }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{
                fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.3px',
                color: '#0F1118', fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {resultado.encf || resultado.codigo || `Documento #${resultado.documentoId}`}
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: '0.71875rem', color: '#8A90A0', fontVariantNumeric: 'tabular-nums' }}>
                {[
                  fechaEmision ? fechaEmision.split('-').reverse().join('/') : null,
                  condicionPago === '2' && fechaLimitePago
                    ? `Vence ${fechaLimitePago.split('-').reverse().join('/')}`
                    : null,
                  resultado.montoTotal != null
                    ? `RD$ ${resultado.montoTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
                    : null,
                ].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            {/* Los dos abren el mismo PDF. Se separan porque son dos gestos
                distintos —guardarlo o darle al padre un papel— y quien busca
                «Imprimir» no lo encuentra bajo «Descargar». */}
            <Button
              variant="outlined"
              disableElevation
              component="a"
              href={`/api/pdf/factura/${resultado.documentoId}`}
              target="_blank"
              rel="noreferrer"
              startIcon={<FileText style={{ width: 15, height: 15 }} />}
              sx={{ textTransform: 'none', borderRadius: '9px', height: 34, flex: '0 0 auto' }}
            >
              Ver PDF
            </Button>
            <Button
              variant="outlined"
              disableElevation
              onClick={() => {
                const v = window.open(`/api/pdf/factura/${resultado.documentoId}`, '_blank', 'noopener');
                // El PDF lo pinta el visor del navegador y no avisa de cuándo
                // terminó; se le pide imprimir al cargar y, si el visor no lo
                // permite, queda abierto para hacerlo a mano.
                v?.addEventListener?.('load', () => { try { v.print(); } catch {} });
              }}
              startIcon={<Printer style={{ width: 15, height: 15 }} />}
              sx={{ textTransform: 'none', borderRadius: '9px', height: 34, flex: '0 0 auto' }}
            >
              Imprimir
            </Button>
          </Box>
        )}
        <Box sx={{ maxWidth: 672, mx: 'auto' }}>
          <Box
            sx={{
              bgcolor: '#fff',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              p: { xs: 2.5, sm: 4 },
              textAlign: 'center',
            }}
          >
            <CheckCircle
              style={{ width: 64, height: 64, color: '#3658e1', margin: '0 auto 16px' }}
            />
            {esNotaBorrador ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡{tipoEcf === '34' ? 'Nota de crédito' : 'Nota de débito'} guardada!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  La nota quedó guardada{tipoEcf === '34' ? ' y ya reduce el saldo de la factura original' : ''}.
                </Typography>
              </>
            ) : esSinEcf ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡{esCompra ? 'Compra guardada' : esGasto ? 'Gasto guardado' : 'Factura guardada'}!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  {esCompra ? 'Tu compra fue registrada correctamente.'
                    : esGasto ? 'Tu gasto fue registrado correctamente.'
                    : 'Tu factura fue guardada correctamente.'}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡Comprobante emitido!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Tu e-CF fue enviado a la DGII exitosamente.
                </Typography>
              </>
            )}

            <Box
              sx={{
                bgcolor: '#f9fafb',
                borderRadius: '12px',
                p: 3,
                textAlign: 'left',
                border: '1px solid #f3f4f6',
                mb: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {!esSinEcf && resultado.encf && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">e-NCF</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{resultado.encf}</Typography>
                </Box>
              )}
              {!esSinEcf && resultado.trackId && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Track ID</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{resultado.trackId}</Typography>
                </Box>
              )}
              {!esSinEcf && resultado.codigoSeguridad && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Código de seguridad</Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2a45c4' }}>{resultado.codigoSeguridad}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Monto total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  DOP {(resultado.montoTotal ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              {resultado.modo === 'borrador' && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{esCompraGasto ? 'Pago' : 'Cobro'}</Typography>
                  {resultado.pagoRecibido ? (
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'success.dark' }}>
                      ✓ {esCompraGasto ? 'Pagado' : 'Cobrado'}
                      {resultado.pagoMetodo ? ` · ${resultado.pagoMetodo.charAt(0).toUpperCase() + resultado.pagoMetodo.slice(1).replace('_', ' ')}` : ''}
                      {resultado.pagoValor != null ? ` · DOP ${resultado.pagoValor.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'warning.dark' }}>
                      ⏳ {esCompraGasto ? 'Pendiente de pago' : 'Pendiente de cobro'}
                    </Typography>
                  )}
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Estado</Typography>
                <Chip
                  label={resultado.modo === 'borrador'
                    ? (resultado.pagoRecibido ? 'Pagada' : 'Guardada')
                    : resultado.estado}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Box>

            {/* Origen cargo escolar → cerrar el loop: vincular la factura al
                cargo. El cobro se registra luego en la factura (no hay pago
                escolar paralelo), y el cargo refleja el estado de la factura. */}
            {origenCargos.length > 0 && (
              <Box
                sx={{
                  bgcolor: '#eef2fe',
                  border: '1px solid #e0e7fd',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'left',
                  mb: 3,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                  <GraduationCap style={{ width: 20, height: 20, color: '#2a45c4', flexShrink: 0, marginTop: 2 }} />
                  <Typography variant="body2" sx={{ color: '#24377d' }}>
                    {origenCargos.length > 1
                      ? `Esta factura cubre ${origenCargos.length} cargos escolares. Al vincularla, los ${origenCargos.length} meses quedarán ligados a esta factura y sus saldos reflejarán lo que se cobre aquí. El cobro se registra una sola vez en la factura.`
                      : 'Esta factura nació de un cargo escolar. Al vincularla, el cargo quedará ligado a esta factura y su saldo reflejará lo que se cobre aquí. El cobro se registra en la factura.'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {cargosVinculados ? (
                  <Chip
                    color="success"
                    icon={<CheckCircle style={{ width: 15, height: 15 }} />}
                    label={origenCargos.length > 1
                      ? `${origenCargos.length} cargos ya vinculados a esta factura`
                      : 'Cargo ya vinculado a esta factura'}
                    sx={{ fontWeight: 500 }}
                  />
                  ) : (
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={saldandoCargo}
                    onClick={() => saldarCargoConFactura(resultado.documentoId)}
                    startIcon={saldandoCargo
                      ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                      : <CheckCircle style={{ width: 16, height: 16 }} />}
                    sx={{
                      bgcolor: '#3658e1',
                      '&:hover': { bgcolor: '#2a45c4' },
                      textTransform: 'none',
                      borderRadius: '8px',
                    }}
                  >
                    {saldandoCargo
                      ? 'Vinculando…'
                      : origenCargos.length > 1
                        ? 'Vincular a los cargos y volver al estudiante'
                        : 'Vincular al cargo y volver al estudiante'}
                  </Button>
                  )}
                  <Button
                    variant="outlined"
                    disableElevation
                    disabled={saldandoCargo}
                    onClick={() => irA(`${detalleBase}/${resultado.documentoId}`)}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    Ver factura sin vincular
                  </Button>
                </Box>
              </Box>
            )}

            {/* Nota en borrador → elección explícita: emitir ahora o dejar borrador.
                Nunca obligatorio — emitir requiere que la factura padre tenga e-CF. */}
            {esNotaBorrador && (
              <Box
                sx={{
                  bgcolor: '#eef2fe',
                  border: '1px solid #e0e7fd',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'left',
                  mb: 3,
                }}
              >
                <Typography variant="body2" sx={{ color: '#24377d', mb: 1.5 }}>
                  ¿Deseas enviar esta nota a la DGII ahora? Solo es posible si la
                  factura original ya tiene e-CF emitido. También puedes dejarla
                  guardada y emitirla después desde su detalle.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={padreNota ? (!padreNota.conEcfReal && !ncfModificadoValido) : false}
                    onClick={() => irA(`${detalleBase}/${resultado.documentoId}?emitir=1`)}
                    startIcon={<Send style={{ width: 16, height: 16 }} />}
                    sx={{
                      bgcolor: '#3658e1',
                      '&:hover': { bgcolor: '#2a45c4' },
                      textTransform: 'none',
                      borderRadius: '8px',
                    }}
                  >
                    Enviar a DGII ahora
                  </Button>
                  <Button
                    variant="outlined"
                    disableElevation
                    onClick={() => irA(`${detalleBase}/${resultado.documentoId}`)}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    Dejar como borrador
                  </Button>
                </Box>
                {padreNota && !padreNota.conEcfReal && !ncfModificadoValido && (
                  <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 1 }}>
                    Escribe el e-NCF original en la nota para poder enviarla a la DGII, o emite primero la factura padre.
                  </Typography>
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                disableElevation
                component="a"
                href={`/api/pdf/factura/${resultado.documentoId}`}
                target="_blank"
                rel="noreferrer"
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                Descargar PDF
              </Button>
              <Button
                variant="outlined"
                disableElevation
                component={Link}
                href={`${detalleBase}/${resultado.documentoId}`}
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                Ver detalle
              </Button>
              <Button
                variant="outlined"
                disableElevation
                onClick={() => {
                  try { localStorage.removeItem(draftKey); } catch {}
                  setResultado(null);
                  setPaso(1);
                  setCargosVinculados(false);
                  dispatchItems({ type: 'RESET' });
                  limpiarCliente();
                }}
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                {esCompra ? 'Nueva compra' : esGasto ? 'Nuevo gasto' : `Nueva ${docAccent.noun}`}
              </Button>
              <Button
                variant="contained"
                disableElevation
                onClick={() => irA(detalleBase)}
                sx={{
                  bgcolor: '#3658e1',
                  '&:hover': { bgcolor: '#2a45c4' },
                  textTransform: 'none',
                  borderRadius: '8px',
                }}
              >
                Ver todas
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ─── Formulario ───────────────────────────────────────────────────────────
  if (cargandoPrefill) return <EsqueletoFactura />;

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box component="a" href="#main-content" sx={{ position: 'absolute', left: '-9999px', '&:focus': { left: 8, top: 8, zIndex: 9999 } }}>Saltar al contenido</Box>
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 2.5 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <NavBar
          ocultarPersonalizar={modoColegio}
          onVolver={onVolver}
          title={initialData ? tituloDoc.editar : tituloDoc.nuevo}
          showAlmacen={showAlmacen}             setShowAlmacen={setShowAlmacen}
          showListaPrecios={showListaPrecios}   setShowListaPrecios={setShowListaPrecios}
          showVendedor={showVendedor}           setShowVendedor={setShowVendedor}
          toggleOpcion={toggleOpcion}
        />

        {error && (
          <Alert
            severity="error"
            icon={<AlertTriangle style={{ width: 20, height: 20 }} />}
            sx={{ borderRadius: '12px', mb: 2 }}
          >
            {error}
          </Alert>
        )}

        {/* Banner: nota creada desde una factura */}
        {padreNota && (tipoEcf === '33' || tipoEcf === '34') && (
          <Alert
            severity={padreNota.conEcfReal ? 'success' : 'warning'}
            icon={<FileText style={{ width: 20, height: 20 }} />}
            sx={{ borderRadius: '12px', mb: 2, alignItems: 'flex-start' }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {tipoEcf === '34' ? 'Nota de crédito' : 'Nota de débito'} sobre la factura{' '}
                <Link
                  href={`/dashboard/facturas/${padreNota.id}`}
                  style={{ fontFamily: 'monospace', textDecoration: 'underline' }}
                  target="_blank"
                >
                  {padreNota.conEcfReal ? padreNota.encf : (padreNota.codigo ?? `#${padreNota.id}`)}
                </Link>
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                  gap: '4px 16px',
                }}
              >
                {padreNota.razonSocial && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Cliente</Typography>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{padreNota.razonSocial}</Typography>
                  </Box>
                )}
                {padreNota.montoTotal && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Monto original</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>RD$ {padreNota.montoTotal}</Typography>
                  </Box>
                )}
                {padreNota.fechaEmision && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Fecha</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{padreNota.fechaEmision}</Typography>
                  </Box>
                )}
              </Box>
              {!padreNota.conEcfReal && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  La factura original no tiene e-CF emitido — esta nota solo puede guardarse como{' '}
                  <strong>borrador</strong>. Podrás enviarla a la DGII cuando el padre sea emitido.
                </Typography>
              )}
            </Box>
          </Alert>
        )}

        <Box
          component="form"
          id="main-content"
          onSubmit={handleSubmit}
          onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) {
              e.preventDefault();
            }
          }}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {!esCompraGasto && (
            <TopBar
              showAlmacen={showAlmacen} setShowAlmacen={setShowAlmacen}
              showListaPrecios={showListaPrecios} setShowListaPrecios={setShowListaPrecios}
              showVendedor={showVendedor} setShowVendedor={setShowVendedor}
              toggleOpcion={toggleOpcion}
              almacenes={almacenes} listasPrecios={listasPrecios} vendedores={vendedores}
              almacenId={almacenId} setAlmacenId={setAlmacenId} setAlmacenNombre={setAlmacenNombre}
              listaPreciosId={listaPreciosId} setListaPreciosId={setListaPreciosId} setListaPreciosNombre={setListaPreciosNombre}
              vendedorId={vendedorId} setVendedorId={setVendedorId} setVendedorNombre={setVendedorNombre}
              onOpenNuevoAlmacen={() => setShowNuevoAlmacen(true)}
              onOpenNuevaLista={() => setShowNuevaLista(true)}
              onOpenNuevoVendedor={() => setShowNuevoVendedor(true)}
            />
          )}

          {/* Los dos pasos, con el que toca en azul. Solo se enseña mientras
              se edita: en la pantalla de resultado ya no hay a dónde volver. */}
          {modoColegio && <Pasos paso={paso} />}

          {/* ── SPLIT LAYOUT: form left, sticky sidebar right ─────────── */}
          <Box
            sx={{
              display: 'grid',
              // En modo colegio no hay barra lateral: el resumen y el pago son
              // el paso 2, así que la columna del formulario se queda sola y
              // centrada. Suelta ocupaba 1.240px de ancho para una tabla de
              // cinco columnas.
              gridTemplateColumns: modoColegio ? '1fr' : { xs: '1fr', lg: 'minmax(0,1fr) 360px' },
              gap: { xs: 2, lg: 2.5 },
              ...(modoColegio ? { maxWidth: 980, mx: 'auto', width: '100%' } : {}),
            }}
          >
            {/* LEFT column — en modo colegio, solo el paso 1 */}
            {(!modoColegio || paso === 1) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {!esCompraGasto && (
                <CompactHeader
                  camposMinimos={modoColegio}
                  tipoBloqueado={modoColegio}
                  empresa={empresa}
                  categoriaId={categoriaId} setCategoriaId={setCategoriaId}
                  tipoEcf={tipoEcf} onChangeTipo={handleChangeTipo}
                  ocultarCategoria={ocultarCategoria}
                  mostrarCodigoTipo={!(padreNota && !padreNota.conEcfReal && !ncfModificadoValido)}
                  sinComprobante={esPadreSinNcf}
                  secuencia={secuencia}
                  fechaEmision={fechaEmision}
                  puedeEditarFecha={puedeEditarFecha}
                  onChangeFecha={setFechaEmision}
                  onEditarNcf={() => {
                    setNcfSiguienteNum('');
                    setNcfFechaVenc(secuencia?.fechaVencimiento ? secuencia.fechaVencimiento.slice(0, 10) : '');
                    setNcfPieFactura(secuencia?.pieDeFactura ?? '');
                    setNcfError(null);
                    setShowEditarNcf(true);
                  }}
                />
              )}

              {(tipoEcf === '33' || tipoEcf === '34') && (
                <FacturaOrigenSection
                  tipoEcf={tipoEcf}
                  padreSeleccionado={padreNota}
                  conEcfReal={padreNota?.conEcfReal ?? false}
                  esPadreSinNcf={esPadreSinNcf}
                  buscarFacturas={buscarFacturas}
                  onSelect={(f) => cargarPadre(f.id)}
                  onClear={limpiarPadre}
                  ncfModificado={ncfModificado} setNcfModificado={setNcfModificado}
                  motivoNota={motivoNota} setMotivoNota={setMotivoNota}
                  fechaNcfModificado={fechaNcfModificado} setFechaNcfModificado={setFechaNcfModificado}
                  razonModificacion={razonModificacion} setRazonModificacion={setRazonModificacion}
                  today={today}
                />
              )}

              {esCompraGasto ? (
                <SectionCard number={1} title={esCompra ? 'Registro de la compra' : 'Registro del gasto'} icon={Calendar}>
                  <GastoDatosSection
                    esCompra={esCompra}
                    proveedor={rncManualNombre} setProveedor={setRncManualNombre}
                    rncProveedor={rncManual} setRncProveedor={setRncManual}
                    ncfProveedor={ncfProveedor} setNcfProveedor={setNcfProveedor}
                    categoriaGasto={categoriaGasto} setCategoriaGasto={setCategoriaGasto}
                    fechaGasto={fechaGasto} setFechaGasto={setFechaGasto}
                    tipoEcf={tipoEcf} onChangeTipo={handleChangeTipo}
                  />
                </SectionCard>
              ) : (
                <>
                  <SectionCard number={1} title="Datos del cliente" icon={User}>
                    <ClienteSection
                      clienteSeleccionado={clienteSeleccionado}
                      buscarClientes={buscarClientes}
                      onSelectCliente={seleccionarCliente}
                      onClearCliente={limpiarCliente}
                      onOpenNuevoCliente={() => setShowNuevoCliente(true)}
                      regla={regla}
                      rncManual={rncManual} rncManualNombre={rncManualNombre}
                      setRncManual={setRncManual} setRncManualNombre={setRncManualNombre}
                      emailManual={emailManual} setEmailManual={setEmailManual}
                      telefonoManual={telefonoManual} setTelefonoManual={setTelefonoManual}
                      tipoEcf={tipoEcf} totalDocumento={totales.total}
                      soloLectura={modoColegio}
                    />
                  </SectionCard>
                  <SectionCard number={2} title="Detalles de la factura" icon={Calendar}>
                    <DetallesSection
                      camposMinimos={modoColegio}
                      regla={regla} tipoEcf={tipoEcf}
                      condicionPago={condicionPago} setCondicionPago={setCondicionPago}
                      diasParaPago={diasParaPago} setDiasParaPago={setDiasParaPago}
                      tipoIngresos={tipoIngresos} setTipoIngresos={setTipoIngresos}
                      fechaLimitePago={fechaLimitePago}
                      empresa={empresa}
                      sinPagoRegistrado={!pagoRecibido || sumaPagos(pagoLineas) <= 0}
                    />
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f3f4f6' }}>
                      <ClasificacionFactura docId={initialData?.id} value={clasificacion} onChange={setClasificacion} />
                    </Box>
                  </SectionCard>
                </>
              )}

              <SectionCard
                number={esCompraGasto ? 2 : 3}
                title={esCompraGasto ? 'Detalle e importe' : 'Productos y servicios'}
                icon={Package}
                actions={
                  <ColumnasToggle
                    showReferencia={showItemRef}
                    showDescripcion={showItemDesc}
                    showDescuento={showItemDescuento}
                    onToggleReferencia={handleToggleRef}
                    onToggleDescripcion={handleToggleDesc}
                    onToggleDescuento={handleToggleDescuento}
                  />
                }
              >
                <ItemsTable
                  items={items}
                  regla={regla}
                  ocultarItbis={modoColegio}
                  ocultarConduce={modoColegio}
                  buscarProductos={buscarProductos}
                  onSelectProducto={seleccionarProducto}
                  onCrearProductoLibre={crearProductoLibre}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItem={updateItem}
                  onSelectBeneficiario={handleSelectBeneficiario}
                  onOpenNuevoProducto={(idx) => setShowNuevoProductoIdx(idx)}
                  showReferencia={showItemRef}
                  showDescripcion={showItemDesc}
                  showDescuento={showItemDescuento}
                  dependientes={dependientesCliente}
                  bloquearPrecios={esCompraGasto ? false : bloquearPrecios}
                  modoGasto={esCompraGasto}
                  sinBusquedaCatalogo={esCompraGasto}
                  buscarCatalogoCompras={esCompraGasto ? buscarCatalogoCompras : undefined}
                />
                {/* Las retenciones son de quien le compra al Estado o a un
                    gran contribuyente. Un colegio le cobra a familias: nunca
                    aplica, y el enlace solo invita a equivocarse. */}
                {!modoColegio && (
                  <RetencionesSection
                    retenciones={retenciones} setRetenciones={setRetenciones}
                    totalesItbis={totales.itbis} totalesSubtotal={totales.subtotal}
                  />
                )}
              </SectionCard>

              {!esCompraGasto && (
                <AccordionSection number={4} title="Términos y condiciones" icon={ScrollText} defaultOpen={terminosCondiciones.trim().length > 0}>
                  <Terminos terminosCondiciones={terminosCondiciones} setTerminos={setTerminos} />
                </AccordionSection>
              )}

              <AccordionSection
                number={esCompraGasto ? 3 : 5} title={esCompraGasto ? 'Notas internas' : 'Notas'} icon={StickyNote}
                defaultOpen={notas.trim().length > 0}
              >
                <Notas notas={notas} setNotas={setNotas} />
              </AccordionSection>

              {!esCompraGasto && (<>
                <AccordionSection number={6} title="Pie de factura" icon={FileText} defaultOpen={pieFactura.trim().length > 0}>
                  <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} label={docAccent.noun === 'factura' ? 'Pie de factura' : 'Pie del documento'} />
                </AccordionSection>
                <AccordionSection number={7} title="Comentario" icon={MessageSquare} defaultOpen={comentario.trim().length > 0}>
                  <Comentarios comentario={comentario} setComentario={setComentario} />
                </AccordionSection>
              </>)}

              {/* Sección 8 Pago movida al sidebar derecho (ResumenSidebar) */}
            </Box>

            )}

            {/* RIGHT column — sticky sidebar: Resumen + Pago.
                En modo colegio deja de ser barra lateral y pasa a ser el
                paso 2, a lo ancho de la columna. */}
            {(!modoColegio || paso === 2) && (
            <ResumenSidebar
              empresa={empresa}
              totales={totales}
              retenciones={retenciones}
              totalNeto={totalNeto}
              totalLabel={docAccent.totalLabel}
              items={items}
              // Una Nota de Crédito acredita al cliente — no se cobra ningún pago al
              // crearla. Ocultar el card "Pago".
              showPago={tipoEcf !== '34'}
              pagoLabel={esCompraGasto ? 'Pagado (sale de la caja)' : undefined}
              pagoRecibido={pagoRecibido} setPagoRecibido={setPagoRecibido}
              pagoFecha={pagoFecha} setPagoFecha={setPagoFecha}
              pagoLineas={pagoLineas} setPagoLineas={setPagoLineas}
              enPaso={modoColegio}
            />
            )}
          </Box>

          {/* Action bar — sticky bottom, full width */}
          <BottomActionBar
            items={items}
            loading={loading}
            loadingPreview={loadingPreview}
            primaryBtnClass={docAccent.primaryBtnClass}
            primaryLabel={esCompraGasto ? (esCompra ? 'Guardar compra' : 'Guardar gasto')
              : (enPasos || tipoEcf === 'sin-ncf') ? 'Guardar factura'
              : esPadreSinNcf ? 'Guardar borrador' : 'Emitir e-CF'}
            loadingPrimaryLabel={(esCompraGasto || enPasos || tipoEcf === 'sin-ncf' || esPadreSinNcf) ? 'Guardando…' : 'Emitiendo…'}
            onVistaPrevia={handleVistaPrevia}
            onEmitir={emitir}
            // El paso 1 no emite nada: su botón lleva al pago. Emitir vive al
            // final, cuando ya se decidió si se cobra en el acto — que es lo
            // que cambia si la factura sale pagada o queda por cobrar.
            paso={modoColegio ? paso : undefined}
            onSiguiente={() => setPaso(2)}
            onAtras={() => setPaso(1)}
            onCancelar={() => {
              try { localStorage.removeItem(draftKey); } catch {}
              // Dentro de un cajón, cancelar es CERRARLO. Navegando, la página
              // de debajo —la ficha del alumno o de la familia desde la que se
              // estaba facturando— se cambiaba por el listado de facturas, y al
              // cerrar el cajón uno aparecía en otro sitio sin haberlo pedido.
              if (onVolver) { onVolver(); return; }
              router.push(esCompra ? '/dashboard/compras/nueva' : esGasto ? '/dashboard/gastos/nueva' : '/dashboard/facturas');
            }}
          />
        </Box>

        {/* Modals */}
        <ModalPreviewPDF
          open={vistaPrevia}
          onOpenChange={(o) => {
            setVistaPrevia(o);
            // Al cerrar, revocar el blob para liberar memoria.
            if (!o) setPreviewBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
          }}
          tipoEcf={tipoEcf}
          previewUrl={previewBlobUrl}
          loading={loading}
          onEmitir={() => { setVistaPrevia(false); emitir('emitir'); }}
        />

        <ModalEditarNCF
          open={showEditarNcf}
          onClose={() => { setShowEditarNcf(false); setNcfError(null); }}
          tipoEcf={tipoEcf} secuencia={secuencia}
          ncfSiguienteNum={ncfSiguienteNum} setNcfSiguienteNum={setNcfSiguienteNum}
          ncfFechaVenc={ncfFechaVenc} setNcfFechaVenc={setNcfFechaVenc}
          ncfPieFactura={ncfPieFactura} setNcfPieFactura={setNcfPieFactura}
          ncfError={ncfError} ncfSaving={ncfSaving} onSave={handleGuardarNcf}
        />

        <ModalEnviarCorreo
          open={showEnviarCorreo}
          onClose={() => setShowEnviarCorreo(false)}
          emailEnviar={emailEnviar} setEmailEnviar={setEmailEnviar}
          correoEncf={correoEncf} correoDocumentoId={correoDocumentoId}
          emailSending={emailSending} setEmailSending={setEmailSending}
        />

        <ModalNuevoCliente
          open={showNuevoCliente}
          onClose={() => setShowNuevoCliente(false)}
          onCreated={(c) => { seleccionarCliente(c); setShowNuevoCliente(false); }}
        />

        {showNuevoProductoIdx !== null && (
          <ModalNuevoProducto
            open
            onClose={() => setShowNuevoProductoIdx(null)}
            onCreated={(p) => { seleccionarProducto(showNuevoProductoIdx, p); setShowNuevoProductoIdx(null); }}
          />
        )}

        <ModalNuevoAlmacen
          open={showNuevoAlmacen}
          onClose={() => setShowNuevoAlmacen(false)}
          onCreated={(a) => {
            setAlmacenes(prev => [...prev, a]);
            setAlmacenId(a.id);
            setAlmacenNombre(a.nombre);
            setShowNuevoAlmacen(false);
          }}
        />

        <ModalNuevaLista
          open={showNuevaLista}
          onClose={() => setShowNuevaLista(false)}
          onCreated={(l) => {
            setListasPrecios(prev => [...prev, l]);
            setListaPreciosId(l.id);
            setListaPreciosNombre(l.nombre);
            setShowNuevaLista(false);
          }}
        />

        <ModalNuevoVendedor
          open={showNuevoVendedor}
          onClose={() => setShowNuevoVendedor(false)}
          onCreated={(v) => {
            setVendedores(prev => [...prev, v]);
            setVendedorId(v.id);
            setVendedorNombre(v.nombre);
            setShowNuevoVendedor(false);
          }}
        />

        {variantePickFor && (
          <ModalSeleccionarVariante
            open
            productoId={variantePickFor.producto.id}
            productoNombre={variantePickFor.producto.nombre}
            almacenId={almacenId}
            onClose={() => setVariantePickFor(null)}
            onPick={(v) => {
              aplicarVarianteEnLinea(variantePickFor.idx, variantePickFor.producto, v);
              setVariantePickFor(null);
            }}
          />
        )}

        {abrirCajaPend && (
          <ModalAbrirCaja
            open
            onClose={() => setAbrirCajaPend(null)}
            onOpened={() => {
              const pend = abrirCajaPend;
              setAbrirCajaPend(null);
              // Turno abierto: reintentar el guardado con las mismas opciones
              // (conserva metodoConfirmado/contadoConfirmado si ya se aceptaron).
              if (pend) void emitir(pend.modo, pend.opts);
            }}
          />
        )}

        {confirmMetodo && (
          <ConfirmarMetodoPagoDialog
            lineas={pagoLineas
              .filter((l) => (parseFloat(l.valor || '0') || 0) > 0)
              .map<ResumenMetodo>((l) => ({
                label: labelMetodo(l.metodo),
                montoFmt: `RD$ ${(parseFloat(l.valor || '0') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              }))}
            procesando={loading}
            onCancel={() => setConfirmMetodo(null)}
            onConfirm={() => {
              const pend = confirmMetodo;
              setConfirmMetodo(null);
              void emitir(pend.modo, { ...pend.opts, metodoConfirmado: true });
            }}
          />
        )}

      </Box>
    </Box>
  );
}
