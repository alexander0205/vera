'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

interface Factura {
  id: number;
  /** Vacío en borradores: el eNCF nace al emitir en DGII. */
  encf: string | null;
  /** Código interno (ej. BOR-000123). Sí existe en borradores. */
  codigo: string | null;
  razonSocialComprador: string | null;
  estado: string;
  estadoPago: string;
  montoTotal: number;
  createdAt: string;
}

interface Props {
  cargoId: number;
  cargoLabel: string;
  /** Cliente vinculado al tutor responsable del estudiante. Null si el tutor
   *  aún no está vinculado a un contacto — no hay dónde buscar facturas. */
  clienteId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Liga el cargo a una factura (e-CF) YA EXISTENTE del cliente/tutor. No crea
 * ni emite facturas — solo busca y enlaza (mismo patrón que Vincular
 * Dependiente/Tutor: buscar entidad existente, guardar el id).
 */
export function VincularFacturaDialog({ cargoId, cargoLabel, clienteId, open, onClose, onSaved }: Props) {
  const [query, setQuery]         = useState('');
  const [facturas, setFacturas]   = useState<Factura[]>([]);
  const [buscando, setBuscando]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const buscar = useCallback(async (q: string) => {
    if (!clienteId) return;
    setBuscando(true);
    try {
      const params = new URLSearchParams({ clientId: String(clienteId), limit: '20' });
      if (q.trim()) params.set('search', q.trim());
      const data = await fetch(`/api/facturas?${params}`).then((r) => r.json());
      setFacturas(data.docs ?? []);
    } finally {
      setBuscando(false);
    }
  }, [clienteId]);

  // Al abrir se limpia lo que quedó de la vez anterior.
  useEffect(() => {
    if (!open) return;
    setQuery(''); setError(null);
  }, [open]);

  // Una sola búsqueda. Antes había dos efectos y ambos disparaban al abrir, así
  // que el diálogo pedía la misma lista dos veces. La primera no espera al
  // debounce: no hay nada que teclear todavía.
  useEffect(() => {
    if (!open || !clienteId) return;
    const t = setTimeout(() => buscar(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, clienteId, query, buscar]);

  async function vincular(ecfDocumentId: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/cargos/${cargoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecfDocumentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error vinculando');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error vinculando');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular factura — {cargoLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {!clienteId ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>El tutor responsable de este estudiante no está vinculado a un contacto. Vincúlalo primero en la pestaña Tutores para poder buscar sus facturas.</span>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-8" placeholder="Buscar por NCF, código o comprador…" autoFocus
                  value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {buscando ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
              ) : facturas.length > 0 ? (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {facturas.map((f) => (
                    <button key={f.id} onClick={() => vincular(f.id)} disabled={saving}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        {/* Un borrador no tiene eNCF todavía; sin fallback la fila
                            salía en blanco y no se distinguía una de otra. */}
                        <p className="font-medium text-gray-900 truncate">{f.encf || f.codigo || 'Borrador'}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {f.razonSocialComprador
                            ? `${f.razonSocialComprador} · ${fmtFechaCorta(f.createdAt)}`
                            : fmtFechaCorta(f.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-gray-900">{fmtDOP(f.montoTotal)}</p>
                        <Badge variant="outline" className="text-[10px]">{f.estado}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">Este cliente no tiene facturas registradas</p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
