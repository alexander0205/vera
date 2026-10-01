// tests/unit/contabilidad-cambio-tipo.test.ts
import { describe, it, expect } from 'vitest';
import {
  evaluarCambioTipo, grupoDeTipo, type HechosCambioTipo,
} from '@/lib/contabilidad/cambio-tipo';

/**
 * Cuándo se le puede cambiar el tipo a una cuenta con movimientos.
 *
 * Los casos de arriba son los reales que lo motivaron (2026-10-01): cuentas de
 * gasto creadas como Activo por error, con asientos ya hechos.
 */

/** Una cuenta de Activo con 3 movimientos que se quiere pasar a Gastos, confirmada. */
function hechos(p: Partial<HechosCambioTipo> = {}): HechosCambioTipo {
  return {
    codigo: '6301',
    nombre: 'Impuesto a los activos',
    tipoActual: 'activo',
    tipoNuevo: 'gasto',
    naturalezaActual: 'deudora',
    naturalezaFinal: 'deudora',
    movimientos: 3,
    movimientosEnEjercicioCerrado: false,
    usosEnMetodos: [],
    confirmado: true,
    ...p,
  };
}

describe('grupoDeTipo', () => {
  it('separa las cuentas del Balance de las del Estado de resultados', () => {
    expect(grupoDeTipo('activo')).toBe('balance');
    expect(grupoDeTipo('pasivo')).toBe('balance');
    expect(grupoDeTipo('patrimonio')).toBe('balance');
    expect(grupoDeTipo('ingreso')).toBe('resultado');
    expect(grupoDeTipo('costo')).toBe('resultado');
    expect(grupoDeTipo('gasto')).toBe('resultado');
  });
});

describe('casos reales', () => {
  it('SOLUCIONES 6301: Activo → Gastos sin confirmar pide confirmación y explica el efecto', () => {
    const r = evaluarCambioTipo(hechos({ confirmado: false }));
    expect(r.decision).toBe('requiere-confirmacion');
    if (r.decision !== 'requiere-confirmacion') return;
    expect(r.mensaje).toBe(
      '"6301 Impuesto a los activos" tiene 3 movimientos. Pasarla de Activo a Gastos no cambia ' +
      'ningún asiento. Su saldo pasa del Balance general al Estado de resultados, también en los ' +
      'reportes de meses anteriores.',
    );
  });

  it('SOLUCIONES 6304: confirmado, se permite', () => {
    const r = evaluarCambioTipo(hechos({ codigo: '6304', nombre: 'Recargos impuestos' }));
    expect(r).toEqual({ decision: 'permitido' });
  });

  it('KIDS SCHOOL 6320: 2 movimientos que se anulan, confirmado, se permite', () => {
    const r = evaluarCambioTipo(hechos({ codigo: '6320', nombre: 'Otros gastos', movimientos: 2 }));
    expect(r).toEqual({ decision: 'permitido' });
  });
});

describe('sin nada que proteger', () => {
  it('sin movimientos, cualquier cambio es libre (incluso Activo → Ingresos)', () => {
    expect(evaluarCambioTipo(hechos({ movimientos: 0, tipoNuevo: 'ingreso', confirmado: false })))
      .toEqual({ decision: 'libre' });
  });

  it('el mismo tipo no es un cambio', () => {
    expect(evaluarCambioTipo(hechos({ tipoNuevo: 'activo', confirmado: false })))
      .toEqual({ decision: 'libre' });
  });
});

describe('regla 1: misma naturaleza', () => {
  it('Activo → Ingresos se bloquea: daría vuelta al saldo', () => {
    const r = evaluarCambioTipo(hechos({ tipoNuevo: 'ingreso', naturalezaFinal: 'acreedora' }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('daría vuelta a su saldo');
    expect(r.mensaje).toContain('solo puede pasar a Activo, Costos o Gastos');
  });

  it('Pasivo → Patrimonio tienen la misma naturaleza y se permite', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'pasivo', tipoNuevo: 'patrimonio',
      naturalezaActual: 'acreedora', naturalezaFinal: 'acreedora',
    }));
    expect(r).toEqual({ decision: 'permitido' });
  });

  it('cambiar la naturaleza en la misma operación se bloquea', () => {
    const r = evaluarCambioTipo(hechos({ naturalezaFinal: 'acreedora' }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('pero no la naturaleza');
  });

  it('una cuenta de naturaleza invertida no puede cambiar de tipo con movimientos', () => {
    // 1202 Depreciación acumulada es activo pero acreedora: Gastos es deudora.
    const r = evaluarCambioTipo(hechos({
      codigo: '1202', nombre: 'Depreciación acumulada',
      naturalezaActual: 'acreedora', naturalezaFinal: 'acreedora',
    }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('daría vuelta a su saldo');
    expect(r.mensaje).toContain('solo puede pasar a Pasivo, Patrimonio o Ingresos');
  });

  it('una cuenta invertida sí puede pasar a un tipo de su misma naturaleza (1202 → Pasivo)', () => {
    const r = evaluarCambioTipo(hechos({
      codigo: '1202', nombre: 'Depreciación acumulada', tipoNuevo: 'pasivo',
      naturalezaActual: 'acreedora', naturalezaFinal: 'acreedora',
    }));
    expect(r).toEqual({ decision: 'permitido' });
  });
});

describe('regla 2: ejercicio cerrado', () => {
  it('con movimientos en un ejercicio cerrado se bloquea', () => {
    const r = evaluarCambioTipo(hechos({ movimientosEnEjercicioCerrado: true }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toBe(
      '"6301 Impuesto a los activos" tiene movimientos en un ejercicio ya cerrado, y esos saldos ' +
      'no se pueden mover hacia atrás. Para pasarla de Activo a Gastos, reabre el ejercicio en ' +
      '«Cierre de ejercicio», cambia el tipo y vuelve a cerrarlo.',
    );
  });

  it('también cuando el cambio no sale del reporte (Costos → Gastos)', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'costo', tipoNuevo: 'gasto', movimientosEnEjercicioCerrado: true,
    }));
    expect(r.decision).toBe('bloqueado');
  });

  it('Costos → Gastos sin ejercicio cerrado explica que se queda en el Estado de resultados', () => {
    const r = evaluarCambioTipo(hechos({ tipoActual: 'costo', tipoNuevo: 'gasto', confirmado: false }));
    expect(r.decision).toBe('requiere-confirmacion');
    if (r.decision !== 'requiere-confirmacion') return;
    expect(r.mensaje).toContain('dentro del Estado de resultados');
  });
});

describe('regla 3: métodos de cobro', () => {
  it('la cuenta donde entra el dinero de un método tiene que seguir siendo Activo', () => {
    const r = evaluarCambioTipo(hechos({ usosEnMetodos: [{ metodo: 'Efectivo', rol: 'entrada' }] }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('entra el dinero de Efectivo');
    expect(r.mensaje).toContain('Configuración contable');
  });

  it('la cuenta de comisión de una pasarela tiene que seguir siendo Gastos', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'gasto', tipoNuevo: 'costo',
      usosEnMetodos: [{ metodo: 'Link de pago — CardNet', rol: 'comision' }],
    }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('comisión de Link de pago — CardNet');
  });

  it('pasar a Gastos la cuenta de comisión está bien', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'costo', tipoNuevo: 'gasto',
      usosEnMetodos: [{ metodo: 'Link de pago — Azul', rol: 'comision' }],
    }));
    expect(r).toEqual({ decision: 'permitido' });
  });

  it('revisa todos los usos, no solo el primero', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'costo', tipoNuevo: 'gasto',
      usosEnMetodos: [
        { metodo: 'Link de pago — Azul', rol: 'comision' },
        { metodo: 'Efectivo', rol: 'entrada' },
      ],
    }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('entra el dinero de Efectivo');
  });
});

describe('regla 4: confirmación', () => {
  it('Gastos → Activo explica que el saldo pasa al Balance general', () => {
    const r = evaluarCambioTipo(hechos({ tipoActual: 'gasto', tipoNuevo: 'activo', confirmado: false }));
    expect(r.decision).toBe('requiere-confirmacion');
    if (r.decision !== 'requiere-confirmacion') return;
    expect(r.mensaje).toContain('del Estado de resultados al Balance general');
  });

  it('un solo movimiento se escribe en singular', () => {
    const r = evaluarCambioTipo(hechos({ movimientos: 1, confirmado: false }));
    expect(r.decision).toBe('requiere-confirmacion');
    if (r.decision !== 'requiere-confirmacion') return;
    expect(r.mensaje).toContain('1 movimiento.');
  });

  it('las reglas que bloquean ganan aunque venga confirmado', () => {
    const r = evaluarCambioTipo(hechos({ tipoNuevo: 'ingreso', naturalezaFinal: 'acreedora', confirmado: true }));
    expect(r.decision).toBe('bloqueado');
  });

  it('Pasivo → Patrimonio explica que cambia de sección dentro del Balance general', () => {
    const r = evaluarCambioTipo(hechos({
      tipoActual: 'pasivo', tipoNuevo: 'patrimonio',
      naturalezaActual: 'acreedora', naturalezaFinal: 'acreedora', confirmado: false,
    }));
    expect(r.decision).toBe('requiere-confirmacion');
    if (r.decision !== 'requiere-confirmacion') return;
    expect(r.mensaje).toContain('cambia de sección dentro del Balance general');
  });
});
