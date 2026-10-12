/**
 * Borra TODAS las matrículas del colegio y lo que cuelga de ellas.
 *
 * Va en dos fases —primero contar, luego borrar— porque `admin_escolar_cargos`
 * referencia la matrícula sin ON DELETE CASCADE: si hay cargos, el borrado
 * falla a medias. Ver antes lo que se lleva evita el susto.
 */
import { db } from '../lib/db/drizzle';
import { sql } from 'drizzle-orm';

const TEAM = 9;

async function contar(etiqueta: string, consulta: ReturnType<typeof sql>) {
  const r = await db.execute(consulta);
  const n = (r as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  console.log(`  ${etiqueta.padEnd(26)} ${n}`);
  return n;
}

async function main() {
  const borrar = process.argv[2] === '--borrar';

  console.log(borrar ? 'BORRANDO\n' : 'LO QUE SE BORRARÍA\n');
  await contar('matrículas', sql`SELECT COUNT(*)::int n FROM admin_escolar_matriculas WHERE team_id = ${TEAM}`);
  await contar('cargos', sql`SELECT COUNT(*)::int n FROM admin_escolar_cargos WHERE team_id = ${TEAM}`);
  await contar('pagos escolares', sql`SELECT COUNT(*)::int n FROM admin_escolar_pagos WHERE team_id = ${TEAM}`);
  await contar('documentos entregados', sql`SELECT COUNT(*)::int n FROM admin_escolar_documentos_entregados WHERE team_id = ${TEAM}`);
  await contar('enlaces de documentos', sql`SELECT COUNT(*)::int n FROM admin_escolar_documentos_enlaces WHERE team_id = ${TEAM}`);

  console.log('\nNO se toca: estudiantes, tutores, estructura, conceptos, tarifas, documentos requeridos.');

  if (!borrar) { console.log('\n(simulación — nada borrado)'); return; }

  // Orden obligado por las claves foráneas: lo que apunta a la matrícula
  // primero, la matrícula al final.
  await db.execute(sql`DELETE FROM admin_escolar_pagos WHERE team_id = ${TEAM}`);
  await db.execute(sql`DELETE FROM admin_escolar_cargos WHERE team_id = ${TEAM}`);
  await db.execute(sql`DELETE FROM admin_escolar_matriculas WHERE team_id = ${TEAM}`);

  console.log('\nDESPUÉS:');
  await contar('matrículas', sql`SELECT COUNT(*)::int n FROM admin_escolar_matriculas WHERE team_id = ${TEAM}`);
  await contar('cargos', sql`SELECT COUNT(*)::int n FROM admin_escolar_cargos WHERE team_id = ${TEAM}`);
  await contar('estudiantes (intactos)', sql`SELECT COUNT(*)::int n FROM admin_escolar_estudiantes WHERE team_id = ${TEAM}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
