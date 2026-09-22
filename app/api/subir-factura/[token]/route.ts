/**
 * Lo que usa el TELÉFONO de quien fotografía una factura de proveedor. No hay
 * sesión: el token del enlace es toda la autorización, así que aquí se es
 * desconfiado.
 *
 *   GET  /api/subir-factura/<token>  → a qué empresa va (solo su nombre)
 *   POST /api/subir-factura/<token>  → sube 1–4 fotos (o un PDF) de UNA factura
 *
 * Lo que entra queda «por revisar»: nada llega al 606 ni a la contabilidad sin
 * que alguien con permiso lo registre. La lectura (QR del e-CF / IA) corre
 * después de responder, para que el teléfono no espere.
 *
 * Códigos: 401 enlace inválido o cambiado, 410 la empresa ya no está activa,
 * 429 demasiadas subidas.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import { procesosVivos } from '@/lib/suscripcion/procesos';
import { resolverEnlace, marcarUso } from '@/lib/compras/captura/enlace';
import { guardarArchivo, sha256, ArchivoInvalidoError, MAX_ARCHIVOS } from '@/lib/compras/captura/archivos';
import { crearCaptura, capturaConArchivo, borrarCapturaFallida } from '@/lib/compras/captura/consultas';
import { procesarCaptura } from '@/lib/compras/captura/procesar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NO_VALIDO = 'Este enlace no es válido o la empresa lo cambió. Pídele el nuevo a quien te lo mandó.';

async function abrir(token: string) {
  const enlace = await resolverEnlace(token);
  if (!enlace) return { ok: false as const, response: NextResponse.json({ error: NO_VALIDO }, { status: 401 }) };
  if (!(await procesosVivos(enlace.teamId))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Este enlace ya no está activo.' }, { status: 410 }) };
  }
  return { ok: true as const, enlace };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await abrir((await params).token);
  if (!r.ok) return r.response;
  const [t] = await db.select({ comercial: teams.nombreComercial, razon: teams.razonSocial, name: teams.name })
    .from(teams).where(eq(teams.id, r.enlace.teamId)).limit(1);
  // Solo el nombre: el enlace se reenvía y esto lo puede pedir cualquiera que lo tenga.
  return NextResponse.json({ empresa: t?.comercial || t?.razon || t?.name || 'la empresa' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await abrir((await params).token);
  if (!r.ok) return r.response;
  const { enlace } = r;

  const porEnlace = await rateLimitDb(`captura-factura:${enlace.id}`, 30, 10 * 60_000);
  const porDia = await rateLimitDb(`captura-factura-dia:${enlace.teamId}`, 300, 24 * 60 * 60_000);
  if (!porEnlace.allowed || !porDia.allowed) {
    return NextResponse.json({ error: 'Se enviaron demasiadas facturas seguidas. Espera unos minutos.' }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'No llegó ninguna foto.' }, { status: 400 });
  const archivos = form.getAll('archivos').filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return NextResponse.json({ error: 'Toma o elige al menos una foto de la factura.' }, { status: 400 });
  if (archivos.length > MAX_ARCHIVOS) {
    return NextResponse.json({ error: `Una factura admite hasta ${MAX_ARCHIVOS} fotos.` }, { status: 400 });
  }
  const nombre = String(form.get('nombre') ?? '').trim().slice(0, 120) || null;
  const nota = String(form.get('nota') ?? '').trim().slice(0, 500) || null;

  const buffers = await Promise.all(archivos.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const repetida = await capturaConArchivo(enlace.teamId, sha256(buffers[0]));
  if (repetida) return NextResponse.json({ ok: true, id: repetida, repetida: true });

  const capturaId = await crearCaptura({ teamId: enlace.teamId, enlaceId: enlace.id, subidoPor: nombre, nota });
  try {
    for (const [i, buffer] of buffers.entries()) {
      await guardarArchivo({ teamId: enlace.teamId, capturaId, buffer, orden: i });
    }
  } catch (e) {
    await borrarCapturaFallida(enlace.teamId, capturaId).catch(() => {});
    if (e instanceof ArchivoInvalidoError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[subir-factura] guardar', e);
    return NextResponse.json({ error: 'No se pudo guardar la foto. Intenta otra vez.' }, { status: 500 });
  }

  await marcarUso(enlace.id);
  after(() => procesarCaptura(enlace.teamId, capturaId));
  return NextResponse.json({ ok: true, id: capturaId }, { status: 201 });
}
