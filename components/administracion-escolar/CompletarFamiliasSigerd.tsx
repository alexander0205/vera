'use client';

import { useCallback, useEffect, useState } from 'react';
import { DownloadCloud, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Resumen {
  ficha: number; conTutores: number; tutores: number; sinTutoresEnSigerd: number; errores: number;
  fallidos: Array<{ estudianteId: number; nombre: string; error: string }>;
}
interface Trabajo {
  id: number; estado: 'pendiente' | 'corriendo' | 'hecho' | 'fallo' | 'cancelado';
  total: number; hechos: number; resumen: Partial<Resumen>; ultimoError: string | null;
  terminadoAt: string | null;
}

const activo = (t: Trabajo | null) => !!t && (t.estado === 'pendiente' || t.estado === 'corriendo');

/**
 * «Completar familias desde SIGERD» para todo el colegio, desde la pantalla
 * del lote: trae a cada alumno lo que le falte (padres, fecha de nacimiento,
 * sexo) uno por uno, en el servidor. Se puede cerrar la pantalla: sigue solo
 * (`/api/administracion-escolar/sigerd-familias` y su cron).
 *
 * Mientras corre se pregunta cada pocos segundos cómo va.
 */
export function CompletarFamiliasSigerd() {
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(async () => {
    try {
      const d = await fetch('/api/administracion-escolar/sigerd-familias').then((r) => r.json());
      setTrabajo(d.trabajo ?? null);
      setPendientes(d.pendientes ?? 0);
    } catch { /* se reintenta en la siguiente vuelta */ }
  }, []);
  useEffect(() => { void leer(); }, [leer]);
  useEffect(() => {
    if (!activo(trabajo)) return;
    const t = setInterval(() => void leer(), 4000);
    return () => clearInterval(t);
  }, [trabajo, leer]);

  async function mandar(method: 'POST' | 'DELETE') {
    setOcupado(true); setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/sigerd-familias', { method });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo');
      setTrabajo(d.trabajo ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo');
    } finally {
      setOcupado(false);
    }
  }

  if (pendientes == null) return null;
  // Nada por completar y nada que contar: no ocupa sitio.
  if (!trabajo && pendientes === 0) return null;

  const r: Resumen = {
    ficha: 0, conTutores: 0, tutores: 0, sinTutoresEnSigerd: 0, errores: 0, fallidos: [], ...trabajo?.resumen,
  };
  const enMarcha = activo(trabajo);
  const pct = trabajo && trabajo.total > 0 ? Math.min(100, Math.round((trabajo.hechos / trabajo.total) * 100)) : 0;
  const cuenta = [
    r.conTutores > 0 && `${r.conTutores} con padres agregados`,
    r.ficha > 0 && `${r.ficha} con fecha o sexo completados`,
    r.sinTutoresEnSigerd > 0 && `${r.sinTutoresEnSigerd} sin padres en SIGERD`,
    r.errores > 0 && `${r.errores} no se pudieron leer`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-xl border border-zero-200 bg-zero-50/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Users className="h-5 w-5 shrink-0 text-zero-600" />
        <div className="min-w-0 flex-1">
          {enMarcha ? (
            <p className="font-medium text-gray-900">
              Completando familias desde SIGERD: {trabajo!.hechos} de {trabajo!.total}
            </p>
          ) : trabajo?.estado === 'hecho' ? (
            <p className="font-medium text-gray-900">Familias completadas desde SIGERD</p>
          ) : (
            <p className="font-medium text-gray-900">
              {pendientes} alumno(s) con algo por completar (padres, fecha de nacimiento o sexo)
            </p>
          )}
          <p className="text-xs text-gray-600">
            {enMarcha
              ? 'Va uno por uno en el servidor. Puedes cerrar esta pantalla: sigue solo.'
              : trabajo?.estado === 'fallo'
                ? <span className="text-red-700">Se detuvo: {trabajo.ultimoError}</span>
                : trabajo?.estado === 'cancelado'
                  ? 'Se canceló. Lo que ya se trajo se queda.'
                  : 'Trae de la ficha de cada alumno en SIGERD lo que le falte. No toca responsables de pago ni cobros.'}
            {cuenta && <span className="block text-gray-500">{cuenta}</span>}
            {enMarcha && trabajo?.ultimoError && <span className="block text-amber-700">{trabajo.ultimoError}</span>}
          </p>
        </div>
        {enMarcha ? (
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void mandar('DELETE')}>Cancelar</Button>
        ) : pendientes > 0 && (
          <Button size="sm" className="bg-zero-600 hover:bg-zero-700" disabled={ocupado} onClick={() => void mandar('POST')}>
            {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-1.5 h-4 w-4" />}
            {trabajo ? `Completar los ${pendientes} que faltan` : 'Completar familias desde SIGERD'}
          </Button>
        )}
      </div>
      {enMarcha && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zero-100" aria-hidden>
          <div className="h-full rounded-full bg-zero-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!enMarcha && r.fallidos.length > 0 && (
        <details className="mt-2 text-xs text-gray-600">
          <summary className="cursor-pointer">Ver los que no se pudieron leer</summary>
          <ul className="mt-1 space-y-0.5">
            {r.fallidos.map((f) => <li key={f.estudianteId}>{f.nombre}: {f.error}</li>)}
          </ul>
        </details>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
