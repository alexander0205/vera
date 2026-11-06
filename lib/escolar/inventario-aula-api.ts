/**
 * Lo común de las rutas de «Planta física» e «Inventario por aula»: traducir los
 * errores conocidos a su respuesta. Cualquier otro error se deja subir.
 */

import { NextResponse } from 'next/server';
import { ActivoFijoError } from '@/lib/contabilidad/depreciacion';
import { BajaActivoError } from '@/lib/contabilidad/activos-fijos';
import { PlantaError } from './inventario-aula-db';
import { TrasladoError } from './inventario-aula';

export function responderError(e: unknown): NextResponse {
  if (e instanceof PlantaError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof TrasladoError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ActivoFijoError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof BajaActivoError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/** El número de la ruta (`/…/12`), o null si no es un entero positivo. */
export async function idDeRuta(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Un entero positivo del cuerpo, o null. */
export function enteroPositivo(v: unknown): number | null {
  const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof x === 'number' && Number.isSafeInteger(x) && x > 0 ? x : null;
}
