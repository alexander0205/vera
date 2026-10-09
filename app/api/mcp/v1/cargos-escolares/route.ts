/**
 * GET /api/mcp/v1/cargos-escolares — solo lectura, autenticado por API key.
 *
 * Es la única ruta del MCP que mira hacia adelante. Las otras cuentan lo ya
 * facturado; un cargo con vencimiento futuro es dinero que todavía no se
 * cobró — responde «¿a quién le vence la mensualidad esta semana?» y «¿cuánto
 * voy a cobrar en octubre?», que es lo que pregunta un director de colegio.
 *
 * Devuelve `total` (suma de montos) y `saldo` (suma de lo que falta) sobre
 * TODOS los cargos del filtro, no sobre la página: sumar a mano del lado de
 * una AI es donde aparecen los números inventados.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarEstudiantes, adminEscolarConceptosPago } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_CARGO } from '@/lib/mcp/campos-cargos';
import { idValido, fechaValida } from '@/lib/mcp/ids';

/** `fecha_vencimiento` es `date`: drizzle la maneja como 'YYYY-MM-DD'. */
function fechaIso(valor: string | null): string | null {
  const d = fechaValida(valor);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Entero corto (mes 1-12, año). Fuera de rango no existe, no hace falta consultar. */
function enteroEntre(valor: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const estado = sp.get('estado');
  const estudianteId = sp.get('estudianteId');
  const mes = sp.get('mes');
  const anio = sp.get('anio');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const estudianteFiltro = estudianteId ? idValido(estudianteId) : null;
  if (estudianteId && estudianteFiltro === null) {
    return NextResponse.json({ error: 'estudianteId inválido' }, { status: 400 });
  }
  const mesFiltro = mes ? enteroEntre(mes, 1, 12) : null;
  if (mes && mesFiltro === null) {
    return NextResponse.json({ error: 'mes inválido (1-12)' }, { status: 400 });
  }
  const anioFiltro = anio ? enteroEntre(anio, 2000, 2100) : null;
  if (anio && anioFiltro === null) {
    return NextResponse.json({ error: 'anio inválido' }, { status: 400 });
  }
  const desdeFecha = fechaIso(desde);
  if (desde && desdeFecha === null) {
    return NextResponse.json({ error: 'desde inválido (usa YYYY-MM-DD)' }, { status: 400 });
  }
  const hastaFecha = fechaIso(hasta);
  if (hasta && hastaFecha === null) {
    return NextResponse.json({ error: 'hasta inválido (usa YYYY-MM-DD)' }, { status: 400 });
  }

  const condiciones = [eq(adminEscolarCargos.teamId, teamId)];
  if (estado) condiciones.push(eq(adminEscolarCargos.estado, estado));
  if (estudianteFiltro !== null) condiciones.push(eq(adminEscolarCargos.estudianteId, estudianteFiltro));
  if (mesFiltro !== null) condiciones.push(eq(adminEscolarCargos.mes, mesFiltro));
  if (anioFiltro !== null) condiciones.push(eq(adminEscolarCargos.anio, anioFiltro));
  // Los rangos van sobre el VENCIMIENTO, no sobre la creación: la pregunta es
  // cuándo hay que cobrarlo, no cuándo se registró.
  if (desdeFecha) condiciones.push(gte(adminEscolarCargos.fechaVencimiento, desdeFecha));
  if (hastaFecha) condiciones.push(lte(adminEscolarCargos.fechaVencimiento, hastaFecha));

  const donde = and(...condiciones);

  const [cargos, [totales]] = await Promise.all([
    db
      .select({
        ...CAMPOS_CARGO,
        // El id del alumno no le sirve a nadie: «el estudiante 412 debe
        // RD$8,500» no es una respuesta.
        estudianteNombre: sql<string>`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`,
        concepto: adminEscolarConceptosPago.nombre,
      })
      .from(adminEscolarCargos)
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
      .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
      .where(donde)
      .orderBy(adminEscolarCargos.fechaVencimiento, adminEscolarCargos.id)
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${adminEscolarCargos.montoCentavos}), 0)::int`,
        saldo: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(adminEscolarCargos)
      .where(donde),
  ]);

  return NextResponse.json({
    cargos,
    total: totales?.total ?? 0,
    saldo: totales?.saldo ?? 0,
    count: totales?.count ?? 0,
  });
}
