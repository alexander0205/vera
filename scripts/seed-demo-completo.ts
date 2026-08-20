/**
 * Siembra un tenant DEMO con los tres módulos activos y datos de verdad.
 *
 *   npx tsx scripts/seed-demo-completo.ts
 *
 * Crea (o reutiliza) el colegio "Colegio Demo Zero" con:
 *   Facturación → contactos, productos/servicios y facturas en varios estados
 *   Punto de Venta → módulo activo (almacén y terminal se auto-provisionan)
 *   Escolar → período, cursos, conceptos, estudiantes, matrículas y cargos
 *             en los cuatro estados: pagado, parcial, vencido y pendiente
 *
 * Es idempotente: correrlo dos veces deja el mismo estado, no duplica.
 * Solo para desarrollo — aborta si la URL parece de producción.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { hashPassword } from '@/lib/auth/session';

dotenv.config({ path: '.env.local' });
dotenv.config();

const URL = process.env.POSTGRES_URL ?? '';
const esLocal = /localhost|127\.0\.0\.1/.test(URL);
if (!esLocal && !process.env.SEED_DEMO_FORZAR) {
  console.error('✗ POSTGRES_URL no apunta a una DB local. Esto siembra datos falsos: no se corre contra prod.');
  console.error('  Si de verdad lo quieres, exporta SEED_DEMO_FORZAR=1.');
  process.exit(1);
}

const EMAIL  = 'demo@zero.test';
const PASS   = 'Demo1234!';
const EMPRESA = 'Colegio Demo Zero';

const sql = postgres(URL, { ssl: esLocal ? false : 'require', max: 1 });

/** Fecha ISO desplazada en días desde hoy. */
const dia = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

(async () => {
  const passwordHash = await hashPassword(PASS);

  // ── Usuario y empresa ─────────────────────────────────────────────────────
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO users (email, password_hash, name)
    VALUES (${EMAIL}, ${passwordHash}, 'Demo Zero')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id`;

  let [team] = await sql<{ id: number }[]>`
    SELECT t.id FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ${user.id} AND t.name = ${EMPRESA} LIMIT 1`;

  if (!team) {
    [team] = await sql<{ id: number }[]>`
      INSERT INTO teams (name, rnc, modulos_habilitados, pos_habilitado)
      VALUES (${EMPRESA}, '131999888', ${sql.json(['facturacion', 'pos', 'escolar'])}, true)
      RETURNING id`;
    await sql`INSERT INTO team_members (user_id, team_id, role) VALUES (${user.id}, ${team.id}, 'owner')`;
  } else {
    await sql`
      UPDATE teams
      SET modulos_habilitados = ${sql.json(['facturacion', 'pos', 'escolar'])},
          modulos_override    = ${sql.json(['facturacion', 'pos', 'escolar'])},
          pos_habilitado = true, updated_at = now()
      WHERE id = ${team.id}`;
  }
  const T = team.id;

  // Permisos escolares para los roles que la app siembre en esta empresa.
  await sql`
    INSERT INTO team_role_permissions (team_role_id, permission)
    SELECT tr.id, p.permission
    FROM team_roles tr
    CROSS JOIN unnest(ARRAY[
      'administracion-escolar:ver','administracion-escolar:gestionar',
      'administracion-escolar:configurar','administracion-escolar:pagos',
      'modulo:escolar','modulo:pos','modulo:facturacion'
    ]::text[]) AS p(permission)
    WHERE tr.team_id = ${T} AND tr.key IN ('admin','user')
    ON CONFLICT DO NOTHING`;

  // ── Facturación: contactos y productos ────────────────────────────────────
  const TUTORES = [
    ['Familia Pérez Almonte',   '00113355771', 'perez@demo.test'],
    ['Familia Gómez Rosario',   '00224466882', 'gomez@demo.test'],
    ['Familia Santos Del Orbe', '00335577993', 'santos@demo.test'],
    ['Familia Reyes Vásquez',   '00446688114', 'reyes@demo.test'],
    ['Familia Núñez Batista',   '00557799225', 'nunez@demo.test'],
  ];
  const clientes: number[] = [];
  for (const [razon, rnc, email] of TUTORES) {
    const [c] = await sql<{ id: number }[]>`
      INSERT INTO clients (team_id, razon_social, rnc, email)
      VALUES (${T}, ${razon}, ${rnc}, ${email})
      ON CONFLICT DO NOTHING
      RETURNING id`;
    if (c) clientes.push(c.id);
    else {
      const [ya] = await sql<{ id: number }[]>`
        SELECT id FROM clients WHERE team_id = ${T} AND razon_social = ${razon} LIMIT 1`;
      clientes.push(ya.id);
    }
  }

  const PRODUCTOS: [string, number, string][] = [
    ['Mensualidad',        250000, 'servicio'],
    ['Inscripción anual',  500000, 'servicio'],
    ['Transporte escolar', 180000, 'servicio'],
    ['Uniforme deportivo', 120000, 'bien'],
    ['Libro de texto',      95000, 'bien'],
    ['Merienda mensual',    75000, 'servicio'],
  ];
  const productos: Record<string, number> = {};
  for (const [nombre, precio, tipo] of PRODUCTOS) {
    const [ya] = await sql<{ id: number }[]>`
      SELECT id FROM products WHERE team_id = ${T} AND nombre = ${nombre} LIMIT 1`;
    if (ya) { productos[nombre] = ya.id; continue; }
    const [p] = await sql<{ id: number }[]>`
      INSERT INTO products (team_id, nombre, precio, tipo, tasa_itbis, activo, visible_pos)
      VALUES (${T}, ${nombre}, ${precio}, ${tipo}, 'exento', 'true', ${tipo === 'bien'})
      RETURNING id`;
    productos[nombre] = p.id;
  }

  // ── Facturación: 10 facturas en varios estados ────────────────────────────
  await sql`DELETE FROM ecf_documents WHERE team_id = ${T} AND codigo LIKE 'DEMO-%'`;
  const facturas: { id: number; total: number }[] = [];
  for (let i = 1; i <= 10; i++) {
    const total = 250000 + (i % 3) * 50000;
    const [f] = await sql<{ id: number }[]>`
      INSERT INTO ecf_documents
        (team_id, client_id, codigo, encf, tipo_ecf, fecha_emision, fecha_limite_pago,
         razon_social_comprador, rnc_comprador, monto_total, total_itbis, estado, estado_pago, tipo_pago)
      VALUES (${T}, ${clientes[i % clientes.length]}, ${'DEMO-' + String(i).padStart(3, '0')},
              ${'DEMO' + String(i).padStart(3, '0')}, '31', ${dia(-30 + i * 2)}, ${dia(-5 + i * 3)},
              ${TUTORES[i % TUTORES.length][0]}, ${TUTORES[i % TUTORES.length][1]},
              ${total}, 0, 'SIN_NCF', 'PENDIENTE', 2)
      RETURNING id`;
    facturas.push({ id: f.id, total });
  }
  // Tres cobradas del todo y dos a medias, para que el tablero no salga en cero.
  for (const [idx, monto] of [[0, 1], [1, 1], [2, 1], [3, 0.5], [4, 0.4]] as [number, number][]) {
    const f = facturas[idx];
    const pagado = Math.round(f.total * monto);
    await sql`
      INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, fecha_pago, metodo, referencia)
      VALUES (${T}, ${f.id}, ${pagado}, ${dia(-3)}, 'transferencia', 'DEMO')`;
    await sql`
      UPDATE ecf_documents SET estado_pago = ${monto === 1 ? 'PAGADA' : 'PARCIAL'} WHERE id = ${f.id}`;
  }

  // ── Escolar: catálogo ─────────────────────────────────────────────────────
  const upsert = async (tabla: 'admin_escolar_periodos' | 'admin_escolar_cursos', nombre: string, extra = {}) => {
    const [ya] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(tabla)} WHERE team_id = ${T} AND nombre = ${nombre} LIMIT 1`;
    if (ya) return ya.id;
    const [n] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(tabla)} ${sql({ team_id: T, nombre, ...extra })} RETURNING id`;
    return n.id;
  };

  const periodoId = await upsert('admin_escolar_periodos', 'Año escolar 2026-2027', {
    fecha_inicio: '2026-08-01', fecha_fin: '2027-06-30', activo: true,
  });
  const cursoIds = [
    await upsert('admin_escolar_cursos', '1ro Primaria', { nivel: 'primaria', orden: 1 }),
    await upsert('admin_escolar_cursos', '2do Primaria', { nivel: 'primaria', orden: 2 }),
    await upsert('admin_escolar_cursos', '3ro Primaria', { nivel: 'primaria', orden: 3 }),
  ];

  const conceptos: Record<string, number> = {};
  for (const nombre of ['Mensualidad', 'Inscripción anual', 'Transporte escolar']) {
    const [ya] = await sql<{ id: number }[]>`
      SELECT id FROM admin_escolar_conceptos_pago WHERE team_id = ${T} AND nombre = ${nombre} LIMIT 1`;
    if (ya) { conceptos[nombre] = ya.id; continue; }
    const [c] = await sql<{ id: number }[]>`
      INSERT INTO admin_escolar_conceptos_pago (team_id, nombre, product_id, activo)
      VALUES (${T}, ${nombre}, ${productos[nombre]}, true) RETURNING id`;
    conceptos[nombre] = c.id;
  }

  // ── Escolar: estudiantes, tutores, matrículas y cargos ────────────────────
  const ESTUDIANTES = [
    ['Ana',    'Pérez Almonte',   'F', 0],
    ['Luis',   'Gómez Rosario',   'M', 1],
    ['María',  'Santos Del Orbe', 'F', 2],
    ['Carlos', 'Reyes Vásquez',   'M', 0],
    ['Sofía',  'Núñez Batista',   'F', 1],
    ['Diego',  'Pérez Almonte',   'M', 2],
    ['Valeria','Gómez Rosario',   'F', 0],
    ['Mateo',  'Santos Del Orbe', 'M', 1],
  ] as const;

  let creados = 0;
  for (const [idx, [nombres, apellidos, sexo, curso]] of ESTUDIANTES.entries()) {
    const [ya] = await sql<{ id: number }[]>`
      SELECT id FROM admin_escolar_estudiantes
      WHERE team_id = ${T} AND nombres = ${nombres} AND apellidos = ${apellidos} LIMIT 1`;
    if (ya) continue;

    const [est] = await sql<{ id: number }[]>`
      INSERT INTO admin_escolar_estudiantes (team_id, codigo, nombres, apellidos, sexo, estado)
      VALUES (${T}, ${`2026-${String(idx + 1).padStart(4, '0')}`}, ${nombres}, ${apellidos}, ${sexo}, 'activo')
      RETURNING id`;

    const clientId = clientes[idx % clientes.length];
    const [tutor] = await sql<{ id: number }[]>`
      INSERT INTO admin_escolar_tutores (team_id, nombre, client_id, telefono, email)
      VALUES (${T}, ${TUTORES[idx % TUTORES.length][0]}, ${clientId}, '809-555-0100',
              ${TUTORES[idx % TUTORES.length][2]})
      RETURNING id`;
    await sql`
      INSERT INTO admin_escolar_estudiante_tutores (team_id, estudiante_id, tutor_id, relacion, responsable_pago)
      VALUES (${T}, ${est.id}, ${tutor.id}, 'tutor', true)`;

    const [mat] = await sql<{ id: number }[]>`
      INSERT INTO admin_escolar_matriculas
        (team_id, estudiante_id, periodo_id, curso_id, codigo_matricula, fecha_inscripcion, estado)
      VALUES (${T}, ${est.id}, ${periodoId}, ${cursoIds[curso]},
              ${`M-2026-${String(idx + 1).padStart(3, '0')}`}, '2026-08-01', 'activa')
      RETURNING id`;

    // Cargos con los cuatro estados, para que las pantallas no salgan planas.
    const meses: [number, number, string][] = [
      [8,  250000, 'pagado'],
      [9,  250000, 'parcial'],
      [10, 250000, 'vencido'],
      [11, 250000, 'pendiente'],
    ];
    for (const [mes, monto, estado] of meses) {
      const saldo = estado === 'pagado' ? 0 : estado === 'parcial' ? Math.round(monto / 2) : monto;
      const venc = estado === 'vencido' ? dia(-15) : estado === 'pendiente' ? dia(20) : dia(-40 + mes);
      await sql`
        INSERT INTO admin_escolar_cargos
          (team_id, estudiante_id, matricula_id, periodo_id, concepto_id, mes, anio,
           monto_centavos, saldo_centavos, fecha_vencimiento, estado)
        VALUES (${T}, ${est.id}, ${mat.id}, ${periodoId}, ${conceptos['Mensualidad']},
                ${mes}, 2026, ${monto}, ${saldo}, ${venc}, ${estado})`;
    }
    creados += 1;
  }

  const [{ resumen }] = await sql<{ resumen: string }[]>`
    SELECT
      (SELECT count(*) FROM admin_escolar_estudiantes WHERE team_id = ${T})::text || ' estudiantes · ' ||
      (SELECT count(*) FROM admin_escolar_cargos      WHERE team_id = ${T})::text || ' cargos · ' ||
      (SELECT count(*) FROM ecf_documents             WHERE team_id = ${T})::text || ' facturas · ' ||
      (SELECT count(*) FROM clients                   WHERE team_id = ${T})::text || ' contactos · ' ||
      (SELECT count(*) FROM products                  WHERE team_id = ${T})::text || ' productos' AS resumen`;

  console.log(`\n✓ Tenant demo listo (team ${T}) — ${creados} estudiantes nuevos`);
  console.log(`  ${resumen}`);
  console.log(`\n  Entrar con:  ${EMAIL}  /  ${PASS}`);
  console.log('  Módulos: Facturación · Punto de Venta · Administración Escolar\n');

  await sql.end();
})();
