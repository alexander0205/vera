/**
 * Qué permiso pide `/api/export/listado` según la pantalla que exporta.
 *
 * El exporte genérico solo pinta las filas que manda el navegador, pero sin
 * permiso cualquiera con sesión podía sacar un PDF/Excel con el nombre de la
 * empresa (revisión del PR #126). Cada pantalla ya exige su permiso de «ver»;
 * se pide el mismo, así no se bloquea a nadie que pueda ver la pantalla: el
 * personal del colegio exporta con `administracion-escolar:ver`, el de nómina
 * con `empleados:ver`. Lo de facturación pide `facturas:exportar`, como los
 * exportes propios de Facturas y Cuentas por cobrar.
 *
 * El navegador manda la ruta (`location.pathname`); una ruta que no está aquí
 * se rechaza, así que una pantalla nueva con exporte tiene que sumarse.
 */
import type { Permission } from '@/lib/config/roles';

/** Prefijo de ruta → permisos (basta uno). El más largo que coincida manda. */
export const PERMISO_POR_RUTA: Record<string, Permission[]> = {
  '/dashboard/almacenes':           ['productos:ver'],
  '/dashboard/caja':                ['caja:ver'],
  '/dashboard/categorias':          ['productos:ver'],
  '/dashboard/clientes':            ['clientes:ver'],
  '/dashboard/compras':             ['compras:ver', 'productos:gestionar'],
  '/dashboard/cotizaciones':        ['cotizaciones:ver'],
  '/dashboard/cuentas-por-cobrar':  ['facturas:exportar'],
  '/dashboard/facturas-recurrentes':['facturas:exportar'],
  '/dashboard/inventario':          ['productos:ver'],
  '/dashboard/listas-precios':      ['productos:ver'],
  '/dashboard/maestros':            ['productos:ver'],
  '/dashboard/notas-credito':       ['facturas:exportar'],
  '/dashboard/notas-debito':        ['facturas:exportar'],
  '/dashboard/pos-terminales':      ['pos:configurar'],
  '/dashboard/productos':           ['productos:ver'],
  '/dashboard/secuencias':          ['configuracion:gestionar', 'contabilidad:ver'],
  '/dashboard/vendedores':          ['facturas:ver'],
  '/contabilidad':                  ['contabilidad:ver'],
  '/escolar':                       ['administracion-escolar:ver'],
  '/nomina':                        ['empleados:ver'],
  '/pos':                           ['pos:vender', 'caja:ver'],
};

export function permisosDeRuta(ruta: unknown): Permission[] | null {
  if (typeof ruta !== 'string' || !ruta.startsWith('/')) return null;
  const limpia = ruta.split(/[?#]/)[0];
  let mejor: string | null = null;
  for (const prefijo of Object.keys(PERMISO_POR_RUTA)) {
    if ((limpia === prefijo || limpia.startsWith(`${prefijo}/`)) && (!mejor || prefijo.length > mejor.length)) {
      mejor = prefijo;
    }
  }
  return mejor ? PERMISO_POR_RUTA[mejor] : null;
}
