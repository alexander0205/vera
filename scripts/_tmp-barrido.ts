/**
 * TEMPORAL — barre asientos pendientes del team 9 hasta agotar.
 *   set -a; source .env.local; set +a; npx tsx scripts/_tmp-barrido.ts
 */
import { generarAsientosPendientes, contarPendientes } from '@/lib/contabilidad/libro-diario';

const TEAM = 9;
const USER = 4;

async function main() {
  console.log('contarPendientes() antes:', await contarPendientes(TEAM));

  let vuelta = 0;
  const acum: Record<string, number> = {};
  let creadosTotal = 0, saltadosTotal = 0;

  for (;;) {
    vuelta++;
    const r = await generarAsientosPendientes(TEAM, USER);
    creadosTotal += r.creados; saltadosTotal += r.saltados;
    for (const [k, v] of Object.entries(r.motivos)) acum[k] = (acum[k] ?? 0) + (v ?? 0);
    console.log(`vuelta ${vuelta}: creados=${r.creados} saltados=${r.saltados} hayMas=${r.hayMas}`, r.motivos);
    if (!r.hayMas || (r.creados === 0 && r.saltados === 0)) break;
    if (vuelta > 40) { console.log('CORTE por seguridad'); break; }
  }

  console.log('TOTAL creados:', creadosTotal, 'saltados:', saltadosTotal);
  console.log('motivos:', acum);
  console.log('contarPendientes() después:', await contarPendientes(TEAM));
  process.exit(0);
}

main().catch((e) => { console.error('FALLÓ EL BARRIDO:', e); process.exit(1); });
