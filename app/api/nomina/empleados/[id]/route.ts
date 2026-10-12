import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { esTipoCuentaBanco } from '@/lib/nomina/dispersion';
import { pesosACentavos } from '@/lib/nomina/montos';
import { esFechaYMD } from '@/lib/nomina/periodos';
import { esHorario } from '@/lib/nomina/jornada';
import { hoyRD } from '@/lib/utils/format';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function cedulaLimpia(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}
function limpiar(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}
function enteroOnull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** GET /api/nomina/empleados/[id] — trae un empleado del team (para su ficha/edición). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [fila] = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .limit(1);

  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  return NextResponse.json({ empleado: { ...fila, horasTokenHash: undefined } });
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
  // Cuenta sin tipo = línea que el banco rechaza en el archivo de dispersión.
  if (limpiar(body.bancoCuenta) && !esTipoCuentaBanco(limpiar(body.bancoTipoCuenta))) {
    return NextResponse.json({ error: 'Elige el tipo de cuenta (ahorros o corriente)' }, { status: 400 });
  }
  // Un salario que no es un número se rechaza; antes «35,000» o «1000-» se
  // guardaban como RD$0 sin avisar y la corrida le pagaba cero a esa persona.
  const salarioTexto = String(body.salarioBase ?? '').trim();
  const salarioBaseCents = salarioTexto === '' ? 0 : pesosACentavos(salarioTexto);
  if (salarioBaseCents === null) {
    return NextResponse.json({ error: 'Salario inválido: escribe solo el monto, por ejemplo 35,000.00' }, { status: 400 });
  }
  // Quien cobra por hora necesita su tarifa: sin ella la corrida no tiene con qué pagarle.
  const tarifaTexto = String(body.tarifaHora ?? '').trim();
  const tarifaHoraCents = tarifaTexto === '' ? null : pesosACentavos(tarifaTexto);
  if (tarifaHoraCents === null && tarifaTexto !== '') {
    return NextResponse.json({ error: 'Tarifa por hora inválida: escribe solo el monto, por ejemplo 250.00' }, { status: 400 });
  }
  if (limpiar(body.jornada) === 'por_horas' && !tarifaHoraCents) {
    return NextResponse.json({ error: 'Escribe la tarifa por hora de quien cobra por horas' }, { status: 400 });
  }
  // La corrida paga los días entre el ingreso y la salida: las dos tienen que ser
  // fechas reales y la salida no puede ir antes del ingreso.
  const fechaIngreso = limpiar(body.fechaIngreso);
  const fechaSalida = limpiar(body.fechaSalida);
  if (fechaIngreso !== null && !esFechaYMD(fechaIngreso)) {
    return NextResponse.json({ error: 'Fecha de ingreso inválida' }, { status: 400 });
  }
  if (fechaSalida !== null && !esFechaYMD(fechaSalida)) {
    return NextResponse.json({ error: 'Fecha de salida inválida' }, { status: 400 });
  }
  if (fechaIngreso !== null && fechaSalida !== null && fechaSalida < fechaIngreso) {
    return NextResponse.json({ error: 'La salida no puede ser antes del ingreso' }, { status: 400 });
  }

  const [fila] = await db
    .update(empleados)
    .set({
      cedula:          cedulaLimpia(body.cedula),
      nombres,
      apellidos,
      cargo:           limpiar(body.cargo),
      tipoContrato:    limpiar(body.tipoContrato) ?? 'indefinido',
      salarioBaseCents,
      frecuenciaPago:  limpiar(body.frecuenciaPago) ?? 'mensual',
      fechaIngreso,
      fechaSalida,
      estado:          limpiar(body.estado) ?? 'activo',
      afp:             limpiar(body.afp),
      ars:             limpiar(body.ars),
      bancoNombre:     limpiar(body.bancoNombre),
      bancoCuenta:     limpiar(body.bancoCuenta),
      bancoTipoCuenta: limpiar(body.bancoTipoCuenta),
      sexo:            limpiar(body.sexo),
      fechaNacimiento: limpiar(body.fechaNacimiento),
      nacionalidad:    limpiar(body.nacionalidad),
      estadoCivil:     limpiar(body.estadoCivil),
      direccion:       limpiar(body.direccion),
      pais:            limpiar(body.pais),
      telefono:        limpiar(body.telefono),
      email:           limpiar(body.email),
      notas:           limpiar(body.notas),
      jornada:         limpiar(body.jornada),
      turno:           limpiar(body.turno),
      vacacionesDias:  enteroOnull(body.vacacionesDias),
      diasLibres:      limpiar(body.diasLibres),
      horarioSemanal:  esHorario(body.horarioSemanal) ? body.horarioSemanal : null,
      tarifaHoraCents,
      dispensaSalarioMinimo: body.dispensaSalarioMinimo === true,
      fechaFinContrato: limpiar(body.fechaFinContrato),
      objetoContrato:  limpiar(body.objetoContrato),
      updatedAt:       new Date(),
    })
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .returning();

  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  return NextResponse.json({ empleado: { ...fila, horasTokenHash: undefined } });
}

/**
 * DELETE /api/nomina/empleados/[id]?fechaSalida=YYYY-MM-DD — baja lógica
 * (estado='inactivo'), no borrado físico: un empleado que ya entró en una corrida
 * conserva su historia. La fecha es su último día trabajado (hoy si no llega): la
 * corrida de ese período le paga hasta ese día y las siguientes ya no lo incluyen.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const fechaSalida = new URL(req.url).searchParams.get('fechaSalida')?.trim() || hoyRD();
  if (!esFechaYMD(fechaSalida)) return NextResponse.json({ error: 'Fecha de salida inválida' }, { status: 400 });

  const [actual] = await db
    .select({ fechaIngreso: empleados.fechaIngreso })
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  if (actual.fechaIngreso && fechaSalida < actual.fechaIngreso) {
    return NextResponse.json({ error: 'La salida no puede ser antes del ingreso' }, { status: 400 });
  }

  const [fila] = await db
    .update(empleados)
    .set({ estado: 'inactivo', fechaSalida, updatedAt: new Date() })
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .returning();

  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  return NextResponse.json({ empleado: { ...fila, horasTokenHash: undefined } });
}
