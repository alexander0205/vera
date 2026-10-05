/**
 * Buscador global — todas las fuentes, en un solo viaje.
 *
 * Antes cada fuente se pedía desde el navegador a su propia ruta de listado
 * (`/api/facturas?search=`, `/api/clientes?search=`…). Eso tenía tres
 * problemas y los tres se arreglan aquí:
 *
 *  1. Las rutas de listado NO comprueban permiso de lectura (mirar
 *     app/api/clientes/route.ts: solo sesión + team). El buscador terminaba
 *     enseñando clientes a quien no tiene `clientes:ver`.
 *  2. Cada ruta llama a su parámetro como quiere —`?search=` en facturas,
 *     `?q=` en clientes y productos— y el buscador mandaba `search` a las
 *     tres: clientes y productos ignoraban el texto y devolvían SIEMPRE las
 *     primeras filas del catálogo. Escribieras lo que escribieras.
 *  3. Los listados hacen trabajo pesado que una búsqueda al vuelo no
 *     necesita: el de estudiantes, por ejemplo, sincroniza los saldos de todas
 *     las facturas del colegio (una ESCRITURA) y calcula las estadísticas del
 *     centro entero antes de devolver cinco nombres.
 *
 * Reglas que valen para TODAS las fuentes de este archivo:
 *
 *   · Toda consulta lleva su `teamId`. Un buscador que cruce empresas es una
 *     fuga de datos entre clientes, no un bug de UI.
 *   · Cada fuente declara el permiso que exige y el módulo al que pertenece.
 *     Si el rol no puede verlo, o la empresa no tiene ese módulo, la consulta
 *     ni siquiera se lanza.
 *   · Tope por grupo: nadie usa una lista plana de doscientas filas.
 */

import 'server-only';
import { and, eq, or, ilike, desc, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  clients,
  cotizaciones,
  ecfDocuments,
  products,
  adminEscolarEstudiantes,
  adminEscolarTutores,
  teamMembers,
  users,
} from '@/lib/db/schema';
import { getUserModules, type ModuleKey } from '@/lib/auth/modules';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { ALL_PERMISSIONS, type Permission } from '@/lib/config/roles';
import { coincideDocumento, fmtDocumento } from '@/lib/busqueda/documento';
import { resolverFamilias, type VinculoFamilia } from '@/lib/busqueda/familias';
import {
  TIPOS_RESULTADO,
  TITULO_GRUPO,
  MIN_CARACTERES,
  type TipoResultado,
  type ResultadoBusqueda,
  type GrupoResultados,
} from '@/lib/busqueda/tipos';

export { MIN_CARACTERES };
export type { TipoResultado, ResultadoBusqueda, GrupoResultados };

/**
 * A qué módulo pertenece cada grupo. Sirve para dos cosas: no consultar lo que
 * la empresa no tiene contratado, y poner primero lo del módulo donde estás
 * parado —buscar dentro de Colegios y que lo primero sean facturas es ruido—.
 *
 * Productos aparece en dos: es el mismo catálogo para Facturación y para el
 * POS, y en el POS es de lo que más se busca.
 */
const MODULOS_GRUPO: Record<TipoResultado, readonly ModuleKey[]> = {
  cliente:     ['facturacion'],
  factura:     ['facturacion'],
  cotizacion:  ['facturacion'],
  producto:    ['facturacion', 'pos'],
  venta:       ['pos'],
  estudiante:  ['escolar'],
  responsable: ['escolar'],
  usuario:     ['administracion'],
};

/** Permiso de LECTURA que exige cada grupo. */
const PERMISO_GRUPO: Record<TipoResultado, Permission> = {
  cliente:     'clientes:ver',
  factura:     'facturas:ver',
  cotizacion:  'cotizaciones:ver',
  producto:    'productos:ver',
  venta:       'pos:vender',
  estudiante:  'administracion-escolar:ver',
  responsable: 'administracion-escolar:ver',
  usuario:     'equipo:ver',
};

/** Tope de filas por grupo. */
const TOPE = 5;

/** Escapa los comodines de LIKE para que un `%` escrito no se lleve toda la tabla. */
function patron(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function pesos(centavos: number | null | undefined): string {
  return `RD$ ${((centavos ?? 0) / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

/**
 * Cuántas personas se traen antes de decidir a qué ficha lleva cada una. Más
 * que el tope de la lista porque varias coincidencias acaban siendo la MISMA
 * persona (contacto y tutor a la vez) y se funden en un renglón.
 */
const CANDIDATOS_FAMILIA = 20;

interface Contexto {
  teamId: number;
  q: string;
  p: string;
  /** ¿Puede ver facturas? Decide a dónde lleva una venta del POS. */
  verFacturas: boolean;
  /**
   * Buscando desde Gobernanza, y con permiso para ver a las familias.
   *
   * Ahí el padre ya sale en «Padres y responsables», que lo lleva a su ficha
   * del colegio. Repetirlo debajo como «Cliente» ofrecía dos renglones con el
   * mismo nombre, y el segundo abría el formulario de Contactos de
   * Facturación: quien buscaba a un padre acababa editando un cliente.
   */
  familiasAparte: boolean;
}

// ─── Fuentes ─────────────────────────────────────────────────────────────────
// Cada una: filtra por teamId, ordena por lo más útil y corta en TOPE.

async function buscarClientes({ teamId, p, q, familiasAparte }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({ id: clients.id, razonSocial: clients.razonSocial, rnc: clients.rnc, email: clients.email })
    .from(clients)
    .where(and(
      eq(clients.teamId, teamId),
      or(
        ilike(clients.razonSocial, p), ilike(clients.rnc, p), ilike(clients.email, p),
        // Por documento, se haya guardado con guiones o sin ellos.
        coincideDocumento(clients.rnc, q) ?? undefined,
      ),
      // Dentro de Gobernanza, quien es familia del colegio sale en su grupo y
      // no aquí. Familia = le facturan a un alumno, o es tutor de alguno.
      familiasAparte
        ? sql`NOT EXISTS (
            SELECT 1 FROM ${adminEscolarEstudiantes}
             WHERE ${adminEscolarEstudiantes.facturarAClientId} = ${clients.id}
               AND ${adminEscolarEstudiantes.teamId} = ${teamId}
          ) AND NOT EXISTS (
            SELECT 1 FROM ${adminEscolarTutores}
             WHERE ${adminEscolarTutores.clientId} = ${clients.id}
               AND ${adminEscolarTutores.teamId} = ${teamId}
          )`
        : undefined,
    ))
    .orderBy(clients.razonSocial)
    .limit(TOPE);
  return filas.map((c) => ({
    tipo: 'cliente' as const,
    id: c.id,
    label: c.razonSocial,
    sublabel: fmtDocumento(c.rnc) ?? c.email ?? 'Sin RNC',
    // `/dashboard/clientes/:id` NO existe —la única pantalla de un contacto
    // suelto es su ficha de edición— y enlazar ahí daba un 404. El listado
    // tampoco sirve: no lee ningún parámetro de búsqueda, así que llevaría a
    // la primera página sin el contacto que se acaba de elegir.
    href: `/dashboard/clientes/${c.id}/editar`,
  }));
}

/**
 * Facturas de Facturación. Los recibos del POS quedan fuera (`tipo_orden` es lo
 * único que estampa el punto de venta) porque tienen su propio grupo: sin ese
 * corte, cobrar en el POS metía la misma fila dos veces en la lista.
 * Las notas de crédito y débito tampoco: tienen su propia pantalla.
 */
async function buscarFacturas({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({
      id: ecfDocuments.id,
      encf: ecfDocuments.encf,
      codigo: ecfDocuments.codigo,
      cliente: ecfDocuments.razonSocialComprador,
      monto: ecfDocuments.montoTotal,
      estado: ecfDocuments.estado,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      isNull(ecfDocuments.tipoOrden),
      sql`${ecfDocuments.tipoEcf} NOT IN ('33', '34')`,
      or(
        ilike(ecfDocuments.encf, p),
        ilike(ecfDocuments.codigo, p),
        ilike(ecfDocuments.razonSocialComprador, p),
      ),
    ))
    .orderBy(desc(ecfDocuments.fechaEmision))
    .limit(TOPE);
  return filas.map((f) => ({
    tipo: 'factura' as const,
    id: f.id,
    // El e-NCF puede venir en blanco —hay facturas guardadas con la columna
    // vacía, no solo con el BOR- de borrador— y la fila salía sin título, un
    // renglón mudo que no se podía leer ni pulsar con confianza.
    label: f.encf || f.codigo || `Factura #${f.id}`,
    sublabel: `${f.cliente ?? 'Sin cliente'} · ${pesos(f.monto)}`,
    href: `/dashboard/facturas/${f.id}`,
  }));
}

async function buscarCotizaciones({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({
      id: cotizaciones.id,
      numero: cotizaciones.numero,
      cliente: cotizaciones.razonSocialComprador,
      monto: cotizaciones.montoTotal,
    })
    .from(cotizaciones)
    .where(and(
      eq(cotizaciones.teamId, teamId),
      or(ilike(cotizaciones.numero, p), ilike(cotizaciones.razonSocialComprador, p)),
    ))
    .orderBy(desc(cotizaciones.createdAt))
    .limit(TOPE);
  return filas.map((c) => ({
    tipo: 'cotizacion' as const,
    id: c.id,
    label: c.numero,
    sublabel: `${c.cliente ?? 'Sin cliente'} · ${pesos(c.monto)}`,
    href: `/dashboard/cotizaciones/${c.id}`,
  }));
}

/** Productos: por nombre, por SKU y por código de barras (en el POS se busca con lector). */
async function buscarProductos({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({
      id: products.id,
      nombre: products.nombre,
      referencia: products.referencia,
      precio: products.precio,
    })
    .from(products)
    .where(and(
      eq(products.teamId, teamId),
      or(ilike(products.nombre, p), ilike(products.referencia, p), ilike(products.codigoBarras, p)),
    ))
    .orderBy(products.nombre)
    .limit(TOPE);
  return filas.map((pr) => ({
    tipo: 'producto' as const,
    id: pr.id,
    label: pr.nombre,
    sublabel: `${pesos(pr.precio)}${pr.referencia ? ` · ${pr.referencia}` : ''}`,
    href: `/dashboard/productos/${pr.id}`,
  }));
}

/**
 * Ventas del POS = los comprobantes que salieron del punto de venta.
 *
 * El recibo no tiene pantalla propia en el POS (solo el historial del turno),
 * así que quien además pueda ver facturas va al documento —que es la misma
 * fila— y quien no, al historial.
 */
async function buscarVentas({ teamId, p, verFacturas }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({
      id: ecfDocuments.id,
      codigo: ecfDocuments.codigo,
      encf: ecfDocuments.encf,
      cliente: ecfDocuments.razonSocialComprador,
      monto: ecfDocuments.montoTotal,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      isNotNull(ecfDocuments.tipoOrden),
      or(
        ilike(ecfDocuments.codigo, p),
        ilike(ecfDocuments.encf, p),
        ilike(ecfDocuments.razonSocialComprador, p),
      ),
    ))
    .orderBy(desc(ecfDocuments.fechaEmision))
    .limit(TOPE);
  return filas.map((v) => ({
    tipo: 'venta' as const,
    id: v.id,
    label: v.codigo || v.encf || `Recibo #${v.id}`,
    sublabel: `${v.cliente ?? 'Mostrador'} · ${pesos(v.monto)}`,
    href: verFacturas ? `/dashboard/facturas/${v.id}` : '/pos/historial',
  }));
}

/**
 * Estudiantes. Mismos campos por los que busca el listado del módulo —nombres,
 * apellidos, el nombre completo aunque esté partido en dos columnas, y el
 * código— pero SIN el resto del listado: allí la misma llamada sincroniza los
 * saldos del colegio entero y calcula estadísticas, y eso no puede correr en
 * cada pulsación de tecla.
 *
 * Y por su documento, que en un menor es el código RNE: no tiene cédula.
 *
 * Buscar por el nombre del padre no hace falta aquí: para eso está el grupo
 * «Padres y responsables», que sale justo debajo y lleva a la ficha de quien
 * paga.
 */
async function buscarEstudiantes({ teamId, p, q }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({
      id: adminEscolarEstudiantes.id,
      codigo: adminEscolarEstudiantes.codigo,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      estado: adminEscolarEstudiantes.estado,
      // A quién se le factura. Sin esto, dos hermanos con el mismo apellido son
      // dos renglones idénticos y hay que abrir los dos para saber cuál es.
      responsable: clients.razonSocial,
    })
    .from(adminEscolarEstudiantes)
    .leftJoin(clients, and(
      eq(clients.id, adminEscolarEstudiantes.facturarAClientId),
      eq(clients.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      or(
        ilike(adminEscolarEstudiantes.nombres, p),
        ilike(adminEscolarEstudiantes.apellidos, p),
        ilike(sql`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`, p),
        ilike(adminEscolarEstudiantes.codigo, p),
        ilike(adminEscolarEstudiantes.codigoRne, p),
        coincideDocumento(adminEscolarEstudiantes.codigoRne, q) ?? undefined,
      ),
    ))
    // Los activos primero. Con cinco huecos, la ficha repetida y ya retirada
    // de un alumno no puede salir por delante de la que se usa.
    .orderBy(
      sql`(${adminEscolarEstudiantes.estado} = 'activo') DESC`,
      adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres,
    )
    .limit(TOPE);
  return filas.map((e) => ({
    tipo: 'estudiante' as const,
    id: e.id,
    label: `${e.nombres} ${e.apellidos}`,
    sublabel: [
      e.codigo,
      e.responsable,
      e.estado !== 'activo' ? e.estado : null,
    ].filter(Boolean).join(' · ') || 'Estudiante',
    href: `/escolar/estudiantes/${e.id}`,
  }));
}

/**
 * Padres y responsables de pago.
 *
 * Dos fuentes, porque una persona entra al colegio de dos maneras:
 *
 *   · como CONTACTO al que se le factura —el padrón es el de Facturación, y la
 *     familia se reconoce por tener un alumno que le factura a ella; el
 *     ferretero que le vende al colegio no sale—,
 *   · como TUTOR de un alumno, pague o no.
 *
 * Antes solo se miraba la primera, así que el padre que no paga no existía
 * para el buscador. Ahora se encuentran los dos y los dos llevan al mismo
 * sitio: la ficha del responsable de pago del hijo. A cuál exactamente lo
 * decide `resolverFamilias`.
 *
 * Por nombre, por correo o por documento —cédula o RNC, con guiones o sin—.
 *
 * Una sola consulta: los tutores se buscan por lo escrito Y por ser el
 * contacto de alguien que ya coincidió, para que un padre que figura con un
 * nombre en Contactos y otro en su ficha de tutor siga siendo una persona.
 */
async function buscarResponsables({ teamId, p, q }: Contexto): Promise<ResultadoBusqueda[]> {
  const docContacto = coincideDocumento(sql`c.rnc`, q);
  const docTutor = coincideDocumento(sql`t.documento`, q);
  const coincideContacto = sql`(c.razon_social ILIKE ${p} OR c.rnc ILIKE ${p} OR c.email ILIKE ${p}${
    docContacto ? sql` OR ${docContacto}` : sql``})`;
  const coincideTutor = sql`(t.nombre ILIKE ${p} OR t.documento ILIKE ${p} OR t.email ILIKE ${p}${
    docTutor ? sql` OR ${docTutor}` : sql``})`;

  const filas = await db.execute(sql`
    WITH pagadores AS (
      SELECT c.id, c.razon_social, c.rnc
        FROM clients c
       WHERE c.team_id = ${teamId} AND ${coincideContacto}
         AND EXISTS (SELECT 1 FROM admin_escolar_estudiantes e
                      WHERE e.facturar_a_client_id = c.id AND e.team_id = ${teamId})
       ORDER BY c.razon_social
       LIMIT ${CANDIDATOS_FAMILIA}
    ),
    tutores AS (
      SELECT t.id, t.client_id, t.nombre, t.documento
        FROM admin_escolar_tutores t
       WHERE t.team_id = ${teamId}
         AND (${coincideTutor} OR t.client_id IN (SELECT id FROM pagadores))
       ORDER BY t.nombre
       LIMIT ${CANDIDATOS_FAMILIA}
    )
    -- Por quién paga cada contacto.
    SELECT pg.id AS persona_client_id, NULL::int AS tutor_id,
           pg.razon_social AS nombre, pg.rnc AS documento, NULL::text AS relacion,
           e.id AS estudiante_id,
           -- Solo los nombres: «paga por Ana y Luis» ya lleva el apellido en
           -- quien paga, y con cinco renglones no sobra el ancho.
           e.nombres AS alumno,
           (e.estado = 'activo') AS activo,
           pg.id AS destino_id, pg.razon_social AS destino,
           true AS pagador_asignado
      FROM pagadores pg
      JOIN admin_escolar_estudiantes e
        ON e.facturar_a_client_id = pg.id AND e.team_id = ${teamId}
    UNION ALL
    -- De quién es padre o tutor cada uno, y quién paga por ese hijo.
    SELECT t.client_id, t.id, t.nombre, t.documento, et.relacion,
           e.id,
           e.nombres,
           COALESCE(e.estado = 'activo', false),
           d.id, d.razon_social,
           (e.facturar_a_client_id IS NOT NULL)
      FROM tutores t
      LEFT JOIN admin_escolar_estudiante_tutores et
        ON et.tutor_id = t.id AND et.team_id = ${teamId}
      LEFT JOIN admin_escolar_estudiantes e
        ON e.id = et.estudiante_id AND e.team_id = ${teamId}
      -- Sin responsable de pago puesto se cae al contacto del propio tutor:
      -- mejor su ficha que ningún sitio al que ir.
      LEFT JOIN clients d
        ON d.id = COALESCE(e.facturar_a_client_id, t.client_id) AND d.team_id = ${teamId}
  `);

  const vinculos: VinculoFamilia[] = (filas as unknown as Record<string, unknown>[]).map((r) => ({
    personaClientId: r.persona_client_id == null ? null : Number(r.persona_client_id),
    tutorId: r.tutor_id == null ? null : Number(r.tutor_id),
    nombre: String(r.nombre ?? ''),
    documento: (r.documento as string) ?? null,
    relacion: (r.relacion as string) ?? null,
    estudianteId: r.estudiante_id == null ? null : Number(r.estudiante_id),
    alumno: r.alumno == null ? null : String(r.alumno).trim(),
    activo: r.activo === true,
    destinoId: r.destino_id == null ? null : Number(r.destino_id),
    destino: (r.destino as string) ?? null,
    pagadorAsignado: r.pagador_asignado === true,
  }));

  return resolverFamilias(vinculos, TOPE);
}

/** Usuarios del equipo. Solo los de ESTA empresa: el join va por team_members. */
async function buscarUsuarios({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({ id: users.id, nombre: users.name, email: users.email, rol: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      isNull(users.deletedAt),
      or(ilike(users.name, p), ilike(users.email, p)),
    ))
    .orderBy(users.email)
    .limit(TOPE);
  return filas.map((u) => ({
    tipo: 'usuario' as const,
    id: u.id,
    label: u.nombre || u.email,
    sublabel: `${u.email} · ${u.rol}`,
    href: '/cuenta/usuarios',
  }));
}

const FUENTES: Record<TipoResultado, (ctx: Contexto) => Promise<ResultadoBusqueda[]>> = {
  cliente:     buscarClientes,
  factura:     buscarFacturas,
  cotizacion:  buscarCotizaciones,
  producto:    buscarProductos,
  venta:       buscarVentas,
  estudiante:  buscarEstudiantes,
  responsable: buscarResponsables,
  usuario:     buscarUsuarios,
};

/**
 * Busca en todo lo que este usuario puede ver de esta empresa.
 *
 * `moduloActual` solo cambia el ORDEN: lo del módulo donde estás parado sale
 * primero. No amplía ni recorta lo que se busca — eso lo deciden los módulos
 * de la empresa y los permisos del rol, y nada más.
 */
export async function buscarGlobal(opts: {
  teamId: number;
  platformRole: string | null | undefined;
  teamRole: string | null | undefined;
  q: string;
  moduloActual?: ModuleKey | null;
}): Promise<GrupoResultados[]> {
  const q = opts.q.trim();
  if (q.length < MIN_CARACTERES) return [];

  // Módulos y permisos, una sola vez para todas las fuentes (ambos memoizados
  // por request, así que esto no vuelve a tocar la base).
  const [modulos, permisos] = await Promise.all([
    getUserModules(opts.teamId, opts.platformRole, opts.teamRole),
    opts.platformRole === 'admin'
      ? Promise.resolve<Permission[]>([...ALL_PERMISSIONS])
      : getEffectivePermissions(opts.teamId, opts.teamRole),
  ]);

  const permitidos = TIPOS_RESULTADO.filter((t) =>
    MODULOS_GRUPO[t].some((m) => modulos.includes(m)) && permisos.includes(PERMISO_GRUPO[t]));

  // El módulo donde estás parado, primero. El resto conserva el orden del
  // catálogo (TIPOS_RESULTADO), que ya va de lo más usado a lo menos.
  const orden = opts.moduloActual
    ? [
        ...permitidos.filter((t) => MODULOS_GRUPO[t].includes(opts.moduloActual!)),
        ...permitidos.filter((t) => !MODULOS_GRUPO[t].includes(opts.moduloActual!)),
      ]
    : permitidos;

  const ctx: Contexto = {
    teamId: opts.teamId,
    q,
    p: patron(q),
    verFacturas: permisos.includes('facturas:ver'),
    familiasAparte: opts.moduloActual === 'escolar' && permitidos.includes('responsable'),
  };

  // En paralelo, no en cadena: son varias consultas por pulsación y en fila
  // sumarían sus latencias. Una fuente que falle devuelve vacío en vez de
  // tumbar la búsqueda entera.
  const listas = await Promise.all(
    orden.map((t) => FUENTES[t](ctx).catch(() => [] as ResultadoBusqueda[])),
  );

  return orden
    .map((tipo, i) => ({ tipo, titulo: TITULO_GRUPO[tipo], items: listas[i] }))
    .filter((g) => g.items.length > 0);
}
