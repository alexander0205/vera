'use client';

import { useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';

interface PlanVinculable {
  id: number;
  nombre: string;
  frecuencia: string;
  proximaEmision: string;
  totalEstimadoCentavos: number;
}
interface Concepto { id: number; nombre: string }

/**
 * Aviso + acción para vincular una matrícula a un plan de facturación recurrente
 * que YA existe (colegio migrado con planes previos). Se muestra SOLO si se
 * detecta un plan suelto para el alumno; si no, no renderiza nada. Vincular evita
 * el doble cobro: el plan emite y gobernanza refleja, en vez de correr en paralelo.
 */
export function VincularPlanExistente({
  matriculaId,
  onVinculado,
}: {
  matriculaId: number;
  onVinculado?: () => void;
}) {
  const [planes, setPlanes] = useState<PlanVinculable[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [conceptoId, setConceptoId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetch(`/api/administracion-escolar/matriculas/${matriculaId}/vincular-plan`)
      .then((r) => (r.ok ? r.json() : { planes: [], conceptos: [] }))
      .then((d) => {
        if (!vivo) return;
        setPlanes(d.planes ?? []);
        setConceptos(d.conceptos ?? []);
        setConceptoId(d.conceptos?.[0]?.id ?? null);
      })
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [matriculaId]);

  if (cargando || planes.length === 0) return null;

  const plan = planes[0];
  const rd = (plan.totalEstimadoCentavos / 100).toLocaleString('es-DO');

  async function vincular() {
    if (!conceptoId) { setError('Elige el concepto de mensualidad'); return; }
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/matriculas/${matriculaId}/vincular-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facturaRecurrenteId: plan.id, conceptoId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'No se pudo vincular'); return; }
      onVinculado?.();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p>
            Este alumno ya tiene un <b>plan de cobro recurrente</b> en Facturación
            («{plan.nombre}», {plan.frecuencia}, RD${rd}). Vincúlalo para que su factura se
            refleje aquí y <b>no se cobre doble</b>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {conceptos.length > 1 && (
              <select
                className="rounded border border-blue-300 bg-white px-2 py-1 text-xs"
                value={conceptoId ?? ''}
                onChange={(e) => setConceptoId(Number(e.target.value))}
              >
                {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            <button
              onClick={vincular}
              disabled={enviando}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Vincular a plan existente
            </button>
            {error && <span className="text-red-600">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
