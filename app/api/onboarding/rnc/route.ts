/**
 * GET /api/onboarding/rnc?rnc=131793916
 *
 * El momento en que el sistema deja de preguntar y empieza a saber.
 *
 * Con once dígitos devuelve quién es la empresa, a qué se dedica, qué línea de
 * producto le pega y —lo que nadie más le va a decir— si la DGII la tiene
 * activa. Ese último dato decide si va a poder emitir un solo comprobante, y
 * hoy se descubre semanas después, cuando el primero rebota.
 *
 * Distinto de /api/rnc/search, que busca contribuyentes para facturarles. Aquí
 * se busca UNA empresa, la propia, y se devuelve ya interpretada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { rncPadron } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { rateLimit } from '@/lib/rate-limit';
import { lineaPorActividad, estadoFiscal } from '@/lib/onboarding/deducir';

export async function GET(req: NextRequest) {
  // Con sesión: esto lo usa quien ya se registró y está en su onboarding. Sin
  // el guard, el padrón entero quedaría expuesto a cualquiera con la URL.
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (!rateLimit(`onboarding-rnc:${user.id}`, 30, 60_000).allowed) {
    return NextResponse.json({ error: 'Demasiadas búsquedas. Espera un momento.' }, { status: 429 });
  }

  // Solo dígitos: el RNC del propio usuario se teclea, no se busca por nombre.
  // Aceptar texto aquí convertiría esto en un buscador del padrón completo.
  const rnc = (req.nextUrl.searchParams.get('rnc') ?? '').replace(/\D/g, '');
  if (rnc.length < 9 || rnc.length > 11) {
    return NextResponse.json({ error: 'El RNC debe tener 9 u 11 dígitos' }, { status: 400 });
  }

  const [fila] = await db.select().from(rncPadron).where(eq(rncPadron.rnc, rnc)).limit(1);

  if (!fila) {
    // No aparecer en el padrón NO es un error del usuario: las empresas recién
    // constituidas tardan en entrar, y una de nuestras once ya está en ese
    // caso. La pantalla ofrece escribirlo a mano.
    return NextResponse.json({ encontrado: false, rnc });
  }

  const fiscal = estadoFiscal(fila.estado);

  return NextResponse.json({
    encontrado: true,
    rnc: fila.rnc,
    razonSocial: fila.nombre,
    nombreComercial: fila.nombreComercial,
    actividad: fila.actividad,
    linea: lineaPorActividad(fila.actividad),
    fiscal,
  });
}
