/**
 * Borra todo lo que sembró scripts/seed-mora-demo.ts (facturas demo, sus notas
 * de crédito, sus notas de débito por mora, pagos y el cliente demo).
 * Identifica las filas por el prefijo "DEMOMORA" en el encf. No toca nada más.
 *
 * NO restaura la config de mora del team (queda en la config demo). Ajústala a
 * mano en Configuración → Recargo por mora si lo necesitas.
 *
 * Uso: SEED_TEAM=2 npx tsx scripts/limpiar-mora-demo.ts
 *  o:  SEED_TEAM_NAME="andres" npx tsx scripts/limpiar-mora-demo.ts
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
const CLIENTE = 'Cliente Demo Mora';

/** Resuelve el team: SEED_TEAM (id) > SEED_TEAM_NAME (ILIKE) > 2. */
async function resolverTeam(): Promise<{ id: number; nombre: string }> {
  if (process.env.SEED_TEAM) {
    const id = Number(process.env.SEED_TEAM);
    const [t] = await sql`SELECT id, name FROM teams WHERE id = ${id} LIMIT 1`;
    if (!t) throw new Error(`No existe el team id ${id}.`);
    return { id: t.id as number, nombre: t.name as string };
  }
  if (process.env.SEED_TEAM_NAME) {
    const q = `%${process.env.SEED_TEAM_NAME}%`;
    const rows = await sql`SELECT id, name FROM teams WHERE name ILIKE ${q} ORDER BY id LIMIT 5`;
    if (rows.length === 0) throw new Error(`Ningún team coincide con "${process.env.SEED_TEAM_NAME}".`);
    if (rows.length > 1) {
      const lista = rows.map(r => `  #${r.id}  ${r.name}`).join('\n');
      throw new Error(`"${process.env.SEED_TEAM_NAME}" es ambiguo:\n${lista}\nUsa SEED_TEAM=<id> exacto.`);
    }
    return { id: rows[0].id as number, nombre: rows[0].name as string };
  }
  const [t] = await sql`SELECT id, name FROM teams WHERE id = 2 LIMIT 1`;
  if (!t) throw new Error('No existe el team id 2 (default). Pasa SEED_TEAM o SEED_TEAM_NAME.');
  return { id: t.id as number, nombre: t.name as string };
}

(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  const t = await resolverTeam();
  const TEAM = t.id;
  console.log(`\n→ Base de datos: ${host}`);
  console.log(`→ Team: #${TEAM} (${t.nombre})\n`);

  // Facturas y NCs demo (encf empieza con DEMOMORA).
  const demo = await sql`SELECT id FROM ecf_documents WHERE team_id = ${TEAM} AND encf LIKE 'DEMOMORA%'`;
  const baseIds = demo.map(r => r.id as number);

  // Notas de débito por mora atadas a esas facturas (su encf es BOR-33-…).
  const moras = baseIds.length
    ? await sql`SELECT id FROM ecf_documents WHERE mora_origen_id IN ${sql(baseIds)}`
    : [];
  const allIds = [...baseIds, ...moras.map(r => r.id as number)];

  if (allIds.length) {
    await sql`DELETE FROM pagos_recibidos WHERE ecf_document_id IN ${sql(allIds)}`;
    await sql`DELETE FROM ecf_documents WHERE id IN ${sql(allIds)}`;
  }

  // Cliente demo (si no le quedan facturas).
  const restantes = await sql`
    SELECT COUNT(*)::int AS n FROM ecf_documents e
    JOIN clients c ON c.id = e.client_id
    WHERE c.team_id = ${TEAM} AND c.razon_social = ${CLIENTE}`;
  if ((restantes[0]?.n ?? 0) === 0) {
    await sql`DELETE FROM clients WHERE team_id = ${TEAM} AND razon_social = ${CLIENTE}`;
  }

  console.log(`🧹 Borradas ${allIds.length} filas de ecf_documents (facturas + NCs + notas de mora) y sus pagos.`);
  console.log(`   Cliente demo eliminado si quedó sin facturas.\n`);

  await sql.end();
  process.exit(0);
})().catch(async (e) => {
  console.error('\n💥 ERROR:', e);
  await sql.end();
  process.exit(1);
});
