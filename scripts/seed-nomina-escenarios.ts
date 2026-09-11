/**
 * Siembra una corrida aislada para demostrar pagos de nómina por empleado.
 *
 * Uso:
 *   $env:CONFIRM_SEED_NOMINA='YES'; $env:SEED_TEAM=33; npx tsx scripts/seed-nomina-escenarios.ts
 *   $env:SEED_TEAM=33; npx tsx scripts/seed-nomina-escenarios.ts --limpiar
 *
 * La muestra es idempotente. Sus empleados quedan inactivos para no entrar en
 * corridas futuras; la corrida conserva sus snapshots para probar la pantalla.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaLineas, nominaObligaciones } from '@/lib/db/schema';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { construirCorrida } from '@/lib/nomina/corrida';
import { obligacionesDeLineas } from '@/lib/nomina/obligaciones';

const TAG = 'demo-nomina-escenarios-2026-09';
const RUN_LABEL = 'Nómina demostración · Septiembre 2026';
const PERIOD = '2026-09';

const teamId = Number(process.env.SEED_TEAM);
const limpiarSolo = process.argv.includes('--limpiar');

type Fixture = {
  nombres: string;
  apellidos: string;
  cargo: string;
  salarioBaseCents: number;
  bancoNombre?: string;
  bancoCuenta?: string;
  bancoTipoCuenta?: string;
  pagada: boolean;
};

const fixtures: Fixture[] = [
  {
    nombres: 'Andrea', apellidos: 'Paredes',
    cargo: 'Docente · demo: pago registrado', salarioBaseCents: 88_000_00,
    bancoNombre: 'Banreservas', bancoCuenta: '000100000001', bancoTipoCuenta: 'ahorros', pagada: true,
  },
  {
    nombres: 'Bruno', apellidos: 'Castillo',
    cargo: 'Auxiliar · demo: pago registrado sin ISR', salarioBaseCents: 30_000_00,
    bancoNombre: 'Banco Popular', bancoCuenta: '000100000002', bancoTipoCuenta: 'corriente', pagada: true,
  },
  {
    nombres: 'Camila', apellidos: 'Durán',
    cargo: 'Coordinadora · demo: pendiente individual', salarioBaseCents: 65_000_00,
    bancoNombre: 'BHD', bancoCuenta: '000100000003', bancoTipoCuenta: 'ahorros', pagada: false,
  },
  {
    nombres: 'Diego', apellidos: 'Rosario',
    cargo: 'Asistente · demo: pendiente sin cuenta bancaria', salarioBaseCents: 34_000_00,
    pagada: false,
  },
  {
    nombres: 'Elena', apellidos: 'Vargas',
    cargo: 'Directora · demo: pendiente con ISR', salarioBaseCents: 125_000_00,
    bancoNombre: 'Scotiabank', bancoCuenta: '000100000005', bancoTipoCuenta: 'corriente', pagada: false,
  },
];

async function limpiar() {
  return db.transaction(async (tx) => {
    await tx.delete(nominaCorridas).where(and(
      eq(nominaCorridas.teamId, teamId),
      eq(nominaCorridas.descripcion, RUN_LABEL),
    ));
    const borrados = await tx.delete(empleados).where(and(
      eq(empleados.teamId, teamId),
      eq(empleados.origenRef, TAG),
    )).returning({ id: empleados.id });
    return borrados.length;
  });
}

async function main() {
  if (!Number.isInteger(teamId) || teamId <= 0) {
    throw new Error('Falta SEED_TEAM con el id exacto del equipo.');
  }

  const eliminados = await limpiar();
  if (limpiarSolo) {
    console.log(`Muestra eliminada: ${eliminados} empleado(s).`);
    return;
  }
  if (process.env.CONFIRM_SEED_NOMINA !== 'YES') {
    throw new Error("Falta CONFIRM_SEED_NOMINA='YES'. No se sembró nada.");
  }

  const resultado = await db.transaction(async (tx) => {
    const creados = await tx.insert(empleados).values(fixtures.map((f, index) => ({
      teamId,
      cedula: `DEMO-NOM-${String(index + 1).padStart(3, '0')}`,
      nombres: f.nombres,
      apellidos: f.apellidos,
      cargo: f.cargo,
      salarioBaseCents: f.salarioBaseCents,
      frecuenciaPago: 'mensual',
      fechaIngreso: '2025-01-01',
      // La corrida toma snapshots, así que inactivo evita que estas personas
      // de prueba entren después a una corrida operativa.
      estado: 'inactivo',
      afp: 'AFP Demo',
      ars: 'ARS Demo',
      bancoNombre: f.bancoNombre,
      bancoCuenta: f.bancoCuenta,
      bancoTipoCuenta: f.bancoTipoCuenta,
      nacionalidad: 'Dominicana',
      pais: 'República Dominicana',
      email: `nomina-demo-${index + 1}@ejemplo.invalid`,
      notas: 'Registro de demostración para pruebas de selección y pagos de nómina.',
      origen: 'manual',
      origenRef: TAG,
    }))).returning();

    const { lineas, totales } = construirCorrida(
      creados.map((e) => ({
        id: e.id,
        nombres: e.nombres,
        apellidos: e.apellidos,
        cedula: e.cedula,
        cargo: e.cargo,
        salarioBaseCents: e.salarioBaseCents,
        estado: 'activo',
      })),
      tasasDelAnio(2026),
    );

    const [corrida] = await tx.insert(nominaCorridas).values({
      teamId,
      periodo: PERIOD,
      tipo: 'mensual',
      descripcion: RUN_LABEL,
      fechaPago: '2026-09-15',
      estado: 'aprobada',
      anioTasas: 2026,
      totalBrutoCents: totales.totalBrutoCents,
      totalDeduccionesCents: totales.totalDeduccionesCents,
      totalNetoCents: totales.totalNetoCents,
      totalPatronalCents: totales.totalPatronalCents,
      aprobadaEn: new Date('2026-09-15T12:00:00-04:00'),
    }).returning();

    const lineasCreadas = await tx.insert(nominaLineas).values(lineas.map((linea, index) => ({
      ...linea,
      corridaId: corrida.id,
      teamId,
      pagada: fixtures[index].pagada,
      pagadaEn: fixtures[index].pagada ? new Date('2026-09-15T13:00:00-04:00') : null,
    }))).returning();

    const obligaciones = obligacionesDeLineas(lineas);
    await tx.insert(nominaObligaciones).values(obligaciones.map((o) => ({
      teamId,
      corridaId: corrida.id,
      destino: o.destino,
      montoCents: o.montoCents,
      parteRetencionesCents: o.parteRetencionesCents,
      parteAportesCents: o.parteAportesCents,
      // Muestra pago separado de aportes y retenciones: TSS ya pagada, DGII pendiente.
      pagada: o.destino === 'TSS',
      pagadaEn: o.destino === 'TSS' ? new Date('2026-09-16T10:00:00-04:00') : null,
    })));

    return { corrida, lineas: lineasCreadas };
  });

  console.log(JSON.stringify({
    corridaId: resultado.corrida.id,
    url: `/nomina/corridas/${resultado.corrida.id}`,
    casos: [
      'Andrea y Bruno: pagos de empleados ya registrados.',
      'Camila y Elena: pagos pendientes, con cuenta bancaria y montos distintos.',
      'Diego: pago pendiente sin cuenta bancaria; activa la alerta de dispersión.',
      'TSS pagada y DGII pendiente: obligaciones al Estado por separado.',
    ],
    lineas: resultado.lineas.map((l) => ({ nombre: l.nombre, pagada: l.pagada, netoCents: l.netoCents })),
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
