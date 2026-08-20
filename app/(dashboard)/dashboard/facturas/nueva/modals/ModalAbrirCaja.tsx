'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Wallet } from 'lucide-react';

interface Terminal { id: number; nombre: string; }

/**
 * Modal de apertura de caja embebido en `Nueva factura`.
 *
 * El backend bloquea guardar/emitir sin un turno ABIERTO cuando la empresa tiene
 * el módulo de caja habilitado (ver lib/caja/guard.ts → code CAJA_SIN_TURNO). En
 * vez de mandar al usuario a /dashboard/caja y obligarlo a volver, este modal
 * reusa el mismo flujo de apertura (GET/POST /api/caja/turnos) para abrir el
 * turno sin salir de la factura. Al abrir con éxito, `onOpened` reintenta el
 * guardado pendiente.
 */
export function ModalAbrirCaja({ open, onClose, onOpened }: {
  open: boolean; onClose: () => void; onOpened: () => void;
}) {
  const [terminales, setTerminales]   = useState<Terminal[]>([]);
  const [terminalId, setTerminalId]   = useState<number | null>(null);
  const [monto, setMonto]             = useState('');
  const [obs, setObs]                 = useState('');
  const [cargando, setCargando]       = useState(false);
  const [abriendo, setAbriendo]       = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Al abrir el modal, cargar las terminales activas (mismo GET que /dashboard/caja).
  useEffect(() => {
    if (!open) return;
    setCargando(true); setError(null);
    fetch('/api/caja/turnos')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const terms: Terminal[] = data.terminales ?? [];
        setTerminales(terms);
        setTerminalId(prev => prev ?? (terms.length > 0 ? terms[0].id : null));
      })
      .catch(() => {/* sin terminales → turno sin terminal */})
      .finally(() => setCargando(false));
  }, [open]);

  async function abrir() {
    const montoNum = parseFloat(monto.replace(',', '.'));
    if (isNaN(montoNum) || montoNum < 0) { setError('Monto de apertura inválido'); return; }
    setAbriendo(true); setError(null);
    try {
      const res = await fetch('/api/caja/turnos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montoApertura: montoNum,
          observaciones: obs || undefined,
          terminalId: terminalId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Error al abrir caja'); return; }
      // Turno abierto: limpiar y avisar al padre para reintentar el guardado.
      setMonto(''); setObs('');
      onOpened();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o && !abriendo) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-lg w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-zero-600" />Abrir caja para facturar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            Para guardar esta factura necesitas un turno de caja abierto. Ábrelo
            aquí mismo y seguimos con el guardado — no tienes que salir de la factura.
          </p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          {cargando ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-zero-600" />
            </div>
          ) : (
            <>
              {terminales.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Terminal / Caja</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {terminales.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTerminalId(t.id)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                          terminalId === t.id
                            ? 'border-zero-500 bg-zero-50 text-zero-800 ring-1 ring-zero-500'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {t.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Monto de apertura (RD$) <span className="text-red-500">*</span></Label>
                <Input
                  type="number" min={0} step={0.01} placeholder="0.00" autoFocus
                  value={monto} onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void abrir(); } }}
                />
                <p className="text-xs text-gray-400">
                  Efectivo físico con el que inicias el turno.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Observaciones <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <Input
                  placeholder="Ej: Turno de la mañana"
                  value={obs} onChange={(e) => setObs(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={abriendo}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700 text-white" onClick={abrir} disabled={abriendo || cargando}>
            {abriendo ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Abriendo…</> : 'Abrir caja y continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
