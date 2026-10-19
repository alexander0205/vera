import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarMatriculas, adminEscolarPagos,
  ecfDocuments, facturasRecurrentes, pagosRecibidos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro } from '@/lib/administracion-escolar/plan-cobro';
import {
  planificarMensualidades, type CargoExistente, type CuotaObjetivo,
} from '@/lib/administracion-escolar/sincronizar-mensualidad';
import { calcularTotales } from '@/lib/ecf/types';

/**
 * Pone las mensualidades de ESTE alumno al día con su mensualidad vigente
 * (generación, monto propio o descuento). Es lo que dispara «Guardar» en
 * «Configuración mensual»: al fijar el precio, Cuentas por cobrar se llena sola,
 * sin ir mes por mes.
 *
 * Las cuotas salen del CALENDARIO del concepto, como en el devengo: cada cargo
 * nace atado a su cuota (`cuota_id`) y con su vencimiento (emisión + días para
 * pagar). Sin la cuota, la ficha enseñaba el cargo y además el «Previsto» del
 * mismo mes. Solo se toman las cuotas que caen en los meses del RECURRENTE: el
 * período puede empezar en agosto, mes sin colegiatura, y alinearse al
 * recurrente hace que lo que se ve sea lo que emitirá el cron.
 *
 * Qué pasa con los cargos que ya había (generación vieja, precio viejo) lo
 * decide `planificarMensualidades`: un mes ya facturado no se duplica, se avisa.
 *
 * El plan recurrente de Facturación congela el precio de su línea; si es de una
 * sola línea, se le pone el precio nuevo. Si no se puede (varias líneas), se
 * avisa: el cron seguiría emitiendo el precio viejo.
 *
 * Idempotente: volver a guardar no duplica. No emite facturas.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const matriculaId = parseInt(id);
  if (!Number.isInteger(matriculaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [mat] = await db
    .select({
      estudianteId:     adminEscolarMatriculas.estudianteId,
      periodoId:        adminEscolarMatriculas.periodoId,
      cursoId:          adminEscolarMatriculas.cursoId,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      becaTipo:         adminEscolarMatriculas.becaTipo,
      becaValor:        adminEscolarMatriculas.becaValor,
      conceptoId:       adminEscolarMatriculas.conceptoMensualidadId,
      frId:             adminEscolarMatriculas.facturaRecurrenteId,
    })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!mat) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  // Sin mensualidad recurrente configurada no hay calendario al que alinear: no
  // se inventa uno. Guardar el precio sigue valiendo; solo no se crea deuda.
  if (!mat.conceptoId || !mat.frId) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }
  const conceptoId = mat.conceptoId;
  // La generación de antes de este guardado, si se cambió: la manda el
  // formulario, porque el PATCH que la cambia ya la sobrescribió.
  const body = await req.json().catch(() => ({})) as { conceptoAnteriorId?: unknown };
  const anterior = Number(body.conceptoAnteriorId);
  const conceptosMirados = Number.isInteger(anterior) && anterior > 0 && anterior !== conceptoId
    ? [conceptoId, anterior] : [conceptoId];

  const [fr] = await db
    .select({
      fechaInicio: facturasRecurrentes.fechaInicio,
      fechaFin:    facturasRecurrentes.fechaFin,
      items:       facturasRecurrentes.items,
    })
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, mat.frId), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);
  if (!fr?.fechaInicio || !fr.fechaFin) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }

  // Meses del recurrente: de su fecha de inicio a su fecha de fin, inclusive.
  const [ai, mi] = fr.fechaInicio.split('-').map(Number);
  const [af, mf] = fr.fechaFin.split('-').map(Number);
  const desdeIdx = ai * 12 + (mi - 1);
  const hastaIdx = af * 12 + (mf - 1);
  if (!Number.isFinite(desdeIdx) || !Number.isFinite(hastaIdx) || hastaIdx < desdeIdx) {
    return NextResponse.json({ cargosCreados: 0, sinRecurrente: true });
  }
  const enRecurrente = (anio: number, mes: number) => {
    const idx = anio * 12 + (mes - 1);
    return idx >= desdeIdx && idx <= hastaIdx;
  };

  // El monto y las cuotas salen del plan de cobro: la misma cadena de precios
  // (monto propio, descuento, tarifa de su generación) y el mismo calendario
  // que el devengo y la ficha. Nunca se teclea.
  const ctx = await contextoDeSeccion(teamId, mat.periodoId, mat.cursoId, {
    tipo: mat.becaTipo, valor: mat.becaValor,
  }, mat.estudianteId, conceptoId);
  // Sin fecha de inscripción se toma el arranque del recurrente: es desde
  // cuándo se le está cobrando.
  const desde = String(mat.fechaInscripcion ?? fr.fechaInicio);
  const linea = ctx
    ? (await armarPlanDeCobro(teamId, ctx, desde)).find((l) => l.conceptoId === conceptoId)
    : undefined;
  if (!linea) {
    return NextResponse.json(
      { error: 'La mensualidad no tiene una tarifa que aplicar a este alumno.' },
      { status: 422 },
    );
  }

  const conCalendario = linea.cuotas.some((c) => c.cuotaId > 0);
  const objetivo: CuotaObjetivo[] = conCalendario
    ? linea.cuotas
        .filter((c) => c.cuotaId > 0 && !c.omitida && c.mes != null)
        .map((c) => ({
          cuotaId: c.cuotaId,
          mes: c.mes!,
          anio: Number(c.fechaEmision.slice(0, 4)),
          montoCentavos: c.montoCentavos,
          fechaVencimiento: c.fechaVencimiento,
        }))
        .filter((c) => enRecurrente(c.anio, c.mes))
    // Mensualidad sin calendario: un cargo suelto por mes del recurrente, como
    // antes. El devengo tampoco tiene cuota a la que atarlo.
    : Array.from({ length: hastaIdx - desdeIdx + 1 }, (_, i) => {
        const anio = Math.floor((desdeIdx + i) / 12);
        const mes = ((desdeIdx + i) % 12) + 1;
        return {
          cuotaId: 0, mes, anio,
          montoCentavos: linea.montoCentavos,
          fechaVencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`,
        };
      });

  const resultado = await db.transaction(async (tx) => {
    // El mismo candado que el devengo: los dos miran «qué existe» y luego
    // insertan, y correr a la vez crearía el mismo mes dos veces.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${teamId}, ${mat.periodoId})`);

    // Los cargos de esta mensualidad y, si se acaba de cambiar, los de la
    // generación anterior: el mes que ya se cobra con la vieja no debe nacer
    // otra vez con la nueva. Solo la anterior, no «toda mensualidad»: la sala
    // de tarea también es de tipo mensualidad y se cobra junto a la colegiatura.
    const filas = await tx
      .select({
        id:            adminEscolarCargos.id,
        conceptoId:    adminEscolarCargos.conceptoId,
        cuotaId:       adminEscolarCargos.cuotaId,
        mes:           adminEscolarCargos.mes,
        anio:          adminEscolarCargos.anio,
        montoCentavos: adminEscolarCargos.montoCentavos,
        saldoCentavos: adminEscolarCargos.saldoCentavos,
        estado:        adminEscolarCargos.estado,
        ecfDocumentId: adminEscolarCargos.ecfDocumentId,
        facturaCodigo: sql<string | null>`coalesce(${ecfDocuments.codigo}, ${ecfDocuments.encf})`,
        facturaAnulada: sql<boolean>`coalesce(${ecfDocuments.estado} = 'ANULADO', false)`,
        facturaEstado: ecfDocuments.estado,
        // Cobros en la factura: con alguno no se ofrece anularla.
        facturaConPagos: sql<boolean>`(${adminEscolarCargos.ecfDocumentId} is not null and (
          exists (select 1 from ${pagosRecibidos} where ${pagosRecibidos.ecfDocumentId} = ${adminEscolarCargos.ecfDocumentId})
          or coalesce(${ecfDocuments.pagoRecibido} = 'true' and ${ecfDocuments.pagoValorCts} > 0, false)))`,
        tienePagos:    sql<boolean>`exists (select 1 from ${adminEscolarPagos} where ${adminEscolarPagos.cargoId} = ${adminEscolarCargos.id})`,
      })
      .from(adminEscolarCargos)
      .leftJoin(ecfDocuments, eq(ecfDocuments.id, adminEscolarCargos.ecfDocumentId))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.matriculaId, matriculaId),
        ne(adminEscolarCargos.estado, 'anulado'),
        inArray(adminEscolarCargos.conceptoId, conceptosMirados),
      ));
    const existentes: CargoExistente[] = filas.map((f) => ({
      ...f,
      tienePagos: !!f.tienePagos,
      facturaAnulada: !!f.facturaAnulada,
      facturaConPagos: !!f.facturaConPagos,
    }));

    const plan = planificarMensualidades({ conceptoId, objetivo, existentes });

    if (plan.anular.length > 0) {
      await tx.update(adminEscolarCargos)
        .set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })
        .where(and(eq(adminEscolarCargos.teamId, teamId), inArray(adminEscolarCargos.id, plan.anular)));
    }
    for (const a of plan.actualizar) {
      await tx.update(adminEscolarCargos)
        .set({
          ...(a.cuotaId !== undefined ? { cuotaId: a.cuotaId, fechaVencimiento: a.fechaVencimiento ?? null } : {}),
          ...(a.montoCentavos !== undefined ? { montoCentavos: a.montoCentavos, saldoCentavos: a.montoCentavos } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(adminEscolarCargos.id, a.id), eq(adminEscolarCargos.teamId, teamId)));
    }
    /**
     * Una cuota que ya tiene un cargo ANULADO de esta mensualidad —la marca de
     * un mes bloqueado de antes, o uno anulado a mano— no admite otro: el
     * índice único es (matrícula, cuota) y cuenta los anulados. Ese cargo se
     * revive con el precio de ahora en vez de insertar uno nuevo, que chocaría
     * y se perdería sin ruido.
     */
    const cuotasACrear = plan.crear.map((c) => c.cuotaId).filter((id) => id > 0);
    const anuladosDeLaCuota = cuotasACrear.length === 0 ? [] : await tx
      .select({ id: adminEscolarCargos.id, cuotaId: adminEscolarCargos.cuotaId })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.matriculaId, matriculaId),
        eq(adminEscolarCargos.conceptoId, conceptoId),
        eq(adminEscolarCargos.estado, 'anulado'),
        isNull(adminEscolarCargos.ecfDocumentId),
        inArray(adminEscolarCargos.cuotaId, cuotasACrear),
      ));
    const revivibles = new Map(anuladosDeLaCuota.map((c) => [c.cuotaId!, c.id]));
    let creados = 0;
    for (const c of plan.crear) {
      const id = c.cuotaId > 0 ? revivibles.get(c.cuotaId) : undefined;
      if (id == null) continue;
      await tx.update(adminEscolarCargos)
        .set({
          estado: 'pendiente', montoCentavos: c.montoCentavos, saldoCentavos: c.montoCentavos,
          fechaVencimiento: c.fechaVencimiento, mes: c.mes, anio: c.anio, updatedAt: new Date(),
        })
        .where(and(eq(adminEscolarCargos.id, id), eq(adminEscolarCargos.teamId, teamId)));
      creados++;
    }
    const nuevos = plan.crear.filter((c) => !(c.cuotaId > 0 && revivibles.has(c.cuotaId)));
    if (nuevos.length > 0) {
      const ins = await tx.insert(adminEscolarCargos).values(nuevos.map((c) => ({
        teamId,
        estudianteId: mat.estudianteId,
        matriculaId,
        periodoId: mat.periodoId,
        conceptoId,
        cuotaId: c.cuotaId || null,
        mes: c.mes,
        anio: c.anio,
        montoCentavos: c.montoCentavos,
        saldoCentavos: c.montoCentavos,
        fechaVencimiento: c.fechaVencimiento,
        estado: 'pendiente',
      }))).onConflictDoNothing().returning({ id: adminEscolarCargos.id });
      creados += ins.length;
    }
    // La marca de los meses bloqueados: la cuota nueva, anulada. Si la cuota ya
    // tiene cualquier cargo, el índice único la deja como está.
    if (plan.marcar.length > 0) {
      await tx.insert(adminEscolarCargos).values(plan.marcar.map((c) => ({
        teamId,
        estudianteId: mat.estudianteId,
        matriculaId,
        periodoId: mat.periodoId,
        conceptoId,
        cuotaId: c.cuotaId,
        mes: c.mes,
        anio: c.anio,
        montoCentavos: c.montoCentavos,
        saldoCentavos: 0,
        fechaVencimiento: c.fechaVencimiento,
        estado: 'anulado',
      }))).onConflictDoNothing();
    }

    // El recurrente congela el precio de su línea; el cron solo lo vuelve a
    // calcular con un monto propio o descuento, no con la tarifa de una
    // generación. Se le pone aquí el de la mensualidad vigente.
    let recurrente: 'actualizado' | 'sin-cambio' | 'varias-lineas' = 'sin-cambio';
    let precioRecurrenteAnterior: number | null = null;
    try {
      const items = JSON.parse(fr.items || '[]');
      if (Array.isArray(items) && items.length > 1) {
        recurrente = 'varias-lineas';
      } else if (Array.isArray(items) && items.length === 1) {
        const anterior = Math.round(Number(items[0].precioUnitarioItem) * 100);
        if (anterior !== linea.montoCentavos) {
          precioRecurrenteAnterior = Number.isFinite(anterior) ? anterior : null;
          items[0] = { ...items[0], precioUnitarioItem: linea.montoCentavos / 100 };
          const total = Math.round(calcularTotales(items).montoTotal * 100);
          await tx.update(facturasRecurrentes)
            .set({
              items: JSON.stringify(items),
              ...(Number.isFinite(total) ? { totalEstimado: total } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(facturasRecurrentes.id, mat.frId!), eq(facturasRecurrentes.teamId, teamId)));
          recurrente = 'actualizado';
        }
      }
    } catch {
      // JSON roto en el plan: no se toca; el cron ya cae a su total estimado.
    }

    return { plan, creados, recurrente, precioRecurrenteAnterior };
  });

  return NextResponse.json({
    cargosCreados: resultado.creados,
    cargosAnulados: resultado.plan.anular.length,
    cargosActualizados: resultado.plan.actualizar.length,
    mesesBloqueados: resultado.plan.bloqueados,
    recurrente: resultado.recurrente,
    precioRecurrenteAnterior: resultado.precioRecurrenteAnterior,
    monto: linea.montoCentavos,
  });
}
