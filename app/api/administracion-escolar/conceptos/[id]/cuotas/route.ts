import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarConceptoCuotas, adminEscolarConceptosPago,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { vencimientoDe } from '@/lib/administracion-escolar/calendario';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

/**
 * El calendario de cuotas de un concepto para un año escolar.
 *
 * Vive aparte del concepto porque es del PAR concepto+período: la colegiatura
 * de 2026-2027 puede repartirse en once mensualidades y la de 2027-2028 en
 * cuatro trimestres sin duplicar el concepto ni perder el histórico.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El período pedido, o el activo del colegio si no viene ninguno. */
async function resolverPeriodo(teamId: number, pedido: number | null) {
  const [row] = await db.select({
    id: adminEscolarPeriodos.id,
    nombre: adminEscolarPeriodos.nombre,
    fechaInicio: adminEscolarPeriodos.fechaInicio,
    fechaFin: adminEscolarPeriodos.fechaFin,
  })
    .from(adminEscolarPeriodos)
    .where(and(
      eq(adminEscolarPeriodos.teamId, teamId),
      pedido ? eq(adminEscolarPeriodos.id, pedido) : eq(adminEscolarPeriodos.activo, true),
    ))
    .limit(1);
  return row ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const conceptoId = parseInt((await params).id, 10);
  if (!Number.isInteger(conceptoId) || conceptoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const pedido = Number(req.nextUrl.searchParams.get('periodoId')) || null;
  const [concepto, periodo] = await Promise.all([
    db.select({ diasParaPago: adminEscolarConceptosPago.diasParaPago })
      .from(adminEscolarConceptosPago)
      .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
      .limit(1)
      .then((r) => r[0] ?? null),
    resolverPeriodo(teamId, pedido),
  ]);
  if (!concepto) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });
  if (!periodo) return NextResponse.json({ periodo: null, cuotas: [] });

  const cuotas = await db.select()
    .from(adminEscolarConceptoCuotas)
    .where(and(
      eq(adminEscolarConceptoCuotas.teamId, teamId),
      eq(adminEscolarConceptoCuotas.conceptoId, conceptoId),
      eq(adminEscolarConceptoCuotas.periodoId, periodo.id),
    ))
    .orderBy(asc(adminEscolarConceptoCuotas.numero));

  // Cuántos alumnos tienen ya un cargo de cada cuota. Es lo que decide si la
  // fila se puede tocar: una cuota facturada no se reescribe.
  const conCargos = cuotas.length === 0 ? [] : await db
    .select({ cuotaId: adminEscolarCargos.cuotaId, cuantos: sql<number>`count(*)::int` })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.cuotaId, cuotas.map((c) => c.id)),
    ))
    .groupBy(adminEscolarCargos.cuotaId);
  const cargosPorCuota = new Map(conCargos.map((c) => [c.cuotaId, c.cuantos]));

  return NextResponse.json({
    periodo,
    cuotas: cuotas.map((c) => ({
      id: c.id,
      numero: c.numero,
      etiqueta: c.etiqueta,
      mes: c.mes,
      fechaEmision: String(c.fechaEmision),
      fechaVencimiento: vencimientoDe(String(c.fechaEmision), concepto.diasParaPago),
      porcentajeMilesimas: c.porcentajeMilesimas,
      activo: c.activo,
      cargos: cargosPorCuota.get(c.id) ?? 0,
    })),
  });
}

interface CuotaEntrante {
  id?: number | null;
  etiqueta?: unknown;
  mes?: unknown;
  fechaEmision?: unknown;
  porcentajeMilesimas?: unknown;
}

/**
 * Reemplaza el calendario entero de un concepto para un año escolar.
 *
 * Va de una pieza y no fila a fila porque el reparto tiene que sumar 100%: si
 * la pantalla guardara cuota por cuota, el calendario quedaría descuadrado
 * entre una llamada y la siguiente y cualquier matrícula hecha en ese hueco
 * cobraría de menos.
 *
 * El candado: una cuota que ya generó cargos NO se toca. Cambiar la frecuencia
 * a mitad de año, con facturas emitidas, dejaría cargos apuntando a una cuota
 * que ya dice otra fecha y otro monto — y la deuda del padre no se puede
 * reescribir por detrás. Lo que sí se deja es editar lo que todavía no se ha
 * facturado, que es donde de verdad hace falta corregir.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const conceptoId = parseInt((await params).id, 10);
  if (!Number.isInteger(conceptoId) || conceptoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await req.json();
  const periodo = await resolverPeriodo(teamId, Number(body.periodoId) || null);
  if (!periodo) return NextResponse.json({ error: 'No hay año escolar activo' }, { status: 400 });

  const [concepto] = await db.select({ id: adminEscolarConceptosPago.id })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
    .limit(1);
  if (!concepto) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const entrantes: CuotaEntrante[] = Array.isArray(body.cuotas) ? body.cuotas : [];
  if (entrantes.length === 0) {
    return NextResponse.json({ error: 'El calendario no puede quedar vacío' }, { status: 400 });
  }
  if (entrantes.length > 24) {
    return NextResponse.json({ error: 'Demasiadas cuotas para un año escolar' }, { status: 400 });
  }

  const existentes = await db.select()
    .from(adminEscolarConceptoCuotas)
    .where(and(
      eq(adminEscolarConceptoCuotas.teamId, teamId),
      eq(adminEscolarConceptoCuotas.conceptoId, conceptoId),
      eq(adminEscolarConceptoCuotas.periodoId, periodo.id),
    ));

  const conCargos = existentes.length === 0 ? [] : await db
    .select({ cuotaId: adminEscolarCargos.cuotaId })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.cuotaId, existentes.map((c) => c.id)),
    ))
    .groupBy(adminEscolarCargos.cuotaId);
  const facturadas = new Set(conCargos.map((c) => c.cuotaId));
  const porId = new Map(existentes.map((c) => [c.id, c]));

  const limpias = entrantes.map((c, i) => {
    const id = Number(c.id) || null;
    // Una cuota ya facturada se copia de la base y se ignora lo que mande el
    // cliente: su fecha y su parte son las que se le cobraron a un padre, y
    // eso no se corrige por detrás. Lo único que se le deja cambiar es el
    // número de orden, que solo ordena la lista.
    const viva = id ? porId.get(id) : null;
    if (viva && facturadas.has(viva.id)) {
      return {
        id: viva.id,
        numero: i + 1,
        etiqueta: viva.etiqueta,
        mes: viva.mes,
        fechaEmision: String(viva.fechaEmision),
        porcentajeMilesimas: viva.porcentajeMilesimas,
      };
    }
    const fecha = String(c.fechaEmision ?? '');
    const mes = Number(c.mes);
    const pct = Number(c.porcentajeMilesimas);
    return {
      id,
      numero: i + 1,
      etiqueta: String(c.etiqueta ?? '').trim().slice(0, 60) || `Cuota ${i + 1}`,
      mes: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null,
      fechaEmision: FECHA.test(fecha) ? fecha : null,
      porcentajeMilesimas: Number.isInteger(pct) && pct > 0 && pct <= 100_000 ? pct : null,
    };
  });
  if (limpias.some((c) => !c.fechaEmision || c.porcentajeMilesimas == null)) {
    return NextResponse.json({ error: 'Cada cuota necesita fecha de emisión y una parte del total' }, { status: 400 });
  }

  // El reparto tiene que sumar el año completo. Un 98% deja al colegio
  // cobrando de menos sin que nadie lo note hasta cerrar la cartera.
  const suma = limpias.reduce((a, c) => a + (c.porcentajeMilesimas ?? 0), 0);
  if (suma !== 100_000) {
    return NextResponse.json({
      error: `Las partes suman ${(suma / 1000).toFixed(2)}% y tienen que sumar 100%.`,
    }, { status: 400 });
  }

  // Las que ya se le cobraron a alguien tienen que seguir viniendo. Si el
  // cliente las dejó fuera, es que intentó regenerar el año entero.
  const conservadas = new Set(limpias.map((c) => c.id).filter(Boolean) as number[]);
  const perdidas = existentes.filter((c) => facturadas.has(c.id) && !conservadas.has(c.id));
  if (perdidas.length > 0) {
    return NextResponse.json({
      error: `Ya se facturaron cuotas de este concepto (${perdidas.map((c) => c.etiqueta).join(', ')}). `
        + 'Solo se pueden editar las que todavía no se han cobrado.',
      cuotasFacturadas: [...facturadas],
    }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    const sobran = existentes.filter((c) => !conservadas.has(c.id)).map((c) => c.id);
    if (sobran.length > 0) {
      await tx.delete(adminEscolarConceptoCuotas)
        .where(and(
          eq(adminEscolarConceptoCuotas.teamId, teamId),
          inArray(adminEscolarConceptoCuotas.id, sobran),
        ));
    }
    // Se renumera en dos pasadas porque `(concepto, período, número)` es único:
    // guardar en su sitio final chocaría con la fila que todavía ocupa ese
    // número. Los negativos son un espacio que nadie más usa.
    for (const c of limpias.filter((x) => x.id)) {
      await tx.update(adminEscolarConceptoCuotas)
        .set({ numero: -c.numero })
        .where(and(
          eq(adminEscolarConceptoCuotas.id, c.id!),
          eq(adminEscolarConceptoCuotas.teamId, teamId),
        ));
    }
    for (const c of limpias) {
      if (c.id) {
        await tx.update(adminEscolarConceptoCuotas)
          .set({
            numero: c.numero,
            etiqueta: c.etiqueta,
            mes: c.mes,
            fechaEmision: c.fechaEmision!,
            porcentajeMilesimas: c.porcentajeMilesimas!,
            updatedAt: new Date(),
          })
          .where(and(
            eq(adminEscolarConceptoCuotas.id, c.id),
            eq(adminEscolarConceptoCuotas.teamId, teamId),
          ));
      } else {
        await tx.insert(adminEscolarConceptoCuotas).values({
          teamId,
          conceptoId,
          periodoId: periodo.id,
          numero: c.numero,
          etiqueta: c.etiqueta,
          mes: c.mes,
          fechaEmision: c.fechaEmision!,
          porcentajeMilesimas: c.porcentajeMilesimas!,
        });
      }
    }
  });

  invalidarEstructura(teamId);
  return NextResponse.json({ ok: true, cuotas: limpias.length });
}
