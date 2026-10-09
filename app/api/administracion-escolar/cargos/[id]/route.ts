import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, ecfDocuments } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Vincula/desvincula el cargo a una factura (e-CF) YA EXISTENTE. No crea ni
 * emite facturas — eso vive en el motor de facturación (/api/ecf/emitir).
 * El cargo sigue siendo la fuente de verdad de la deuda (saldoCentavos); esto
 * solo guarda la referencia al documento fiscal que lo cubre.
 */
/**
 * DESVINCULA el cargo de su factura (ecfDocumentId = null).
 *
 * Solo desvincula. VINCULAR va por POST /cargos/[id]/saldar-con-factura, que
 * además comprueba que la factura sea del cliente del tutor responsable del
 * estudiante. Aquí se aceptaba también vincular, con un permiso más laxo
 * ('gestionar' en vez de 'pagos') y sin esa comprobación: era una segunda
 * puerta, más débil, al mismo campo — bastaba con mandar el id de cualquier
 * factura del team para colgarla del cargo de otro estudiante y, de paso,
 * mostrar sus pagos en el perfil equivocado.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cargoId = parseInt(id, 10);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { ecfDocumentId } = body;
  /**
   * Corregirle el importe a un cargo es otra cosa que tocar su cobro: pide el
   * permiso de gestión y escritura, no el de pagos. Un cajero puede desvincular
   * una factura mal puesta; cambiarle el precio a la colegiatura de un niño es
   * una decisión de administración.
   */
  const tocaImporte = body.montoCentavos !== undefined || body.fechaVencimiento !== undefined;
  const auth = tocaImporte
    ? await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true })
    : await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  if (tocaImporte) return editarImporte(teamId, cargoId, body);

  if (ecfDocumentId != null) {
    return NextResponse.json(
      { error: 'Para vincular una factura usa /cargos/[id]/saldar-con-factura; aquí solo se desvincula.' },
      { status: 400 },
    );
  }

  const [row] = await db.update(adminEscolarCargos)
    .set({ ecfDocumentId: null, updatedAt: new Date() })
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });
  return NextResponse.json({ cargo: row });
}

/**
 * Cambia el monto —y de paso el vencimiento— de un cargo todavía corregible.
 *
 * Existe porque el precio de un alumno se equivoca al escribirlo, no al
 * cobrarlo: se le pone 3,700 al que paga 2,800, y hasta ahora la única salida
 * era anular el cargo y rehacerlo, perdiendo su cuota, su mes y su sitio en el
 * calendario.
 *
 * Lo que NO se toca aquí:
 *  - un cargo ya facturado: el importe que vale es el de la factura, y
 *    cambiarlo por detrás dejaría el e-CF diciendo una cosa y la deuda otra;
 *  - un cargo anulado: no es deuda de nadie;
 *  - bajar el monto por debajo de lo ya pagado: eso no es corregir un precio,
 *    es inventar un saldo a favor que este módulo no sabe devolver.
 *
 * El saldo se recalcula conservando lo cobrado (`monto - saldo`), así que un
 * cargo con un abono encima queda `parcial` por la diferencia nueva.
 */
async function editarImporte(
  teamId: number,
  cargoId: number,
  body: { montoCentavos?: unknown; fechaVencimiento?: unknown },
) {
  const [cargo] = await db.select({
      id: adminEscolarCargos.id,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
    })
    .from(adminEscolarCargos)
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);
  if (!cargo) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });

  if (cargo.estado === 'anulado') {
    return NextResponse.json({ error: 'Este cargo está anulado: ya no se le cambia el monto.' }, { status: 409 });
  }
  if (cargo.ecfDocumentId != null) {
    return NextResponse.json(
      { error: 'Este cargo ya está en una factura. Desvincula o anula la factura antes de cambiarle el monto.' },
      { status: 409 },
    );
  }

  const pagadoCentavos = Math.max(0, cargo.montoCentavos - cargo.saldoCentavos);
  const cambios: Record<string, unknown> = { updatedAt: new Date() };

  if (body.montoCentavos !== undefined) {
    const nuevo = Number(body.montoCentavos);
    /**
     * Cero no vale, y no es lo mismo que negativo.
     *
     * Un cargo en cero sale de aquí con `saldo = 0`, y el estado se calcula del
     * saldo, así que quedaba marcado **pagado sin que entrara un peso** — un
     * mes que nadie volverá a cobrar porque ya no aparece debiendo. Y se
     * llegaba sin querer: el campo del monto vacío manda `''`, que `Number()`
     * convierte en 0 y `Number.isInteger(0)` da por bueno.
     *
     * Un cargo que no se va a cobrar se ANULA, que deja constancia de quién y
     * cuándo. Ponerlo en cero lo disfraza de cobrado.
     */
    if (!Number.isInteger(nuevo) || nuevo <= 0) {
      return NextResponse.json(
        { error: 'El monto tiene que ser mayor que cero. Si este cargo no se va a cobrar, anúlalo en vez de ponerlo en cero.' },
        { status: 400 },
      );
    }
    if (nuevo < pagadoCentavos) {
      const pagado = (pagadoCentavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 });
      return NextResponse.json(
        { error: `Ya tiene RD$${pagado} pagados: el monto no puede quedar por debajo.` },
        { status: 409 },
      );
    }
    const saldo = nuevo - pagadoCentavos;
    cambios.montoCentavos = nuevo;
    cambios.saldoCentavos = saldo;
    // El estado sale del saldo, salvo el vencido: si ya pasó su fecha sigue
    // vencido aunque se le corrija el precio.
    cambios.estado = saldo === 0 ? 'pagado'
      : pagadoCentavos > 0 ? 'parcial'
      : cargo.estado === 'vencido' ? 'vencido'
      : 'pendiente';
  }

  if (body.fechaVencimiento !== undefined) {
    const f = body.fechaVencimiento;
    if (f !== null && (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f))) {
      return NextResponse.json(
        { error: 'La fecha de vencimiento no tiene el formato AAAA-MM-DD.' },
        { status: 400 },
      );
    }
    cambios.fechaVencimiento = (f as string | null) || null;
  }

  const [row] = await db.update(adminEscolarCargos)
    .set(cambios)
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  return NextResponse.json({ cargo: row });
}

/**
 * Anula un cargo puesto por error (soft-delete: estado='anulado', saldo=0). NO
 * hace hard-delete — el cargo queda como registro histórico. Los cargos
 * `anulado` ya están excluidos de todas las sumas de deuda (ESTADOS_DEUDA) y de
 * `sincronizarSaldosDesdeFacturas`, así que dejan de inflar la deuda.
 *
 * Guardas (respeta la regla unidireccional cargo↔factura):
 *  - Un cargo con factura vinculada NO se anula directo: primero hay que
 *    desvincular la factura (PATCH ecfDocumentId=null) o anular la factura en
 *    el motor fiscal. Así el cobro sigue viviendo en la factura, no aquí.
 *  - Un cargo ya `anulado` es no-op idempotente.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;

  const [cargo] = await db.select({
      id: adminEscolarCargos.id,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
    })
    .from(adminEscolarCargos)
    .where(and(eq(adminEscolarCargos.id, parseInt(id)), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);
  if (!cargo) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });

  if (cargo.estado === 'anulado') return NextResponse.json({ cargo });

  if (cargo.ecfDocumentId != null) {
    return NextResponse.json(
      { error: 'El cargo tiene una factura vinculada. Desvincula o anula la factura antes de anular el cargo.' },
      { status: 409 },
    );
  }

  const [row] = await db.update(adminEscolarCargos)
    .set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })
    .where(and(eq(adminEscolarCargos.id, parseInt(id)), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  return NextResponse.json({ cargo: row });
}
