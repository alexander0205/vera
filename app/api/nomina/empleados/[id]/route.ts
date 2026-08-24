import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function cedulaLimpia(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}
function pesosACents(v: unknown): number {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function limpiar(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/** PATCH /api/nomina/empleados/[id] — edita un empleado del team. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const nombres = limpiar(body.nombres);
  const apellidos = limpiar(body.apellidos);
  if (!nombres || !apellidos) {
    return NextResponse.json({ error: 'Nombres y apellidos son obligatorios' }, { status: 400 });
  }

  const [fila] = await db
    .update(empleados)
    .set({
      cedula:          cedulaLimpia(body.cedula),
      nombres,
      apellidos,
      cargo:           limpiar(body.cargo),
      tipoContrato:    limpiar(body.tipoContrato) ?? 'indefinido',
      salarioBaseCents: pesosACents(body.salarioBase),
      frecuenciaPago:  limpiar(body.frecuenciaPago) ?? 'mensual',
      fechaIngreso:    limpiar(body.fechaIngreso),
      fechaSalida:     limpiar(body.fechaSalida),
      estado:          limpiar(body.estado) ?? 'activo',
      afp:             limpiar(body.afp),
      ars:             limpiar(body.ars),
      bancoNombre:     limpiar(body.bancoNombre),
      bancoCuenta:     limpiar(body.bancoCuenta),
      bancoTipoCuenta: limpiar(body.bancoTipoCuenta),
      sexo:            limpiar(body.sexo),
      fechaNacimiento: limpiar(body.fechaNacimiento),
      nacionalidad:    limpiar(body.nacionalidad),
      telefono:        limpiar(body.telefono),
      email:           limpiar(body.email),
      notas:           limpiar(body.notas),
      updatedAt:       new Date(),
    })
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .returning();

  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  return NextResponse.json({ empleado: fila });
}

/**
 * DELETE /api/nomina/empleados/[id] — baja lógica (estado='inactivo'), no
 * borrado físico: un empleado que ya entró en una corrida conserva su historia.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [fila] = await db
    .update(empleados)
    .set({ estado: 'inactivo', updatedAt: new Date() })
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .returning();

  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  return NextResponse.json({ empleado: fila });
}
