/**
 * La fecha de emisión de la cuota emite la factura.
 *
 * El calendario del concepto ya dice, cuota por cuota, qué día toca cobrar. El
 * devengo lo usa para crear el CARGO ese día; esto da el paso que faltaba y
 * crea además su FACTURA, para que la deuda aparezca en cuentas por cobrar
 * como un documento y no como una anotación interna que alguien tiene que
 * convertir a mano.
 *
 * Por qué no se usa el plan recurrente, que ya existe: porque es la misma
 * información dicha dos veces. `facturas_recurrentes` guarda frecuencia, fecha
 * de inicio, día de cobro y próxima emisión — todo eso ya está en
 * `admin_escolar_concepto_cuotas`. Y se nota que sobra: de 409 matrículas en
 * producción, CERO tienen plan. Nadie configura dos veces lo mismo.
 *
 * Tres cosas que esto NO hace, a propósito:
 *
 *   1. No emite a la DGII. La factura nace BORRADOR, igual que la que hace la
 *      secretaria a mano y que las 424 facturas escolares que hay en
 *      producción, todas `sin-ncf`. Enviar a la DGII sigue siendo un acto
 *      deliberado.
 *   2. No factura hacia atrás. Solo entran las cuotas cuya emisión cae dentro
 *      del rango pedido, y el colegio no tiene facturación automática hasta
 *      que `escolar_facturacion_automatica_desde` tenga fecha.
 *   3. No factura lo que no tiene calendario. Inscripción, uniforme o materiales
 *      son pago único: sin cuota no hay fecha de emisión, y sin fecha de
 *      emisión no hay nada que dispare la factura.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptoCuotas,
  adminEscolarEstudiantes,
  ecfDocuments,
} from '@/lib/db/schema';
import { calcularTotales } from '@/lib/ecf/types';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago-calc';
import { prefillDeCargos, type LineaPrefill } from './prefill-factura';

/**
 * Las facturas escolares son `sin-ncf`: un documento interno con el que el
 * colegio cobra, sin comprobante fiscal. Es lo que ya elige el formulario
 * cuando se abre desde el colegio (`categoriaFija="factura-venta"`), y lo que
 * son las 424 facturas escolares que hay hoy en producción. Si el colegio
 * quiere una fiscal, edita el borrador y la emite.
 */
const TIPO_ECF = 'sin-ncf';

/** Estados de cargo que se pueden cobrar. Mismo criterio que el prefill. */
const COBRABLES = ['pendiente', 'parcial', 'vencido'];

export interface FacturaGenerada {
  documentoId: number;
  codigo: string;
  clienteId: number;
  cargoIds: number[];
  montoCentavos: number;
}

/** Por qué un grupo de cargos que tocaba facturar no se facturó. */
export interface DiagnosticoFacturacion {
  motivo: 'sin-responsable' | 'prefill-rechazado' | 'sin-lineas' | 'error';
  detalle: string;
  cargoIds: number[];
}

export interface ResultadoFacturacion {
  facturas: FacturaGenerada[];
  cargosFacturados: number;
  montoCentavos: number;
  diagnostico: DiagnosticoFacturacion[];
}

const vacio = (): ResultadoFacturacion => ({
  facturas: [], cargosFacturados: 0, montoCentavos: 0, diagnostico: [],
});

/** 'exento' y las tasas vienen como texto del catálogo; el motor las quiere en número. */
function tasaANumero(t: string): number | undefined {
  if (!t || t === 'exento') return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * La copia de las líneas que leen la pantalla, el PDF y los reportes.
 *
 * Se escribe con la MISMA forma que `lineasParaGuardar` en
 * `app/api/ecf/emitir/route.ts`. No es un detalle: 382 facturas del colegio
 * quedaron con `lineas_json` en NULL justamente porque una ruta la derivaba y
 * otra no, y el documento salía con su total correcto y la tabla de productos
 * vacía.
 */
function lineasParaGuardar(lineas: LineaPrefill[]): string {
  return JSON.stringify(lineas.map((l) => {
    const tasa = tasaANumero(l.tasaItbis) ?? 0;
    return {
      productoId: l.productoId,
      variantId: null,
      nombreItem: l.nombreItem,
      descripcionItem: '',
      cantidadItem: l.cantidadItem,
      precioUnitarioItem: l.precioUnitarioItem,
      descuentoMonto: 0,
      tasaItbis: tasa,
      subtotalConItbis: l.precioUnitarioItem * l.cantidadItem * (1 + tasa),
      unidadMedida: undefined,
      indicadorBienoServicio: Number(l.indicadorBienoServicio) || 2,
      dependienteId: l.dependienteId,
      dependienteNombre: l.dependienteNombre,
      // Aquí el vínculo ya va por `cargos.ecf_document_id`, escrito en la misma
      // transacción que crea el documento — no se puede perder. La clave viaja
      // igual porque quien LEE la factura después no sabe de qué transacción
      // salió: sea automática o hecha a mano, la línea dice a qué cuota
      // pertenece y eso se puede comprobar sin salir del documento.
      cuotaClave: l.cuotaClave,
    };
  }));
}

/**
 * Factura las cuotas cuya emisión cae en `[desde, hasta]`.
 *
 * Una factura por RESPONSABLE DE PAGO, no por alumno: el padre con tres hijos
 * recibe un documento con tres líneas, cada una con su beneficiario. Es lo que
 * ya hace el flujo manual —de ahí sale, es el mismo `prefillDeCargos`— y lo que
 * hizo la secretaria de Amisadai a mano: 60 facturas para 78 alumnos.
 *
 * Idempotente por construcción: solo mira cargos con `ecf_document_id` en NULL,
 * y el enlace se hace en la misma transacción que crea el documento con esa
 * condición repetida. Dos corridas a la vez no facturan dos veces.
 */
export async function facturarCuotasEmitidas(
  teamId: number,
  periodoId: number,
  rango: { desde: string; hasta: string },
): Promise<ResultadoFacturacion> {
  if (rango.desde > rango.hasta) return vacio();

  // Cargos cobrables, sin factura, cuya CUOTA se emite dentro del rango.
  //
  // El `innerJoin` con las cuotas es lo que deja fuera los cargos de pago único
  // (inscripción, uniforme): no tienen `cuota_id`, así que no tienen fecha de
  // emisión y nada los dispara. Se facturan cuando la familia pasa a pagarlos.
  const cargos = await db
    .select({
      id: adminEscolarCargos.id,
      estudianteId: adminEscolarCargos.estudianteId,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
      clienteId: adminEscolarEstudiantes.facturarAClientId,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptoCuotas, and(
      eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id),
      eq(adminEscolarConceptoCuotas.teamId, teamId),
    ))
    .innerJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.periodoId, periodoId),
      isNull(adminEscolarCargos.ecfDocumentId),
      isNotNull(adminEscolarCargos.cuotaId),
      inArray(adminEscolarCargos.estado, COBRABLES),
      gte(adminEscolarConceptoCuotas.fechaEmision, rango.desde),
      lte(adminEscolarConceptoCuotas.fechaEmision, rango.hasta),
    ))
    .orderBy(asc(adminEscolarCargos.id));

  if (cargos.length === 0) return vacio();

  // Una factura por responsable de pago. Los hermanos caen solos en el mismo
  // grupo porque comparten `facturar_a_client_id`.
  const porResponsable = new Map<number, typeof cargos>();
  const diagnostico: DiagnosticoFacturacion[] = [];
  const huerfanos: number[] = [];

  for (const c of cargos) {
    if (c.clienteId == null) { huerfanos.push(c.id); continue; }
    const grupo = porResponsable.get(c.clienteId) ?? [];
    grupo.push(c);
    porResponsable.set(c.clienteId, grupo);
  }

  if (huerfanos.length) {
    diagnostico.push({
      motivo: 'sin-responsable',
      detalle: `${huerfanos.length} cargo(s) de alumnos sin responsable de pago: no hay a quién facturarle.`,
      cargoIds: huerfanos,
    });
  }

  const facturas: FacturaGenerada[] = [];

  for (const [clienteId, grupo] of porResponsable) {
    const ids = grupo.map((c) => c.id);
    try {
      const factura = await facturarGrupo(teamId, clienteId, ids, grupo);
      if ('error' in factura) {
        diagnostico.push({ motivo: factura.motivo, detalle: factura.error, cargoIds: ids });
        continue;
      }
      facturas.push(factura);
    } catch (e: unknown) {
      // Una familia con la ficha a medias no puede dejar sin facturar a las
      // demás. Mismo criterio que el devengo: se anota y se sigue.
      diagnostico.push({
        motivo: 'error',
        detalle: e instanceof Error ? e.message : 'error desconocido',
        cargoIds: ids,
      });
    }
  }

  if (diagnostico.length) {
    console.warn(`[factura-emision] team ${teamId} período ${periodoId}: ${diagnostico.length} grupo(s) sin facturar`, diagnostico);
  }

  return {
    facturas,
    cargosFacturados: facturas.reduce((n, f) => n + f.cargoIds.length, 0),
    montoCentavos: facturas.reduce((n, f) => n + f.montoCentavos, 0),
    diagnostico,
  };
}

/** Una familia, una factura. */
async function facturarGrupo(
  teamId: number,
  clienteId: number,
  cargoIds: number[],
  grupo: { id: number; saldoCentavos: number; fechaVencimiento: string | null }[],
): Promise<FacturaGenerada | { error: string; motivo: DiagnosticoFacturacion['motivo'] }> {
  // El prefill es el mismo del flujo manual: resuelve el comprador, el producto
  // por la cadena de la tarifa, el ITBIS y el beneficiario de cada línea. Usarlo
  // aquí es lo que garantiza que la factura automática y la que hace la
  // secretaria a mano salgan iguales.
  const pre = await prefillDeCargos(teamId, cargoIds);
  if (!pre.ok) return { error: pre.error, motivo: 'prefill-rechazado' };

  const { comprador, opciones } = pre.datos;
  if (!comprador) {
    return { error: 'Ningún tutor del alumno está vinculado a un contacto.', motivo: 'prefill-rechazado' };
  }

  // El prefill ofrece además los otros cargos cobrables de los hermanos, para
  // que la secretaria pueda marcarlos. Aquí NO se marcan: automáticamente solo
  // se cobra lo que el calendario emitió hoy, no todo lo que la familia debe.
  const pedidos = new Set(cargoIds);
  const lineas = opciones.filter((o) => pedidos.has(o.cargoId)).map((o) => o.linea);
  if (lineas.length === 0) return { error: 'El prefill no devolvió líneas.', motivo: 'sin-lineas' };

  const totales = calcularTotales(lineas.map((l) => ({
    nombreItem: l.nombreItem,
    cantidadItem: l.cantidadItem,
    precioUnitarioItem: l.precioUnitarioItem,
    tasaItbis: tasaANumero(l.tasaItbis),
    indicadorBienoServicio: l.indicadorBienoServicio === '1' ? 1 : 2,
  })));

  const montoTotal = Math.round(totales.montoTotal * 100);
  const totalItbis = Math.round(totales.totalItbis * 100);
  if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
    return { error: 'Los cargos suman cero: no hay factura que emitir.', motivo: 'sin-lineas' };
  }

  /**
   * El plazo de la factura es el del cargo que más tarde vence.
   *
   * En la práctica todas las líneas son la misma cuota del mismo mes y comparten
   * vencimiento. Cuando no —una familia con dos conceptos de plazos distintos—,
   * se toma el más largo: una factura no puede estar vencida mientras alguna de
   * sus líneas todavía tiene días para pagarse.
   */
  const vencimientos = grupo.map((c) => c.fechaVencimiento).filter((v): v is string => !!v);
  const fechaLimitePago = vencimientos.length ? vencimientos.sort().at(-1)! : null;

  // Crédito cuando hay plazo. Es lo que la convierte en cuenta por cobrar, que
  // es justo lo que se pide: la factura sale el día de la emisión y el padre
  // tiene hasta su vencimiento para pagarla.
  const tipoPago = fechaLimitePago ? 2 : 1;
  const estadoPago = calcularEstadoPago({ estado: 'BORRADOR', tipoPago, montoTotal, totalPagado: 0 });

  // Fuera de la transacción, como todas las demás llamadas: el contador de
  // códigos lleva su propio candado y no necesita el de aquí.
  const codigo = await generarCodigoFactura(db, { teamId, userId: null, tipoEcf: TIPO_ECF });

  return db.transaction(async (tx) => {
    // Un solo facturador a la vez por familia. Sin esto, el cron y un clic en
    // «Cargos del mes» pueden leer los mismos cargos sin factura y crear dos.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${teamId}, ${clienteId})`);

    const [doc] = await tx.insert(ecfDocuments).values({
      teamId,
      clientId: comprador.clienteId,
      // sin-ncf no reserva comprobante, así que el e-NCF va vacío: un
      // `BOR-…` daría un identificador con pinta de fiscal a un documento que
      // nunca va a tener uno. Mismo criterio que el alta manual.
      encf: '',
      codigo,
      tipoEcf: TIPO_ECF,
      estado: 'BORRADOR',
      estadoPago,
      tipoPago,
      fechaLimitePago,
      // El RNC y la razón social salen del contacto. Si el padre quiere la
      // factura a nombre de su empresa, se edita el borrador — que para eso
      // nace en borrador y el RNC vive aparte del cliente.
      rncComprador: comprador.rnc,
      razonSocialComprador: comprador.razonSocial || null,
      emailComprador: comprador.email,
      montoTotal,
      totalItbis,
      lineasJson: lineasParaGuardar(lineas),
      createdBy: null,
      fechaEmision: new Date(),
    }).returning({ id: ecfDocuments.id });

    // El enlace repite la condición `ecf_document_id IS NULL`. Si otra corrida
    // ganó la carrera y ya facturó alguno, aquí faltará una fila y toda la
    // transacción se deshace: mejor sin factura que con el cargo cobrado dos
    // veces en dos documentos.
    const enlazados = await tx.update(adminEscolarCargos)
      .set({ ecfDocumentId: doc.id, updatedAt: new Date() })
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        inArray(adminEscolarCargos.id, cargoIds),
        isNull(adminEscolarCargos.ecfDocumentId),
      ))
      .returning({ id: adminEscolarCargos.id });

    if (enlazados.length !== cargoIds.length) {
      throw new Error(
        `Se iban a facturar ${cargoIds.length} cargo(s) y solo ${enlazados.length} seguían sin factura; no se crea el documento.`,
      );
    }

    return {
      documentoId: doc.id,
      codigo,
      clienteId: comprador.clienteId,
      cargoIds,
      montoCentavos: montoTotal,
    };
  });
}
