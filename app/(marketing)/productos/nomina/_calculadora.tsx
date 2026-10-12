'use client';

/**
 * La calculadora de nómina, con el motor de verdad.
 *
 * No es una aproximación escrita para la web: importa
 * `calcularNominaEmpleado` y las tasas de `lib/config/nomina-tasas.ts`, que son
 * las mismas que corren la nómina dentro del sistema. Si mañana cambia la
 * escala del ISR, esta página cambia con ella —y si alguien la tuerce, la
 * prueba de la nómina se pone roja antes de que llegue aquí—.
 *
 * Se puede importar en el navegador porque las dos piezas son puras: ni
 * `server-only`, ni base de datos, ni sesión.
 *
 * Enseña las dos mitades que nadie junta: lo que se le descuenta al empleado y
 * lo que le cuesta a la empresa por encima del sueldo. Esa segunda es la que
 * sorprende al que contrata por primera vez.
 */

import { useMemo, useState } from 'react';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const peso = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (t: number) => `${(t * 100).toLocaleString('es-DO', { maximumFractionDigits: 2 })} %`;

export function CalculadoraNomina() {
  const [sueldo, setSueldo] = useState(45_000);

  const d = useMemo(
    () => calcularNominaEmpleado({
      salarioMensualCents: Math.round(sueldo * 100),
      tasas: TASAS_NOMINA_2026,
    }),
    [sueldo],
  );

  const t = TASAS_NOMINA_2026;
  const costoEmpresa = d.brutoCents + d.totalPatronalCents;

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#e7edfb] bg-white">
      <div className="border-b border-[#eef1f8] bg-[#f7f9ff] px-5 py-5">
        <label className="block">
          <span className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-[#3b4252]">Sueldo mensual del empleado</span>
            <span className="font-[family-name:var(--font-display)] text-[22px] font-semibold tabular-nums tracking-[-.03em] text-[#102a72]">
              {peso(Math.round(sueldo * 100))}
            </span>
          </span>
          <input
            type="range"
            min={15000}
            max={250000}
            step={1000}
            value={sueldo}
            onChange={e => setSueldo(Number(e.target.value))}
            className="mt-3 w-full accent-zero-600"
            aria-label="Sueldo mensual del empleado"
          />
        </label>
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        {/* ── Lo que se le descuenta ─────────────────────────────────────── */}
        <div className="border-b border-[#eef1f8] p-5 sm:border-b-0 sm:border-r">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">
            Se le descuenta al empleado
          </p>
          <ul className="m-0 mt-3.5 flex list-none flex-col gap-2.5 p-0">
            <Fila etiqueta={`AFP · ${pct(t.afpEmpleado)}`} valor={peso(d.afpEmpleadoCents)} />
            <Fila etiqueta={`SFS · ${pct(t.sfsEmpleado)}`} valor={peso(d.sfsEmpleadoCents)} />
            <Fila
              etiqueta="ISR"
              valor={d.isrCents > 0 ? peso(d.isrCents) : 'Exento'}
              apagado={d.isrCents === 0}
            />
          </ul>
          <div className="mt-4 border-t border-[#f0f3fa] pt-3.5">
            <Fila etiqueta="Total descontado" valor={peso(d.totalDeduccionesCents)} fuerte />
            <div className="mt-3 rounded-xl bg-[#edf1fe] px-3.5 py-3">
              <span className="block text-[11.5px] text-[#5c6373]">Le queda en la mano</span>
              <span className="mt-0.5 block font-[family-name:var(--font-display)] text-[21px] font-semibold tabular-nums tracking-[-.03em] text-[#102a72]">
                {peso(d.netoCents)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Lo que paga la empresa por encima ──────────────────────────── */}
        <div className="p-5">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#666d80]">
            Paga la empresa, encima del sueldo
          </p>
          <ul className="m-0 mt-3.5 flex list-none flex-col gap-2.5 p-0">
            <Fila etiqueta={`AFP patronal · ${pct(t.afpPatronal)}`} valor={peso(d.afpPatronalCents)} />
            <Fila etiqueta={`SFS patronal · ${pct(t.sfsPatronal)}`} valor={peso(d.sfsPatronalCents)} />
            <Fila etiqueta={`Riesgos laborales · ${pct(t.srlPatronal)}`} valor={peso(d.srlPatronalCents)} />
            <Fila etiqueta={`INFOTEP · ${pct(t.infotepPatronal)}`} valor={peso(d.infotepPatronalCents)} />
          </ul>
          <div className="mt-4 border-t border-[#f0f3fa] pt-3.5">
            <Fila etiqueta="Total patronal" valor={peso(d.totalPatronalCents)} fuerte />
            <div className="mt-3 rounded-xl border border-[#e7edfb] px-3.5 py-3">
              <span className="block text-[11.5px] text-[#5c6373]">Le cuesta a la empresa</span>
              <span className="mt-0.5 block font-[family-name:var(--font-display)] text-[21px] font-semibold tabular-nums tracking-[-.03em] text-[#102a72]">
                {peso(costoEmpresa)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="m-0 border-t border-[#eef1f8] px-5 py-3 text-[11px] leading-[1.5] text-[#666d80]">
        Calculado con el mismo motor que corre la nómina dentro del sistema: tasas {t.anio} y la
        escala del ISR vigente. Falta sumarle lo que el mes traiga —horas extra, bonos, préstamos— y
        las provisiones de regalía y vacaciones, que el sistema acumula aparte.
      </p>
    </div>
  );
}

function Fila({
  etiqueta, valor, fuerte = false, apagado = false,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
  apagado?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={`min-w-0 text-[12.5px] ${fuerte ? 'font-semibold text-[#102a72]' : 'text-[#5c6373]'}`}>
        {etiqueta}
      </span>
      <span
        className={`shrink-0 text-right text-[13px] tabular-nums ${
          apagado ? 'text-[#666d80]' : fuerte ? 'font-semibold text-[#102a72]' : 'font-medium text-[#3b4252]'
        }`}
      >
        {valor}
      </span>
    </li>
  );
}
