'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BecaAlumno } from '@/lib/administracion-escolar/matricular-sigerd-plan';

/**
 * La beca del alumno en «Cargos del año», como en el formulario de migración:
 * un porcentaje que se descuenta de lo que admite beca (lo marca el colegio en
 * Conceptos) y, si se quiere, el porqué.
 *
 * - Por matricular: va con lo demás del alumno y se aplica al matricular; el
 *   plan de arriba ya la enseña descontada.
 * - Ya matriculado: se guarda en su matrícula al pulsar «Guardar beca». Vale
 *   para los cargos que se creen desde ahora; los que ya existen no cambian.
 */
export function BecaAlumnoPorMatricular({ beca, onCambio }: {
  beca: BecaAlumno | null;
  onCambio: (b: BecaAlumno | null) => void;
}) {
  return (
    <CamposBeca valor={beca} onCambio={onCambio}
      ayuda="Se descuenta de lo que admite beca y se aplica al matricular. Arriba ya sale descontada." />
  );
}

export function BecaAlumnoMatriculado({ matriculaId }: { matriculaId: number }) {
  const [guardada, setGuardada] = useState<BecaAlumno | null | undefined>(undefined);
  const [valor, setValor] = useState<BecaAlumno | null>(null);
  const [otraBeca, setOtraBeca] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/administracion-escolar/matriculas/${matriculaId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        const m = d.matricula ?? d;
        // Una beca por monto pactado se pone en la ficha: aquí solo porcentaje.
        setOtraBeca(m?.becaTipo === 'monto');
        const b = m?.becaTipo === 'porcentaje' && m.becaValor ? { porcentaje: Number(m.becaValor), motivo: m.becaMotivo ?? null } : null;
        setGuardada(b); setValor(b);
      })
      .catch(() => { if (vigente) setGuardada(null); });
    return () => { vigente = false; };
  }, [matriculaId]);

  if (guardada === undefined) {
    return <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Leyendo su beca…</p>;
  }
  if (otraBeca) {
    return <p className="text-xs text-gray-500">Tiene una beca por monto pactado: se cambia en su ficha, en la matrícula.</p>;
  }

  const igual = JSON.stringify(valor) === JSON.stringify(guardada);
  async function guardar() {
    setGuardando(true); setMensaje(null);
    try {
      const r = await fetch(`/api/administracion-escolar/matriculas/${matriculaId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valor
          ? { becaTipo: 'porcentaje', becaValor: valor.porcentaje, becaMotivo: valor.motivo ?? '' }
          : { becaTipo: null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar la beca');
      setGuardada(valor);
      setMensaje({ ok: true, texto: 'Beca guardada en su matrícula.' });
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo guardar la beca' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CamposBeca valor={valor} onCambio={(b) => { setValor(b); setMensaje(null); }}
      ayuda="Vale para los cargos que se creen desde ahora; los que ya tiene no cambian."
      pie={(
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={igual || guardando || (valor != null && !valido(valor))}
            onClick={() => void guardar()}>
            {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Guardar beca
          </Button>
          {mensaje && <span className={`text-xs ${mensaje.ok ? 'text-emerald-700' : 'text-red-600'}`}>{mensaje.texto}</span>}
        </div>
      )} />
  );
}

const valido = (b: BecaAlumno) => Number.isInteger(b.porcentaje) && b.porcentaje >= 1 && b.porcentaje <= 100;

function CamposBeca({ valor, onCambio, ayuda, pie }: {
  valor: BecaAlumno | null;
  onCambio: (b: BecaAlumno | null) => void;
  ayuda: string;
  pie?: React.ReactNode;
}) {
  const campo = 'h-8 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-zero-500 focus:outline-none';
  return (
    <section className={`space-y-2 rounded-lg border px-3 py-2.5 ${valor ? 'border-zero-200 bg-zero-50/40' : 'border-gray-200'}`}>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <input type="checkbox" checked={!!valor}
          onChange={(e) => onCambio(e.target.checked ? { porcentaje: 50, motivo: null } : null)} />
        El estudiante tiene beca
      </label>
      {valor && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-600">
            Porcentaje
            <span className="mt-0.5 flex items-center gap-1">
              <input type="number" min={1} max={100} step={1} value={valor.porcentaje || ''} inputMode="numeric"
                onChange={(e) => onCambio({ ...valor, porcentaje: Math.round(Number(e.target.value)) })}
                className={`${campo} w-20 tabular-nums ${valido(valor) ? '' : 'border-red-400'}`} />%
            </span>
          </label>
          <label className="min-w-[12rem] flex-1 text-xs text-gray-600">
            Detalle (opcional)
            <input value={valor.motivo ?? ''} maxLength={200} placeholder="Ej. beca por hermanos"
              onChange={(e) => onCambio({ ...valor, motivo: e.target.value })}
              className={`${campo} mt-0.5 block w-full`} />
          </label>
        </div>
      )}
      <p className="text-[11px] text-gray-500">{ayuda}</p>
      {valor && !valido(valor) && <p className="text-[11px] text-red-600">El porcentaje va de 1 a 100.</p>}
      {pie}
    </section>
  );
}
