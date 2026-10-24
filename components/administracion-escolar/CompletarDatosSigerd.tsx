'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Loader2, ShieldCheck, TriangleAlert, FileCheck2 } from 'lucide-react';
import type { ResultadoCompletar } from '@/lib/administracion-escolar/completar-datos-sigerd';

/**
 * «Completar datos desde SIGERD».
 *
 * Los estudiantes que se cruzan desde SIGERD nacen con el nombre y el id; el
 * código RNE, el sexo y la fecha de nacimiento ya están en las fichas de la
 * descarga. Este botón los pasa a la ficha del alumno. No llama al portal, solo
 * llena campos VACÍOS (lo escrito a mano no se toca) y se puede repetir.
 *
 * Vive junto a donde se maneja SIGERD —`/escolar/sigerd` y el paso «Plan» del
 * asistente— porque es lo que se busca cuando la lista de estudiantes enseña
 * «SIGERD 1234» donde esperaba el código.
 */
export function CompletarDatosSigerd({ onCompletado, compacto = false }: {
  onCompletado?: () => void;
  /** Sin la frase de ayuda: para cuando la tarjeta que lo contiene ya la dice. */
  compacto?: boolean;
}) {
  const [corriendo, setCorriendo] = useState(false);
  const [res, setRes] = useState<ResultadoCompletar | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function completar() {
    setCorriendo(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch('/api/administracion-escolar/sigerd/completar-datos', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'No se pudieron completar los datos.'); return; }
      setRes(j as ResultadoCompletar);
      onCompletado?.();
    } catch {
      setError('Se cortó la conexión. Lo que ya se llenó se queda; vuelve a intentarlo.');
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div className="space-y-2">
      {!compacto && (
        <p className="text-sm text-muted-foreground">
          Llena el código RNE, el sexo y la fecha de nacimiento de los estudiantes que ya están en
          Zero, con lo que trajo la última descarga. Solo rellena lo que está vacío.
        </p>
      )}

      <Tooltip text="Trae desde SIGERD los datos que faltan a estos alumnos"><Button variant="outline" size="sm" onClick={() => void completar()} disabled={corriendo}>
        {corriendo
          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          : <FileCheck2 className="mr-1.5 h-4 w-4" />}
        {corriendo ? 'Completando…' : 'Completar datos desde SIGERD'}
      </Button></Tooltip>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {res && <Resultado res={res} />}
    </div>
  );
}

function Resultado({ res }: { res: ResultadoCompletar }) {
  if (res.sinDescarga) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Todavía no hay una descarga de SIGERD de donde sacar los datos. Primero hay que bajarla.</span>
      </p>
    );
  }

  const avisa = res.sinFicha > 0 || res.rneRepetido > 0;
  return (
    <div className={`space-y-1 rounded-md border p-2.5 text-sm ${
      avisa ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800'}`}>
      <p className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Se revisaron <b>{res.revisados}</b> estudiantes con id de SIGERD:{' '}
          <b>{res.completados}</b> {res.completados === 1 ? 'completado' : 'completados'}.
          {res.completados === 0 && !avisa && ' Ya tenían todos sus datos.'}
        </span>
      </p>
      {res.sinFicha > 0 && (
        <p className="pl-6 text-xs">
          <b>{res.sinFicha}</b> sin ficha en la descarga. Vuelve a bajar de SIGERD para traer sus expedientes.
        </p>
      )}
      {res.rneRepetido > 0 && (
        <p className="pl-6 text-xs">
          <b>{res.rneRepetido}</b> con un RNE que ya usa otro estudiante: ese código no se escribió.
          Revisa si el alumno está duplicado.
        </p>
      )}
    </div>
  );
}
