/**
 * Verificación del cambio de tipo con movimientos, contra una RAMA de Neon.
 *
 *   POSTGRES_URL="postgresql://…rama…" TEAM_ID=9 USER_ID=4 \
 *     npx tsx scripts/verificar-cambio-tipo-cuenta.ts
 *
 * Siembra cuentas y asientos sintéticos (códigos ZZVER…), prueba las reglas de
 * `lib/contabilidad/cambio-tipo.ts` a través de `editarCuenta` y mide el efecto
 * en el Balance general. Deja el team exactamente como estaba.
 *
 * A propósito NO toma la URL de la base de `.env` (ese archivo apunta a
 * producción): `POSTGRES_URL` tiene que venir escrita en el comando, se valida
 * antes de importar nada, y no puede ser la de producción. Las demás variables
 * de `.env` sí las carga `lib/db/drizzle.ts`, pero dotenv no pisa la URL ya puesta.
 */

export {}; // módulo propio: evita choques de nombres globales con otros scripts

const HOST_PRODUCCION ='ep-raspy-mud-annawbag';
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
