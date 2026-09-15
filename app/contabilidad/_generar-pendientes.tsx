'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Corre el barrido desde el panorama (el mismo de «Generar asientos
 * pendientes» del libro diario) y recarga los conteos.
 */
export function GenerarPendientes({ habilitado, motivo }: { habilitado: boolean; motivo?: string }) {
  const router = useRouter();
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const ocupado = useRef(false);

  async function generar() {
    if (ocupado.current) return;
    ocupado.current = true;
    setGenerando(true);
    setAviso(null);
    try {
      const res = await fetch('/api/contabilidad/libro-diario', { method: 'POST' });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error ?? 'No se pudieron generar los asientos');
      const partes = [r.creados > 0 ? `Se generaron ${r.creados} asiento(s).` : 'No había nada nuevo que asentar.'];
      const saltados = Object.values((r.motivos ?? {}) as Record<string, number>).reduce((s, n) => s + n, 0);
      if (saltados > 0) partes.push(`${saltados} se saltaron: el libro diario dice por qué.`);
      if (r.hayMas) partes.push('Quedan más: vuelve a pulsar.');
      if (Array.isArray(r.fallidos) && r.fallidos.length > 0) partes.push(`${r.fallidos.length} dieron error.`);
      setAviso({ texto: partes.join(' ') });
      startTransition(() => router.refresh());
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'Error', error: true });
    } finally {
      ocupado.current = false;
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" onClick={generar} disabled={!habilitado || generando} className="gap-1.5" title={!habilitado ? motivo : undefined}>
        {generando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {generando ? 'Generando…' : 'Generar asientos pendientes'}
      </Button>
      {aviso && <p className={`text-xs ${aviso.error ? 'text-red-600' : 'text-muted-foreground'}`} role="status">{aviso.texto}</p>}
    </div>
  );
}
