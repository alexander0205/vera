import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
// Los tramos viven en `cartera.ts` y no aquí porque la pantalla también los
// necesita, y este módulo es `server-only`.
import { TRAMOS, diasDeAtraso, type TramoKey } from './cartera';

/**
 * El panorama financiero del colegio: si entró la plata, quién debe y qué falta
 * por entrar.
 *
 * Todo se agrega en Postgres. Un colegio de 465 alumnos genera unos 5.100
 * cargos al año, y las mismas cifras se sacaban hoy abriendo /escolar/cargos y
 * sumando con la vista: traerse esas filas para sumarlas en JS convierte una
 * pantalla de resumen en la consulta más cara del módulo.
 *
 * Dos decisiones que atraviesan el archivo entero:
 *
 *  1. **Lo cobrado se lee del CARGO** (`monto − saldo`), no de
 *     `admin_escolar_pagos`. Esa tabla quedó deprecada —su POST devuelve 409—
 *     porque el cobro real vive en la factura (`pagos_recibidos`) y baja al
 *     cargo por `sincronizarSaldosDesdeFacturas`. Sumarla daría casi cero en
 *     cualquier colegio que ya esté cobrando de verdad.
 *
 *  2. **Los cargos anulados no existen.** No son deuda perdonada ni cobrada:
 *     son un cobro que nunca debió emitirse, y contarlos en el denominador
 *     hunde el porcentaje de cumplimiento sin que nadie deba nada.
 *
 * Nada de aquí escribe. Es una pantalla de lectura, incluso donde la cifra
 * dependa de un saldo que otra ruta sí sincroniza.
 */

/** Estado que hay que excluir SIEMPRE. Ver punto 2 de arriba. */
const NO_ANULADO = sql`estado <> 'anulado'`;

// ─── Antigüedad de cartera ───────────────────────────────────────────────────

/** El `CASE` que reparte cada cargo en su tramo, generado desde `TRAMOS`. */
function caseTramos(diasExpr: ReturnType<typeof sql>) {
  const ramas = TRAMOS.map((t) => {
    const cotas = [
      t.desde === null ? null : sql`${diasExpr} >= ${t.desde}`,
      t.hasta === null ? null : sql`${diasExpr} <= ${t.hasta}`,
    ].filter((x): x is ReturnType<typeof sql> => x !== null);
    // La clave va como literal y no como parámetro: con `$1` en todas las
    // ramas, Postgres no puede deducir el tipo del CASE y la consulta muere con
    // «could not determine data type of parameter». Sale de `TRAMOS`, que es
    // nuestro, así que no hay nada que escapar.
    return sql`WHEN ${sql.join(cotas, sql` AND `)} THEN ${sql.raw(`'${t.key}'`)}`;
  });
  return sql`CASE ${sql.join(ramas, sql` `)} END`;
}

// ─── Forma del resultado ─────────────────────────────────────────────────────

export interface ResumenCartera {
  /** Lo que ya nació como deuda en el período (cargos vivos). */
  devengadoCentavos: number;
  /** De eso, lo que ya se cobró: `monto − saldo`. */
  cobradoCentavos: number;
  /** Lo que sigue debiéndose. */
  pendienteCentavos: number;
  /** La parte del pendiente cuyo plazo ya pasó. */
  vencidoCentavos: number;
  cargos: number;
  /** Familias con algo pendiente. Cuenta responsables de pago, no alumnos:
   *  tres hermanos con la misma deuda son una sola llamada. */
  familiasConDeuda: number;
}

export interface CumplimientoMes {
  /** Mes en curso, `YYYY-MM`. */
  mes: string;
  /** Lo que vencía en el mes. */
  esperadoCentavos: number;
  /** De eso, lo cobrado. Mismo conjunto de cargos que `esperado`. */
  cobradoCentavos: number;
}

export interface CajaMes {
  /** Cobros de facturas del colegio que entraron en el mes en curso. */
  esteMesCentavos: number;
  /** El mismo cálculo para el mes anterior, para poder decir si subió. */
  mesAnteriorCentavos: number;
}

export interface PuntoMensual {
  /** `YYYY-MM`. */
  key: string;
  mes: number;
  anio: number;
  devengadoCentavos: number;
  cobradoCentavos: number;
  /** Si el mes ya llegó. Los de más adelante se pintan planos: no es que hayan
   *  cobrado cero, es que todavía no hay nada que cobrar. */
  transcurrido: boolean;
}

export interface FilaConcepto {
  conceptoId: number;
  nombre: string;
  tipo: string;
  devengadoCentavos: number;
  cobradoCentavos: number;
  pendienteCentavos: number;
}

export interface FilaGrado {
  gradoId: number;
  grado: string;
  servicio: string;
  tanda: string | null;
  alumnos: number;
  devengadoCentavos: number;
  cobradoCentavos: number;
  pendienteCentavos: number;
}

/**
 * Una FAMILIA a la que llamar, no un alumno: tres hermanos con deuda son una
 * sola llamada. Suma sus cargos del año, lo que arrastra de años anteriores y
 * las facturas hechas directo en Facturación.
 */
export interface FilaDeudor {
  /** Contacto responsable de pago. `null` = alumno sin responsable asignado. */
  clientId: number | null;
  responsable: string | null;
  /** Alumnos de la familia: los que deben y los matriculados este año. */
  alumnos: { id: number; nombre: string; curso: string | null }[];
  deudaCentavos: number;
  /** De esa deuda, lo que viene de años escolares anteriores. */
  anteriorCentavos: number;
  /** Atraso del cargo o factura más viejo que sigue debiendo. */
  diasAtraso: number;
}

/**
 * Saldo que quedó de años escolares ANTERIORES al consultado. No entra en la
 * cartera del año (esa tiene que cuadrar con sus tramos), pero tampoco puede
 * desaparecer: es la deuda más vieja y la que menos se cobra sola.
 */
export interface DeudaAnterior {
  centavos: number;
  alumnos: number;
  /** Alumnos que siguen en el colegio este año: se les cobra en la ventanilla. */
  reinscritos: { alumnos: number; centavos: number };
  /** Los que ya no están: cobranza de salida. */
  noReinscritos: { alumnos: number; centavos: number };
  /** Parte que nunca tuvo documento: la familia no recibió nada que pagar. */
  sinFacturaCentavos: number;
}

/** Comprobantes que los padres subieron por el enlace de pago y nadie revisó. */
export interface PagosPorValidar {
  cantidad: number;
  centavos: number;
  /** Fecha del más viejo sin revisar (`YYYY-MM-DD`). */
  desde: string | null;
}

export interface FilaMetodo {
  metodo: string;
  centavos: number;
}

export interface Matricula {
  activos: number;
  /** Alumnos cuya PRIMERA matrícula es la de este período: entradas de verdad,
   *  no reinscripciones. */
  nuevos: number;
  retirados: number;
  finalizados: number;
}

export interface DashboardEscolar {
  periodoId: number;
  periodo: string;
  /** La fecha con la que se calculó todo (hora de RD). */
  hoy: string;
  cartera: ResumenCartera;
  /** Saldo vivo repartido por antigüedad. Suma `cartera.pendienteCentavos`. */
  tramos: Record<TramoKey, number>;
  mes: CumplimientoMes;
  caja: CajaMes;
  serie: PuntoMensual[];
  conceptos: FilaConcepto[];
  grados: FilaGrado[];
  deudores: FilaDeudor[];
  metodos: FilaMetodo[];
  /**
   * Deuda que existe sin documento fiscal: el padre nunca recibió nada.
   * `centavos`/`cargos` son los YA VENCIDOS —lo urgente—; los `total` incluyen
   * también los que aún no vencen, que si no quedaban invisibles.
   */
  sinFacturar: { centavos: number; cargos: number; centavosTotal: number; cargosTotal: number };
  anterior: DeudaAnterior;
  porValidar: PagosPorValidar;
  /** Lo que el calendario todavía no ha convertido en deuda. */
  porDevengarCentavos: number;
  matricula: Matricula;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** `SUM(...)` de Postgres vuelve como `string` (es `bigint`) o `null`. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** La fecha del colegio. En UTC, a partir de las 8 de la noche de RD ya sería
 *  «mañana» y el mes en curso cambiaría una noche antes de tiempo. */
export function hoyRD(): string {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Primer día del mes de `fecha`, y del mes siguiente y anterior. */
function bordesDeMes(fecha: string) {
  const [a, m] = fecha.split('-').map(Number);
  const iso = (anio: number, mes: number) =>
    `${anio + Math.floor((mes - 1) / 12)}-${String(((mes - 1) % 12 + 12) % 12 + 1).padStart(2, '0')}-01`;
  return { inicio: iso(a, m), siguiente: iso(a, m + 1), anterior: iso(a, m - 1) };
}

// ─── La consulta ─────────────────────────────────────────────────────────────

/**
 * Todo el panorama de un año escolar.
 *
 * Las diecisiete consultas van en un solo `Promise.all` porque ninguna depende
 * de otra: en serie, pintar la pantalla eran diecisiete idas y vueltas a Neon,
 * que con latencia de red se notan más que el trabajo de la base.
 */
export async function dashboardDelPeriodo(
  teamId: number,
  periodoId: number,
  hoy: string = hoyRD(),
): Promise<DashboardEscolar | null> {
  const [periodo] = (await db.execute(sql`
    SELECT id, nombre, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin
    FROM admin_escolar_periodos
    WHERE id = ${periodoId} AND team_id = ${teamId}
    LIMIT 1
  `)) as unknown as { id: number; nombre: string; fecha_inicio: string | null; fecha_fin: string | null }[];
  if (!periodo) return null;

  const { inicio: mesInicio, siguiente: mesSiguiente, anterior: mesAnterior } = bordesDeMes(hoy);
  // Hasta dónde llega lo devengado: el fin del mes en curso, el mismo horizonte
  // que usa `devengarPeriodo`. Con otro, «por devengar» contaría cuotas que el
  // devengo ya considera suyas y el año sumaría de más.
  const finDeMes = sql`(${mesSiguiente}::date - 1)`;

  // Base común: el predicado de «cargo vivo del período». Es solo el predicado
  // —sin FROM ni WHERE— para poder meterle JOINs delante a cada consulta.
  // Escrito una vez porque olvidar el `<> 'anulado'` en una sola basta para que
  // dos tarjetas de la misma pantalla se contradigan.
  const cargoVivo = sql`c.team_id = ${teamId} AND c.periodo_id = ${periodoId} AND c.${NO_ANULADO}`;

  const diasAtraso = sql`(${hoy}::date - c.fecha_vencimiento)`;

  // Facturación directa de las familias del colegio, como CTEs (`familias`,
  // `directos`) para anteponer con `WITH`.
  //
  // El panorama nace del motor escolar (cargos), pero un colegio factura mucho
  // DIRECTO en Facturación —inscripción, colegiatura suelta— sin que eso pase
  // por un cargo. Esa plata es real y debe verse. Se toman las facturas del AÑO
  // ESCOLAR (por fecha de emisión) cuyo cliente es responsable de pago de un
  // alumno MATRICULADO —así entra la familia y NO la cafetería ni el POS a
  // Consumidor Final— y que NO tienen ya un cargo escolar detrás (esas ya las
  // cuenta el motor; contarlas otra vez duplicaría). Una sola definición para
  // cartera, caja, métodos, familias y deudores: si cada una filtrara a su
  // manera, las tarjetas se contradirían.
  const directosCte = sql`
    familias AS (
      SELECT DISTINCT es.facturar_a_client_id AS client_id
      FROM admin_escolar_matriculas m
      JOIN admin_escolar_estudiantes es ON es.id = m.estudiante_id AND es.team_id = ${teamId}
      WHERE m.team_id = ${teamId} AND m.periodo_id = ${periodoId} AND m.estado = 'activa'
        AND es.facturar_a_client_id IS NOT NULL
    ),
    directos AS (
      -- El pagador de una factura escolar no siempre está en la cabecera: el
      -- colegio factura muchas veces a Consumidor Final nombrando al ALUMNO, y
      -- ahí el padre se conoce por el dependiente. Mirando solo el client_id esas
      -- facturas no cruzaban con ninguna familia y desaparecían del panorama
      -- (en Andrés Bello, 164 de 550 del año escolar). Se toma el mismo respaldo
      -- que usa el guard de vincular factura: cabecera y, si no, el cliente del
      -- dependiente. Una venta de POS a Consumidor Final no trae dependiente, así
      -- que sigue fuera.
      SELECT d.id, COALESCE(d.client_id, dep.client_id, dep_linea.client_id) AS client_id, d.monto_total,
             -- varchar(10): ''::date lanza, y varchar < date no existe.
             NULLIF(d.fecha_limite_pago, '')::date AS fecha_limite_pago,
             COALESCE((SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
                        WHERE p.ecf_document_id = d.id), 0) AS pagado
      FROM ecf_documents d
      LEFT JOIN dependientes dep ON dep.id = d.dependiente_id AND dep.team_id = ${teamId}
      -- El alumno puede venir en la cabecera o SOLO dentro de las líneas: el
      -- facturador escolar escribe dependienteId por renglón. Se toma el primero
      -- que resuelva a un contacto.
      LEFT JOIN LATERAL (
        SELECT dl.client_id
        FROM jsonb_array_elements(COALESCE(d.lineas_json::jsonb, '[]'::jsonb)) AS l
        JOIN dependientes dl ON dl.team_id = ${teamId}
                            AND dl.id = (l->>'dependienteId')::int
        WHERE l->>'dependienteId' ~ '^[0-9]+$'
        LIMIT 1
      ) dep_linea ON true
      JOIN familias f ON f.client_id = COALESCE(d.client_id, dep.client_id, dep_linea.client_id)
      WHERE d.team_id = ${teamId}
        -- Mismo universo que la cartera de Facturación (getCuentasPorCobrar):
        -- fuera anuladas/rechazadas, NC (34), compras (41/43/47) y las ND de
        -- mora, que se agrupan en su factura padre.
        AND d.estado NOT IN ('ANULADO', 'RECHAZADO')
        AND d.tipo_ecf NOT IN ('34', '41', '43', '47')
        AND d.mora_origen_id IS NULL
        -- fecha_emision es timestamp: el último día entra entero.
        AND d.fecha_emision >= ${periodo.fecha_inicio ?? '0001-01-01'}::date
        AND d.fecha_emision <  (${periodo.fecha_fin ?? '9999-12-30'}::date + 1)
        AND NOT EXISTS (
          SELECT 1 FROM admin_escolar_cargos c
           WHERE c.ecf_document_id = d.id AND c.team_id = ${teamId} AND c.${NO_ANULADO}
        )
    )`;

  // Años escolares que empezaron antes que el consultado. Su saldo es deuda
  // arrastrada: sin fecha de inicio no hay «antes» y la lista sale vacía.
  const periodosAnteriores = sql`
    SELECT pa.id FROM admin_escolar_periodos pa
    WHERE pa.team_id = ${teamId} AND pa.id <> ${periodoId}
      AND pa.fecha_inicio < ${periodo.fecha_inicio}::date`;

  const [
    cartera, tramos, mes, caja, serie, conceptos, grados,
    deudores, metodos, sinFacturar, porDevengar, matricula,
    factCartera, factCaja, familias, anterior, porValidar,
  ] = await Promise.all([
    // ── 1. El resumen. Las familias con deuda se cuentan aparte (15): deben
    //    juntarse con las de la facturación directa ANTES de contar, o la
    //    familia que debe por los dos lados sale dos veces.
    db.execute(sql`
      SELECT
        COALESCE(SUM(c.monto_centavos), 0)::bigint                    AS devengado,
        COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado,
        COALESCE(SUM(c.saldo_centavos), 0)::bigint                    AS pendiente,
        COALESCE(SUM(c.saldo_centavos) FILTER (
          WHERE c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < ${hoy}::date
        ), 0)::bigint                                                 AS vencido,
        COUNT(*)::int                                                 AS cargos
      FROM admin_escolar_cargos c
      WHERE ${cargoVivo}
    `),

    // ── 2. Antigüedad. Solo saldo vivo: un cargo pagado hace tres meses no es
    //    cartera de +90, es cartera de nadie.
    db.execute(sql`
      SELECT ${caseTramos(diasAtraso)} AS tramo, COALESCE(SUM(c.saldo_centavos), 0)::bigint AS saldo
      FROM admin_escolar_cargos c
      WHERE ${cargoVivo} AND c.saldo_centavos > 0
      GROUP BY 1
    `),

    // ── 3. Cumplimiento del mes. Cobrado y esperado sobre EL MISMO conjunto de
    //    cargos (los que vencen en el mes) para que el porcentaje quiera decir
    //    algo: cruzar la caja del mes contra lo que vencía mezcla poblaciones y
    //    da cumplimientos por encima del 100% cuando alguien salda un atraso.
    db.execute(sql`
      SELECT
        COALESCE(SUM(c.monto_centavos), 0)::bigint                    AS esperado,
        COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado
      FROM admin_escolar_cargos c
      WHERE ${cargoVivo}
        AND c.fecha_vencimiento >= ${mesInicio}::date
        AND c.fecha_vencimiento <  ${mesSiguiente}::date
    `),

    // ── 4. Lo que entró en caja, del ledger de cobros de las facturas.
    //
    //    Prorrateado: una factura del colegio vale MÁS que sus cargos (lleva
    //    ITBIS, y puede traer líneas que no son escolares). Sumar el pago
    //    entero inflaría el recaudo del colegio con dinero que no es de la
    //    colegiatura. El tope de 1 evita lo contrario —contar de más— cuando
    //    los cargos ligados suman más que el documento.
    db.execute(sql`
      WITH escolar AS (
        SELECT c.ecf_document_id AS doc, SUM(c.monto_centavos)::numeric AS cargos
        FROM admin_escolar_cargos c
        WHERE ${cargoVivo} AND c.ecf_document_id IS NOT NULL
        GROUP BY 1
      )
      SELECT
        COALESCE(SUM(p.monto_centavos * LEAST(1.0, e.cargos / NULLIF(d.monto_total, 0))) FILTER (
          WHERE p.fecha_pago >= ${mesInicio}::date AND p.fecha_pago < ${mesSiguiente}::date
        ), 0)::bigint AS este_mes,
        COALESCE(SUM(p.monto_centavos * LEAST(1.0, e.cargos / NULLIF(d.monto_total, 0))) FILTER (
          WHERE p.fecha_pago >= ${mesAnterior}::date AND p.fecha_pago < ${mesInicio}::date
        ), 0)::bigint AS mes_anterior
      FROM pagos_recibidos p
      JOIN escolar e       ON e.doc = p.ecf_document_id
      JOIN ecf_documents d ON d.id  = p.ecf_document_id
      WHERE p.team_id = ${teamId}
    `),

    // ── 5. Serie mensual. Agrupada por el mes del VENCIMIENTO y no por el de
    //    emisión: el dueño lee la barra como «lo que esperaba cobrar en
    //    octubre», y con conceptos que dan quince días para pagar la emisión
    //    cae un mes antes que el dinero.
    db.execute(sql`
      SELECT to_char(c.fecha_vencimiento, 'YYYY-MM')                  AS key,
             COALESCE(SUM(c.monto_centavos), 0)::bigint               AS devengado,
             COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado
      FROM admin_escolar_cargos c
      WHERE ${cargoVivo} AND c.fecha_vencimiento IS NOT NULL
      GROUP BY 1
    `),

    // ── 6. Por concepto.
    db.execute(sql`
      SELECT co.id, co.nombre, co.tipo,
             COALESCE(SUM(c.monto_centavos), 0)::bigint                    AS devengado,
             COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado,
             COALESCE(SUM(c.saldo_centavos), 0)::bigint                    AS pendiente
      FROM admin_escolar_cargos c
      JOIN admin_escolar_conceptos_pago co ON co.id = c.concepto_id AND co.team_id = ${teamId}
      WHERE ${cargoVivo}
      GROUP BY co.id, co.nombre, co.tipo
      ORDER BY pendiente DESC, devengado DESC
    `),

    // ── 7. Por grado. Refleja la deuda REAL del alumno de ese grado, no solo la
    //    tarifa configurada para el grado (pedido Darian 2026-09-23): un alumno
    //    de preprimario que debe inscripción, un poloche o un desayuno —cosas que
    //    se facturan directo en Facturación y no tienen concepto por grado— tiene
    //    que salir en su grado igual.
    //
    //    Dos fuentes se suman: (a) los cargos de la matrícula —el grado sale de la
    //    MATRÍCULA, no del alumno: quien repite pasó por dos grados y su deuda
    //    vieja es del de entonces—; (b) las facturas directas de la familia
    //    (`directosCte`), repartidas por partes iguales entre los alumnos activos
    //    del responsable y llevadas al grado de cada alumno. El reparto evita el
    //    doble conteo cuando el responsable tiene varios hijos: una factura de
    //    familia con hijos en dos grados aporta la mitad a cada uno, en vez de
    //    entera a los dos. `alumnos` se cuenta aparte —matrículas activas— porque
    //    un grado puede tener alumnos sin cargo todavía y aun así debe aparecer.
    db.execute(sql`
      WITH ${directosCte},
      resp_dir AS (
        SELECT client_id,
               SUM(monto_total)::numeric                    AS fac,
               SUM(pagado)::numeric                          AS cob,
               SUM(GREATEST(monto_total - pagado, 0))::numeric AS sal
        FROM directos GROUP BY client_id
      ),
      est_activo AS (
        SELECT e.facturar_a_client_id AS cli, cu.grado_id
        FROM admin_escolar_matriculas m
        JOIN admin_escolar_estudiantes e ON e.id = m.estudiante_id AND e.team_id = ${teamId}
        JOIN admin_escolar_cursos cu ON cu.id = m.curso_id
        WHERE m.team_id = ${teamId} AND m.periodo_id = ${periodoId} AND m.estado = 'activa'
          AND e.facturar_a_client_id IS NOT NULL
      ),
      dir_por_grado AS (
        SELECT ea.grado_id,
               SUM(rd.fac / cnt.n) AS fac,
               SUM(rd.cob / cnt.n) AS cob,
               SUM(rd.sal / cnt.n) AS sal
        FROM est_activo ea
        JOIN resp_dir rd ON rd.client_id = ea.cli
        JOIN (SELECT cli, COUNT(*)::numeric n FROM est_activo GROUP BY cli) cnt ON cnt.cli = ea.cli
        GROUP BY ea.grado_id
      )
      SELECT g.id, g.nombre AS grado, s.nombre AS servicio, s.tanda,
             (SELECT COUNT(*)::int FROM admin_escolar_matriculas mm
               JOIN admin_escolar_cursos cc ON cc.id = mm.curso_id
              WHERE mm.team_id = ${teamId} AND mm.periodo_id = ${periodoId}
                AND mm.estado = 'activa' AND cc.grado_id = g.id)             AS alumnos,
             -- dg está a una fila por grado: MAX toma ese valor constante sin que
             -- el join de cargos (varias filas) lo multiplique.
             (COALESCE(SUM(c.monto_centavos), 0) + COALESCE(round(MAX(dg.fac)), 0))::bigint                    AS devengado,
             (COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0) + COALESCE(round(MAX(dg.cob)), 0))::bigint AS cobrado,
             (COALESCE(SUM(c.saldo_centavos), 0) + COALESCE(round(MAX(dg.sal)), 0))::bigint                    AS pendiente
      FROM admin_escolar_grados g
      JOIN admin_escolar_servicios s ON s.id = g.servicio_id
      LEFT JOIN admin_escolar_matriculas m ON m.team_id = ${teamId}
        AND m.periodo_id = ${periodoId}
        AND m.curso_id IN (SELECT id FROM admin_escolar_cursos WHERE grado_id = g.id)
      LEFT JOIN admin_escolar_cargos c ON c.matricula_id = m.id
        AND c.team_id = ${teamId} AND c.periodo_id = ${periodoId} AND c.${NO_ANULADO}
      LEFT JOIN dir_por_grado dg ON dg.grado_id = g.id
      WHERE g.team_id = ${teamId} AND s.periodo_id = ${periodoId}
      GROUP BY g.id, g.nombre, g.orden, s.nombre, s.tanda, s.orden
      ORDER BY s.orden, g.orden, g.nombre
    `),

    // ── 8. A quién llamar. Diez y no más: es una lista para descolgar el
    //    teléfono hoy, y una de cuarenta no se llama.
    //
    //    Por FAMILIA (contacto responsable de pago; el alumno sin responsable va
    //    solo), porque se llama a una persona y no a cada hermano. Junta todo lo
    //    que esa persona debe: cargos del año, cargos de años anteriores —si
    //    no, el que arrastra la deuda más vieja no aparecía— y las facturas
    //    hechas directo en Facturación.
    db.execute(sql`
      WITH ${directosCte},
      deuda AS (
        -- El responsable de pago es un CONTACTO de Facturacion, no un tutor
        -- marcado: la casilla responsable_pago de los tutores quedo muerta al
        -- separarse los dos conceptos.
        SELECT es.facturar_a_client_id AS client_id, c.estudiante_id,
               c.saldo_centavos::bigint AS saldo, c.fecha_vencimiento AS vence,
               (c.periodo_id <> ${periodoId}) AS anterior
        FROM admin_escolar_cargos c
        JOIN admin_escolar_estudiantes es ON es.id = c.estudiante_id AND es.team_id = ${teamId}
        WHERE c.team_id = ${teamId} AND c.${NO_ANULADO} AND c.saldo_centavos > 0
          AND (c.periodo_id = ${periodoId} OR c.periodo_id IN (${periodosAnteriores}))
        UNION ALL
        SELECT client_id, NULL, (monto_total - pagado)::bigint, fecha_limite_pago, false
        FROM directos
        WHERE monto_total - pagado > 0
      ),
      top AS (
        SELECT client_id,
               SUM(saldo)::bigint                                     AS deuda,
               COALESCE(SUM(saldo) FILTER (WHERE anterior), 0)::bigint AS anterior,
               -- El vencimiento más viejo que sigue sin pagarse. Los días se
               -- cuentan luego en JS con diasDeAtraso, para que la tabla y el
               -- color de la fila salgan del mismo cálculo.
               MIN(vence)::text                                       AS vence,
               array_agg(DISTINCT estudiante_id) FILTER (WHERE estudiante_id IS NOT NULL) AS con_deuda
        FROM deuda
        GROUP BY client_id, CASE WHEN client_id IS NULL THEN estudiante_id END
        ORDER BY deuda DESC
        LIMIT 10
      )
      SELECT t.client_id, t.deuda, t.anterior, t.vence,
             (SELECT cl.razon_social FROM clients cl
               WHERE cl.id = t.client_id AND cl.team_id = ${teamId})   AS responsable,
             -- Los alumnos de la familia: los que deben y, si la deuda es solo
             -- de facturas directas (sin alumno), los matriculados este año.
             (SELECT COALESCE(json_agg(json_build_object(
                       'id', e.id,
                       'nombre', trim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')),
                       -- El curso de este año si lo tiene; si no (se fue), el último.
                       'curso', (SELECT cu.nombre || ' · ' || gr.nombre
                                   FROM admin_escolar_matriculas m
                                   JOIN admin_escolar_cursos cu ON cu.id = m.curso_id
                                   JOIN admin_escolar_grados gr ON gr.id = cu.grado_id
                                  WHERE m.estudiante_id = e.id AND m.team_id = ${teamId}
                                  ORDER BY (m.periodo_id = ${periodoId}) DESC, m.id DESC
                                  LIMIT 1)
                     ) ORDER BY e.nombres, e.apellidos), '[]'::json)
                FROM admin_escolar_estudiantes e
               WHERE e.team_id = ${teamId}
                 AND (e.id = ANY(t.con_deuda)
                      OR (t.client_id IS NOT NULL AND e.facturar_a_client_id = t.client_id
                          AND EXISTS (SELECT 1 FROM admin_escolar_matriculas m
                                       WHERE m.estudiante_id = e.id AND m.team_id = ${teamId}
                                         AND m.periodo_id = ${periodoId} AND m.estado = 'activa')))
             )                                                          AS alumnos
      FROM top t
      ORDER BY t.deuda DESC
    `),

    // ── 9. Por dónde entra el dinero. Mismo universo que la caja: pagos de
    //    facturas con cargo (prorrateados, como la 4) más los de la facturación
    //    directa (enteros, como la 14). Sin la segunda parte, lo cobrado fuera
    //    del motor no salía en el donut y los porcentajes mentían.
    db.execute(sql`
      WITH escolar AS (
        SELECT c.ecf_document_id AS doc, SUM(c.monto_centavos)::numeric AS cargos
        FROM admin_escolar_cargos c
        WHERE ${cargoVivo} AND c.ecf_document_id IS NOT NULL
        GROUP BY 1
      ),
      ${directosCte}
      SELECT metodo, COALESCE(SUM(centavos), 0)::bigint AS centavos
      FROM (
        SELECT p.metodo, p.monto_centavos * LEAST(1.0, e.cargos / NULLIF(d.monto_total, 0)) AS centavos
        FROM pagos_recibidos p
        JOIN escolar e       ON e.doc = p.ecf_document_id
        JOIN ecf_documents d ON d.id  = p.ecf_document_id
        WHERE p.team_id = ${teamId}
        UNION ALL
        SELECT p.metodo, p.monto_centavos
        FROM pagos_recibidos p
        JOIN directos x ON x.id = p.ecf_document_id
        WHERE p.team_id = ${teamId}
      ) t
      GROUP BY metodo
      ORDER BY centavos DESC
    `),

    // ── 10. Deuda sin documento. Es el agujero propio de este modelo: el cargo
    //     es la fuente de verdad de la deuda y puede existir sin factura, así
    //     que el colegio la tiene contada y el padre no ha recibido nada que
    //     pagar.
    //
    //     Se cuentan las dos cosas. Lo VENCIDO sin factura es lo urgente. Pero
    //     limitarse a eso dejaba escondido el caso de este colegio: cinco
    //     cargos por RD$10,700 sin comprobante que aún no vencen — el papel
    //     decía «todo lo vencido está facturado» y se leía como «todo bien».
    db.execute(sql`
      SELECT
        COALESCE(SUM(c.saldo_centavos) FILTER (
          WHERE c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < ${hoy}::date
        ), 0)::bigint                                     AS centavos,
        COUNT(*) FILTER (
          WHERE c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < ${hoy}::date
        )::int                                            AS cargos,
        COALESCE(SUM(c.saldo_centavos), 0)::bigint        AS centavos_total,
        COUNT(*)::int                                     AS cargos_total
      FROM admin_escolar_cargos c
      WHERE ${cargoVivo}
        AND c.ecf_document_id IS NULL
        AND c.saldo_centavos > 0
    `),

    // ── 11. Lo que falta por devengar del año.
    //
    //     Rehace en SQL la misma tarifa que resuelve `lib/.../tarifas.ts`
    //     —sección, si no grado, si no servicio; y la beca por encima solo
    //     donde el concepto la admite— sobre las cuotas del calendario que aún
    //     no han salido. En JS habría que armar el plan de cobro de CADA
    //     matrícula activa, que son cientos de vueltas a la base para pintar
    //     una tarjeta.
    //
    //     El reparto entre cuotas se aproxima con `round()` en vez del reparto
    //     exacto de `plan-cobro.ts`, que le da el resto de la división a la
    //     primera cuota. La desviación es de céntimos por concepto y esta cifra
    //     es una proyección, no un cobro.
    db.execute(sql`
      WITH mat AS (
        SELECT m.id, m.curso_id AS seccion_id, cu.grado_id, g.servicio_id,
               m.beca_tipo, m.beca_valor, m.conceptos_ids,
               COALESCE(m.fecha_inscripcion::text, ${periodo.fecha_inicio ?? '0001-01-01'}) AS desde
        FROM admin_escolar_matriculas m
        JOIN admin_escolar_cursos cu ON cu.id = m.curso_id
        JOIN admin_escolar_grados g  ON g.id  = cu.grado_id
        WHERE m.team_id = ${teamId} AND m.periodo_id = ${periodoId} AND m.estado = 'activa'
      ),
      tarifa AS (
        SELECT mat.id AS matricula_id, mat.desde, co.id AS concepto_id, co.tipo,
               CASE
                 WHEN co.admite_beca AND mat.beca_tipo = 'monto'      THEN mat.beca_valor
                 WHEN co.admite_beca AND mat.beca_tipo = 'porcentaje' THEN
                   round(base.monto * (100 - mat.beca_valor) / 100.0)
                 ELSE base.monto
               END AS monto
        FROM mat
        JOIN admin_escolar_conceptos_pago co
          ON co.team_id = ${teamId} AND co.activo
         AND co.id = ANY(ARRAY(SELECT jsonb_array_elements_text(mat.conceptos_ids)::int))
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            (SELECT pr.monto_centavos FROM admin_escolar_concepto_precios pr
              WHERE pr.team_id = ${teamId} AND pr.concepto_id = co.id AND pr.periodo_id = ${periodoId}
                AND pr.activo AND pr.objetivo_tipo = 'seccion'  AND pr.objetivo_id = mat.seccion_id),
            (SELECT pr.monto_centavos FROM admin_escolar_concepto_precios pr
              WHERE pr.team_id = ${teamId} AND pr.concepto_id = co.id AND pr.periodo_id = ${periodoId}
                AND pr.activo AND pr.objetivo_tipo = 'grado'    AND pr.objetivo_id = mat.grado_id),
            (SELECT pr.monto_centavos FROM admin_escolar_concepto_precios pr
              WHERE pr.team_id = ${teamId} AND pr.concepto_id = co.id AND pr.periodo_id = ${periodoId}
                AND pr.activo AND pr.objetivo_tipo = 'servicio' AND pr.objetivo_id = mat.servicio_id)
          ) AS monto
        ) base
      ),
      pesos AS (
        SELECT concepto_id, SUM(porcentaje_milesimas)::numeric AS total
        FROM admin_escolar_concepto_cuotas
        WHERE team_id = ${teamId} AND periodo_id = ${periodoId} AND activo
        GROUP BY 1
      )
      SELECT COALESCE(SUM(
        CASE WHEN t.tipo = 'mensualidad' THEN t.monto
             ELSE round(t.monto * q.porcentaje_milesimas / NULLIF(pe.total, 0)) END
      ), 0)::bigint AS centavos
      FROM tarifa t
      JOIN admin_escolar_concepto_cuotas q
        ON q.team_id = ${teamId} AND q.periodo_id = ${periodoId} AND q.activo
       AND q.concepto_id = t.concepto_id
      JOIN pesos pe ON pe.concepto_id = t.concepto_id
      WHERE t.monto IS NOT NULL
        -- Todavía no emitida...
        AND q.fecha_emision > ${finDeMes}
        -- ...y el alumno ya estaba dentro cuando toque emitirla.
        AND q.fecha_emision >= t.desde::date
        -- Y que nadie la haya devengado por adelantado a mano: el índice único
        -- (matricula, cuota) impediría duplicarla, pero aquí sumaría dos veces.
        AND NOT EXISTS (
          SELECT 1 FROM admin_escolar_cargos x
           WHERE x.matricula_id = t.matricula_id AND x.cuota_id = q.id AND x.${NO_ANULADO}
        )
    `),

    // ── 12. Matrícula. `nuevos` son los que no tienen matrícula en ningún otro
    //     período: la reinscripción de siempre no es un alumno ganado.
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE m.estado = 'activa')::int     AS activos,
        COUNT(*) FILTER (WHERE m.estado = 'retirada')::int   AS retirados,
        COUNT(*) FILTER (WHERE m.estado = 'finalizada')::int AS finalizados,
        COUNT(*) FILTER (WHERE m.estado <> 'anulada' AND NOT EXISTS (
          SELECT 1 FROM admin_escolar_matriculas m2
           WHERE m2.estudiante_id = m.estudiante_id AND m2.team_id = ${teamId}
             AND m2.periodo_id <> ${periodoId}
        ))::int AS nuevos
      FROM admin_escolar_matriculas m
      WHERE m.team_id = ${teamId} AND m.periodo_id = ${periodoId}
    `),

    // ── 13. Facturación directa de las familias (ver `directosCte`): lo
    //     facturado, cobrado y pendiente que vive solo en Facturación.
    db.execute(sql`
      WITH ${directosCte}
      SELECT
        COALESCE(SUM(monto_total), 0)::bigint                         AS facturado,
        COALESCE(SUM(pagado), 0)::bigint                              AS cobrado,
        COALESCE(SUM(GREATEST(monto_total - pagado, 0)), 0)::bigint   AS pendiente,
        COALESCE(SUM(GREATEST(monto_total - pagado, 0)) FILTER (
          WHERE fecha_limite_pago IS NOT NULL AND fecha_limite_pago < ${hoy}::date
        ), 0)::bigint                                                 AS vencido,
        COUNT(*)::int                                                 AS docs,
        -- Antigüedad de este mismo saldo, con los tramos de la 2 — sin esto las
        -- barras suman menos que la cartera pendiente de arriba.
        (SELECT COALESCE(json_agg(json_build_object('tramo', t.tramo, 'saldo', t.saldo)), '[]'::json)
           FROM (
             SELECT ${caseTramos(sql`(${hoy}::date - fecha_limite_pago)`)} AS tramo,
                    SUM(monto_total - pagado)::bigint AS saldo
             FROM directos
             WHERE monto_total - pagado > 0
             GROUP BY 1
           ) t)                                                       AS tramos
      FROM directos
    `),

    // ── 14. Lo que esas facturas directas cobraron en el mes (para la caja).
    //     Se cuenta el pago entero (la factura es de la familia), y como excluye
    //     las facturas con cargo, no cruza con la 4.
    db.execute(sql`
      WITH ${directosCte}
      SELECT
        COALESCE(SUM(p.monto_centavos) FILTER (
          WHERE p.fecha_pago >= ${mesInicio}::date AND p.fecha_pago < ${mesSiguiente}::date
        ), 0)::bigint AS este_mes,
        COALESCE(SUM(p.monto_centavos) FILTER (
          WHERE p.fecha_pago >= ${mesAnterior}::date AND p.fecha_pago < ${mesInicio}::date
        ), 0)::bigint AS mes_anterior
      FROM pagos_recibidos p
      JOIN directos x ON x.id = p.ecf_document_id
      WHERE p.team_id = ${teamId}
    `),

    // ── 15. Familias con deuda en el año. Se juntan las claves de los dos
    //     lados ANTES de contar: sumar dos COUNT DISTINCT contaba dos veces a la
    //     familia que debe cargos y también facturas directas. La clave es el
    //     CONTACTO responsable —dos hermanos del mismo padre son una familia— y
    //     cae al alumno cuando no tiene ninguno: si no, el colegio con veinte
    //     alumnos sin responsable vería «0 familias deben» con la cartera llena.
    db.execute(sql`
      WITH ${directosCte}
      SELECT COUNT(DISTINCT k)::int AS familias
      FROM (
        SELECT COALESCE('cliente:' || es.facturar_a_client_id, 'alumno:' || c.estudiante_id) AS k
        FROM admin_escolar_cargos c
        LEFT JOIN admin_escolar_estudiantes es ON es.id = c.estudiante_id AND es.team_id = ${teamId}
        WHERE ${cargoVivo} AND c.saldo_centavos > 0
        UNION ALL
        SELECT 'cliente:' || client_id FROM directos WHERE monto_total - pagado > 0
      ) t
    `),

    // ── 16. Deuda de años anteriores. Fuera de la cartera del año —que tiene
    //     que cuadrar con sus tramos—, pero a la vista: filtrar todo por el año
    //     escondía justo la deuda más vieja, la que menos se cobra sola.
    //     Separada en quien sigue en el colegio (se le cobra en la ventanilla)
    //     y quien ya no (cobranza de salida).
    db.execute(sql`
      SELECT
        COALESCE(SUM(c.saldo_centavos), 0)::bigint                               AS centavos,
        COUNT(DISTINCT c.estudiante_id)::int                                     AS alumnos,
        COUNT(DISTINCT c.estudiante_id) FILTER (WHERE r.sigue)::int              AS alumnos_re,
        COALESCE(SUM(c.saldo_centavos) FILTER (WHERE r.sigue), 0)::bigint        AS centavos_re,
        COALESCE(SUM(c.saldo_centavos) FILTER (WHERE c.ecf_document_id IS NULL), 0)::bigint AS sin_factura
      FROM admin_escolar_cargos c
      CROSS JOIN LATERAL (
        SELECT EXISTS (
          SELECT 1 FROM admin_escolar_matriculas m
           WHERE m.team_id = ${teamId} AND m.periodo_id = ${periodoId}
             AND m.estado = 'activa' AND m.estudiante_id = c.estudiante_id
        ) AS sigue
      ) r
      WHERE c.team_id = ${teamId} AND c.${NO_ANULADO} AND c.saldo_centavos > 0
        AND c.periodo_id IN (${periodosAnteriores})
    `),

    // ── 17. Pagos por validar: comprobantes que los padres subieron por el
    //     enlace de pago y nadie ha revisado. Mientras esperan, esa plata sigue
    //     contada como deuda y la familia puede salir en «A quién llamar»
    //     aunque ya haya pagado. No va por año: un comprobante viejo sin
    //     revisar es igual de urgente.
    db.execute(sql`
      SELECT COUNT(*)::int                           AS cantidad,
             COALESCE(SUM(monto_centavos), 0)::bigint AS centavos,
             MIN(creado_en)::date::text               AS desde
      FROM admin_escolar_comprobantes
      WHERE team_id = ${teamId} AND estado = 'pendiente'
    `),
  ]);

  const c0 = (cartera as unknown as Record<string, unknown>[])[0] ?? {};
  const m0 = (mes as unknown as Record<string, unknown>[])[0] ?? {};
  const k0 = (caja as unknown as Record<string, unknown>[])[0] ?? {};
  const s0 = (sinFacturar as unknown as Record<string, unknown>[])[0] ?? {};
  const d0 = (porDevengar as unknown as Record<string, unknown>[])[0] ?? {};
  const t0 = (matricula as unknown as Record<string, unknown>[])[0] ?? {};
  // Facturación directa de las familias (13 y 14): se SUMA al motor escolar, no
  // lo reemplaza. Así la cartera y la caja del panorama reflejan también lo
  // facturado/cobrado/pendiente que vive solo en Facturación.
  const fc0 = (factCartera as unknown as Record<string, unknown>[])[0] ?? {};
  const fk0 = (factCaja as unknown as Record<string, unknown>[])[0] ?? {};
  const f0 = (familias as unknown as Record<string, unknown>[])[0] ?? {};
  const a0 = (anterior as unknown as Record<string, unknown>[])[0] ?? {};
  const v0 = (porValidar as unknown as Record<string, unknown>[])[0] ?? {};
  // json_agg puede volver ya parseado o como texto según el driver.
  const json = <T,>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

  const porTramo = Object.fromEntries(TRAMOS.map((t) => [t.key, 0])) as Record<TramoKey, number>;
  for (const f of tramos as unknown as { tramo: TramoKey | null; saldo: string }[]) {
    // `tramo` puede venir null en un cargo sin vencimiento: el `CASE` no tiene
    // rama para NULL. Es deuda que no vence, que es exactamente «por vencer».
    porTramo[f.tramo ?? 'porVencer'] += n(f.saldo);
  }
  // Las facturas directas (13) entran igual: sin fecha límite = por vencer.
  for (const f of json<{ tramo: TramoKey | null; saldo: number | string }[] | null>(fc0.tramos) ?? []) {
    porTramo[f.tramo ?? 'porVencer'] += n(f.saldo);
  }

  return {
    periodoId: periodo.id,
    periodo: periodo.nombre,
    hoy,
    cartera: {
      devengadoCentavos: n(c0.devengado) + n(fc0.facturado),
      cobradoCentavos:   n(c0.cobrado)   + n(fc0.cobrado),
      pendienteCentavos: n(c0.pendiente) + n(fc0.pendiente),
      vencidoCentavos:   n(c0.vencido)   + n(fc0.vencido),
      cargos:            n(c0.cargos)    + n(fc0.docs),
      familiasConDeuda:  n(f0.familias),
    },
    tramos: porTramo,
    mes: {
      mes: mesInicio.slice(0, 7),
      esperadoCentavos: n(m0.esperado),
      cobradoCentavos:  n(m0.cobrado),
    },
    caja: {
      esteMesCentavos:     n(k0.este_mes)     + n(fk0.este_mes),
      mesAnteriorCentavos: n(k0.mes_anterior) + n(fk0.mes_anterior),
    },
    serie: armarSerie(
      serie as unknown as { key: string; devengado: string; cobrado: string }[],
      periodo.fecha_inicio, periodo.fecha_fin, hoy,
    ),
    conceptos: (conceptos as unknown as Record<string, unknown>[]).map((f) => ({
      conceptoId: n(f.id),
      nombre: String(f.nombre),
      tipo: String(f.tipo),
      devengadoCentavos: n(f.devengado),
      cobradoCentavos:   n(f.cobrado),
      pendienteCentavos: n(f.pendiente),
    })),
    grados: (grados as unknown as Record<string, unknown>[]).map((f) => ({
      gradoId: n(f.id),
      grado: String(f.grado),
      servicio: String(f.servicio),
      tanda: f.tanda == null ? null : String(f.tanda),
      alumnos: n(f.alumnos),
      devengadoCentavos: n(f.devengado),
      cobradoCentavos:   n(f.cobrado),
      pendienteCentavos: n(f.pendiente),
    })),
    deudores: (deudores as unknown as Record<string, unknown>[]).map((f) => ({
      clientId: f.client_id == null ? null : n(f.client_id),
      responsable: f.responsable == null ? null : String(f.responsable),
      alumnos: (json<{ id: number; nombre: string; curso: string | null }[] | null>(f.alumnos) ?? [])
        .map((a) => ({ id: n(a.id), nombre: a.nombre || 'Estudiante', curso: a.curso ?? null })),
      deudaCentavos: n(f.deuda),
      anteriorCentavos: n(f.anterior),
      // Negativo = el cargo más viejo todavía no vence. Se aplana a 0: «−12
      // días de atraso» no se lee en ninguna tabla.
      diasAtraso: Math.max(0, diasDeAtraso(f.vence == null ? null : String(f.vence), hoy)),
    })),
    metodos: (metodos as unknown as Record<string, unknown>[])
      .map((f) => ({ metodo: String(f.metodo), centavos: n(f.centavos) }))
      .filter((f) => f.centavos > 0),
    sinFacturar: {
      centavos: n(s0.centavos), cargos: n(s0.cargos),
      centavosTotal: n(s0.centavos_total), cargosTotal: n(s0.cargos_total),
    },
    anterior: {
      centavos: n(a0.centavos),
      alumnos:  n(a0.alumnos),
      reinscritos:   { alumnos: n(a0.alumnos_re), centavos: n(a0.centavos_re) },
      noReinscritos: { alumnos: n(a0.alumnos) - n(a0.alumnos_re), centavos: n(a0.centavos) - n(a0.centavos_re) },
      sinFacturaCentavos: n(a0.sin_factura),
    },
    porValidar: {
      cantidad: n(v0.cantidad),
      centavos: n(v0.centavos),
      desde: v0.desde == null ? null : String(v0.desde),
    },
    porDevengarCentavos: n(d0.centavos),
    matricula: {
      activos:     n(t0.activos),
      nuevos:      n(t0.nuevos),
      retirados:   n(t0.retirados),
      finalizados: n(t0.finalizados),
    },
  };
}

/**
 * Rellena los meses del año escolar que no devolvieron fila.
 *
 * Un mes sin cargos no es un hueco que la gráfica pueda saltarse: agosto vacío
 * entre julio y septiembre significa que ese mes no se cobró nada, y omitir la
 * barra hace que la serie parezca continua cuando no lo es. Los meses que aún
 * no han llegado se marcan `transcurrido: false` para que la pantalla los pinte
 * planos en vez de como un mes con cero cobrado.
 */
function armarSerie(
  filas: { key: string; devengado: string; cobrado: string }[],
  fechaInicio: string | null,
  fechaFin: string | null,
  hoy: string,
): PuntoMensual[] {
  const porKey = new Map(filas.map((f) => [f.key, f]));
  const mesActual = hoy.slice(0, 7);

  // Sin rango de año escolar no hay calendario que rellenar; se enseña lo que
  // haya, ordenado. Un período sin configurar es un problema que se ve mejor
  // con tres barras sueltas que con doce inventadas.
  const claves = fechaInicio && fechaFin
    ? mesesEntre(fechaInicio.slice(0, 7), fechaFin.slice(0, 7))
    : [...porKey.keys()].sort();

  return claves.map((key) => {
    const f = porKey.get(key);
    const [anio, mes] = key.split('-').map(Number);
    return {
      key, mes, anio,
      devengadoCentavos: n(f?.devengado),
      cobradoCentavos:   n(f?.cobrado),
      transcurrido: key <= mesActual,
    };
  });
}

/** Claves `YYYY-MM` de `desde` a `hasta`, ambas incluidas. */
function mesesEntre(desde: string, hasta: string): string[] {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  const total = (a2 * 12 + m2) - (a1 * 12 + m1);
  if (!Number.isFinite(total) || total < 0) return [];
  return Array.from({ length: total + 1 }, (_, i) => {
    const idx = a1 * 12 + (m1 - 1) + i;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
}
