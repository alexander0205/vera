'use server';

import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users, invitations, activityLogs, ActivityType } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import Link from 'next/link';
import { Building2, Mail, Users, Clock, AlertTriangle } from 'lucide-react';

// ─── Server Action: invitar usuario ──────────────────────────────────────────

async function invitarUsuario(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.role !== 'owner') redirect('/lite');

  const teamId   = parseInt(formData.get('teamId') as string);
  const email    = (formData.get('email') as string).trim().toLowerCase();
  const teamName = (formData.get('teamName') as string).trim();
  if (!email || isNaN(teamId)) return;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(teamMembers, and(eq(teamMembers.userId, users.id), eq(teamMembers.teamId, teamId)))
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length) redirect(`/admin/empresas/${teamId}?error=ya_miembro`);

  const existingInv = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.teamId, teamId), eq(invitations.email, email), eq(invitations.status, 'pending')))
    .limit(1);

  if (!existingInv.length) {
    const [inv] = await db.insert(invitations).values({
      teamId, email, role: 'owner', invitedBy: admin.id, status: 'pending',
    }).returning();

    try {
      await sendInvitationEmail(email, admin.name, teamName, inv.id.toString());
    } catch (e) {
      console.error('[invitarUsuario]', e);
    }
  }

  redirect(`/admin/empresas/${teamId}?ok=invitado`);
}

// ─── Server Action: eliminar miembro ─────────────────────────────────────────

async function eliminarMiembro(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.role !== 'owner') redirect('/lite');

  const teamId = parseInt(formData.get('teamId') as string);
  const userId = parseInt(formData.get('userId') as string);
  if (isNaN(teamId) || isNaN(userId)) return;

  await db.delete(teamMembers).where(
    and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
  );

  await db.insert(activityLogs).values({
    teamId, userId: admin.id, action: ActivityType.REMOVE_TEAM_MEMBER, ipAddress: '',
  });

  redirect(`/admin/empresas/${teamId}?ok=eliminado`);
}

// ─── Server Action: cancelar invitación ──────────────────────────────────────

async function cancelarInvitacion(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.role !== 'owner') redirect('/lite');

  const invId  = parseInt(formData.get('invId') as string);
  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(invId)) return;

  await db.update(invitations).set({ status: 'revoked' }).where(eq(invitations.id, invId));
  redirect(`/admin/empresas/${teamId}`);
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function EmpresaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id }        = await params;
  const { ok, error } = await searchParams;
  const teamId        = parseInt(id);

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) notFound();

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: teamMembers.role, joinedAt: teamMembers.joinedAt })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));

  const pendingInvites = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.teamId, teamId), eq(invitations.status, 'pending')));

  const resendConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_YOUR_KEY_HERE');
  const inviteUrl = (invId: number) => `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${invId}`;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/admin/empresas" className="text-sm text-gray-500 hover:text-gray-700">← Empresas</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{team.razonSocial ?? team.name}</h1>
        <Link
          href={`/admin/empresas/${teamId}/editar`}
          className="ml-auto text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Editar
        </Link>
      </div>

      {/* Resend warning */}
      {!resendConfigured && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Emails no configurados</p>
            <p className="text-xs mt-0.5">
              <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code> es placeholder.
              Las invitaciones se crean pero el correo no se envía. Copia el enlace manualmente de la sección de invitaciones pendientes.
            </p>
          </div>
        </div>
      )}

      {/* Feedback */}
      {ok === 'invitado'    && <Alert color="green" msg="✓ Invitación enviada." />}
      {ok === 'eliminado'   && <Alert color="green" msg="✓ Usuario eliminado de la empresa." />}
      {ok === 'actualizado' && <Alert color="green" msg="✓ Datos actualizados correctamente." />}
      {error === 'ya_miembro' && <Alert color="amber" msg="⚠ Ese usuario ya es miembro." />}

      {/* Datos fiscales */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Datos fiscales</h2>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Item label="RNC"          value={team.rnc} mono />
          <Item label="Razón social" value={team.razonSocial} />
          <Item label="Comercial"    value={team.nombreComercial} />
          <Item label="Dirección"    value={team.direccion} />
          <Item label="Teléfono"     value={team.telefono} />
          <Item label="Email fact."  value={team.emailFacturacion} />
          <Item label="Plan"         value={team.planName ?? 'Sin plan'} />
          <Item label="Ambiente"     value={team.dgiiEnvironment ?? 'TesteCF'}
            badge badgeColor={team.dgiiEnvironment === 'Produccion' ? 'green' : 'amber'} />
        </div>
      </div>

      {/* Miembros */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Usuarios ({members.length})</h2>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-4">Sin usuarios. Invita al primero abajo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Desde</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{m.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {new Date(m.joinedAt).toLocaleDateString('es-DO')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <form action={eliminarMiembro}>
                      <input type="hidden" name="teamId" value={teamId} />
                      <input type="hidden" name="userId" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                        onClick={e => { if (!confirm(`¿Eliminar a ${m.email} de esta empresa?`)) e.preventDefault(); }}
                      >
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invitaciones pendientes */}
      {pendingInvites.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Invitaciones pendientes ({pendingInvites.length})</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {pendingInvites.map(inv => (
              <li key={inv.id} className="px-5 py-3 flex items-center gap-4">
                <span className="text-sm text-gray-700 flex-shrink-0">{inv.email}</span>
                <a
                  href={inviteUrl(inv.id)}
                  target="_blank"
                  className="text-xs text-teal-600 hover:underline font-mono truncate flex-1 min-w-0"
                >
                  {inviteUrl(inv.id)}
                </a>
                <form action={cancelarInvitacion} className="flex-shrink-0">
                  <input type="hidden" name="invId"  value={inv.id} />
                  <input type="hidden" name="teamId" value={teamId} />
                  <button
                    type="submit"
                    className="text-xs text-gray-400 hover:text-red-500"
                    onClick={e => { if (!confirm('¿Cancelar esta invitación?')) e.preventDefault(); }}
                  >
                    Cancelar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invitar usuario */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Invitar usuario</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {resendConfigured
            ? 'Le llegará un correo con el enlace para crear su cuenta.'
            : 'El correo no se enviará (Resend no configurado). Copia el enlace de la sección de arriba.'}
        </p>
        <form action={invitarUsuario} className="flex gap-3 items-end">
          <input type="hidden" name="teamId"   value={teamId} />
          <input type="hidden" name="teamName" value={team.razonSocial ?? team.name} />
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              name="email" type="email" required placeholder="cliente@suempresa.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="submit"
            className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Enviar invitación
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Alert({ color, msg }: { color: 'green' | 'amber'; msg: string }) {
  return (
    <div className={`text-sm rounded-lg px-4 py-3 border ${
      color === 'green'
        ? 'bg-green-50 border-green-200 text-green-700'
        : 'bg-amber-50 border-amber-200 text-amber-700'
    }`}>
      {msg}
    </div>
  );
}

function Item({ label, value, mono, badge, badgeColor }: {
  label: string; value?: string | null; mono?: boolean;
  badge?: boolean; badgeColor?: 'green' | 'amber';
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      {badge ? (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          badgeColor === 'green' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        }`}>{value}</span>
      ) : (
        <p className={`text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
      )}
    </div>
  );
}
