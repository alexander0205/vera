/**
 * Los comprobantes que suben los padres, y qué pasa al aprobarlos.
 *
 * Aprobar NO escribe un pago escolar. Registra el cobro donde vive el dinero de
 * verdad —`pagos_recibidos`, contra la factura— y deja que
 * `sincronizarSaldosDesdeFacturas` baje el saldo del cargo. Es la misma regla
 * que cerró el POST de /api/administracion-escolar/pagos: una sola verdad de
 * cuánto deben.
 *
 * De ahí sale la única limitación real del flujo, y conviene decirla clara: un
 * cargo SIN factura no puede recibir el cobro. No es un descuido; es que en
 * este sistema el cobro es de un documento. El colegio tiene que facturar
 * primero, y la pantalla se lo dice en vez de tragárselo.
 */

import 'server-only';
import { and, desc, eq, inArray, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarComprobantes,
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarEstudiantes,
  clients,
  ecfDocuments,
} from '@/lib/db/schema';
import { registrarPago } from '@/lib/db/queries';
import { sincronizarSaldosDesdeFacturas } from './queries';
import { leerComprobante } from '@/lib/storage/comprobantes';
import type { CargoDelComprobante } from '@/lib/db/schema';

export interface ComprobanteFila {
  id: number;
  estado: string;
  montoCentavos: number;
  referencia: string | null;
  bancoOrigen: string | null;
  nota: string | null;
  responsable: string | null;
  responsableEmail: string | null;
  archivoNombre: string | null;
  archivoMime: string;
  archivoBytes: number;
  cargos: CargoDelComprobante[];
  motivoRechazo: string | null;
  creadoEn: string;
  revisadoEn: string | null;
}

export async function listarComprobantes(
  teamId: number,
  estado?: 'pendiente' | 'aprobado' | 'rechazado',
): Promise<ComprobanteFila[]> {
  const where = [eq(adminEscolarComprobantes.teamId, teamId)];
  if (estado) where.push(eq(adminEscolarComprobantes.estado, estado));

  const filas = await db
    .select({
      id:            adminEscolarComprobantes.id,
      estado:        adminEscolarComprobantes.estado,
      montoCentavos: adminEscolarComprobantes.montoCentavos,
      referencia:    adminEscolarComprobantes.referencia,
      bancoOrigen:   adminEscolarComprobantes.bancoOrigen,
      nota:          adminEscolarComprobantes.nota,
      archivoNombre: adminEscolarComprobantes.archivoNombre,
      archivoMime:   adminEscolarComprobantes.archivoMime,
      archivoBytes:  adminEscolarComprobantes.archivoBytes,
      cargos:        adminEscolarComprobantes.cargos,
      motivoRechazo: adminEscolarComprobantes.motivoRechazo,
      creadoEn:      adminEscolarComprobantes.creadoEn,
      revisadoEn:    adminEscolarComprobantes.revisadoEn,
      responsable:   clients.razonSocial,
      responsableEmail: clients.email,
    })
    .from(adminEscolarComprobantes)
    .leftJoin(clients, eq(clients.id, adminEscolarComprobantes.clientId))
    .where(and(...where))
    // Los pendientes primero: es una cola de trabajo, no un histórico.
    .orderBy(asc(adminEscolarComprobantes.estado), desc(adminEscolarComprobantes.id))
    .limit(300);

  return filas.map((f) => ({
    ...f,
    creadoEn: f.creadoEn.toISOString(),
    revisadoEn: f.revisadoEn?.toISOString() ?? null,
  }));
}

/** El binario, para servirlo por una ruta que ya validó sesión y empresa. */
export async function leerArchivoComprobante(
  teamId: number, id: number,
): Promise<{ buffer: Buffer; mime: string; nombre: string } | null> {
  const [f] = await db
    .select()
    .from(adminEscolarComprobantes)
    .where(and(
      eq(adminEscolarComprobantes.id, id),
      eq(adminEscolarComprobantes.teamId, teamId),
    ))
    .limit(1);
  if (!f) return null;

  const nombre = f.archivoNombre ?? 'comprobante';
  if (f.storage === 'db') {
    if (!f.archivoBase64) return null;
    return { buffer: Buffer.from(f.archivoBase64, 'base64'), mime: f.archivoMime, nombre };
  }
  if (!f.archivoKey) return null;
  return { buffer: await leerComprobante(f.archivoKey), mime: f.archivoMime, nombre };
}

export class ComprobanteError extends Error {}

/**
 * Cómo se reparte lo que llegó entre las facturas.
 *
 * Pura y probada aparte porque es la única parte de esto que mueve dinero. De
 * lo más viejo a lo más nuevo, que es como se salda una deuda: si el padre
 * transfirió menos que el total —cosa normal— lo que llega tapa las cuotas más
 * atrasadas, no las que él eligió, porque no eligió ninguna.
 *
 * Dos facturas pueden repetirse en la lista de cargos (una factura suele cubrir
 * varios cargos), así que el tope es de la FACTURA y se va gastando. Repartir
 * por cargo pasaría de largo el saldo real y `registrarPago` lo rechazaría.
 */
export function repartir(
  monto: number,
  facturas: { facturaId: number; saldo: number }[],
): { asignaciones: { facturaId: number; monto: number }[]; sobrante: number } {
  const disponible = new Map<number, number>();
  for (const f of facturas) {
    if (!disponible.has(f.facturaId)) disponible.set(f.facturaId, Math.max(0, f.saldo));
  }

  const asignaciones: { facturaId: number; monto: number }[] = [];
  let restante = Math.max(0, monto);

  for (const f of facturas) {
    if (restante <= 0) break;
    const hueco = disponible.get(f.facturaId) ?? 0;
    if (hueco <= 0) continue;
    const x = Math.min(restante, hueco);
    asignaciones.push({ facturaId: f.facturaId, monto: x });
    disponible.set(f.facturaId, hueco - x);
    restante -= x;
  }

  return { asignaciones, sobrante: restante };
}

export interface ResultadoAprobacion {
  aplicadoCentavos: number;
  /** Lo que no se pudo aplicar porque sus cargos no tienen factura. */
  sinAplicarCentavos: number;
  facturasTocadas: number;
  /** Conceptos que hay que facturar antes de poder cobrarlos. */
  cargosSinFactura: string[];
}

/** Lo que el revisor puede corregir antes de que el cobro entre. */
export interface AjustesAprobacion {
  /** El padre declara un monto; el revisor mira el papel del banco. Manda el papel. */
  montoCentavos?: number;
  fechaPago?: string;
  metodo?: string;
  referencia?: string;
}

export interface DestinoAplicacion {
  facturaId: number;
  encf: string | null;
  codigo: string | null;
  montoCentavos: number;
  /** De qué es esa factura, para reconocerla sin abrirla. */
  detalle: string;
}

export interface PlanAplicacion {
  montoCentavos: number;
  destinos: DestinoAplicacion[];
  aplicadoCentavos: number;
  sinAplicarCentavos: number;
  cargosSinFactura: string[];
}

/**
 * A dónde iría este dinero, sin escribir nada.
 *
 * Es la MISMA función que usa la aprobación para decidir. Separarlas sería
 * repetir el cálculo dos veces, y entonces la pantalla podría prometer un
 * reparto y la base hacer otro — que es justo lo que la previa existe para
 * impedir.
 */
async function planDeAplicacion(
  teamId: number,
  cargos: CargoDelComprobante[],
  montoCentavos: number,
): Promise<PlanAplicacion> {
  const idsCargo = cargos.map((x) => x.cargoId);

  // Se releen los cargos, no se usa la foto: entre que el padre subió el papel
  // y el colegio lo mira pudo facturarse, pagarse en caja o anularse. La foto
  // sirve para saber qué creyó pagar, no para decidir dónde va el dinero.
  const vivos = idsCargo.length === 0 ? [] : await db
    .select({
      id:               adminEscolarCargos.id,
      ecfDocumentId:    adminEscolarCargos.ecfDocumentId,
      saldoCentavos:    adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      concepto:         adminEscolarConceptosPago.nombre,
      nombres:          adminEscolarEstudiantes.nombres,
      encf:             ecfDocuments.encf,
      codigo:           ecfDocuments.codigo,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.id, idsCargo),
    ))
    .orderBy(asc(adminEscolarCargos.fechaVencimiento), asc(adminEscolarCargos.id));

  const pagables   = vivos.filter((v) => v.ecfDocumentId != null && v.saldoCentavos > 0);
  const sinFactura = vivos.filter((v) => v.ecfDocumentId == null && v.saldoCentavos > 0);

  // Saldo REAL de cada factura, no el del cargo: una factura puede cubrir
  // varios cargos, y registrar la suma de los cargos la pasaría de largo.
  const facturaIds = [...new Set(pagables.map((p) => p.ecfDocumentId!))];
  // `ecf_documents` no guarda el saldo: se calcula igual que en
  // sincronizarSaldosDesdeFacturas — total menos lo cobrado menos las notas de
  // crédito. Sin restar las NC, una nota que ya redujo la factura haría creer
  // que queda hueco y `registrarPago` rechazaría el cobro entero.
  const saldos = facturaIds.length === 0 ? [] : await db
    .select({
      id: ecfDocuments.id,
      saldo: sql<number>`(
        ${ecfDocuments.montoTotal}
        - COALESCE((SELECT SUM(monto_centavos) FROM pagos_recibidos
                    WHERE pagos_recibidos.ecf_document_id = ecf_documents.id), 0)
        - COALESCE((SELECT SUM(nc.monto_total) FROM ecf_documents nc
                    WHERE nc.team_id = ecf_documents.team_id
                      AND nc.tipo_ecf = '34'
                      AND nc.credito_generado_cents IS NULL
                      AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
                      AND nc.codigo_modificacion IS DISTINCT FROM 2
                      AND (nc.origen_documento_id = ecf_documents.id
                           OR (ecf_documents.encf LIKE 'E%' AND nc.ncf_modificado = ecf_documents.encf))
                   ), 0)
      )::int`,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, facturaIds)));
  const saldoDe = new Map(saldos.map((s) => [s.id, Math.max(0, s.saldo)]));

  const { asignaciones, sobrante } = repartir(
    montoCentavos,
    pagables.map((p) => ({ facturaId: p.ecfDocumentId!, saldo: saldoDe.get(p.ecfDocumentId!) ?? 0 })),
  );

  // Cómo se llama cada factura en la pantalla. Un e-NCF no le dice nada a
  // nadie; el concepto y el alumno sí.
  const porFactura = new Map<number, { encf: string | null; codigo: string | null; detalle: string[] }>();
  for (const p of pagables) {
    const k = p.ecfDocumentId!;
    const e = porFactura.get(k) ?? { encf: p.encf, codigo: p.codigo, detalle: [] };
    e.detalle.push(`${p.concepto} · ${p.nombres}`);
    porFactura.set(k, e);
  }

  const destinos: DestinoAplicacion[] = asignaciones.map((a) => {
    const f = porFactura.get(a.facturaId);
    return {
      facturaId: a.facturaId,
      encf: f?.encf ?? null,
      codigo: f?.codigo ?? null,
      montoCentavos: a.monto,
      detalle: [...new Set(f?.detalle ?? [])].join(', '),
    };
  });

  return {
    montoCentavos,
    destinos,
    aplicadoCentavos: destinos.reduce((s, d) => s + d.montoCentavos, 0),
    sinAplicarCentavos: sobrante,
    cargosSinFactura: [...new Set(sinFactura.map((s) => `${s.concepto} · ${s.nombres}`))],
  };
}

/**
 * La previa de aprobar: a dónde iría el dinero, sin tocar nada.
 *
 * Existe porque aprobar era un clic a ciegas que contaba el resultado DESPUÉS.
 * Quien revisa tiene el papel del banco delante y a veces dice otra cosa que
 * lo que el padre escribió — y corregirlo obligaba a rechazar y pedirle que
 * lo volviera a subir.
 */
export async function previsualizarAprobacion(
  teamId: number, id: number, montoCentavos?: number,
): Promise<PlanAplicacion & { declaradoCentavos: number; referencia: string | null; estado: string }> {
  const [c] = await db
    .select()
    .from(adminEscolarComprobantes)
    .where(and(
      eq(adminEscolarComprobantes.id, id),
      eq(adminEscolarComprobantes.teamId, teamId),
    ))
    .limit(1);
  if (!c) throw new ComprobanteError('Comprobante no encontrado');

  const monto = montoCentavos != null && montoCentavos > 0 ? montoCentavos : c.montoCentavos;
  const plan = await planDeAplicacion(teamId, c.cargos, monto);
  return { ...plan, declaradoCentavos: c.montoCentavos, referencia: c.referencia, estado: c.estado };
}

/**
 * Aprueba: registra el cobro contra las facturas de los cargos que cubre.
 *
 * Reparte por vencimiento, de lo más viejo a lo más nuevo, que es como se salda
 * una deuda. Si el padre transfirió menos que el total —cosa normal— lo que
 * llega tapa las cuotas más atrasadas primero, no las que él eligió: no eligió
 * nada, solo mandó un monto.
 *
 * `ajustes` es lo que el revisor corrigió mirando el papel del banco. El monto
 * del comprobante es lo que el padre DECLARÓ, y no siempre coincide.
 */
export async function aprobarComprobante(
  teamId: number, id: number, usuarioId: number, ajustes: AjustesAprobacion = {},
): Promise<ResultadoAprobacion> {
  /**
   * Se reclama ANTES de tocar dinero, no después.
   *
   * Antes esto leía el estado, registraba los pagos y recién entonces marcaba
   * el comprobante. Entre la lectura y la marca cabe otra petición entera: dos
   * empleados abriendo la lista y pulsando «aprobar» a la vez —que es lo que
   * pasa cuando llega el correo a la cuenta compartida del colegio— pasaban los
   * dos la comprobación y el cobro se registraba DOS VECES contra la factura.
   *
   * El `WHERE ... estado = 'pendiente'` lo decide la base: solo una de las dos
   * peticiones se lleva la fila. Es el mismo candado que ya usaba `rechazar`.
   */
  const [c] = await db.update(adminEscolarComprobantes)
    .set({ estado: 'aprobado', revisadoPor: usuarioId, revisadoEn: new Date() })
    .where(and(
      eq(adminEscolarComprobantes.id, id),
      eq(adminEscolarComprobantes.teamId, teamId),
      eq(adminEscolarComprobantes.estado, 'pendiente'),
    ))
    .returning();

  if (!c) {
    // No se distingue «no existe» de «ya lo revisaron»: desde la pantalla del
    // colegio el segundo caso es el único que ocurre, y es el que hay que leer.
    throw new ComprobanteError('El comprobante no existe o ya fue revisado.');
  }

  /**
   * Reclamado ya, el resto puede fallar —una factura anulada entremedio, S3, la
   * red— y hay que devolverlo a la cola. Marcado como aprobado sin cobro
   * registrado sería peor que el error: el padre queda como que pagó y en la
   * factura no hay nada.
   */
  try {
    const monto = ajustes.montoCentavos != null && ajustes.montoCentavos > 0
      ? ajustes.montoCentavos
      : c.montoCentavos;

    const plan = await planDeAplicacion(teamId, c.cargos, monto);

    const fecha = ajustes.fechaPago?.trim() || new Date().toISOString().slice(0, 10);
    const metodo = ajustes.metodo?.trim() || 'transferencia';
    const referencia = ajustes.referencia?.trim() || c.referencia;

    for (const d of plan.destinos) {
      await registrarPago({
        teamId,
        ecfDocumentId: d.facturaId,
        montoCentavos: d.montoCentavos,
        metodo,
        referencia,
        fechaPago: fecha,
        notas: `Comprobante #${c.id} aprobado`,
        createdBy: usuarioId,
      });
    }

    // Baja el saldo de los cargos desde lo que acaba de entrar en las facturas.
    if (plan.destinos.length > 0) await sincronizarSaldosDesdeFacturas(teamId);

    return {
      aplicadoCentavos: plan.aplicadoCentavos,
      sinAplicarCentavos: plan.sinAplicarCentavos,
      facturasTocadas: new Set(plan.destinos.map((d) => d.facturaId)).size,
      cargosSinFactura: plan.cargosSinFactura,
    };
  } catch (e) {
    await db.update(adminEscolarComprobantes)
      .set({ estado: 'pendiente', revisadoPor: null, revisadoEn: null })
      .where(eq(adminEscolarComprobantes.id, id));
    throw e;
  }
}

export async function rechazarComprobante(
  teamId: number, id: number, usuarioId: number, motivo: string,
): Promise<void> {
  const limpio = motivo.trim().slice(0, 500);
  if (!limpio) throw new ComprobanteError('Escribe por qué lo rechazas: el padre lo va a leer.');

  const [fila] = await db.update(adminEscolarComprobantes)
    .set({
      estado: 'rechazado', revisadoPor: usuarioId,
      revisadoEn: new Date(), motivoRechazo: limpio,
    })
    .where(and(
      eq(adminEscolarComprobantes.id, id),
      eq(adminEscolarComprobantes.teamId, teamId),
      eq(adminEscolarComprobantes.estado, 'pendiente'),
    ))
    .returning({ id: adminEscolarComprobantes.id });

  if (!fila) throw new ComprobanteError('El comprobante no existe o ya fue revisado.');
}
