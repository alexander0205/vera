/**
 * ¿Puede esta factura enlazarse a un cargo de este estudiante?
 *
 * El responsable de pago (`facturar_a_client_id`) es el pagador por defecto,
 * PERO un colegio cobra indistintamente al padre, la madre u otro tutor: es
 * normal que un mes pague el otro padre. Por eso se acepta la factura si su
 * cliente es CUALQUIER tutor registrado del alumno (o su responsable de pago).
 * Sigue habiendo control: rechaza la factura de un contacto ajeno al niño.
 */
export function validarFacturaDeTutor(params: {
  facturaClientId: number | null;
  responsableClientId: number | null | undefined;
  tutorClientIds: (number | null)[];
}): { ok: true } | { ok: false; error: string } {
  const validos = new Set<number>();
  if (params.responsableClientId != null) validos.add(params.responsableClientId);
  for (const id of params.tutorClientIds) if (id != null) validos.add(id);

  if (validos.size === 0) {
    return { ok: false, error: 'El estudiante no tiene responsable de pago ni tutores con contacto' };
  }
  if (params.facturaClientId == null || !validos.has(params.facturaClientId)) {
    return { ok: false, error: 'La factura pertenece a un contacto que no es tutor de este estudiante' };
  }
  return { ok: true };
}
