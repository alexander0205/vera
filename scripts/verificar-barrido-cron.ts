/**
 * scripts/verificar-barrido-cron.ts — Verifica el barrido del cron (niveles 2.1
 * y 2.2) contra la DB real, sin pasar por HTTP.
 *
 * Ejercita lo que el test unitario NO puede: las dos queries de selección de
 * teams (contabilidad activa / promesas pendientes) contra el schema real y la
 * orquestación completa. En una DB donde el team 9 ya está 100% asentado, el
 * resultado esperado es idempotente: encuentra el team, drena a creados=0 y no
 * duplica nada.
 *
 *   npx tsx scripts/verificar-barrido-cron.ts
 *
 * Escribe: puede marcar promesas vencidas (cumplida/incumplida) y, si hubiera
 * documentos sin asentar en un team activo, generar sus asientos. Confirmar la
 * DB antes de correr (protocolo Neon).
 */

import { ejecutarBarridoContabilidad } from '@/lib/contabilidad/barrido-cron';

async function main() {
  const t0 = Date.now();
  const r = await ejecutarBarridoContabilidad();
  const ms = Date.now() - t0;

  console.log('\n=== Barrido de contabilidad (cron) ===');
  console.log(`Duración: ${ms} ms\n`);

  console.log('ASIENTOS');
  console.log(`  teams procesados: ${r.asientos.teamsProcesados}`);
  console.log(`  asientos creados: ${r.asientos.creados}`);
  console.log(`  truncado por tiempo: ${r.asientos.truncadoPorTiempo}`);
  for (const t of r.asientos.porTeam) {
    console.log(
      `    team ${t.teamId}: creados=${t.creados} saltados=${t.saltados} ` +
      `pasadas=${t.pasadas} tope=${t.truncadoPorTope} tiempo=${t.truncadoPorTiempo} ` +
      `motivos=${JSON.stringify(t.motivos)}`,
    );
  }

  console.log('\nPROMESAS');
  console.log(`  teams procesados: ${r.promesas.teamsProcesados}`);
  console.log(`  cumplidas:   ${r.promesas.cumplidas}`);
  console.log(`  incumplidas: ${r.promesas.incumplidas}`);

  console.log('\nERRORES');
  if (r.errores.length === 0) console.log('  ninguno');
  else for (const e of r.errores) console.log(`  [${e.fase}] team ${e.teamId}: ${e.error}`);

  console.log('');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
