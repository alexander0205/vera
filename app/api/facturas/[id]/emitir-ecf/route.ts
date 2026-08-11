/**
 * POST /api/facturas/[id]/emitir-ecf
 *
 * Emite a la DGII un documento que fue creado sin eCF (tipoEcf='sin-ncf')
 * o que está en estado BORRADOR.
 *
 * Body: { tipoEcf: '31' | '32' | ... }
 *
 * El servidor reconstruye el payload completo desde los datos guardados en BD
 * y llama a ecf-api para firmar + enviar a DGII. El documento existente es
 * ACTUALIZADO con el e-NCF, trackId, codigoSeguridad y nuevo estado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, teamMembers, users, products, inventoryMovements } from '@/lib/db/schema';
import { descontarInventario } from '@/lib/inventario/descuento';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { requireTurnoAbierto, configCaja } from '@/lib/caja/guard';
import { calcularTotales } from '@/lib/ecf/types';
import { logError, logInfo } from '@/lib/logger';
import { logAudit, getIp } from '@/lib/audit';
import { emision, EcfApiError } from '@/lib/ecf-api/client';
import { resolveEcfApiError } from '@/lib/ecf-api/error-codes';
import { ensureContribuyente } from '@/lib/ecf-api/contribuyente';
import { mapToEcfApiDto } from '@/lib/ecf-api/emision-mapper';
import { withRequestAuditContext } from '@/lib/db/audit-context';
import { getAmbienteTenant, mensajeAmbienteNoProduccion } from '@/lib/ecf-api/ambiente';

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  tipoEcf: z.enum(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47']),
  // Permite completar el comprador al emitir (cuando la factura se creó sin RNC).
  rncComprador:         z.string().trim().min(1).max(20).optional(),
  razonSocialComprador: z.string().trim().min(1).max(255).optional(),
  // Notas 33/34: permite completar los metadatos de modificación al emitir.
  // Fallback: columna persistida → derivado del padre.
  codigoModificacion:   z.coerce.number().int().min(1).max(5).optional(),
  fechaNcfModificado:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Reglas por tipoEcf — espejo de lib/ecf/types.ts (no importable porque ese módulo
// trae además helpers cliente que no necesitamos acá).
const REGLAS: Record<string, { rnc: boolean; razon: boolean; ncfMod: boolean; permiteItbis: boolean }> = {
  '31': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '32': { rnc: false, razon: false, ncfMod: false, permiteItbis: true  },
  '33': { rnc: true,  razon: true,  ncfMod: true,  permiteItbis: true  },
  '34': { rnc: true,  razon: true,  ncfMod: true,  permiteItbis: true  },
  '41': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '43': { rnc: false, razon: false, ncfMod: false, permiteItbis: false },
  '44': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: false },
  '45': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '46': { rnc: false, razon: true,  ncfMod: false, permiteItbis: false },
  '47': { rnc: false, razon: true,  ncfMod: false, permiteItbis: false },
};

const RNC_RE = /^\d{9}$|^\d{11}$/;

// ─── Adquirir próximo eNCF (same as in /api/ecf/emitir) ─────────────────────

async function acquireNextEncf(
  teamId: number,
  tipoEcf: string,
): Promise<{ encf: string; sequenceId: number; fechaVencimiento: string | null } | null> {
  const rows = await db.execute<{ id: number; numero: string; fecha_venc: string | null }>(sql`
    UPDATE sequences
    SET secuencia_actual = secuencia_actual + 1,
        updated_at       = NOW()
    WHERE id = (
      SELECT id FROM sequences
      WHERE team_id = ${teamId}
        AND tipo_ecf = ${tipoEcf}
        AND secuencia_actual <= secuencia_hasta
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento > NOW())
      ORDER BY preferida DESC, (secuencia_hasta - secuencia_actual) DESC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, (secuencia_actual - 1)::text AS numero, fecha_vencimiento::date::text AS fecha_venc
  `);

  const row = rows[0] as { id: number; numero: string; fecha_venc: string | null } | undefined;
  if (!row) return null;

  const encf = `E${tipoEcf}${row.numero.padStart(10, '0')}`;
  return { encf, sequenceId: row.id, fechaVencimiento: row.fecha_venc ?? null };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 });

    // ── Gate: facturas:emitir-dgii ────────────────────────────────────────────
    const [[u], [m]] = await Promise.all([
      db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
      db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
    ]);
    if (!await userCanForTeam(teamId, u?.platformRole, m?.role, 'facturas:emitir-dgii')) {
      return NextResponse.json({ error: 'Sin permiso para emitir a la DGII' }, { status: 403 });
    }

    // Gate de ambiente: esta ruta solo promueve borradores a e-CF real, así que
    // no tiene la excepción de habilitación — el Set de Pruebas nunca pasa por
    // aquí, emite directo contra /api/ecf/emitir.
    const ambiente = await getAmbienteTenant(teamId);
    if (ambiente !== 'Produccion') {
      return NextResponse.json(
        { error: mensajeAmbienteNoProduccion(ambiente), ambiente },
        { status: 403 },
      );
    }

    const { id } = await params;
    const docId = parseInt(id);
    if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    // Validate body
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }
    const {
      tipoEcf,
      rncComprador: rncOverride,
      razonSocialComprador: razonOverride,
      codigoModificacion: codModBody,
      fechaNcfModificado: fechaNcfBody,
    } = parsed.data;

    // Load document + team
    const [row] = await db
      .select({ doc: ecfDocuments, team: teams })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const { doc, team } = row;

    // Permitir emisión para documentos SIN e-CF real: BORRADOR, HISTORICA
    // (importadas de Alegra) o sin-ncf. Bloquear los que ya fueron a DGII o
    // están anulados.
    const yaEnDgii = ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'].includes(doc.estado);
    if (doc.estado === 'ANULADO' || yaEnDgii) {
      return NextResponse.json(
        { error: `El documento ya fue procesado (estado: ${doc.estado}). Solo se pueden enviar a DGII facturas sin e-CF (borrador, histórica o sin-ncf).` },
        { status: 422 },
      );
    }

    if (!team?.rnc) {
      return NextResponse.json(
        { error: 'RNC no configurado. Completa el perfil de tu empresa.' },
        { status: 422 },
      );
    }

    // ── Cuadre de caja ────────────────────────────────────────────────────────
    // Mismo bloqueo que /api/ecf/emitir: esta ruta también manda a la DGII, así
    // que sin turno ABIERTO era la vía para emitir por fuera del cuadre.
    const guardCaja = await requireTurnoAbierto(teamId, user.id, configCaja(team));
    if (!guardCaja.ok) {
      return NextResponse.json({ error: guardCaja.error, code: guardCaja.code }, { status: 409 });
    }
    const turnoCaja = guardCaja.turno;

    // ─── Pre-flight: validar campos obligatorios para el tipoEcf seleccionado ──
    const regla = REGLAS[tipoEcf];
    const rncFinal   = (rncOverride   ?? doc.rncComprador         ?? '').trim();
    const razonFinal = (razonOverride ?? doc.razonSocialComprador ?? '').trim();

    const errores: { campo: string; mensaje: string; resoluble: boolean }[] = [];

    if (regla.rnc && !rncFinal) {
      errores.push({
        campo: 'rncComprador',
        mensaje: `e${tipoEcf} requiere RNC o Cédula del comprador.`,
        resoluble: true,
      });
    }
    if (rncFinal && !RNC_RE.test(rncFinal.replace(/[-\s]/g, ''))) {
      errores.push({
        campo: 'rncComprador',
        mensaje: 'El RNC/Cédula debe tener 9 u 11 dígitos.',
        resoluble: true,
      });
    }
    if (regla.razon && !razonFinal) {
      errores.push({
        campo: 'razonSocialComprador',
        mensaje: `e${tipoEcf} requiere razón social del comprador.`,
        resoluble: true,
      });
    }
    // ncfModificado puede derivarse del padre vinculado (origenDocumentoId)
    // cuando este ya tiene e-CF real — solo falla si no hay ninguna referencia.
    if (regla.ncfMod && !doc.ncfModificado && !doc.origenDocumentoId) {
      errores.push({
        campo: 'ncfModificado',
        mensaje: `e${tipoEcf} debe referenciar un e-NCF previo (factura original).`,
        resoluble: false,
      });
    }

    if (errores.length > 0) {
      return NextResponse.json(
        {
          error: 'Faltan datos requeridos por la DGII',
          mensaje: errores.map(e => e.mensaje).join(' '),
          errores,
          action: errores.every(e => e.resoluble) ? 'complete-in-modal' : 'edit-factura',
        },
        { status: 422 },
      );
    }

    // Persistir overrides en ecf_documents (sobrevive al emit)
    if (
      (rncOverride   && rncOverride   !== (doc.rncComprador ?? '')) ||
      (razonOverride && razonOverride !== (doc.razonSocialComprador ?? ''))
    ) {
      await db
        .update(ecfDocuments)
        .set({
          rncComprador:         rncFinal || null,
          razonSocialComprador: razonFinal || null,
          updatedBy:            user.id,
          updatedAt:            new Date(),
        })
        .where(eq(ecfDocuments.id, docId));
      doc.rncComprador         = rncFinal || null;
      doc.razonSocialComprador = razonFinal || null;
    }

    // Cross-doc: si es NC/débito (33/34) con padre referenciado, el padre debe
    // tener eCF real. Bloquear "Enviar a DGII" si padre sigue sin-eCF.
    // Resuelve por origenDocumentoId (vínculo por id) o por encf (legacy).
    let parentDoc: { id: number; tipoEcf: string; encf: string; fechaEmision: Date; ecfApiEmisionId: string | null } | null = null;
    let ncfModFinal = doc.ncfModificado;
    if (tipoEcf === '33' || tipoEcf === '34') {
      if (doc.origenDocumentoId) {
        const [p] = await db
          .select({ id: ecfDocuments.id, tipoEcf: ecfDocuments.tipoEcf, encf: ecfDocuments.encf, fechaEmision: ecfDocuments.fechaEmision, ecfApiEmisionId: ecfDocuments.ecfApiEmisionId })
          .from(ecfDocuments)
          .where(and(eq(ecfDocuments.id, doc.origenDocumentoId), eq(ecfDocuments.teamId, teamId)))
          .limit(1);
        parentDoc = p ?? null;
      } else if (doc.ncfModificado) {
        const [p] = await db
          .select({ id: ecfDocuments.id, tipoEcf: ecfDocuments.tipoEcf, encf: ecfDocuments.encf, fechaEmision: ecfDocuments.fechaEmision, ecfApiEmisionId: ecfDocuments.ecfApiEmisionId })
          .from(ecfDocuments)
          .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, doc.ncfModificado)))
          .limit(1);
        parentDoc = p ?? null;
      }

      if (parentDoc) {
        const parentSinEcf = parentDoc.tipoEcf === 'sin-ncf'
          || (parentDoc.encf?.startsWith('BOR-') ?? false);
        if (parentSinEcf) {
          return NextResponse.json(
            {
              error: 'La factura referenciada no tiene e-CF',
              mensaje: `Esta nota referencia una factura que aún no tiene e-CF. Envía primero la factura padre a la DGII, o deja esta nota como borrador.`,
              parentEncf: parentDoc.encf,
            },
            { status: 409 },
          );
        }
        // Padre ya con e-CF real → usarlo como NCF modificado si falta o quedó
        // apuntando a un BOR- (padre promovido después de crear la nota).
        if (!ncfModFinal || ncfModFinal.startsWith('BOR-')) {
          ncfModFinal = parentDoc.encf;
        }
      }
    }

    // Metadatos de modificación para el XML (tipos 33/34):
    // body → columna persistida → derivado del padre.
    const codModFinal = codModBody
      ?? doc.codigoModificacion
      ?? (doc.moraOrigenId != null ? 3 : undefined); // ND de mora = 3 (corrige monto)
    // FechaNCFModificado = la fecha-CALENDARIO de emisión del padre tal cual la tiene
    // la DGII (si no coincide → rechazo cod=634). Las fechas se guardan/manejan como
    // UTC-medianoche (el provider devuelve p.ej. "2026-06-15T00:00:00.000Z"), así que
    // la fecha-calendario son los componentes **UTC**. El bug histórico formateaba en
    // hora RD (UTC-4) → 2026-06-15T00:00Z se veía 14-06 → mandábamos el día anterior.
    const fechaCalendario = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    let fechaNcfModFinal = fechaNcfBody
      ?? (parentDoc ? fechaCalendario(parentDoc.fechaEmision) : undefined);
    // Fuente AUTORITATIVA de la fecha del padre: la FechaEmision que el provider/DGII
    // tiene registrada (vía su emisionId). Nuestra fecha local puede estar corrida ±1
    // día por TZ y causar el rechazo "FechaNCFModificado no coincide con la fecha de
    // emisión del comprobante a modificar". Si la consulta falla, se queda con la
    // derivación local de arriba.
    if (!fechaNcfBody && (tipoEcf === '33' || tipoEcf === '34') && parentDoc?.ecfApiEmisionId) {
      try {
        const est = await emision.consultarEstado(parentDoc.ecfApiEmisionId);
        const raw = String(est?.fechaEmision ?? '');
        const iso = raw.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso))      fechaNcfModFinal = iso;        // ISO YYYY-MM-DD[...]
        else if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) fechaNcfModFinal = raw;        // dd-MM-yyyy
      } catch { /* fallback a la fecha local derivada arriba */ }
    }

    if ((tipoEcf === '33' || tipoEcf === '34') && ncfModFinal) {
      if (codModFinal === undefined || !fechaNcfModFinal) {
        return NextResponse.json(
          {
            error:   'Faltan datos de modificación',
            mensaje: 'Para emitir esta nota la DGII requiere el código de modificación (1-5) y la fecha del e-NCF original. Edita la nota para completarlos.',
            errores: [
              ...(codModFinal === undefined ? [{ campo: 'codigoModificacion', mensaje: 'Código de modificación requerido.', resoluble: false }] : []),
              ...(!fechaNcfModFinal ? [{ campo: 'fechaNcfModificado', mensaje: 'Fecha del e-NCF original requerida.', resoluble: false }] : []),
            ],
            action: 'edit-factura',
          },
          { status: 422 },
        );
      }
    }

    // Parse items from lineasJson
    let items: Array<{
      productoId?: number | null;
      variantId?: number | null;
      nombreItem: string;
      descripcionItem?: string;
      cantidadItem: number;
      precioUnitarioItem: number;
      descuentoMonto?: number;
      tasaItbis?: 0.18 | 0.16 | 0;
      indicadorBienoServicio?: 1 | 2;
    }> = [];

    if (doc.lineasJson) {
      try {
        const parsed = JSON.parse(doc.lineasJson) as Array<Record<string, unknown>>;
        items = parsed
          .filter(i => i.nombreItem && (Number(i.cantidadItem) || 0) > 0 && (Number(i.precioUnitarioItem) || 0) > 0)
          .map(i => {
            const tasa = String(i.tasaItbis ?? 'exento');
            const tasaFloat: 0.18 | 0.16 | 0 | undefined =
              tasa === '0.18' ? 0.18 :
              tasa === '0.16' ? 0.16 :
              tasa === '0'    ? 0    :
              undefined; // exento

            const base = (Number(i.cantidadItem) || 1) * (Number(i.precioUnitarioItem) || 0);
            const descPct = Number(i.descuentoPct) || 0;
            const descuentoMonto = descPct > 0 ? base * (descPct / 100) : undefined;

            return {
              productoId:             i.productoId ? Number(i.productoId) : null,
              variantId:              i.variantId ? Number(i.variantId) : null,
              nombreItem:             String(i.nombreItem),
              descripcionItem:        i.descripcionItem ? String(i.descripcionItem) : undefined,
              cantidadItem:           Number(i.cantidadItem) || 1,
              precioUnitarioItem:     Number(i.precioUnitarioItem) || 0,
              descuentoMonto,
              tasaItbis:              tasaFloat,
              indicadorBienoServicio: (i.indicadorBienoServicio === 1 || i.indicadorBienoServicio === '1') ? 1 : 2,
            };
          });
      } catch {
        return NextResponse.json({ error: 'No se pudieron procesar los ítems del documento.' }, { status: 422 });
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:   'La factura no tiene ítems válidos',
          mensaje: 'Para emitir a la DGII la factura debe tener al menos un ítem con nombre, cantidad y precio. Edita la factura para agregarlos.',
          errores: [{ campo: 'lineas', mensaje: 'No hay ítems válidos.', resoluble: false }],
          action:  'edit-factura',
        },
        { status: 422 },
      );
    }

    const totales = calcularTotales(items);

    // ── Bloqueo stock agotado ─────────────────────────────────────────────────
    // Si el borrador ya descontó stock al guardarse, ese stock ya está
    // "reservado" por este mismo documento — re-chequear aquí lo bloquearía
    // incorrectamente (se vería agotado por su propio descuento).
    if (!doc.stockDescontado) {
      const bienesIds = items
        .filter(i => i.indicadorBienoServicio === 1 && i.productoId)
        .map(i => i.productoId as number);

      if (bienesIds.length > 0) {
        const prods = await db
          .select({
            id:                   products.id,
            nombre:               products.nombre,
            stockActual:          products.stockActual,
            controlaInventario:   products.controlaInventario,
            permiteVentaSinStock: products.permiteVentaSinStock,
          })
          .from(products)
          .where(and(eq(products.teamId, teamId), inArray(products.id, bienesIds)));

        const bloqueados = prods.filter(
          p => p.controlaInventario && p.stockActual === 0 && !p.permiteVentaSinStock,
        );

        if (bloqueados.length > 0) {
          const nombres = bloqueados.map(p => `"${p.nombre}"`).join(', ');
          return NextResponse.json(
            { error: `No se puede emitir: los siguientes productos están agotados y no permiten venta sin stock: ${nombres}.` },
            { status: 422 },
          );
        }
      }
    }

    // DGII: e32 (Factura de Consumo) >= DOP 250,000 exige RNC + razón social.
    if (tipoEcf === '32' && totales.montoTotal >= 250_000 && (!rncFinal || !razonFinal)) {
      return NextResponse.json(
        {
          error:   'e32 sobre DOP 250,000 requiere comprador',
          mensaje: 'Por norma DGII, una Factura de Consumo (e32) por DOP 250,000 o más debe incluir RNC/Cédula y razón social del comprador.',
          errores: [
            ...(!rncFinal   ? [{ campo: 'rncComprador',         mensaje: 'RNC/Cédula requerido por superar DOP 250,000.', resoluble: true }] : []),
            ...(!razonFinal ? [{ campo: 'razonSocialComprador', mensaje: 'Razón social requerida por superar DOP 250,000.', resoluble: true }] : []),
          ],
          action:  'complete-in-modal',
        },
        { status: 422 },
      );
    }

    // ITBIS no permitido en este tipo pero hay items con ITBIS → debe editar la factura.
    if (!regla.permiteItbis && items.some(i => (i.tasaItbis ?? 0) > 0)) {
      return NextResponse.json(
        {
          error:   `e${tipoEcf} no permite ITBIS`,
          mensaje: `El tipo e${tipoEcf} no admite ítems con ITBIS. Edita la factura y marca los ítems como exentos o cambia el tipo.`,
          errores: [{ campo: 'lineas', mensaje: 'Hay ítems con ITBIS pero el tipo no lo permite.', resoluble: false }],
          action:  'edit-factura',
        },
        { status: 422 },
      );
    }

    // Ensure contribuyente en ecf-api
    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      console.error('[emitir-ecf ensureContribuyente]', err);
      return NextResponse.json(
        { error: 'No se pudo verificar el contribuyente en ecf-api. Verifica que el perfil esté completo.' },
        { status: 422 },
      );
    }

    // Reintento con el MISMO e-NCF: SOLO si el doc trae un e-NCF que nunca llegó al
    // provider (reservado pero sin enviar — p.ej. timeout antes de la respuesta).
    // Si ya se envió (ecfApiEmisionId presente), ese e-NCF quedó QUEMADO en el provider:
    // aunque la DGII lo RECHAZARA, "cada eNcf solo puede emitirse una vez"
    // (ECFA_NCF_DUPLICADO). En ese caso hay que adquirir uno NUEVO de la secuencia.
    let encfAsignado: string;
    let sequenceConsumedId: number | null;
    let fechaVencimientoSecuencia: string | null;
    // Reintento con el MISMO e-NCF si el documento ya tiene uno reservado.
    // Es seguro: el gate de arriba ya rechazó todo documento en estado DGII
    // (EN_PROCESO/ACEPTADO/RECHAZADO/ANULADO), así que aquí el comprobante
    // nunca se emitió con éxito. Y el e-NCF es clave única en la DGII: si por
    // alguna razón sí llegó, reenviarlo no duplica — la DGII responde código 75
    // ("ya utilizado"), que es la confirmación. El duplicado nace de NO
    // reintentar, porque fuerza un N+1 y deja el anterior huérfano.
    // NOTA: no se condiciona a `ecfApiEmisionId` porque ahora lo guardamos
    // también en los fallos (para trazabilidad); usarlo aquí rompería el reuso.
    if (/^E\d{10,12}$/.test(doc.encf ?? '')) {
      encfAsignado = doc.encf!;
      sequenceConsumedId = null;
      fechaVencimientoSecuencia = null;
      console.log(`[emitir-ecf] reintento con MISMO eNCF: ${encfAsignado} para doc #${docId}`);
    } else {
      const acquired = await acquireNextEncf(teamId, tipoEcf);
      if (!acquired) {
        return NextResponse.json(
          {
            error: `No hay secuencias disponibles para tipo ${tipoEcf}. ` +
                   `Verifica que tengas un rango activo y no vencido en /dashboard/secuencias.`,
          },
          { status: 422 },
        );
      }
      encfAsignado = acquired.encf;
      sequenceConsumedId = acquired.sequenceId;
      fechaVencimientoSecuencia = acquired.fechaVencimiento;
      console.log(`[emitir-ecf] eNCF asignado: ${encfAsignado} para doc #${docId}`);

      // RESERVA: persistir el e-NCF ANTES de enviar. Si el envío falla, el
      // documento conserva su número y el reintento lo REUSA (rama de arriba)
      // en vez de quemar el siguiente. Sin esto cada fallo abría un hueco
      // permanente en la secuencia.
      await db
        .update(ecfDocuments)
        .set({ encf: encfAsignado, updatedAt: new Date() })
        .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)));
    }

    // Clave de idempotencia: ligada al doc + e-NCF. Si el reintento manda la
    // misma clave, ecf-api devuelve la emisión existente con 201 en vez de
    // crear otra o responder 409 ECFA_NCF_DUPLICADO.
    const idempotencyKey = `vera-${teamId}-${docId}-${encfAsignado}`;

    // Build mapper payload
    const tipoPago = (doc.tipoPago ?? 1) as 1 | 2 | 3 | 4;
    const { tipo, dto: ecfApiDto } = mapToEcfApiDto({
      tipoEcf,
      items,
      totales,
      rncComprador:               doc.rncComprador ?? undefined,
      razonSocialComprador:       doc.razonSocialComprador ?? undefined,
      emailComprador:             doc.emailComprador ?? undefined,
      tipoPago,
      fechaLimitePago:            doc.fechaLimitePago ?? undefined,
      ncfModificado:              ncfModFinal ?? undefined,
      codigoModificacion:         codModFinal,
      fechaNcfModificado:         fechaNcfModFinal,
      encfOverride:               encfAsignado,
      fechaVencimientoSecuencia:  fechaVencimientoSecuencia ?? undefined,
    });

    // Ambiente DGII: no se envía. ecf-api usa el del contribuyente (contrib.ambiente).

    // Call ecf-api
    let resultado;
    try {
      const { tipoComprobante: tipoCmp, formato: fmt, ...payloadFields } = ecfApiDto as Record<string, unknown> & {
        tipoComprobante?: string;
        formato?: string;
      };
      const wrappedBody = {
        tipoComprobante: tipoCmp ?? tipo,
        ...(fmt ? { formato: fmt } : {}),
        payload: payloadFields,
      };
      resultado = await emision.emitirUnified(codigoPublico, wrappedBody, {
        'Idempotency-Key': idempotencyKey,
      });
    } catch (err) {
      console.error('[emitir-ecf ecf-api]', err);
      if (err instanceof EcfApiError) {
        const resolved = resolveEcfApiError(err);

        // ── Contrato de reintento seguro de ecf-api ──────────────────────────
        // Los 503 de emisión traen emisionId / puedeReintentar / requiereVerificacion.
        const b = err.body ?? {};
        const emisionId           = typeof b.emisionId === 'string' ? b.emisionId : null;
        const puedeReintentar     = b.puedeReintentar;
        const requiereVerificacion = b.requiereVerificacion === true;

        // Si ecf-api creó fila, guardamos su id: sin él no podemos consultar
        // el estado real después (y quedaría huérfana como las 60 actuales).
        if (emisionId) {
          await db
            .update(ecfDocuments)
            .set({ ecfApiEmisionId: emisionId, updatedAt: new Date() })
            .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
            .catch((e) => console.error('[emitir-ecf] no se pudo guardar emisionId', e));
        }

        // ── VERIFICACIÓN antes de rendirse ──────────────────────────────────
        // Un timeout NO significa que DGII lo rechazara: puede haberlo aceptado
        // y habérsenos perdido la respuesta. Si nos rendimos a ciegas, el
        // usuario re-factura y el cliente termina con DOS comprobantes fiscales
        // por una sola venta. Preguntamos el estado real antes de decidir.
        if (emisionId) {
          // `/estado-dgii` solo aplica a comprobantes con trackId (asíncronos).
          // Para RFCE (tipo 32, síncrono) lanza error → caemos al registro plano
          // `/emisiones/{id}`, que sí expone el estado real. Sin este fallback la
          // verificación no serviría justo para el tipo que más se factura.
          const verificado =
            (await emision.consultarEstado(emisionId).catch(() => null)) ??
            (await emision.get(emisionId).catch((e) => {
              console.error('[emitir-ecf] verificación de estado falló', e);
              return null;
            }));

          const est = String(verificado?.estado ?? '').toUpperCase();
          // Recuperamos solo con prueba de que llegó: trackId (asíncronos) o
          // estado aceptado (RFCE síncrono). ERROR/PENDIENTE sin nada = no llegó.
          const llego = !!verificado && (
            !!verificado.trackId ||
            ['ACEPTADO', 'ACEPTADO_CONDICIONAL'].includes(est)
          );
          if (verificado && llego && ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'ENVIADO', 'PENDIENTE'].includes(est)) {
            // SÍ llegó a la DGII. Seguimos por el camino de éxito en vez de
            // devolver error: se registra el comprobante y no se re-factura.
            console.warn(`[emitir-ecf] recuperado por verificación: ${verificado.eNcf} estado=${est} trackId=${verificado.trackId}`);
            resultado = verificado;
          }
        }

        // Número QUEMADO → soltar la reserva para que el próximo intento tome
        // el siguiente e-NCF. Si puedeReintentar es true (o desconocido), el
        // documento conserva su e-NCF y el reintento lo reusa.
        if (!resultado && puedeReintentar === false) {
          await db
            .update(ecfDocuments)
            .set({ encf: `BOR-${docId}-${Date.now().toString(36)}`, updatedAt: new Date() })
            .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
            .catch((e) => console.error('[emitir-ecf] no se pudo soltar la reserva', e));
          console.warn(`[emitir-ecf] eNCF ${encfAsignado} QUEMADO (puedeReintentar=false) doc #${docId}`);
        }

        // Solo devolvemos error si la verificación NO lo recuperó.
        if (!resultado) {
          return NextResponse.json(
            {
              // `puedeReintentar: true` manda sobre `requiereVerificacion`: para
              // RFCE (sin trackId y con la consulta de DGII rota) reenviar el
              // MISMO e-NCF ES la verificación — o lo acepta, o responde código
              // 75 ("ya utilizado"), que confirma que ya estaba.
              error:        puedeReintentar === true
                ? `No se pudo enviar a la DGII. El comprobante ${encfAsignado} quedó reservado — reintenta y se usará el mismo número.`
                : requiereVerificacion
                ? 'El envío quedó en estado incierto. No se puede dar por emitida ni reintentar sin verificar: consulta el estado antes de continuar.'
                : resolved.mensaje,
              code:         resolved.code,
              action:       puedeReintentar === true ? 'retry-same-ncf'
                          : requiereVerificacion ? 'verificar-estado'
                          : puedeReintentar === false ? 'reintentar-nuevo-ncf'
                          : resolved.action,
              statusEcfApi: err.status,
              // Contrato de reintento — para que la UI decida sin adivinar.
              encf:                 encfAsignado,
              emisionId,
              emitido:              b.emitido === true,
              secuenciaUtilizada:   b.secuenciaUtilizada ?? null,
              puedeReintentar:      puedeReintentar ?? true,
              requiereVerificacion,
              ...(resolved.dgiiDetalle ? { dgii: resolved.dgiiDetalle } : {}),
              ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: err.humanMessage } : {}),
            },
            { status: resolved.proxyStatus },
          );
        }
      }
      // Fallo de red/timeout sin respuesta de ecf-api. El e-NCF queda RESERVADO
      // en el documento: el reintento lo reusa y viaja con la misma
      // Idempotency-Key, así que no se duplica ni se abre un hueco.
      if (!resultado) {
        const raw = err instanceof Error ? err.message : 'Error desconocido';
        const esTimeout = /timeout|econnreset|etimedout|aborted/i.test(raw);
        return NextResponse.json(
          {
            error: esTimeout
              ? `Tiempo de espera agotado al comunicarse con el servicio de firma. El comprobante ${encfAsignado} quedó reservado — reintenta y se usará el mismo número.`
              : `No se pudo enviar el comprobante. ${encfAsignado} quedó reservado — reintenta y se usará el mismo número.`,
            action: 'retry-same-ncf',
            encf: encfAsignado,
            puedeReintentar: true,
            requiereVerificacion: false,
            ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: raw } : {}),
          },
          { status: 502 },
        );
      }
    }

    // Map estado
    const mapeoEstado: Record<string, string> = {
      ACEPTADO:             'ACEPTADO',
      ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
      ENVIADO:              'EN_PROCESO',
      PENDIENTE:            'EN_PROCESO',
      RECHAZADO:            'RECHAZADO',
      ERROR:                'RECHAZADO',
    };
    const estadoUpper   = String(resultado.estado ?? '').toUpperCase();
    const estadoFinal   = mapeoEstado[estadoUpper] ?? (resultado.trackId ? 'EN_PROCESO' : 'ACEPTADO');
    const encfFinal     = resultado.eNcf ?? encfAsignado;
    const trackId       = resultado.trackId ?? '';

    if (encfAsignado && encfFinal && encfFinal !== encfAsignado) {
      console.warn(`[emitir-ecf] eNCF DIVERGENTE: local=${encfAsignado} ecf-api=${encfFinal} (seq.id=${sequenceConsumedId})`);
    }

    // Update the existing document in-place (within audit context so trigger captures user)
    await withRequestAuditContext(
      (tx) => tx
        .update(ecfDocuments)
        .set({
          encf:            encfFinal,
          tipoEcf,
          estado:          estadoFinal,
          trackId,
          codigoSeguridad: resultado.codigoSeguridad ?? null,
          fechaFirma:      resultado.fechaHoraFirma ?? null,
          urlVerificacion: resultado.urlVerificacion ?? resultado.qrCodeData ?? null,
          ecfApiEmisionId: resultado.id,
          fechaEmision:    new Date(resultado.fechaEmision),
          stockDescontado: true,
          // Atar al turno que la emitió. Un borrador viejo pudo nacer sin turno
          // (o con el de otro cajero); lo que cuadra es quién la mandó a DGII.
          ...(turnoCaja ? { turnoCajaId: turnoCaja.id } : {}),
          // Persistir el NCF modificado/código realmente enviados a DGII
          ...(ncfModFinal ? { ncfModificado: ncfModFinal } : {}),
          ...(codModFinal !== undefined ? { codigoModificacion: codModFinal } : {}),
          updatedBy:       user.id,
          updatedAt:       new Date(),
        })
        .where(eq(ecfDocuments.id, docId)),
      { userId: user.id, teamId },
    );

    // Descuento automático de inventario — fire-and-forget.
    // Si el borrador ya había descontado al guardarse, no descontar de nuevo:
    // solo actualizar la referencia del movimiento al e-NCF final (BOR-xxx → Exx...).
    if (doc.stockDescontado) {
      db.update(inventoryMovements)
        .set({ referenciaEncf: encfFinal })
        .where(and(eq(inventoryMovements.teamId, teamId), eq(inventoryMovements.referenciaId, docId), eq(inventoryMovements.tipo, 'VENTA')))
        .catch((e) => console.error('[emitir-ecf] actualizar referenciaEncf falló', e));
    } else {
      descontarInventario(teamId, user.id, docId, encfFinal, items, doc.almacenId ?? null)
        .catch((e) => console.error('[emitir-ecf] stock decrement failed', e));
    }

    await logInfo({
      teamId,
      userId: user.id,
      source: `/api/facturas/${docId}/emitir-ecf`,
      message: `e-CF emitido desde borrador: ${encfFinal}`,
      details: { encf: encfFinal, tipoEcf, trackId, montoTotal: totales.montoTotal, ecfApiId: resultado.id, docId },
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   estadoFinal === 'RECHAZADO' ? 'ECF_RECHAZADO' : 'ECF_SEND',
      resource: encfFinal,
      ip:       getIp(request),
      meta:     { tipoEcf, trackId, montoTotal: totales.montoTotal, via: 'emitir-ecf', docId },
    });

    return NextResponse.json({
      ok:              true,
      encf:            encfFinal,
      trackId,
      estado:          estadoFinal,
      codigoSeguridad: resultado.codigoSeguridad,
      montoTotal:      totales.montoTotal,
      documentoId:     docId,
    });

  } catch (err: unknown) {
    console.error('[emitir-ecf]', err);
    await logError({
      source:  `/api/facturas/emitir-ecf`,
      message: err instanceof Error ? err.message : 'Error interno',
    }).catch(() => {});
    return NextResponse.json({ error: 'Error interno al emitir' }, { status: 500 });
  }
}
