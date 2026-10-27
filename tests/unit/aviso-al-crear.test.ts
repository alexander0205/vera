import { describe, expect, it } from 'vitest';
import { avisosDeHoy, fechasDeAviso, redactar, type FilaAviso } from '@/lib/administracion-escolar/avisos';
import { asuntoDeAviso } from '@/lib/administracion-escolar/agrupar-avisos';
import { diaDelAvisoAlCrear, fraseDelAvisoAlCrear } from '@/lib/administracion-escolar/aviso-al-crear';

/**
 * «Avisar a las familias» al cobrar a un grupo (el día de cine, la excursión).
 *
 * El cargo hecho a mano no tiene calendario: sin esto la familia solo se
 * enteraba colgada del vencimiento. Ahora el cargo lleva el día de su aviso de
 * «cobro nuevo» y el cron lo manda ese día.
 */

// Un cobro a un grupo: sin cuota (sin fecha de emisión), sin factura todavía.
const BASE: FilaAviso = {
  cargoId: 7, teamId: 22, estudianteId: 40, clientId: 900,
  estudiante: 'Ana Pérez', concepto: 'Día de cine',
  saldoCentavos: 10000,
  ecfDocumentId: null,
  fechaEmision: null,
  fechaVencimiento: '2026-11-05',
  cobraMora: false,
  avisoDiaEmision: false,
  avisoDiaVencimiento: true,
  avisoAntesMoraDias: null,
  moraDiasGracia: 0,
  avisoCorreo: true, avisoWhatsapp: true, avisoSms: true,
  destinatario: 'Rosa Pérez', email: 'r@p.com', whatsapp: '8095551234', celular: '8095551234', telefono: null,
  avisoAlCrear: '2026-10-28',
  conceptoConAvisos: false,
};
const fila = (p: Partial<FilaAviso> = {}): FilaAviso => ({ ...BASE, ...p });

describe('qué día sale', () => {
  it('cobrado por la mañana con tiempo para la última tanda: hoy', () => {
    // 10:00 a. m. RD = 14:00 UTC.
    expect(diaDelAvisoAlCrear(new Date('2026-10-27T14:00:00Z'))).toBe('2026-10-27');
  });

  it('cobrado después de las 11:30 RD: mañana, nunca de noche', () => {
    expect(diaDelAvisoAlCrear(new Date('2026-10-27T15:30:00Z'))).toBe('2026-10-28'); // 11:30 RD
    expect(diaDelAvisoAlCrear(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-28'); // 9 p. m. del 27 RD
  });

  it('la frase de «Listo» dice cuándo se enteran', () => {
    expect(fraseDelAvisoAlCrear('2026-10-27', '2026-10-27')).toContain('hoy');
    expect(fraseDelAvisoAlCrear('2026-10-28', '2026-10-27')).toContain('mañana');
  });
});

describe('el aviso de «cobro nuevo»', () => {
  it('sale el día pedido, como el aviso de la emisión, por correo y WhatsApp', () => {
    const hoy = avisosDeHoy(fila(), '2026-10-28');
    expect(hoy.map((a) => [a.aviso, a.offsetDias, a.canales])).toEqual([['al-emitir', 0, ['correo', 'whatsapp']]]);
  });

  it('no enciende los demás avisos de un concepto que el colegio dejó sin avisos', () => {
    // El concepto no avisa: el día que vence no sale nada aunque tenga la marca.
    expect(avisosDeHoy(fila(), '2026-11-05')).toHaveLength(0);
    expect(fechasDeAviso(fila()).map((s) => s.aviso)).toEqual(['al-emitir']);
  });

  it('con un concepto que sí avisa, los suyos siguen y el de la emisión no sale dos veces', () => {
    const conAvisos = fila({ conceptoConAvisos: true, fechaEmision: '2026-10-28', avisoDiaEmision: true });
    expect(fechasDeAviso(conAvisos).map((s) => [s.aviso, s.fecha])).toEqual([
      ['al-emitir', '2026-10-28'],
      ['al-vencer', '2026-11-05'],
    ]);
  });

  it('sin factura todavía dice «cobro», no «factura»', () => {
    const [aviso] = avisosDeHoy(fila(), '2026-10-28');
    const { largo, corto } = redactar(aviso, 'Mi Casita');
    expect(largo).toBe('Hay un cobro nuevo de Día de cine para Ana Pérez: RD$100.00. Tienes hasta el 5 de noviembre para pagarlo.');
    expect(corto).toContain('cobro nuevo');
    expect(largo).not.toContain('factura');
    expect(asuntoDeAviso('al-emitir', 1, false)).toBe('Tienes un cobro nuevo');
    // Con factura, como siempre.
    expect(asuntoDeAviso('al-emitir', 1)).toBe('Tienes una factura nueva');
    expect(redactar({ ...aviso, fila: fila({ ecfDocumentId: 55 }) }, 'Mi Casita').largo).toContain('Ya está lista la factura');
  });
});
