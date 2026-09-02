/**
 * GET /api/administracion-escolar/responsables/[id]/periodos
 *
 * Los meses de TODOS los hijos de una familia, con la misma cuenta que la
 * ficha de cada alumno: los cargos que ya existen y las cuotas del plan que
 * todavía no se han devengado.
 *
 * Existe porque el cobro no se hace por alumno, se hace por familia. El padre
 * de dos hijos llama una vez y pregunta por los dos; hasta ahora había que
 * abrir una ficha, apuntar, volver y abrir la otra —y facturarle junto era
 * imposible sin ir marcando cargos en dos pantallas distintas.
 *
 * Se apoya en `fichaEstudiante`, la misma que usa la ficha del alumno, para
 * que las dos pantallas no puedan decir cifras distintas del mismo mes. Eso
 * incluye la sincronización de saldos, que va por dentro.
 *
 * Va aparte de `/responsables/[id]` a propósito: es una consulta por hijo, y
 * la cabecera de la familia —deuda, canales, enlace de pago— tiene que pintar
 * sin esperar a esto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { fichaEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';
import { previstosDelPlan } from '@/lib/administracion-escolar/previstos';
import type { FilaMes, PeriodoDeHijo, HijoConPeriodos } from '@/lib/administracion-escolar/periodos-familia';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const hijos = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.facturarAClientId, clientId),
    ))
    .orderBy(adminEscolarEstudiantes.nombres);

  // Sin hijos no es un error: es un contacto de Facturación al que todavía no
  // se le ha asignado ningún alumno. La pantalla lo dice con una lista vacía.
  if (hijos.length === 0) return NextResponse.json({ hijos: [] });

  const out: HijoConPeriodos[] = [];

  for (const h of hijos) {
    const ficha = await fichaEstudiante(auth.teamId, h.id);
    if (!ficha) continue;

    const alumno = `${h.nombres} ${h.apellidos ?? ''}`.trim();
    const periodos: PeriodoDeHijo[] = [];

    for (const m of ficha.matriculas) {
      /**
       * Los anulados entran en el descarte pero no en la tabla.
       *
       * Un cargo anulado gastó su cuota igual: si no se cuenta, el mes vuelve
       * a anunciarse como previsto y la pantalla ofrece facturar algo que ya
       * se facturó y se echó atrás a propósito.
       */
      const suyos = ficha.cargos.filter((c) => c.matriculaId === m.id);
      const vivos = suyos.filter((c) => c.estado !== 'anulado');

      const plan = ficha.planes[m.id];
      const previstos = plan?.devenga ? previstosDelPlan(plan.lineas, suyos) : [];

      const filas: FilaMes[] = [
        ...vivos.map((c) => ({
          key: `c${c.id}`,
          tipo: 'cargo' as const,
          cargoId: c.id,
          cuotaId: c.cuotaId,
          conceptoId: c.conceptoId,
          concepto: c.concepto ?? 'Cargo',
          mes: c.mes,
          anio: c.anio,
          fechaVencimiento: c.fechaVencimiento,
          montoCentavos: c.montoCentavos,
          saldoCentavos: c.saldoCentavos,
          estado: c.estado,
          ecfDocumentId: c.ecfDocumentId,
          encf: c.facturaEncf,
          codigo: c.facturaCodigo,
        })),
        ...previstos.map((p) => ({
          key: `p${m.id}-${p.key}`,
          tipo: 'previsto' as const,
          cargoId: null,
          cuotaId: p.cuotaId > 0 ? p.cuotaId : null,
          conceptoId: p.conceptoId,
          concepto: p.concepto,
          mes: p.mes,
          anio: p.anio,
          fechaVencimiento: p.fechaVencimiento,
          montoCentavos: p.montoCentavos,
          saldoCentavos: 0,
          estado: 'previsto',
          ecfDocumentId: null,
          encf: null,
          codigo: null,
        })),
      ].sort((a, b) => (a.anio - b.anio) || ((a.mes ?? 0) - (b.mes ?? 0)) || a.concepto.localeCompare(b.concepto));

      periodos.push({
        matriculaId: m.id,
        periodoId: m.periodoId,
        periodo: m.periodo ?? 'Sin período',
        curso: m.curso ?? '—',
        activo: m.periodoActivo ?? false,
        facturaRecurrenteId: m.facturaRecurrenteId,
        recurrenteEstado: m.recurrenteEstado,
        recurrenteDiaCobro: m.recurrenteDiaCobro,
        recurrenteProxima: m.recurrenteProxima,
        filas,
        pendienteCentavos: vivos.reduce((s, c) => s + c.saldoCentavos, 0),
        // Un cargo sin factura se debe, pero todavía no se puede cobrar. La
        // ficha necesita separarlo para no pintar «Debe» en rojo antes de que
        // exista el documento que la familia puede pagar.
        porCobrarCentavos: vivos
          .filter((c) => c.ecfDocumentId != null)
          .reduce((s, c) => s + c.saldoCentavos, 0),
        previstoCentavos: previstos.reduce((s, p) => s + p.montoCentavos, 0),
      });
    }

    // El año en curso primero: es el que se viene a mirar.
    periodos.sort((a, b) => Number(b.activo) - Number(a.activo) || (b.periodoId ?? 0) - (a.periodoId ?? 0));
    out.push({ estudianteId: h.id, alumno, periodos });
  }

  return NextResponse.json({ hijos: out });
}
