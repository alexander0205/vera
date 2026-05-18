'use client';

/**
 * useDefaultPrinter
 * Fetches the team's default printer from /api/impresoras and returns
 * a helper that resolves the correct PDF URL for a given factura ID.
 *
 * Rules:
 *   - tipo === 'termica_80mm' | 'termica_58mm'  → ?formato=tirilla
 *   - tipo === 'a4' (or no printer configured)  → A4 (default)
 */

import { useState, useEffect } from 'react';

interface Impresora {
  id:        number;
  nombre:    string;
  tipo:      string;
  esDefault: boolean;
}

interface DefaultPrinterResult {
  /** null while loading or when no printer is configured */
  defaultPrinter: Impresora | null;
  /** Returns the correct PDF URL for the given factura ID */
  printUrl: (facturaId: number) => string;
  /** Human-readable label for toasts, e.g. "Bematech 80mm (Térmica 80mm)" */
  printerLabel: string;
}

export function useDefaultPrinter(): DefaultPrinterResult {
  const [defaultPrinter, setDefaultPrinter] = useState<Impresora | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/impresoras')
      .then(r => r.json())
      .then((data: { impresoras: Impresora[] }) => {
        if (cancelled) return;
        const def = data.impresoras?.find(i => i.esDefault) ?? null;
        setDefaultPrinter(def);
      })
      .catch(() => { /* network error — silently ignore */ });
    return () => { cancelled = true; };
  }, []);

  function printUrl(facturaId: number): string {
    if (!defaultPrinter) return `/api/pdf/factura/${facturaId}`;
    const isTirilla = defaultPrinter.tipo === 'termica_80mm' || defaultPrinter.tipo === 'termica_58mm';
    return isTirilla
      ? `/api/pdf/factura/${facturaId}?formato=tirilla`
      : `/api/pdf/factura/${facturaId}`;
  }

  const TIPO_LABELS: Record<string, string> = {
    a4:           'A4 / Carta',
    termica_80mm: 'Térmica 80mm',
    termica_58mm: 'Térmica 58mm',
  };

  const printerLabel = defaultPrinter
    ? `${defaultPrinter.nombre} (${TIPO_LABELS[defaultPrinter.tipo] ?? defaultPrinter.tipo})`
    : 'Formato A4';

  return { defaultPrinter, printUrl, printerLabel };
}
