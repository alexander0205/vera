/**
 * Reset + seed de producción
 *
 * Borra TODOS los datos de negocio (usuarios, teams, facturas, etc.)
 * y crea UN SOLO usuario administrador con su empresa.
 *
 * PRESERVA: rnc_padron, system_settings  (datos del sistema, no del tenant)
 *
 * Uso: pnpm db:reset
 */

import { db } from './drizzle';
import { sql } from 'drizzle-orm';
import {
  users, teams, teamMembers,
  activityLogs, invitations,
  clients, products, sequences, ecfDocuments,
  ecfDocumentsRecibidos, cotizaciones, categorias,
  facturasRecurrentes, almacenes, vendedores,
  listasPrecios, listasPrecios_items, systemLogs,
  auditLogs, rateLimits, passwordResetTokens,
  emailVerificationTokens, payments, apiKeys,
  outboundWebhooks,
} from './schema';
import { hashPassword } from '@/lib/auth/session';
import { TEST_CONTRIBUYENTE } from '@/lib/config/test-data';

// ─── Configuración del admin ──────────────────────────────────────────────────

const ADMIN_EMAIL    = 'alexander.ferreras@yisraeltech.com';
const ADMIN_PASSWORD = 'Admin1234!';
const ADMIN_NAME     = 'Alexander Ferreras';

// ─── Reset ────────────────────────────────────────────────────────────────────

async function reset() {
  console.log('⚠️  RESET — borrando todos los datos de negocio...\n');

  // Orden: hijos antes que padres (foreign keys)
  await db.delete(listasPrecios_items);
  await db.delete(payments);
  await db.delete(apiKeys);
  await db.delete(outboundWebhooks);
  await db.delete(ecfDocumentsRecibidos);
  await db.delete(ecfDocuments);
  await db.delete(cotizaciones);
  await db.delete(facturasRecurrentes);
  await db.delete(clients);
  await db.delete(sequences);
  await db.delete(products);
  await db.delete(almacenes);
  await db.delete(vendedores);
  await db.delete(listasPrecios);
  await db.delete(categorias);
  await db.delete(systemLogs);
  await db.delete(auditLogs);
  await db.delete(activityLogs);
  await db.delete(invitations);
  await db.delete(teamMembers);
  await db.delete(teams);
  await db.delete(passwordResetTokens);
  await db.delete(emailVerificationTokens);
  await db.delete(rateLimits);
  await db.delete(users);

  // Reiniciar secuencias de auto-increment para IDs limpios
  await db.execute(sql`ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE IF EXISTS teams_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE IF EXISTS team_members_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE IF EXISTS sequences_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE IF EXISTS clients_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE IF EXISTS ecf_documents_id_seq RESTART WITH 1`);

  console.log('✓ Todas las tablas limpiadas\n');

  // ─── Usuario admin ────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const [user] = await db
    .insert(users)
    .values({
      name:  ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      platformRole: 'admin',
      emailVerified: true,
    })
    .returning();

  console.log(`✓ Usuario: ${ADMIN_EMAIL}`);

  // ─── Empresa ──────────────────────────────────────────────────────────────
  const [team] = await db
    .insert(teams)
    .values({
      name:            TEST_CONTRIBUYENTE.razonSocial,
      rnc:             TEST_CONTRIBUYENTE.rnc,
      razonSocial:     TEST_CONTRIBUYENTE.razonSocial,
      nombreComercial: 'Yisrael Technology',
      direccion:       TEST_CONTRIBUYENTE.direccion,
      telefono:        TEST_CONTRIBUYENTE.telefono,
      emailFacturacion: TEST_CONTRIBUYENTE.email,
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role:   'owner',
  });

  console.log(`✓ Empresa: ${team.name} (RNC: ${team.rnc})`);

  // ─── Cliente de referencia (la propia empresa) ────────────────────────────
  await db.insert(clients).values({
    teamId:      team.id,
    rnc:         TEST_CONTRIBUYENTE.rnc,
    razonSocial: TEST_CONTRIBUYENTE.razonSocial,
    email:       TEST_CONTRIBUYENTE.email,
    telefono:    TEST_CONTRIBUYENTE.telefono,
    direccion:   TEST_CONTRIBUYENTE.direccion,
  });

  console.log('✓ Cliente de prueba creado');

  // ─── Secuencias e-NCF ─────────────────────────────────────────────────────
  const vencimiento = new Date('2027-12-31');

  await db.insert(sequences).values([
    { teamId: team.id, tipoEcf: '31', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(1000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '32', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(5000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '33', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '34', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '41', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '43', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(200),  fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '44', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '45', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '46', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
    { teamId: team.id, tipoEcf: '47', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: vencimiento },
  ]);

  console.log('✓ 10 secuencias e-NCF creadas');

  console.log('\n──────────────────────────────────────────────');
  console.log('✅ Reset completado. Credenciales:');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   URL:      http://localhost:3002/sign-in`);
  console.log('──────────────────────────────────────────────\n');
}

reset()
  .catch((e) => {
    console.error('❌ Reset falló:', e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
