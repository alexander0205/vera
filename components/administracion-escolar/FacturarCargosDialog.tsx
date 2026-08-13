'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, Eye, Loader2, Square, SquareCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RncSearch } from '@/components/RncSearch';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';
import { ModalPreviewPDF } from '@/app/(dashboard)/dashboard/facturas/nueva/modals/ModalPreviewPDF';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

/**
 * Facturar cargos escolares sin salir de la ficha del alumno.
 *
 * Antes esto era un salto a /dashboard/facturas/nueva, llenar, guardar, volver
 * y vincular a mano. Tres pantallas para cobrar una mensualidad. Aquí se ve a
 * quién se le cobra, qué meses entran y cómo va a quedar el papel; y al
 * confirmar, la factura queda creada Y atada al cargo en el mismo gesto.
 *
 * Lo que NO hace: sustituir al formulario grande. Descuentos, retenciones,
 * varios beneficiarios, cobrar en el acto — todo eso sigue viviendo allí, y por
 * eso está el botón "Avanzado", que se lleva la misma selección para allá.
 */

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface LineaPrefill {
  productoId: number | null;
  nombreItem: string;
  cantidadItem: number;
  precioUnitarioItem: number;
  tasaItbis: string;
  indicadorBienoServicio: string;
  dependienteId: number | null;
  dependienteNombre: string;
}

interface OpcionCargo {
  cargoId: number;
  previstoCuotaId?: number;
  conceptoId?: number;
  seleccionado: boolean;
  concepto: string;
  esMensualidad: boolean;
  mes: number | null;
  anio: number;
  fechaVencimiento: string | null;
  saldoCentavos: number;
  linea: LineaPrefill;
}

interface Comprador {
  clienteId: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  origen: 'tutor' | 'otro' | 'guardado';
  relacion: string | null;
}

interface Prefill {
  estudiante: { id: number; nombre: string };
  matriculaId: number;
  contexto: { periodo: string | null; servicio: string | null; grado: string | null; curso: string | null };
  comprador: Comprador | null;
  compradores: Comprador[];
  opciones: OpcionCargo[];
  advertencias: string[];
}

export interface FacturaCreada {
  documentoId: number;
  encf: string | null;
  /** En PESOS, como lo devuelve el motor de emisión. */
  montoTotal: number;
  emitida: boolean;
  /** Los cargos que quedaron atados, por si hay que reintentar algo. */
  cargos: number[];
  /** Para poder enseñar de qué es la factura sin ir a buscarla. */
  cliente: string;
  vence: string | null;
  lineas: { titulo: string; montoCentavos: number }[];
}

const ETIQUETA_ORIGEN: Record<Comprador['origen'], string> = {
  tutor: 'responsable de pago',
  otro: 'tutor',
  guardado: 'fijado para este alumno',
};

/**
 * El título de la línea, tal cual va a salir impreso.
 *
 * Lo usan la lista del modal y el cuerpo que se manda a emitir, para que lo que
 * se ve antes de confirmar sea literalmente lo que queda en el papel. (El motor
 * de facturación le antepone el nombre del beneficiario; eso no se toca aquí.)
 */
function tituloLinea(o: OpcionCargo): string {
  return o.mes ? `${o.linea.nombreItem} — ${MESES[o.mes]} ${o.anio}` : o.linea.nombreItem;
}

/**
 * El título con el beneficiario delante, que es como lo imprime el PDF
 * (`${dependienteNombre} - ${nombreItem}`, ver lib/pdf/FacturaPDF.tsx:789).
 *
 * Solo para enseñarlo: al emitir se manda el nombre a secas y el beneficiario
 * por su campo. Si se mandara ya pegado, el PDF lo pondría dos veces.
 */
function tituloImpreso(o: OpcionCargo): string {
  const benef = o.linea.dependienteNombre?.trim();
  return benef ? `${benef} - ${tituloLinea(o)}` : tituloLinea(o);
}

/** Dónde está matriculado. Va debajo del título, como en la factura. */
function descripcionLinea(c: Prefill['contexto']): string {
  return [c.periodo, c.servicio, [c.grado, c.curso].filter(Boolean).join(' ')]
    .filter(Boolean).join(' · ');
}

/** 'exento' vale 0; el resto llega como '0.18' y va como número al backend. */
function tasaANumero(tasa: string): number {
  return tasa === 'exento' ? 0 : Number(tasa) || 0;
}

export function FacturarCargosDialog({ open, onOpenChange, cargoIds, previsto, onFacturado }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Los cargos que se marcan de entrada. El resto se ofrece sin marcar. */
  cargoIds: number[];
  /**
   * Una cuota del calendario que TODAVÍA no es deuda.
   *
   * Entra en la factura como una línea más, pero el cargo no se crea al abrir
   * esto: se crea al confirmar. No puede quedar un mes pendiente de cobro
   * porque alguien abrió un modal y se arrepintió.
   */
  previsto?: { matriculaId: number; cuotaId: number; conceptoId: number } | null;
  /** Recibe la factura recién creada, para poder ofrecer cobrarla en el acto. */
  onFacturado: (creada: FacturaCreada) => void;
}) {
  const router = useRouter();
  const { tipoVisible, dgiiReady, ambiente, motivo, isLoading: cargandoTipos } = useTiposDisponibles();

  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Se indexa por `cargoId`, y la cuota prevista usa 0: solo puede haber una.
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [tipoEcf, setTipoEcf] = useState('sin-ncf');
  const [compradorId, setCompradorId] = useState<number | null>(null);
  const [otros, setOtros] = useState<Comprador[]>([]);
  const [recordar, setRecordar] = useState(true);
  const [guardandoRnc, setGuardandoRnc] = useState(false);
  const [enviando, setEnviando] = useState<'borrador' | 'emitir' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAbierta, setPreviewAbierta] = useState(false);
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const previewRef = useRef<string | null>(null);

  const clave = `${cargoIds.join(',')}|${previsto ? `${previsto.matriculaId}:${previsto.cuotaId}` : ''}`;

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    setPreviewUrl(null);
    fetch('/api/administracion-escolar/cargos/prefill-factura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cargoIds, previsto: previsto ?? undefined }),
    })
      .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) }))
      .then(({ ok, json }) => {
        if (!vivo) return;
        if (!ok) { setError(json.error ?? 'No se pudo preparar la factura'); return; }
        setPrefill(json);
        setCompradorId(json.comprador?.clienteId ?? null);
        setOtros([]);
            setMarcados(new Set(json.opciones.filter((o: OpcionCargo) => o.seleccionado).map((o: OpcionCargo) => o.cargoId)));
      })
      .catch(() => { if (vivo) setError('No se pudo preparar la factura'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clave]);

  // El blob del PDF se suelta al cerrar: si no, cada vista previa deja una copia
  // del documento en memoria hasta que se recargue la página.
  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const elegidas = useMemo(
    () => (prefill?.opciones ?? []).filter((o) => marcados.has(o.cargoId)),
    [prefill, marcados],
  );

  // Los tutores del alumno más lo que se haya buscado a mano en esta sesión.
  const candidatos = useMemo(
    () => [...(prefill?.compradores ?? []), ...otros],
    [prefill, otros],
  );
  const comprador = candidatos.find((c) => c.clienteId === compradorId) ?? null;
  // Guardar solo tiene sentido si lo elegido NO es ya lo que saldría por defecto.
  const cambioDeComprador = !!comprador && comprador.clienteId !== prefill?.comprador?.clienteId;

  const subtotal = elegidas.reduce((s, o) => s + o.saldoCentavos, 0);
  const itbis = elegidas.reduce(
    (s, o) => s + Math.round(o.saldoCentavos * tasaANumero(o.linea.tasaItbis)), 0);

  /** El mismo cuerpo que manda el formulario grande a /api/ecf/emitir. */
  const construirPayload = useCallback((modo: 'emitir' | 'borrador') => {
    const hoy = new Date().toISOString().slice(0, 10);
    // Dos hermanos en el mismo colegio generan facturas idénticas si la línea
    // solo dice "Pago de colegiatura — Octubre". Con el año escolar, el nivel y
    // el grado, cada documento se explica solo meses después.
    const descripcion = prefill ? descripcionLinea(prefill.contexto) : '';
    // Vence el más lejano de los cargos incluidos: la factura no puede vencer
    // antes que la deuda que cubre.
    const vencimientos = elegidas.map((o) => o.fechaVencimiento).filter((f): f is string => !!f);
    const fechaLimitePago = vencimientos.sort().at(-1) ?? '';

    const items = elegidas.map((o) => ({
      nombreItem: tituloLinea(o),
      cantidadItem: 1,
      precioUnitarioItem: o.linea.precioUnitarioItem,
      tasaItbis: tasaANumero(o.linea.tasaItbis),
      indicadorBienoServicio: parseInt(o.linea.indicadorBienoServicio, 10) as 1 | 2,
      descripcionItem: descripcion || undefined,
      productoId: o.linea.productoId ?? undefined,
      dependienteId: o.linea.dependienteId ?? undefined,
      dependienteNombre: o.linea.dependienteNombre || undefined,
    }));

    return {
      modo,
      tipoEcf,
      fechaEmision: hoy,
      rncComprador: comprador?.rnc || undefined,
      razonSocialComprador: comprador?.razonSocial || undefined,
      emailComprador: comprador?.email || undefined,
      // Crédito: la factura nace por cobrar, que es lo que es una mensualidad.
      // Cobrarla es otro acto, en la factura.
      tipoPago: 2,
      fechaLimitePago: fechaLimitePago || undefined,
      items,
      clientId: comprador?.clienteId,
      dependienteId: prefill?.opciones[0]?.linea.dependienteId ?? undefined,
      dependienteNombre: prefill?.opciones[0]?.linea.dependienteNombre || undefined,
      notas: `Cargos escolares de ${prefill?.estudiante.nombre ?? ''}`.trim(),
      lineasJson: JSON.stringify(elegidas.map((o) => ({
        nombreItem: tituloLinea(o),
        descripcionItem: descripcion,
        cantidadItem: 1,
        precioUnitarioItem: o.linea.precioUnitarioItem,
        descuentoPct: 0,
        tasaItbis: o.linea.tasaItbis,
        indicadorBienoServicio: o.linea.indicadorBienoServicio,
        unidadMedida: '',
        referencia: '',
        productoId: o.linea.productoId,
        dependienteId: o.linea.dependienteId ?? null,
        dependienteNombre: o.linea.dependienteNombre ?? '',
      }))),
    };
  }, [elegidas, prefill, tipoEcf, comprador]);

  async function verPrevia() {
    setGenerandoPreview(true);
    try {
      const res = await fetch('/api/pdf/factura/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(construirPayload('borrador')),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? 'No se pudo generar la vista previa');
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setPreviewAbierta(true);
    } catch {
      toast.error('No se pudo generar la vista previa');
    } finally {
      setGenerandoPreview(false);
    }
  }

  async function facturar(modo: 'borrador' | 'emitir') {
    const fechaLimite = elegidas
      .map((o) => o.fechaVencimiento)
      .filter((f): f is string => !!f)
      .sort()
      .at(-1) ?? null;
    setEnviando(modo);
    try {
      // La cuota prevista se convierte en cargo AHORA, no antes: si el usuario
      // cierra el modal sin confirmar, no puede quedarse una deuda de un mes
      // que nadie facturó.
      let cargosFinales = elegidas.map((o) => o.cargoId);
      const cuota = elegidas.find((o) => o.previstoCuotaId);
      if (cuota && prefill) {
        const r = await fetch(`/api/administracion-escolar/matriculas/${prefill.matriculaId}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cuotaId: cuota.previstoCuotaId, conceptoId: cuota.conceptoId, accion: 'adelantar',
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.cargoId) {
          toast.error(j.error ?? 'No se pudo preparar el mes por adelantado');
          return;
        }
        cargosFinales = cargosFinales.filter((id) => id !== 0).concat(j.cargoId);
      }

      const res = await fetch('/api/ecf/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(construirPayload(modo)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.documentoId) {
        toast.error(json.error ?? 'No se pudo crear la factura');
        return;
      }

      // Atar cada cargo a la factura. Va después de crearla y de uno en uno: si
      // uno falla, la factura ya existe y los demás quedan atados — el que se
      // quedó fuera se arregla con "Vincular factura", no repitiendo la emisión.
      const fallos: number[] = [];
      for (const cargoId of cargosFinales) {
        const v = await fetch(`/api/administracion-escolar/cargos/${cargoId}/saldar-con-factura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ecfDocumentId: json.documentoId }),
        });
        if (!v.ok) fallos.push(cargoId);
      }

      if (fallos.length > 0) {
        toast.warning(`Factura creada, pero ${fallos.length} cargo(s) no se pudieron vincular. Hazlo desde "Vincular factura".`);
      }
      // Que el RNC elegido se quede: el acuerdo con la familia no se vuelve a
      // teclear cada mes. Si falla, la factura ya salió — solo se pierde la
      // preferencia, y eso se dice sin tumbar el flujo.
      if (recordar && cambioDeComprador && comprador && prefill) {
        const g = await fetch(`/api/administracion-escolar/estudiantes/${prefill.estudiante.id}/facturar-a`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: comprador.clienteId }),
        });
        if (!g.ok) toast.warning('La factura salió, pero no se pudo guardar a quién facturarle de aquí en adelante.');
      }

      onOpenChange(false);
      onFacturado({
        documentoId: json.documentoId,
        encf: json.encf || null,
        montoTotal: json.montoTotal ?? (subtotal + itbis) / 100,
        emitida: modo === 'emitir',
        cargos: cargosFinales,
        cliente: comprador?.razonSocial ?? '',
        vence: fechaLimite,
        lineas: elegidas.map((o) => ({
          titulo: tituloLinea(o),
          montoCentavos: o.saldoCentavos,
        })),
      });
    } catch {
      toast.error('No se pudo crear la factura');
    } finally {
      setEnviando(null);
    }
  }

  function irAAvanzado() {
    const ids = elegidas.map((o) => o.cargoId).join(',');
    router.push(ids.includes(',')
      ? `/dashboard/facturas/nueva?desdeCargos=${ids}`
      : `/dashboard/facturas/nueva?desdeCargo=${ids}`);
  }

  const sinComprador = !comprador;
  /**
   * ¿Le falta el documento que ese comprobante exige?
   *
   * El 31 es crédito fiscal: va a nombre de una EMPRESA, y eso son nueve
   * dígitos. La cédula del padre tiene once y sirve para el 32 (consumo), no
   * para el 31 — por eso no basta con mirar si el campo está lleno. Con la
   * cédula puesta parecía que ya estaba todo y la factura salía a nombre de una
   * persona con un comprobante de empresa.
   */
  const documento = (comprador?.rnc ?? '').replace(/\D/g, '');
  const faltaRnc = !comprador ? false
    : tipoEcf === '31' ? documento.length !== 9
    : tipoEcf === '32' ? documento.length === 0
    : false;


  async function guardarRnc(rnc: string, nombre: string) {
    if (!comprador) return;
    setGuardandoRnc(true);
    try {
      const res = await fetch(`/api/clientes/${comprador.clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial: comprador.razonSocial || nombre,
          rnc,
          email: comprador.email ?? '',
          telefono: comprador.telefono ?? '',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? 'No se pudo guardar el RNC');
        return;
      }
      // Queda en el contacto: la próxima factura ya sale con él.
      const actualizado = { ...comprador, rnc, razonSocial: comprador.razonSocial || nombre };
      setOtros((prev) => {
        const sin = prev.filter((c) => c.clienteId !== comprador.clienteId);
        return [...sin, actualizado];
      });
      setPrefill((prev) => prev ? {
        ...prev,
        compradores: prev.compradores.map((c) => c.clienteId === comprador.clienteId ? actualizado : c),
      } : prev);
      toast.success('RNC guardado en el contacto');
    } catch {
      toast.error('No se pudo guardar el RNC');
    } finally {
      setGuardandoRnc(false);
    }
  }
  const nada = elegidas.length === 0;
  const ocupado = enviando !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !ocupado) onOpenChange(false); }}>
      <DialogContent
        maxWidth={false}
        // El ancho va en estilo en línea porque `fullWidth` de MUI le pone al
        // panel `calc(100% - 64px)` y eso se come cualquier `max-w-*`. Con
        // clamp, ~55% en pantalla grande y sin quedarse angosto en un móvil.
        style={{ width: 'clamp(20rem, 66vw, 50rem)' }}
      >
        <ModalHeader
          title="Facturar"
          subtitle={prefill ? prefill.estudiante.nombre : undefined}
        />

        <div className="max-h-[70vh] overflow-y-auto px-6 py-3.5 space-y-3">
          {cargando && (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>
          )}

          {error && !cargando && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {prefill && !cargando && (
            <>
              {/* A quién y con qué comprobante, juntos: son la misma decisión.
                  El comprador manda — sin su RNC no hay comprobante fiscal que
                  ofrecer, así que ni se enseña. */}
              {candidatos.length === 0 ? (
                <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <UserX className="h-5 w-5 shrink-0 text-red-600" />
                  <div className="text-sm text-red-700">
                    <p className="font-medium">Este alumno no tiene ningún tutor con contacto</p>
                    <p className="mt-0.5 text-xs">
                      Ve a la pestaña Tutores y vincula al responsable con un contacto, o busca uno aquí abajo.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">Tutor de factura</p>
                    <NativeSelect
                      value={compradorId != null ? String(compradorId) : ''}
                      onChange={(e) => setCompradorId(Number(e.target.value) || null)}
                    >
                      {candidatos.map((c) => (
                        <option key={c.clienteId} value={c.clienteId}>
                          {c.razonSocial}
                          {c.rnc ? ` · ${c.rnc}` : ' · sin RNC'}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">Comprobante</p>
                    <NativeSelect
                      value={tipoEcf}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTipoEcf(v);
                        // Un fiscal sin RNC no se puede emitir: se pide aquí
                        // mismo en vez de dejar que reviente al confirmar.
                      }}
                    >
                      <option value="sin-ncf">Sin NCF · interno, no va a DGII</option>
                      {tipoVisible('31') && <option value="31">31 · Crédito fiscal</option>}
                      {tipoVisible('32') && <option value="32">32 · Consumo</option>}
                    </NativeSelect>
                    {!dgiiReady && !cargandoTipos && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        {motivo ?? `Empresa fuera de Producción${ambiente ? ` (${ambiente})` : ''}: solo sin NCF.`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Con un comprobante fiscal el buscador está SIEMPRE, tenga o
                  no documento el contacto: es el sitio donde se decide con qué
                  RNC sale la factura, y muchas veces hay que cambiarlo aunque
                  el que hay sea válido. */}
              {tipoEcf !== 'sin-ncf' && comprador && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className={`mb-2 text-xs ${faltaRnc ? 'text-red-600' : 'text-gray-600'}`}>
                    {!faltaRnc
                      ? `Sale con ${documento} · ${comprador.razonSocial}. Busca otro si la factura va a nombre de otra empresa.`
                      : tipoEcf === '31'
                        ? `El crédito fiscal va a nombre de una empresa, y «${comprador.razonSocial}» ${documento ? `tiene ${documento.length} dígitos, que no es un RNC` : 'no tiene documento'}.`
                        : `Falta el RNC o la cédula de «${comprador.razonSocial}».`}
                    {faltaRnc && ' Búscalo aquí: queda guardado y no habrá que teclearlo otra vez.'}
                  </p>
                  {/* El mismo buscador del padrón que usa el formulario de
                      factura, pero VACÍO: aquí se viene a sustituir el documento
                      que no vale, y sembrarlo con el actual dejaba el campo con
                      pinta de cerrado. Sin `onClear`: vaciarlo llegaba a borrar
                      el documento del contacto sin que nadie lo pidiera. */}
                  <RncSearch
                    placeholder="Buscar RNC, Cédula o razón social…"
                    onSelect={(r) => void guardarRnc(r.rnc, r.nombre)}
                  />
                  {guardandoRnc && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />Guardando…
                    </p>
                  )}

                </div>
              )}

              {cambioDeComprador && (
                <button
                  type="button"
                  onClick={() => setRecordar((r) => !r)}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2 text-left"
                >
                  {recordar
                    ? <SquareCheck className="h-4 w-4 shrink-0 text-zero-600" />
                    : <Square className="h-4 w-4 shrink-0 text-gray-300" />}
                  <span className="text-xs text-gray-700">
                    Facturarle siempre a este contacto
                    <span className="block text-[11px] text-gray-500">
                      Queda guardado en el alumno.
                    </span>
                  </span>
                </button>
              )}

              {/* 3 · Lo que va en la factura, y solo eso: la lista de todo lo
                  pendiente hacía leer nueve renglones para ver que se cobra uno. */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500">
                  Qué se cobra · así saldrá cada línea en la factura
                </p>
                <div className="rounded-lg border border-gray-200">
                  {elegidas.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-gray-400">
                      No has elegido nada. Añádelo de los pendientes de abajo.
                    </p>
                  ) : elegidas.map((o) => (
                    <div key={o.cargoId || `p-${o.previstoCuotaId}`}
                      className="border-b border-gray-100 last:border-b-0">
                      {/* De qué mes es, como cabecera: es lo que se busca al
                          repasar la factura. Debajo, el renglón tal cual se va
                          a imprimir, que es largo y no sirve para orientarse. */}
                      <div className="bg-gray-50 px-3 py-1.5">
                        <p className="truncate text-xs font-medium text-gray-700">
                          {o.mes ? `${MESES[o.mes]} ${o.anio} · ` : ''}{o.concepto}
                        </p>
                      </div>
                      {/* El importe va con el renglón impreso, no en la
                          cabecera: es lo que se compara contra el papel. */}
                      <div className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800">{tituloImpreso(o)}</p>
                          <p className="text-xs text-gray-400">{descripcionLinea(prefill.contexto)}</p>
                        </div>
                        <span className="shrink-0 text-sm font-medium text-gray-900">
                          {fmtDOP(o.saldoCentavos)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-1 text-sm">
                  <span className="text-gray-500">
                    {elegidas.length} {elegidas.length === 1 ? 'concepto' : 'conceptos'}
                    {itbis > 0 && <> · ITBIS {fmtDOP(itbis)}</>}
                  </span>
                  <span className="font-medium text-gray-900">{fmtDOP(subtotal + itbis)}</span>
                </div>
              </div>

            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={irAAvanzado} disabled={nada || ocupado}>
            <ExternalLink className="mr-1.5 h-4 w-4" />Avanzado
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          {/* En la barra de abajo, como en la pantalla de factura: la vista
              previa es una acción del documento, no parte del formulario. */}
          <Button variant="outline" onClick={verPrevia} disabled={nada || generandoPreview || ocupado}>
            {generandoPreview
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Eye className="mr-1.5 h-4 w-4" />}
            Vista previa
          </Button>
          {/* Sin NCF no se emite a la DGII: no hay comprobante que enviar, y el
              servidor rechaza `modo: emitir` con ese tipo. Se guarda como
              borrador, igual que hace el formulario grande. */}
          <Button
            onClick={() => facturar(tipoEcf === 'sin-ncf' ? 'borrador' : 'emitir')}
            disabled={nada || sinComprador || faltaRnc || ocupado}
          >
            {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tipoEcf === 'sin-ncf' ? 'Crear factura' : 'Emitir a DGII'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ModalPreviewPDF
        open={previewAbierta}
        onOpenChange={setPreviewAbierta}
        tipoEcf={tipoEcf}
        previewUrl={previewUrl}
        loading={enviando === 'emitir'}
        onEmitir={() => { setPreviewAbierta(false); void facturar(tipoEcf === 'sin-ncf' ? 'borrador' : 'emitir'); }}
      />
    </Dialog>
  );
}
