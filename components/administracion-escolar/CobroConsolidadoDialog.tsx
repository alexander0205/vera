'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import { toast } from 'sonner';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface FacturaConsolidable {
  ecfDocumentId: number;
  ref: string;
  concepto: string | null;
  mes: number | null;
  anio: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
}

function hoy() { return new Date().toISOString().slice(0, 10); }

function centavos(valor: string) {
  const n = Number.parseFloat(valor.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Un solo pago que salda VARIAS facturas del estudiante. Reparte el monto en
 * cascada sobre las facturas seleccionadas (la más vieja primero) y registra un
 * abono por factura reutilizando el endpoint de cobro (`/pagos`). La factura
 * sigue siendo la única fuente de cobro; esto es solo el reparto de un pago.
 */
export function CobroConsolidadoDialog({
  open, onClose, onSaved, facturas,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  facturas: FacturaConsolidable[];
}) {
  // Más viejas primero: el reparto en cascada empieza por la deuda más antigua.
  const ordenadas = useMemo(
    () => [...facturas].sort((a, b) =>
      (a.fechaVencimiento ?? '9999-12-31').localeCompare(b.fechaVencimiento ?? '9999-12-31')),
    [facturas],
  );

  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('transferencia');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);

  // Al abrir: seleccionar todas y prellenar el monto con la suma de sus saldos.
  useEffect(() => {
    if (!open) return;
    const todas = new Set(ordenadas.map((f) => f.ecfDocumentId));
    setSeleccion(todas);
    const suma = ordenadas.reduce((s, f) => s + f.saldoCentavos, 0);
    setMonto((suma / 100).toFixed(2));
    setMetodo('transferencia');
    setReferencia('');
    setFecha(hoy());
    setProgreso(null);
  }, [open, ordenadas]);

  const seleccionadas = ordenadas.filter((f) => seleccion.has(f.ecfDocumentId));
  const sumaSaldos = seleccionadas.reduce((s, f) => s + f.saldoCentavos, 0);
  const montoCent = centavos(monto);

  // Reparto en cascada: llena la más vieja primero hasta agotar el monto.
  const reparto = useMemo(() => {
    let restante = montoCent;
    return seleccionadas.map((f) => {
      const asignado = Math.max(0, Math.min(restante, f.saldoCentavos));
      restante -= asignado;
      return { factura: f, asignado };
    });
  }, [seleccionadas, montoCent]);

  const totalAsignado = reparto.reduce((s, r) => s + r.asignado, 0);
  const sobrante = Math.max(0, montoCent - totalAsignado);

  function toggle(id: number) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function guardar() {
    const aplicar = reparto.filter((r) => r.asignado > 0);
    if (aplicar.length === 0) { toast.error('Nada que aplicar: revisa el monto y las facturas'); return; }
    setGuardando(true);
    let ok = 0;
    try {
      for (let i = 0; i < aplicar.length; i++) {
        const { factura, asignado } = aplicar[i];
        setProgreso(`Registrando ${i + 1} de ${aplicar.length}…`);
        const res = await fetch(`/api/cuentas-por-cobrar/${factura.ecfDocumentId}/pagos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fechaPago: fecha,
            pagos: [{ montoDOP: asignado / 100, metodo, referencia: referencia.trim() || undefined }],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`${factura.ref}: ${json.error ?? 'error al registrar'}`);
        }
        ok += 1;
      }
      toast.success(`Pago aplicado a ${ok} factura(s)`);
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar el pago';
      toast.error(ok > 0 ? `Se aplicaron ${ok} y falló: ${msg}` : msg);
      // Si algo se aplicó, refrescamos para reflejar lo ya cobrado.
      if (ok > 0) onSaved();
    } finally {
      setGuardando(false);
      setProgreso(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cobrar varias facturas con un pago</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500">
            El monto se reparte en cascada: primero la factura más antigua. Cada factura
            recibe su propio registro de pago.
          </p>

          {/* Facturas seleccionables + reparto en vivo */}
          <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {ordenadas.map((f) => {
              const asignado = reparto.find((r) => r.factura.ecfDocumentId === f.ecfDocumentId)?.asignado ?? 0;
              const marcada = seleccion.has(f.ecfDocumentId);
              return (
                <label key={f.ecfDocumentId} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                  <input type="checkbox" checked={marcada} onChange={() => toggle(f.ecfDocumentId)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {f.concepto ?? 'Cargo'} · {f.mes ? `${MESES[f.mes]} ${f.anio}` : f.anio}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {f.ref}{f.fechaVencimiento ? ` · vence ${fmtFechaCorta(f.fechaVencimiento)}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs text-gray-400">saldo {fmtDOP(f.saldoCentavos)}</span>
                    {marcada && (
                      <span className={`block text-sm font-semibold ${asignado > 0 ? 'text-teal-700' : 'text-gray-300'}`}>
                        {fmtDOP(asignado)}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto total (RD$) *</Label>
              <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
              <button type="button" onClick={() => setMonto((sumaSaldos / 100).toFixed(2))}
                className="text-[11px] font-medium text-teal-600 hover:text-teal-700">
                Usar saldo total ({fmtDOP(sumaSaldos)})
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Método *</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Referencia</Label>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">A aplicar</span><span className="font-medium text-gray-900">{fmtDOP(totalAsignado)}</span></div>
            {sobrante > 0 && (
              <div className="flex justify-between"><span className="text-amber-600">Sobrante sin aplicar</span><span className="font-medium text-amber-600">{fmtDOP(sobrante)}</span></div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={guardar} disabled={guardando || totalAsignado === 0}>
            {guardando ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{progreso ?? 'Registrando…'}</> : 'Registrar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
