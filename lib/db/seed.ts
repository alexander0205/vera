/**
 * Seed de desarrollo para EmiteDO
 * Crea: usuario de prueba, empresa (RNC), clientes y secuencias de e-NCF
 *
 * Uso: pnpm db:seed
 */

import { db } from './drizzle';
import { users, teams, teamMembers, clients, sequences } from './schema';
import { hashPassword } from '@/lib/auth/session';
import { TEST_CONTRIBUYENTE } from '@/lib/config/test-data';
import { credencialDeSiembra, mostrarCredencialUnaVez } from './credenciales-seed';

async function seed() {
  console.log('🌱 Iniciando seed de EmiteDO...\n');

  // ─── Usuario de prueba ────────────────────────────────────────────────────
  // Sin contraseñas escritas en el código: de SEED_PASSWORD (mín. 12 caracteres)
  // o, si no está, una al azar que se muestra una sola vez al terminar.
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@emitedo.test';
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim() || 'owner@emitedo.test';
  const credencial = credencialDeSiembra('SEED_PASSWORD');
  const passwordHash = await hashPassword(credencial.valor);

  const [user] = await db
    .insert(users)
    .values({
      name: 'Admin EmiteDO',
      email,
      passwordHash,
      platformRole: 'admin',
    })
    .returning();

  console.log(`✓ Usuario creado: ${email}`);

  // ─── Empresa / Tenant (RNC de prueba) ────────────────────────────────────
  const [team] = await db
    .insert(teams)
    .values({
      name: TEST_CONTRIBUYENTE.razonSocial,
      rnc: TEST_CONTRIBUYENTE.rnc,
      razonSocial: TEST_CONTRIBUYENTE.razonSocial,
      nombreComercial: 'Yisrael Technology',
      direccion: TEST_CONTRIBUYENTE.direccion,
      // Plan de prueba: sin esto el límite de docs del plan Gratis bloquea
      // la emisión (403) antes de llegar a la lógica que los E2E validan.
      planName: 'negocio',
      subscriptionStatus: 'trialing',
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: 'owner',
  });

  console.log(`✓ Empresa creada: ${team.name} (RNC: ${team.rnc})`);

  // ─── Usuario owner NO platform-admin (para E2E del dashboard) ─────────────
  // El platform admin redirige a /admin al entrar; los tests del dashboard
  // necesitan un usuario normal dueño de la empresa.
  const [ownerUser] = await db
    .insert(users)
    .values({
      name: 'Owner EmiteDO',
      email: ownerEmail,
      passwordHash,                 // misma contraseña que el admin (la de SEED_PASSWORD o la generada)
      platformRole: 'member',
    })
    .returning();
  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: ownerUser.id,
    role: 'owner',
  });
  console.log(`✓ Usuario owner creado: ${ownerEmail}`);
  mostrarCredencialUnaVez('Contraseña de ambos usuarios', credencial);

  // ─── Cliente de prueba ────────────────────────────────────────────────────
  const clientesData = [
    {
      teamId:     team.id,
      rnc:        TEST_CONTRIBUYENTE.rnc,
      razonSocial: TEST_CONTRIBUYENTE.razonSocial,
      email:      TEST_CONTRIBUYENTE.email,
      telefono:   TEST_CONTRIBUYENTE.telefono,
      direccion:  TEST_CONTRIBUYENTE.direccion,
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
  console.log(credencial.generada ? '   Password: la generada arriba (no se vuelve a mostrar)' : '   Password: la de SEED_PASSWORD');
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
