import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { hoyRD } from '@/lib/utils/format';
import {
  MAX_FACTURAS_POR_PETICION,
  facturasEnLetras,
  leerPeticionLote,
  mesesParaElegir,
  planearFacturasPorLote,
  type RespuestaLote,
} from '@/lib/administracion-escolar/facturar-lote';
import {
  adelantarCuotasDelLote,
  cargarDatosDelLote,
  catalogoDelLote,
  crearFacturasDelPlan,
  periodoDelLote,
  periodosDelColegio,
} from '@/lib/administracion-escolar/facturar-lote-datos';

/**
 * Facturar por lote: «selecciona un montón de estudiantes, selecciona
 * conceptos y agrégale una factura a cada uno».
 *
 * Es el botón de la secretaria por encima de la misma máquina que ya factura
 * sola cada día (`facturarGrupos`, la del cron). Dos diferencias, a propósito:
 * una factura por ALUMNO salvo que se pida juntar a los hermanos, y entra todo
 * lo que la persona marque —también lo que no tiene calendario—, no solo lo que
 * se emitió hoy.
 *
 * **GET** devuelve lo que la pantalla necesita para elegir: los alumnos
 * matriculados con su curso, su responsable y cuánto tienen sin facturar, y los
 * conceptos que tienen algo pendiente.
 *
 * **POST** tiene dos modos con el mismo cuerpo:
 *   - `confirmar: false` (vista previa): calcula el plan y lo devuelve. No
 *     escribe nada. Es lo que se ve antes de pulsar «Crear».
 *   - `confirmar: true`: calcula el plan OTRA VEZ con lo que hay ahora y crea
 *     sus facturas. Recalcular y no fiarse de la vista previa es lo que impide
 *     facturar un cargo que mientras tanto ya se facturó.
 *
 * Las facturas nacen siempre BORRADOR y `sin-ncf`: nada va a la DGII desde aquí.
 *
 * Que no se doble-facture lo garantiza la transacción de cada factura (enlaza
 * los cargos solo si siguen sin factura y, si no, se deshace), así que dos clics
 * a la vez, o un clic y el cron, no pueden facturar el mismo cargo dos veces.
 */

/**
 * Cada factura tarda ~2 s (ver MAX_FACTURAS_POR_PETICION): el tope de tiempo
 * tiene que ser el del cron, no el de 10-60 s por defecto.
 */
export const maxDuration = 300;

const PERMISO = 'administracion-escolar:gestionar' as const;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', PERMISO);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const pedido = Number(req.nextUrl.searchParams.get('periodoId')) || null;
  const periodo = await periodoDelLote(teamId, pedido);
  if (!periodo) {
    return NextResponse.json({ error: 'No hay un año escolar activo' }, { status: 404 });
  }

  const [periodos, catalogo] = await Promise.all([
    periodosDelColegio(teamId),
    catalogoDelLote(teamId, periodo.id),
  ]);

  const hoy = hoyRD();
  return NextResponse.json({
    periodo,
    periodos,
    hoy,
    // Lo que se ofrece en «Desde el mes»: los meses del año escolar.
    meses: mesesParaElegir(periodo, hoy),
    maxPorPeticion: MAX_FACTURAS_POR_PETICION,
    ...catalogo,
  });
}

export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null);

  // La vista previa solo lee; crear pone documentos cobrables y va con el gate
  // de escritura (suscripción viva), igual que el alta de cargos en lote.
  const confirmar = cuerpo?.confirmar === true;
  const auth = await requireModuleAndPermission('escolar', PERMISO, { escritura: confirmar });
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const hoy = hoyRD();
  const leido = leerPeticionLote(cuerpo, hoy);
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });
  const p = leido.datos;

  const periodo = await periodoDelLote(teamId, p.periodoId);
  if (!periodo) {
    return NextResponse.json({ error: 'No hay un año escolar activo' }, { status: 404 });
  }

  // Las cuotas que se emiten hasta el corte y aún no son cargo (la de un mes
  // que no ha llegado, si se puso una fecha más adelante): en la vista previa
  // se enseñan sin crearlas; al confirmar se crean y el plan se recalcula con
  // lo que hay en la base.
  const adelantadas = await adelantarCuotasDelLote(
    teamId, periodo.id, p.estudianteIds, p.conceptoIds, p.hasta, !confirmar,
  );
  const { alumnos, cargos } = await cargarDatosDelLote(teamId, periodo.id, p.estudianteIds, p.conceptoIds);
  const plan = planearFacturasPorLote([...cargos, ...adelantadas], {
    alumnos,
    conceptoIds: p.conceptoIds,
    hasta: p.hasta,
    meses: p.meses,
    juntarHermanos: p.juntarHermanos,
  });

  const base = {
    confirmar,
    periodo: periodo.nombre,
    hasta: p.hasta,
    meses: p.meses,
    juntarHermanos: p.juntarHermanos,
    plan,
  };

  if (!confirmar) {
    return NextResponse.json(base satisfies RespuestaLote);
  }

  if (plan.facturas.length === 0) {
    return NextResponse.json({ ...base, creadas: [], fallidas: [] } satisfies RespuestaLote);
  }

  // El tope es de TIEMPO: cien facturas caben en la ruta, trescientas no. La
  // pantalla las manda de 25 en 25 y nunca lo toca; esto es para quien llame
  // directo. Se avisa antes de crear la primera, no a mitad.
  if (plan.facturas.length > MAX_FACTURAS_POR_PETICION) {
    return NextResponse.json({
      error: `Son ${facturasEnLetras(plan.facturas.length)} y el máximo por envío es ${MAX_FACTURAS_POR_PETICION}. Marca menos alumnos o créalas en tandas.`,
      codigo: 'DEMASIADAS_FACTURAS',
      maxPorPeticion: MAX_FACTURAS_POR_PETICION,
    }, { status: 400 });
  }

  const { creadas, fallidas } = await crearFacturasDelPlan(teamId, user.id, plan.facturas);

  if (creadas.length > 0 || fallidas.length > 0) {
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'ESCOLAR_FACTURAS_LOTE',
      resource: `periodo:${periodo.id}`,
      ip: getIp(req),
      meta: {
        creadas: creadas.length,
        fallidas: fallidas.length,
        cargos: creadas.reduce((n, f) => n + f.cargos, 0),
        montoCentavos: creadas.reduce((n, f) => n + f.montoCentavos, 0),
        alumnos: p.estudianteIds.length,
        conceptoIds: p.conceptoIds,
        hasta: p.hasta,
        meses: p.meses,
        juntarHermanos: p.juntarHermanos,
      },
    });
  }

  return NextResponse.json({ ...base, creadas, fallidas } satisfies RespuestaLote);
}
