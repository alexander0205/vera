/**
 * POST /api/nomina/empleados/[id]/contratos/subir
 *
 * Sube un contrato propio YA FIRMADO (camino offline). Multipart: `archivo`
 * (PDF/imagen) y `titulo` opcional. Crea la fila del contrato en estado
 * 'firmado' con `origen='subido'` y el binario archivado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';
import { subirContratoFirmado } from '@/lib/nomina/contratos-subidos';
import { ArchivoInvalidoError } from '@/lib/administracion-escolar/documentos-archivo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const empleadoId = Number((await params).id);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [empleado] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, auth.teamId)))
    .limit(1);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }
  const titulo = String(form?.get('titulo') ?? '').trim() || 'Contrato firmado';

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const contrato = await subirContratoFirmado({
      teamId: auth.teamId,
      empleadoId,
      titulo,
      buffer,
      nombreOriginal: archivo.name,
      userId: auth.user.id,
    });
    return NextResponse.json({ contrato }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchivoInvalidoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(`[POST /api/nomina/empleados/${empleadoId}/contratos/subir]`, e);
    return NextResponse.json({ error: 'No se pudo subir el contrato' }, { status: 500 });
  }
}
