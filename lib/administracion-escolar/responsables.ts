/**
 * Las familias que pagan: los contactos del colegio, vistos como quien paga.
 *
 * Sigue la misma filosofía que Estudiantes: el módulo no inventa un padrón
 * propio, se apoya en el que ya existe en Facturación. Allí el contacto es «un
 * cliente» y aquí es «la familia», con sus hijos colgando y una sola deuda.
 *
 * La lista son los contactos que YA son responsables de pago de algún alumno
 * del módulo —los que se trajeron desde Estudiantes—. Los demás contactos con
 * beneficiarios no se mezclan: viven en el filtro «Sin ficha», que es la cola
 * de trabajo de a quién falta por traer.
 *
 * Las dos deudas van SEPARADAS a propósito:
 *   · la escolar sale de los cargos —el plan de cobro del módulo—,
 *   · la de facturas sale de documentos emitidos en Facturación que no cuelgan
 *     de ningún cargo.
 * Sumarlas en una cifra daría un número que no cuadra con ninguna de las dos
 * pantallas donde se puede comprobar.
 */

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { avisosProgramadosDeEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';

export interface FilaResponsable {
  clientId: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  whatsapp: string | null;
  /** Alumnos del módulo que le facturan a este contacto. */
  alumnos: number;
  /** Beneficiarios en Contactos: los hijos que el colegio ya le factura. */
  beneficiarios: number;
  /** Saldo vivo de los cargos de sus alumnos. */
  deudaEscolarCentavos: number;
  /** Saldo de sus facturas que no salieron de ningún cargo. */
  deudaFacturasCentavos: number;
  /** El vencimiento más viejo sin pagar, para saber a quién llamar primero. */
  venceMasViejo: string | null;
}

export interface ListaResponsables {
  filas: FilaResponsable[];
  total: number;
  /** Cuántos no tienen NINGÚN canal por el que avisarles. */
  incontactables: number;
  /** Contactos con beneficiarios que aún no tienen alumno en el módulo. */
  sinFicha: number;
  /** Las cifras de la cabecera, del colegio entero y no de la página. */
  stats: {
    familias: number;
    conDeuda: number;
    deudaTotalCentavos: number;
    incontactables: number;
  };
}

/**
 * `sin-ficha` son los contactos a los que el colegio ya factura pero que
 * todavía no tienen ningún alumno del módulo: los que faltan por traer desde
 * Estudiantes. Se dejan a un lado y no mezclados, igual que allí.
 */
export type FiltroResponsables = 'con-deuda' | 'sin-contacto' | 'sin-ficha' | 'todos';

export async function listarResponsables(
  teamId: number,
  opts: { q?: string; filtro?: FiltroResponsables; limit?: number; offset?: number } = {},
): Promise<ListaResponsables> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q?.trim();
  const filtro = opts.filtro ?? 'todos';

  // Un contacto entra en la lista si el colegio le factura a alguien: o tiene
  // un alumno asignado, o tiene beneficiarios. El ferretero que le vende al
  // colegio no es una familia y no pinta nada aquí.
  const base = sql`
    SELECT c.id, c.razon_social, c.rnc, c.email, c.telefono, c.celular, c.whatsapp,
           COALESCE(a.alumnos, 0)::int                    AS alumnos,
           COALESCE(b.beneficiarios, 0)::int              AS beneficiarios,
           COALESCE(a.deuda, 0)::bigint                   AS deuda_escolar,
           COALESCE(f.saldo, 0)::bigint                   AS deuda_facturas,
           a.vence_mas_viejo::text                        AS vence_mas_viejo
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT e.id) AS alumnos,
               SUM(g.saldo_centavos) AS deuda,
               MIN(g.fecha_vencimiento) FILTER (WHERE g.saldo_centavos > 0) AS vence_mas_viejo
          FROM admin_escolar_estudiantes e
          LEFT JOIN admin_escolar_cargos g
                 ON g.estudiante_id = e.id AND g.team_id = ${teamId}
                AND g.estado <> 'anulado' AND g.saldo_centavos > 0
         WHERE e.facturar_a_client_id = c.id AND e.team_id = ${teamId}
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS beneficiarios
          FROM dependientes d
         WHERE d.client_id = c.id AND d.team_id = ${teamId}
      ) b ON true
      LEFT JOIN LATERAL (
        -- Facturas del contacto sin cargo escolar detrás: lo que se le cobró
        -- por fuera del plan y que ninguna pantalla del módulo contaba.
        SELECT SUM(GREATEST(0, x.monto_total - COALESCE(p.pagado, 0))) AS saldo
          FROM ecf_documents x
          LEFT JOIN LATERAL (
            SELECT SUM(pr.monto_centavos) AS pagado FROM pagos_recibidos pr
             WHERE pr.ecf_document_id = x.id AND pr.team_id = ${teamId}
          ) p ON true
         WHERE x.client_id = c.id AND x.team_id = ${teamId}
           AND x.estado <> 'ANULADO'
           AND NOT EXISTS (SELECT 1 FROM admin_escolar_cargos g2 WHERE g2.ecf_document_id = x.id)
      ) f ON true
     WHERE c.team_id = ${teamId}
       AND (COALESCE(a.alumnos, 0) > 0 OR COALESCE(b.beneficiarios, 0) > 0)
  `;

  /**
   * Por defecto solo los que SON responsables de un alumno del módulo.
   *
   * Antes salían los 306 contactos con beneficiarios y la pantalla se leía como
   * «el colegio tiene 306 familias», cuando 302 de ellas ni siquiera tienen
   * ficha escolar todavía. Los que faltan por traer viven en su propio filtro.
   */
  const soloConFicha = filtro === 'sin-ficha'
    ? sql`alumnos = 0`
    : sql`alumnos > 0`;

  const conBusqueda = q
    ? sql`${base} AND (c.razon_social ILIKE ${'%' + q + '%'} OR c.rnc ILIKE ${'%' + q + '%'})`
    : base;
  /** Las cifras de arriba NO se recortan con la búsqueda: son del colegio. */
  const sinFiltroDeTexto = base;

  // «Sin contacto» = no hay por dónde escribirle. Es el filtro que de verdad
  // se usa: sin correo ni celular ni WhatsApp, ningún recordatorio sale.
  const sinCanal = sql`(COALESCE(NULLIF(email,''), NULLIF(celular,''), NULLIF(whatsapp,'')) IS NULL)`;
  const extra = filtro === 'sin-contacto'
    ? sql` AND ${sinCanal}`
    : filtro === 'con-deuda'
      ? sql` AND (deuda_escolar + deuda_facturas) > 0`
      : sql``;
  const conFiltro = sql`SELECT * FROM (${conBusqueda}) t WHERE ${soloConFicha}${extra}`;

  const [filas, conteo] = await Promise.all([
    db.execute(sql`
      ${conFiltro}
       ORDER BY (deuda_escolar + deuda_facturas) DESC, razon_social ASC
       LIMIT ${limit} OFFSET ${offset}`),
    // Los contadores de la cabecera se cuentan sobre TODAS las familias con
    // ficha, no sobre el filtro ni la página: si cambiaran al filtrar, dejarían
    // de servir para saber cómo va el colegio.
    db.execute(sql`
      SELECT count(*) FILTER (WHERE ${soloConFicha})::int                     total,
             count(*) FILTER (WHERE ${soloConFicha} AND ${sinCanal})::int     incontactables,
             count(*) FILTER (WHERE alumnos = 0)::int                         sin_ficha,
             count(*) FILTER (WHERE alumnos > 0)::int                         familias,
             count(*) FILTER (WHERE alumnos > 0
               AND (deuda_escolar + deuda_facturas) > 0)::int                 con_deuda,
             COALESCE(SUM(deuda_escolar + deuda_facturas)
               FILTER (WHERE alumnos > 0), 0)::bigint                         deuda_total,
             count(*) FILTER (WHERE alumnos > 0 AND ${sinCanal})::int         sin_canal
        FROM (${sinFiltroDeTexto}) t`),
  ]);

  const c0 = ((conteo as unknown as Record<string, unknown>[])[0] ?? {}) as Record<string, number>;

  return {
    filas: (filas as unknown as Record<string, unknown>[]).map((r) => ({
      clientId: Number(r.id),
      razonSocial: String(r.razon_social ?? ''),
      rnc: (r.rnc as string) ?? null,
      email: (r.email as string) ?? null,
      telefono: (r.telefono as string) ?? null,
      celular: (r.celular as string) ?? null,
      whatsapp: (r.whatsapp as string) ?? null,
      alumnos: Number(r.alumnos ?? 0),
      beneficiarios: Number(r.beneficiarios ?? 0),
      deudaEscolarCentavos: Number(r.deuda_escolar ?? 0),
      deudaFacturasCentavos: Number(r.deuda_facturas ?? 0),
      venceMasViejo: (r.vence_mas_viejo as string) ?? null,
    })),
    total: Number(c0.total ?? 0),
    incontactables: Number(c0.incontactables ?? 0),
    sinFicha: Number(c0.sin_ficha ?? 0),
    stats: {
      familias: Number(c0.familias ?? 0),
      conDeuda: Number(c0.con_deuda ?? 0),
      deudaTotalCentavos: Number(c0.deuda_total ?? 0),
      incontactables: Number(c0.sin_canal ?? 0),
    },
  };
}

/** Un hijo de la familia, con lo que debe. */
export interface HijoResponsable {
  estudianteId: number | null;
  nombre: string;
  curso: string | null;
  estado: string | null;
  deudaCentavos: number;
  cargos: number;
}

export interface DetalleResponsable {
  clientId: number;
  /** Los datos del contacto: la ficha completa se abre sin pedirlos aparte. */
  contacto: {
    razonSocial: string; rnc: string | null; email: string | null;
    telefono: string | null; celular: string | null; whatsapp: string | null;
    direccion: string | null;
  } | null;
  hijos: HijoResponsable[];
  /** Facturas suyas sin cargo escolar detrás, con su saldo. */
  facturas: {
    id: number; codigo: string | null; encf: string | null; fecha: string;
    montoTotal: number; pagadoCentavos: number;
  }[];
  /** Los que TODAVÍA no han salido, con la fecha en que les toca. */
  avisosProgramados: {
    estudianteId: number; alumno: string; fecha: string; tipo: string;
    canales: string[]; concepto: string | null; montoCentavos: number;
  }[];
  /** Últimos recordatorios que se le mandaron, por cualquiera de sus hijos. */
  avisos: {
    id: number; enviadoAt: string; tipo: string; canal: string;
    destino: string | null; alumno: string; concepto: string | null;
  }[];
  /** El estado de cuenta: todo lo que se le ha cargado, por hijo. */
  cargos: {
    id: number; alumno: string; concepto: string | null; mes: number | null; anio: number;
    fechaVencimiento: string | null; montoCentavos: number; saldoCentavos: number;
    estado: string; encf: string | null; codigo: string | null; ecfDocumentId: number | null;
  }[];
  /**
   * La mensualidad automática de cada hijo.
   *
   * Es lo que explica por qué van a ir apareciendo cargos sin que nadie los
   * cree: si el plan está pausado, la familia deja de recibir facturas y nadie
   * se entera hasta que falta el dinero.
   */
  recurrentes: {
    matriculaId: number; alumno: string; periodo: string | null;
    facturaRecurrenteId: number | null; nombre: string | null; estado: string | null;
    diaCobro: number | null; proximaEmision: string | null;
  }[];
  /** Todo lo que ha pagado, venga del plan de cobro o de una factura suelta. */
  pagos: {
    id: number; fechaPago: string; metodo: string | null; referencia: string | null;
    montoCentavos: number; ecfDocumentId: number; encf: string | null; codigo: string | null;
    alumno: string | null;
  }[];
}

/**
 * El detalle de una familia: sus hijos, sus facturas sueltas y sus avisos.
 *
 * Va aparte del listado y solo se pide al abrir una: son tres consultas más
 * por familia, y en una lista de trescientas eso es lo que convierte una
 * pantalla en una espera.
 */
export async function detalleResponsable(
  teamId: number,
  clientId: number,
): Promise<DetalleResponsable> {
  const [contacto, hijos, facturas, avisos, cargos, pagos, recurrentes] = await Promise.all([
    db.execute(sql`
      SELECT razon_social, rnc, email, telefono, celular, whatsapp, direccion
        FROM clients WHERE id = ${clientId} AND team_id = ${teamId} LIMIT 1`),
    db.execute(sql`
      SELECT e.id, e.nombres, e.apellidos, e.estado,
             (SELECT cu.nombre || ' · ' || gr.nombre
                FROM admin_escolar_matriculas m
                JOIN admin_escolar_cursos cu ON cu.id = m.curso_id
                JOIN admin_escolar_grados gr ON gr.id = cu.grado_id
               WHERE m.estudiante_id = e.id AND m.team_id = ${teamId}
                 AND m.estado = 'activa'
               ORDER BY m.periodo_id DESC LIMIT 1)                    AS curso,
             COALESCE(SUM(g.saldo_centavos), 0)::bigint               AS deuda,
             count(g.id)::int                                         AS cargos
        FROM admin_escolar_estudiantes e
        LEFT JOIN admin_escolar_cargos g
               ON g.estudiante_id = e.id AND g.team_id = ${teamId}
              AND g.estado <> 'anulado' AND g.saldo_centavos > 0
       WHERE e.team_id = ${teamId} AND e.facturar_a_client_id = ${clientId}
       GROUP BY e.id, e.nombres, e.apellidos, e.estado
       ORDER BY e.nombres`),

    db.execute(sql`
      SELECT x.id, x.codigo, x.encf, x.fecha_emision, x.monto_total,
             COALESCE((SELECT SUM(pr.monto_centavos) FROM pagos_recibidos pr
                        WHERE pr.ecf_document_id = x.id AND pr.team_id = ${teamId}), 0)::int AS pagado
        FROM ecf_documents x
       WHERE x.client_id = ${clientId} AND x.team_id = ${teamId}
         AND x.estado <> 'ANULADO'
         AND NOT EXISTS (SELECT 1 FROM admin_escolar_cargos g WHERE g.ecf_document_id = x.id)
       ORDER BY x.fecha_emision DESC
       LIMIT 50`),

    db.execute(sql`
      SELECT v.id, v.enviado_at, v.tipo, v.canal, v.destino,
             e.nombres || ' ' || COALESCE(e.apellidos, '') AS alumno,
             p.nombre AS concepto
        FROM admin_escolar_avisos_enviados v
        JOIN admin_escolar_cargos g ON g.id = v.cargo_id
        JOIN admin_escolar_estudiantes e ON e.id = g.estudiante_id
        LEFT JOIN admin_escolar_conceptos_pago p ON p.id = g.concepto_id
       WHERE v.team_id = ${teamId} AND e.facturar_a_client_id = ${clientId}
       ORDER BY v.enviado_at DESC
       LIMIT 50`),

    /**
     * El estado de cuenta de la familia: todos los cargos de todos sus hijos.
     *
     * Los anulados se quedan fuera: existen en el historial del alumno pero no
     * son deuda de nadie, y en la cuenta de la familia solo confunden.
     */
    db.execute(sql`
      SELECT g.id, g.mes, g.anio, g.fecha_vencimiento, g.monto_centavos,
             g.saldo_centavos, g.estado, g.ecf_document_id,
             e.nombres || ' ' || COALESCE(e.apellidos, '') AS alumno,
             p.nombre AS concepto, x.encf, x.codigo
        FROM admin_escolar_cargos g
        JOIN admin_escolar_estudiantes e ON e.id = g.estudiante_id
        LEFT JOIN admin_escolar_conceptos_pago p ON p.id = g.concepto_id
        LEFT JOIN ecf_documents x ON x.id = g.ecf_document_id
       WHERE g.team_id = ${teamId} AND e.facturar_a_client_id = ${clientId}
         AND g.estado <> 'anulado'
       ORDER BY g.anio DESC, g.mes DESC NULLS LAST, g.id DESC
       LIMIT 300`),

    /**
     * Lo cobrado, venga por donde venga.
     *
     * Se sale de las FACTURAS del contacto y no de los cargos: un pago se
     * registra sobre la factura, y buscarlo a través del cargo dejaba fuera
     * todo lo que se le cobró por fuera del plan.
     */
    db.execute(sql`
      SELECT pr.id, pr.fecha_pago, pr.metodo, pr.referencia, pr.monto_centavos,
             x.id AS ecf_document_id, x.encf, x.codigo,
             (SELECT e2.nombres || ' ' || COALESCE(e2.apellidos, '')
                FROM admin_escolar_cargos g2
                JOIN admin_escolar_estudiantes e2 ON e2.id = g2.estudiante_id
               WHERE g2.ecf_document_id = x.id LIMIT 1) AS alumno
        FROM pagos_recibidos pr
        JOIN ecf_documents x ON x.id = pr.ecf_document_id
       WHERE pr.team_id = ${teamId} AND x.client_id = ${clientId}
       ORDER BY pr.fecha_pago DESC, pr.id DESC
       LIMIT 200`),

    // La mensualidad automática de cada matrícula activa de sus hijos.
    db.execute(sql`
      SELECT m.id AS matricula_id, m.factura_recurrente_id,
             e.nombres || ' ' || COALESCE(e.apellidos, '') AS alumno,
             pe.nombre AS periodo,
             fr.nombre, fr.estado, fr.dia_cobro, fr.proxima_emision
        FROM admin_escolar_matriculas m
        JOIN admin_escolar_estudiantes e ON e.id = m.estudiante_id
        LEFT JOIN admin_escolar_periodos pe ON pe.id = m.periodo_id
        LEFT JOIN facturas_recurrentes fr ON fr.id = m.factura_recurrente_id
       WHERE m.team_id = ${teamId} AND e.facturar_a_client_id = ${clientId}
         AND m.estado = 'activa'
       ORDER BY e.nombres`),
  ]);

  const filas = (r: unknown) => r as unknown as Record<string, unknown>[];

  const c = filas(contacto)[0];

  /**
   * Lo que le va a salir a cada hijo, con la misma cuenta que usa el cron.
   *
   * Va después y no dentro del `Promise.all` porque hace falta saber quiénes
   * son los hijos. Son dos o tres consultas cortas, no un bucle largo.
   */
  const programados = (await Promise.all(
    filas(hijos).map(async (h) => {
      const id = Number(h.id);
      const nombre = `${h.nombres ?? ''} ${h.apellidos ?? ''}`.trim();
      const suyos = await avisosProgramadosDeEstudiante(teamId, id);
      return suyos.map((a) => ({ ...a, estudianteId: id, alumno: nombre }));
    }),
  )).flat().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  return {
    clientId,
    contacto: c ? {
      razonSocial: String(c.razon_social ?? ''),
      rnc: (c.rnc as string) ?? null,
      email: (c.email as string) ?? null,
      telefono: (c.telefono as string) ?? null,
      celular: (c.celular as string) ?? null,
      whatsapp: (c.whatsapp as string) ?? null,
      direccion: (c.direccion as string) ?? null,
    } : null,
    hijos: filas(hijos).map((h) => ({
      estudianteId: Number(h.id),
      nombre: `${h.nombres ?? ''} ${h.apellidos ?? ''}`.trim(),
      curso: (h.curso as string) ?? null,
      estado: (h.estado as string) ?? null,
      deudaCentavos: Number(h.deuda ?? 0),
      cargos: Number(h.cargos ?? 0),
    })),
    facturas: filas(facturas).map((f) => ({
      id: Number(f.id),
      codigo: (f.codigo as string) ?? null,
      encf: (f.encf as string) ?? null,
      fecha: new Date(f.fecha_emision as string).toISOString(),
      montoTotal: Number(f.monto_total ?? 0),
      pagadoCentavos: Number(f.pagado ?? 0),
    })),
    cargos: filas(cargos).map((g) => ({
      id: Number(g.id),
      alumno: String(g.alumno ?? '').trim(),
      concepto: (g.concepto as string) ?? null,
      mes: g.mes == null ? null : Number(g.mes),
      anio: Number(g.anio ?? 0),
      fechaVencimiento: g.fecha_vencimiento ? String(g.fecha_vencimiento) : null,
      montoCentavos: Number(g.monto_centavos ?? 0),
      saldoCentavos: Number(g.saldo_centavos ?? 0),
      estado: String(g.estado ?? ''),
      encf: (g.encf as string) ?? null,
      codigo: (g.codigo as string) ?? null,
      ecfDocumentId: g.ecf_document_id == null ? null : Number(g.ecf_document_id),
    })),
    pagos: filas(pagos).map((x) => ({
      id: Number(x.id),
      fechaPago: String(x.fecha_pago),
      metodo: (x.metodo as string) ?? null,
      referencia: (x.referencia as string) ?? null,
      montoCentavos: Number(x.monto_centavos ?? 0),
      ecfDocumentId: Number(x.ecf_document_id),
      encf: (x.encf as string) ?? null,
      codigo: (x.codigo as string) ?? null,
      alumno: x.alumno ? String(x.alumno).trim() : null,
    })),
    recurrentes: filas(recurrentes).map((r) => ({
      matriculaId: Number(r.matricula_id),
      alumno: String(r.alumno ?? '').trim(),
      periodo: (r.periodo as string) ?? null,
      facturaRecurrenteId: r.factura_recurrente_id == null ? null : Number(r.factura_recurrente_id),
      nombre: (r.nombre as string) ?? null,
      estado: (r.estado as string) ?? null,
      diaCobro: r.dia_cobro == null ? null : Number(r.dia_cobro),
      proximaEmision: r.proxima_emision ? String(r.proxima_emision) : null,
    })),
    avisosProgramados: programados.map((a) => ({
      estudianteId: a.estudianteId,
      alumno: a.alumno,
      fecha: a.fecha,
      tipo: a.tipo,
      canales: a.canales,
      concepto: a.concepto,
      montoCentavos: a.montoCentavos,
    })),
    avisos: filas(avisos).map((a) => ({
      id: Number(a.id),
      enviadoAt: new Date(a.enviado_at as string).toISOString(),
      tipo: String(a.tipo),
      canal: String(a.canal),
      destino: (a.destino as string) ?? null,
      alumno: String(a.alumno ?? '').trim(),
      concepto: (a.concepto as string) ?? null,
    })),
  };
}
