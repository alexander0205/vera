import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { construirPlan } from '@/lib/sigerd/plan-migracion';
import { cachearPorTag, tagEstructura, tagSigerd } from '@/lib/cache/escolar';

/**
 * Lo que el asistente de migración tiene delante: qué trajo SIGERD y qué de eso
 * ya está en las tablas del colegio.
 *
 * No toca el portal. Solo lee el snapshot ya descargado, así que responde en
 * milisegundos y se puede pedir tantas veces como haga falta mientras el
 * colegio marca y desmarca casillas.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  // Lee un JSONB de ~190 KB y lo cruza contra cinco tablas. La pantalla lo
  // pide en cada cambio de paso, así que se sirve de caché: lo invalida tanto
  // una descarga nueva de SIGERD como cualquier cruce, que es cuando de verdad
  // cambia lo que está y lo que falta.
  const plan = await cachearPorTag(
    () => construirPlan(auth.teamId),
    ['sigerd', 'plan', String(auth.teamId)],
    [tagSigerd(auth.teamId), tagEstructura(auth.teamId)],
  )();
  if (!plan) {
    // Sin descarga previa no hay nada que cruzar. Es un estado normal —el
    // colegio que nunca ha sincronizado— y no un error.
    return NextResponse.json({ hayDatos: false });
  }
  return NextResponse.json({ hayDatos: true, plan });
}
