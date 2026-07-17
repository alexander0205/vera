import { db } from '@/lib/db/drizzle';
import {
  users,
  teams,
  teamMembers,
  ecfDocuments,
  activityLogs,
} from '@/lib/db/schema';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import {
  Building2,
  Users,
  FileText,
  DollarSign,
  Receipt,
  Calendar,
  TrendingUp,
  ShieldCheck,
  BadgeCheck,
  Store,
  Wallet,
  GraduationCap,
  Percent,
  AlertTriangle,
  Activity,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Documento que cuenta como facturación real: e-CF emitido a la DGII (cualquier
// tipo, estado aceptado/condicional/en-proceso) O ticket sin-ncf no anulado
// (venta real sin comprobante fiscal — default del POS, vive en BORRADOR).
// Mismo criterio de "venta" que la capa de reportes (shared.ts → pVentaValida).
const VENTA = sql`(
  ${ecfDocuments.estado} in ('ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO')
  or (${ecfDocuments.tipoEcf} = 'sin-ncf' and ${ecfDocuments.estado} not in ('ANULADO','RECHAZADO'))
)`;

const TZ = 'America/Santo_Domingo';
const n = (x: unknown) => Number(x ?? 0) || 0;

function money(cents: number) {
  return (cents / 100).toLocaleString('es-DO', {
    style: 'currency',
    currency: 'DOP',
    maximumFractionDigits: 0,
  });
}
function num(x: number) {
  return x.toLocaleString('es-DO');
}
function fecha(d: Date) {
  return new Date(d).toLocaleDateString('es-DO', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
function fechaHora(d: Date) {
  return new Date(d).toLocaleString('es-DO', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Colores/labels para estados de e-CF
const ESTADO_META: Record<string, { label: string; dot: string; text: string }> = {
  ACEPTADO:              { label: 'Aceptado',       dot: 'bg-green-500',  text: 'text-green-700' },
  ACEPTADO_CONDICIONAL: { label: 'Ac. condicional', dot: 'bg-emerald-400', text: 'text-emerald-700' },
  EN_PROCESO:           { label: 'En proceso',      dot: 'bg-amber-400',  text: 'text-amber-700' },
  RECHAZADO:            { label: 'Rechazado',       dot: 'bg-red-500',    text: 'text-red-700' },
  BORRADOR:             { label: 'Borrador',        dot: 'bg-gray-300',   text: 'text-gray-500' },
  ANULADO:              { label: 'Anulado',         dot: 'bg-gray-400',   text: 'text-gray-600' },
};

export default async function AdminDashboard() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [
    usersAgg,
    teamsAgg,
    ecfByEstado,
    ecfByTipo,
    ecfMonthAgg,
    topEmpresas,
    memberCounts,
    recentTeams,
    recentUsers,
    recentActivity,
    certsExpiring,
  ] = await Promise.all([
    // Usuarios: total, verificados, con 2FA
    db
      .select({
        total: count(),
        verificados: sql<number>`count(*) filter (where ${users.emailVerified})`,
        con2fa: sql<number>`count(*) filter (where ${users.twoFactorEnabled})`,
        nuevosMes: sql<number>`count(*) filter (where ${users.createdAt} >= ${startOfMonth})`,
      })
      .from(users),

    // Empresas: total + adopción de módulos + habilitación DGII
    db
      .select({
        total: count(),
        habilitadas: sql<number>`count(*) filter (where ${teams.habilitacionCompletadoAt} is not null)`,
        registradasEcf: sql<number>`count(*) filter (where ${teams.ecfCodigoPublico} is not null)`,
        pos: sql<number>`count(*) filter (where ${teams.posHabilitado})`,
        caja: sql<number>`count(*) filter (where ${teams.cajaHabilitada})`,
        escolar: sql<number>`count(*) filter (where ${teams.posEscolarHabilitado})`,
        recargo: sql<number>`count(*) filter (where ${teams.recargoMoraActivo})`,
        nuevasMes: sql<number>`count(*) filter (where ${teams.createdAt} >= ${startOfMonth})`,
      })
      .from(teams),

    // e-CF agrupados por estado
    db
      .select({ estado: ecfDocuments.estado, c: count() })
      .from(ecfDocuments)
      .groupBy(ecfDocuments.estado),

    // Documentos por tipo (ventas contabilizables, incl. tickets sin-ncf) con monto
    db
      .select({
        tipo: ecfDocuments.tipoEcf,
        c: count(),
        monto: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}),0)`,
      })
      .from(ecfDocuments)
      .where(VENTA)
      .groupBy(ecfDocuments.tipoEcf),

    // Agregados globales del mes / hoy sobre e-CF emitidos
    db
      .select({
        emitidosMes: sql<number>`count(*) filter (where ${VENTA} and ${ecfDocuments.createdAt} >= ${startOfMonth})`,
        montoMes: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}) filter (where ${VENTA} and ${ecfDocuments.createdAt} >= ${startOfMonth}),0)`,
        itbisMes: sql<number>`coalesce(sum(${ecfDocuments.totalItbis}) filter (where ${VENTA} and ${ecfDocuments.createdAt} >= ${startOfMonth}),0)`,
        emitidosHoy: sql<number>`count(*) filter (where ${VENTA} and ${ecfDocuments.createdAt} >= ${startOfDay})`,
        montoTotalHist: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}) filter (where ${VENTA}),0)`,
        empresasFacturandoMes: sql<number>`count(distinct ${ecfDocuments.teamId}) filter (where ${VENTA} and ${ecfDocuments.createdAt} >= ${startOfMonth})`,
      })
      .from(ecfDocuments),

    // Top empresas por facturación del mes
    db
      .select({
        teamId: ecfDocuments.teamId,
        name: teams.name,
        razonSocial: teams.razonSocial,
        rnc: teams.rnc,
        c: count(),
        monto: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}),0)`,
      })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(and(VENTA, gte(ecfDocuments.createdAt, startOfMonth)))
      .groupBy(ecfDocuments.teamId, teams.name, teams.razonSocial, teams.rnc)
      .orderBy(desc(sql`coalesce(sum(${ecfDocuments.montoTotal}),0)`))
      .limit(10),

    // Miembros por empresa
    db
      .select({ teamId: teamMembers.teamId, c: count() })
      .from(teamMembers)
      .groupBy(teamMembers.teamId),

    // Empresas nuevas
    db
      .select({ id: teams.id, name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc, createdAt: teams.createdAt })
      .from(teams)
      .orderBy(desc(teams.createdAt))
      .limit(6),

    // Usuarios nuevos
    db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, verified: users.emailVerified })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(6),

    // Actividad reciente (todas las empresas)
    db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        timestamp: activityLogs.timestamp,
        userName: users.name,
        userEmail: users.email,
        teamName: teams.name,
        teamRazon: teams.razonSocial,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.userId))
      .leftJoin(teams, eq(teams.id, activityLogs.teamId))
      .orderBy(desc(activityLogs.timestamp))
      .limit(12),

    // Certificados digitales por vencer (próximos 60 días)
    db
      .select({ id: teams.id, name: teams.name, razonSocial: teams.razonSocial, vence: teams.certVencimiento })
      .from(teams)
      .where(and(sql`${teams.certVencimiento} is not null`, sql`${teams.certVencimiento} <= ${in60Days}`))
      .orderBy(teams.certVencimiento)
      .limit(8),
  ]);

  const u = usersAgg[0];
  const t = teamsAgg[0];
  const e = ecfMonthAgg[0];
  const memberMap = Object.fromEntries(memberCounts.map(r => [r.teamId, n(r.c)]));

  const totalEcf = ecfByEstado.reduce((a, r) => a + n(r.c), 0);
  const estadoMax = Math.max(1, ...ecfByEstado.map(r => n(r.c)));
  const tipoMax = Math.max(1, ...ecfByTipo.map(r => n(r.c)));

  // KPIs principales
  const kpis = [
    { label: 'Empresas', value: num(n(t.total)), sub: `${num(n(t.habilitadas))} habilitadas DGII`, icon: Building2, color: 'text-teal-600', bg: 'bg-teal-50', href: '/admin/empresas' },
    { label: 'Usuarios', value: num(n(u.total)), sub: `${num(n(u.verificados))} verificados`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: '/admin/usuarios' },
    { label: 'e-CF emitidos (mes)', value: num(n(e.emitidosMes)), sub: `${num(totalEcf)} en total`, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Facturado (mes)', value: money(n(e.montoMes)), sub: `ITBIS ${money(n(e.itbisMes))}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const kpis2 = [
    { label: 'e-CF hoy', value: num(n(e.emitidosHoy)), icon: Calendar, color: 'text-indigo-600' },
    { label: 'Empresas facturando (mes)', value: num(n(e.empresasFacturandoMes)), icon: TrendingUp, color: 'text-teal-600' },
    { label: 'Ticket promedio (mes)', value: n(e.emitidosMes) > 0 ? money(n(e.montoMes) / n(e.emitidosMes)) : money(0), icon: Receipt, color: 'text-amber-600' },
    { label: 'Facturado histórico', value: money(n(e.montoTotalHist)), icon: DollarSign, color: 'text-green-600' },
    { label: 'Usuarios con 2FA', value: `${num(n(u.con2fa))} / ${num(n(u.total))}`, icon: ShieldCheck, color: 'text-emerald-600' },
    { label: 'Registradas en ecf-api', value: num(n(t.registradasEcf)), icon: BadgeCheck, color: 'text-cyan-600' },
    { label: 'Nuevas empresas (mes)', value: num(n(t.nuevasMes)), icon: Building2, color: 'text-teal-600' },
    { label: 'Nuevos usuarios (mes)', value: num(n(u.nuevosMes)), icon: UserPlus, color: 'text-blue-600' },
  ];

  // Adopción de módulos
  const modulos = [
    { label: 'Punto de Venta (POS)', value: n(t.pos), icon: Store, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Cuadre de Caja', value: n(t.caja), icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'POS Escolar', value: n(t.escolar), icon: GraduationCap, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'Recargo por mora', value: n(t.recargo), icon: Percent, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de control</h1>
          <p className="text-sm text-gray-500">
            Vista global de todas las empresas · {fecha(now)}
          </p>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => {
          const Card = (
            <div className="rounded-xl bg-white border border-gray-200 p-5 h-full hover:border-gray-300 transition-colors">
              <div className="flex items-center justify-between">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${k.bg}`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-3 tabular-nums">{k.value}</p>
              <p className="text-sm text-gray-500">{k.label}</p>
              <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
            </div>
          );
          return k.href ? (
            <Link key={k.label} href={k.href}>{Card}</Link>
          ) : (
            <div key={k.label}>{Card}</div>
          );
        })}
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis2.map(k => (
          <div key={k.label} className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-center gap-3">
            <k.icon className={`w-5 h-5 shrink-0 ${k.color}`} />
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900 tabular-nums truncate">{k.value}</p>
              <p className="text-xs text-gray-400 truncate">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* e-CF por estado + por tipo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">e-CF por estado</h2>
          <div className="space-y-3">
            {ecfByEstado
              .sort((a, b) => n(b.c) - n(a.c))
              .map(r => {
                const meta = ESTADO_META[r.estado] ?? { label: r.estado, dot: 'bg-gray-300', text: 'text-gray-600' };
                return (
                  <div key={r.estado} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-36 shrink-0">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${(n(r.c) / estadoMax) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-16 text-right tabular-nums">{num(n(r.c))}</span>
                  </div>
                );
              })}
            {ecfByEstado.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
          </div>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">e-CF emitidos por tipo</h2>
          <div className="space-y-3">
            {ecfByTipo
              .sort((a, b) => n(b.c) - n(a.c))
              .map(r => (
                <div key={r.tipo} className="flex items-center gap-3">
                  <div className="w-40 shrink-0">
                    <span className="text-xs font-mono text-gray-400">{r.tipo}</span>
                    <span className="text-xs text-gray-600 ml-1">
                      {(TIPOS_ECF as Record<string, string>)[r.tipo]?.replace(' Electrónica', '') ?? 'Otro'}
                    </span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-purple-400" style={{ width: `${(n(r.c) / tipoMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-14 text-right tabular-nums">{num(n(r.c))}</span>
                  <span className="text-xs text-gray-400 w-24 text-right tabular-nums">{money(n(r.monto))}</span>
                </div>
              ))}
            {ecfByTipo.length === 0 && <p className="text-sm text-gray-400">Sin e-CF emitidos aún</p>}
          </div>
        </div>
      </div>

      {/* Adopción de módulos */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Adopción de módulos (empresas activas)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {modulos.map(m => (
            <div key={m.label} className={`rounded-xl border border-gray-200 p-4 ${m.bg}`}>
              <m.icon className={`w-5 h-5 ${m.color}`} />
              <p className="text-2xl font-bold text-gray-900 mt-2 tabular-nums">{num(m.value)}</p>
              <p className="text-xs text-gray-500">{m.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {n(t.total) > 0 ? Math.round((m.value / n(t.total)) * 100) : 0}% de empresas
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Top empresas por facturación del mes */}
      <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-gray-700">Top empresas por facturación del mes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Empresa</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Usuarios</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">e-CF mes</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">Facturado</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topEmpresas.map((r, i) => (
                <tr key={r.teamId} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{r.razonSocial ?? r.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.rnc ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{num(memberMap[r.teamId] ?? 0)}</td>
                  <td className="px-5 py-3 text-right text-gray-600 tabular-nums">{num(n(r.c))}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums">{money(n(r.monto))}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/empresas/${r.teamId}`} className="text-xs text-teal-600 hover:text-teal-800 font-medium">Ver →</Link>
                  </td>
                </tr>
              ))}
              {topEmpresas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                    Ninguna empresa ha facturado este mes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certificados por vencer */}
      {certsExpiring.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Certificados digitales por vencer (60 días)</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {certsExpiring.map(c => (
              <Link
                key={c.id}
                href={`/admin/empresas/${c.id}`}
                className="flex items-center justify-between bg-white rounded-lg border border-amber-100 px-3 py-2 hover:border-amber-300"
              >
                <span className="text-sm text-gray-800 truncate">{c.razonSocial ?? c.name}</span>
                <span className="text-xs font-medium text-amber-700 shrink-0 ml-2">{c.vence ? fecha(c.vence) : '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recientes: empresas + usuarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-semibold text-gray-700">Empresas nuevas</h2>
            </div>
            <Link href="/admin/empresas" className="text-xs text-teal-600 hover:text-teal-800">Ver todas</Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {recentTeams.map(r => (
              <li key={r.id}>
                <Link href={`/admin/empresas/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{r.razonSocial ?? r.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.rnc ?? 'Sin RNC'}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">{fecha(r.createdAt)}</span>
                </Link>
              </li>
            ))}
            {recentTeams.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-400">Sin empresas</li>}
          </ul>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-700">Usuarios nuevos</h2>
            </div>
            <Link href="/admin/usuarios" className="text-xs text-blue-600 hover:text-blue-800">Ver todos</Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {recentUsers.map(r => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.name ?? '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{r.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {r.verified && <BadgeCheck className="w-3.5 h-3.5 text-green-500" />}
                  <span className="text-xs text-gray-400">{fecha(r.createdAt)}</span>
                </div>
              </li>
            ))}
            {recentUsers.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-400">Sin usuarios</li>}
          </ul>
        </div>
      </div>

      {/* Actividad reciente global */}
      <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Actividad reciente (todas las empresas)</h2>
        </div>
        <ul className="divide-y divide-gray-50">
          {recentActivity.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
              <span className="text-gray-700 truncate flex-1">{a.action}</span>
              <span className="text-xs text-gray-500 truncate max-w-[160px] hidden sm:block">
                {a.teamRazon ?? a.teamName ?? '—'}
              </span>
              <span className="text-xs text-gray-400 truncate max-w-[160px] hidden md:block">
                {a.userName ?? a.userEmail ?? 'Sistema'}
              </span>
              <span className="text-xs text-gray-400 shrink-0 w-28 text-right">{fechaHora(a.timestamp)}</span>
            </li>
          ))}
          {recentActivity.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-400">Sin actividad registrada</li>}
        </ul>
      </div>
    </div>
  );
}
