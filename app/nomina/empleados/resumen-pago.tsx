'use client';

import { calcularNominaEmpleado, explicarIsr, pedazoPeriodo } from '@/lib/nomina/calculo';
import { calcularProvisionesPeriodo } from '@/lib/nomina/provisiones';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { rangoDelMes } from '@/lib/nomina/periodos';
import { horasSemana, valorHoraCents, type HorarioSemanal } from '@/lib/nomina/jornada';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { partesDeHoras, totalHorasTexto, type ResumenHoras } from '@/lib/nomina/horas';
import { pesos } from './shared';

const pct = (fraccion: number) => `${(fraccion * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

/** Lo que el resumen toma de la empresa: `/api/nomina/ajustes`. */
export interface AjustesResumen {
  pisoCotizableCents: number | null;
  srlTasa: number | null;
  capitaDependienteCents: number;
}

/**
 * Lo que ve quien da de alta a un empleado mientras escribe el salario: cuánto
 * le llega a la persona y cuánto le cuesta de verdad a la empresa.
 *
 * Existe porque la pantalla pedía «AFP» y «ARS» junto al salario y parecían
 * montos por llenar; son el nombre de la administradora, y los descuentos los
 * calcula la corrida. Aquí se calculan con el MISMO motor de la corrida, así
 * que lo que se enseña es lo que se va a pagar y no una estimación aparte que
 * pueda desincronizarse. Por lo mismo recibe el piso del mínimo, la tasa SRL de
 * la empresa y los dependientes adicionales: sin ellos el neto no cuadraría con
 * la corrida.
 */
export function ResumenPago({
  salarioMensualCents, frecuencia, diasVacaciones, ajustes, dispensa = false, dependientesAdicionales = 0,
  fechaIngreso = null, horarioSemanal = null, porHoras = null,
}: {
  salarioMensualCents: number;
  frecuencia: string;
  diasVacaciones: number | null;
  ajustes?: AjustesResumen | null;
  dispensa?: boolean;
  dependientesAdicionales?: number;
  /** Para provisionar según antigüedad; sin ella se usa la estimación lineal. */
  fechaIngreso?: string | null;
  /** Para el valor de la hora ordinaria y de la extra. */
  horarioSemanal?: HorarioSemanal | null;
  /** Quien cobra por hora: la semana de su horario con la que se estimó el mes. */
  porHoras?: ResumenHoras | null;
}) {
  const anio = Number(hoyRD().slice(0, 4));
  const tasas = tasasDelAnio(anio);
  const srl = ajustes?.srlTasa ?? tasas.srlPatronal;
  const d = calcularNominaEmpleado({
    salarioMensualCents,
    tasas,
    pisoCotizableCents: dispensa ? 0 : ajustes?.pisoCotizableCents ?? 0,
    srlTasa: srl,
    dependientesAdicionales,
    capitaDependienteCents: ajustes?.capitaDependienteCents ?? 0,
  });
  // La provisión de ESTE mes según la antigüedad, igual que la calcula la corrida.
  const mes = rangoDelMes(hoyRD().slice(0, 7));
  const prov = calcularProvisionesPeriodo({
    brutoPeriodoCents: salarioMensualCents,
    salarioMensualCents,
    fechaIngreso: fechaIngreso || null,
    inicio: mes.inicio,
    fin: mes.fin,
    diasVacacionesEmpleado: diasVacaciones,
    topeRegaliaAnualCents: ajustes?.pisoCotizableCents ? 5 * ajustes.pisoCotizableCents : null,
  });
  const costoReal = d.brutoCents + d.totalPatronalCents + prov.totalCents;
  const sobrecosto = d.brutoCents > 0 ? (costoReal / d.brutoCents - 1) * 100 : 0;
  const cotizaSobreMinimo = d.salarioCotizableCents > d.brutoCents;
  // El ISR «Exento» sin más hizo dudar al contador en la reunión: se enseña la renta
  // anual contra el exento, o el tramo con que se calculó.
  const isr = explicarIsr(d.baseIsrMensualCents, tasas.isrEscala);
  const subIsr = isr.tramo
    ? `Renta anual ${pesos(isr.baseAnualCents)}: ${isr.tramo.fijoCents > 0 ? `${pesos(isr.tramo.fijoCents)} + ` : ''}${pct(isr.tramo.tasa)} de lo que pasa de ${pesos(isr.tramo.desdeCents)}, entre 12`
    : `Renta anual ${pesos(isr.baseAnualCents)}: no pasa del exento de ${pesos(isr.exentoHastaCents)}`;

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Le llega al empleado</div>
        <Fila k={porHoras ? 'Estimado del mes' : 'Salario mensual'} v={pesos(d.brutoCents)} />
        {porHoras && (
          <p className="text-xs text-muted-foreground" data-testid="estimado-horas">
            Con su horario: {totalHorasTexto(porHoras)} h a la semana a {pesos(porHoras.tarifaHoraCents)}
            {partesDeHoras(porHoras).length > 0 ? ` (${partesDeHoras(porHoras).join(', ')})` : ''} = {pesos(porHoras.brutoCents)} por
            semana, × 52 ÷ 12. La nómina le paga las horas aprobadas de cada período.
          </p>
        )}
        <Fila k={`AFP (${pct(tasas.afpEmpleado)})`} v={`−${pesos(d.afpEmpleadoCents)}`} tenue />
        <Fila k={`SFS (${pct(tasas.sfsEmpleado)})`} v={`−${pesos(d.sfsEmpleadoCents)}`} tenue />
        {d.dependientesAdicionales > 0 && (
          <Fila
            k={`Dependientes (${d.dependientesAdicionales})`}
            sub="Adicionales del seguro de salud"
            v={`−${pesos(d.dependientesAdicionalesCents)}`}
            tenue
          />
        )}
        <Fila k="ISR" sub={subIsr} v={d.isrCents > 0 ? `−${pesos(d.isrCents)}` : 'Exento'} tenue />
        <Fila k="Neto al mes" v={pesos(d.netoCents)} fuerte />
        {frecuencia === 'quincenal' && (
          <p className="text-xs text-muted-foreground">
            Se paga en dos quincenas de {pesos(pedazoPeriodo(d.netoCents, 1, 2))} y {pesos(pedazoPeriodo(d.netoCents, 2, 2))}.
          </p>
        )}
        {!porHoras && horarioSemanal && horasSemana(horarioSemanal) > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="valor-hora">
            Valor de la hora ({horasSemana(horarioSemanal)} h a la semana): {pesos(valorHoraCents(d.brutoCents, horarioSemanal))} ·
            hora extra al 35 %: {pesos(Math.round(valorHoraCents(d.brutoCents, horarioSemanal) * 1.35))}
          </p>
        )}
        {frecuencia === 'semanal' && (
          <p className="text-xs text-muted-foreground">
            Cada semana completa le llegan unos {pesos(Math.round((d.netoCents * 12) / 52))}: el mes × 12 ÷ 52.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Le cuesta a la empresa</div>
        <Fila k={porHoras ? 'Pago estimado' : 'Salario'} v={pesos(d.brutoCents)} />
        <Fila
          k="Aportes a la TSS"
          sub={`AFP ${pct(tasas.afpPatronal)} · SFS ${pct(tasas.sfsPatronal)} · SRL ${pct(srl)} · INFOTEP ${pct(tasas.infotepPatronal)}`}
          v={`+${pesos(d.totalPatronalCents)}`} tenue
        />
        <Fila k="Provisiones" sub="Regalía, vacaciones y cesantía" v={`+${pesos(prov.totalCents)}`} tenue />
        <details className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground" data-testid="detalle-provisiones">
          <summary className="cursor-pointer font-medium text-foreground">¿Cómo se calculan las provisiones?</summary>
          <div className="mt-1.5 space-y-1">
            <p>
              {prov.mesesServicio === null
                ? 'Sin fecha de ingreso: se estima la cesantía a 21 días por año.'
                : `Antigüedad este mes: ${prov.mesesServicio} mes${prov.mesesServicio === 1 ? '' : 'es'}${fechaIngreso ? ` (desde el ${fmtFechaCorta(fechaIngreso)})` : ''}.`}
            </p>
            <p>Salario diario: {pesos(salarioMensualCents)} ÷ 23.83 = {pesos(prov.salarioDiarioCents)}.</p>
            <p>
              Regalía: salario ÷ 12 = {pesos(prov.regaliaCents)}
              {prov.regaliaTopada ? ' (tope de 5 salarios mínimos al año, art. 219)' : ''}.
            </p>
            <p>
              Vacaciones: {prov.diasVacacionesAnio} días × salario diario ÷ 12 = {pesos(prov.vacacionesCents)}
              {' '}(14 días hasta los 5 años, 18 desde ahí, art. 177).
            </p>
            <p>
              {prov.mesesServicio === null
                ? `Cesantía: 21 días × salario diario ÷ 12 = ${pesos(prov.cesantiaCents)}.`
                : prov.diasCesantiaDespues === 0
                  ? 'Cesantía: todavía nada; a los 3 meses se ganan 6 días, 13 a los 6 meses, 21 por año desde el primero y 23 por año desde los 5 (art. 80).'
                  : `Cesantía: lo ganado sube de ${prov.diasCesantiaAntes.toFixed(2)} a ${prov.diasCesantiaDespues.toFixed(2)} días × salario diario = ${pesos(prov.cesantiaCents)} (art. 80).`}
            </p>
          </div>
        </details>
        <Fila k="Costo real al mes" v={pesos(costoReal)} fuerte />
        <p className="text-xs text-muted-foreground">
          {sobrecosto.toFixed(1)}% sobre el salario. Tasas {tasas.anio} de la TSS y la DGII; las provisiones son lo que la
          empresa va acumulando para pagarlas cuando toquen.
        </p>
      </div>
      {cotizaSobreMinimo && (
        <p className="text-xs text-amber-700 sm:col-span-2">
          AFP, SFS y SRL se calculan sobre {pesos(d.salarioCotizableCents)}, el salario mínimo del sector: la TSS no
          admite cotizar por debajo sin dispensa. El ISR y el INFOTEP siguen sobre el salario real.
        </p>
      )}
    </div>
  );
}

function Fila({ k, v, sub, tenue, fuerte }: { k: string; v: string; sub?: string; tenue?: boolean; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${fuerte ? 'border-t pt-1.5 font-semibold' : ''}`}>
      <span className={tenue ? 'text-muted-foreground' : ''}>
        {k}
        {sub && <span className="block text-xs">{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${tenue ? 'text-muted-foreground' : ''}`}>{v}</span>
    </div>
  );
}
