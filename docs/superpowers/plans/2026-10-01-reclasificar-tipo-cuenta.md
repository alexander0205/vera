# Reclasificar el tipo de una cuenta con movimientos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una empresa pueda corregir el tipo de una cuenta que ya tiene movimientos (por ejemplo Activo → Gastos) desde el catálogo, con reglas que impidan dañar la contabilidad, y que el error de origen no se repita.

**Architecture:** La decisión vive en una función pura nueva, `evaluarCambioTipo` (`lib/contabilidad/cambio-tipo.ts`), probada con vitest. `editarCuenta` junta los hechos con consultas (cuántos movimientos, si hay movimientos en un ejercicio cerrado, si la cuenta es de un método de cobro) y aplica la decisión. La API exige una confirmación explícita y escribe la constancia en `audit_logs` dentro de la misma transacción que el cambio. El modal pide esa confirmación y, al crear cuentas, propone el tipo del grupo padre.

**Tech Stack:** Next.js 15 (App Router), TypeScript, drizzle-orm con SQL crudo sobre Postgres (Neon), MUI 9, vitest 4.

---

## Contexto (lo que motivó el cambio)

Verificado en producción el 2026-10-01, solo lectura:

| Empresa | Cuenta | Tipo hoy | Movimientos | Efecto de pasarla a Gastos |
|---|---|---|---|---|
| SOLUCIONES DO SRL | 6301 Impuesto a los activos | activo | 3 asientos manuales del 30-abr-2026, RD$1,500 | Activos −1,500 y utilidad −1,500 |
| SOLUCIONES DO SRL | 6304 Recargos impuestos | activo | los mismos 3 asientos, RD$1,008 | Activos −1,008 y utilidad −1,008 |
| YISRAEL KIDS SCHOOL SRL | 6320 Otros gastos | activo | 2 asientos del 15-sep-2026, +2,844 / −2,844 (saldo 0) | ningún total cambia |

- Ninguna de las tres cuentas está asignada en Configuración contable. Ningún ejercicio de 2026 está cerrado.
- El bloqueo actual está en `lib/contabilidad/cuentas.ts:309`: cualquier cambio de tipo con movimientos lanza 409.
- Causa probable del error de origen: "Nueva cuenta" arranca en tipo Activo y elegir un padre en el modal no cambia el tipo (`app/contabilidad/cuentas/_client.tsx:140` solo hereda el tipo con el botón "+" del grupo).

## Revisión del tech lead (2026-10-01)

Aprobado con tres precisiones, ya incorporadas abajo:

1. **El criterio es la naturaleza, no "etiquetas parecidas".** Con movimientos, el cambio se permite solo si la naturaleza del tipo nuevo (`naturalezaPorTipo`) es igual a la naturaleza actual de la cuenta. Activo → Gasto pasa (deudora → deudora). Activo → Ingreso se bloquea (deudora → acreedora).
2. **Periodos cerrados.** Si la cuenta tiene movimientos dentro de un ejercicio ya cerrado, el bloqueo se mantiene, cualquiera sea el cambio, y hay que reabrir el ejercicio primero. Esos saldos ya se declararon.
3. **Bitácora.** Existe `audit_logs` (`lib/audit.ts`), que ya usa la importación de catálogos (`CONTABILIDAD_CATALOGO_IMPORTADO`). No hace falta tabla nueva. La auditoría por triggers (`row_audit_log`, migración 0029) **no** cubre `contabilidad_cuentas`. Como `logAudit` no espera a la base (fire-and-forget), la constancia de la reclasificación se escribe con `await` en la misma transacción que el UPDATE: si no se puede registrar, el cambio no se aplica.

El modal de confirmación quedó aprobado tal cual.

## Reglas que implementa este plan

Con movimientos, un cambio de tipo se permite solo si se cumplen todas:

1. **Misma naturaleza.** `naturalezaPorTipo(nuevo) === naturaleza actual de la cuenta`, y la naturaleza guardada no puede cambiar en la misma operación. Para cuentas normales equivale a: activo/costo/gasto entre sí, o pasivo/patrimonio/ingreso entre sí. Una cuenta con naturaleza invertida (por ejemplo 1202 Depreciación acumulada, activo acreedora) no puede cambiar de tipo con movimientos.
2. **Sin ejercicio cerrado.** Si la cuenta tiene líneas con fecha ≤ el último `contabilidad_cierres.fecha_cierre`, se bloquea y hay que reabrir el ejercicio. Los cierres son secuenciales y solo se reabre el último (`lib/contabilidad/cierre.ts`), así que basta comparar contra el último.
3. **Métodos de cobro.** Si la cuenta es `cuenta_id` de `contabilidad_config_metodos_pago`, el nuevo tipo tiene que ser `activo`. Si es `cuenta_comision_id`, tiene que ser `gasto`. Son las mismas reglas que `guardarMetodo` (`lib/contabilidad/config.ts:375-385`), y `cuentasDeSalida` ofrece esas cuentas como "de dónde salió el dinero".
4. **Constancia.** Cada reclasificación hecha desde la API queda en `audit_logs` con la acción `CONTABILIDAD_CUENTA_RECLASIFICADA`, escrita en la misma transacción que el cambio. La importación por Excel ya se audita y además listará los códigos con tipo cambiado.
5. **Confirmación.** Sin `confirmarCambioTipo: true`, la API responde 409 con `requiereConfirmacion: true` y un mensaje que explica el efecto. En la importación de Excel, la vista previa cuenta como confirmación.

Decisiones tomadas a propósito:
- Las demás tareas de configuración (inventario, ITBIS, nómina, etc.) no validan tipo hoy al asignarse. Este plan no inventa expectativas nuevas para ellas.
- Cambiar solo la naturaleza de una cuenta con movimientos sigue permitido, como hoy. Está fuera de alcance.
- Desde la API, las consultas de las reglas y el UPDATE corren en una misma transacción. No se bloquea la tabla de cierres: un cierre ocurre una vez al año, después del 31-dic, y se acepta esa carrera teórica.

## Fuera de alcance

- En YISRAEL KIDS SCHOOL, las cuentas de grupo 1101, 1102 y 1103 tienen movimientos propios. Es otra anomalía y va en su propia tarea.
- Corregir los datos de los clientes. Se hace desde la UI después del despliegue (Task 9), sin scripts contra producción.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/contabilidad/cambio-tipo.ts` | Crear | Regla pura: `grupoDeTipo`, `evaluarCambioTipo` |
| `tests/unit/contabilidad-cambio-tipo.test.ts` | Crear | Tabla de verdad de la regla, incluidos los 3 casos reales |
| `lib/contabilidad/cuentas.ts` | Modificar | `contarMovimientos`, consultas de hechos, `CambioTipoSinConfirmarError`, `editarCuenta` aplica la regla y devuelve `reclasificacion` |
| `lib/audit.ts` | Modificar | Nueva acción `CONTABILIDAD_CUENTA_RECLASIFICADA` |
| `app/api/contabilidad/cuentas/[id]/route.ts` | Modificar | Lee `confirmarCambioTipo`, responde `requiereConfirmacion`, audita |
| `lib/contabilidad/cuentas-importar.ts` | Modificar | Pasa la confirmación (la vista previa la sustituye) |
| `app/api/contabilidad/cuentas/importar/route.ts` | Modificar | Agrega `tiposCambiados` a la auditoría |
| `app/contabilidad/cuentas/_client.tsx` | Modificar | Paso de confirmación en el modal; hereda y avisa el tipo del padre |
| `lib/contabilidad/cuentas-excel-libro.ts` | Modificar | Texto de ayuda del Excel |
| `docs/seguimiento-contabilidad.md` | Modificar | Regla documentada |
| `scripts/verificar-cambio-tipo-cuenta.ts` | Crear | Verificación contra una rama de Neon, que se niega a correr en producción |

---

### Task 1: Regla pura `evaluarCambioTipo`

**Files:**
- Create: `lib/contabilidad/cambio-tipo.ts`
- Test: `tests/unit/contabilidad-cambio-tipo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/contabilidad-cambio-tipo.test.ts`:

```ts
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
    expect(r.mensaje).toContain('6301 Impuesto a los activos');
    expect(r.mensaje).toContain('3 movimientos');
    expect(r.mensaje).toContain('del Balance general al Estado de resultados');
    expect(r.mensaje).toContain('meses anteriores');
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
    expect(r.mensaje).toContain('sin cambiar la naturaleza');
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
  });
});

describe('regla 2: ejercicio cerrado', () => {
  it('con movimientos en un ejercicio cerrado se bloquea', () => {
    const r = evaluarCambioTipo(hechos({ movimientosEnEjercicioCerrado: true }));
    expect(r.decision).toBe('bloqueado');
    if (r.decision !== 'bloqueado') return;
    expect(r.mensaje).toContain('ejercicio ya cerrado');
    expect(r.mensaje).toContain('Reabre el ejercicio');
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
});

describe('regla 5: confirmación', () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/contabilidad-cambio-tipo.test.ts`
Expected: FAIL, with an error that `@/lib/contabilidad/cambio-tipo` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `lib/contabilidad/cambio-tipo.ts`:

```ts
/**
 * lib/contabilidad/cambio-tipo.ts — Cuándo se le puede cambiar el tipo a una
 * cuenta que ya tiene movimientos.
 *
 * Los reportes leen el tipo de la cuenta cada vez que se generan; no hay foto
 * histórica. Cambiar el tipo no toca ningún asiento, pero mueve el saldo de la
 * cuenta de un reporte a otro, también en meses anteriores. Por eso antes estaba
 * prohibido sin excepciones, y una empresa que creó una cuenta de gasto como
 * Activo por error (pasó en 2026-10, cuentas 6301/6304/6320) no tenía salida.
 *
 * Ahora se permite cuando no daña nada (reglas revisadas con el tech lead,
 * 2026-10-01):
 *   1. la naturaleza del tipo nuevo es la naturaleza actual de la cuenta, y no
 *      cambia en la misma operación: el saldo nunca se da vuelta;
 *   2. sin movimientos en un ejercicio cerrado: esos saldos ya se declararon,
 *      y hay que reabrir el ejercicio primero;
 *   3. sin romper un método de cobro: su cuenta de entrada es de activo y su
 *      cuenta de comisión es de gasto (las mismas reglas de `guardarMetodo`);
 *   4. con confirmación explícita de quien lo hace.
 *
 * Pura: quien la llama junta los hechos con consultas (ver `editarCuenta`).
 */

import { naturalezaPorTipo, type TipoCuenta, type NaturalezaCuenta } from './catalogo-base';
import { ETIQUETA_TIPO } from './cuentas-excel';

export type GrupoTipo = 'balance' | 'resultado';

/** En qué reporte vive el saldo de una cuenta de este tipo. */
export function grupoDeTipo(tipo: TipoCuenta): GrupoTipo {
  return tipo === 'ingreso' || tipo === 'costo' || tipo === 'gasto' ? 'resultado' : 'balance';
}

const NOMBRE_REPORTE: Record<GrupoTipo, string> = {
  balance: 'Balance general',
  resultado: 'Estado de resultados',
};

/** Un método de cobro que usa la cuenta, con la etiqueta que ve el usuario. */
export interface UsoEnMetodo {
  metodo: string;
  rol: 'entrada' | 'comision';
}

export interface HechosCambioTipo {
  codigo:   string;
  nombre:   string;
  tipoActual: TipoCuenta;
  tipoNuevo:  TipoCuenta;
  naturalezaActual: NaturalezaCuenta;
  /** La naturaleza con la que quedaría la cuenta tras guardar. */
  naturalezaFinal:  NaturalezaCuenta;
  movimientos: number;
  /** Si tiene líneas fechadas dentro de un ejercicio ya cerrado. */
  movimientosEnEjercicioCerrado: boolean;
  usosEnMetodos: UsoEnMetodo[];
  /** Quien lo pide ya vio el aviso y confirmó. */
  confirmado: boolean;
}

export type ResultadoCambioTipo =
  /** No hay cambio de tipo, o la cuenta no tiene movimientos. */
  | { decision: 'libre' }
  | { decision: 'bloqueado'; mensaje: string }
  | { decision: 'requiere-confirmacion'; mensaje: string }
  | { decision: 'permitido' };

export function evaluarCambioTipo(h: HechosCambioTipo): ResultadoCambioTipo {
  if (h.tipoNuevo === h.tipoActual || h.movimientos === 0) return { decision: 'libre' };

  const cuenta = `${h.codigo} ${h.nombre}`;
  const de = ETIQUETA_TIPO[h.tipoActual];
  const a  = ETIQUETA_TIPO[h.tipoNuevo];

  // 1. Con otra naturaleza, el saldo de la cuenta saldría con el signo
  // contrario en todos los reportes. Se compara contra la naturaleza GUARDADA:
  // una cuenta invertida (1202, activo acreedora) tampoco puede pasar a Gastos.
  if (naturalezaPorTipo(h.tipoNuevo) !== h.naturalezaActual) {
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos, y pasarla de ${de} a ${a} daría vuelta a su saldo. ` +
        'Con movimientos solo se puede cambiar a un tipo de la misma naturaleza: ' +
        'Activo, Costos y Gastos entre sí, o Pasivo, Patrimonio e Ingresos entre sí.',
    };
  }
  if (h.naturalezaFinal !== h.naturalezaActual) {
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos: cambia el tipo sin cambiar la naturaleza ` +
        `(se queda ${h.naturalezaActual}).`,
    };
  }

  // 2. Un ejercicio cerrado ya se declaró: sus saldos no se mueven hacia atrás.
  if (h.movimientosEnEjercicioCerrado) {
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos en un ejercicio ya cerrado, y esos saldos ya se ` +
        `declararon. Para pasarla de ${de} a ${a}, reabre el ejercicio en Cierre de ` +
        'ejercicio, cambia el tipo y vuelve a cerrarlo.',
    };
  }

  const grupoActual = grupoDeTipo(h.tipoActual);
  const grupoNuevo  = grupoDeTipo(h.tipoNuevo);
  const cruza = grupoActual !== grupoNuevo;

  // 3. Las mismas reglas que pone la configuración al asignar la cuenta.
  for (const u of h.usosEnMetodos) {
    if (u.rol === 'entrada' && h.tipoNuevo !== 'activo') {
      return {
        decision: 'bloqueado',
        mensaje:
          `"${cuenta}" es la cuenta donde entra el dinero de ${u.metodo}, y esa cuenta tiene ` +
          'que ser de Activo. Cámbiala en Configuración contable antes de cambiarle el tipo.',
      };
    }
    if (u.rol === 'comision' && h.tipoNuevo !== 'gasto') {
      return {
        decision: 'bloqueado',
        mensaje:
          `"${cuenta}" es la cuenta de comisión de ${u.metodo}, y esa cuenta tiene que ser ` +
          'de Gastos. Cámbiala en Configuración contable antes de cambiarle el tipo.',
      };
    }
  }

  // 4. Nada lo impide, pero mueve cifras ya reportadas: que se vea antes.
  if (!h.confirmado) {
    const n = h.movimientos === 1 ? '1 movimiento' : `${h.movimientos} movimientos`;
    const efecto = cruza
      ? `Su saldo pasa del ${NOMBRE_REPORTE[grupoActual]} al ${NOMBRE_REPORTE[grupoNuevo]}`
      : `Su saldo cambia de sección dentro del ${NOMBRE_REPORTE[grupoActual]}`;
    return {
      decision: 'requiere-confirmacion',
      mensaje:
        `"${cuenta}" tiene ${n}. Pasarla de ${de} a ${a} no cambia ningún asiento. ` +
        `${efecto}, también en los reportes de meses anteriores.`,
    };
  }

  return { decision: 'permitido' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/contabilidad-cambio-tipo.test.ts`
Expected: PASS, todas las pruebas en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/contabilidad/cambio-tipo.ts tests/unit/contabilidad-cambio-tipo.test.ts
git commit -m "feat(contabilidad): regla para cambiar el tipo de una cuenta con movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `editarCuenta` aplica la regla

**Files:**
- Modify: `lib/contabilidad/cuentas.ts` (header 1-13, imports 15-21, después de `CuentaError` 55-61, `tieneMovimientos` 134-156, `EditarCuentaInput`/`editarCuenta` 271-395)

No hay prueba unitaria aquí: son consultas a la base. Las cubre el script de la Task 7.

- [ ] **Step 1: Update the header comment**

In `lib/contabilidad/cuentas.ts`, replace lines 8-12:

```ts
 * Sobre "tiene movimientos": desde el Paso 4 la tabla de asientos existe, así
 * que `tieneMovimientos` protege de verdad — una cuenta con apuntes ya no se
 * puede borrar, ni cambiarle el código o el tipo. La comprobación con
 * `to_regclass` se conserva por si el módulo corre contra una base donde la
 * migración 0085 todavía no se aplicó.
```

with:

```ts
 * Sobre "tiene movimientos": desde el Paso 4 la tabla de asientos existe, así
 * que `contarMovimientos` protege de verdad — una cuenta con apuntes ya no se
 * puede borrar ni cambiarle el código, y su tipo solo cambia bajo las reglas de
 * `./cambio-tipo`. La comprobación con `to_regclass` se conserva por si el
 * módulo corre contra una base donde la migración 0085 todavía no se aplicó.
```

- [ ] **Step 2: Add imports**

Replace lines 17-21:

```ts
import {
  naturalezaPorTipo,
  type TipoCuenta,
  type NaturalezaCuenta,
} from './catalogo-base';
```

with:

```ts
import {
  naturalezaPorTipo,
  type TipoCuenta,
  type NaturalezaCuenta,
} from './catalogo-base';
import { evaluarCambioTipo, type UsoEnMetodo } from './cambio-tipo';
import { CLAVE_METODO_LABEL, type ClaveMetodo } from './metodos';
```

- [ ] **Step 3: Add the confirmation error class**

Right after the `CuentaError` class (ends at line 61), add:

```ts

/**
 * El cambio de tipo es posible, pero mueve cifras ya reportadas y nadie lo
 * confirmó todavía. La API lo traduce a 409 con `requiereConfirmacion`, para que
 * el formulario muestre el aviso y vuelva a mandar con `confirmarCambioTipo`.
 */
export class CambioTipoSinConfirmarError extends CuentaError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'CambioTipoSinConfirmarError';
  }
}
```

- [ ] **Step 4: Replace `tieneMovimientos` with a counter plus wrapper, and add the two fact queries**

Replace the whole block from the doc comment `/**\n * ¿La cuenta tiene asientos contables?` through the end of `tieneMovimientos` (lines 134-156) with:

```ts
/**
 * ¿Cuántas líneas de asiento tiene la cuenta?
 *
 * La tabla `contabilidad_asiento_lineas` llega en el Paso 4. Hasta entonces
 * esta función devuelve 0 — pero la consulta ya está escrita, así que en
 * cuanto la tabla exista empieza a proteger sin tocar este archivo.
 *
 * El `to_regclass` es la forma barata de preguntarle a Postgres si una tabla
 * existe sin que la consulta reviente con `42P01`.
 */
export async function contarMovimientos(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<number> {
  const [{ existe }] = await ex.execute<{ existe: boolean }>(sql`
    SELECT to_regclass('public.contabilidad_asiento_lineas') IS NOT NULL AS existe
  `);
  if (!existe) return 0;

  const [{ total }] = await ex.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM contabilidad_asiento_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId}
  `);
  return total;
}

/** ¿La cuenta tiene asientos contables? */
export async function tieneMovimientos(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<boolean> {
  return (await contarMovimientos(teamId, cuentaId, ex)) > 0;
}

/**
 * ¿La cuenta tiene líneas fechadas dentro de un ejercicio ya cerrado?
 *
 * Los ejercicios se cierran en orden y solo se reabre el último (ver
 * `./cierre`), así que todo lo fechado hasta el último cierre está cerrado.
 * Sin cierres, `max()` es NULL y la comparación nunca es verdadera.
 */
async function movimientosEnEjercicioCerrado(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<boolean> {
  const [{ hay }] = await ex.execute<{ hay: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
        AND a.fecha <= (SELECT max(fecha_cierre) FROM contabilidad_cierres WHERE team_id = ${teamId})
    ) AS hay
  `);
  return hay === true;
}

/** Los métodos de cobro que usan la cuenta, como entrada o como comisión. */
async function usosEnMetodos(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<UsoEnMetodo[]> {
  const rows = await ex.execute(sql`
    SELECT clave,
           cuenta_id = ${cuentaId}          AS entrada,
           cuenta_comision_id = ${cuentaId} AS comision
    FROM contabilidad_config_metodos_pago
    WHERE team_id = ${teamId}
      AND (cuenta_id = ${cuentaId} OR cuenta_comision_id = ${cuentaId})
    ORDER BY clave
  `) as unknown as { clave: ClaveMetodo; entrada: boolean; comision: boolean | null }[];

  const usos: UsoEnMetodo[] = [];
  for (const r of rows) {
    const metodo = CLAVE_METODO_LABEL[r.clave] ?? r.clave;
    if (r.entrada) usos.push({ metodo, rol: 'entrada' });
    if (r.comision) usos.push({ metodo, rol: 'comision' });
  }
  return usos;
}
```

- [ ] **Step 5: Add `CuentaEditada` and the options parameter to `editarCuenta`**

Replace:

```ts
export async function editarCuenta(
  teamId: number,
  id: number,
  input: EditarCuentaInput,
  userId: number,
  ex: Ejecutor = db,
): Promise<Cuenta> {
```

with:

```ts
export interface CuentaEditada extends Cuenta {
  /** Presente cuando se cambió el tipo de una cuenta con movimientos. */
  reclasificacion?: { de: TipoCuenta; a: TipoCuenta; movimientos: number };
}

export async function editarCuenta(
  teamId: number,
  id: number,
  input: EditarCuentaInput,
  userId: number,
  ex: Ejecutor = db,
  opciones: { confirmarCambioTipo?: boolean } = {},
): Promise<CuentaEditada> {
```

- [ ] **Step 6: Replace the movement count and the type guard**

Replace:

```ts
  const conMovimientos = await tieneMovimientos(teamId, id, ex);
```

with:

```ts
  const movimientos = await contarMovimientos(teamId, id, ex);
  const conMovimientos = movimientos > 0;
```

Then replace the whole type guard block:

```ts
  // Cambiar la clase con movimientos encima movería asientos ya emitidos de una
  // sección del balance a otra, y los reportes de periodos cerrados dejarían de
  // cuadrar contra lo que se declaró.
  if (input.tipo !== undefined && input.tipo !== actual.tipo && conMovimientos) {
    throw new CuentaError(
      `La cuenta ${actual.codigo} ya tiene movimientos contables, así que su tipo no se puede cambiar.`,
      409,
    );
  }
```

with:

```ts
  // Cambiar la clase con movimientos mueve el saldo de la cuenta entre reportes,
  // también hacia atrás. Se permite cuando no daña nada y alguien lo confirmó:
  // las reglas y el porqué están en `./cambio-tipo`.
  const reclasifica = input.tipo !== undefined && input.tipo !== actual.tipo && conMovimientos;
  if (reclasifica) {
    const decision = evaluarCambioTipo({
      codigo: actual.codigo,
      nombre: actual.nombre,
      tipoActual: actual.tipo,
      tipoNuevo: input.tipo!,
      naturalezaActual: actual.naturaleza,
      naturalezaFinal: input.naturaleza ?? actual.naturaleza,
      movimientos,
      movimientosEnEjercicioCerrado: await movimientosEnEjercicioCerrado(teamId, id, ex),
      usosEnMetodos: await usosEnMetodos(teamId, id, ex),
      confirmado: opciones.confirmarCambioTipo === true,
    });
    if (decision.decision === 'bloqueado') throw new CuentaError(decision.mensaje, 409);
    if (decision.decision === 'requiere-confirmacion') throw new CambioTipoSinConfirmarError(decision.mensaje);
  }
```

- [ ] **Step 7: Return the reclassification info**

At the end of `editarCuenta`, replace:

```ts
  return (rows as unknown as Cuenta[])[0];
}
```

(the one right after the `.catch(...)` of the UPDATE, around line 394) with:

```ts
  const editada = (rows as unknown as Cuenta[])[0];
  return reclasifica
    ? { ...editada, reclasificacion: { de: actual.tipo, a: input.tipo!, movimientos } }
    : editada;
}
```

Also check the early return `if (sets.length === 0) return actual;` above it: it stays as is, because `reclasifica` implies `input.tipo !== undefined`, so `sets` is never empty in that case.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/contabilidad/cuentas.ts`, `lib/contabilidad/cuentas-importar.ts`, `app/api/contabilidad/cuentas/[id]/route.ts`. `cuentas-importar.ts` still compiles because `CuentaEditada` extends `Cuenta` and the new parameter is optional.

- [ ] **Step 9: Run the unit suite**

Run: `npx vitest run tests/unit`
Expected: PASS (same count as before plus the new file).

- [ ] **Step 10: Commit**

```bash
git add lib/contabilidad/cuentas.ts
git commit -m "feat(contabilidad): permitir cambiar el tipo de una cuenta con movimientos bajo reglas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API — confirmación y auditoría

**Files:**
- Modify: `lib/audit.ts:73-75`
- Modify: `app/api/contabilidad/cuentas/[id]/route.ts`

- [ ] **Step 1: Add the audit action**

In `lib/audit.ts`, replace:

```ts
  // Contabilidad: un catálogo importado de Excel cambia de golpe cómo se
  // clasifica todo lo que viene después. Se traza quién y cuánto.
  | 'CONTABILIDAD_CATALOGO_IMPORTADO';
```

with:

```ts
  // Contabilidad: un catálogo importado de Excel cambia de golpe cómo se
  // clasifica todo lo que viene después. Se traza quién y cuánto.
  | 'CONTABILIDAD_CATALOGO_IMPORTADO'
  // Cambiar el tipo de una cuenta con movimientos mueve su saldo entre
  // reportes, también hacia atrás. Se traza quién, cuál y de qué a qué.
  | 'CONTABILIDAD_CUENTA_RECLASIFICADA';
```

- [ ] **Step 2: Update the route header and imports**

In `app/api/contabilidad/cuentas/[id]/route.ts`, replace lines 1-16:

```ts
/**
 * PATCH  /api/contabilidad/cuentas/[id]  — editar o activar/desactivar
 * DELETE /api/contabilidad/cuentas/[id]  — borrar (solo sin hijas ni movimientos)
 *
 * Las reglas (código inmutable con movimientos, no borrar con historia, ciclos
 * en la jerarquía) viven en `lib/contabilidad/cuentas.ts` y lanzan `CuentaError`
 * con su propio status. Aquí solo se traducen a HTTP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { editarCuenta, borrarCuenta, CuentaError } from '@/lib/contabilidad/cuentas';
```

with:

```ts
/**
 * PATCH  /api/contabilidad/cuentas/[id]  — editar o activar/desactivar
 * DELETE /api/contabilidad/cuentas/[id]  — borrar (solo sin hijas ni movimientos)
 *
 * Las reglas (código inmutable con movimientos, no borrar con historia, ciclos
 * en la jerarquía, cuándo se puede cambiar el tipo) viven en
 * `lib/contabilidad/cuentas.ts` y lanzan `CuentaError` con su propio status.
 * Aquí solo se traducen a HTTP.
 *
 * Cambiar el tipo de una cuenta con movimientos pide confirmación: la primera
 * vez responde 409 con `requiereConfirmacion: true` y el aviso en `error`; el
 * formulario lo muestra y vuelve a mandar con `confirmarCambioTipo: true`.
 * Cuando se aplica, la constancia en `audit_logs` se escribe en la MISMA
 * transacción: sin constancia no hay cambio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers, auditLogs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import {
  editarCuenta, borrarCuenta, CuentaError, CambioTipoSinConfirmarError,
} from '@/lib/contabilidad/cuentas';
import { getIp } from '@/lib/audit';
```

- [ ] **Step 3: Pass the confirmation, answer `requiereConfirmacion`, and audit inside the transaction**

`logAudit` (`lib/audit.ts`) no espera a la base y traga los errores: sirve para trazas, no para una bitácora que tiene que existir. Aquí se inserta en `audit_logs` con `await` y con el mismo `tx` que usa `editarCuenta`, así que si la constancia falla, el UPDATE se deshace. Un `CuentaError` lanzado dentro también deshace todo y se traduce a HTTP afuera.

Replace the `try { ... } catch (e) { ... }` block of `PATCH` (lines 59-79):

```ts
  try {
    const cuenta = await editarCuenta(teamId, id, {
      codigo:     typeof b.codigo === 'string' ? b.codigo : undefined,
      nombre:     typeof b.nombre === 'string' ? b.nombre : undefined,
      tipo:       typeof b.tipo === 'string' ? b.tipo as never : undefined,
      naturaleza: typeof b.naturaleza === 'string' ? b.naturaleza as never : undefined,
      // null es un valor válido: desengancha la cuenta de su padre.
      cuentaPadreId: b.cuentaPadreId === null
        ? null
        : typeof b.cuentaPadreId === 'number' ? b.cuentaPadreId : undefined,
      imputable:  typeof b.imputable === 'boolean' ? b.imputable : undefined,
      activa:     typeof b.activa === 'boolean' ? b.activa : undefined,
    }, user.id);

    return NextResponse.json({ cuenta });
  } catch (e) {
    if (e instanceof CuentaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
```

with:

```ts
  try {
    const cuenta = await db.transaction(async (tx) => {
      const editada = await editarCuenta(teamId, id, {
        codigo:     typeof b.codigo === 'string' ? b.codigo : undefined,
        nombre:     typeof b.nombre === 'string' ? b.nombre : undefined,
        tipo:       typeof b.tipo === 'string' ? b.tipo as never : undefined,
        naturaleza: typeof b.naturaleza === 'string' ? b.naturaleza as never : undefined,
        // null es un valor válido: desengancha la cuenta de su padre.
        cuentaPadreId: b.cuentaPadreId === null
          ? null
          : typeof b.cuentaPadreId === 'number' ? b.cuentaPadreId : undefined,
        imputable:  typeof b.imputable === 'boolean' ? b.imputable : undefined,
        activa:     typeof b.activa === 'boolean' ? b.activa : undefined,
      }, user.id, tx, { confirmarCambioTipo: b.confirmarCambioTipo === true });

      // La bitácora del cambio de tipo va en la misma transacción que el
      // cambio: si no se puede registrar quién y cuándo, no se aplica.
      if (editada.reclasificacion) {
        await tx.insert(auditLogs).values({
          teamId,
          userId:    user.id,
          actor:     user.email,
          action:    'CONTABILIDAD_CUENTA_RECLASIFICADA',
          resource:  editada.codigo,
          ipAddress: getIp(req),
          metadata:  JSON.stringify({
            cuentaId: editada.id, nombre: editada.nombre, ...editada.reclasificacion,
          }),
        });
      }
      return editada;
    });

    return NextResponse.json({ cuenta });
  } catch (e) {
    if (e instanceof CambioTipoSinConfirmarError) {
      return NextResponse.json(
        { error: e.message, requiereConfirmacion: true },
        { status: e.status },
      );
    }
    if (e instanceof CuentaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `editarCuenta` takes `Ejecutor = Pick<typeof db, 'execute'>`, and the drizzle `tx` satisfies it (the Excel import already passes `tx`). If `user.email` is reported as possibly null, check `users` in `lib/db/schema.ts`; `audit_logs.actor` is `NOT NULL`, so in that case use `user.email ?? \`user:${user.id}\``.

- [ ] **Step 5: Commit**

```bash
git add lib/audit.ts "app/api/contabilidad/cuentas/[id]/route.ts"
git commit -m "feat(contabilidad): confirmar y auditar el cambio de tipo de una cuenta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Importación por Excel

**Files:**
- Modify: `lib/contabilidad/cuentas-importar.ts:113-130`
- Modify: `app/api/contabilidad/cuentas/importar/route.ts:84-89`

- [ ] **Step 1: Update the comment and pass the confirmation**

In `lib/contabilidad/cuentas-importar.ts`, replace:

```ts
            // Solo lo que cambia. Mandar un campo igual a `editarCuenta` podría
            // disparar una regla por nada —cambiar el tipo de una cuenta con
            // movimientos está prohibido aunque sea «al mismo tipo»—.
```

with:

```ts
            // Solo lo que cambia. Mandar un campo igual a `editarCuenta` podría
            // disparar una regla por nada, y la vista previa diría que cambió
            // algo que no cambió.
```

and replace:

```ts
            const editada = await editarCuenta(teamId, actual.id, cambios, userId, sp);
```

with:

```ts
            // La vista previa es la confirmación: quien aplica ya vio la lista
            // de cuentas cuyo tipo cambia. Las demás reglas del cambio de tipo
            // aplican igual que en el formulario.
            const editada = await editarCuenta(
              teamId, actual.id, cambios, userId, sp, { confirmarCambioTipo: true },
            );
```

- [ ] **Step 2: List reclassified codes in the import audit**

In `app/api/contabilidad/cuentas/importar/route.ts`, replace:

```ts
      meta: {
        archivo: archivo.name,
        creadas: resultado.creadas.length,
        actualizadas: resultado.actualizadas.length,
        sinCambios: resultado.sinCambios,
      },
```

with:

```ts
      meta: {
        archivo: archivo.name,
        creadas: resultado.creadas.length,
        actualizadas: resultado.actualizadas.length,
        sinCambios: resultado.sinCambios,
        tiposCambiados: resultado.actualizadas
          .filter((a) => a.cambios.includes('tipo'))
          .map((a) => a.codigo),
      },
```

- [ ] **Step 3: Typecheck and unit suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run tests/unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/contabilidad/cuentas-importar.ts app/api/contabilidad/cuentas/importar/route.ts
git commit -m "feat(contabilidad): la importación de Excel aplica las reglas del cambio de tipo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Modal — paso de confirmación

**Files:**
- Modify: `app/contabilidad/cuentas/_client.tsx` (imports línea 3, `CuentaDialog` 477-644)

- [ ] **Step 1: Import `useEffect`**

Replace line 3:

```ts
import { useState, useMemo, useTransition, useCallback, memo } from 'react';
```

with:

```ts
import { useState, useMemo, useEffect, useTransition, useCallback, memo } from 'react';
```

- [ ] **Step 2: Add confirmation state**

In `CuentaDialog`, after:

```ts
  const [error, setError]         = useState<string | null>(null);
```

add:

```ts
  /**
   * El aviso del servidor cuando el cambio de tipo mueve cifras ya reportadas.
   * Mientras está, el botón principal confirma. Cualquier cambio en el
   * formulario lo descarta: lo confirmado tiene que ser lo que se guarda.
   */
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  useEffect(() => { setConfirmacion(null); }, [form]);
```

- [ ] **Step 3: Send the confirmation and handle `requiereConfirmacion`**

Replace the whole `guardar` function:

```ts
  async function guardar() {
    setGuardando(true);
    setError(null);

    const esEdicion = form.id !== undefined;
    const res = await fetch(
      esEdicion ? `/api/contabilidad/cuentas/${form.id}` : '/api/contabilidad/cuentas',
      {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: form.codigo,
          nombre: form.nombre,
          tipo: form.tipo,
          naturaleza: form.naturaleza,
          cuentaPadreId: form.cuentaPadreId,
          imputable: form.imputable,
        }),
      },
    );

    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo guardar la cuenta.');
      return;
    }
    onGuardada();
  }
```

with:

```ts
  async function guardar(confirmarCambioTipo = false) {
    setGuardando(true);
    setError(null);

    const esEdicion = form.id !== undefined;
    const res = await fetch(
      esEdicion ? `/api/contabilidad/cuentas/${form.id}` : '/api/contabilidad/cuentas',
      {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: form.codigo,
          nombre: form.nombre,
          tipo: form.tipo,
          naturaleza: form.naturaleza,
          cuentaPadreId: form.cuentaPadreId,
          imputable: form.imputable,
          confirmarCambioTipo,
        }),
      },
    );

    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.requiereConfirmacion) {
        setConfirmacion(body.error);
        return;
      }
      setError(body.error ?? 'No se pudo guardar la cuenta.');
      return;
    }
    onGuardada();
  }
```

- [ ] **Step 4: Show the warning**

Replace:

```tsx
          {error && <Alert severity="error">{error}</Alert>}
```

with:

```tsx
          {error && <Alert severity="error">{error}</Alert>}
          {confirmacion && (
            <Alert severity="warning">
              {confirmacion} ¿Confirmas el cambio?
            </Alert>
          )}
```

- [ ] **Step 5: Switch the main button while confirming**

Replace:

```tsx
        <Button variant="contained" onClick={guardar} disabled={guardando || ocupado}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
```

with:

```tsx
        {confirmacion ? (
          <Button
            variant="contained" color="warning"
            onClick={() => guardar(true)} disabled={guardando || ocupado}
          >
            {guardando ? 'Guardando…' : 'Sí, cambiar el tipo'}
          </Button>
        ) : (
          <Button variant="contained" onClick={() => guardar()} disabled={guardando || ocupado}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        )}
```

(`onClick={guardar}` cannot stay: MUI would pass the click event as `confirmarCambioTipo`.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/contabilidad/cuentas/_client.tsx
git commit -m "feat(contabilidad): el catálogo pide confirmar el cambio de tipo con movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Modal — prevenir el error de origen

**Files:**
- Modify: `app/contabilidad/cuentas/_client.tsx` (helpers ~48-51, `padresPosibles` 110-122, props de `CuentaDialog` 477-485, campo "Cuenta padre" 590-605)

- [ ] **Step 1: Add a label helper**

After the `naturalezaPorTipo` function (line 51), add:

```ts

/** Etiqueta del tipo para mostrar: "gasto" → "Gastos". */
function etiquetaTipo(tipo: string) {
  return TIPOS.find((t) => t.valor === tipo)?.label ?? tipo;
}
```

- [ ] **Step 2: Carry the parent's type in `padresPosibles`**

Replace:

```ts
    const out: { id: number; codigo: string; nombre: string }[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!n.imputable && n.id !== dialogo?.id) {
          out.push({ id: n.id, codigo: n.codigo, nombre: n.nombre });
        }
```

with:

```ts
    const out: PadrePosible[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!n.imputable && n.id !== dialogo?.id) {
          out.push({ id: n.id, codigo: n.codigo, nombre: n.nombre, tipo: n.tipo });
        }
```

and, right after the `FORM_VACIO` constant (line 66), add:

```ts

/** Una cuenta de agrupación que puede ser padre, con su tipo para heredarlo. */
interface PadrePosible { id: number; codigo: string; nombre: string; tipo: string }
```

- [ ] **Step 3: Update the dialog prop type**

In the `CuentaDialog` props, replace:

```ts
  padresPosibles: { id: number; codigo: string; nombre: string }[];
```

with:

```ts
  padresPosibles: PadrePosible[];
```

- [ ] **Step 4: Inherit the type when picking a parent, and warn on mismatch**

Replace the "Cuenta padre" block:

```tsx
          <Box>
            <TextField
              label="Cuenta padre" select fullWidth
              value={form.cuentaPadreId ?? ''}
              onChange={(e) => setForm((f) => ({
                ...f,
                cuentaPadreId: e.target.value ? Number(e.target.value) : null,
              }))}
            >
              {opcionesPadre}
            </TextField>
            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#6b7280' }}>
              Solo aparecen las cuentas que agrupan. Una cuenta que acepta
              movimientos no puede tener hijas.
            </Typography>
          </Box>
```

with:

```tsx
          <Box>
            <TextField
              label="Cuenta padre" select fullWidth
              value={form.cuentaPadreId ?? ''}
              onChange={(e) => {
                const cuentaPadreId = e.target.value ? Number(e.target.value) : null;
                const padre = padresPosibles.find((p) => p.id === cuentaPadreId);
                setForm((f) => ({
                  ...f,
                  cuentaPadreId,
                  // Una cuenta NUEVA hereda el tipo de su grupo: así nació el
                  // error de las 63xx creadas como Activo bajo "Gastos". Al
                  // editar no se toca: cambiar el tipo es una decisión aparte.
                  ...(f.id === undefined && padre
                    ? { tipo: padre.tipo, naturaleza: naturalezaPorTipo(padre.tipo) }
                    : {}),
                }));
              }}
            >
              {opcionesPadre}
            </TextField>
            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#6b7280' }}>
              Solo aparecen las cuentas que agrupan. Una cuenta que acepta
              movimientos no puede tener hijas.
            </Typography>
            {padreElegido && padreElegido.tipo !== form.tipo && (
              <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#d97706' }}>
                Su grupo, {padreElegido.codigo} {padreElegido.nombre}, es de tipo{' '}
                {etiquetaTipo(padreElegido.tipo)}. Revisa que esta cuenta de verdad
                sea {etiquetaTipo(form.tipo)}.
              </Typography>
            )}
          </Box>
```

and, right after the `opcionesPadre` `useMemo` inside `CuentaDialog`, add:

```ts
  const padreElegido = padresPosibles.find((p) => p.id === form.cuentaPadreId);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/contabilidad/cuentas/_client.tsx
git commit -m "feat(contabilidad): una cuenta nueva hereda el tipo de su grupo y avisa si difiere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Script de verificación contra una rama de Neon

**Files:**
- Create: `scripts/verificar-cambio-tipo-cuenta.ts`

`.env` apunta a producción y los scripts lo cargan. Este script escribe datos, así que se niega a correr si `POSTGRES_URL` falta o apunta al host de producción (`ep-raspy-mud-annawbag`, el mismo que vigila `tests/setup-sin-produccion.ts`). Todo lo que crea es sintético (códigos `ZZVER…`) y lo borra al terminar.

- [ ] **Step 1: Write the script**

Create `scripts/verificar-cambio-tipo-cuenta.ts`:

```ts
/**
 * Verificación del cambio de tipo con movimientos, contra una RAMA de Neon.
 *
 *   POSTGRES_URL="postgresql://…rama…" TEAM_ID=9 USER_ID=4 \
 *     npx tsx scripts/verificar-cambio-tipo-cuenta.ts
 *
 * Siembra cuentas y asientos sintéticos (códigos ZZVER…), prueba las reglas de
 * `lib/contabilidad/cambio-tipo.ts` a través de `editarCuenta` y mide el efecto
 * en el Balance general. Deja el team exactamente como estaba.
 */
import 'dotenv/config';

const HOST_PRODUCCION = 'ep-raspy-mud-annawbag';
const url = process.env.POSTGRES_URL ?? '';
const TEAM = Number(process.env.TEAM_ID);
const USER = Number(process.env.USER_ID);

if (!url || url.includes(HOST_PRODUCCION)) {
  console.error('Este script escribe datos. Córrelo solo contra una rama de Neon:');
  console.error('  POSTGRES_URL="postgresql://…rama…" TEAM_ID=… USER_ID=… npx tsx scripts/verificar-cambio-tipo-cuenta.ts');
  process.exit(1);
}
if (!Number.isInteger(TEAM) || !Number.isInteger(USER)) {
  console.error('Faltan TEAM_ID y USER_ID (enteros).');
  process.exit(1);
}

type Linea = { cuentaId: number; debe: number; haber: number };

(async () => {
  // Importes dinámicos: nada toca la base antes de pasar la guarda de arriba.
  const { db } = await import('@/lib/db/drizzle');
  const { sql } = await import('drizzle-orm');
  const { crearCuenta, editarCuenta, CuentaError, CambioTipoSinConfirmarError } = await import('@/lib/contabilidad/cuentas');
  const { balanceGeneral } = await import('@/lib/contabilidad/balance-general');
  const { guardarMetodo, borrarMetodo, getMetodosConfigurados } = await import('@/lib/contabilidad/config');
  const { cerrarEjercicio, reabrirEjercicio, listarCierres, aniosConActividad } = await import('@/lib/contabilidad/cierre');

  let fallos = 0;
  const ok = (cond: boolean, texto: string) => {
    console.log(`${cond ? '  OK ' : '  MAL'}  ${texto}`);
    if (!cond) fallos++;
  };
  const errorDe = async (fn: () => Promise<unknown>): Promise<Error | null> => {
    try { await fn(); return null; } catch (e) { return e as Error; }
  };

  const cuentasCreadas: number[] = [];
  const asientosCreados: number[] = [];
  let oid = 990500;

  async function cuenta(codigo: string, tipo: 'activo' | 'gasto'): Promise<number> {
    const c = await crearCuenta(TEAM, { codigo, nombre: `Verificación ${codigo}`, tipo }, USER);
    cuentasCreadas.push(c.id);
    return c.id;
  }

  async function asiento(fecha: string, lineas: Linea[]): Promise<void> {
    const total = lineas.reduce((s, l) => s + l.debe, 0);
    const a = await db.execute(sql`
      INSERT INTO contabilidad_asientos (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
      VALUES (${TEAM}, ${fecha}, 'Verificación cambio de tipo', 'manual', ${oid++}, ${total}, ${USER})
      RETURNING id`);
    const id = (a as unknown as { id: number }[])[0].id;
    asientosCreados.push(id);
    let orden = 0;
    for (const l of lineas) {
      await db.execute(sql`
        INSERT INTO contabilidad_asiento_lineas (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
        VALUES (${id}, ${TEAM}, ${l.cuentaId}, ${l.debe}, ${l.haber}, 'verificación', ${orden++})`);
    }
  }

  try {
    const anio = new Date().getFullYear();

    // ── Caso SOLUCIONES: gasto creado como Activo, con un pago ───────────────
    console.log('\n1. Activo → Gastos con movimientos (caso 6301)');
    const imp = await cuenta('ZZVER6301', 'activo');
    const banco = await cuenta('ZZVERBANCO', 'activo');
    await asiento(`${anio}-04-30`, [
      { cuentaId: imp, debe: 150000, haber: 0 },
      { cuentaId: banco, debe: 0, haber: 150000 },
    ]);

    const antes = await balanceGeneral(TEAM);

    const e1 = await errorDe(() => editarCuenta(TEAM, imp, { tipo: 'ingreso', naturaleza: 'acreedora' }, USER));
    ok(e1 instanceof CuentaError && e1.message.includes('daría vuelta'), 'Activo → Ingresos se bloquea');

    const e2 = await errorDe(() => editarCuenta(TEAM, imp, { tipo: 'gasto', naturaleza: 'deudora' }, USER));
    ok(e2 instanceof CambioTipoSinConfirmarError, 'sin confirmar pide confirmación');

    const editada = await editarCuenta(TEAM, imp, { tipo: 'gasto', naturaleza: 'deudora' }, USER, db, { confirmarCambioTipo: true });
    ok(editada.tipo === 'gasto' && editada.reclasificacion?.movimientos === 1, 'confirmado se aplica y devuelve la reclasificación');

    const despues = await balanceGeneral(TEAM);
    ok(antes.totalActivoCents - despues.totalActivoCents === 150000, 'Activos bajan RD$1,500.00');
    ok(antes.resultadoEjercicioCents - despues.resultadoEjercicioCents === 150000, 'el resultado del ejercicio baja RD$1,500.00');
    ok(despues.cuadra, 'el Balance general sigue cuadrando');

    // ── Método de cobro ───────────────────────────────────────────────────────
    console.log('\n2. Cuenta de entrada de un método de cobro');
    const metodos = await getMetodosConfigurados(TEAM);
    if (metodos.some((m) => m.clave === 'otro')) {
      console.log('  --   el team ya tiene configurado "Otro"; se salta para no tocar su configuración');
    } else {
      const caja = await cuenta('ZZVERCAJA', 'activo');
      await asiento(`${anio}-05-02`, [
        { cuentaId: caja, debe: 1000, haber: 0 },
        { cuentaId: banco, debe: 0, haber: 1000 },
      ]);
      await guardarMetodo(TEAM, 'otro', caja, null, USER);
      try {
        const e3 = await errorDe(() => editarCuenta(TEAM, caja, { tipo: 'gasto' }, USER, db, { confirmarCambioTipo: true }));
        ok(e3 instanceof CuentaError && e3.message.includes('entra el dinero'), 'se bloquea aunque venga confirmado');
      } finally {
        await borrarMetodo(TEAM, 'otro');
      }
    }

    // ── Ejercicio cerrado ─────────────────────────────────────────────────────
    console.log('\n3. Movimientos en un ejercicio cerrado');
    if ((await listarCierres(TEAM)).length > 0) {
      console.log('  --   el team ya tiene cierres; se salta para no reabrir uno real');
    } else {
      const anios = await aniosConActividad(TEAM);
      const viejo = (anios.length ? Math.min(...anios) : anio) - 1;
      const cer = await cuenta('ZZVERCERR', 'activo');
      const gto = await cuenta('ZZVERGASTO', 'gasto');
      await asiento(`${viejo}-06-15`, [
        { cuentaId: cer, debe: 10000, haber: 0 },
        { cuentaId: gto, debe: 5000, haber: 0 },
        { cuentaId: banco, debe: 0, haber: 15000 },
      ]);
      await cerrarEjercicio(TEAM, viejo, USER);
      try {
        const e4 = await errorDe(() => editarCuenta(TEAM, cer, { tipo: 'gasto' }, USER, db, { confirmarCambioTipo: true }));
        ok(e4 instanceof CuentaError && e4.message.includes('ejercicio ya cerrado'), 'con movimientos en un ejercicio cerrado se bloquea');
      } finally {
        await reabrirEjercicio(TEAM, viejo);
      }
    }
  } finally {
    // ── Limpieza ─────────────────────────────────────────────────────────────
    for (const id of asientosCreados) {
      await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id = ${id}`);
      await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id = ${id}`);
    }
    for (const id of cuentasCreadas) {
      await db.execute(sql`DELETE FROM contabilidad_cuentas WHERE team_id = ${TEAM} AND id = ${id}`);
    }
    console.log(`\nLimpieza: ${asientosCreados.length} asiento(s) y ${cuentasCreadas.length} cuenta(s) sintéticas borradas.`);
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  }

  console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} verificación(es) fallaron.`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Check the guard refuses production**

Run (without setting `POSTGRES_URL`, so `.env` loads):
`npx tsx scripts/verificar-cambio-tipo-cuenta.ts`
Expected: exits with code 1 and prints "Este script escribe datos. Córrelo solo contra una rama de Neon", without touching the database.

- [ ] **Step 3: Run it against a Neon branch**

Needs a Neon branch URL and a team/user from that branch (the person running the plan provides them; never the production URL).

Run: `POSTGRES_URL="<rama>" TEAM_ID=<team> USER_ID=<usuario> npx tsx scripts/verificar-cambio-tipo-cuenta.ts`
Expected: every line `OK`, then "Todo bien." and exit code 0. Sections 2 or 3 may print `--` (skipped) if that team already has "Otro" configured or existing cierres; in that case, rerun with a team that has neither, so both run at least once.

- [ ] **Step 4: Commit**

```bash
git add scripts/verificar-cambio-tipo-cuenta.ts
git commit -m "test(contabilidad): script de verificación del cambio de tipo contra una rama" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Textos y documentación

**Files:**
- Modify: `lib/contabilidad/cuentas-excel-libro.ts:90`
- Modify: `docs/seguimiento-contabilidad.md:411` y nota de decisión

- [ ] **Step 1: Excel help text**

In `lib/contabilidad/cuentas-excel-libro.ts`, replace:

```ts
    '• Una cuenta con movimientos contables no puede cambiar de tipo, ni dejar de aceptar movimientos.',
```

with:

```ts
    '• Una cuenta con movimientos no puede dejar de aceptar movimientos. Su tipo solo puede cambiar a otro de la misma naturaleza (Activo, Costos y Gastos entre sí; Pasivo, Patrimonio e Ingresos entre sí), y no si tiene movimientos en un ejercicio cerrado o es la cuenta de un método de cobro.',
```

- [ ] **Step 2: Tracking doc**

In `docs/seguimiento-contabilidad.md`, replace:

```md
| 4 | Proteger cuentas usadas | Sin borrado con hijas ni movimientos; código y tipo inmutables con movimientos |
```

with:

```md
| 4 | Proteger cuentas usadas | Sin borrado con hijas ni movimientos; código inmutable con movimientos; tipo cambiable solo bajo las reglas de `lib/contabilidad/cambio-tipo.ts` (ver decisión 2026-10-01) |
```

Then, under `### Decisiones de diseño (no reabrir sin motivo)`, add this bullet as the last one of that list:

```md
- **El tipo de una cuenta con movimientos se puede corregir, con reglas
  (2026-10-01).** Antes era inmutable y dos empresas quedaron atascadas con
  cuentas de gasto creadas como Activo (SOLUCIONES 6301/6304, YISRAEL KIDS
  SCHOOL 6320). Los reportes leen el tipo en vivo, así que el cambio reclasifica
  también los meses anteriores; por eso pide confirmación y queda en
  `audit_logs` (`CONTABILIDAD_CUENTA_RECLASIFICADA`), escrito en la misma
  transacción que el cambio. Se bloquea si la naturaleza del tipo nuevo no es
  la de la cuenta (invertiría el saldo), si la cuenta tiene movimientos en un
  ejercicio cerrado (hay que reabrirlo), o si rompe la cuenta de un método de
  cobro. Criterios revisados con el tech lead el 2026-10-01.
```

- [ ] **Step 3: Commit**

```bash
git add lib/contabilidad/cuentas-excel-libro.ts docs/seguimiento-contabilidad.md
git commit -m "docs(contabilidad): reglas del cambio de tipo con movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final, PR y corrección de los clientes

- [ ] **Step 1: Full checks**

Run: `npx vitest run tests/unit`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Manual QA in the browser against the Neon branch**

Start the dev server pointing at the Neon branch (never production), open `/contabilidad/cuentas` with a team of that branch, and check:

1. Edit an Activo account with movements, change it to Gastos and save: the modal shows the yellow warning with the number of movements, and the button reads "Sí, cambiar el tipo".
2. Change any field while the warning is visible: the warning disappears.
3. Confirm: the dialog closes and the badge shows Gastos. `audit_logs` has a `CONTABILIDAD_CUENTA_RECLASIFICADA` row with `de`, `a` and `movimientos`.
4. Try Activo → Ingresos on an account with movements: red error, nothing changes, and no `audit_logs` row is added.
5. "Nueva cuenta", choose parent "63 Gastos no operacionales": the type switches to Gastos. Switch it back to Activo: the amber hint appears.
6. Export the catalog to Excel, change an account's type from Activo to Gastos, import: the preview lists the change under "tipo", and applying works.

- [ ] **Step 3: Open the PR (only when the user asks)**

Push the branch `fix/tipo-cuenta-con-movimientos` and open the PR against `main`, linking the tech lead summary and listing the 3 accounts. Body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: After deploy — fix the clients' data from the UI**

With the client's consent, and without any script against production:

1. SOLUCIONES DO SRL → Catálogo de cuentas → 6301 → Tipo Gastos → Guardar → confirm. Same with 6304.
2. YISRAEL KIDS SCHOOL SRL → 6320 → Tipo Gastos → Guardar → confirm.
3. Check in Reportes: in SOLUCIONES the Balance general shows Activos RD$2,508.00 lower and the Estado de resultados shows RD$2,508.00 more in Gastos. In KIDS SCHOOL no total changes.
4. Tell the client it's done and that from now on they can make this correction themselves.
