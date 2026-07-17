/**
 * /dashboard/novedades — Qué hay de nuevo, para el CLIENTE.
 *
 * La lee una directora de colegio o un dueño de empresa, no un desarrollador.
 * Por eso el contenido sale de content/novedades.json —escrito a mano, en su
 * idioma— y NO de los commits. CHANGELOG.md sigue existiendo para el equipo
 * técnico; son dos audiencias distintas y mezclarlas no le sirve a ninguna.
 *
 * Server component: el JSON se lee en el build, sin JS extra en el cliente.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Sparkles, Wrench, ArrowUpCircle } from 'lucide-react';

type TipoCambio = 'nuevo' | 'mejora' | 'arreglo';

interface Cambio {
  tipo: TipoCambio;
  titulo: string;
  detalle: string;
}
interface Version {
  version: string;
  fecha: string;
  titulo: string;
  cambios: Cambio[];
}

const ESTILO: Record<TipoCambio, { label: string; clase: string; Icono: typeof Sparkles }> = {
  nuevo:   { label: 'Nuevo',   clase: 'bg-teal-50 text-teal-700 ring-teal-200',   Icono: Sparkles },
  mejora:  { label: 'Mejora',  clase: 'bg-blue-50 text-blue-700 ring-blue-200',   Icono: ArrowUpCircle },
  arreglo: { label: 'Arreglo', clase: 'bg-amber-50 text-amber-700 ring-amber-200', Icono: Wrench },
};

function fmtFecha(iso: string) {
  // Se parte a mano: new Date('2026-07-17') se interpreta en UTC y en RD (UTC-4)
  // retrocede al día anterior. El changelog diría un día antes del real.
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function leerNovedades(): Version[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'content/novedades.json'), 'utf8');
    return (JSON.parse(raw).versiones ?? []) as Version[];
  } catch {
    return [];
  }
}

export const metadata = { title: 'Novedades' };

export default function NovedadesPage() {
  const versiones = leerNovedades();

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Novedades</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Lo que hemos mejorado en el sistema, de lo más reciente a lo más antiguo.
        </p>
      </div>

      {versiones.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay novedades publicadas.</p>
      ) : (
        <div className="space-y-8">
          {versiones.map((v) => (
            <section key={v.version}>
              {/* Cabecera de la versión */}
              <div className="flex items-baseline gap-3 border-b border-gray-200 pb-2 mb-4">
                <h2 className="text-base font-semibold text-gray-900">{v.titulo}</h2>
                <span className="text-xs text-gray-400">{fmtFecha(v.fecha)}</span>
                {/* La versión va discreta: al cliente le importa qué cambió, no el número */}
                <span className="ml-auto font-mono text-xs text-gray-300">v{v.version}</span>
              </div>

              <div className="space-y-4">
                {v.cambios.map((c, i) => {
                  const { label, clase, Icono } = ESTILO[c.tipo] ?? ESTILO.mejora;
                  return (
                    <div key={i} className="flex gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ${clase}`}
                      >
                        <Icono className="h-3 w-3" aria-hidden="true" />
                        {label}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{c.titulo}</p>
                        <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{c.detalle}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
