/**
 * Investigación (solo lectura) de los 7 servicios del team 9 (Colegio Andrés
 * Bello) en admin_escolar_servicios, para decidir si "Primaria" y "Primario"
 * son el mismo nivel duplicado, y si "sds" es basura de pruebas.
 *
 * NO hace ningún UPDATE/DELETE/DDL. Solo SELECT.
 *
 * Uso:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/investigar-servicios-duplicados.ts
 */
import { db } from '../lib/db/drizzle';
import { sql } from 'drizzle-orm';

const TEAM_ID = 9;

async function main() {
  const host = (process.env.POSTGRES_URL ?? '').replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log('base:', host);
  console.log('team:', TEAM_ID, '\n');

  // 1) Los 7 servicios con sus cifras agregadas.
  const servicios = await db.execute(sql`
    SELECT
      s.id,
      s.nombre,
      s.tanda,
      s.periodo_id,
      p.nombre AS periodo_nombre,
      s.activo,
      s.sigerd_servicio_id,
      s.orden,
      (SELECT COUNT(*)::int FROM admin_escolar_grados g WHERE g.servicio_id = s.id) AS n_grados,
      (SELECT COUNT(*)::int FROM admin_escolar_cursos c
         JOIN admin_escolar_grados g ON g.id = c.grado_id
         WHERE g.servicio_id = s.id) AS n_secciones,
      (SELECT COUNT(*)::int FROM admin_escolar_matriculas m
         JOIN admin_escolar_cursos c ON c.id = m.curso_id
         JOIN admin_escolar_grados g ON g.id = c.grado_id
         WHERE g.servicio_id = s.id) AS n_matriculas,
      (SELECT COUNT(DISTINCT m.estudiante_id)::int FROM admin_escolar_matriculas m
         JOIN admin_escolar_cursos c ON c.id = m.curso_id
         JOIN admin_escolar_grados g ON g.id = c.grado_id
         WHERE g.servicio_id = s.id) AS n_estudiantes
    FROM admin_escolar_servicios s
    JOIN admin_escolar_periodos p ON p.id = s.periodo_id
    WHERE s.team_id = ${TEAM_ID}
    ORDER BY s.nombre, s.tanda
  `);
  console.log('=== Servicios (team 9) ===');
  console.table(servicios);

  // 2) Para "Primaria" y "Primario": qué grados cuelgan (solo nombres de
  //    grado, sin datos de menores) y si tienen sigerd_grado_id.
  const grados = await db.execute(sql`
    SELECT g.servicio_id, s.nombre AS servicio_nombre, g.id AS grado_id, g.nombre AS grado_nombre,
           g.nivel, g.sigerd_grado_id, g.orden
    FROM admin_escolar_grados g
    JOIN admin_escolar_servicios s ON s.id = g.servicio_id
    WHERE s.team_id = ${TEAM_ID} AND s.nombre IN ('Primaria', 'Primario', 'sds')
    ORDER BY s.nombre, g.orden
  `);
  console.log('\n=== Grados bajo Primaria / Primario / sds ===');
  console.table(grados);

  // 3) Secciones bajo esos grados (conteo de estudiantes por sección, sin PII).
  const secciones = await db.execute(sql`
    SELECT c.grado_id, g.nombre AS grado_nombre, s.nombre AS servicio_nombre,
           c.id AS curso_id, c.nombre AS seccion_nombre, c.nivel, c.sigerd_seccion_id,
           (SELECT COUNT(*)::int FROM admin_escolar_matriculas m WHERE m.curso_id = c.id) AS n_matriculas
    FROM admin_escolar_cursos c
    JOIN admin_escolar_grados g ON g.id = c.grado_id
    JOIN admin_escolar_servicios s ON s.id = g.servicio_id
    WHERE s.team_id = ${TEAM_ID} AND s.nombre IN ('Primaria', 'Primario', 'sds')
    ORDER BY s.nombre, g.orden, c.orden
  `);
  console.log('\n=== Secciones bajo Primaria / Primario / sds ===');
  console.table(secciones);

  // 4) ¿Los nombres de grado se repiten entre Primaria y Primario? (para ver
  //    si son la misma malla curricular duplicada).
  const nombresComunes = await db.execute(sql`
    SELECT g1.nombre AS grado_nombre,
           COUNT(*) FILTER (WHERE s1.nombre = 'Primaria') AS en_primaria,
           COUNT(*) FILTER (WHERE s1.nombre = 'Primario') AS en_primario
    FROM admin_escolar_grados g1
    JOIN admin_escolar_servicios s1 ON s1.id = g1.servicio_id
    WHERE s1.team_id = ${TEAM_ID} AND s1.nombre IN ('Primaria', 'Primario')
    GROUP BY g1.nombre
    ORDER BY g1.nombre
  `);
  console.log('\n=== Nombres de grado: Primaria vs Primario ===');
  console.table(nombresComunes);

  // 5) documentos_requeridos que referencian estos nombres de nivel en texto
  //    (para ver el impacto real del bug de nombre-duplicado).
  const documentos = await db.execute(sql`
    SELECT id, nivel, tipo_inscripcion, nombre, exigencia, activo
    FROM admin_escolar_documentos_requeridos
    WHERE team_id = ${TEAM_ID} AND (nivel IN ('Primaria', 'Primario', 'sds') OR nivel IS NULL)
    ORDER BY nivel NULLS FIRST, tipo_inscripcion
  `);
  console.log('\n=== Documentos requeridos que apuntan a estos niveles ===');
  console.table(documentos);

  // 6) Todos los periodos del team (para saber si Primaria/Primario/sds son
  //    del mismo año escolar o de años distintos).
  const periodos = await db.execute(sql`
    SELECT id, nombre, activo, fecha_inicio, fecha_fin
    FROM admin_escolar_periodos
    WHERE team_id = ${TEAM_ID}
    ORDER BY id
  `);
  console.log('\n=== Períodos del team 9 ===');
  console.table(periodos);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
