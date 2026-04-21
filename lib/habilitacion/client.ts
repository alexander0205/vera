/**
 * Helper cliente para el wizard de habilitación DGII.
 * Centraliza todas las llamadas a `/api/habilitacion/*` y `/api/ecf/emitir` para pruebas.
 *
 * Se usa desde `app/(dashboard)/dashboard/habilitacion/page.tsx`.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HabilitacionState {
  fase?:     number;
  subPaso?:  number;
  postulacion?: {
    xmlFirmadoDataUrl?: string;
    xmlFirmadoName?:    string;
    uploadConfirmed?:   boolean;
    validado?:          boolean;
  };
  pruebas?: {
    emitidas?: Record<string, number>;
    /** Total de NCFs consumidos por tipo REAL (exitosos + fallidos).
     *  Persiste entre reintentos para nunca reusar un NCF ya enviado a DGII. */
    encfConsumed?: Record<string, number>;
    trackIds?: { tipo: string; encf: string; trackId: string }[];
    fc250Done?: boolean;
    confirmed?: boolean;
    /** Configuración del ítem de prueba — persiste entre sesiones */
    itemNombre?: string;
    itemPrecio?: string;
    itemTarifa?: string;
    itemTipo?:   string;
  };
  representaciones?: {
    downloaded?:      string[];
    uploadConfirmed?: boolean;
    validado?:        boolean;
  };
  urlsProduccion?: { confirmado?: boolean };
  declaracionJurada?: {
    xmlFirmadoDataUrl?: string;
    xmlFirmadoName?:    string;
    enviado?:           boolean;
    verificado?:        boolean;
  };
  finalizado?: { acknowledged?: boolean };
}

export interface FirmarXmlResult {
  xmlFirmadoBase64: string;
  xmlFirmadoNombre: string;
  rootElement: string;
}

export interface EmitirEcfResult {
  ok: boolean;
  encf: string;
  trackId: string;
  estado: string;
  codigoSeguridad?: string;
  documentoId: number;
}

export type DgiiEstadoPrueba =
  | 'Aceptado'
  | 'Rechazado'
  | 'AceptadoCondicional'
  | 'En Proceso'
  | 'EnProceso';

export interface EstadoTrackId {
  trackId:       string;
  estado:        DgiiEstadoPrueba;
  estadoInterno: 'ACEPTADO' | 'ACEPTADO_CONDICIONAL' | 'RECHAZADO' | 'EN_PROCESO';
  mensajes:      { codigo?: string; descripcion?: string }[] | null;
  error?:        string;
}

// ─── API: state persistence ──────────────────────────────────────────────────

export async function cargarEstado(): Promise<{ state: HabilitacionState; completado: boolean }> {
  const res = await fetch('/api/habilitacion/state');
  if (!res.ok) throw new Error('No se pudo cargar el estado de habilitación');
  const json = await res.json();
  return { state: json.state ?? {}, completado: !!json.completado };
}

export async function guardarEstado(partial: HabilitacionState): Promise<HabilitacionState> {
  const res = await fetch('/api/habilitacion/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'No se pudo guardar el estado');
  }
  const json = await res.json();
  return json.state as HabilitacionState;
}

export async function reiniciarEstado(): Promise<void> {
  const res = await fetch('/api/habilitacion/state', { method: 'DELETE' });
  if (!res.ok) throw new Error('No se pudo reiniciar la habilitación');
}

// ─── API: firma de XML ───────────────────────────────────────────────────────

export async function firmarXml(params: {
  xmlFile: File;
  proposito: 'postulacion' | 'declaracion-jurada' | 'otro';
  rootElement?: string;
}): Promise<FirmarXmlResult> {
  const xmlText   = await params.xmlFile.text();
  const xmlBase64 = typeof window === 'undefined'
    ? Buffer.from(xmlText, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(xmlText)));

  const res = await fetch('/api/habilitacion/firmar-xml', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      xmlBase64,
      rootElement: params.rootElement,
      proposito:   params.proposito,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error firmando el XML');
  }

  return res.json();
}

/** Descarga un archivo base64 en el navegador */
export function descargarBase64(base64: string, filename: string, mime = 'application/xml') {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── API: emisión real de e-CF de prueba ──────────────────────────────────────

// ─── NCFs hardcodeados para el Set de Pruebas DGII ────────────────────────────
//
// La DGII exige que las pruebas de habilitación usen rangos específicos por tipo.
// Basado en los archivos reales de habilitación analizados (RNC 131988032).
// Estos NCFs se envían con `encfOverride` para que NO consuman la secuencia real
// del equipo — solo son códigos sintéticos para validar formato ante la DGII.

const DGII_PRUEBA_START: Record<string, number> = {
  '31': 1000,
  '32': 2000,
  '33': 1000,
  '34': 1000,
  '41': 1000,
  '43': 1000,
  '44': 1000,
  '45': 1000,
  '46': 1000,
  '47': 1000,
};

/**
 * Construye el e-NCF hardcodeado para la habilitación DGII.
 *
 * @param tipoEcf        tipo de e-CF ('31', '32', ..., '47')
 * @param indice         número de orden dentro de ese tipo (1 = primera emisión)
 *
 * Ejemplo: buildEncfPrueba('31', 1) → 'E310000001000'
 *          buildEncfPrueba('31', 4) → 'E310000001003'
 *          buildEncfPrueba('32', 1) → 'E320000002000'
 */
export function buildEncfPrueba(tipoEcf: string, indice: number): string {
  const start = DGII_PRUEBA_START[tipoEcf] ?? 1;
  const num   = start + (indice - 1);
  return `E${tipoEcf}${num.toString().padStart(10, '0')}`;
}

/**
 * Genera un e-NCF aleatorio en rango alto (8 000 000 000 – 9 999 999 998)
 * para el Set de Pruebas DGII.
 *
 * Usar en lugar de buildEncfPrueba para evitar colisiones de "ya utilizado"
 * en reintentos: cada llamada produce un código diferente, sin necesidad de
 * llevar un contador de intentos fallidos.
 */
export function buildEncfPruebaRandom(tipoEcf: string): string {
  // Rango alto para no chocar jamás con secuencias de producción (que empiezan en 1)
  const num = Math.floor(8_000_000_000 + Math.random() * 1_999_999_998);
  return `E${tipoEcf}${num.toString().padStart(10, '0')}`;
}

/**
 * Emite un e-CF de prueba contra el ambiente configurado (TesteCF por default).
 * Reutiliza /api/ecf/emitir que ya tiene toda la lógica de firma + envío a DGII.
 *
 * Si se pasa `encf`, el backend lo usará literalmente (no toca la secuencia del
 * equipo) — esto es lo que usa el wizard de habilitación con NCFs hardcodeados.
 */
export async function emitirEcfPrueba(params: {
  tipoEcf: string;              // '31','32','33','34','41','43','44','45','46','47'
  encf?: string;                // opcional — e-NCF hardcodeado para pruebas DGII
  rncComprador?: string;
  razonSocialComprador?: string;
  itemNombre: string;
  itemPrecio: number;
  itemTarifa: 0 | 0.16 | 0.18;
  itemTipo:   1 | 2;            // 1=Bien, 2=Servicio
  // Requeridos para tipos 33 (nota débito) y 34 (nota crédito):
  ncfModificado?:      string;  // e-NCF al que se hace la nota
  codigoModificacion?: string;  // '1' | '2' | '3'
  razonModificacion?:  string;  // descripción libre
}): Promise<EmitirEcfResult> {
  const body = {
    modo: 'emitir' as const,
    tipoEcf: params.tipoEcf,
    encfOverride: params.encf,
    rncComprador: params.rncComprador,
    razonSocialComprador: params.razonSocialComprador,
    ncfModificado: params.ncfModificado,
    codigoModificacion: params.codigoModificacion,
    razonModificacion: params.razonModificacion,
    tipoPago: 1 as const,
    items: [{
      nombreItem:             params.itemNombre,
      cantidadItem:           1,
      precioUnitarioItem:     params.itemPrecio,
      tasaItbis:              params.itemTarifa,
      indicadorBienoServicio: params.itemTipo,
    }],
  };

  const res = await fetch('/api/ecf/emitir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error emitiendo e-CF de prueba');
  return json as EmitirEcfResult;
}

/**
 * Consulta en batch el estado final de los trackIds enviados a DGII.
 * Se usa para polling mientras DGII procesa los e-CF del Set de Pruebas.
 */
export async function consultarEstadosPruebas(
  trackIds: string[],
): Promise<EstadoTrackId[]> {
  if (trackIds.length === 0) return [];

  const res = await fetch('/api/habilitacion/consultar-estados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error consultando estados DGII');
  return (json.results ?? []) as EstadoTrackId[];
}
