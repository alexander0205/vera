/**
 * Qué acciones ofrece el menú ⋮ de un cargo escolar.
 *
 * El menú de la ficha del estudiante tenía trece ítems, cada uno con su
 * condición escrita en línea, y ninguna prueba. La ficha de la familia iba a
 * enseñar ese mismo menú: una condición mal copiada habría cambiado lo que ve
 * cada rol en las dos pantallas a la vez, sin que nada avisara.
 *
 * Estas pruebas fijan las reglas tal como estaban ANTES de mover una sola línea
 * del menú. Cada caso es una forma concreta de equivocarse: ofrecerle «Anular
 * factura» a quien no puede, esconderle la factura a quien solo puede mirar, o
 * dejar anular la mensualidad suelta de un mes que ya se facturó.
 */

import { describe, it, expect } from 'vitest';
import {
  ACCIONES_DE_CARGO,
  accionesDeCargo,
  cargoDeFila,
  mesesConFactura,
  mesYaFacturado,
  montoCorregible,
  type AccionDeCargo,
  type PermisosDeCargo,
} from '@/lib/administracion-escolar/acciones-cargo';
import type { FilaMes } from '@/lib/administracion-escolar/periodos-familia';

const NINGUNO: PermisosDeCargo = {
  pagos: false, facturar: false, gestionar: false, anularFactura: false, emitirDgii: false,
};
const TODOS: PermisosDeCargo = {
  pagos: true, facturar: true, gestionar: true, anularFactura: true, emitirDgii: true,
};
/**
 * «Personal del colegio»: cobra y gestiona, pero no entra a Facturación. Tiene
 * pagos y gestionar; le faltan `facturas:crear` —así que no factura—,
 * `facturas:anular` y `facturas:emitir-dgii`.
 */
const PERSONAL: PermisosDeCargo = {
  pagos: true, facturar: false, gestionar: true, anularFactura: false, emitirDgii: false,
};

const sinFactura = (estado = 'pendiente') =>
  ({ estado, ecfDocumentId: null, facturaEstado: null });
const conFactura = (estado = 'pendiente', facturaEstado: string | null = 'ACEPTADO') =>
  ({ estado, ecfDocumentId: 9001, facturaEstado });

const SOLO_MIRAR: AccionDeCargo[] = ['ver-factura', 'abrir-facturacion', 'ver-pdf', 'imprimir'];

describe('accionesDeCargo — quien solo puede mirar', () => {
  it('sin permisos y sin factura no hay nada que ofrecer: el menú pinta «—»', () => {
    expect(accionesDeCargo(sinFactura(), NINGUNO)).toEqual([]);
  });

  it('sin permisos pero con factura, la factura se puede abrir, ver en PDF e imprimir', () => {
    expect(accionesDeCargo(conFactura(), NINGUNO)).toEqual(SOLO_MIRAR);
  });
});

describe('accionesDeCargo — cargo pendiente sin factura', () => {
  it('con todo: facturar, vincular y anular el cargo, en ese orden', () => {
    expect(accionesDeCargo(sinFactura(), { ...NINGUNO, pagos: true, facturar: true, gestionar: true }))
      .toEqual(['facturar', 'vincular', 'anular-cargo']);
  });

  it('solo con pagos se puede vincular: ese endpoint pide pagos, no facturar', () => {
    expect(accionesDeCargo(sinFactura(), { ...NINGUNO, pagos: true })).toEqual(['vincular']);
  });

  it('solo con gestionar se puede anular el cargo y nada más', () => {
    expect(accionesDeCargo(sinFactura(), { ...NINGUNO, gestionar: true })).toEqual(['anular-cargo']);
  });

  it('parcial y vencido cuentan como pendientes', () => {
    for (const estado of ['parcial', 'vencido']) {
      expect(accionesDeCargo(sinFactura(estado), TODOS)).toEqual(['facturar', 'vincular', 'anular-cargo']);
    }
  });
});

describe('accionesDeCargo — «Personal del colegio»', () => {
  it('sin factura: vincula y anula, pero no factura', () => {
    expect(accionesDeCargo(sinFactura(), PERSONAL)).toEqual(['vincular', 'anular-cargo']);
  });

  it('con factura aceptada: cobra y avisa, sin mora, correo ni anular la factura', () => {
    const acciones = accionesDeCargo(conFactura(), PERSONAL);
    expect(acciones).toEqual(['registrar-pago', 'reenviar-whatsapp', ...SOLO_MIRAR]);
    expect(acciones).not.toContain('mora');
    expect(acciones).not.toContain('enviar-correo');
    expect(acciones).not.toContain('anular-factura');
  });
});

describe('accionesDeCargo — cargo pendiente con factura', () => {
  it('aceptada y con todos los permisos: las nueve, en el orden del menú', () => {
    expect(accionesDeCargo(conFactura('pendiente', 'ACEPTADO'), TODOS)).toEqual([
      'registrar-pago', 'reenviar-whatsapp', 'mora',
      'ver-factura', 'abrir-facturacion', 'ver-pdf', 'imprimir',
      'enviar-correo', 'anular-factura',
    ]);
  });

  it('en borrador aparece «Emitir en DGII», entre imprimir y enviar por correo', () => {
    expect(accionesDeCargo(conFactura('pendiente', 'BORRADOR'), TODOS)).toEqual([
      'registrar-pago', 'reenviar-whatsapp', 'mora',
      'ver-factura', 'abrir-facturacion', 'ver-pdf', 'imprimir',
      'emitir-dgii', 'enviar-correo', 'anular-factura',
    ]);
  });

  // Un permiso cada vez. Los roles se editan por empresa, así que existe quien
  // cobra sin gestionar y quien gestiona sin cobrar; con los tres permisos
  // juntos —o con ninguno— no se ve si «Registrar pago» mira el de pagos o el
  // de gestionar, y cruzarlos le quitaba el cobro al cajero sin que nada fallara.
  it('solo con pagos se cobra, y no se manda el aviso', () => {
    expect(accionesDeCargo(conFactura(), { ...NINGUNO, pagos: true }))
      .toEqual(['registrar-pago', ...SOLO_MIRAR]);
  });

  it('solo con gestionar se manda el aviso, y no se cobra', () => {
    expect(accionesDeCargo(conFactura(), { ...NINGUNO, gestionar: true }))
      .toEqual(['reenviar-whatsapp', ...SOLO_MIRAR]);
  });

  it('solo con facturar hay mora y correo, sin cobro ni aviso', () => {
    expect(accionesDeCargo(conFactura(), { ...NINGUNO, facturar: true }))
      .toEqual(['mora', ...SOLO_MIRAR, 'enviar-correo']);
  });

  it('con factura nunca se ofrece facturar, vincular ni anular el cargo', () => {
    for (const estado of ['pendiente', 'parcial', 'vencido', 'pagado', 'anulado']) {
      for (const facturaEstado of [null, 'BORRADOR', 'ACEPTADO']) {
        const acciones = accionesDeCargo(conFactura(estado, facturaEstado), TODOS);
        expect(acciones).not.toContain('facturar');
        expect(acciones).not.toContain('vincular');
        expect(acciones).not.toContain('anular-cargo');
      }
    }
  });
});

describe('accionesDeCargo — «Emitir en DGII»', () => {
  it('sale mientras la factura no se haya mandado: borrador, sin estado o estado vacío', () => {
    for (const facturaEstado of ['BORRADOR', null, '']) {
      expect(accionesDeCargo(conFactura('pendiente', facturaEstado), TODOS)).toContain('emitir-dgii');
    }
  });

  it('no sale en una factura que ya pasó por la DGII, la aceptara o no', () => {
    for (const facturaEstado of ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO']) {
      expect(accionesDeCargo(conFactura('pendiente', facturaEstado), TODOS)).not.toContain('emitir-dgii');
    }
  });

  it('no sale sin el permiso de emitir', () => {
    expect(accionesDeCargo(conFactura('pendiente', 'BORRADOR'), { ...TODOS, emitirDgii: false }))
      .not.toContain('emitir-dgii');
  });

  it('no sale sin factura, aunque se tenga el permiso', () => {
    expect(accionesDeCargo(sinFactura(), TODOS)).not.toContain('emitir-dgii');
  });
});

describe('accionesDeCargo — cargo ya pagado con factura', () => {
  it('no se cobra, no se avisa y no lleva mora', () => {
    const acciones = accionesDeCargo(conFactura('pagado'), TODOS);
    expect(acciones).not.toContain('registrar-pago');
    expect(acciones).not.toContain('reenviar-whatsapp');
    expect(acciones).not.toContain('mora');
  });

  it('la factura se sigue viendo, mandando por correo y anulando', () => {
    expect(accionesDeCargo(conFactura('pagado'), TODOS))
      .toEqual([...SOLO_MIRAR, 'enviar-correo', 'anular-factura']);
  });

  it('si su factura sigue en borrador, todavía se puede emitir: no depende de que se deba', () => {
    // Cobrar un borrador es lo normal aquí. Que el cargo esté saldado no quita
    // que la factura siga sin mandarse a la DGII.
    expect(accionesDeCargo(conFactura('pagado', 'BORRADOR'), TODOS))
      .toEqual([...SOLO_MIRAR, 'emitir-dgii', 'enviar-correo', 'anular-factura']);
  });

  it('el correo pide poder facturar y anular la factura pide su propio permiso', () => {
    expect(accionesDeCargo(conFactura('pagado'), { ...TODOS, facturar: false }))
      .toEqual([...SOLO_MIRAR, 'anular-factura']);
    expect(accionesDeCargo(conFactura('pagado'), { ...TODOS, anularFactura: false }))
      .toEqual([...SOLO_MIRAR, 'enviar-correo']);
  });
});

describe('accionesDeCargo — «Anular cargo»', () => {
  it('se esconde si el mes ya tiene factura en otra mensualidad', () => {
    expect(accionesDeCargo(sinFactura(), TODOS, { mesTieneFactura: true })).not.toContain('anular-cargo');
    expect(accionesDeCargo(sinFactura(), TODOS, { mesTieneFactura: false })).toContain('anular-cargo');
    expect(accionesDeCargo(sinFactura(), TODOS)).toContain('anular-cargo');
  });

  it('un cargo ya anulado no se vuelve a anular', () => {
    expect(accionesDeCargo(sinFactura('anulado'), TODOS)).not.toContain('anular-cargo');
  });

  it('un cargo pagado sin factura sí se puede anular: no depende de estar pendiente', () => {
    expect(accionesDeCargo(sinFactura('pagado'), TODOS)).toEqual(['anular-cargo']);
  });

  it('con factura no se ofrece nunca, tenga el mes factura o no', () => {
    expect(accionesDeCargo(conFactura(), TODOS, { mesTieneFactura: false })).not.toContain('anular-cargo');
    expect(accionesDeCargo(conFactura(), TODOS, { mesTieneFactura: true })).not.toContain('anular-cargo');
  });
});

describe('accionesDeCargo — para cualquier combinación', () => {
  const SI_NO = [false, true];
  const combinaciones: {
    cargo: { estado: string; ecfDocumentId: number | null; facturaEstado: string | null };
    p: PermisosDeCargo;
    mesTieneFactura: boolean;
  }[] = [];
  for (const pagos of SI_NO) for (const facturar of SI_NO) for (const gestionar of SI_NO)
    for (const anularFactura of SI_NO) for (const emitirDgii of SI_NO)
      for (const estado of ['pendiente', 'parcial', 'vencido', 'pagado', 'anulado'])
        for (const ecfDocumentId of [null, 9001])
          for (const facturaEstado of [null, 'BORRADOR', 'ACEPTADO'])
            for (const mesTieneFactura of SI_NO) {
              combinaciones.push({
                cargo: { estado, ecfDocumentId, facturaEstado },
                p: { pagos, facturar, gestionar, anularFactura, emitirDgii },
                mesTieneFactura,
              });
            }

  it('el resultado respeta el orden del menú y no repite ninguna acción', () => {
    expect(combinaciones).toHaveLength(32 * 5 * 2 * 3 * 2);
    for (const { cargo, p, mesTieneFactura } of combinaciones) {
      const acciones = accionesDeCargo(cargo, p, { mesTieneFactura });
      const posiciones = acciones.map((a) => ACCIONES_DE_CARGO.indexOf(a));
      expect(posiciones.every((pos) => pos >= 0)).toBe(true);
      expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
      expect(new Set(acciones).size).toBe(acciones.length);
    }
  });

  it('la lista sale vacía exactamente cuando el menú de antes pintaba «—»', () => {
    // La expresión `tieneAccion` del menú original, copiada tal cual. Decidía
    // si había tres puntos o una raya; ahora lo decide que la lista esté vacía,
    // y las dos cosas tienen que coincidir siempre.
    for (const { cargo, p, mesTieneFactura } of combinaciones) {
      const pendiente = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
      const tieneFactura = cargo.ecfDocumentId != null;
      const puedeAnular = p.gestionar && cargo.estado !== 'anulado' && !tieneFactura && !mesTieneFactura;
      const tieneAccion = (pendiente && tieneFactura && (p.pagos || p.facturar))
        || (pendiente && !tieneFactura && (p.facturar || p.pagos))
        || tieneFactura
        || puedeAnular;
      expect(accionesDeCargo(cargo, p, { mesTieneFactura }).length > 0).toBe(tieneAccion);
    }
  });

  it('las trece acciones existen y cada una se alcanza con algún cargo', () => {
    expect(ACCIONES_DE_CARGO).toHaveLength(13);
    const vistas = new Set<AccionDeCargo>();
    for (const { cargo, p, mesTieneFactura } of combinaciones) {
      for (const a of accionesDeCargo(cargo, p, { mesTieneFactura })) vistas.add(a);
    }
    expect([...vistas].sort()).toEqual([...ACCIONES_DE_CARGO].sort());
  });
});

describe('mesesConFactura + mesYaFacturado', () => {
  // Dos mensualidades de marzo de 2027 —la duplicada es el caso real— más un
  // uniforme facturado ese mismo mes y mensualidades de otros meses y años.
  const marzoFacturada = { conceptoTipo: 'mensualidad', mes: 3, anio: 2027, estado: 'pendiente', ecfDocumentId: 9001 };
  const marzoSuelta    = { conceptoTipo: 'mensualidad', mes: 3, anio: 2027, estado: 'pendiente', ecfDocumentId: null };
  const abril          = { conceptoTipo: 'mensualidad', mes: 4, anio: 2027, estado: 'pendiente', ecfDocumentId: null };
  const marzoOtroAnio  = { conceptoTipo: 'mensualidad', mes: 3, anio: 2028, estado: 'pendiente', ecfDocumentId: null };
  const uniforme       = { conceptoTipo: 'uniforme',    mes: 3, anio: 2027, estado: 'pendiente', ecfDocumentId: 9002 };

  it('una mensualidad facturada marca a la otra del mismo mes y año', () => {
    const meses = mesesConFactura([marzoFacturada, marzoSuelta, abril]);
    expect([...meses]).toEqual(['2027-3']);
    expect(mesYaFacturado(marzoSuelta, meses)).toBe(true);
    expect(mesYaFacturado(marzoFacturada, meses)).toBe(true);
  });

  it('no marca otro mes ni el mismo mes de otro año', () => {
    const meses = mesesConFactura([marzoFacturada, marzoSuelta, abril, marzoOtroAnio]);
    expect(mesYaFacturado(abril, meses)).toBe(false);
    expect(mesYaFacturado(marzoOtroAnio, meses)).toBe(false);
  });

  it('un uniforme facturado en ese mes ni marca el mes ni queda marcado', () => {
    expect(mesesConFactura([uniforme, marzoSuelta]).size).toBe(0);
    // Con la mensualidad de marzo facturada, el uniforme de marzo sigue sin
    // contar como «mes ya facturado»: la regla es solo de mensualidades.
    const meses = mesesConFactura([marzoFacturada, uniforme]);
    expect([...meses]).toEqual(['2027-3']);
    expect(mesYaFacturado(uniforme, meses)).toBe(false);
  });

  it('una mensualidad anulada con factura no marca el mes', () => {
    const meses = mesesConFactura([{ ...marzoFacturada, estado: 'anulado' }, marzoSuelta]);
    expect(meses.size).toBe(0);
    expect(mesYaFacturado(marzoSuelta, meses)).toBe(false);
  });

  it('sin mes no hay mes que marcar', () => {
    const sinMes = { conceptoTipo: 'mensualidad', mes: null, anio: 2027, estado: 'pendiente', ecfDocumentId: 9003 };
    const meses = mesesConFactura([sinMes]);
    expect(meses.size).toBe(0);
    expect(mesYaFacturado(sinMes, mesesConFactura([marzoFacturada, sinMes]))).toBe(false);
  });

  it('es la regla que esconde «Anular cargo» en la mensualidad suelta', () => {
    const meses = mesesConFactura([marzoFacturada, marzoSuelta, abril]);
    const p = { ...NINGUNO, gestionar: true };
    expect(accionesDeCargo({ ...marzoSuelta, facturaEstado: null }, p, { mesTieneFactura: mesYaFacturado(marzoSuelta, meses) }))
      .toEqual([]);
    expect(accionesDeCargo({ ...abril, facturaEstado: null }, p, { mesTieneFactura: mesYaFacturado(abril, meses) }))
      .toEqual(['anular-cargo']);
  });
});

describe('cargoDeFila — la fila de la familia, dicha como la lee el menú', () => {
  // La mensualidad de marzo de 2027 tal como la manda la ruta de la familia:
  // ya facturada, con la factura todavía en borrador y la mitad cobrada.
  const fila: FilaMes = {
    key: 'c7001',
    tipo: 'cargo',
    cargoId: 7001,
    cuotaId: 501,
    conceptoId: 31,
    concepto: 'Colegiatura',
    conceptoTipo: 'mensualidad',
    mes: 3,
    anio: 2027,
    fechaVencimiento: '2027-03-05',
    montoCentavos: 450_000,
    saldoCentavos: 225_000,
    estado: 'parcial',
    ecfDocumentId: 9001,
    encf: 'E310000000001',
    codigo: 'F-2027-000123',
    facturaEstado: 'BORRADOR',
    moraCentavos: 0,
    moraSaldoCentavos: 0,
    moraNotaId: null,
    moraNotaCount: 0,
  };

  it('cambia los tres nombres que no coinciden y deja lo demás como viene', () => {
    expect(cargoDeFila(fila)).toEqual({
      id: 7001,
      concepto: 'Colegiatura',
      conceptoTipo: 'mensualidad',
      mes: 3,
      anio: 2027,
      montoCentavos: 450_000,
      saldoCentavos: 225_000,
      estado: 'parcial',
      ecfDocumentId: 9001,
      facturaEncf: 'E310000000001',
      facturaCodigo: 'F-2027-000123',
      facturaEstado: 'BORRADOR',
    });
  });

  it('conserva el estado ante la DGII: sin él «Emitir en DGII» saldría en toda factura', () => {
    const borrador = cargoDeFila(fila)!;
    const aceptada = cargoDeFila({ ...fila, facturaEstado: 'ACEPTADO' })!;
    expect(accionesDeCargo(borrador, TODOS)).toContain('emitir-dgii');
    expect(accionesDeCargo(aceptada, TODOS)).not.toContain('emitir-dgii');
  });

  it('conserva el tipo del concepto: con él se sabe si el mes ya tiene factura', () => {
    const suelta = cargoDeFila({
      ...fila, key: 'c7002', cargoId: 7002, estado: 'pendiente',
      ecfDocumentId: null, encf: null, codigo: null, facturaEstado: null,
    })!;
    const meses = mesesConFactura([cargoDeFila(fila)!, suelta]);
    expect(mesYaFacturado(suelta, meses)).toBe(true);
    expect(accionesDeCargo(suelta, TODOS, { mesTieneFactura: mesYaFacturado(suelta, meses) }))
      .not.toContain('anular-cargo');
  });

  it('una cuota prevista no es un cargo: no tiene menú', () => {
    expect(cargoDeFila({
      ...fila, key: 'p88-abr', tipo: 'previsto', cargoId: null, estado: 'previsto', saldoCentavos: 0,
      ecfDocumentId: null, encf: null, codigo: null, facturaEstado: null,
    })).toBeNull();
    // Aunque llegara con un id: lo que manda es que todavía no es deuda.
    expect(cargoDeFila({ ...fila, tipo: 'previsto' })).toBeNull();
  });

  it('una fila de cargo sin id tampoco: no habría sobre qué actuar', () => {
    expect(cargoDeFila({ ...fila, cargoId: null })).toBeNull();
  });
});

describe('montoCorregible — a qué cargos se les corrige el monto en la tabla', () => {
  it('uno pendiente y sin factura, con permiso de gestionar: sí', () => {
    expect(montoCorregible({ estado: 'pendiente', ecfDocumentId: null }, true)).toBe(true);
    expect(montoCorregible({ estado: 'vencido', ecfDocumentId: null }, true)).toBe(true);
    expect(montoCorregible({ estado: 'parcial', ecfDocumentId: null }, true)).toBe(true);
  });

  it('sin permiso de gestionar: no, esté como esté', () => {
    expect(montoCorregible({ estado: 'pendiente', ecfDocumentId: null }, false)).toBe(false);
  });

  it('ya facturado: no; se corrige la factura, no el cargo', () => {
    expect(montoCorregible({ estado: 'pendiente', ecfDocumentId: 77 }, true)).toBe(false);
    expect(montoCorregible({ estado: 'pagado', ecfDocumentId: 77 }, true)).toBe(false);
  });

  it('anulado: no, ya no es deuda de nadie', () => {
    expect(montoCorregible({ estado: 'anulado', ecfDocumentId: null }, true)).toBe(false);
  });
});
