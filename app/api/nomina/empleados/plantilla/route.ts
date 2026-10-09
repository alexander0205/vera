import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleadoConceptos, empleados, nominaConceptos } from '@/lib/db/schema';
import { construirLibroEmpleados } from '@/lib/nomina/empleados-excel-libro';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/empleados/plantilla — la plantilla de importación con los
 * empleados activos que ya hay (para corregirlos o completarlos) y filas libres
 * para agregar. Trae salarios y cuentas bancarias: permiso `empleados:gestionar`.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.teamId, auth.teamId), eq(empleados.estado, 'activo')));

  const incentivos = await db
    .select({ empleadoId: empleadoConceptos.empleadoId, montoCents: empleadoConceptos.montoCents })
    .from(empleadoConceptos)
    .innerJoin(nominaConceptos, eq(nominaConceptos.id, empleadoConceptos.conceptoId))
    .where(and(
      eq(empleadoConceptos.teamId, auth.teamId),
      eq(empleadoConceptos.activo, true),
      eq(empleadoConceptos.fijo, true),
      eq(nominaConceptos.codigo, 'incentivo'),
    ));
  const incentivoDe = new Map(incentivos.map((i) => [i.empleadoId, i.montoCents]));

  const libro = construirLibroEmpleados(filas.map((e) => ({
    cedula: e.cedula, nombres: e.nombres, apellidos: e.apellidos, cargo: e.cargo,
    salarioBaseCents: e.salarioBaseCents, frecuenciaPago: e.frecuenciaPago, fechaIngreso: e.fechaIngreso,
    bancoNombre: e.bancoNombre, bancoCuenta: e.bancoCuenta, bancoTipoCuenta: e.bancoTipoCuenta,
    afp: e.afp, ars: e.ars, vacacionesDias: e.vacacionesDias,
    incentivoCents: incentivoDe.get(e.id) ?? null, telefono: e.telefono, email: e.email,
  })));

  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="empleados-zero.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
