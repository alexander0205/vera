import { describe, expect, it } from 'vitest';
import { avisosDeHoy, destinoDelCanal, redactar, type FilaAviso } from '@/lib/administracion-escolar/avisos';

/**
 * Lo que se prueba aquí es el día exacto en que sale cada aviso.
 *
 * El error caro no es que falte un recordatorio: es que salga de más, o que
 * salga por un canal que no le toca. Un aviso duplicado a 465 familias es una
 * llamada al colegio por cada una, y un SMS de más se paga.
 */

const BASE: FilaAviso = {
  cargoId: 1, teamId: 9, estudianteId: 3164, clientId: 1689,
  estudiante: 'Zahel Ferreras', concepto: 'Matrícula',
  saldoCentavos: 175000,
  ecfDocumentId: null,
  fechaEmision: '2026-09-28',
  fechaVencimiento: '2026-10-03',
  cobraMora: true,
  avisoDiaEmision: true,
  avisoDiaVencimiento: true,
  avisoAntesMoraDias: 2,
  moraDiasGracia: 5,
  avisoCorreo: true, avisoWhatsapp: true, avisoSms: true,
  destinatario: 'Alexander', email: 'a@b.com', whatsapp: '8095551234', celular: '8095551234', telefono: null,
};

const fila = (p: Partial<FilaAviso> = {}): FilaAviso => ({ ...BASE, ...p });

describe('avisosDeHoy', () => {
  it('no queda ningún aviso antes de que exista la factura', () => {
    // El viejo «se acerca tu pago» avisaba de un documento que no existía y
    // podía caer antes de que el devengo creara el cargo: no salía nunca.
    expect(avisosDeHoy(fila(), '2026-09-23')).toHaveLength(0);
    expect(avisosDeHoy(fila(), '2026-09-27')).toHaveLength(0);
  });

  it('el aviso de emisión sale el día que se emite', () => {
    expect(avisosDeHoy(fila(), '2026-09-28').map((a) => a.aviso)).toEqual(['al-emitir']);
  });

  it('el aviso del recargo se cuenta desde la MORA, no desde el vencimiento', () => {
    // Vence el 3 de octubre, la mora entra 5 días después (8 de octubre) y se
    // avisa 2 días antes: 6 de octubre. Ni el 1 —que sería 2 días antes de
    // vencer— ni el 26 de septiembre.
    expect(avisosDeHoy(fila(), '2026-10-06').map((a) => a.aviso)).toEqual(['antes-mora']);
    expect(avisosDeHoy(fila(), '2026-10-01')).toHaveLength(0);
    expect(avisosDeHoy(fila(), '2026-09-26')).toHaveLength(0);
  });

  it('subir los días de gracia mueve el aviso del recargo, no el del vencimiento', () => {
    const f = fila({ moraDiasGracia: 10 });          // mora el 13 de octubre
    expect(avisosDeHoy(f, '2026-10-11').map((a) => a.aviso)).toEqual(['antes-mora']);
    expect(avisosDeHoy(f, '2026-10-06')).toHaveLength(0);
    // El del vencimiento no se movió: sigue el día que vence.
    expect(avisosDeHoy(f, '2026-10-03').map((a) => a.aviso)).toEqual(['al-vencer']);
  });

  it('sin días de gracia el aviso del recargo no cabe y no se manda solo', () => {
    // Con gracia 0 la mora entra el mismo día del vencimiento, así que "2 días
    // antes de la mora" caería 2 días antes de vencer y se pisaría con el resto.
    const f = fila({ moraDiasGracia: 0 });
    expect(avisosDeHoy(f, '2026-10-01')).toHaveLength(0);
    expect(avisosDeHoy(f, '2026-10-03').map((a) => a.aviso)).toEqual(['al-vencer']);
  });

  it('cruza el fin de mes sin perder el día', () => {
    // Vence el 28 de octubre, mora 5 días después (2 de noviembre) y avisa 2
    // días antes: 31 de octubre.
    const f = fila({ fechaEmision: '2026-10-23', fechaVencimiento: '2026-10-28' });
    expect(avisosDeHoy(f, '2026-10-31').map((a) => a.aviso)).toEqual(['antes-mora']);
  });

  it('el aviso del vencimiento sale el día que vence', () => {
    expect(avisosDeHoy(fila(), '2026-10-03').map((a) => a.aviso)).toEqual(['al-vencer']);
  });

  it('cero días no es "avisar el mismo día": es no avisar', () => {
    // Para el día del vencimiento está su propio interruptor; un 0 en el plazo
    // tiene que significar apagado, o al tutor le llegarían dos mensajes
    // seguidos diciendo casi lo mismo.
    const f = fila({ avisoAntesMoraDias: 0, avisoDiaVencimiento: false });
    expect(avisosDeHoy(f, '2026-10-03')).toHaveLength(0);
    expect(avisosDeHoy(f, '2026-10-08')).toHaveLength(0);
  });

  it('sin fecha de vencimiento no sale ninguno de los dos del vencimiento', () => {
    const f = fila({ fechaVencimiento: null, avisoDiaEmision: false });
    expect(avisosDeHoy(f, '2026-10-03')).toHaveLength(0);
    expect(avisosDeHoy(f, '2026-10-06')).toHaveLength(0);
  });

  it('un cargo sin cuota no dispara los avisos anclados en la emisión', () => {
    // Los cargos hechos a mano no tienen calendario: no se sabe cuándo se
    // "emitieron", así que solo les aplica lo que cuelga del vencimiento.
    const f = fila({ fechaEmision: null });
    expect(avisosDeHoy(f, '2026-09-28')).toHaveLength(0);
    expect(avisosDeHoy(f, '2026-10-06').map((a) => a.aviso)).toEqual(['antes-mora']);
  });

  describe('ruteo de canales', () => {
    it('el de la emisión no sale por SMS aunque el canal esté encendido', () => {
      expect(avisosDeHoy(fila(), '2026-09-28')[0].canales).toEqual(['correo', 'whatsapp']);
    });

    it('los dos del final salen por los tres canales', () => {
      // WhatsApp se SUMA aquí, no sustituye a nadie: la ventana de 24h puede
      // dejarlo fuera y el SMS sigue llegando igual. Antes se excluía por ese
      // riesgo, y era tratar a WhatsApp como si fuera el único portador.
      expect(avisosDeHoy(fila(), '2026-10-03')[0].canales).toEqual(['correo', 'whatsapp', 'sms']);
      expect(avisosDeHoy(fila(), '2026-10-06')[0].canales).toEqual(['correo', 'whatsapp', 'sms']);
    });

    it('un canal apagado se cae del ruteo', () => {
      const f = fila({ avisoSms: false });
      expect(avisosDeHoy(f, '2026-10-06')[0].canales).toEqual(['correo', 'whatsapp']);
    });

    it('si ningún canal del aviso está encendido, el aviso no existe', () => {
      // Apagados los tres, el aviso del vencimiento no tiene por dónde salir y
      // no debe contarse como pendiente. Antes bastaba con apagar correo y SMS
      // porque WhatsApp no lo llevaba; ahora sí, así que hay que apagarlo.
      const f = fila({ avisoCorreo: false, avisoSms: false, avisoWhatsapp: false });
      expect(avisosDeHoy(f, '2026-10-06')).toHaveLength(0);
    });

    it('el de la emisión aguanta solo con WhatsApp', () => {
      // Es el único que NO va por SMS, así que apagar correo lo deja colgando
      // de un único canal y sigue siendo válido. Iba pegado a la comprobación
      // de arriba; separado, un fallo dice cuál de las dos cosas se rompió.
      const f = fila({ avisoCorreo: false, avisoSms: false });
      expect(avisosDeHoy(f, '2026-09-28')[0].canales).toEqual(['whatsapp']);
    });
  });

  describe('el interruptor maestro del colegio', () => {
    it('sin decir nada, los tres canales están encendidos', () => {
      // Es lo que significa no tener fila en `admin_escolar_canales`, y lo que
      // hace que crear esa tabla no cambie el comportamiento de nadie.
      expect(avisosDeHoy(fila(), '2026-10-06')[0].canales).toEqual(['correo', 'whatsapp', 'sms']);
    });

    it('el canal apagado no sale aunque el concepto lo tenga encendido', () => {
      // El concepto dice "avisa por correo"; el colegio dice "no mando correos".
      // Manda el colegio: es el interruptor de arriba.
      const canales = { correo: false, whatsapp: true, sms: true };
      expect(avisosDeHoy(fila(), '2026-10-06', canales)[0].canales).toEqual(['whatsapp', 'sms']);
    });

    it('con los tres apagados no sale ningún aviso', () => {
      const canales = { correo: false, whatsapp: false, sms: false };
      expect(avisosDeHoy(fila(), '2026-09-28', canales)).toHaveLength(0);
      expect(avisosDeHoy(fila(), '2026-10-03', canales)).toHaveLength(0);
      expect(avisosDeHoy(fila(), '2026-10-06', canales)).toHaveLength(0);
    });

    it('apagar un canal no enciende los que el concepto tiene apagados', () => {
      // Los dos filtros se cruzan, no se sustituyen: el concepto solo avisa por
      // correo, y el colegio tiene correo apagado → no queda nada.
      const f = fila({ avisoWhatsapp: false, avisoSms: false });
      const canales = { correo: false, whatsapp: true, sms: true };
      expect(avisosDeHoy(f, '2026-09-28', canales)).toHaveLength(0);
    });
  });
});

describe('redactar', () => {
  const pend = (hoy: string) => avisosDeHoy(fila(), hoy)[0];

  it('el aviso del recargo da la fecha de la MORA, no la del vencimiento', () => {
    // Vence el 3 y la mora entra el 8. Decirle "paga antes del 3" le quitaría
    // cinco días que de verdad tiene.
    const t = redactar(pend('2026-10-06'), 'Colegio X').largo;
    expect(t).toContain('8 de octubre');
    expect(t).not.toContain('3 de octubre');
    expect(t).toContain('recargo por mora');
  });

  it('el del vencimiento dice cuántos días quedan antes del recargo', () => {
    expect(redactar(pend('2026-10-03'), 'Colegio X').largo).toContain('5 día(s) antes');
    // Sin gracia, ese mismo día ya lo tiene encima.
    const pegado = avisosDeHoy(fila({ moraDiasGracia: 0 }), '2026-10-03')[0];
    expect(redactar(pegado, 'Colegio X').largo).toContain('Ya se le aplicó el recargo');
  });

  it('el texto de SMS dice de qué colegio es; el largo no lo necesita', () => {
    // Llega de un número que el tutor no tiene agendado: sin el nombre del
    // colegio no se sabe quién escribe.
    const { largo, corto } = redactar(pend('2026-10-06'), 'Colegio X');
    expect(corto).toContain('Colegio X');
    expect(corto.length).toBeLessThan(largo.length);
  });
});

/**
 * A qué número o correo va cada canal.
 *
 * Los tres datos del contacto son distintos y rara vez coinciden: el fijo de
 * la casa, el celular al que se llama y el número por el que se escribe. El
 * error caro aquí es el SMS al teléfono fijo — se paga, no llega a nadie, y
 * nadie se entera de que no llegó.
 */
describe('destinoDelCanal', () => {
  it('el correo sale al correo, y sin correo no sale', () => {
    expect(destinoDelCanal(fila(), 'correo')).toBe('a@b.com');
    expect(destinoDelCanal(fila({ email: null }), 'correo')).toBeNull();
    expect(destinoDelCanal(fila({ email: '  ' }), 'correo')).toBeNull();
  });

  it('WhatsApp prefiere el número de WhatsApp y cae al celular', () => {
    expect(destinoDelCanal(fila({ whatsapp: '8091112222', celular: '8093334444' }), 'whatsapp'))
      .toBe('8091112222');
    expect(destinoDelCanal(fila({ whatsapp: null, celular: '8093334444' }), 'whatsapp'))
      .toBe('8093334444');
  });

  it('el SMS prefiere el celular y cae al de WhatsApp', () => {
    expect(destinoDelCanal(fila({ celular: '8093334444', whatsapp: '8091112222' }), 'sms'))
      .toBe('8093334444');
    expect(destinoDelCanal(fila({ celular: null, whatsapp: '8091112222' }), 'sms'))
      .toBe('8091112222');
  });

  it('el teléfono fijo NO recibe ni WhatsApp ni SMS', () => {
    // Es la única regla que cuesta dinero de verdad: un SMS a un fijo se cobra
    // igual y no lo lee nadie.
    const soloFijo = fila({ whatsapp: null, celular: null, telefono: '8095550000' });
    expect(destinoDelCanal(soloFijo, 'whatsapp')).toBeNull();
    expect(destinoDelCanal(soloFijo, 'sms')).toBeNull();
  });
});
