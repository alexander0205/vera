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

export interface FilaDeudor {
  estudianteId: number;
  estudiante: string;
  curso: string | null;
  responsable: string | null;
  deudaCentavos: number;
  /** Atraso del cargo más viejo que sigue debiendo. */
  diasAtraso: number;
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
 * Las trece consultas van en un solo `Promise.all` porque ninguna depende de
 * otra: en serie, pintar la pantalla eran trece idas y vueltas seguidas a Neon,
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

  const [
    cartera, tramos, mes, caja, serie, conceptos, grados,
    deudores, metodos, sinFacturar, porDevengar, matricula,
  ] = await Promise.all([
    // ── 1. El resumen. `familias` cuenta CONTACTOS responsables de pago —dos
    //    hermanos del mismo padre son una familia, no dos— y cae al alumno
    //    cuando no tiene ninguno asignado: si no, el colegio con veinte alumnos
    //    sin responsable vería «0 familias deben» con la cartera llena.
    db.execute(sql`
      SELECT
        COALESCE(SUM(c.monto_centavos), 0)::bigint                    AS devengado,
        COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado,
        COALESCE(SUM(c.saldo_centavos), 0)::bigint                    AS pendiente,
        COALESCE(SUM(c.saldo_centavos) FILTER (
          WHERE c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < ${hoy}::date
        ), 0)::bigint                                                 AS vencido,
        COUNT(*)::int                                                 AS cargos,
        COUNT(DISTINCT CASE WHEN c.saldo_centavos > 0 THEN COALESCE(
          (SELECT 'cliente:' || es.facturar_a_client_id FROM admin_escolar_estudiantes es
            WHERE es.id = c.estudiante_id AND es.team_id = ${teamId}
              AND es.facturar_a_client_id IS NOT NULL),
          'alumno:' || c.estudiante_id
        ) END)::int                                                   AS familias
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

    // ── 7. Por grado. El grado sale de la MATRÍCULA del cargo y no del alumno:
    //    quien repite pasó por dos grados, y su deuda vieja pertenece al de
    //    entonces. `alumnos` se cuenta aparte —matrículas activas— porque un
    //    grado puede tener alumnos sin ningún cargo todavía y aun así tiene que
    //    aparecer en la tabla.
    db.execute(sql`
      SELECT g.id, g.nombre AS grado, s.nombre AS servicio, s.tanda,
             (SELECT COUNT(*)::int FROM admin_escolar_matriculas mm
               JOIN admin_escolar_cursos cc ON cc.id = mm.curso_id
              WHERE mm.team_id = ${teamId} AND mm.periodo_id = ${periodoId}
                AND mm.estado = 'activa' AND cc.grado_id = g.id)             AS alumnos,
             COALESCE(SUM(c.monto_centavos), 0)::bigint                      AS devengado,
             COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint   AS cobrado,
             COALESCE(SUM(c.saldo_centavos), 0)::bigint                      AS pendiente
      FROM admin_escolar_grados g
      JOIN admin_escolar_servicios s ON s.id = g.servicio_id
      LEFT JOIN admin_escolar_matriculas m ON m.team_id = ${teamId}
        AND m.periodo_id = ${periodoId}
        AND m.curso_id IN (SELECT id FROM admin_escolar_cursos WHERE grado_id = g.id)
      LEFT JOIN admin_escolar_cargos c ON c.matricula_id = m.id
        AND c.team_id = ${teamId} AND c.periodo_id = ${periodoId} AND c.${NO_ANULADO}
      WHERE g.team_id = ${teamId} AND s.periodo_id = ${periodoId}
      GROUP BY g.id, g.nombre, g.orden, s.nombre, s.tanda, s.orden
      ORDER BY s.orden, g.orden, g.nombre
    `),

    // ── 8. A quién llamar. Diez y no más: es una lista para descolgar el
    //    teléfono hoy, y una de cuarenta no se llama.
    db.execute(sql`
      SELECT c.estudiante_id,
             e.nombres, e.apellidos,
             (SELECT cu.nombre || ' · ' || gr.nombre
                FROM admin_escolar_matriculas m
                JOIN admin_escolar_cursos cu ON cu.id = m.curso_id
                JOIN admin_escolar_grados gr ON gr.id = cu.grado_id
               WHERE m.estudiante_id = c.estudiante_id AND m.periodo_id = ${periodoId}
                 AND m.team_id = ${teamId} LIMIT 1)                     AS curso,
             -- El responsable de pago es un CONTACTO de Facturacion, no un
             -- tutor marcado: la casilla responsable_pago de los tutores quedo
             -- muerta al separarse los dos conceptos, y leyendola toda la tabla
             -- decia sin responsable aunque el alumno lo tuviera asignado.
             (SELECT cl.razon_social FROM admin_escolar_estudiantes es
                JOIN clients cl ON cl.id = es.facturar_a_client_id AND cl.team_id = ${teamId}
               WHERE es.id = c.estudiante_id AND es.team_id = ${teamId}) AS responsable,
             SUM(c.saldo_centavos)::bigint                              AS deuda,
             -- El vencimiento más viejo que sigue sin pagarse. Los días se
             -- cuentan luego en JS con diasDeAtraso, para que la tabla y el
             -- color de la fila salgan del mismo cálculo y no de dos restas de
             -- fechas escritas en lenguajes distintos.
             MIN(c.fecha_vencimiento)::text                             AS vence
      FROM admin_escolar_cargos c
      JOIN admin_escolar_estudiantes e ON e.id = c.estudiante_id AND e.team_id = ${teamId}
      WHERE ${cargoVivo} AND c.saldo_centavos > 0
      GROUP BY c.estudiante_id, e.nombres, e.apellidos
      ORDER BY deuda DESC
      LIMIT 10
    `),

    // ── 9. Por dónde entra el dinero. Mismo prorrateo que la caja del mes.
    db.execute(sql`
      WITH escolar AS (
        SELECT c.ecf_document_id AS doc, SUM(c.monto_centavos)::numeric AS cargos
        FROM admin_escolar_cargos c
        WHERE ${cargoVivo} AND c.ecf_document_id IS NOT NULL
        GROUP BY 1
      )
      SELECT p.metodo,
             COALESCE(SUM(p.monto_centavos * LEAST(1.0, e.cargos / NULLIF(d.monto_total, 0))), 0)::bigint AS centavos
      FROM pagos_recibidos p
      JOIN escolar e       ON e.doc = p.ecf_document_id
      JOIN ecf_documents d ON d.id  = p.ecf_document_id
      WHERE p.team_id = ${teamId}
      GROUP BY p.metodo
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
  ]);

  const c0 = (cartera as unknown as Record<string, unknown>[])[0] ?? {};
  const m0 = (mes as unknown as Record<string, unknown>[])[0] ?? {};
  const k0 = (caja as unknown as Record<string, unknown>[])[0] ?? {};
  const s0 = (sinFacturar as unknown as Record<string, unknown>[])[0] ?? {};
  const d0 = (porDevengar as unknown as Record<string, unknown>[])[0] ?? {};
  const t0 = (matricula as unknown as Record<string, unknown>[])[0] ?? {};

  const porTramo = Object.fromEntries(TRAMOS.map((t) => [t.key, 0])) as Record<TramoKey, number>;
  for (const f of tramos as unknown as { tramo: TramoKey | null; saldo: string }[]) {
    // `tramo` puede venir null en un cargo sin vencimiento: el `CASE` no tiene
    // rama para NULL. Es deuda que no vence, que es exactamente «por vencer».
    porTramo[f.tramo ?? 'porVencer'] += n(f.saldo);
  }

  return {
    periodoId: periodo.id,
    periodo: periodo.nombre,
    hoy,
    cartera: {
      devengadoCentavos: n(c0.devengado),
      cobradoCentavos:   n(c0.cobrado),
      pendienteCentavos: n(c0.pendiente),
      vencidoCentavos:   n(c0.vencido),
      cargos:            n(c0.cargos),
      familiasConDeuda:  n(c0.familias),
    },
    tramos: porTramo,
    mes: {
      mes: mesInicio.slice(0, 7),
      esperadoCentavos: n(m0.esperado),
      cobradoCentavos:  n(m0.cobrado),
    },
    caja: {
      esteMesCentavos:     n(k0.este_mes),
      mesAnteriorCentavos: n(k0.mes_anterior),
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
      estudianteId: n(f.estudiante_id),
      estudiante: `${f.nombres ?? ''} ${f.apellidos ?? ''}`.trim(),
      curso: f.curso == null ? null : String(f.curso),
      responsable: f.responsable == null ? null : String(f.responsable),
      deudaCentavos: n(f.deuda),
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
