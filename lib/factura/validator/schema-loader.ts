/**
 * Loader & accessor helpers for the ecf-api schemas cached under
 * `./schemas/<tipo>.json`.  Re-fetch them whenever DGII updates its norma —
 * see README.md.
 */
import type {
  CampoSchema,
  CampoTipo,
  Obligatoriedad,
  TipoSchema,
} from './types';

import schema31 from './schemas/31.json';
import schema32 from './schemas/32.json';
import schema33 from './schemas/33.json';
import schema34 from './schemas/34.json';
import schema41 from './schemas/41.json';
import schema43 from './schemas/43.json';
import schema44 from './schemas/44.json';
import schema45 from './schemas/45.json';
import schema46 from './schemas/46.json';
import schema47 from './schemas/47.json';

/** Raw shape returned by `GET /v1/schemas/ecf/{tipo}`. */
interface RawSchema {
  tipoComprobante: string;
  nombreTipo: string;
  resumen?: {
    total: number;
    required: number;
    conditional: number;
    optional: number;
    forbidden: number;
  };
  todosCampos: RawCampo[];
  // The buckets (required/conditional/optional/forbidden) are also present
  // but are derivable from `todosCampos`; we only use the latter to avoid
  // double-counting fields that appear in both a bucket and `todosCampos`.
}

interface RawCampo {
  dgiiNo: number;
  nombre: string;
  xmlTag: string;
  payloadKey: string;
  tipo: string;
  maxLength?: number;
  obligatoriedad: string;
  obligatoriedadCodigo?: number;
  condicion?: string;
  valoresValidos?: (string | number)[];
  seccion: string;
}

const RAW_SCHEMAS: Record<string, RawSchema> = {
  '31': schema31 as RawSchema,
  '32': schema32 as RawSchema,
  '33': schema33 as RawSchema,
  '34': schema34 as RawSchema,
  '41': schema41 as RawSchema,
  '43': schema43 as RawSchema,
  '44': schema44 as RawSchema,
  '45': schema45 as RawSchema,
  '46': schema46 as RawSchema,
  '47': schema47 as RawSchema,
};

const KNOWN_CAMPO_TIPOS: ReadonlySet<CampoTipo> = new Set<CampoTipo>([
  'NUM',
  'ALFANUM',
  'ALFA',
  'FECHA',
  'BOOL',
  'DECIMAL',
]);

const KNOWN_OBLIGATORIEDADES: ReadonlySet<Obligatoriedad> =
  new Set<Obligatoriedad>([
    'REQUIRED',
    'CONDITIONAL',
    'OPTIONAL',
    'FORBIDDEN',
  ]);

function normalizeCampoTipo(raw: string): CampoTipo {
  return KNOWN_CAMPO_TIPOS.has(raw as CampoTipo) ? (raw as CampoTipo) : 'ALFANUM';
}

function normalizeObligatoriedad(raw: string): Obligatoriedad {
  return KNOWN_OBLIGATORIEDADES.has(raw as Obligatoriedad)
    ? (raw as Obligatoriedad)
    : 'OPTIONAL';
}

function mapCampo(raw: RawCampo): CampoSchema {
  const campo: CampoSchema = {
    dgiiNo: raw.dgiiNo,
    nombre: raw.nombre,
    xmlTag: raw.xmlTag,
    payloadKey: raw.payloadKey,
    tipo: normalizeCampoTipo(raw.tipo),
    obligatoriedad: normalizeObligatoriedad(raw.obligatoriedad),
    seccion: raw.seccion,
  };
  if (raw.maxLength !== undefined) campo.maxLength = raw.maxLength;
  if (raw.obligatoriedadCodigo !== undefined)
    campo.obligatoriedadCodigo = raw.obligatoriedadCodigo;
  if (raw.condicion !== undefined) campo.condicion = raw.condicion;
  if (raw.valoresValidos !== undefined)
    campo.valoresValidos = raw.valoresValidos;
  return campo;
}

function mapSchema(raw: RawSchema): TipoSchema {
  const out: TipoSchema = {
    tipo: raw.tipoComprobante,
    nombre: raw.nombreTipo,
    campos: raw.todosCampos.map(mapCampo),
  };
  if (raw.resumen) out.resumen = raw.resumen;
  return out;
}

/** Lazy + memoized mapping. Built on first access per tipo. */
const SCHEMA_CACHE = new Map<string, TipoSchema>();

function loadSchema(tipo: string): TipoSchema | null {
  if (SCHEMA_CACHE.has(tipo)) return SCHEMA_CACHE.get(tipo)!;
  const raw = RAW_SCHEMAS[tipo];
  if (!raw) return null;
  const mapped = mapSchema(raw);
  SCHEMA_CACHE.set(tipo, mapped);
  return mapped;
}

/** Tipo strings the library knows about. */
export const SUPPORTED_TIPOS: readonly string[] = Object.freeze(
  Object.keys(RAW_SCHEMAS),
);

/** Returns the cached schema for a tipo, or `null` if unsupported. */
export function getSchema(tipo: string): TipoSchema | null {
  return loadSchema(tipo);
}

/**
 * Returns the field metadata for a tipo + payloadKey.
 * Items inside `items[]` use the literal `items[].xxx` payloadKey.
 */
export function getCampo(
  tipo: string,
  payloadKey: string,
): CampoSchema | null {
  const schema = getSchema(tipo);
  if (!schema) return null;
  return schema.campos.find((c) => c.payloadKey === payloadKey) ?? null;
}

/** Returns all fields with the given obligatoriedad for the tipo. */
export function getCamposByObligatoriedad(
  tipo: string,
  ob: Obligatoriedad,
): CampoSchema[] {
  const schema = getSchema(tipo);
  if (!schema) return [];
  return schema.campos.filter((c) => c.obligatoriedad === ob);
}
