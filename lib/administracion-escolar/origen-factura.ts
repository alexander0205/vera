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

/**
 * ¿El cliente de la factura es responsable de pago de algún estudiante?
 *
 * Es la señal para que la cartera de Facturación ofrezca saltar a su ficha en
 * Gobernanza, aunque la factura concreta no cubra cargos escolares (facturas
 * sueltas emitidas antes de la migración, p. ej.). Misma regla que arriba:
 * vive del lado escolar y tolera que el módulo no esté aprovisionado.
 *
 * El responsable de pago es `estudiantes.facturar_a_client_id` —el CONTACTO que
 * paga—, que es exactamente la clave de la ficha `/escolar/responsables/{id}` a
 * la que lleva el botón. NO se mira `admin_escolar_tutores`: esa casilla
 * quedó muerta al separarse tutor y pagador (en prod la tabla está vacía),
 * así que mirándola el botón no salía nunca aunque el alumno tuviera pagador.
 */
export async function esResponsableEscolar(
  teamId: number,
  clientId: number | null,
): Promise<boolean> {
  if (clientId == null) return false;
  try {
    const filas = await db.execute(sql`
      SELECT 1 FROM admin_escolar_estudiantes
      WHERE team_id = ${teamId} AND facturar_a_client_id = ${clientId}
      LIMIT 1
    `) as unknown as unknown[];
    return filas.length > 0;
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return false;
    throw e;
  }
}

/**
 * El contacto que paga una factura: el de la cabecera y, si no lo trae, el del
 * alumno nombrado en ella.
 *
 * Mismo respaldo que `saldar-con-factura`, más el caso que ese no cubre: el
 * alumno puede venir solo dentro de las líneas (`dependienteId` por renglón).
 * Sin esto, el puente a Gobernanza no salía nunca en esas facturas.
 */
export async function clientePagadorDeFactura(
  teamId: number,
  docId: number,
): Promise<number | null> {
  const filas = await db.execute(sql`
    SELECT COALESCE(d.client_id, dep.client_id, dep_linea.client_id) AS cliente
    FROM ecf_documents d
    LEFT JOIN dependientes dep ON dep.id = d.dependiente_id AND dep.team_id = ${teamId}
    -- El alumno puede venir solo dentro de las líneas (dependienteId por renglón).
    LEFT JOIN LATERAL (
      SELECT dl.client_id
      FROM jsonb_array_elements(COALESCE(d.lineas_json::jsonb, '[]'::jsonb)) AS l
      JOIN dependientes dl ON dl.team_id = ${teamId} AND dl.id = (l->>'dependienteId')::int
      WHERE l->>'dependienteId' ~ '^[0-9]+$'
      LIMIT 1
    ) dep_linea ON true
    WHERE d.id = ${docId} AND d.team_id = ${teamId}
    LIMIT 1
  `) as unknown as { cliente: number | null }[];
  return filas[0]?.cliente ?? null;
}
