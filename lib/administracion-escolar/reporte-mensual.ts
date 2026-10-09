/**
 * Reporte mensual del colegio para la contable: lo que entró en el mes (por
 * método de pago), lo que quedó sin pagar o a medias de las cuotas de ese mes, y
 * —aparte— lo que sigue debiéndose de meses anteriores. Se descarga en Excel.
 *
 * Es la lista que Dolores pedía cada mes por correo: «lo que me pagaron por tarjeta,
 * por transferencia, en efectivo, lo que no pagaron y lo que pagaron en parte».
 *
 * Mismas definiciones que el panorama (`./dashboard`):
 *   · el mes de un cargo es el de su cuota (no el de su vencimiento);
 *   · el dinero «de un mes» es el que se RECIBIÓ ese mes, sea de la cuota que sea;
 *   · un cobro de una factura que mezcla cargos del colegio con otras cosas se
 *     prorratea por la parte del colegio, para que las cifras cuadren con la pantalla.
 * Los saldos que enseña son los que dejó la última pantalla que sincroniza con las
 * facturas, igual que el panorama.
 */

import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

const NO_ANULADO = sql`estado <> 'anulado'`;
const n = (v: unknown): number => (v == null ? 0 : Number(v));

export interface CobroDelMes {
  fecha: string;
  metodo: string;
  referencia: string | null;
  factura: string | null;
  responsable: string | null;
  alumnos: string | null;
  /** Lo que se recibió, entero. */
  recibidoCentavos: number;
  /** La parte de ese cobro que corresponde a cargos del colegio. */
  aplicadoCentavos: number;
}

export interface CargoPendiente {
  mes: string;
  estudiante: string;
  curso: string | null;
  responsable: string | null;
  concepto: string;
  montoCentavos: number;
  pagadoCentavos: number;
  saldoCentavos: number;
  estado: 'sin pago' | 'pago parcial';
  vencimiento: string | null;
  diasAtraso: number;
}

export interface ReporteMensual {
  periodo: string;
  mes: string;
  /** De las cuotas de ese mes. */
  devengadoCentavos: number;
  cobradoDeEsasCuotasCentavos: number;
  pendienteCentavos: number;
  cobros: CobroDelMes[];
  porMetodo: { metodo: string; recibidoCentavos: number; aplicadoCentavos: number; cobros: number }[];
  pendientesDelMes: CargoPendiente[];
  /** Cuotas de meses anteriores que siguen debiéndose. Separadas para no mezclar saldos viejos con los del mes. */
  arrastre: CargoPendiente[];
  /** Tope de filas por hoja: más que esto es un mes que conviene filtrar por grado. */
  truncado: boolean;
}

export const LIMITE_FILAS = 20000;

/** Un mes 'YYYY-MM' real; cualquier otra cosa, null. */
export function mesValido(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100;
}

/** Primer día del mes siguiente, 'YYYY-MM-01'. */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
}

export async function reporteMensual(teamId: number, periodoId: number, mes: string, hoy: string): Promise<ReporteMensual | null> {
  const [periodo] = await db.execute(sql`
    SELECT nombre FROM admin_escolar_periodos WHERE id = ${periodoId} AND team_id = ${teamId} LIMIT 1
  `) as unknown as { nombre: string }[];
  if (!periodo) return null;

  const inicio = `${mes}-01`;
  const siguiente = mesSiguiente(mes);
  const mesDelCargo = sql`(CASE WHEN c.mes BETWEEN 1 AND 12
    THEN c.anio::text || '-' || lpad(c.mes::text, 2, '0')
    ELSE to_char(c.fecha_vencimiento, 'YYYY-MM') END)`;
  const cargoDelAnio = sql`c.team_id = ${teamId} AND c.periodo_id = ${periodoId} AND c.${NO_ANULADO}`;

  const [resumen] = await db.execute(sql`
    SELECT COALESCE(SUM(c.monto_centavos), 0)::bigint AS devengado,
           COALESCE(SUM(c.monto_centavos - c.saldo_centavos), 0)::bigint AS cobrado,
           COALESCE(SUM(c.saldo_centavos), 0)::bigint AS pendiente
    FROM admin_escolar_cargos c WHERE ${cargoDelAnio} AND ${mesDelCargo} = ${mes}
  `) as unknown as { devengado: unknown; cobrado: unknown; pendiente: unknown }[];

  const cobros = await db.execute(sql`
    WITH escolar AS (
      SELECT c.ecf_document_id AS doc, SUM(c.monto_centavos)::numeric AS cargos
      FROM admin_escolar_cargos c WHERE ${cargoDelAnio} AND c.ecf_document_id IS NOT NULL GROUP BY 1
    )
    SELECT p.fecha_pago::text AS fecha, p.metodo, p.referencia, d.encf AS factura, d.razon_social_comprador AS responsable,
           (SELECT string_agg(DISTINCT es.nombres || ' ' || es.apellidos, ', ')
              FROM admin_escolar_cargos c2 JOIN admin_escolar_estudiantes es ON es.id = c2.estudiante_id AND es.team_id = ${teamId}
             WHERE c2.team_id = ${teamId} AND c2.ecf_document_id = p.ecf_document_id AND c2.${NO_ANULADO}) AS alumnos,
           p.monto_centavos AS recibido,
           ROUND(p.monto_centavos * LEAST(1.0, e.cargos / NULLIF(d.monto_total, 0)))::bigint AS aplicado
    FROM pagos_recibidos p
    JOIN escolar e       ON e.doc = p.ecf_document_id
    JOIN ecf_documents d ON d.id  = p.ecf_document_id
    WHERE p.team_id = ${teamId} AND p.fecha_pago >= ${inicio}::date AND p.fecha_pago < ${siguiente}::date
    ORDER BY p.fecha_pago, p.id
    LIMIT ${LIMITE_FILAS + 1}
  `) as unknown as { fecha: string; metodo: string; referencia: string | null; factura: string | null; responsable: string | null; alumnos: string | null; recibido: unknown; aplicado: unknown }[];

  const diasAtraso = sql`GREATEST(0, (${hoy}::date - c.fecha_vencimiento))`;
  const pendientes = (filtroMes: ReturnType<typeof sql>) => db.execute(sql`
    SELECT ${mesDelCargo} AS mes, e.nombres || ' ' || e.apellidos AS estudiante,
           (SELECT cu.nombre || ' · ' || gr.nombre FROM admin_escolar_matriculas m
              JOIN admin_escolar_cursos cu ON cu.id = m.curso_id JOIN admin_escolar_grados gr ON gr.id = cu.grado_id
             WHERE m.id = c.matricula_id LIMIT 1) AS curso,
           (SELECT cl.razon_social FROM clients cl WHERE cl.id = e.facturar_a_client_id AND cl.team_id = ${teamId}) AS responsable,
           co.nombre AS concepto, c.monto_centavos AS monto, (c.monto_centavos - c.saldo_centavos) AS pagado, c.saldo_centavos AS saldo,
           c.fecha_vencimiento::text AS vence, CASE WHEN c.fecha_vencimiento IS NULL THEN 0 ELSE ${diasAtraso} END AS dias
    FROM admin_escolar_cargos c
    JOIN admin_escolar_estudiantes e ON e.id = c.estudiante_id AND e.team_id = ${teamId}
    JOIN admin_escolar_conceptos_pago co ON co.id = c.concepto_id AND co.team_id = ${teamId}
    WHERE ${cargoDelAnio} AND c.saldo_centavos > 0 AND ${filtroMes}
    ORDER BY ${mesDelCargo}, e.apellidos, e.nombres, co.nombre
    LIMIT ${LIMITE_FILAS + 1}
  `) as unknown as Promise<{ mes: string; estudiante: string; curso: string | null; responsable: string | null; concepto: string; monto: unknown; pagado: unknown; saldo: unknown; vence: string | null; dias: unknown }[]>;

  const [delMes, antes] = await Promise.all([
    pendientes(sql`${mesDelCargo} = ${mes}`),
    pendientes(sql`${mesDelCargo} < ${mes}`),
  ]);

  const aCargo = (f: Awaited<ReturnType<typeof pendientes>>[number]): CargoPendiente => ({
    mes: f.mes, estudiante: f.estudiante, curso: f.curso, responsable: f.responsable, concepto: f.concepto,
    montoCentavos: n(f.monto), pagadoCentavos: n(f.pagado), saldoCentavos: n(f.saldo),
    estado: n(f.pagado) > 0 ? 'pago parcial' : 'sin pago', vencimiento: f.vence, diasAtraso: n(f.dias),
  });

  const truncado = cobros.length > LIMITE_FILAS || delMes.length > LIMITE_FILAS || antes.length > LIMITE_FILAS;
  const cobrosOk: CobroDelMes[] = cobros.slice(0, LIMITE_FILAS).map((f) => ({
    fecha: f.fecha, metodo: f.metodo, referencia: f.referencia, factura: f.factura, responsable: f.responsable,
    alumnos: f.alumnos, recibidoCentavos: n(f.recibido), aplicadoCentavos: n(f.aplicado),
  }));
  const metodos = new Map<string, { recibidoCentavos: number; aplicadoCentavos: number; cobros: number }>();
  for (const c of cobrosOk) {
    const m = metodos.get(c.metodo) ?? { recibidoCentavos: 0, aplicadoCentavos: 0, cobros: 0 };
    m.recibidoCentavos += c.recibidoCentavos; m.aplicadoCentavos += c.aplicadoCentavos; m.cobros++;
    metodos.set(c.metodo, m);
  }

  return {
    periodo: periodo.nombre, mes,
    devengadoCentavos: n(resumen.devengado), cobradoDeEsasCuotasCentavos: n(resumen.cobrado), pendienteCentavos: n(resumen.pendiente),
    cobros: cobrosOk,
    porMetodo: [...metodos.entries()].map(([metodo, v]) => ({ metodo, ...v })).sort((a, b) => b.aplicadoCentavos - a.aplicadoCentavos),
    pendientesDelMes: delMes.slice(0, LIMITE_FILAS).map(aCargo),
    arrastre: antes.slice(0, LIMITE_FILAS).map(aCargo),
    truncado,
  };
}

// ─── Excel ───────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cheque: 'Cheque', deposito: 'Depósito', nota_credito: 'Nota de crédito',
};
const pesos = (c: number) => Math.round(c) / 100;

/**
 * Una celda de texto segura para Excel: lo que empiece con = + - @ se abriría como
 * fórmula (un apellido o una referencia de transferencia la traen quienes pagan).
 */
export function textoSeguro(v: string | null | undefined): string {
  const t = (v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

export function construirLibroReporte(r: ReporteMensual): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  const cabecera = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const dinero = '#,##0.00';

  const res = wb.addWorksheet('Resumen');
  res.columns = [{ header: 'Concepto', width: 52 }, { header: 'Monto (RD$)', width: 18 }, { header: 'Cobros', width: 10 }];
  cabecera(res);
  res.addRow([`Colegio · ${nombreMes(r.mes)} (año escolar ${r.periodo})`, null, null]).font = { bold: true };
  res.addRow(['Cuotas del mes: lo que se cobra por ellas', pesos(r.devengadoCentavos), null]);
  res.addRow(['   de eso, ya pagado (se haya pagado cuando sea)', pesos(r.cobradoDeEsasCuotasCentavos), null]);
  res.addRow(['   de eso, sin pagar o pagado en parte', pesos(r.pendienteCentavos), null]);
  res.addRow([]);
  res.addRow(['Lo que se RECIBIÓ en el mes, por método de pago', null, null]).font = { bold: true };
  for (const m of r.porMetodo) res.addRow([ETIQUETA_METODO[m.metodo] ?? m.metodo, pesos(m.aplicadoCentavos), m.cobros]);
  res.addRow(['Total recibido en el mes (parte del colegio)', pesos(r.porMetodo.reduce((s, m) => s + m.aplicadoCentavos, 0)), r.cobros.length]).font = { bold: true };
  res.addRow([]);
  res.addRow(['Sigue debiéndose de meses anteriores (aparte, hoja «Meses anteriores»)', pesos(r.arrastre.reduce((s, c) => s + c.saldoCentavos, 0)), r.arrastre.length]);
  if (r.truncado) res.addRow(['⚠ Hay más filas de las que caben en el archivo: filtra por grado.', null, null]);
  res.getColumn(2).numFmt = dinero;

  const hojaCobros = wb.addWorksheet('Cobros del mes');
  hojaCobros.columns = [
    { header: 'Fecha', width: 12 }, { header: 'Método', width: 15 }, { header: 'Referencia', width: 22 }, { header: 'Factura', width: 16 },
    { header: 'Responsable', width: 32 }, { header: 'Alumnos', width: 40 }, { header: 'Recibido (RD$)', width: 16 }, { header: 'Parte del colegio (RD$)', width: 20 },
  ];
  cabecera(hojaCobros);
  for (const c of r.cobros) {
    hojaCobros.addRow([c.fecha, ETIQUETA_METODO[c.metodo] ?? c.metodo, textoSeguro(c.referencia), textoSeguro(c.factura), textoSeguro(c.responsable), textoSeguro(c.alumnos), pesos(c.recibidoCentavos), pesos(c.aplicadoCentavos)]);
  }
  hojaCobros.getColumn(7).numFmt = dinero; hojaCobros.getColumn(8).numFmt = dinero;

  const columnasCargo = [
    { header: 'Mes de la cuota', width: 14 }, { header: 'Alumno', width: 32 }, { header: 'Curso', width: 28 }, { header: 'Responsable', width: 32 },
    { header: 'Concepto', width: 26 }, { header: 'Monto (RD$)', width: 14 }, { header: 'Pagado (RD$)', width: 14 }, { header: 'Pendiente (RD$)', width: 16 },
    { header: 'Estado', width: 14 }, { header: 'Vence', width: 12 }, { header: 'Días de atraso', width: 14 },
  ];
  const llenarCargos = (ws: ExcelJS.Worksheet, filas: CargoPendiente[]) => {
    ws.columns = columnasCargo; cabecera(ws);
    for (const c of filas) {
      ws.addRow([c.mes, textoSeguro(c.estudiante), textoSeguro(c.curso), textoSeguro(c.responsable), textoSeguro(c.concepto),
        pesos(c.montoCentavos), pesos(c.pagadoCentavos), pesos(c.saldoCentavos), c.estado === 'pago parcial' ? 'Pago parcial' : 'Sin pago', c.vencimiento ?? '', c.diasAtraso]);
    }
    for (const col of [6, 7, 8]) ws.getColumn(col).numFmt = dinero;
  };
  llenarCargos(wb.addWorksheet('Pendientes del mes'), r.pendientesDelMes);
  llenarCargos(wb.addWorksheet('Meses anteriores'), r.arrastre);
  return wb;
}
