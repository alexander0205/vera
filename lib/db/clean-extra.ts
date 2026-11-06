import { db } from './drizzle';
import { users, teamMembers, passwordResetTokens, emailVerificationTokens } from './schema';
import { eq } from 'drizzle-orm';

async function run() {
  // El correo a borrar va por entorno o argumento: no se escribe en el código (repo público).
  const correo = (process.env.CLEAN_EMAIL ?? process.argv[2] ?? '').trim().toLowerCase();
  if (!correo) { console.error('Uso: CLEAN_EMAIL=correo npx tsx lib/db/clean-extra.ts   (o pásalo como argumento)'); process.exit(1); }
  const [u] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, correo))
    .limit(1);

  if (!u) { console.log('No existe, nada que borrar.'); return; }

  const { activityLogs, auditLogs, systemLogs, invitations } = await import('./schema');
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, u.id));
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, u.id));
  await db.delete(activityLogs).where(eq(activityLogs.userId, u.id));
  await db.delete(auditLogs).where(eq(auditLogs.userId, u.id));
  await db.delete(systemLogs).where(eq(systemLogs.userId, u.id));
  await db.delete(invitations).where(eq(invitations.invitedBy, u.id));
  await db.delete(teamMembers).where(eq(teamMembers.userId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log('✓ Usuario eliminado');
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
