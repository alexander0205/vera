'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  onSaved: () => void;
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

function hoy() { return new Date().toISOString().slice(0, 10); }

function montoACentavos(valor: string) {
  const monto = Number.parseFloat(valor.replace(',', '.'));
  return Number.isFinite(monto) ? Math.round(monto * 100) : 0;
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
      fechaVencimiento: hoy(),
    });
    setError(null);
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
      onSaved();
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
        <DialogHeader><DialogTitle>
          Agregar cargo · {mesBloqueado
            ? new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(Number(form.anio), (mesInicial ?? 1) - 1, 1))
            : periodoNombre}
        </DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div> : <>
            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <Select value={form.conceptoId} onValueChange={(conceptoId) => setForm((f) => ({ ...f, conceptoId }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                <SelectContent>{conceptos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {concepto?.tipo === 'mensualidad' && (
              meses.length ? <div className="space-y-1.5">
                <Label>Mes de mensualidad *</Label>
                <Select value={`${form.anio}-${String(form.mes).padStart(2, '0')}`} disabled={mesBloqueado} onValueChange={(value) => {
                  const seleccionado = meses.find((m) => m.key === value);
                  if (seleccionado) setForm((f) => ({ ...f, mes: String(seleccionado.mes), anio: String(seleccionado.anio) }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{meses.map((m) => <SelectItem key={m.key} value={m.key}>{new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(m.anio, m.mes - 1, 1))}</SelectItem>)}</SelectContent>
                </Select>
              </div> : <p className="text-sm text-amber-700">Configura fechas de inicio y fin del período antes de crear una mensualidad.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Monto (RD$) *</Label><Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Vencimiento</Label><Input type="date" value={form.fechaVencimiento} onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))} /></div>
            </div>
          </>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={guardar} disabled={loading || saving || !matriculaId || !periodoId}>
            {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Crear cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
