/**
 * Agrega escenarios de prueba al demo escolar limpio del team 2.
 *
 * Uso:
 *   $env:CONFIRM_SEED_ESCOLAR='YES'; npx --yes tsx scripts/seed-administracion-escolar-test-data.ts
 *
 * Todo ocurre en una transacción. Las facturas son BORRADOR: no se envían a DGII.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TEAM_ID = 2;
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

type Fixture = {
  codigo: string;
  estudianteId: number;
  matriculaId: number;
  periodoId: number;
  recurrenteId: number;
  tutorClientId: number;
};

type Tx = postgres.TransactionSql;

async function crearFacturaMensual(tx: Tx, fixture: Fixture, periodo: string, codigo: string) {
  const [documento] = await tx<{ id: number }[]>`
    INSERT INTO ecf_documents
      (team_id, client_id, encf, codigo, tipo_ecf, estado, estado_pago, tipo_pago,
       fecha_limite_pago, monto_total, total_itbis, lineas_json, notas,
       origen_recurrente_id, periodo_recurrente, fecha_emision)
    VALUES
      (${TEAM_ID}, ${fixture.tutorClientId}, ${`BOR-31-${codigo}`}, ${`ESC-TEST-${codigo}`}, '31', 'BORRADOR', 'PENDIENTE', 2,
       ${periodo.slice(0, 8) + '20'}, 50000, 0,
       ${JSON.stringify([{ descripcion: 'Mensualidad escolar', cantidad: 1, precioUnitario: 50000, tasaItbis: '0' }])},
       'Factura de prueba: mensualidad escolar.', ${fixture.recurrenteId}, ${periodo}, ${new Date(`${periodo}T12:00:00`)})
    RETURNING id
  `;
  await tx`
    INSERT INTO admin_escolar_cargos
      (team_id, estudiante_id, matricula_id, periodo_id, concepto_id, mes, anio,
       monto_centavos, saldo_centavos, fecha_vencimiento, estado, ecf_document_id)
    SELECT ${TEAM_ID}, ${fixture.estudianteId}, ${fixture.matriculaId}, ${fixture.periodoId}, cp.id,
           ${Number(periodo.slice(5, 7))}, ${Number(periodo.slice(0, 4))},
           50000, 50000, ${periodo.slice(0, 8) + '20'}, 'pendiente', ${documento.id}
    FROM admin_escolar_conceptos_pago cp
    WHERE cp.team_id = ${TEAM_ID} AND cp.nombre = 'Mensualidad'
  `;
  return documento.id;
}

async function crearOtroCargo(tx: Tx, args: {
  fixture: Fixture;
  concepto: 'Inscripción' | 'Uniforme escolar';
  codigo: string;
  montoCentavos: number;
  fechaVencimiento: string;
  conFactura?: boolean;
}) {
  const [cargo] = await tx<{ id: number }[]>`
    INSERT INTO admin_escolar_cargos
      (team_id, estudiante_id, matricula_id, periodo_id, concepto_id, mes, anio,
       monto_centavos, saldo_centavos, fecha_vencimiento, estado)
    SELECT ${TEAM_ID}, ${args.fixture.estudianteId}, ${args.fixture.matriculaId}, ${args.fixture.periodoId}, cp.id,
           NULL, 2026, ${args.montoCentavos}, ${args.montoCentavos}, ${args.fechaVencimiento}, 'pendiente'
    FROM admin_escolar_conceptos_pago cp
    WHERE cp.team_id = ${TEAM_ID} AND cp.nombre = ${args.concepto}
    RETURNING id
  `;
  if (!args.conFactura) return { cargoId: cargo.id, documentoId: null };

  const [documento] = await tx<{ id: number }[]>`
    INSERT INTO ecf_documents
      (team_id, client_id, encf, codigo, tipo_ecf, estado, estado_pago, tipo_pago,
       fecha_limite_pago, monto_total, total_itbis, lineas_json, notas, fecha_emision)
    VALUES
      (${TEAM_ID}, ${args.fixture.tutorClientId}, ${`BOR-31-${args.codigo}`}, ${`ESC-TEST-${args.codigo}`}, '31', 'BORRADOR', 'PENDIENTE', 2,
       ${args.fechaVencimiento}, ${args.montoCentavos}, 0,
       ${JSON.stringify([{ descripcion: args.concepto, cantidad: 1, precioUnitario: args.montoCentavos, tasaItbis: '0' }])},
       ${`Factura de prueba: ${args.concepto}.`}, ${new Date(`${args.fechaVencimiento}T12:00:00`)})
    RETURNING id
  `;
  await tx`
    UPDATE admin_escolar_cargos
    SET ecf_document_id = ${documento.id}, updated_at = now()
    WHERE id = ${cargo.id}
  `;
  return { cargoId: cargo.id, documentoId: documento.id };
}

async function registrarPago(tx: Tx, documentoId: number, montoCentavos: number, fecha: string, metodo: string, referencia: string) {
  await tx`
    INSERT INTO pagos_recibidos
      (team_id, ecf_document_id, monto_centavos, metodo, referencia, fecha_pago, notas)
    VALUES
      (${TEAM_ID}, ${documentoId}, ${montoCentavos}, ${metodo}, ${referencia}, ${fecha}, 'Pago de prueba escolar')
  `;
}

async function sincronizarSaldos(tx: Tx) {
  await tx`
    WITH pagos AS (
      SELECT ecf_document_id, SUM(monto_centavos)::int AS total
      FROM pagos_recibidos
      WHERE team_id = ${TEAM_ID}
      GROUP BY ecf_document_id
    ), facturas AS (
      SELECT d.id, d.monto_total, COALESCE(p.total, 0)::int AS pagado,
             CASE WHEN COALESCE(p.total, 0) >= d.monto_total THEN 'PAGADA'
                  WHEN COALESCE(p.total, 0) > 0 THEN 'PARCIAL'
                  ELSE 'PENDIENTE' END AS estado_pago
      FROM ecf_documents d
      LEFT JOIN pagos p ON p.ecf_document_id = d.id
      WHERE d.team_id = ${TEAM_ID} AND d.codigo LIKE 'ESC-TEST-%'
    )
    UPDATE ecf_documents d
    SET pago_recibido = CASE WHEN f.pagado > 0 THEN 'true' ELSE 'false' END,
        pago_valor_cts = f.pagado,
        estado_pago = f.estado_pago,
        updated_at = now()
    FROM facturas f
    WHERE d.id = f.id
  `;
  await tx`
    WITH pagos AS (
      SELECT ecf_document_id, SUM(monto_centavos)::int AS total
      FROM pagos_recibidos
      WHERE team_id = ${TEAM_ID}
      GROUP BY ecf_document_id
    )
    UPDATE admin_escolar_cargos c
    SET saldo_centavos = GREATEST(0, c.monto_centavos - COALESCE(p.total, 0)),
        estado = CASE
          WHEN COALESCE(p.total, 0) >= c.monto_centavos THEN 'pagado'
          WHEN COALESCE(p.total, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END,
        updated_at = now()
    FROM pagos p
    WHERE c.team_id = ${TEAM_ID} AND c.ecf_document_id = p.ecf_document_id
  `;
}

async function main() {
  if (process.env.CONFIRM_SEED_ESCOLAR !== 'YES') {
    throw new Error('Falta CONFIRM_SEED_ESCOLAR=YES. No se modificó la base de datos.');
  }

  const result = await sql.begin(async (tx) => {
    const [existing] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ecf_documents
      WHERE team_id = ${TEAM_ID} AND codigo LIKE 'ESC-TEST-%'
    `;
    if (existing.count > 0) throw new Error('La muestra ya existe. No se duplicaron datos.');

    const fixtures = await tx<Fixture[]>`
      SELECT e.codigo, e.id AS "estudianteId", m.id AS "matriculaId", m.periodo_id AS "periodoId",
             m.factura_recurrente_id AS "recurrenteId", t.client_id AS "tutorClientId"
      FROM admin_escolar_estudiantes e
      JOIN admin_escolar_matriculas m ON m.estudiante_id = e.id
      JOIN admin_escolar_estudiante_tutores et ON et.estudiante_id = e.id AND et.responsable_pago = true
      JOIN admin_escolar_tutores t ON t.id = et.tutor_id
      WHERE e.team_id = ${TEAM_ID}
    `;
    const byCode = new Map(fixtures.map((item) => [item.codigo, item]));
    const sofia = byCode.get('EST-2026-001');
    const mateo = byCode.get('EST-2026-002');
    const valentina = byCode.get('EST-2026-003');
    if (!sofia || !mateo || !valentina) throw new Error('Falta la muestra limpia esperada. Ejecuta primero el reset.');

    // Sofía: mensualidad pagada/pending, inscripción pagada, uniforme pendiente.
    const sofiaAgo = await crearFacturaMensual(tx, sofia, '2026-08-15', 'SOF-AGO');
    await crearFacturaMensual(tx, sofia, '2026-09-15', 'SOF-SEP');
    await registrarPago(tx, sofiaAgo, 50000, '2026-08-16', 'transferencia', 'SOF-AGO-001');
    const sofiaIns = await crearOtroCargo(tx, { fixture: sofia, concepto: 'Inscripción', codigo: 'SOF-INS', montoCentavos: 100000, fechaVencimiento: '2026-08-15', conFactura: true });
    await registrarPago(tx, sofiaIns.documentoId!, 100000, '2026-08-15', 'efectivo', 'SOF-INS-001');
    await crearOtroCargo(tx, { fixture: sofia, concepto: 'Uniforme escolar', codigo: 'SOF-UNI', montoCentavos: 150000, fechaVencimiento: '2026-08-25', conFactura: true });

    // Mateo: pago dividido completo, pago parcial, mensualidad pendiente y uniforme pagado.
    const mateoAgo = await crearFacturaMensual(tx, mateo, '2026-08-15', 'MAT-AGO');
    const mateoSep = await crearFacturaMensual(tx, mateo, '2026-09-15', 'MAT-SEP');
    await crearFacturaMensual(tx, mateo, '2026-10-15', 'MAT-OCT');
    await registrarPago(tx, mateoAgo, 30000, '2026-08-16', 'efectivo', 'MAT-AGO-EFE');
    await registrarPago(tx, mateoAgo, 20000, '2026-08-16', 'tarjeta', 'MAT-AGO-TAR');
    await registrarPago(tx, mateoSep, 20000, '2026-09-16', 'transferencia', 'MAT-SEP-PAR');
    const mateoUni = await crearOtroCargo(tx, { fixture: mateo, concepto: 'Uniforme escolar', codigo: 'MAT-UNI', montoCentavos: 150000, fechaVencimiento: '2026-08-25', conFactura: true });
    await registrarPago(tx, mateoUni.documentoId!, 150000, '2026-08-20', 'tarjeta', 'MAT-UNI-001');

    // Valentina: pendientes y uniforme sin factura para validar “Crear factura”.
    await crearFacturaMensual(tx, valentina, '2026-08-15', 'VAL-AGO');
    await crearFacturaMensual(tx, valentina, '2026-09-15', 'VAL-SEP');
    await crearOtroCargo(tx, { fixture: valentina, concepto: 'Inscripción', codigo: 'VAL-INS', montoCentavos: 100000, fechaVencimiento: '2026-08-15', conFactura: true });
    const uniformeSinFactura = await crearOtroCargo(tx, { fixture: valentina, concepto: 'Uniforme escolar', codigo: 'VAL-UNI', montoCentavos: 150000, fechaVencimiento: '2026-08-25', conFactura: false });

    await tx`
      UPDATE facturas_recurrentes fr
      SET facturas_emitidas = docs.total, proxima_emision = docs.proxima, updated_at = now()
      FROM (
        SELECT origen_recurrente_id AS id, count(*)::int AS total,
               CASE count(*)
                 WHEN 2 THEN '2026-10-15'::date
                 WHEN 3 THEN '2026-11-15'::date
                 ELSE '2026-08-15'::date
               END AS proxima
        FROM ecf_documents
        WHERE team_id = ${TEAM_ID} AND origen_recurrente_id IS NOT NULL
        GROUP BY origen_recurrente_id
      ) docs
      WHERE fr.id = docs.id
    `;
    await sincronizarSaldos(tx);

    const resumen = await tx<{ estado: string; cantidad: number; total: number; saldo: number }[]>`
      SELECT estado, count(*)::int AS cantidad, SUM(monto_centavos)::int AS total, SUM(saldo_centavos)::int AS saldo
      FROM admin_escolar_cargos
      WHERE team_id = ${TEAM_ID}
      GROUP BY estado
      ORDER BY estado
    `;
    return { resumen, uniformeSinFactura: uniformeSinFactura.cargoId };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => sql.end());
