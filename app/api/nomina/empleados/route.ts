import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { esTipoCuentaBanco } from '@/lib/nomina/dispersion';
import { pesosACentavos } from '@/lib/nomina/montos';
import { esFechaYMD } from '@/lib/nomina/periodos';
import { esHorario } from '@/lib/nomina/jornada';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/** Solo dígitos; la cédula/RNC se guarda pelada. */
function cedulaLimpia(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}

function limpiar(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/** Entero ≥ 0 o null (para vacaciones/día). Vacío o inválido → null. */
function enteroOnull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
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

  // El hash del enlace de horas no sale del servidor: basta saber cuándo se creó.
  return NextResponse.json({ empleados: filas.map((f) => ({ ...f, horasTokenHash: undefined })) });
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
  // La corrida cuenta los días desde el ingreso: una fecha que no existe no se guarda.
  const fechaIngreso = limpiar(body.fechaIngreso);
  if (fechaIngreso !== null && !esFechaYMD(fechaIngreso)) {
    return NextResponse.json({ error: 'Fecha de ingreso inválida' }, { status: 400 });
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
      salarioBaseCents,
      frecuenciaPago:  limpiar(body.frecuenciaPago) ?? 'mensual',
      fechaIngreso,
      estado:          'activo',
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
      createdBy:       auth.user.id,
    })
    .returning();

  return NextResponse.json({ empleado: { ...fila, horasTokenHash: undefined } }, { status: 201 });
}
