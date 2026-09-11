/**
 * Archivo de autodeterminación de la TSS — función pura, sin BD.
 *
 * La TSS (Tesorería de la Seguridad Social) exige cada mes una autodeterminación:
 * el detalle, por empleado, de lo que la empresa aporta y retiene a la Seguridad
 * Social. De ahí sale la factura que el empleador paga a la TSS (SUIR).
 *
 * Este archivo arma ese detalle a partir de las líneas de una corrida ya
 * calculada (AFP/SFS del empleado + AFP/SFS/SRL/INFOTEP patronales). La app NO
 * presenta ni paga por el empleador: genera el CSV para que lo suba/concilie en
 * el portal de la TSS.
 *
 * ⚠️ El layout EXACTO del archivo que sube al SUIR no es público (viene en el
 *    instructivo de la TSS). Este CSV es una plantilla base legible y completa,
 *    a confirmar contra el portal — mismo criterio que los formatos de banco.
 */

/** Una línea de la corrida con lo que la TSS necesita del empleado. */
export interface LineaTSS {
  nombre: string;
  cedula: string | null;
  brutoCents: number;
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
}

export interface TotalesTSS {
  salarioCents: number;
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
  /** AFP total (empleado + patronal) — el fondo de pensiones. */
  afpTotalCents: number;
  /** SFS total (empleado + patronal) — el seguro de salud. */
  sfsTotalCents: number;
  /** Todo lo que se paga a la TSS: AFP + SFS + SRL + INFOTEP. */
  totalTSSCents: number;
}

export interface ArchivoAutodeterminacion {
  nombreArchivo: string;
  contenido: string;
  totalEmpleados: number;
  totales: TotalesTSS;
  nota: string;
}

const pesos = (cents: number) => (cents / 100).toFixed(2);

const DELIM = ',';
function escapar(v: string): string {
  if (v.includes(DELIM) || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

const COLUMNAS = [
  'Cedula', 'Nombre', 'Salario cotizable',
  'AFP empleado', 'SFS empleado',
  'AFP patronal', 'SFS patronal', 'SRL', 'INFOTEP',
  'Total empleado', 'Total patronal', 'Total TSS',
] as const;

const NOTA =
  'Plantilla base de autodeterminación TSS. Verifica el formato exacto y los NSS ' +
  'contra el portal SUIR/TSS antes de presentar.';

function ceros(): TotalesTSS {
  return {
    salarioCents: 0, afpEmpleadoCents: 0, sfsEmpleadoCents: 0,
    afpPatronalCents: 0, sfsPatronalCents: 0, srlPatronalCents: 0, infotepPatronalCents: 0,
    afpTotalCents: 0, sfsTotalCents: 0, totalTSSCents: 0,
  };
}

/**
 * Arma el archivo de autodeterminación de una corrida. Una fila por empleado
 * más una fila de TOTALES al final; los totales son también la base de lo que
 * hay que pagar a la TSS.
 */
export function generarAutodeterminacionTSS(
  lineas: LineaTSS[],
  opts: { periodo: string },
): ArchivoAutodeterminacion {
  const totales = ceros();

  const filas = lineas.map((l) => {
    const totalEmpleado = l.afpEmpleadoCents + l.sfsEmpleadoCents;
    const totalPatronal = l.afpPatronalCents + l.sfsPatronalCents + l.srlPatronalCents + l.infotepPatronalCents;

    totales.salarioCents += l.brutoCents;
    totales.afpEmpleadoCents += l.afpEmpleadoCents;
    totales.sfsEmpleadoCents += l.sfsEmpleadoCents;
    totales.afpPatronalCents += l.afpPatronalCents;
    totales.sfsPatronalCents += l.sfsPatronalCents;
    totales.srlPatronalCents += l.srlPatronalCents;
    totales.infotepPatronalCents += l.infotepPatronalCents;

    return [
      l.cedula ?? '', l.nombre, pesos(l.brutoCents),
      pesos(l.afpEmpleadoCents), pesos(l.sfsEmpleadoCents),
      pesos(l.afpPatronalCents), pesos(l.sfsPatronalCents), pesos(l.srlPatronalCents), pesos(l.infotepPatronalCents),
      pesos(totalEmpleado), pesos(totalPatronal), pesos(totalEmpleado + totalPatronal),
    ].map((v) => escapar(String(v))).join(DELIM);
  });

  totales.afpTotalCents = totales.afpEmpleadoCents + totales.afpPatronalCents;
  totales.sfsTotalCents = totales.sfsEmpleadoCents + totales.sfsPatronalCents;
  totales.totalTSSCents =
    totales.afpTotalCents + totales.sfsTotalCents + totales.srlPatronalCents + totales.infotepPatronalCents;

  const totalEmpleadoGlobal = totales.afpEmpleadoCents + totales.sfsEmpleadoCents;
  const totalPatronalGlobal =
    totales.afpPatronalCents + totales.sfsPatronalCents + totales.srlPatronalCents + totales.infotepPatronalCents;

  const filaTotales = [
    '', 'TOTALES', pesos(totales.salarioCents),
    pesos(totales.afpEmpleadoCents), pesos(totales.sfsEmpleadoCents),
    pesos(totales.afpPatronalCents), pesos(totales.sfsPatronalCents), pesos(totales.srlPatronalCents), pesos(totales.infotepPatronalCents),
    pesos(totalEmpleadoGlobal), pesos(totalPatronalGlobal), pesos(totales.totalTSSCents),
  ].map((v) => escapar(String(v))).join(DELIM);

  const contenido = [COLUMNAS.join(DELIM), ...filas, filaTotales].join('\r\n') + '\r\n';

  return {
    nombreArchivo: `autodeterminacion-tss-${opts.periodo}.csv`,
    contenido,
    totalEmpleados: lineas.length,
    totales,
    nota: NOTA,
  };
}
