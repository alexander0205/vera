'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { Loader2 } from 'lucide-react';
import { mesesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';

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

const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoy() { return new Date().toISOString().slice(0, 10); }

function montoACentavos(valor: string) {
  const monto = Number.parseFloat(valor.replace(',', '.'));
  return Number.isFinite(monto) ? Math.round(monto * 100) : 0;
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
  const [form, setForm] = useState({ conceptoId: '', mes: '', anio: '', monto: '', fechaVencimiento: hoy() });
  /**
   * Facturarlo en el mismo gesto.
   *
   * Lo que se cobra suelto —una excursión, un uniforme, la reposición del
   * carnet— casi siempre se factura al momento, con el padre delante. Sin esto
   * había que crear el cargo, cerrar, buscarlo en la lista y facturarlo: tres
   * pasos para algo que es uno solo en el mostrador.
   */
  const [facturarYa, setFacturarYa] = useState(false);
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
      mes: preseleccion ? String(preseleccion.mes) : '',
      anio: String(preseleccion?.anio ?? anioInicial ?? actual.getFullYear()),
      monto: '',
      fechaVencimiento: preseleccion ? vencimientoDefault(preseleccion.anio, preseleccion.mes) : hoy(),
    });
    setError(null);
    setFacturarYa(false);
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

  async function guardar() {
    if (!matriculaId || !periodoId) {
      setError('Este período no tiene una matrícula válida para crear el cargo');
      return;
    }
    const montoCentavos = montoACentavos(form.monto);
    if (!form.conceptoId || montoCentavos <= 0) {
      setError('Concepto y monto son obligatorios');
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
          anio: Number(form.anio),
          montoCentavos,
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
                {conceptos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Monto (RD$) *</Label><Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} /></div>
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
