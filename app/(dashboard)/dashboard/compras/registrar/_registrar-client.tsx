'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { BuscadorSelect, type OpcionBuscador } from '@/components/ui/buscador-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { pesosACentavos } from '@/lib/nomina/montos';
import {
  analizarIdentificacion, analizarNcf, erroresCompra, itbisAlCostoPorDefecto, resumirCompra,
  sugerirRetenciones, totalizarLineas, CONCEPTOS_RETENCION, TIPOS_BIENES_606, TIPOS_RETENCION_ISR,
  type ConceptoRetencion, type TasaItbis, type TipoProveedor,
} from '@/lib/compras/fiscal';
import { CATEGORIAS_COMPRA, categoriaCompra, tipo606Dominante } from '@/lib/compras/categorias';
import type { LineaEcfRecibido } from '@/lib/compras/ecf-xml';
import { ArrowLeft, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, Info, ShoppingCart, Receipt } from 'lucide-react';

export interface ContextoRegistro {
  clase: 'compra' | 'gasto';
  regimenItbis: string;
  almacenes: { id: number; nombre: string }[];
  rncEmpresa: string | null;
  hoy: string;
  inicial: {
    proveedorRnc: string | null;
    proveedorNombre: string | null;
    ncf: string | null;
    fecha: string | null;
    formaPago: 'contado' | 'credito';
    fechaVencimiento: string | null;
    montoTotalCents: number | null;
    lineas: LineaEcfRecibido[];
  } | null;
  avisoEcf: string | null;
  /** La captura de foto que se está registrando, si el formulario vino de una. */
  capturaId?: number | null;
}

interface Producto { id: number; nombre: string; referencia: string | null; tipo: string; tasaItbis: string; costo: number; stockActual: number }

interface Linea {
  key: number;
  tipo: 'producto' | 'concepto';
  productoId: string;
  descripcion: string;
  categoria: string;
  cantidad: string;
  costo: string;
  itbisTasa: TasaItbis;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format((c ?? 0) / 100);
const aCentavos = (texto: string) => (texto.trim() ? pesosACentavos(texto) : 0);
const aTexto = (cents: number) => (cents ? (cents / 100).toFixed(2) : '');

const TIPOS_PROVEEDOR_LABEL: Record<TipoProveedor, string> = {
  juridica: 'Empresa (con RNC)',
  fisica: 'Persona física (cédula)',
  informal: 'Proveedor informal',
  rst: 'Régimen simplificado (RST)',
  exterior: 'Del exterior',
};

const CONCEPTO_LABEL: Record<ConceptoRetencion, string> = {
  bienes: 'Compra de bienes',
  servicios_profesionales: 'Honorarios y servicios profesionales',
  servicios_tecnicos: 'Servicios técnicos o mano de obra',
  alquiler: 'Alquiler',
  seguridad: 'Seguridad y vigilancia',
  otros_servicios: 'Otros servicios',
};

const TASA_LABEL: Record<TasaItbis, string> = { '0.18': '18 %', '0.16': '16 %', '0': '0 %', exento: 'Exento' };

const MOTIVO_SIN_ASIENTO: Record<string, string> = {
  'sin-cuenta-inventario': 'falta la cuenta de inventario',
  'sin-cuenta-itbis-adelantado': 'falta la cuenta 1104 de ITBIS adelantado',
  'sin-cuenta-por-pagar': 'falta la cuenta por pagar',
  'sin-cuenta-cobro': 'falta la cuenta del método de pago',
  'sin-cuenta-gastos': 'falta la cuenta de gastos',
  'sin-cuenta-retenciones-por-pagar': 'faltan las cuentas de retenciones por pagar',
};

let siguienteKey = 1;
const lineaVacia = (tipo: Linea['tipo']): Linea => ({
  key: siguienteKey++, tipo, productoId: '', descripcion: '', categoria: tipo === 'concepto' ? 'otros' : '',
  cantidad: '1', costo: '', itbisTasa: '0.18',
});

/**
 * Registrar el comprobante de un proveedor. El mismo formulario sirve para
 * Compras y para Gastos: lo que cambia es la línea con que arranca y a dónde
 * vuelve. Todo lo fiscal se calcula en vivo con `lib/compras/fiscal`, las mismas
 * funciones que valida el servidor.
 */
export default function RegistrarCompraClient({ contexto }: { contexto: ContextoRegistro }) {
  const router = useRouter();
  const esGasto = contexto.clase === 'gasto';
  const volverA = esGasto ? '/dashboard/gastos' : '/dashboard/compras';
  const ini = contexto.inicial;

  const { data: dProductos } = useSWR<{ productos: Producto[] }>(esGasto ? null : '/api/productos?tipo=bien', fetcher);
  const productos = dProductos?.productos ?? [];

  // ── Proveedor y comprobante ──
  const [proveedorRnc, setProveedorRnc] = useState(ini?.proveedorRnc ?? '');
  const [proveedorNombre, setProveedorNombre] = useState(ini?.proveedorNombre ?? '');
  const idInicial = analizarIdentificacion(ini?.proveedorRnc);
  const [tipoProveedor, setTipoProveedor] = useState<TipoProveedor>(idInicial.persona === 'fisica' ? 'fisica' : 'juridica');
  const [ncf, setNcf] = useState(ini?.ncf ?? '');
  const [ncfModificado, setNcfModificado] = useState('');
  const [fecha, setFecha] = useState(ini?.fecha ?? contexto.hoy);
  const [tipo606, setTipo606] = useState('');

  // ── Líneas ──
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (ini?.lineas.length) {
      return ini.lineas.map((l) => ({
        key: siguienteKey++, tipo: 'concepto' as const, productoId: '', descripcion: l.descripcion,
        categoria: l.esServicio ? 'otros' : 'materiales', cantidad: String(l.cantidad),
        costo: (l.costoUnitarioCents / 100).toFixed(2), itbisTasa: l.itbisTasa,
      }));
    }
    return [lineaVacia(esGasto ? 'concepto' : 'producto')];
  });
  const [almacenId, setAlmacenId] = useState(contexto.almacenes[0] ? String(contexto.almacenes[0].id) : '');

  // ── Impuestos y retenciones ──
  const [alCostoManual, setAlCostoManual] = useState(false);
  const [itbisAlCosto, setItbisAlCosto] = useState('');
  const [isc, setIsc] = useState('');
  const [otros, setOtros] = useState('');
  const [propina, setPropina] = useState('');
  const [conceptoManual, setConceptoManual] = useState<ConceptoRetencion | ''>('');
  const [retencionManual, setRetencionManual] = useState(false);
  const [itbisRetenido, setItbisRetenido] = useState('');
  const [isrRetenido, setIsrRetenido] = useState('');
  const [isrTipo, setIsrTipo] = useState('');

  // ── Pago ──
  const [formaPago, setFormaPago] = useState<'contado' | 'credito'>(ini?.formaPago ?? 'contado');
  const [metodoPago, setMetodoPago] = useState('transferencia');
  const [fechaPago, setFechaPago] = useState(contexto.hoy);
  const [fechaVencimiento, setFechaVencimiento] = useState(ini?.fechaVencimiento ?? '');
  const [notas, setNotas] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [confirmarRepetido, setConfirmarRepetido] = useState<number | null>(null);
  const ocupado = useRef(false);

  // ── Derivados ──
  const idInfo = analizarIdentificacion(proveedorRnc);
  const ncfInfo = analizarNcf(ncf);
  const lineasCalc = lineas.map((l) => {
    const producto = l.tipo === 'producto' ? productos.find((p) => String(p.id) === l.productoId) : undefined;
    const cat = l.tipo === 'concepto' ? categoriaCompra(l.categoria) : undefined;
    const cantidad = Number(l.cantidad);
    const costo = aCentavos(l.costo);
    return {
      l, producto, cat,
      valida: Number.isInteger(cantidad) && cantidad > 0 && costo !== null && (l.tipo === 'producto' ? !!producto : !!cat && l.descripcion.trim().length > 0),
      calc: { cantidad: Number.isFinite(cantidad) ? cantidad : 0, costoUnitarioCents: costo ?? 0, itbisTasa: l.itbisTasa, esServicio: cat?.esServicio ?? false },
    };
  });
  const totales = totalizarLineas(lineasCalc.map((x) => x.calc));

  const alCostoDefecto = itbisAlCostoPorDefecto({ ncf: ncfInfo, regimenItbis: contexto.regimenItbis, itbisCents: totales.itbisCents });
  const alCostoCents = alCostoManual ? (aCentavos(itbisAlCosto) ?? 0) : alCostoDefecto;

  const conceptoDerivado: ConceptoRetencion = (() => {
    let mejor: { concepto: ConceptoRetencion; base: number } = { concepto: 'bienes', base: -1 };
    lineasCalc.forEach((x, i) => {
      const concepto = x.cat?.concepto ?? 'bienes';
      if (totales.lineas[i].baseCents > mejor.base) mejor = { concepto, base: totales.lineas[i].baseCents };
    });
    return mejor.concepto;
  })();
  const concepto = conceptoManual || conceptoDerivado;
  const sugerida = sugerirRetenciones({
    tipoProveedor, concepto, fecha: formaPago === 'contado' ? fechaPago || fecha : contexto.hoy,
    baseServiciosCents: totales.baseServiciosCents, baseBienesCents: totales.baseBienesCents,
    itbisCents: totales.itbisCents, itbisServiciosCents: totales.itbisServiciosCents,
  });
  const itbisRetenidoCents = retencionManual ? (aCentavos(itbisRetenido) ?? 0) : sugerida.itbisRetenidoCents;
  const isrRetenidoCents = retencionManual ? (aCentavos(isrRetenido) ?? 0) : sugerida.isrRetenidoCents;
  const isrTipoFinal = retencionManual ? (isrTipo ? Number(isrTipo) : null) : sugerida.isrTipo;

  const imp = {
    itbisFacturadoCents: totales.itbisCents,
    itbisAlCostoCents: alCostoCents,
    itbisRetenidoCents,
    isrRetenidoCents,
    iscCents: aCentavos(isc) ?? 0,
    otrosImpuestosCents: aCentavos(otros) ?? 0,
    propinaCents: aCentavos(propina) ?? 0,
  };
  const resumen = resumirCompra(totales.baseCents, imp);
  const tipo606Auto = tipo606Dominante(lineasCalc.map((x, i) => ({ tipo606: x.l.tipo === 'producto' ? '09' : x.cat?.tipo606 ?? '02', baseCents: totales.lineas[i].baseCents })));
  const tipo606Final = (tipo606 || tipo606Auto) as keyof typeof TIPOS_BIENES_606;

  // Al entrar a modo manual se parte de la sugerencia, no de cero.
  function pasarRetencionAManual() {
    if (retencionManual) return;
    setItbisRetenido(aTexto(sugerida.itbisRetenidoCents));
    setIsrRetenido(aTexto(sugerida.isrRetenidoCents));
    setIsrTipo(sugerida.isrTipo ? String(sugerida.isrTipo) : '');
    setRetencionManual(true);
  }

  // El tipo de proveedor sigue a la identificación mientras el usuario no lo haya elegido.
  const tipoElegido = useRef(false);
  useEffect(() => {
    if (tipoElegido.current) return;
    if (idInfo.persona === 'fisica') setTipoProveedor('fisica');
    else if (idInfo.persona === 'juridica') setTipoProveedor('juridica');
  }, [idInfo.persona]);

  // Padrón de la DGII: nombre y estado del RNC.
  const { data: padron } = useSWR<{ results?: { rnc: string; nombre: string; nombreComercial: string | null; estadoLabel: string }[] }>(
    idInfo.formatoValido ? `/api/rnc/search?q=${idInfo.limpio}` : null, fetcher,
  );
  const enPadron = useMemo(
    () => (padron?.results ?? []).find((r) => r.rnc.replace(/\D/g, '') === idInfo.limpio) ?? null,
    [padron, idInfo.limpio],
  );
  useEffect(() => {
    if (enPadron && !proveedorNombre.trim()) setProveedorNombre(enPadron.nombre);
  }, [enPadron]); // eslint-disable-line react-hooks/exhaustive-deps

  // NCF ya registrado del mismo proveedor, o emitido en Zero.
  const { data: verificacion } = useSWR<{ repetidoId: number | null; emitido: boolean }>(
    ncfInfo.valido ? `/api/compras/local/verificar?ncf=${ncfInfo.ncf}&rnc=${idInfo.limpio}` : null, fetcher,
  );

  const gastoMenor = ncfInfo.tipoBase === '13';
  const pideRnc = tipoProveedor !== 'exterior' && !gastoMenor;
  const problemas: string[] = [];
  if (!ncfInfo.valido) problemas.push(ncfInfo.error ?? 'NCF inválido');
  if (pideRnc && !idInfo.formatoValido) problemas.push('Falta el RNC o la cédula del proveedor');
  if (!gastoMenor && !proveedorNombre.trim()) problemas.push('Falta el nombre del proveedor');
  if (ncfInfo.esNota && !analizarNcf(ncfModificado).valido) problemas.push('Falta el NCF que modifica la nota');
  if (lineasCalc.some((x) => !x.valida)) problemas.push('Hay líneas incompletas');
  if (verificacion?.emitido) problemas.push('Ese comprobante lo emitiste en Zero: ya está en el 606');
  if (!ncfInfo.daCreditoItbis && ncfInfo.valido && alCostoCents < totales.itbisCents) problemas.push(`El ITBIS de un comprobante de ${ncfInfo.nombre.toLowerCase()} va completo al costo`);
  problemas.push(...erroresCompra({ baseCents: totales.baseCents, imp, formaPago, fechaPago: formaPago === 'contado' ? fechaPago : null }));
  if (isrRetenidoCents > 0 && !isrTipoFinal) problemas.push('Elige el tipo de retención de ISR');

  function setLinea(key: number, patch: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function elegirProducto(key: number, id: string) {
    const p = productos.find((x) => String(x.id) === id);
    setLinea(key, {
      productoId: id,
      itbisTasa: (['0.18', '0.16', '0', 'exento'].includes(p?.tasaItbis ?? '') ? p!.tasaItbis : '0.18') as TasaItbis,
      costo: p?.costo ? (p.costo / 100).toFixed(2) : '',
    });
  }

  async function registrar(permitirNcfRepetido = false) {
    if (ocupado.current || problemas.length) return;
    ocupado.current = true;
    setGuardando(true);
    try {
      const res = await fetch('/api/compras/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clase: contexto.clase,
          proveedorRnc: idInfo.limpio || null,
          proveedorNombre: proveedorNombre.trim() || null,
          tipoProveedor,
          ncf: ncfInfo.ncf,
          ncfModificado: ncfInfo.esNota ? analizarNcf(ncfModificado).ncf : null,
          fecha,
          tipoBienes606: tipo606Final,
          lineas: lineasCalc.map((x) => ({
            productoId: x.l.tipo === 'producto' ? Number(x.l.productoId) : null,
            almacenId: x.l.tipo === 'producto' && almacenId ? Number(almacenId) : null,
            descripcion: x.l.tipo === 'concepto' ? x.l.descripcion.trim() : null,
            categoria: x.l.tipo === 'concepto' ? x.l.categoria : null,
            cantidad: x.calc.cantidad,
            costoUnitarioCents: x.calc.costoUnitarioCents,
            itbisTasa: x.l.itbisTasa,
          })),
          itbisAlCostoCents: alCostoManual ? alCostoCents : null,
          itbisRetenidoCents,
          isrTipoRetencion: isrRetenidoCents > 0 ? isrTipoFinal : null,
          isrRetenidoCents,
          iscCents: imp.iscCents,
          otrosImpuestosCents: imp.otrosImpuestosCents,
          propinaCents: imp.propinaCents,
          formaPago,
          metodoPago,
          fechaPago: formaPago === 'contado' ? fechaPago : null,
          fechaVencimiento: formaPago === 'credito' ? fechaVencimiento || null : null,
          almacenId: almacenId ? Number(almacenId) : null,
          notas: notas.trim() || null,
          permitirNcfRepetido,
          capturaId: contexto.capturaId ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.codigo === 'ncf-repetido') {
        setConfirmarRepetido(j.compraId ?? 0);
        return;
      }
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar');
      const a = j.asiento as { creado: boolean; asientoId?: number; motivo?: string } | undefined;
      const contable = a?.creado ? ` · asiento #${a.asientoId}` : a?.motivo && MOTIVO_SIN_ASIENTO[a.motivo] ? ` · sin asiento: ${MOTIVO_SIN_ASIENTO[a.motivo]}` : '';
      toast.success(`${esGasto ? 'Gasto' : 'Compra'} #${j.compraId} registrado${esGasto ? '' : 'a'}${contable}`);
      for (const aviso of (j.avisos ?? []) as string[]) toast.info(aviso);
      router.push(`/dashboard/compras/local/${j.compraId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  const opcionesProductos: OpcionBuscador[] = productos.map((p) => ({
    valor: String(p.id), etiqueta: p.nombre, detalle: [p.referencia, `existencia ${p.stockActual}`].filter(Boolean).join(' · '),
  }));
  const hayProductos = lineas.some((l) => l.tipo === 'producto');
  const Icono = esGasto ? Receipt : ShoppingCart;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link href={volverA} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {esGasto ? 'Gastos' : 'Compras'}
      </Link>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icono className="h-6 w-6 text-zero-600" /> {esGasto ? 'Registrar gasto con comprobante' : 'Registrar compra'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El comprobante que te dio el proveedor. Con él se arma la línea del 606, el ITBIS que adelantas, las retenciones y el asiento.
        </p>
      </div>
      {contexto.avisoEcf && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {contexto.avisoEcf}
        </div>
      )}
      {ini && !contexto.capturaId && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800" data-testid="aviso-ecf-recibido">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Datos tomados del e-CF recibido. Revisa la categoría de cada línea y las retenciones.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* 1 · Proveedor y comprobante */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-base font-semibold">1 · Proveedor y comprobante</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="proveedor-rnc">RNC o cédula</Label>
                  <Input id="proveedor-rnc" value={proveedorRnc} onChange={(e) => setProveedorRnc(e.target.value)} placeholder="101010101" inputMode="numeric" />
                  {idInfo.formatoValido ? (
                    enPadron
                      ? <p className={`text-xs ${enPadron.estadoLabel === 'Activo' ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="padron">Padrón DGII: {enPadron.estadoLabel.toLowerCase()}</p>
                      : padron && <p className="text-xs text-amber-700">No aparece en el padrón de la DGII</p>
                  ) : proveedorRnc.trim() && <p className="text-xs text-red-600">Un RNC tiene 9 dígitos y una cédula 11</p>}
                  {idInfo.formatoValido && !idInfo.digitoOk && <p className="text-xs text-amber-700">El dígito verificador no cuadra: confírmalo</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="proveedor-nombre">Nombre del proveedor</Label>
                  <Input id="proveedor-nombre" value={proveedorNombre} onChange={(e) => setProveedorNombre(e.target.value)} placeholder="Razón social" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tipo-proveedor">Tipo de proveedor</Label>
                  <NativeSelect id="tipo-proveedor" value={tipoProveedor} onChange={(e) => { tipoElegido.current = true; setTipoProveedor(e.target.value as TipoProveedor); }}>
                    {(Object.keys(TIPOS_PROVEEDOR_LABEL) as TipoProveedor[]).map((t) => <option key={t} value={t}>{TIPOS_PROVEEDOR_LABEL[t]}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ncf">NCF del comprobante</Label>
                  <Input id="ncf" value={ncf} onChange={(e) => setNcf(e.target.value.toUpperCase())} placeholder="B0100000001 o E310000000001" />
                  {ncf.trim() && (ncfInfo.valido ? (
                    <p className="text-xs text-muted-foreground" data-testid="ncf-info">
                      {ncfInfo.electronico ? 'e-CF' : 'NCF'} de {ncfInfo.nombre.toLowerCase()}
                      {ncfInfo.origen === 'autoemitido' ? ' (lo emite tu empresa)' : ''}
                      {ncfInfo.daCreditoItbis ? ' · da crédito de ITBIS' : ' · el ITBIS no se adelanta'}
                    </p>
                  ) : <p className="text-xs text-red-600">{ncfInfo.error}</p>)}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fecha-comprobante">Fecha del comprobante</Label>
                  <Input id="fecha-comprobante" type="date" value={fecha} max={contexto.hoy} onChange={(e) => setFecha(e.target.value)} />
                </div>
              </div>
              {ncfInfo.esNota && (
                <div className="space-y-1.5 sm:w-1/3">
                  <Label htmlFor="ncf-modificado">NCF que modifica</Label>
                  <Input id="ncf-modificado" value={ncfModificado} onChange={(e) => setNcfModificado(e.target.value.toUpperCase())} />
                </div>
              )}
              {verificacion?.repetidoId && (
                <p className="flex items-center gap-1.5 text-sm text-amber-700" data-testid="aviso-ncf-repetido">
                  <AlertTriangle className="h-4 w-4" /> Ese NCF de este proveedor ya está registrado:{' '}
                  <Link href={`/dashboard/compras/local/${verificacion.repetidoId}`} className="underline">compra #{verificacion.repetidoId}</Link>
                </p>
              )}
              {ncfInfo.valido && !ncfInfo.reporta606 && (
                <p className="flex items-start gap-1.5 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Un comprobante de consumo no sustenta costos ni gastos deducibles y no va al 606. Pídele al proveedor uno de crédito fiscal.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 2 · Líneas */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">2 · Qué se compró</h2>
                {hayProductos && contexto.almacenes.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Entra al almacén</span>
                    <NativeSelect aria-label="Almacén" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} style={{ width: 'auto', height: 34 }}>
                      {contexto.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </NativeSelect>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {lineasCalc.map((x, i) => (
                  <div key={x.l.key} className="rounded-lg border p-3" data-testid={`linea-${i + 1}`}>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[130px_minmax(0,1fr)_minmax(0,210px)]">
                      {!esGasto ? (
                        <NativeSelect aria-label={`Tipo de la línea ${i + 1}`} value={x.l.tipo}
                          onChange={(e) => setLinea(x.l.key, { tipo: e.target.value as Linea['tipo'], productoId: '', categoria: e.target.value === 'concepto' ? 'otros' : '' })}>
                          <option value="producto">Producto</option>
                          <option value="concepto">Gasto o servicio</option>
                        </NativeSelect>
                      ) : <span className="hidden md:block" />}
                      {x.l.tipo === 'producto' ? (
                        <div className="md:col-span-2">
                          <BuscadorSelect id={`producto-${i + 1}`} value={x.l.productoId} onChange={(v) => elegirProducto(x.l.key, v)}
                            opciones={opcionesProductos} placeholder={productos.length ? 'Busca el producto…' : 'No hay productos de inventario'} />
                        </div>
                      ) : (
                        <>
                          <Input aria-label={`Descripción de la línea ${i + 1}`} value={x.l.descripcion} onChange={(e) => setLinea(x.l.key, { descripcion: e.target.value })} placeholder="Qué se compró" />
                          <NativeSelect aria-label={`Categoría de la línea ${i + 1}`} value={x.l.categoria} onChange={(e) => setLinea(x.l.key, { categoria: e.target.value })}>
                            {CATEGORIAS_COMPRA.map((c) => <option key={c.clave} value={c.clave}>{c.label}</option>)}
                          </NativeSelect>
                        </>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[90px_140px_110px_minmax(0,1fr)_40px] sm:items-center">
                      <Input aria-label={`Cantidad de la línea ${i + 1}`} value={x.l.cantidad} onChange={(e) => setLinea(x.l.key, { cantidad: e.target.value })} inputMode="numeric" placeholder="Cant." />
                      <Input aria-label={`Costo unitario de la línea ${i + 1}`} value={x.l.costo} onChange={(e) => setLinea(x.l.key, { costo: e.target.value })} inputMode="decimal" placeholder="Costo sin ITBIS" />
                      <NativeSelect aria-label={`ITBIS de la línea ${i + 1}`} value={x.l.itbisTasa} onChange={(e) => setLinea(x.l.key, { itbisTasa: e.target.value as TasaItbis })}>
                        {(Object.keys(TASA_LABEL) as TasaItbis[]).map((t) => <option key={t} value={t}>ITBIS {TASA_LABEL[t]}</option>)}
                      </NativeSelect>
                      <div className="text-right text-sm tabular-nums">
                        <span className="font-medium">{pesos(totales.lineas[i].baseCents)}</span>
                        {totales.lineas[i].itbisCents > 0 && <span className="text-muted-foreground"> + {pesos(totales.lineas[i].itbisCents)} ITBIS</span>}
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Quitar la línea ${i + 1}`} disabled={lineas.length === 1}
                        onClick={() => setLineas((ls) => ls.filter((l) => l.key !== x.l.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {x.l.tipo === 'producto'
                        ? 'Suma existencia y actualiza el costo promedio · cuenta 1105 Inventario · 606: 09'
                        : x.cat ? `${x.cat.ejemplo} · cuenta ${x.cat.cuentaCodigo} · 606: ${x.cat.tipo606}` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVacia(esGasto ? 'concepto' : 'producto')])} className="gap-1.5">
                <Plus className="h-4 w-4" /> Agregar línea
              </Button>
            </CardContent>
          </Card>

          {/* 3 · Impuestos y retenciones */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-base font-semibold">3 · Impuestos y retenciones</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="isc">ISC</Label>
                  <Input id="isc" value={isc} onChange={(e) => setIsc(e.target.value)} inputMode="decimal" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="otros-impuestos">Otros impuestos y tasas</Label>
                  <Input id="otros-impuestos" value={otros} onChange={(e) => setOtros(e.target.value)} inputMode="decimal" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="propina">Propina legal (10 %)</Label>
                  <Input id="propina" value={propina} onChange={(e) => setPropina(e.target.value)} inputMode="decimal" placeholder="0.00" />
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>ITBIS llevado al costo: <strong className="tabular-nums">{pesos(alCostoCents)}</strong></span>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="h-4 w-4 accent-zero-600" checked={alCostoManual}
                      onChange={(e) => { setAlCostoManual(e.target.checked); setItbisAlCosto(aTexto(alCostoDefecto)); }} />
                    Ajustar a mano
                  </label>
                </div>
                {alCostoManual ? (
                  <Input aria-label="ITBIS llevado al costo" className="mt-2" value={itbisAlCosto} onChange={(e) => setItbisAlCosto(e.target.value)} inputMode="decimal" />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {totales.itbisCents === 0 ? 'Sin ITBIS facturado.'
                      : !ncfInfo.daCreditoItbis && ncfInfo.valido ? 'Este comprobante no da crédito: el ITBIS se suma al costo.'
                      : contexto.regimenItbis !== 'gravado' ? 'Tu empresa no cobra ITBIS (régimen exento): el ITBIS de las compras va al costo.'
                      : 'Se adelanta completo en el IT-1. Márcalo si una parte no se puede adelantar (proporcionalidad).'}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3" data-testid="retenciones">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="concepto-retencion">Concepto para retener</Label>
                    <NativeSelect id="concepto-retencion" value={concepto} onChange={(e) => setConceptoManual(e.target.value as ConceptoRetencion)} style={{ minWidth: 260 }}>
                      {CONCEPTOS_RETENCION.map((c) => <option key={c} value={c}>{CONCEPTO_LABEL[c]}</option>)}
                    </NativeSelect>
                  </div>
                  {retencionManual ? (
                    <Button variant="outline" size="sm" onClick={() => setRetencionManual(false)}>Usar la sugerida</Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={pasarRetencionAManual}>Editar retenciones</Button>
                  )}
                </div>
                {!retencionManual ? (
                  sugerida.motivos.length ? (
                    <ul className="space-y-1 text-sm" data-testid="motivos-retencion">
                      {sugerida.motivos.map((m) => <li key={m} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-zero-600" />{m}</li>)}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">Con este proveedor y concepto la ley no manda retener.</p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="itbis-retenido">ITBIS retenido</Label>
                    <Input id="itbis-retenido" value={retencionManual ? itbisRetenido : aTexto(sugerida.itbisRetenidoCents)} readOnly={!retencionManual}
                      onChange={(e) => setItbisRetenido(e.target.value)} inputMode="decimal" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="isr-retenido">ISR retenido</Label>
                    <Input id="isr-retenido" value={retencionManual ? isrRetenido : aTexto(sugerida.isrRetenidoCents)} readOnly={!retencionManual}
                      onChange={(e) => setIsrRetenido(e.target.value)} inputMode="decimal" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="isr-tipo">Tipo de retención ISR</Label>
                    <NativeSelect id="isr-tipo" value={retencionManual ? isrTipo : String(sugerida.isrTipo ?? '')} disabled={!retencionManual} onChange={(e) => setIsrTipo(e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(TIPOS_RETENCION_ISR).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
                    </NativeSelect>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4 · Pago */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-base font-semibold">4 · Pago</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="forma-pago">Forma de pago</Label>
                  <NativeSelect id="forma-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as 'contado' | 'credito')}>
                    <option value="contado">De contado</option>
                    <option value="credito">A crédito (cuenta por pagar)</option>
                  </NativeSelect>
                </div>
                {formaPago === 'contado' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="metodo-pago">Método</Label>
                      <NativeSelect id="metodo-pago" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="cheque">Cheque</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="deposito">Depósito</option>
                      </NativeSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fecha-pago">Fecha de pago</Label>
                      <Input id="fecha-pago" type="date" value={fechaPago} min={fecha} max={contexto.hoy} onChange={(e) => setFechaPago(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-vencimiento">Vence el</Label>
                    <Input id="fecha-vencimiento" type="date" value={fechaVencimiento} min={fecha} onChange={(e) => setFechaVencimiento(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas internas</Label>
                <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Orden de compra, observaciones…" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resumen */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="space-y-2 p-5 text-sm" data-testid="resumen-compra">
              <h2 className="mb-1 text-base font-semibold">Resumen</h2>
              <Fila k="Servicios" v={pesos(totales.baseServiciosCents)} />
              <Fila k="Bienes" v={pesos(totales.baseBienesCents)} />
              <Fila k="ITBIS facturado" v={pesos(totales.itbisCents)} />
              {imp.iscCents + imp.otrosImpuestosCents + imp.propinaCents > 0 && (
                <Fila k="ISC, otros y propina" v={pesos(imp.iscCents + imp.otrosImpuestosCents + imp.propinaCents)} />
              )}
              <Fila k="Total del comprobante" v={pesos(resumen.totalCents)} fuerte />
              {itbisRetenidoCents > 0 && <Fila k="ITBIS retenido" v={`−${pesos(itbisRetenidoCents)}`} tenue />}
              {isrRetenidoCents > 0 && <Fila k="ISR retenido" v={`−${pesos(isrRetenidoCents)}`} tenue />}
              <Fila k={formaPago === 'contado' ? 'Pagas al proveedor' : 'Le debes al proveedor'} v={pesos(resumen.netoAPagarCents)} fuerte />
              <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                <p>ITBIS que adelantas: <span className="font-medium text-foreground" data-testid="itbis-adelantar">{pesos(resumen.itbisPorAdelantarCents)}</span></p>
                {resumen.retencionesCents > 0 && <p>Retenciones a pagar a la DGII: <span className="font-medium text-foreground">{pesos(resumen.retencionesCents)}</span></p>}
                <p>606: {ncfInfo.valido && !ncfInfo.reporta606 ? 'no se reporta' : `tipo ${tipo606Final} · ${TIPOS_BIENES_606[tipo606Final]}`}</p>
              </div>
              <div className="space-y-1.5 border-t pt-2">
                <Label htmlFor="tipo-606" className="text-xs text-muted-foreground">Tipo de bienes y servicios (606)</Label>
                <NativeSelect id="tipo-606" value={tipo606} onChange={(e) => setTipo606(e.target.value)}>
                  <option value="">Automático: {tipo606Auto}</option>
                  {Object.entries(TIPOS_BIENES_606).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
                </NativeSelect>
              </div>
              {problemas.length > 0 && (
                <ul className="space-y-1 border-t pt-2 text-xs text-red-600" data-testid="problemas">
                  {[...new Set(problemas)].map((p) => <li key={p}>• {p}</li>)}
                </ul>
              )}
              <Button className="mt-2 w-full gap-1.5" disabled={guardando || problemas.length > 0} onClick={() => registrar(false)}>
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                {esGasto ? 'Registrar gasto' : 'Registrar compra'}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmarRepetido !== null}
        onOpenChange={(o) => { if (!o) setConfirmarRepetido(null); }}
        title="Ese NCF ya está registrado"
        description={`La compra #${confirmarRepetido} tiene el mismo NCF de este proveedor. Regístralo otra vez solo si es una entrega parcial del mismo comprobante: en el 606 va una sola vez por NCF.`}
        confirmLabel="Registrar de todas formas"
        onConfirm={() => { setConfirmarRepetido(null); void registrar(true); }}
      />
    </div>
  );
}

function Fila({ k, v, fuerte, tenue }: { k: string; v: string; fuerte?: boolean; tenue?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t pt-1.5 font-semibold' : ''} ${tenue ? 'text-muted-foreground' : ''}`}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
