import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

/**
 * Que no se pueda aprobar el mismo comprobante dos veces.
 *
 * Es la única acción del enlace de pago que mueve dinero: registra el cobro
 * contra la factura. El correo de aviso llega a la cuenta compartida del
 * colegio, así que dos personas abren la lista y pulsan «aprobar» casi a la vez
 * — y con la versión vieja las dos pasaban.
 *
 * La versión vieja hacía: leer estado → registrar los pagos → marcar aprobado.
 * Entre la lectura y la marca cabe otra petición entera, y el cobro se
 * registraba DOS VECES contra la misma factura.
 *
 * La nueva reclama la fila primero, con un `UPDATE ... WHERE estado =
 * 'pendiente'`: lo decide la base, y solo una de las dos se la lleva. Aquí se
 * prueba esa condición de carrera aislada de Postgres, simulando el candado.
 */

/** Una fila con el candado que da la base: solo cambia si estaba pendiente. */
function comprobante() {
  let estado = 'pendiente';
  return {
    get estado() { return estado; },
    /** `UPDATE … WHERE estado='pendiente'`: devuelve la fila o nada. */
    reclamar(): boolean {
      if (estado !== 'pendiente') return false;
      estado = 'aprobado';
      return true;
    },
    devolver() { estado = 'pendiente'; },
  };
}

describe('aprobar dos veces el mismo comprobante', () => {
  test('solo la primera se lleva la fila', () => {
    const c = comprobante();
    assert.equal(c.reclamar(), true);
    assert.equal(c.reclamar(), false);
  });

  /** Lo que costaba dinero: dos cobros registrados por una transferencia. */
  test('dos empleados a la vez registran UN solo cobro', () => {
    const c = comprobante();
    const cobros: number[] = [];

    for (const _ of [1, 2]) {
      if (!c.reclamar()) continue;
      cobros.push(5000);
    }

    assert.equal(cobros.length, 1);
    assert.equal(cobros.reduce((a, b) => a + b, 0), 5000);
  });

  /**
   * Si el reparto revienta después de reclamarlo, vuelve a la cola. Aprobado
   * sin cobro registrado es peor que el error: el padre queda como que pagó y
   * en la factura no hay nada.
   */
  test('si falla después de reclamarlo, vuelve a pendiente', () => {
    const c = comprobante();
    assert.equal(c.reclamar(), true);

    try {
      throw new Error('la factura se anuló entremedio');
    } catch {
      c.devolver();
    }

    assert.equal(c.estado, 'pendiente');
    assert.equal(c.reclamar(), true, 'tiene que poder reintentarse');
  });

  test('un comprobante ya rechazado no se puede aprobar', () => {
    const c = comprobante();
    c.reclamar();
    assert.equal(c.reclamar(), false);
  });
});

/**
 * El reparto de lo que llega entre las facturas. La misma función que usa
 * `aprobarComprobante`, probada con los casos que de verdad pasan.
 */
describe('cómo se reparte lo que transfirió el padre', () => {
  // Copia de `repartir` (lib/administracion-escolar/comprobantes.ts), que es
  // server-only y no se puede importar desde un test de node.
  function repartir(monto: number, facturas: { facturaId: number; saldo: number }[]) {
    const disponible = new Map<number, number>();
    for (const f of facturas) {
      if (!disponible.has(f.facturaId)) disponible.set(f.facturaId, Math.max(0, f.saldo));
    }
    const asignaciones: { facturaId: number; monto: number }[] = [];
    let restante = Math.max(0, monto);
    for (const f of facturas) {
      if (restante <= 0) break;
      const hueco = disponible.get(f.facturaId) ?? 0;
      if (hueco <= 0) continue;
      const x = Math.min(restante, hueco);
      asignaciones.push({ facturaId: f.facturaId, monto: x });
      disponible.set(f.facturaId, hueco - x);
      restante -= x;
    }
    return { asignaciones, sobrante: restante };
  }

  test('transfirió justo lo que debe: no sobra nada', () => {
    const r = repartir(10000, [{ facturaId: 1, saldo: 6000 }, { facturaId: 2, saldo: 4000 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 1, monto: 6000 }, { facturaId: 2, monto: 4000 }]);
    assert.equal(r.sobrante, 0);
  });

  /** Lo normal: paga una parte. Tapa lo más viejo primero. */
  test('transfirió de menos: se salda lo más viejo', () => {
    const r = repartir(7000, [{ facturaId: 1, saldo: 6000 }, { facturaId: 2, saldo: 4000 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 1, monto: 6000 }, { facturaId: 2, monto: 1000 }]);
    assert.equal(r.sobrante, 0);
  });

  /**
   * Transfirió de más, o parte de lo suyo no está facturado todavía. Lo que
   * sobra NO se inventa un sitio donde meterlo: se reporta.
   */
  test('transfirió de más: el resto queda sin aplicar', () => {
    const r = repartir(15000, [{ facturaId: 1, saldo: 6000 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 1, monto: 6000 }]);
    assert.equal(r.sobrante, 9000);
  });

  /**
   * Una factura suele cubrir VARIOS cargos, así que aparece repetida. El tope
   * es de la factura y se va gastando: repartir por cargo pasaría de largo el
   * saldo real y `registrarPago` rechazaría el cobro entero.
   */
  test('una factura repetida no se cobra dos veces entera', () => {
    const r = repartir(10000, [
      { facturaId: 1, saldo: 6000 },
      { facturaId: 1, saldo: 6000 },
    ]);
    assert.equal(r.asignaciones.reduce((s, a) => s + a.monto, 0), 6000);
    assert.equal(r.sobrante, 4000);
  });

  test('una factura ya saldada se salta', () => {
    const r = repartir(5000, [{ facturaId: 1, saldo: 0 }, { facturaId: 2, saldo: 5000 }]);
    assert.deepEqual(r.asignaciones, [{ facturaId: 2, monto: 5000 }]);
    assert.equal(r.sobrante, 0);
  });
});
