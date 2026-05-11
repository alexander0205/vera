'use client';

/**
 * Hooks + Provider del formulario de factura.
 * Una sola fuente de estado para Lite y (eventualmente) el dashboard Full.
 *
 * Hooks atómicos: useItems, useTotales, useComprador, useEmitir
 * Hook compuesto: useFacturaForm (los une todos)
 * Provider:       FacturaProvider + useFactura()
 */

import {
  useState, useMemo, useCallback,
  createContext, useContext,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  nuevoItem, calcularTotalesUI, validarFactura, itemsToPayload,
  type ItemLinea, type TipoEcf, type TipoPago, type TotalesUI,
  type FacturaFormDefaults, type FacturaResultado,
} from './core';

// ─── Hook: items ──────────────────────────────────────────────────────────────

export function useItems(initial?: ItemLinea[]) {
  const [items, setItems] = useState<ItemLinea[]>(initial ?? [nuevoItem()]);

  const addItem    = useCallback(() => setItems(p => [...p, nuevoItem()]), []);
  const removeItem = useCallback((id: string) =>
    setItems(p => (p.length === 1 ? p : p.filter(it => it.id !== id))), []);
  const updateItem = useCallback((id: string, patch: Partial<ItemLinea>) =>
    setItems(p => p.map(it => (it.id === id ? { ...it, ...patch } : it))), []);
  const reset      = useCallback(() => setItems([nuevoItem()]), []);

  return { items, setItems, addItem, removeItem, updateItem, reset };
}

// ─── Hook: totales (memoizado) ────────────────────────────────────────────────

export function useTotales(items: ItemLinea[]): TotalesUI {
  return useMemo(() => calcularTotalesUI(items), [items]);
}

// ─── Hook: comprador ──────────────────────────────────────────────────────────

export function useComprador(defaults?: { rnc?: string; razonSocial?: string; email?: string }) {
  const [rncComprador, setRncComprador]     = useState(defaults?.rnc ?? '');
  const [razonSocial, setRazonSocial]       = useState(defaults?.razonSocial ?? '');
  const [emailComprador, setEmailComprador] = useState(defaults?.email ?? '');

  const reset = useCallback(() => {
    setRncComprador(defaults?.rnc ?? '');
    setRazonSocial(defaults?.razonSocial ?? '');
    setEmailComprador(defaults?.email ?? '');
  }, [defaults]);

  return {
    rncComprador, razonSocial, emailComprador,
    setRncComprador, setRazonSocial, setEmailComprador,
    reset,
  };
}

// ─── Hook: emisión ────────────────────────────────────────────────────────────

export interface EmitirPayload {
  modo?:                'emitir' | 'borrador';
  tipoEcf:              TipoEcf;
  rncComprador?:        string;
  razonSocialComprador?: string;
  emailComprador?:      string;
  tipoPago:             TipoPago;
  items: Array<{
    nombreItem:             string;
    cantidadItem:           number;
    precioUnitarioItem:     number;
    tasaItbis?:             number;
    indicadorBienoServicio?: 1 | 2;
  }>;
  encfOverride?:        string;
  skipRangeValidation?: boolean;
}

export function useEmitir() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [exito, setExito]       = useState<FacturaResultado | null>(null);

  const emitir = useCallback(async (payload: EmitirPayload): Promise<FacturaResultado | null> => {
    setEnviando(true); setError(null); setExito(null);
    try {
      const res = await fetch('/api/ecf/emitir', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ modo: 'emitir', ...payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Error al emitir la factura');
        return null;
      }
      const r: FacturaResultado = {
        encf:        json.encf,
        estado:      json.estado,
        documentoId: json.documentoId,
        trackId:     json.trackId,
      };
      setExito(r);
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  const reset = useCallback(() => { setError(null); setExito(null); }, []);
  return { enviando, error, exito, emitir, reset };
}

// ─── Hook compuesto: useFacturaForm ───────────────────────────────────────────

export function useFacturaForm(defaults?: FacturaFormDefaults) {
  const router       = useRouter();
  const itemsApi     = useItems();
  const totales      = useTotales(itemsApi.items);
  const compradorApi = useComprador({
    rnc:         defaults?.rncComprador,
    razonSocial: defaults?.razonSocial,
  });
  const emitirApi    = useEmitir();

  const [tipoEcf, setTipoEcf]             = useState<TipoEcf>(defaults?.tipoEcf ?? '32');
  const [tipoPago, setTipoPago]           = useState<TipoPago>(defaults?.tipoPago ?? 1);
  const [errorVal, setErrorVal]           = useState<string | null>(null);
  const [previewAbierto, setPreviewAbierto] = useState(false);

  /**
   * Paso 1 — Valida y abre la pre-factura para revisión.
   * NO envía nada todavía.
   */
  const emitir = useCallback(() => {
    setErrorVal(null);
    const e = validarFactura({
      items:        itemsApi.items,
      tipoEcf,
      rncComprador: compradorApi.rncComprador,
      razonSocial:  compradorApi.razonSocial,
      totales,
    });
    if (e) { setErrorVal(e); return; }
    emitirApi.reset();
    setPreviewAbierto(true);
  }, [itemsApi.items, compradorApi.rncComprador, compradorApi.razonSocial, tipoEcf, totales, emitirApi]);

  /**
   * Paso 2 — Confirma y emite a DGII.
   * Se llama desde el modal de pre-factura.
   */
  const confirmar = useCallback(async () => {
    const r = await emitirApi.emitir({
      tipoEcf, tipoPago,
      rncComprador:         compradorApi.rncComprador.trim() || undefined,
      razonSocialComprador: compradorApi.razonSocial.trim() || undefined,
      emailComprador:       compradorApi.emailComprador.trim() || undefined,
      items:                itemsToPayload(itemsApi.items),
    });

    if (r) {
      setPreviewAbierto(false);
      itemsApi.reset();
      compradorApi.reset();
      router.refresh();
    }
    // Si falla, el modal se queda abierto con el error visible.
  }, [itemsApi, compradorApi, emitirApi, tipoEcf, tipoPago, router]);

  /** Cierra la pre-factura sin emitir. Limpia errores residuales. */
  const cancelarPreview = useCallback(() => {
    setPreviewAbierto(false);
    setErrorVal(null);
    emitirApi.reset();
  }, [emitirApi]);

  const reiniciar = useCallback(() => {
    itemsApi.reset();
    compradorApi.reset();
    emitirApi.reset();
    setTipoPago(defaults?.tipoPago ?? 1);
    setErrorVal(null);
    setPreviewAbierto(false);
  }, [itemsApi, compradorApi, emitirApi, defaults]);

  return {
    ...itemsApi,
    ...compradorApi,
    tipoEcf, setTipoEcf,
    tipoPago, setTipoPago,
    totales,
    enviando:       emitirApi.enviando,
    error:          errorVal ?? emitirApi.error,
    exito:          emitirApi.exito,
    previewAbierto,
    emitir,
    confirmar,
    cancelarPreview,
    reiniciar,
  };
}

export type UseFacturaForm = ReturnType<typeof useFacturaForm>;

// ─── Provider + useFactura ────────────────────────────────────────────────────

const FacturaContext = createContext<UseFacturaForm | null>(null);

export function FacturaProvider({
  children, defaults,
}: { children: ReactNode; defaults?: FacturaFormDefaults }) {
  const form = useFacturaForm(defaults);
  return <FacturaContext.Provider value={form}>{children}</FacturaContext.Provider>;
}

export function useFactura(): UseFacturaForm {
  const ctx = useContext(FacturaContext);
  if (!ctx) throw new Error('useFactura debe usarse dentro de <FacturaProvider>');
  return ctx;
}
