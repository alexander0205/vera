/**
 * El link de pago que se le manda al padre.
 *
 * Una página pública, sin sesión, donde ve todo lo que debe por todos sus hijos
 * a la vez, copia los datos de la transferencia y sube el comprobante. El
 * colegio lo aprueba después.
 *
 * Dos decisiones que sostienen el resto:
 *
 * 1. El link es del RESPONSABLE DE PAGO, no del cargo ni del estudiante. Un
 *    padre con tres hijos recibe un enlace, no tres, y transfiere una vez. Es
 *    también la única forma de que la referencia bancaria sea estable.
 *
 * 2. La deuda se calcula al abrir, nunca se congela. Entre el aviso y el clic
 *    pueden pasar semanas: pudo pagar en la caja del colegio, o pudo vencerse
 *    otra cuota. Enseñar una foto vieja hace que transfiera de menos o de más.
 */

import 'server-only';
import { randomBytes } from 'crypto';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import { teamHasModule } from '@/lib/auth/modules';
import { and, eq, gt, ne, asc, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarLinksPago,
  adminEscolarDatosPago,
  adminEscolarCuentasBanco,
  adminEscolarComprobantes,
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarConceptosPago,
  clients,
  teams,
  ecfDocuments,
} from '@/lib/db/schema';

/**
 * Referencia bancaria: `ZER-8F32A1`.
 *
 * Sin I, O, 0 ni 1. El padre la copia a mano en el concepto de la transferencia
 * desde el teléfono, y el cajero del banco la teclea otra vez: un cero y una O
 * confundidos son una transferencia que el colegio no puede casar con nadie.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generarReferencia(): string {
  const bytes = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return `ZER-${s}`;
}

/** 32 bytes en base64url. Es la única credencial de la página. */
export function generarToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * El link de un responsable, creándolo la primera vez.
 *
 * Idempotente por el único `(team_id, client_id)`: si dos avisos salen a la vez
 * para el mismo padre —cosa que pasa, son cinco cargos en la misma tanda— no se
 * crean dos enlaces con dos referencias distintas.
 */
/**
 * ¿Ya tiene enlace este responsable? Sin crearlo.
 *
 * Existe para poder AVISAR antes de crear. `getOCrearLink` es cómodo pero
 * siempre deja fila, y la pantalla necesita distinguir «te copio el que ya
 * tienes» de «voy a crear uno nuevo» ANTES de hacerlo — si no, el colegio
 * genera enlaces sin enterarse cada vez que hace clic por curiosidad.
 */
export async function buscarLink(teamId: number, clientId: number): Promise<{
  token: string; referencia: string;
} | null> {
  const [ya] = await db
    .select({ token: adminEscolarLinksPago.token, referencia: adminEscolarLinksPago.referencia })
    .from(adminEscolarLinksPago)
    .where(and(
      eq(adminEscolarLinksPago.teamId, teamId),
      eq(adminEscolarLinksPago.clientId, clientId),
    ))
    .limit(1);
  return ya ?? null;
}

export async function getOCrearLink(teamId: number, clientId: number): Promise<{
  token: string; referencia: string;
}> {
  const [ya] = await db
    .select({ token: adminEscolarLinksPago.token, referencia: adminEscolarLinksPago.referencia })
    .from(adminEscolarLinksPago)
    .where(and(
      eq(adminEscolarLinksPago.teamId, teamId),
      eq(adminEscolarLinksPago.clientId, clientId),
    ))
    .limit(1);
  if (ya) return ya;

  const [creado] = await db
    .insert(adminEscolarLinksPago)
    .values({ teamId, clientId, token: generarToken(), referencia: generarReferencia() })
    .onConflictDoNothing({ target: [adminEscolarLinksPago.teamId, adminEscolarLinksPago.clientId] })
    .returning({ token: adminEscolarLinksPago.token, referencia: adminEscolarLinksPago.referencia });
  if (creado) return creado;

  // Perdió la carrera contra otro envío de la misma tanda: el suyo ya está.
  const [otro] = await db
    .select({ token: adminEscolarLinksPago.token, referencia: adminEscolarLinksPago.referencia })
    .from(adminEscolarLinksPago)
    .where(and(
      eq(adminEscolarLinksPago.teamId, teamId),
      eq(adminEscolarLinksPago.clientId, clientId),
    ))
    .limit(1);
  if (!otro) throw new Error('No se pudo crear el link de pago');
  return otro;
}

/**
 * El enlace completo de un token.
 *
 * `base` se pasa cuando se está contestando a un navegador: entonces es el
 * origen real de esa petición y no puede no cuadrar. Sin ella se usa la del
 * despliegue, que es la misma que va dentro del botón de la plantilla — antes
 * eran dos variables distintas y el padre y el colegio podían acabar con dos
 * URL diferentes del mismo enlace.
 */
export function urlDelLink(token: string, base?: string): string {
  return `${(base ?? baseDeEnlaces()).replace(/\/+$/, '')}/pagar/${token}`;
}

// ─── Lo que ve la página ─────────────────────────────────────────────────────

export interface CargoPendiente {
  cargoId: number;
  concepto: string;
  estudiante: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  vencido: boolean;
}

export interface ComprobanteEnEspera {
  id: number;
  montoCentavos: number;
  estado: string;
  creadoEn: string;
  motivoRechazo: string | null;
}

export interface CuentaBanco {
  id: number;
  banco: string;
  tipoCuenta: string | null;
  numeroCuenta: string;
  titular: string | null;
  /** RNC o cédula del titular de ESTA cuenta, ya resuelto contra el del colegio. */
  documento: string | null;
}

export interface DatosTransferencia {
  /** Todas las cuentas activas, en su orden. El padre elige la de su banco. */
  cuentas: CuentaBanco[];
  instrucciones: string | null;
  /** Sin ninguna cuenta activa no se puede pedir una transferencia. */
  completo: boolean;
}

export interface VistaLinkPago {
  referencia: string;
  colegio: {
    nombre: string;
    logo: string | null;
    telefonoAyuda: string | null;
    horarioAyuda: string | null;
  };
  responsable: {
    nombre: string;
    email: string | null;
    telefono: string | null;
  };
  estudiantes: string[];
  cargos: CargoPendiente[];
  totalCentavos: number;
  transferencia: DatosTransferencia;
  comprobantes: ComprobanteEnEspera[];
  /** Hay uno subido esperando al colegio: se enseña el aviso naranja. */
  hayPendiente: boolean;
  /**
   * El enlace abierto para UNA factura concreta, no para todo lo que debe la
   * familia. Cuando está, la página cobra solo esa factura y su importe; los
   * demás cargos del responsable ni se muestran ni entran en el total. `null` es
   * el enlace de siempre, agregado por responsable.
   */
  facturaScope: { id: number; encf: string | null; codigo: string | null } | null;
}

/** Contexto interno: lo que las rutas necesitan y la página no enseña. */
export interface LinkResuelto {
  linkId: number;
  teamId: number;
  clientId: number;
  referencia: string;
  vista: VistaLinkPago;
}

function hoyISO(): string {
  // Fecha de RD. `toISOString()` en un servidor UTC adelanta el día a partir de
  // las 8 p.m. locales y marcaría como vencido lo que vence mañana.
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }))
    .toISOString()
    .slice(0, 10);
}

/**
 * Todo lo de la página en un viaje por tabla. Devuelve null si el token no
 * existe o el colegio lo revocó — la página no distingue los dos casos a
 * propósito: un token inválido y uno revocado dan la misma pantalla, para no
 * confirmarle a nadie que un token existió.
 */
export async function resolverLink(
  token: string,
  facturaScopeId?: number,
): Promise<LinkResuelto | null> {
  const [link] = await db
    .select({
      id:         adminEscolarLinksPago.id,
      teamId:     adminEscolarLinksPago.teamId,
      clientId:   adminEscolarLinksPago.clientId,
      referencia: adminEscolarLinksPago.referencia,
      estado:     adminEscolarLinksPago.estado,
      colegio:    teams.name,
      nombreComercial: teams.nombreComercial,
      logo:       teams.logo,
      cliente:    clients.razonSocial,
      email:      clients.email,
      telefono:   clients.telefono,
      celular:    clients.celular,
    })
    .from(adminEscolarLinksPago)
    .innerJoin(teams, eq(teams.id, adminEscolarLinksPago.teamId))
    .innerJoin(clients, eq(clients.id, adminEscolarLinksPago.clientId))
    .where(eq(adminEscolarLinksPago.token, token))
    .limit(1);

  if (!link || link.estado !== 'abierto') return null;

  /**
   * El enlace vale mientras el colegio tenga el módulo.
   *
   * Va aquí y no en cada pantalla porque las dos puertas de esto son públicas
   * —la página del padre y la subida del comprobante— y no llevan sesión que
   * las guarde. Un colegio que se da de baja dejaría enlaces vivos por ahí:
   * páginas con nombres de menores y una deuda, y una subida de archivos a
   * nuestro S3, cobrando por un servicio que ya no paga.
   *
   * Devuelve `null`, igual que un token que no existe: quien llame contesta un
   * 404 y el enlace deja de existir sin explicarle a nadie por qué.
   */
  if (!(await teamHasModule(link.teamId, 'escolar'))) return null;

  /**
   * Enlace de UNA factura, no de todo lo que debe la familia.
   *
   * Se valida que la factura sea de ESTE responsable —mismo team y su
   * `client_id`— antes de acotar nada. Un id de otra familia no se acota a sus
   * cargos: deja la lista vacía (no se enseña la deuda agregada de nadie). Si se
   * pidió acotar pero la factura no es del responsable, se fuerza un id
   * imposible para que no se cuele el enlace agregado.
   */
  let facturaScope: { id: number; encf: string | null; codigo: string | null } | null = null;
  // Los cargos de ESA factura, pagados o no. Sirve para acotar también los
  // comprobantes: en la página de una factura solo aparece el pago de esa
  // factura, no un «Pago confirmado» de otra cuota de la misma familia.
  let facturaCargoIds: Set<number> | null = null;
  const acotaFactura = facturaScopeId != null && Number.isInteger(facturaScopeId);
  if (acotaFactura) {
    const [f] = await db
      .select({ id: ecfDocuments.id, encf: ecfDocuments.encf, codigo: ecfDocuments.codigo })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.id, facturaScopeId!),
        eq(ecfDocuments.teamId, link.teamId),
        eq(ecfDocuments.clientId, link.clientId),
      ))
      .limit(1);
    facturaScope = f ?? null;

    facturaCargoIds = new Set<number>();
    if (facturaScope) {
      const filasFactura = await db
        .select({ id: adminEscolarCargos.id })
        .from(adminEscolarCargos)
        .where(and(
          eq(adminEscolarCargos.teamId, link.teamId),
          eq(adminEscolarCargos.ecfDocumentId, facturaScope.id),
        ));
      for (const r of filasFactura) facturaCargoIds.add(r.id);
    }
  }
  const scopeCondition = acotaFactura
    ? eq(adminEscolarCargos.ecfDocumentId, facturaScope?.id ?? -1)
    : undefined;

  const [cargos, datos, cuentas, comprobantes] = await Promise.all([
    db
      .select({
        cargoId:          adminEscolarCargos.id,
        concepto:         adminEscolarConceptosPago.nombre,
        nombres:          adminEscolarEstudiantes.nombres,
        apellidos:        adminEscolarEstudiantes.apellidos,
        fechaVencimiento: adminEscolarCargos.fechaVencimiento,
        saldoCentavos:    adminEscolarCargos.saldoCentavos,
      })
      .from(adminEscolarCargos)
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
      .innerJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
      .where(and(
        eq(adminEscolarCargos.teamId, link.teamId),
        // Los alumnos que le facturan a ESTE responsable. Es el mismo criterio
        // que usa el motor de avisos para decidir a quién escribirle.
        eq(adminEscolarEstudiantes.facturarAClientId, link.clientId),
        gt(adminEscolarCargos.saldoCentavos, 0),
        ne(adminEscolarCargos.estado, 'anulado'),
        ne(adminEscolarCargos.estado, 'pagado'),
        // Enlace de una factura: solo sus cargos. `undefined` cuando el enlace
        // es el agregado de siempre, y `and()` lo ignora.
        scopeCondition,
      ))
      .orderBy(asc(adminEscolarCargos.fechaVencimiento), asc(adminEscolarCargos.id)),

    db
      .select()
      .from(adminEscolarDatosPago)
      .where(eq(adminEscolarDatosPago.teamId, link.teamId))
      .limit(1),

    db
      .select({
        id:           adminEscolarCuentasBanco.id,
        banco:        adminEscolarCuentasBanco.banco,
        tipoCuenta:   adminEscolarCuentasBanco.tipoCuenta,
        numeroCuenta: adminEscolarCuentasBanco.numeroCuenta,
        titular:      adminEscolarCuentasBanco.titular,
        documento:    adminEscolarCuentasBanco.documento,
      })
      .from(adminEscolarCuentasBanco)
      .where(and(
        eq(adminEscolarCuentasBanco.teamId, link.teamId),
        eq(adminEscolarCuentasBanco.activa, true),
      ))
      .orderBy(asc(adminEscolarCuentasBanco.orden), asc(adminEscolarCuentasBanco.id)),

    db
      .select({
        id:            adminEscolarComprobantes.id,
        montoCentavos: adminEscolarComprobantes.montoCentavos,
        estado:        adminEscolarComprobantes.estado,
        creadoEn:      adminEscolarComprobantes.creadoEn,
        motivoRechazo: adminEscolarComprobantes.motivoRechazo,
        cargos:        adminEscolarComprobantes.cargos,
      })
      .from(adminEscolarComprobantes)
      .where(eq(adminEscolarComprobantes.linkId, link.id))
      .orderBy(desc(adminEscolarComprobantes.id))
      .limit(10),
  ]);

  // En la página de una factura, solo sus comprobantes: los que tocaron alguno
  // de sus cargos. Sin acotar, todos los del responsable (el enlace agregado).
  const comprobantesVista = facturaCargoIds
    ? comprobantes.filter((c) => Array.isArray(c.cargos)
        && c.cargos.some((x) => facturaCargoIds!.has(x.cargoId)))
    : comprobantes;

  const hoy = hoyISO();
  const filas: CargoPendiente[] = cargos.map((c) => ({
    cargoId: c.cargoId,
    concepto: c.concepto,
    estudiante: `${c.nombres} ${c.apellidos ?? ''}`.trim(),
    fechaVencimiento: c.fechaVencimiento ? String(c.fechaVencimiento) : null,
    montoCentavos: c.saldoCentavos,
    vencido: c.fechaVencimiento != null && String(c.fechaVencimiento) < hoy,
  }));

  const d = datos[0];
  const transferencia: DatosTransferencia = {
    // El documento se resuelve aquí y no en la pantalla: la página del padre no
    // tiene por qué saber que existe una herencia.
    cuentas: cuentas.map((c) => ({ ...c, documento: c.documento ?? d?.documento ?? null })),
    instrucciones: d?.instrucciones ?? null,
    // Sin ninguna cuenta no hay nada que copiar: la página esconde el panel en
    // vez de enseñar una tabla de guiones.
    completo: Boolean(d?.aceptaTransferencia && cuentas.length > 0),
  };

  return {
    linkId: link.id,
    teamId: link.teamId,
    clientId: link.clientId,
    referencia: link.referencia,
    vista: {
      referencia: link.referencia,
      colegio: {
        nombre: link.nombreComercial || link.colegio,
        logo: link.logo ?? null,
        telefonoAyuda: d?.telefonoAyuda ?? null,
        horarioAyuda: d?.horarioAyuda ?? null,
      },
      responsable: {
        nombre: link.cliente,
        email: link.email ?? null,
        telefono: link.telefono ?? link.celular ?? null,
      },
      estudiantes: [...new Set(filas.map((f) => f.estudiante))],
      cargos: filas,
      totalCentavos: filas.reduce((a, f) => a + f.montoCentavos, 0),
      transferencia,
      comprobantes: comprobantesVista.map((c) => ({
        id: c.id,
        montoCentavos: c.montoCentavos,
        estado: c.estado,
        creadoEn: c.creadoEn.toISOString(),
        motivoRechazo: c.motivoRechazo,
      })),
      hayPendiente: comprobantesVista.some((c) => c.estado === 'pendiente'),
      facturaScope,
    },
  };
}

/** Deja constancia de que el padre abrió el enlace. */
export async function marcarAcceso(linkId: number): Promise<void> {
  await db
    .update(adminEscolarLinksPago)
    .set({ ultimoAcceso: new Date() })
    .where(eq(adminEscolarLinksPago.id, linkId));
}
