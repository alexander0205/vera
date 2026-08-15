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
  teamMembers,
  users,
} from '@/lib/db/schema';
import { getUserModules, type ModuleKey } from '@/lib/auth/modules';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { ALL_PERMISSIONS, type Permission } from '@/lib/config/roles';
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

interface Contexto {
  teamId: number;
  q: string;
  p: string;
  /** ¿Puede ver facturas? Decide a dónde lleva una venta del POS. */
  verFacturas: boolean;
}

// ─── Fuentes ─────────────────────────────────────────────────────────────────
// Cada una: filtra por teamId, ordena por lo más útil y corta en TOPE.

async function buscarClientes({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({ id: clients.id, razonSocial: clients.razonSocial, rnc: clients.rnc, email: clients.email })
    .from(clients)
    .where(and(
      eq(clients.teamId, teamId),
      or(ilike(clients.razonSocial, p), ilike(clients.rnc, p), ilike(clients.email, p)),
    ))
    .orderBy(clients.razonSocial)
    .limit(TOPE);
  return filas.map((c) => ({
    tipo: 'cliente' as const,
    id: c.id,
    label: c.razonSocial,
    sublabel: c.rnc ? `RNC ${c.rnc}` : (c.email ?? 'Sin RNC'),
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
 * Buscar por el nombre del padre no hace falta aquí: para eso está el grupo
 * «Responsables de pago», que sale justo debajo.
 */
async function buscarEstudiantes({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
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
      ),
    ))
    .orderBy(adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres)
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
 * Responsables de pago: el contacto al que el colegio le factura.
 *
 * No son una tabla propia —el módulo se apoya en el padrón de Facturación—,
 * así que la familia se reconoce por tener al menos un alumno que le factura a
 * ella. El ferretero que le vende al colegio no es una familia y no sale.
 */
async function buscarResponsables({ teamId, p }: Contexto): Promise<ResultadoBusqueda[]> {
  const filas = await db
    .select({ id: clients.id, razonSocial: clients.razonSocial, rnc: clients.rnc, email: clients.email })
    .from(clients)
    .where(and(
      eq(clients.teamId, teamId),
      or(ilike(clients.razonSocial, p), ilike(clients.rnc, p), ilike(clients.email, p)),
      sql`EXISTS (
        SELECT 1 FROM ${adminEscolarEstudiantes}
        WHERE ${adminEscolarEstudiantes.facturarAClientId} = ${clients.id}
          AND ${adminEscolarEstudiantes.teamId} = ${teamId}
      )`,
    ))
    .orderBy(clients.razonSocial)
    .limit(TOPE);
  return filas.map((r) => ({
    tipo: 'responsable' as const,
    id: r.id,
    label: r.razonSocial,
    sublabel: r.rnc ? `RNC ${r.rnc}` : (r.email ?? 'Familia del colegio'),
    href: `/escolar/responsables/${r.id}`,
  }));
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
