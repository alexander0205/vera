/**
 * GET  /api/nomina/empleados/[id]/documentos — lista los documentos del empleado
 * POST /api/nomina/empleados/[id]/documentos — sube uno (multipart: `archivo`, `tipo`)
 *
 * Los binarios se sirven por [docId], nunca con presigned URL de S3.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';
import {
  listarDocumentos, agregarDocumento, TIPOS_DOCUMENTO,
  ArchivoInvalidoError, DemasiadosArchivosError,
} from '@/lib/nomina/documentos-empleado';

export const dynamic = 'force-dynamic';

/** El empleado pertenece a la empresa activa. */
async function empleadoDelTeam(teamId: number, empleadoId: number): Promise<boolean> {
  const [fila] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, teamId)))
    .limit(1);
  return !!fila;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const empleadoId = Number((await params).id);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  if (!(await empleadoDelTeam(auth.teamId, empleadoId))) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  }

  const documentos = await listarDocumentos(auth.teamId, empleadoId);
  return NextResponse.json({ documentos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const empleadoId = Number((await params).id);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  if (!(await empleadoDelTeam(auth.teamId, empleadoId))) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }
  const tipoRaw = String(form?.get('tipo') ?? 'antecedentes');
  const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(tipoRaw) ? tipoRaw : 'otro';

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const documento = await agregarDocumento({
      teamId: auth.teamId,
      empleadoId,
      tipo,
      buffer,
      nombreOriginal: archivo.name,
      subidoPor: auth.user.id,
    });
    return NextResponse.json({ documento }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchivoInvalidoError || e instanceof DemasiadosArchivosError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(`[POST /api/nomina/empleados/${empleadoId}/documentos]`, e);
    return NextResponse.json({ error: 'No se pudo subir el documento' }, { status: 500 });
  }
}
