import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/** Solo dígitos; la cédula/RNC se guarda pelada. */
function cedulaLimpia(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}

/** Pesos (string/number del form) → centavos enteros. Nunca negativo. */
function pesosACents(v: unknown): number {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function limpiar(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/** GET /api/nomina/empleados — lista los empleados del team. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select()
    .from(empleados)
    .where(eq(empleados.teamId, auth.teamId))
    .orderBy(desc(empleados.estado), desc(empleados.id));

  return NextResponse.json({ empleados: filas });
}

/** POST /api/nomina/empleados — crea un empleado. */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const nombres = limpiar(body.nombres);
  const apellidos = limpiar(body.apellidos);
  if (!nombres || !apellidos) {
    return NextResponse.json({ error: 'Nombres y apellidos son obligatorios' }, { status: 400 });
  }

  const [fila] = await db
    .insert(empleados)
    .values({
      teamId:          auth.teamId,
      cedula:          cedulaLimpia(body.cedula),
      nombres,
      apellidos,
      cargo:           limpiar(body.cargo),
      tipoContrato:    limpiar(body.tipoContrato) ?? 'indefinido',
      salarioBaseCents: pesosACents(body.salarioBase),
      frecuenciaPago:  limpiar(body.frecuenciaPago) ?? 'mensual',
      fechaIngreso:    limpiar(body.fechaIngreso),
      estado:          'activo',
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
      createdBy:       auth.user.id,
    })
    .returning();

  return NextResponse.json({ empleado: fila }, { status: 201 });
}
