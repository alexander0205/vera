'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InputMoneda } from '@/components/ui/input-moneda';
import { fmtDOP, parseDOPaCentavos } from '@/lib/utils/format';
import { deDondeSaleElPrecio, type SugerenciaDeMonto } from '@/lib/administracion-escolar/precio-cargo-individual';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { Loader2 } from 'lucide-react';
import { mesesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { conceptosPorClase } from '@/lib/administracion-escolar/cobros-matricula';

interface Concepto {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `cargoId` llega cuando el usuario pidió facturarlo de una vez. */
  onSaved: (cargoId?: number) => void;
  estudianteId: number;
  matriculaId: number | null;
  periodoId: number | null;
  periodoNombre: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  // Cuando se abre desde el panel de un mes específico, el mes viene prefijado
  // y bloqueado (agregar cargo individual por mes).
  mesInicial?: number | null;
  anioInicial?: number | null;
}

interface CuotaElegible { id: number; etiqueta: string; montoCentavos: number; cargada: boolean }

const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoy() { return new Date().toISOString().slice(0, 10); }

/**
 * Lo tecleado, en centavos. 0 si no sirve — quien llama ya exige > 0.
 *
 * La coma es separador de MILES, que es como este sistema escribe el dinero
 * («RD$2,800.00»). Leída como decimal, «1,100» creaba el cargo por RD$1.10.
 */
function montoACentavos(valor: string) {
  return parseDOPaCentavos(valor) ?? 0;
}

// Rango [primer día, último día] del mes, en ISO. El calendario de vencimiento
// queda atado a ese mes.
function rangoMes(anio: number, mes: number) {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return { min: `${anio}-${mm}-01`, max: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`, ultimoDia };
}

// Vencimiento por defecto dentro del mes elegido: hoy si estamos en ese mes,
// si no el día 5 (fecha de cobro típica).
function vencimientoDefault(anio: number, mes: number) {
  const now = new Date();
  if (anio === now.getFullYear() && mes === now.getMonth() + 1) return hoy();
  return `${anio}-${String(mes).padStart(2, '0')}-05`;
}

export function CrearCargoEstudianteDialog({
  open, onClose, onSaved, estudianteId, matriculaId, periodoId, periodoNombre, fechaInicio, fechaFin,
  mesInicial = null, anioInicial = null,
}: Props) {
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ conceptoId: '', cuotaId: '', mes: '', anio: '', monto: '', fechaVencimiento: hoy() });
  /**
   * Facturarlo en el mismo gesto.
   *
   * Lo que se cobra suelto —una excursión, un uniforme, la reposición del
   * carnet— casi siempre se factura al momento, con el padre delante. Sin esto
   * había que crear el cargo, cerrar, buscarlo en la lista y facturarlo: tres
   * pasos para algo que es uno solo en el mostrador.
   */
  const [facturarYa, setFacturarYa] = useState(false);
  /**
   * El precio que el colegio ya tiene configurado para el curso del alumno.
   *
   * Antes el monto salía en blanco y había que ir a Tarifas a copiarlo. Ahora
   * se rellena con lo mismo que cobraría el plan y sigue siendo editable: un
   * cargo suelto puede ser un caso aparte. `undefined` = aún no se preguntó;
   * `null` = el concepto no tiene precio para este curso y se escribe a mano.
   */
  const [precio, setPrecio] = useState<{ curso: string; sugerencia: SugerenciaDeMonto | null } | undefined>(undefined);
  /**
   * Las cuotas de un concepto repartido (evaluación en 3 pagos). El cargo se
   * ata a la que se elija: sin eso el devengo no sabía que esa cuota ya estaba
   * cobrada y la volvía a crear en su mes.
   */
  const [cuotas, setCuotas] = useState<CuotaElegible[]>([]);
  const [buscandoPrecio, setBuscandoPrecio] = useState(false);
  /** Lo último que se rellenó solo: si el monto sigue igual, nadie lo tocó. */
  const montoSugerido = useRef('');
  /** De qué concepto es el monto que hay en el campo. */
  const conceptoDelMonto = useRef('');
  const meses = useMemo(() => mesesDelPeriodo(fechaInicio, fechaFin), [fechaInicio, fechaFin]);
  const concepto = conceptos.find((c) => String(c.id) === form.conceptoId) ?? null;
  // Mes bloqueado: se abrió desde el panel de un mes concreto y ese mes existe
  // en el calendario académico del período.
  const mesBloqueado = mesInicial != null && meses.some((m) => m.mes === mesInicial && (anioInicial == null || m.anio === anioInicial));

  useEffect(() => {
    if (!open) return;
    const actual = new Date();
    const preseleccion = mesInicial != null
      ? (meses.find((m) => m.mes === mesInicial && (anioInicial == null || m.anio === anioInicial)) ?? null)
      : (meses.find((m) => m.mes === actual.getMonth() + 1 && m.anio === actual.getFullYear()) ?? meses[0] ?? null);
    setForm({
      conceptoId: '',
      cuotaId: '',
      mes: preseleccion ? String(preseleccion.mes) : '',
      anio: String(preseleccion?.anio ?? anioInicial ?? actual.getFullYear()),
      monto: '',
      fechaVencimiento: preseleccion ? vencimientoDefault(preseleccion.anio, preseleccion.mes) : hoy(),
    });
    setError(null);
    setFacturarYa(false);
    setPrecio(undefined);
    montoSugerido.current = '';
    conceptoDelMonto.current = '';
    setLoading(true);
    fetch('/api/administracion-escolar/conceptos')
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error ?? 'No se pudieron cargar los conceptos');
        setConceptos((data.conceptos ?? []).filter((c: Concepto) => c.activo !== false));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los conceptos'))
      .finally(() => setLoading(false));
  }, [open, meses, mesInicial, anioInicial]);

  // Al elegir concepto (o cambiar de mes, que en un cobro repartido cambia la
  // cuota) se pide su precio. Otro concepto siempre trae su precio: lo escrito
  // era para el anterior. Con el mismo concepto, un monto escrito a mano se
  // respeta y solo se reemplaza el que se puso solo.
  useEffect(() => {
    if (!open || !matriculaId || !form.conceptoId) { setPrecio(undefined); setCuotas([]); return; }
    const otroConcepto = conceptoDelMonto.current !== form.conceptoId;
    conceptoDelMonto.current = form.conceptoId;
    if (otroConcepto) {
      // El precio y el monto eran del concepto anterior. Se sueltan YA, no al
      // llegar la respuesta: si la consulta falla —o mientras viaja— no se
      // puede guardar el concepto nuevo con el monto del viejo, ni tomar por
      // exonerado (beca del 100 %) lo que era del otro.
      setPrecio(undefined);
      setCuotas([]);
      setForm((f) => ({ ...f, monto: '', cuotaId: '' }));
      montoSugerido.current = '';
    }
    let vigente = true;
    setBuscandoPrecio(true);
    // Al cambiar de concepto la cuota elegida era del otro: no se manda.
    const cuotaPedida = otroConcepto ? '' : form.cuotaId;
    const qs = new URLSearchParams({
      conceptoId: form.conceptoId,
      ...(form.mes ? { mes: form.mes } : {}),
      ...(cuotaPedida ? { cuotaId: cuotaPedida } : {}),
    });
    fetch(`/api/administracion-escolar/matriculas/${matriculaId}/precio?${qs}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!vigente) return;
        if (!ok) throw new Error(data.error ?? 'No se pudo leer el precio del concepto');
        setPrecio({ curso: data.curso, sugerencia: data.sugerencia });
        setCuotas(Array.isArray(data.cuotas) ? data.cuotas : []);
        const nuevo = data.sugerencia ? (data.sugerencia.montoCentavos / 100).toFixed(2) : '';
        const cuotaSugerida = data.sugerencia?.cuota?.id != null ? String(data.sugerencia.cuota.id) : '';
        setForm((f) => ({
          ...f,
          ...(otroConcepto || f.monto === '' || f.monto === montoSugerido.current ? { monto: nuevo } : {}),
          ...(f.cuotaId === '' && cuotaSugerida ? { cuotaId: cuotaSugerida } : {}),
        }));
        montoSugerido.current = nuevo;
      })
      // Si no se pudo leer, no se afirma nada: el campo queda para escribirlo.
      .catch(() => { if (vigente) setPrecio(undefined); })
      .finally(() => { if (vigente) setBuscandoPrecio(false); });
    return () => { vigente = false; };
  }, [open, matriculaId, form.conceptoId, form.mes, form.cuotaId]);

  async function guardar() {
    if (!matriculaId || !periodoId) {
      setError('Este período no tiene una matrícula válida para crear el cargo');
      return;
    }
    const montoCentavos = montoACentavos(form.monto);
    // Un becado al 100% resuelve en RD$0. El servidor solo acepta ese cero si
    // lo calcula él, así que en ese caso no se manda el monto.
    const exonerado = montoCentavos === 0 && precio?.sugerencia?.origen === 'beca'
      && precio.sugerencia.montoCentavos === 0;
    if (!form.conceptoId || (montoCentavos <= 0 && !exonerado)) {
      setError('Concepto y monto son obligatorios');
      return;
    }
    if (cuotas.length > 1 && !form.cuotaId) {
      setError('Elige qué cuota es este cargo');
      return;
    }
    if (concepto?.tipo === 'mensualidad' && !form.mes) {
      setError('Configura las fechas del período y elige un mes de mensualidad');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/cargos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudianteId,
          matriculaId,
          periodoId,
          conceptoId: Number(form.conceptoId),
          mes: concepto?.tipo === 'mensualidad' ? Number(form.mes) : null,
          ...(cuotas.length > 1 && form.cuotaId ? { cuotaId: Number(form.cuotaId) } : {}),
          anio: Number(form.anio),
          ...(exonerado ? {} : { montoCentavos }),
          fechaVencimiento: form.fechaVencimiento || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear el cargo');
      // El id solo viaja si se pidió facturar: quien llama abre la factura con
      // este cargo ya marcado.
      onSaved(facturarYa ? (data.cargo?.id ?? data.id) : undefined);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el cargo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-md">
        <ModalHeader subtitle="Se suma a la cuenta del estudiante."
          title={<>Agregar cargo · {mesBloqueado
            ? new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(Number(form.anio), (mesInicial ?? 1) - 1, 1))
            : periodoNombre}</>} />
        <div className="space-y-4 px-6 py-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div> : <>
            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <NativeSelect value={form.conceptoId} onChange={(e) => setForm((f) => ({ ...f, conceptoId: e.target.value }))}>
                <option value="" disabled>Seleccionar concepto</option>
                {/* Por clase: una mensualidad pide además su mes, y mezclada con
                    los cargos sueltos había que conocer cada concepto para saberlo. */}
                {conceptosPorClase(conceptos).map((g) => (
                  <optgroup key={g.titulo} label={g.titulo}>
                    {g.conceptos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                  </optgroup>
                ))}
              </NativeSelect>
            </div>
            {concepto?.tipo === 'mensualidad' && (
              meses.length ? <div className="space-y-1.5">
                <Label>Mes de mensualidad *</Label>
                <NativeSelect value={`${form.anio}-${String(form.mes).padStart(2, '0')}`} disabled={mesBloqueado} onChange={(e) => {
                  const seleccionado = meses.find((m) => m.key === e.target.value);
                  if (seleccionado) setForm((f) => ({ ...f, mes: String(seleccionado.mes), anio: String(seleccionado.anio), fechaVencimiento: vencimientoDefault(seleccionado.anio, seleccionado.mes) }));
                }}>
                  {meses.map((m) => <option key={m.key} value={m.key}>{new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(m.anio, m.mes - 1, 1))}</option>)}
                </NativeSelect>
              </div> : <p className="text-sm text-amber-700">Configura fechas de inicio y fin del período antes de crear una mensualidad.</p>
            )}
            {cuotas.length > 1 && concepto?.tipo !== 'mensualidad' && (
              <div className="space-y-1.5">
                <Label>Cuota *</Label>
                <NativeSelect value={form.cuotaId} onChange={(e) => setForm((f) => ({ ...f, cuotaId: e.target.value }))}>
                  <option value="" disabled>Elegir cuota</option>
                  {cuotas.map((c) => (
                    <option key={c.id} value={String(c.id)} disabled={c.cargada}>
                      {c.etiqueta} · {fmtDOP(c.montoCentavos)}{c.cargada ? ' (ya tiene cargo)' : ''}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Monto (RD$) *</Label><InputMoneda value={form.monto} onValueChange={(v) => setForm((f) => ({ ...f, monto: v }))} /></div>
              <div className="space-y-1.5">
                <Label>Vencimiento</Label>
                {(() => {
                  // El calendario de vencimiento queda atado al mes elegido: solo
                  // se pueden escoger sus días.
                  const mesSel = Number(form.mes);
                  const anioSel = Number(form.anio);
                  const rango = form.mes && Number.isInteger(mesSel) ? rangoMes(anioSel, mesSel) : null;
                  return <>
                    <Input type="date" value={form.fechaVencimiento}
                      min={rango?.min} max={rango?.max}
                      onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))} />
                    {rango && (
                      <p className="text-xs text-gray-400">
                        Elige un día de {NOMBRE_MES[mesSel]} {anioSel} (1–{rango.ultimoDia}).
                      </p>
                    )}
                  </>;
                })()}
              </div>
            </div>
            <NotaDelPrecio
              concepto={concepto?.nombre ?? ''}
              buscando={buscandoPrecio}
              precio={form.conceptoId ? precio : undefined}
              aMano={precio?.sugerencia != null
                && montoACentavos(form.monto) !== precio.sugerencia.montoCentavos} />
          </>}
        </div>
        <DialogFooter>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={facturarYa} className="h-4 w-4 accent-zero-600"
              onChange={(e) => setFacturarYa(e.target.checked)} />
            Facturarlo ahora
          </label>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={guardar} disabled={loading || saving || !matriculaId || !periodoId}>
            {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Crear cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Debajo del monto: de dónde salió el número, o que no hay precio y hay que
 * escribirlo. Sin esto el campo lleno parecía una cifra inventada, y el campo
 * vacío no decía si faltaba configurar algo.
 */
function NotaDelPrecio({ concepto, buscando, precio, aMano }: {
  concepto: string;
  buscando: boolean;
  precio: { curso: string; sugerencia: SugerenciaDeMonto | null } | undefined;
  aMano: boolean;
}) {
  if (buscando) {
    return <p className="flex items-center gap-1.5 text-xs text-gray-500">
      <Loader2 className="h-3 w-3 animate-spin" />Buscando el precio de su curso…
    </p>;
  }
  if (!precio) return null;
  const { curso, sugerencia } = precio;
  if (!sugerencia) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
        «{concepto}» no tiene precio configurado{curso ? <> para <strong>{curso}</strong></> : null}.
        Escribe el monto de este cargo.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600">
      <p>
        Precio para <strong>{curso}</strong>: {fmtDOP(sugerencia.montoCentavos)}, de {deDondeSaleElPrecio(sugerencia.origen)}.
        {sugerencia.cuota && (
          <> Es la cuota «{sugerencia.cuota.etiqueta}» de {sugerencia.cuota.de} ({fmtDOP(sugerencia.tarifaCentavos)} en el año).</>
        )}
      </p>
      {aMano && <p className="mt-1 text-amber-700">Cambiaste el monto: se cobra lo que escribiste.</p>}
    </div>
  );
}
