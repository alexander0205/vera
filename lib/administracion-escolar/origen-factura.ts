/**
 * lib/administracion-escolar/origen-factura.ts — ¿qué cargos escolares originaron
 * esta factura?
 *
 * Vive del lado ESCOLAR a propósito. El vínculo `admin_escolar_cargos.ecf_document_id`
 * ya es unidireccional (escolar conoce la factura, la factura no sabe de escolar);
 * si además `lib/cobranza` importara las tablas escolares, el módulo genérico
 * pasaría a depender del vertical y se rompería la separación por el otro lado.
 *
 * La pantalla de cartera compone ambas cosas: pide el detalle genérico a
 * cobranza y, si hay origen escolar, lo pide aquí.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

export interface OrigenEscolarFactura {
  cargoId:      number;
  estudiante:   string;
  codigoEstudiante: string | null;
  curso:        string | null;
  periodo:      string | null;
  concepto:     string;
  mes:          number | null;
  anio:         number;
  montoCents:   number;
  saldoCents:   number;
  estado:       string;
}

/**
 * Cargos escolares cubiertos por una factura. Vacío si la factura no tiene
 * origen escolar — que es el caso normal fuera de un colegio.
 */
export async function getOrigenEscolarDeFactura(
  teamId: number,
  ecfDocumentId: number,
): Promise<OrigenEscolarFactura[]> {
  try {
    return await consultar(teamId, ecfDocumentId);
  } catch (e) {
    // 42P01 = la tabla no existe: el despliegue no tiene aprovisionado el módulo
    // escolar (sus migraciones no se han aplicado en esa base). La cartera no
    // debe romperse por eso — el origen escolar es un dato opcional.
    // Cualquier otro error sí se propaga: no queremos tapar fallos reales.
    if ((e as { code?: string })?.code === '42P01') {
      console.warn('[origen-factura] módulo escolar no aprovisionado en esta base; se omite el origen escolar');
      return [];
    }
    throw e;
  }
}

async function consultar(
  teamId: number,
  ecfDocumentId: number,
): Promise<OrigenEscolarFactura[]> {
  const filas = await db.execute(sql`
    SELECT
      c.id AS cargo_id,
      trim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')) AS estudiante,
      e.codigo AS codigo_estudiante,
      cur.nombre AS curso,
      p.nombre AS periodo,
      cp.nombre AS concepto,
      c.mes, c.anio, c.monto_centavos, c.saldo_centavos, c.estado
    FROM admin_escolar_cargos c
    JOIN admin_escolar_estudiantes e   ON e.id  = c.estudiante_id
    JOIN admin_escolar_conceptos_pago cp ON cp.id = c.concepto_id
    LEFT JOIN admin_escolar_periodos p ON p.id  = c.periodo_id
    LEFT JOIN admin_escolar_matriculas m ON m.id = c.matricula_id
    LEFT JOIN admin_escolar_cursos cur ON cur.id = m.curso_id
    WHERE c.team_id = ${teamId} AND c.ecf_document_id = ${ecfDocumentId}
    ORDER BY c.anio, c.mes NULLS FIRST, c.id
  `) as unknown as Array<Record<string, string | number | null>>;

  return filas.map(f => ({
    cargoId:          Number(f.cargo_id),
    estudiante:       String(f.estudiante ?? '').trim() || 'Estudiante',
    codigoEstudiante: (f.codigo_estudiante as string) ?? null,
    curso:            (f.curso as string) ?? null,
    periodo:          (f.periodo as string) ?? null,
    concepto:         String(f.concepto ?? ''),
    mes:              f.mes == null ? null : Number(f.mes),
    anio:             Number(f.anio),
    montoCents:       Number(f.monto_centavos),
    saldoCents:       Number(f.saldo_centavos),
    estado:           String(f.estado),
  }));
}
