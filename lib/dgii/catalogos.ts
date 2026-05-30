/**
 * Helpers para los catálogos DGII almacenados localmente en Postgres.
 *
 * Fuente original: ecf-api /v1/catalogos/*. Sincronizados semanalmente por
 * /api/cron/dgii-catalogos-sync. Los lookups locales eliminan ~15 round-trips
 * de red por carga de formulario (provincias, municipios, monedas, etc.).
 *
 * Fallback: si la tabla local está vacía (cron aún no ha corrido o falló),
 * cada helper consulta ecf-api directamente — graceful degradation.
 */

import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { dgiiCatalogos } from '@/lib/db/schema';
import { catalogos as remote, type CatalogItemDto } from '@/lib/ecf-api/client';

/** Tag para invalidar la caché de Next desde el cron de sync. */
export const DGII_CATALOGOS_TAG = 'dgii-catalogos';

/** Tipos de catálogo válidos — claves en `dgii_catalogos.tipo`. */
export type CatalogoTipo =
  | 'ambientes'
  | 'tipos_comprobante'
  | 'tipos_documento'
  | 'formas_pago'
  | 'monedas'
  | 'unidades_medida'
  | 'indicadores_itbis'
  | 'paises'
  | 'tipos_ingreso'
  | 'tipos_pago'
  | 'provincias'
  | 'municipios'
  | 'distritos_municipales'
  | 'impuestos_adicionales'
  | 'codigos_modificacion';

/** Item de catálogo con metadata opcional. */
export interface CatalogItem extends CatalogItemDto {
  codigo: string;
  nombre: string;
}

// ─── Lectura genérica ────────────────────────────────────────────────────────

async function readCatalogoFromDb(
  tipo: CatalogoTipo,
  parentCodigo?: string,
): Promise<CatalogItem[]> {
  const where = parentCodigo
    ? and(eq(dgiiCatalogos.tipo, tipo), eq(dgiiCatalogos.parentCodigo, parentCodigo))
    : eq(dgiiCatalogos.tipo, tipo);

  const rows = await db
    .select({
      codigo: dgiiCatalogos.codigo,
      nombre: dgiiCatalogos.nombre,
      parentCodigo: dgiiCatalogos.parentCodigo,
      metadata: dgiiCatalogos.metadata,
    })
    .from(dgiiCatalogos)
    .where(where)
    .orderBy(asc(dgiiCatalogos.codigo));

  return rows.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    ...(r.metadata as Record<string, unknown>),
    ...(r.parentCodigo ? { parentCodigo: r.parentCodigo } : {}),
  }));
}

/**
 * Fallback remoto cuando la tabla local está vacía o falla.
 * Se ejecuta sin caché para no congelar resultados parciales.
 */
async function readCatalogoFromRemote(
  tipo: CatalogoTipo,
  parentCodigo?: string,
): Promise<CatalogItem[]> {
  try {
    switch (tipo) {
      case 'ambientes':              return await remote.ambientes();
      case 'tipos_comprobante':      return await remote.tiposComprobante();
      case 'tipos_documento':        return await remote.tiposDocumento();
      case 'formas_pago':            return await remote.formasPago();
      case 'monedas':                return await remote.monedas();
      case 'unidades_medida':        return await remote.unidadesMedida();
      case 'indicadores_itbis':      return await remote.indicadoresItbis();
      case 'paises':                 return await remote.paises();
      case 'tipos_ingreso':          return await remote.tiposIngreso();
      case 'tipos_pago':             return await remote.tiposPago();
      case 'provincias':             return await remote.provincias();
      case 'municipios':             return await remote.municipios(parentCodigo);
      case 'distritos_municipales':  return await remote.distritosMunicipales();
      case 'impuestos_adicionales':  return await remote.impuestosAdicionales();
      case 'codigos_modificacion':   return await remote.codigosModificacion();
    }
  } catch (err) {
    console.error(`[dgii.catalogos] remote fallback failed for ${tipo}:`, err);
    return [];
  }
}

/**
 * Lee un catálogo de la BD local, con fallback a ecf-api si está vacío.
 * Cacheado 1h con tag DGII_CATALOGOS_TAG (invalidado por el cron de sync).
 */
async function getCatalogoUncached(
  tipo: CatalogoTipo,
  parentCodigo?: string,
): Promise<CatalogItem[]> {
  const rows = await readCatalogoFromDb(tipo, parentCodigo);
  if (rows.length > 0) return rows;
  return readCatalogoFromRemote(tipo, parentCodigo);
}

/**
 * Versión cacheada (1h, invalidable por tag) — usada por los API routes públicos.
 * Nota: unstable_cache requiere que la función sea pura y sus args sean
 * serializables; eso aplica aquí (string args, salida JSON-able).
 */
export const getCatalogo = (
  tipo: CatalogoTipo,
  parentCodigo?: string,
): Promise<CatalogItem[]> => {
  const cached = unstable_cache(
    () => getCatalogoUncached(tipo, parentCodigo),
    ['dgii-catalogo', tipo, parentCodigo ?? ''],
    { revalidate: 3600, tags: [DGII_CATALOGOS_TAG] },
  );
  return cached();
};

/** Invalida la caché Next de catálogos (llamado por el cron tras un upsert). */
export function invalidateCatalogosCache(): void {
  // Next 15+ requiere 2do arg ('max').
  (revalidateTag as (tag: string, scope?: string) => void)(DGII_CATALOGOS_TAG, 'max');
}

// ─── Helpers tipados por catálogo (azucar conveniente) ───────────────────────

export const getProvincias              = ()             => getCatalogo('provincias');
export const getMunicipiosByProvincia   = (prov: string) => getCatalogo('municipios', prov);
export const getDistritosByMunicipio    = (mun: string)  => getCatalogo('distritos_municipales', mun);
export const getTiposComprobante        = ()             => getCatalogo('tipos_comprobante');
export const getTiposDocumento          = ()             => getCatalogo('tipos_documento');
export const getFormasPago              = ()             => getCatalogo('formas_pago');
export const getMonedas                 = ()             => getCatalogo('monedas');
export const getUnidadesMedida          = ()             => getCatalogo('unidades_medida');
export const getIndicadoresItbis        = ()             => getCatalogo('indicadores_itbis');
export const getPaises                  = ()             => getCatalogo('paises');
export const getTiposIngreso            = ()             => getCatalogo('tipos_ingreso');
export const getTiposPago               = ()             => getCatalogo('tipos_pago');
// Ambientes (TesteCF/CerteCF/Produccion): SIEMPRE desde ecf-api directo,
// nunca de la DB local — el ambiente lo decide el API, no debe cachearse.
export const getAmbientes               = (): Promise<CatalogItem[]> => readCatalogoFromRemote('ambientes');
export const getImpuestosAdicionales    = ()             => getCatalogo('impuestos_adicionales');
export const getCodigosModificacion     = ()             => getCatalogo('codigos_modificacion');

/** Lookup individual por código (útil para enriquecer un registro). */
export async function findCatalogoItem(
  tipo: CatalogoTipo,
  codigo: string,
): Promise<CatalogItem | null> {
  const rows = await db
    .select({
      codigo: dgiiCatalogos.codigo,
      nombre: dgiiCatalogos.nombre,
      parentCodigo: dgiiCatalogos.parentCodigo,
      metadata: dgiiCatalogos.metadata,
    })
    .from(dgiiCatalogos)
    .where(and(eq(dgiiCatalogos.tipo, tipo), eq(dgiiCatalogos.codigo, codigo)))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    codigo: r.codigo,
    nombre: r.nombre,
    ...(r.metadata as Record<string, unknown>),
    ...(r.parentCodigo ? { parentCodigo: r.parentCodigo } : {}),
  };
}
