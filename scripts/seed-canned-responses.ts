import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

const SEED_DATA: { label: string; category: string; content: string }[] = [
  { label: 'Saludo inicial', category: 'saludo', content: '¡Hola! Gracias por escribirnos. Mi nombre es {agente} y voy a ayudarte con tu consulta.' },
  { label: 'Presentación', category: 'saludo', content: 'Hola, soy {agente} de soporte. ¿En qué puedo ayudarte hoy?' },
  { label: 'Revisando el caso', category: 'espera', content: 'Estoy revisando tu caso, {cliente}. Dame un momento por favor.' },
  { label: 'Sigo trabajando en esto', category: 'espera', content: 'Gracias por tu paciencia, {cliente}. Sigo trabajando en esto y te aviso apenas tenga novedades.' },
  { label: 'Necesito más tiempo', category: 'espera', content: 'Voy a necesitar unos minutos más para confirmar esto. Ya vuelvo.' },
  { label: 'Confirmar resolución', category: 'cierre', content: '¿Pudimos resolver tu consulta? Si necesitás algo más, no dudes en escribirnos de nuevo.' },
  { label: 'Cierre del ticket', category: 'cierre', content: 'Perfecto, {cliente}. Cierro el ticket por ahora. Cualquier cosa, escribinos de nuevo cuando quieras.' },
  { label: 'Despedida', category: 'cierre', content: 'Gracias por contactarte con nosotros. ¡Que tengas un buen día!' },
  { label: 'Pedir código de factura', category: 'general', content: '¿Podrías darme el código o eNCF de la factura para revisarlo?' },
  { label: 'Derivar consulta', category: 'general', content: 'Eso está fuera de lo que podemos resolver por este chat — te voy a derivar con el equipo correspondiente.' },
];

(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const [admin] = await sql`SELECT id FROM users WHERE platform_role = 'admin' LIMIT 1`;
  let createdBy: number | null = null;
  if (admin?.id) {
    createdBy = admin.id;
    console.log(`✓ Usando admin id=${createdBy} como created_by.`);
  } else {
    console.warn('⚠ No se encontró ningún usuario con platform_role=admin. Se insertará con created_by = NULL.');
  }

  for (const row of SEED_DATA) {
    await sql`
      INSERT INTO canned_responses (label, category, content, created_by)
      VALUES (${row.label}, ${row.category}, ${row.content}, ${createdBy})
    `;
  }
  console.log(`✓ ${SEED_DATA.length} respuestas predeterminadas insertadas.`);

  const rows = await sql`
    SELECT id, label, category, created_by FROM canned_responses ORDER BY id`;
  console.table(rows);

  await sql.end();
})();
