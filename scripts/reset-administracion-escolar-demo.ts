/**
 * Reinicia exclusivamente la muestra de Administración Escolar del team 2.
 *
 * Uso:
 *   $env:CONFIRM_RESET_ESCOLAR='YES'; pnpm exec tsx scripts/reset-administracion-escolar-demo.ts
 *
 * Todo ocurre en una transacción: ante un error, Neon revierte la operación.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TEAM_ID = 2;
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

type Tx = postgres.TransactionSql;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function deleteEcfDependents(tx: Tx) {
  const refs = await tx<{ table_name: string; column_name: string }[]>`
    SELECT DISTINCT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'ecf_documents'
      AND tc.table_name <> 'ecf_documents'
  `;

  for (const { table_name, column_name } of refs) {
    await tx.unsafe(
      `DELETE FROM ${quoteIdentifier(table_name)}
       WHERE ${quoteIdentifier(column_name)} IN (SELECT id FROM school_cleanup_docs)`,
    );
  }
}

async function archiveOrDeleteOldProducts(tx: Tx) {
  const refs = await tx<{ table_name: string; column_name: string }[]>`
    SELECT DISTINCT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'products'
      AND tc.table_name <> 'admin_escolar_conceptos_pago'
  `;

  const blockedIds = new Set<number>();
  for (const { table_name, column_name } of refs) {
    const rows = await (tx.unsafe(
      `SELECT DISTINCT ${quoteIdentifier(column_name)} AS id
       FROM ${quoteIdentifier(table_name)}
       WHERE ${quoteIdentifier(column_name)} IN (SELECT id FROM school_cleanup_products)`,
    ) as Promise<{ id: number }[]>);
    rows.forEach(({ id }) => blockedIds.add(id));
  }

  if (blockedIds.size) {
    await tx`
      UPDATE products
      SET activo = 'false', updated_at = now()
      WHERE id = ANY(${[...blockedIds]})
    `;
  }

  await tx`
    DELETE FROM products
    WHERE id IN (SELECT id FROM school_cleanup_products)
      AND NOT (id = ANY(${[...blockedIds]}))
  `;
}

async function seedCleanSchool(tx: Tx) {
  const [periodo] = await tx<{ id: number }[]>`
    INSERT INTO admin_escolar_periodos (team_id, nombre, fecha_inicio, fecha_fin, activo)
    VALUES (${TEAM_ID}, '2026-2027', '2026-08-15', '2027-06-30', true)
    RETURNING id
  `;

  const courses = await tx<{ id: number; nombre: string }[]>`
    INSERT INTO admin_escolar_cursos (team_id, nombre, nivel, orden, activo)
    VALUES
      (${TEAM_ID}, 'Preprimario A', 'Inicial', 1, true),
      (${TEAM_ID}, 'Primero A', 'Primaria', 2, true),
      (${TEAM_ID}, 'Tercero A', 'Primaria', 3, true)
    RETURNING id, nombre
  `;
  const courseId = Object.fromEntries(courses.map((course) => [course.nombre, course.id]));

  const products = await tx<{ id: number; nombre: string }[]>`
    INSERT INTO products (team_id, nombre, descripcion, referencia, precio, tasa_itbis, tipo, activo)
    VALUES
      (${TEAM_ID}, 'Mensualidad escolar 2026-2027', 'Cuota mensual por estudiante.', 'ESC-MEN-2026', 50000, '0', 'servicio', 'true'),
      (${TEAM_ID}, 'Inscripción escolar 2026-2027', 'Inscripción anual por estudiante.', 'ESC-INS-2026', 100000, '0', 'servicio', 'true'),
      (${TEAM_ID}, 'Uniforme escolar 2026-2027', 'Uniforme completo por estudiante.', 'ESC-UNI-2026', 150000, '0', 'producto', 'true')
    RETURNING id, nombre
  `;
  const productId = Object.fromEntries(products.map((product) => [product.nombre, product.id]));

  const concepts = await tx<{ id: number; nombre: string }[]>`
    INSERT INTO admin_escolar_conceptos_pago (team_id, nombre, tipo, recurrente, product_id, activo)
    VALUES
      (${TEAM_ID}, 'Mensualidad', 'mensualidad', true, ${productId['Mensualidad escolar 2026-2027']}, true),
      (${TEAM_ID}, 'Inscripción', 'inscripcion', false, ${productId['Inscripción escolar 2026-2027']}, true),
      (${TEAM_ID}, 'Uniforme escolar', 'uniforme', false, ${productId['Uniforme escolar 2026-2027']}, true)
    RETURNING id, nombre
  `;
  const conceptId = Object.fromEntries(concepts.map((concept) => [concept.nombre, concept.id]));

  const families = [
    { student: ['Sofía', 'Reyes Luna', '2019-03-12', 'Femenino', 'EST-2026-001'], tutor: ['Laura Reyes', '809-555-0101', 'laura.reyes@familia.demo'], course: 'Preprimario A' },
    { student: ['Mateo', 'Gómez Cruz', '2017-08-21', 'Masculino', 'EST-2026-002'], tutor: ['Roberto Gómez', '809-555-0102', 'roberto.gomez@familia.demo'], course: 'Primero A' },
    { student: ['Valentina', 'Santos Pérez', '2015-11-05', 'Femenino', 'EST-2026-003'], tutor: ['Elena Santos', '809-555-0103', 'elena.santos@familia.demo'], course: 'Tercero A' },
  ] as const;

  for (const family of families) {
    const [client] = await tx<{ id: number }[]>`
      INSERT INTO clients (team_id, razon_social, email, telefono, descripcion)
      VALUES (${TEAM_ID}, ${family.tutor[0]}, ${family.tutor[2]}, ${family.tutor[1]}, 'Tutor de pago — Administración Escolar')
      RETURNING id
    `;
    const [dependiente] = await tx<{ id: number }[]>`
      INSERT INTO dependientes (team_id, client_id, nombre, apellido)
      VALUES (${TEAM_ID}, ${client.id}, ${family.student[0]}, ${family.student[1]})
      RETURNING id
    `;
    const [student] = await tx<{ id: number }[]>`
      INSERT INTO admin_escolar_estudiantes
        (team_id, codigo, nombres, apellidos, fecha_nacimiento, sexo, estado, dependiente_id)
      VALUES
        (${TEAM_ID}, ${family.student[4]}, ${family.student[0]}, ${family.student[1]}, ${family.student[2]}, ${family.student[3]}, 'activo', ${dependiente.id})
      RETURNING id
    `;
    const [tutor] = await tx<{ id: number }[]>`
      INSERT INTO admin_escolar_tutores (team_id, client_id, nombre, telefono, email)
      VALUES (${TEAM_ID}, ${client.id}, ${family.tutor[0]}, ${family.tutor[1]}, ${family.tutor[2]})
      RETURNING id
    `;
    await tx`
      INSERT INTO admin_escolar_estudiante_tutores
        (team_id, estudiante_id, tutor_id, relacion, responsable_pago)
      VALUES (${TEAM_ID}, ${student.id}, ${tutor.id}, 'tutor', true)
    `;
    const [matricula] = await tx<{ id: number }[]>`
      INSERT INTO admin_escolar_matriculas
        (team_id, estudiante_id, periodo_id, curso_id, codigo_matricula, fecha_inscripcion, estado, concepto_mensualidad_id)
      VALUES
        (${TEAM_ID}, ${student.id}, ${periodo.id}, ${courseId[family.course]}, ${`MAT-${family.student[4].slice(-3)}`}, '2026-08-15', 'activa', ${conceptId.Mensualidad})
      RETURNING id
    `;
    const [plan] = await tx<{ id: number }[]>`
      INSERT INTO facturas_recurrentes
        (team_id, client_id, nombre, descripcion, tipo_ecf, tipo_pago, dias_para_pago, frecuencia, dia_cobro,
         fecha_inicio, fecha_fin, proxima_emision, estado, items, notas, total_estimado, facturas_emitidas)
      VALUES
        (${TEAM_ID}, ${client.id}, ${`Mensualidad — ${family.student[0]} ${family.student[1]}`},
         'Mensualidad escolar; la factura se genera para el mes correspondiente.', '31', 2, 5, 'mensual', 15,
         '2026-08-15', '2027-06-15', '2026-08-15', 'activa',
         ${JSON.stringify([{ productoId: productId['Mensualidad escolar 2026-2027'], descripcion: 'Mensualidad escolar', cantidad: 1, precioUnitario: 50000, tasaItbis: '0' }])},
         'Facturar únicamente al tutor responsable de pago.', 50000, 0)
      RETURNING id
    `;
    await tx`
      UPDATE admin_escolar_matriculas
      SET factura_recurrente_id = ${plan.id}, updated_at = now()
      WHERE id = ${matricula.id}
    `;
  }
}

async function main() {
  if (process.env.CONFIRM_RESET_ESCOLAR !== 'YES') {
    throw new Error('Falta CONFIRM_RESET_ESCOLAR=YES. No se modificó la base de datos.');
  }

  const result = await sql.begin(async (tx) => {
    await tx.unsafe('CREATE TEMP TABLE school_cleanup_docs (id integer PRIMARY KEY) ON COMMIT DROP');
    await tx.unsafe('CREATE TEMP TABLE school_cleanup_products (id integer PRIMARY KEY) ON COMMIT DROP');
    await tx.unsafe('CREATE TEMP TABLE school_cleanup_clients (id integer PRIMARY KEY) ON COMMIT DROP');
    await tx.unsafe('CREATE TEMP TABLE school_cleanup_dependientes (id integer PRIMARY KEY) ON COMMIT DROP');

    await tx`
      INSERT INTO school_cleanup_products (id)
      SELECT DISTINCT product_id
      FROM admin_escolar_conceptos_pago
      WHERE team_id = ${TEAM_ID} AND product_id IS NOT NULL
    `;
    await tx`
      INSERT INTO school_cleanup_clients (id)
      SELECT DISTINCT client_id
      FROM admin_escolar_tutores
      WHERE team_id = ${TEAM_ID} AND client_id IS NOT NULL
    `;
    await tx`
      INSERT INTO school_cleanup_dependientes (id)
      SELECT DISTINCT dependiente_id
      FROM admin_escolar_estudiantes
      WHERE team_id = ${TEAM_ID} AND dependiente_id IS NOT NULL
    `;
    await tx`
      WITH RECURSIVE roots(id) AS (
        SELECT DISTINCT ecf_document_id
        FROM admin_escolar_cargos
        WHERE team_id = ${TEAM_ID} AND ecf_document_id IS NOT NULL
        UNION
        SELECT d.id
        FROM ecf_documents d
        JOIN facturas_recurrentes fr ON fr.id = d.origen_recurrente_id
        WHERE fr.team_id = ${TEAM_ID}
      ), related(id) AS (
        SELECT id FROM roots
        UNION
        SELECT d.id
        FROM ecf_documents d
        JOIN related r ON d.mora_origen_id = r.id OR d.origen_documento_id = r.id
      )
      INSERT INTO school_cleanup_docs (id)
      SELECT id FROM related
    `;

    const [before] = await tx<{ cargos: number; facturas: number; estudiantes: number }[]>`
      SELECT
        (SELECT count(*)::int FROM admin_escolar_cargos WHERE team_id = ${TEAM_ID}) AS cargos,
        (SELECT count(*)::int FROM school_cleanup_docs) AS facturas,
        (SELECT count(*)::int FROM admin_escolar_estudiantes WHERE team_id = ${TEAM_ID}) AS estudiantes
    `;

    await tx`DELETE FROM admin_escolar_pagos WHERE team_id = ${TEAM_ID}`;
    await deleteEcfDependents(tx);
    await tx`DELETE FROM admin_escolar_cargos WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_matriculas WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM ecf_documents WHERE id IN (SELECT id FROM school_cleanup_docs)`;
    await tx`DELETE FROM facturas_recurrentes WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_estudiante_tutores WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_tutores WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_estudiantes WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_conceptos_pago WHERE team_id = ${TEAM_ID}`;
    await archiveOrDeleteOldProducts(tx);
    await tx`DELETE FROM dependientes WHERE id IN (SELECT id FROM school_cleanup_dependientes)`;
    await tx`DELETE FROM clients WHERE id IN (SELECT id FROM school_cleanup_clients)`;
    await tx`DELETE FROM admin_escolar_materias WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_cursos WHERE team_id = ${TEAM_ID}`;
    await tx`DELETE FROM admin_escolar_periodos WHERE team_id = ${TEAM_ID}`;

    await seedCleanSchool(tx);

    const [after] = await tx<{ periodos: number; estudiantes: number; matriculas: number; planes: number; cargos: number; facturas: number }[]>`
      SELECT
        (SELECT count(*)::int FROM admin_escolar_periodos WHERE team_id = ${TEAM_ID}) AS periodos,
        (SELECT count(*)::int FROM admin_escolar_estudiantes WHERE team_id = ${TEAM_ID}) AS estudiantes,
        (SELECT count(*)::int FROM admin_escolar_matriculas WHERE team_id = ${TEAM_ID}) AS matriculas,
        (SELECT count(*)::int FROM facturas_recurrentes WHERE team_id = ${TEAM_ID}) AS planes,
        (SELECT count(*)::int FROM admin_escolar_cargos WHERE team_id = ${TEAM_ID}) AS cargos,
        (SELECT count(*)::int FROM ecf_documents WHERE id IN (SELECT id FROM school_cleanup_docs)) AS facturas
    `;
    return { before, after };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
