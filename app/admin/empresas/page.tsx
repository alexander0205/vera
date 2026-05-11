import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users, ecfDocuments } from '@/lib/db/schema';
import { desc, count, eq } from 'drizzle-orm';
import { Building2, Plus, Users } from 'lucide-react';
import Link from 'next/link';

export default async function AdminEmpresasPage() {
  const allTeams = await db
    .select({
      id:                 teams.id,
      name:               teams.name,
      rnc:                teams.rnc,
      razonSocial:        teams.razonSocial,
      dgiiEnvironment:    teams.dgiiEnvironment,
      planName:           teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      createdAt:          teams.createdAt,
    })
    .from(teams)
    .orderBy(desc(teams.createdAt))
    .limit(500);

  // Contar miembros y facturas por team
  const memberCounts = await db
    .select({ teamId: teamMembers.teamId, c: count() })
    .from(teamMembers)
    .groupBy(teamMembers.teamId);

  const docCounts = await db
    .select({ teamId: ecfDocuments.teamId, c: count() })
    .from(ecfDocuments)
    .groupBy(ecfDocuments.teamId);

  const memberMap = Object.fromEntries(memberCounts.map(r => [r.teamId, r.c]));
  const docMap    = Object.fromEntries(docCounts.map(r => [r.teamId, r.c]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Empresas ({allTeams.length})
        </h1>
        <Link
          href="/admin/empresas/nueva"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva empresa
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {allTeams.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">No hay empresas registradas</p>
            <Link
              href="/admin/empresas/nueva"
              className="inline-flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" /> Crear primera empresa
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">RNC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ambiente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Usuarios</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Facturas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allTeams.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{t.razonSocial ?? t.name}</p>
                    {t.razonSocial && t.razonSocial !== t.name && (
                      <p className="text-xs text-gray-400">{t.name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.rnc ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.dgiiEnvironment === 'Produccion'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {t.dgiiEnvironment ?? 'TesteCF'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-600">
                      <Users className="w-3 h-3" />
                      {memberMap[t.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{(docMap[t.id] ?? 0).toLocaleString('es-DO')}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleDateString('es-DO')}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/empresas/${t.id}`}
                      className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
