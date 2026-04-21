/**
 * Seed de desarrollo para EmiteDO
 * Crea: usuario de prueba, empresa (RNC), clientes y secuencias de e-NCF
 *
 * Uso: pnpm db:seed
 */

import { db } from './drizzle';
import { users, teams, teamMembers, clients, sequences } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function seed() {
  console.log('🌱 Iniciando seed de EmiteDO...\n');

  // ─── Usuario de prueba ────────────────────────────────────────────────────
  const email = 'admin@emitedo.test';
  const password = 'Admin1234!';
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name: 'Admin EmiteDO',
      email,
      passwordHash,
      role: 'owner',
    })
    .returning();

  console.log(`✓ Usuario creado: ${email} / ${password}`);

  // ─── Empresa / Tenant (RNC de prueba) ────────────────────────────────────
  const [team] = await db
    .insert(teams)
    .values({
      name: 'SolucionesDO SRL',
      rnc: '130123456',
      razonSocial: 'SolucionesDO SRL',
      nombreComercial: 'SolucionesDO',
      direccion: 'Av. Winston Churchill, Santo Domingo, RD',
      dgiiEnvironment: 'TesteCF',
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: 'owner',
  });

  console.log(`✓ Empresa creada: ${team.name} (RNC: ${team.rnc})`);

  // ─── Clientes de prueba ───────────────────────────────────────────────────
  const clientesData = [
    {
      teamId: team.id,
      rnc: '101123456',
      razonSocial: 'Distribuidora González SRL',
      email: 'gonzalez@test.com',
      telefono: '809-555-0001',
      direccion: 'Santiago de los Caballeros, RD',
    },
    {
      teamId: team.id,
      rnc: '131234567',
      razonSocial: 'Importadora del Este SA',
      email: 'impeste@test.com',
      telefono: '809-555-0002',
      direccion: 'San Pedro de Macorís, RD',
    },
    {
      teamId: team.id,
      rnc: '001456789',
      razonSocial: 'Consumidor Final',
      email: undefined,
      telefono: undefined,
      direccion: undefined,
    },
  ];

  const insertedClients = await db
    .insert(clients)
    .values(clientesData)
    .returning();

  console.log(`✓ ${insertedClients.length} clientes creados`);

  // ─── Secuencias e-NCF (TesteCF) ───────────────────────────────────────────
  // La DGII asigna rangos; en desarrollo usamos rangos de prueba
  const vencimiento = new Date('2027-12-31');

  const secuenciasData = [
    // Tipos de uso general
    { teamId: team.id, tipoEcf: '31', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(1000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '32', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(5000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '33', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '34', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '41', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '43', secuenciaActual: BigInt(1), secuenciaHasta: BigInt(200),  fechaVencimiento: vencimiento },
    // Tipos especializados — requeridos por DGII en el Set de Pruebas de habilitación.
    // Rangos desde 1000 para coincidir con el patrón real de asignación DGII
    // (E440000001000, E450000001000, etc. — verificado en habilitación real de RNC 131988032)
    { teamId: team.id, tipoEcf: '44', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '45', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '46', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '47', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
  ];

  await db.insert(sequences).values(secuenciasData);
  console.log(`✓ ${secuenciasData.length} tipos de secuencias e-NCF registrados`);

  console.log('\n─────────────────────────────────────────');
  console.log('✅ Seed completado. Credenciales de prueba:');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   URL:      http://localhost:3000/sign-in`);
  console.log('─────────────────────────────────────────\n');
}

seed()
  .catch((error) => {
    console.error('❌ Seed falló:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
