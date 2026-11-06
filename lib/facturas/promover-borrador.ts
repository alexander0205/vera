/**
 * Reglas para no emitir dos veces a la DGII el mismo borrador (p. ej. una nota
 * de débito por mora). Puras: sin DB ni navegador.
 *
 * Un borrador se emite SOLO por `/api/facturas/[id]/emitir-ecf`, que lo
 * actualiza en sitio (conserva id, `mora_origen_id` y demás vínculos).
 * `/api/ecf/emitir` en modo emitir siempre INSERTA un documento nuevo, así que
 * jamás debe recibir un `borradorId`.
 */

/** Estados que ya consumieron un e-NCF ante la DGII (o van en camino). */
export const ESTADOS_YA_EMITIDOS = ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL'] as const;

export interface BloqueoEmision {
  status: 409;
  code: 'BORRADOR_USAR_EMITIR_ECF' | 'DOCUMENTO_YA_EMITIDO' | 'MORA_YA_EMITIDA';
  error: string;
}

/** `/api/ecf/emitir` en modo emitir con un borradorId crearía un duplicado. */
export function bloqueoEmitirConBorrador(input: {
  modo: 'emitir' | 'borrador';
  borradorId?: number | null;
}): BloqueoEmision | null {
  if (input.modo !== 'emitir' || !input.borradorId) return null;
  return {
    status: 409,
    code: 'BORRADOR_USAR_EMITIR_ECF',
    error:
      'Este documento ya existe como borrador. Para emitirlo usa «Enviar a DGII» ' +
      'desde su detalle, o guarda los cambios y vuelve a intentarlo: emitir desde aquí ' +
      'crearía un comprobante duplicado.',
  };
}

/** Un documento ya procesado ante la DGII (o anulado) no se vuelve a emitir. */
export function bloqueoDocumentoYaEmitido(estado: string): BloqueoEmision | null {
  if (estado === 'ANULADO' || (ESTADOS_YA_EMITIDOS as readonly string[]).includes(estado) || estado === 'RECHAZADO') {
    return {
      status: 409,
      code: 'DOCUMENTO_YA_EMITIDO',
      error:
        `El documento ya fue procesado (estado: ${estado}). Solo se pueden enviar a DGII ` +
        'facturas sin e-CF (borrador, histórica o sin-ncf).',
    };
  }
  return null;
}

/**
 * Una nota por mora cuyo período ya tiene otra nota emitida (misma factura de
 * origen) no se emite de nuevo: sería la misma mora dos veces ante la DGII.
 */
export function bloqueoMoraYaEmitida(input: {
  docId: number;
  moraOrigenId: number | null;
  moraPeriodo: string | null;
  hermanas: Array<{ id: number; estado: string; moraPeriodo: string | null }>;
}): BloqueoEmision | null {
  if (input.moraOrigenId == null) return null;
  const emitida = input.hermanas.find(
    (h) =>
      h.id !== input.docId &&
      (ESTADOS_YA_EMITIDOS as readonly string[]).includes(h.estado) &&
      (input.moraPeriodo == null || h.moraPeriodo == null || h.moraPeriodo === input.moraPeriodo),
  );
  if (!emitida) return null;
  return {
    status: 409,
    code: 'MORA_YA_EMITIDA',
    error:
      `Esta mora ya tiene una nota de débito emitida (documento #${emitida.id}). ` +
      'Emitirla otra vez la duplicaría ante la DGII; anula este borrador si ya no hace falta.',
  };
}
