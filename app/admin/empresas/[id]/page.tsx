import { notFound, redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users, invitations, activityLogs, ActivityType } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import Link from 'next/link';
import { Building2, Mail, Users, Clock, AlertTriangle, ToggleLeft, ToggleRight, CreditCard } from 'lucide-react';
import { ConfirmButton } from './confirm-button';
import EcfApiSection from './_ecf-section';
import { RoleSelect } from './_role-select';
import { ROLE_KEYS } from '@/lib/config/roles';
import { revalidatePath } from 'next/cache';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import {
  MODULES, MODULE_LABELS, MODULE_DESCRIPTIONS, sanitizeModules,
  withDependencies, dependentsOf, isBaseModule, withBaseModules, type ModuleKey,
} from '@/lib/config/modules';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { getTeamModules } from '@/lib/auth/modules';
import { PLANS, getPlan } from '@/lib/config/plans';
import { PlanSelect } from './_plan-select';

/** -1 en el catálogo significa «sin tope»; 0 en estudiantes, «no aplica». */
function limiteTexto(n: number): string {
  if (n < 0) return 'Ilimitado';
  return String(n);
}

// ─── Server Action: invitar usuario ──────────────────────────────────────────

async function invitarUsuario(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

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
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [inv] = await db.insert(invitations).values({
      teamId, email, role: 'owner', invitedBy: admin.id, status: 'pending', token, expiresAt,
    }).returning();

    try {
      await sendInvitationEmail(email, admin.name, teamName, inv.token);
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
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

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

// ─── Server Action: cambiar rol de miembro ──────────────────────────────────

async function cambiarRolMiembro(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId  = parseInt(formData.get('teamId') as string);
  const userId  = parseInt(formData.get('userId') as string);
  const newRole = (formData.get('newRole') as string)?.trim();
  if (isNaN(teamId) || isNaN(userId) || !newRole) return;

  // Validar contra whitelist de roles del catálogo
  if (!(ROLE_KEYS as readonly string[]).includes(newRole)) {
    throw new Error('Rol inválido');
  }

  // Si downgrading owner → otro rol, asegurar que quede ≥1 owner en el team
  const [target] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (!target) throw new Error('Miembro no encontrado');

  if (target.role === 'owner' && newRole !== 'owner') {
    const owners = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')));
    if (owners.length <= 1) {
      throw new Error('No puedes quitar el rol de owner al último propietario.');
    }
  }

  await db
    .update(teamMembers)
    .set({ role: newRole })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

  await db.insert(activityLogs).values({
    teamId, userId: admin.id, action: ActivityType.UPDATE_ACCOUNT, ipAddress: '',
  });

  revalidatePath(`/admin/empresas/${teamId}`);
}

// ─── Server Action: toggle módulo caja ───────────────────────────────────────

async function toggleCajaHabilitada(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId  = parseInt(formData.get('teamId') as string);
  const habilitar = formData.get('habilitar') === '1';
  if (isNaN(teamId)) return;

  await db.update(teams).set({ cajaHabilitada: habilitar }).where(eq(teams.id, teamId));
  revalidatePath(`/admin/empresas/${teamId}`);
}

// ─── Server Action: asignar plan a la empresa ────────────────────────────────
//
// Es la ÚNICA vía para poner un plan sin pasar por Stripe, y hace falta por
// dos razones: las 22 empresas que ya existen nunca compraron nada (nacieron
// antes del billing) y hay que darles el suyo, y de vez en cuando toca sostener
// a un cliente mientras se arregla un pago.
//
// Marca `subscription_status = 'admin'`, que el ciclo de vida trata como acceso
// concedido por nosotros: no caduca y ningún webhook lo pisa. Ver
// lib/suscripcion/estado.ts.

async function asignarPlan(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId  = parseInt(formData.get('teamId') as string);
  const planKey = (formData.get('plan') as string ?? '').trim();
  if (isNaN(teamId)) return;

  // Cadena vacía = quitarle el plan. Se valida contra el catálogo para que un
  // POST a mano no pueda dejar un plan_name que después no resuelva a nada.
  const valido = planKey === '' || PLANS.some(p => p.key === planKey);
  if (!valido) return;

  await db.update(teams).set({
    planName: planKey || null,
    // 'admin' solo mientras no haya una suscripción de Stripe de por medio:
    // si la empresa YA paga, cambiarle el estado le rompería el ciclo real.
    subscriptionStatus: planKey ? 'admin' : null,
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));

  revalidatePath(`/admin/empresas/${teamId}`);
}

// ─── Server Action: toggle módulo del producto (facturación/pos) ─────────────
//
// A qué columna escribe depende de si el billing está encendido:
//
//  · apagado → modulosHabilitados. Los módulos son nuestros y esta columna es
//    la fuente de verdad; nadie más opina.
//  · encendido → modulosOverride. La fuente normal pasa a ser el plan, y esta
//    pantalla queda para la excepción: regalar un módulo, montar una demo,
//    sostener a un cliente mientras se arregla un pago.
//
// Escribir siempre en modulosHabilitados con el billing encendido sería un
// toggle que se ve moverse en pantalla y no cambia nada, porque getTeamModules
// leería el plan por encima. Ver la jerarquía en lib/auth/modules.ts.

async function toggleModulo(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId = parseInt(formData.get('teamId') as string);
  const modulo = formData.get('modulo') as ModuleKey;
  const habilitar = formData.get('habilitar') === '1';
  if (isNaN(teamId) || !MODULES.includes(modulo)) return;
  // Los módulos base (facturación + administración) los tiene toda empresa y no
  // se apagan: apagar administración dejaría al dueño sin acceso a su empresa.
  if (isBaseModule(modulo) && !habilitar) return;

  const [t] = await db
    .select({ mods: teams.modulosHabilitados, override: teams.modulosOverride })
    .from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!t) return;

  // Con billing encendido se parte del override si ya existe; si no, de lo que
  // hay habilitado hoy, para que el primer clic no le apague al cliente todo
  // lo que ya tenía.
  const current = sanitizeModules(
    BILLING_ENABLED && t.override != null ? t.override : t.mods,
  );
  // Activar arrastra dependencias (escolar cobra con facturas → necesita
  // Facturación); desactivar arrastra a los que dependen de él, si no el
  // módulo dependiente queda encendido pero roto.
  const next = withBaseModules(habilitar
    ? withDependencies([...current, modulo])
    : current.filter(m => m !== modulo && !dependentsOf(modulo).includes(m)));

  // Compat legacy: posHabilitado sigue reflejando el módulo pos hasta retirar
  // su último consumidor.
  await db.update(teams).set({
    ...(BILLING_ENABLED ? { modulosOverride: next } : { modulosHabilitados: next }),
    ...(modulo === 'pos' ? { posHabilitado: habilitar } : {}),
  }).where(eq(teams.id, teamId));
  revalidatePath(`/admin/empresas/${teamId}`);
}

// ─── Server Action: límite de duración del turno de caja ─────────────────────

async function guardarLimiteCaja(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(teamId)) return;

  // Vacío = sin límite. Se acota al mismo rango que valida /api/equipo/perfil
  // para que el admin no pueda guardar un valor que la empresa no podría.
  const rawHoras = (formData.get('limiteHoras') as string ?? '').trim();
  const horas = rawHoras === '' ? null : Math.min(24, Math.max(1, parseInt(rawHoras, 10)));
  const rawAviso = (formData.get('avisoMinutos') as string ?? '').trim();
  const aviso = Math.min(240, Math.max(5, parseInt(rawAviso, 10) || 60));

  // Vacío = nunca bloquea (solo avisa). 0 es un valor válido y significa lo mismo.
  const rawGracia = (formData.get('graciaHoras') as string ?? '').trim();
  const graciaNum = parseInt(rawGracia, 10);
  const gracia = rawGracia === '' || isNaN(graciaNum) ? null : Math.min(12, Math.max(0, graciaNum));

  await db
    .update(teams)
    .set({
      cajaLimiteHoras: horas != null && isNaN(horas) ? null : horas,
      cajaAvisoMinutos: aviso,
      cajaGraciaHoras: gracia,
    })
    .where(eq(teams.id, teamId));
  revalidatePath(`/admin/empresas/${teamId}`);
}

// ─── Server Action: cancelar invitación ──────────────────────────────────────

async function cancelarInvitacion(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const invId  = parseInt(formData.get('invId') as string);
  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(invId)) return;

  await db.update(invitations).set({ status: 'revoked' }).where(eq(invitations.id, invId));
  redirect(`/admin/empresas/${teamId}`);
}

// ─── Server Action: reenviar invitación ──────────────────────────────────────

async function reenviarInvitacion(formData: FormData) {
  'use server';
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const invId  = parseInt(formData.get('invId') as string);
  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(invId) || isNaN(teamId)) return;

  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invId), eq(invitations.status, 'pending')))
    .limit(1);
  if (!inv) redirect(`/admin/empresas/${teamId}?error=inv_no_encontrada`);

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect(`/admin/empresas/${teamId}?error=empresa_no_encontrada`);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(invitations).set({ expiresAt }).where(eq(invitations.id, invId));

  try {
    await sendInvitationEmail(inv.email, admin.name, team.razonSocial ?? team.name, inv.token);
  } catch (e) {
    console.error('[reenviarInvitacion]', e);
    redirect(`/admin/empresas/${teamId}?error=reenvio_fallido`);
  }

  redirect(`/admin/empresas/${teamId}?ok=reenviado`);
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

  // Lo que la empresa ve DE VERDAD, no lo que dice una columna suelta: con el
  // billing encendido los módulos salen del plan, y pintar modulosHabilitados
  // aquí mostraría un toggle apagado sobre un módulo que el cliente sí tiene.
  const modulosActivos = await getTeamModules(teamId);

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
  const inviteUrl = (tok: string) => `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${tok}`;

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Link href="/admin/empresas" style={{ textDecoration: 'none' }}>
          <Typography variant="body2" sx={{ color: '#6b7280', '&:hover': { color: '#374151' } }}>
            ← Empresas
          </Typography>
        </Link>
        <Typography variant="body2" sx={{ color: '#d1d5db' }}>/</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.1rem' }}>
          {team.razonSocial ?? team.name}
        </Typography>
        <Box sx={{ ml: 'auto' }}>
          <Link href={`/admin/empresas/${teamId}/editar`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              variant="outlined"
              disableElevation
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                color: '#374151',
                borderColor: '#e5e7eb',
                bgcolor: '#f3f4f6',
                fontWeight: 500,
                fontSize: '0.8125rem',
                '&:hover': { bgcolor: '#e5e7eb', borderColor: '#d1d5db' },
              }}
            >
              Editar
            </Button>
          </Link>
        </Box>
      </Box>

      {/* Resend warning */}
      {!resendConfigured && (
        <Box sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1.5,
          bgcolor: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '8px', px: 2, py: 1.5,
        }}>
          <AlertTriangle style={{ width: 16, height: 16, color: '#92400e', marginTop: 2, flexShrink: 0 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#92400e' }}>
              Emails no configurados
            </Typography>
            <Typography variant="caption" sx={{ color: '#92400e', mt: 0.5, display: 'block' }}>
              <code style={{ background: '#fef3c7', padding: '0 4px', borderRadius: 4 }}>RESEND_API_KEY</code>
              {' '}es placeholder. Las invitaciones se crean pero el correo no se envía. Copia el enlace manualmente de la sección de invitaciones pendientes.
            </Typography>
          </Box>
        </Box>
      )}

      {/* Feedback */}
      {ok === 'invitado'    && <Alert color="green" msg="✓ Invitación enviada." />}
      {ok === 'eliminado'   && <Alert color="green" msg="✓ Usuario eliminado de la empresa." />}
      {ok === 'actualizado' && <Alert color="green" msg="✓ Datos actualizados correctamente." />}
      {ok === 'vinculado_ecf'        && <Alert color="green" msg="✓ Empresa vinculada a ecf-api." />}
      {ok === 'ambiente_actualizado' && <Alert color="green" msg="✓ Ambiente DGII actualizado." />}
      {ok === 'cert_subido'          && <Alert color="green" msg="✓ Certificado subido y activado." />}
      {ok === 'cert_revocado'        && <Alert color="green" msg="✓ Certificado revocado." />}
      {ok === 'rango_registrado'     && <Alert color="green" msg="✓ Rango NCF registrado en ecf-api." />}
      {ok === 'rango_eliminado'      && <Alert color="green" msg="✓ Rango desactivado." />}
      {ok === 'token_refrescado'     && <Alert color="green" msg="✓ Token DGII refrescado." />}
      {ok === 'reenviado'            && <Alert color="green" msg="✓ Invitación reenviada." />}
      {error === 'ya_miembro'             && <Alert color="amber" msg="⚠ Ese usuario ya es miembro." />}
      {error === 'reenvio_fallido'        && <Alert color="amber" msg="⚠ No se pudo reenviar el correo. Revisa la configuración de Resend." />}
      {error === 'inv_no_encontrada'      && <Alert color="amber" msg="⚠ Invitación no encontrada o ya cancelada." />}
      {error === 'empresa_no_encontrada'  && <Alert color="amber" msg="⚠ Empresa no encontrada." />}
      {error?.startsWith('ecf_')   && <Alert color="amber" msg={`⚠ ecf-api: ${decodeURIComponent(error.slice(4))}`} />}
      {error?.startsWith('cert_')  && <Alert color="amber" msg={`⚠ Certificado: ${decodeURIComponent(error.slice(5))}`} />}
      {error?.startsWith('rango_') && <Alert color="amber" msg={`⚠ Rango: ${decodeURIComponent(error.slice(6))}`} />}
      {error?.startsWith('token_') && <Alert color="amber" msg={`⚠ Token DGII: ${decodeURIComponent(error.slice(6))}`} />}

      {/* Datos fiscales */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Building2 style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Datos fiscales</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: '12px 24px' }}>
          <Item label="RNC"          value={team.rnc} mono />
          <Item label="Razón social" value={team.razonSocial} />
          <Item label="Comercial"    value={team.nombreComercial} />
          <Item label="Dirección"    value={team.direccion} />
          <Item label="Teléfono"     value={team.telefono} />
          <Item label="Email fact."  value={team.emailFacturacion} />
        </Box>
      </Box>

      {/* Plan de la empresa */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <CreditCard style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Plan</Typography>
        </Box>

        <form action={asignarPlan} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input type="hidden" name="teamId" value={teamId} />
          <Box sx={{ minWidth: 260 }}>
            <PlanSelect current={team.planName ?? ''} />
          </Box>
          <Button type="submit" variant="outlined" size="small" disableElevation
            sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 500, fontSize: '0.8125rem' }}>
            Guardar plan
          </Button>
        </form>

        <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 1.5 }}>
          {team.stripeSubscriptionId
            ? 'Esta empresa tiene suscripción en Stripe. Cambiar el plan aquí NO cobra ni avisa a Stripe — úsalo solo para corregir.'
            : 'Sin suscripción en Stripe: el plan queda como acceso concedido por nosotros y no caduca.'}
        </Typography>

        {team.planName && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: '12px 24px', mt: 2, pt: 2, borderTop: '1px solid #f3f4f6' }}>
            <Item label="Comprobantes/mes" value={limiteTexto(getPlan(team.planName).limits.docs)} />
            <Item label="Usuarios"         value={limiteTexto(getPlan(team.planName).limits.users)} />
            <Item label="Estudiantes"      value={limiteTexto(getPlan(team.planName).limits.estudiantes)} />
            <Item label="Precio"           value={`US$${getPlan(team.planName).price}/mes`} />
          </Box>
        )}
      </Box>

      {/* Módulos del equipo */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ToggleRight style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Módulos</Typography>
        </Box>
        {/* Módulos del producto — override manual del admin de plataforma.
            Se recorre el catálogo (MODULES) para que un módulo nuevo aparezca
            aquí solo: Administración Escolar no se vende por Stripe, así que
            este toggle es su ÚNICA vía de activación. */}
        {MODULES.map(mod => {
          // Los módulos base los tiene toda empresa: se muestran siempre activos
          // y sin botón, no hay nada que decidir sobre ellos.
          const base = isBaseModule(mod);
          const activo = base || modulosActivos.includes(mod);
          const label = MODULE_LABELS[mod];
          const desc = MODULE_DESCRIPTIONS[mod];
          return (
            <Box key={mod} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f3f4f6' }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>{label}</Typography>
                <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block' }}>{desc}</Typography>
              </Box>
              {base ? (
                <Chip
                  size="small"
                  icon={<ToggleRight style={{ width: 14, height: 14 }} />}
                  label="Incluido"
                  sx={{ bgcolor: '#eef2fe', color: '#2a45c4', border: '1px solid #c7d2fc', fontWeight: 500, fontSize: '0.75rem' }}
                />
              ) : (
              <form action={toggleModulo}>
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="modulo" value={mod} />
                <input type="hidden" name="habilitar" value={activo ? '0' : '1'} />
                <Button
                  type="submit"
                  variant="outlined"
                  size="small"
                  disableElevation
                  startIcon={activo
                    ? <ToggleRight style={{ width: 16, height: 16 }} />
                    : <ToggleLeft  style={{ width: 16, height: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontWeight: 500,
                    fontSize: '0.8125rem',
                    ...(activo
                      ? { bgcolor: '#eef2fe', color: '#2a45c4', borderColor: '#c7d2fc', '&:hover': { bgcolor: '#e0e7fd', borderColor: '#a5b4f9' } }
                      : { bgcolor: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb', '&:hover': { bgcolor: '#f3f4f6', borderColor: '#d1d5db' } }
                    ),
                  }}
                >
                  {activo ? 'Habilitado' : 'Deshabilitado'}
                </Button>
              </form>
              )}
            </Box>
          );
        })}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Cuadre de Caja</Typography>
            <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, display: 'block' }}>
              Habilita el módulo de apertura, cierre y cuadre de turnos de caja para este equipo.
            </Typography>
          </Box>
          <form action={toggleCajaHabilitada}>
            <input type="hidden" name="teamId"    value={teamId} />
            <input type="hidden" name="habilitar" value={team.cajaHabilitada ? '0' : '1'} />
            <Button
              type="submit"
              variant="outlined"
              size="small"
              disableElevation
              startIcon={team.cajaHabilitada
                ? <ToggleRight style={{ width: 16, height: 16 }} />
                : <ToggleLeft  style={{ width: 16, height: 16 }} />}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '0.8125rem',
                ...(team.cajaHabilitada
                  ? { bgcolor: '#eef2fe', color: '#2a45c4', borderColor: '#c7d2fc', '&:hover': { bgcolor: '#e0e7fd', borderColor: '#a5b4f9' } }
                  : { bgcolor: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb', '&:hover': { bgcolor: '#f3f4f6', borderColor: '#d1d5db' } }
                ),
              }}
            >
              {team.cajaHabilitada ? 'Habilitada' : 'Deshabilitada'}
            </Button>
          </form>
        </Box>

        {/* Límite de duración del turno — solo aplica con el módulo activo */}
        {team.cajaHabilitada && (
          <Box component="form" action={guardarLimiteCaja} sx={{ borderTop: '1px solid #f3f4f6', pt: 1.5, mt: 0.5 }}>
            <input type="hidden" name="teamId" value={teamId} />
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Límite del turno</Typography>
            <Typography variant="caption" sx={{ color: '#9ca3af', mt: 0.5, mb: 1, display: 'block' }}>
              Pasado el límite + la gracia, el cajero no puede facturar ni cobrar hasta cerrar caja.
              Gracia vacía o 0 = solo avisa. La empresa también puede ajustarlo desde su configuración.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
              <TextField
                name="limiteHoras"
                type="number"
                size="small"
                label="Horas"
                placeholder="sin límite"
                defaultValue={team.cajaLimiteHoras ?? ''}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 24 } }}
                sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
              />
              <TextField
                name="avisoMinutos"
                type="number"
                size="small"
                label="Avisar desde (min)"
                defaultValue={team.cajaAvisoMinutos ?? 60}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 5, max: 240 } }}
                sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
              />
              <TextField
                name="graciaHoras"
                type="number"
                size="small"
                label="Gracia (h)"
                placeholder="no bloquea"
                defaultValue={team.cajaGraciaHoras ?? ''}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 12 } }}
                sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
              />
              <Button
                type="submit"
                variant="outlined"
                size="small"
                disableElevation
                sx={{
                  textTransform: 'none', borderRadius: '8px', fontWeight: 500, fontSize: '0.8125rem',
                  bgcolor: '#f9fafb', color: '#374151', borderColor: '#e5e7eb',
                  '&:hover': { bgcolor: '#f3f4f6', borderColor: '#d1d5db' },
                  height: 40,
                }}
              >
                Guardar
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Integración ecf-api */}
      <EcfApiSection teamId={teamId} rnc={team.rnc} />

      {/* Miembros */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
          <Users style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
            Usuarios ({members.length})
          </Typography>
        </Box>

        {members.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#9ca3af', px: 2.5, py: 2 }}>
            Sin usuarios. Invita al primero abajo.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f9fafb' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Usuario</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Rol</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Desde</TableCell>
                <TableCell sx={{ borderBottom: '1px solid #f3f4f6' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {(() => {
                const ownerCount = members.filter(x => x.role === 'owner').length;
                return members.map(m => (
                  <TableRow key={m.id} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                    <TableCell sx={{ borderBottom: '1px solid #f9fafb' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>{m.name ?? '—'}</Typography>
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>{m.email}</Typography>
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #f9fafb' }}>
                      <RoleSelect
                        teamId={teamId}
                        userId={m.id}
                        currentRole={m.role}
                        isLastOwner={m.role === 'owner' && ownerCount <= 1}
                        action={cambiarRolMiembro}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #f9fafb' }}>
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                        {new Date(m.joinedAt).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: '1px solid #f9fafb' }}>
                      <ConfirmButton
                        action={eliminarMiembro}
                        message={`¿Eliminar a ${m.email} de esta empresa?`}
                        fields={{ teamId, userId: m.id }}
                        color="error"
                      >
                        Eliminar
                      </ConfirmButton>
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Invitaciones pendientes */}
      {pendingInvites.length > 0 && (
        <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
            <Clock style={{ width: 16, height: 16, color: '#9ca3af' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
              Invitaciones pendientes ({pendingInvites.length})
            </Typography>
          </Box>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {pendingInvites.map(inv => (
              <Box
                component="li"
                key={inv.id}
                sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid #f9fafb', '&:last-child': { borderBottom: 'none' } }}
              >
                <Typography variant="body2" sx={{ color: '#374151', flexShrink: 0 }}>{inv.email}</Typography>
                <Typography
                  component="a"
                  href={inviteUrl(inv.token)}
                  target="_blank"
                  variant="caption"
                  sx={{
                    color: '#3658e1', fontFamily: 'monospace', flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {inviteUrl(inv.token)}
                </Typography>
                <ConfirmButton
                  action={reenviarInvitacion}
                  message="¿Reenviar correo de invitación?"
                  fields={{ invId: inv.id, teamId }}
                >
                  Reenviar
                </ConfirmButton>
                <ConfirmButton
                  action={cancelarInvitacion}
                  message="¿Cancelar esta invitación?"
                  fields={{ invId: inv.id, teamId }}
                  color="error"
                >
                  Cancelar
                </ConfirmButton>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Invitar usuario */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Mail style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Invitar usuario</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: '#6b7280', mb: 2, display: 'block' }}>
          {resendConfigured
            ? 'Le llegará un correo con el enlace para crear su cuenta.'
            : 'El correo no se enviará (Resend no configurado). Copia el enlace de la sección de arriba.'}
        </Typography>
        <form action={invitarUsuario}>
          <input type="hidden" name="teamId"   value={teamId} />
          <input type="hidden" name="teamName" value={team.razonSocial ?? team.name} />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563', mb: 0.5, display: 'block' }}>
                Email
              </Typography>
              <TextField
                name="email"
                type="email"
                required
                placeholder="cliente@suempresa.com"
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              disableElevation
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                bgcolor: '#3658e1',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: '#2a45c4' },
              }}
            >
              Enviar invitación
            </Button>
          </Box>
        </form>
      </Box>
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Alert({ color, msg }: { color: 'green' | 'amber'; msg: string }) {
  return (
    <Box sx={{
      px: 2, py: 1.5, borderRadius: '8px',
      ...(color === 'green'
        ? { bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }
        : { bgcolor: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }
      ),
    }}>
      <Typography variant="body2" sx={{ color: 'inherit' }}>{msg}</Typography>
    </Box>
  );
}

function Item({ label, value, mono, badge, badgeColor }: {
  label: string; value?: string | null; mono?: boolean;
  badge?: boolean; badgeColor?: 'green' | 'amber';
}) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>{label}</Typography>
      {badge ? (
        <Box
          component="span"
          sx={{
            display: 'inline-block', fontSize: '0.75rem', px: 1, py: '2px',
            borderRadius: '999px', fontWeight: 500,
            ...(badgeColor === 'green'
              ? { bgcolor: '#f0fdf4', color: '#15803d' }
              : { bgcolor: '#fffbeb', color: '#b45309' }
            ),
          }}
        >
          {value}
        </Box>
      ) : (
        <Typography
          variant="body2"
          sx={{ color: '#1f2937', ...(mono ? { fontFamily: 'monospace' } : {}) }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}
