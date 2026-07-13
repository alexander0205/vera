'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface CargoPendiente {
  id: number;
  concepto: string | null;
  mes: number | null;
  anio: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
  ecfDocumentId: number | null;
  facturaEncf: string | null;
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'];

function labelCargo(c: CargoPendiente): string {
  const concepto = c.concepto ?? 'Cargo';
  const mes = c.mes ? ` ${MESES[c.mes]}` : '';
  return `${concepto}${mes} ${c.anio} — ${fmtDOP(c.saldoCentavos)}`;
}

const hoy = () => new Date().toISOString().split('T')[0];

interface Props {
  estudianteId: number;
  estudianteNombre: string;
  /** Si viene, el diálogo abre fijado a ese cargo (sin selector). */
  cargoIdInicial?: number | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function RegistrarPagoDialog({ estudianteId, estudianteNombre, cargoIdInicial, open, onClose, onDone }: Props) {
  const [cargos, setCargos]       = useState<CargoPendiente[]>([]);
  const [loading, setLoading]     = useState(false);
  const [cargoId, setCargoId]     = useState<string>('');
  const [monto, setMonto]         = useState<string>('');
  const [metodo, setMetodo]       = useState<string>('efectivo');
  const [fecha, setFecha]         = useState<string>(hoy());
  const [referencia, setReferencia] = useState<string>('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/cargos`).then((r) => r.json());
      const pendientes: CargoPendiente[] = (data.cargos ?? []).filter(
        (c: CargoPendiente) => ['pendiente', 'parcial', 'vencido'].includes(c.estado),
      );
      setCargos(pendientes);
      const inicial = cargoIdInicial
        ? pendientes.find((c) => c.id === cargoIdInicial)
        : undefined;
      const elegido = inicial ?? pendientes[0];
      if (elegido) {
        setCargoId(String(elegido.id));
        setMonto((elegido.saldoCentavos / 100).toFixed(2));
      } else {
        setCargoId('');
        setMonto('');
      }
    } finally {
      setLoading(false);
    }
  }, [estudianteId, cargoIdInicial]);

  useEffect(() => {
    if (open) {
      setMetodo('efectivo'); setFecha(hoy()); setReferencia(''); setError(null);
      cargar();
    }
  }, [open, cargar]);

  function onSelectCargo(id: string) {
    setCargoId(id);
    const c = cargos.find((x) => String(x.id) === id);
    if (c) setMonto((c.saldoCentavos / 100).toFixed(2));
  }

  async function handleGuardar() {
    const cargo = cargos.find((c) => String(c.id) === cargoId);
    if (!cargo) { setError('Selecciona un cargo'); return; }
    if (!cargo.ecfDocumentId) {
      setError('Este cargo no tiene factura vinculada. Factura o vincula una factura antes de registrar el pago.');
      return;
    }
    const montoCentavos = Math.round(parseFloat(monto) * 100);
    if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
      setError('Monto inválido'); return;
    }
    if (montoCentavos > cargo.saldoCentavos) {
      setError(`El monto excede el saldo pendiente (${fmtDOP(cargo.saldoCentavos)}).`); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargoId: cargo.id,
          montoCentavos,
          fechaPago: fecha,
          metodo,
          referencia: referencia.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error registrando pago');
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error registrando pago');
    } finally {
      setSaving(false);
    }
  }

  const cargoSel = cargos.find((c) => String(c.id) === cargoId) ?? null;
  const sinFactura = !!cargoSel && !cargoSel.ecfDocumentId;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago — {estudianteNombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
          ) : cargos.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              Este estudiante no tiene cargos pendientes.
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Cargo a pagar</Label>
                <Select value={cargoId} onValueChange={onSelectCargo} disabled={!!cargoIdInicial}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{labelCargo(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cargoSel?.ecfDocumentId ? (
                  <p className="text-xs text-teal-700">
                    Factura vinculada: {cargoSel.facturaEncf || `#${cargoSel.ecfDocumentId}`}
                  </p>
                ) : sinFactura ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3">
                    Este cargo no tiene factura vinculada. Cierra este diálogo y usa <strong>Facturar</strong> o
                    {' '}<strong>Vincular factura</strong> en la lista de cargos. El pago solo se puede registrar
                    después de asociar una factura.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monto (RD$)</Label>
                  <Input type="number" step="0.01" value={monto}
                    onChange={(e) => setMonto(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha</Label>
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Método</Label>
                  <Select value={metodo} onValueChange={setMetodo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METODOS.map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Referencia</Label>
                  <Input placeholder="Opcional" value={referencia}
                    onChange={(e) => setReferencia(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar}
            disabled={saving || loading || cargos.length === 0 || sinFactura}>
            {saving
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
              : 'Registrar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
