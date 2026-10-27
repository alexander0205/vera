import { sumarDias } from './calendario';
import type { AvisoPendiente } from './avisos';

/**
 * El texto de un aviso de cobro cuando va UN solo cargo.
 *
 * Vive aparte de `avisos.ts` (que se queda con la base de datos y el reparto)
 * para que `agrupar-avisos.ts` pueda usarlo sin que los dos se importen en
 * círculo: el mensaje de una familia con varios hijos se arma sobre estas
 * mismas piezas, y cuando es un solo cargo TIENE que salir idéntico a lo de
 * siempre. `avisos.ts` los vuelve a exportar, así que nadie tuvo que cambiar
 * su import.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function enLetra(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

export const pesos = (c: number) => `RD$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/**
 * El texto de cada aviso.
 *
 * `corto` es para SMS: 160 caracteres cuentan, y llega desde un número que el
 * tutor no tiene agendado, así que tiene que decir de qué colegio es o no se
 * entiende quién escribe. `largo` va por correo y WhatsApp, que no cobran por
 * carácter.
 */
export function redactar(p: AvisoPendiente, colegio: string): { largo: string; corto: string } {
  const { fila } = p;
  const alumno = fila.estudiante;
  const monto = pesos(fila.saldoCentavos);

  if (p.aviso === 'al-emitir' && fila.ecfDocumentId == null) {
    // Un cobro recién puesto (el día de cine) todavía no tiene factura: decir
    // «ya está lista la factura» manda al padre a buscar algo que no existe.
    const vence = fila.fechaVencimiento ? ` Tienes hasta el ${enLetra(fila.fechaVencimiento)} para pagarlo.` : '';
    return {
      largo: `Hay un cobro nuevo de ${fila.concepto} para ${alumno}: ${monto}.${vence}`,
      corto: `${colegio}: cobro nuevo de ${fila.concepto} para ${alumno}, ${monto}.${vence}`,
    };
  }
  if (p.aviso === 'al-emitir') {
    const vence = fila.fechaVencimiento ? ` Tienes hasta el ${enLetra(fila.fechaVencimiento)} para pagarla.` : '';
    return {
      largo: `Ya está lista la factura de ${fila.concepto} de ${alumno}: ${monto}.${vence}`,
      corto: `${colegio}: factura de ${alumno} lista, ${monto}.${vence}`,
    };
  }
  const cuando = fila.fechaVencimiento ? enLetra(fila.fechaVencimiento) : 'pronto';

  // al-vencer: se escribe en pasado. Decir "está por vencer" el día en que ya
  // venció hace creer al padre que todavía llega a tiempo.
  if (p.aviso === 'al-vencer') {
    const cola = fila.cobraMora
      ? (fila.moraDiasGracia > 0
          ? ` Tienes ${fila.moraDiasGracia} día(s) antes de que se le aplique el recargo.`
          : ' Ya se le aplicó el recargo por mora.')
      : ' Págala para ponerte al día.';
    return {
      largo: `Hoy venció la factura de ${fila.concepto} de ${alumno}: ${monto}.${cola}`,
      corto: `${colegio}: hoy venció la factura de ${alumno}, ${monto}.${cola}`,
    };
  }

  // antes-mora: el que le ahorra dinero al padre, y por eso sale por SMS. La
  // fecha que se le da es la del RECARGO, no la del vencimiento: decirle que
  // pague "antes del 3" cuando el recargo entra el 8 le quita días que tiene.
  const fechaMora = fila.fechaVencimiento
    ? enLetra(sumarDias(fila.fechaVencimiento, Math.max(0, fila.moraDiasGracia)))
    : cuando;
  return {
    largo: `La factura de ${fila.concepto} de ${alumno} está vencida. Paga ${monto} antes del ${fechaMora} y evita el recargo por mora.`,
    corto: `${colegio}: paga ${monto} de ${alumno} antes del ${fechaMora} y evita el recargo.`,
  };
}
