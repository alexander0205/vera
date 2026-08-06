/**
 * Normaliza el ciclo de cobro y los avisos que llegan del cliente.
 *
 * Se valida aquí y no solo en la pantalla porque estos números terminan en un
 * plan de factura recurrente que emite documentos fiscales solo: un
 * `diaCobro` de 45 o una gracia negativa haría cobrar en fechas imposibles.
 */
export function camposCiclo(body: Record<string, unknown>) {
  const entero = (v: unknown, min: number, max: number): number | null => {
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const set: Record<string, unknown> = {};
  // 0 es válido en diaCobro: significa el último día del mes.
  if (body.diaCobro !== undefined)        set.diaCobro = entero(body.diaCobro, 0, 31);
  if (body.diasParaPago !== undefined)    set.diasParaPago = entero(body.diasParaPago, 0, 90);
  if (body.moraDiasGracia !== undefined)  set.moraDiasGracia = entero(body.moraDiasGracia, 0, 90);
  if (body.avisoPrevioDias !== undefined) set.avisoPrevioDias = entero(body.avisoPrevioDias, 0, 60);
  if (body.avisoAntesEmisionDias !== undefined) set.avisoAntesEmisionDias = entero(body.avisoAntesEmisionDias, 0, 60);
  if (body.avisoDiaEmision !== undefined) set.avisoDiaEmision = Boolean(body.avisoDiaEmision);
  if (body.avisoAntesMoraDias !== undefined) set.avisoAntesMoraDias = entero(body.avisoAntesMoraDias, 0, 60);
  if (body.avisosActivos !== undefined)  set.avisosActivos = Boolean(body.avisosActivos);
  if (body.avisoDiaCobro !== undefined)  set.avisoDiaCobro = Boolean(body.avisoDiaCobro);
  if (body.avisoVencidoDias !== undefined) {
    // Se ordena y se quitan repetidos: dos avisos el mismo día son un correo
    // duplicado, y desordenados hacen ilegible el resumen de la pantalla.
    const lista = Array.isArray(body.avisoVencidoDias) ? body.avisoVencidoDias : [];
    set.avisoVencidoDias = [...new Set(
      lista.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 180),
    )].sort((a, b) => a - b);
  }
  if (body.avisoCorreo !== undefined)   set.avisoCorreo = Boolean(body.avisoCorreo);
  if (body.avisoWhatsapp !== undefined) set.avisoWhatsapp = Boolean(body.avisoWhatsapp);
  if (body.aplicaPorDefecto !== undefined) set.aplicaPorDefecto = Boolean(body.aplicaPorDefecto);
  if (body.admiteBeca !== undefined)       set.admiteBeca = Boolean(body.admiteBeca);
  if (body.cobraMora !== undefined)        set.cobraMora = Boolean(body.cobraMora);
  return set;
}

