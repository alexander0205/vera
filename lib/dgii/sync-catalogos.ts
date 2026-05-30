/**
 * Sincronización de catálogos DGII desde ecf-api a Postgres local.
 *
 * Usado por:
 *   1. /api/cron/dgii-catalogos-sync (Vercel Cron, semanal)
 *   2. Script manual: `npx tsx -e 'require("./lib/dgii/sync-catalogos").syncAllCatalogos()'`
 *
 * Estrategia: UPSERT por (tipo, codigo). Si ecf-api elimina un código en el
 * futuro, no se borra automáticamente — eso evita huérfanos referenciados
 * por documentos históricos. Limpieza manual si fuera necesario.
 */

// Nota: NO usar 'server-only' aquí — este módulo también se ejecuta desde
// scripts CLI (tsx) para el bootstrap inicial.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  dgiiCatalogos,
  dgiiCatalogosSyncLog,
  type NewDgiiCatalogo,
} from '@/lib/db/schema';
import { catalogos as remote, type CatalogItemDto } from '@/lib/ecf-api/client';

/** Duplicado intencional de `CatalogoTipo` para no importar de catalogos.ts
 *  (que usa 'server-only' y rompe ejecución vía tsx). */
type CatalogoTipo =
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

const DGII_CATALOGOS_TAG = 'dgii-catalogos';

/** Mapea cada catálogo a (función fetch, extractor de parent_codigo opcional). */
interface CatalogoFetcher {
  tipo: CatalogoTipo;
  fetch: () => Promise<CatalogItemDto[]>;
  /** Si retorna string, se guarda en parent_codigo. */
  parentOf?: (item: CatalogItemDto) => string | null;
}

const FETCHERS: CatalogoFetcher[] = [
  // 'ambientes' NO se sincroniza a la DB local — el ambiente se lee siempre
  // del ecf-api directo (getAmbientes / me().software.ambienteDefault).
  { tipo: 'tipos_comprobante',     fetch: () => remote.tiposComprobante() },
  { tipo: 'tipos_documento',       fetch: () => remote.tiposDocumento() },
  { tipo: 'formas_pago',           fetch: () => remote.formasPago() },
  { tipo: 'monedas',               fetch: () => remote.monedas() },
  { tipo: 'unidades_medida',       fetch: () => remote.unidadesMedida() },
  { tipo: 'indicadores_itbis',     fetch: () => remote.indicadoresItbis() },
  { tipo: 'paises',                fetch: () => remote.paises() },
  { tipo: 'tipos_ingreso',         fetch: () => remote.tiposIngreso() },
  { tipo: 'tipos_pago',            fetch: () => remote.tiposPago() },
  { tipo: 'provincias',            fetch: () => remote.provincias() },
  {
    tipo: 'municipios',
    fetch: () => remote.municipios(),
    parentOf: (it) =>
      typeof it.provinciaCodigo === 'string' ? it.provinciaCodigo : null,
  },
  {
    tipo: 'distritos_municipales',
    fetch: () => remote.distritosMunicipales(),
    parentOf: (it) =>
      typeof it.municipioCodigo === 'string' ? it.municipioCodigo : null,
  },
  { tipo: 'impuestos_adicionales', fetch: () => remote.impuestosAdicionales() },
  { tipo: 'codigos_modificacion',  fetch: () => remote.codigosModificacion() },
];

/** Separa `{codigo, nombre, ...extra}` en (campos fijos + metadata jsonb). */
function toRow(
  tipo: CatalogoTipo,
  item: CatalogItemDto,
  parentOf?: (item: CatalogItemDto) => string | null,
): NewDgiiCatalogo {
  const { codigo, nombre, ...rest } = item;
  return {
    tipo,
    codigo: String(codigo),
    nombre: String(nombre),
    parentCodigo: parentOf ? parentOf(item) : null,
    metadata: rest as Record<string, unknown>,
  };
}

/** Resultado por catálogo. */
export interface SyncResultItem {
  tipo: CatalogoTipo;
  count: number;
  error?: string;
}

/**
 * Sincroniza todos los catálogos. Cada uno se hace en su propia transacción
 * implícita (UPSERT). Si uno falla, los demás continúan.
 */
export async function syncAllCatalogos(): Promise<{
  ok: boolean;
  duracionMs: number;
  counts: Record<string, number>;
  errors: Record<string, string>;
}> {
  const t0 = Date.now();
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // Fetch en paralelo (15 requests HTTP).
  const fetched = await Promise.allSettled(
    FETCHERS.map(async (f) => {
      const items = await f.fetch();
      return { fetcher: f, items };
    }),
  );

  // Upsert secuencial — sencillo y suficiente; los catálogos son pequeños.
  for (let i = 0; i < fetched.length; i++) {
    const res = fetched[i];
    const tipo = FETCHERS[i].tipo;
    if (res.status === 'rejected') {
      errors[tipo] = String(res.reason);
      counts[tipo] = 0;
      continue;
    }
    const { fetcher, items } = res.value;
    if (items.length === 0) {
      counts[tipo] = 0;
      continue;
    }

    try {
      const rows = items.map((it) => toRow(fetcher.tipo, it, fetcher.parentOf));
      // UPSERT por (tipo, codigo). Drizzle no expone onConflictDoUpdate
      // multi-fila ergonómicamente — usamos sql directo para claridad.
      await db
        .insert(dgiiCatalogos)
        .values(rows)
        .onConflictDoUpdate({
          target: [dgiiCatalogos.tipo, dgiiCatalogos.codigo],
          set: {
            nombre:       sql`excluded.nombre`,
            parentCodigo: sql`excluded.parent_codigo`,
            metadata:     sql`excluded.metadata`,
            updatedAt:    sql`NOW()`,
          },
        });
      counts[tipo] = rows.length;
    } catch (err) {
      errors[tipo] = err instanceof Error ? err.message : String(err);
      counts[tipo] = 0;
    }
  }

  const duracionMs = Date.now() - t0;
  const ok = Object.keys(errors).length === 0;

  // Log al historial.
  try {
    await db.insert(dgiiCatalogosSyncLog).values({
      ok,
      duracionMs,
      detalle: { counts, errors },
    });
  } catch (err) {
    console.error('[dgii.sync-catalogos] failed to write sync log:', err);
  }

  // Invalida la caché Next para que las próximas lecturas reflejen el upsert.
  // Carga `next/cache` dinámicamente — si estamos en un script CLI, no existe
  // request context y el import puede no estar disponible, así que ignoramos.
  try {
    const { revalidateTag } = await import('next/cache');
    // Next 15+ requiere 2do arg ('max' invalida todo el árbol cacheado por tag).
    (revalidateTag as (tag: string, scope?: string) => void)(DGII_CATALOGOS_TAG, 'max');
  } catch (err) {
    // Esperado fuera de un request context (scripts CLI).
    console.warn('[dgii.sync-catalogos] revalidateTag skipped:', err instanceof Error ? err.message : err);
  }

  return { ok, duracionMs, counts, errors };
}
