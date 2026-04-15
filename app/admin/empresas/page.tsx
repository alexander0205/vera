import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { desc, count, eq } from 'drizzle-orm';
import { Building2 } from 'lucide-react';

export default async function AdminEmpresasPage() {
  const allTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      rnc: teams.rnc,
      razonSocial: teams.razonSocial,
      planName: teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      createdAt: teams.createdAt,
    })
    .from(teams)
    .orderBy(desc(teams.createdAt))
    .limit(500);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Empresas ({allTeams.length})</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {allTeams.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay empresas registradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">RNC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Suscripción</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allTeams.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    {t.razonSocial && <p className="text-xs text-gray-400">{t.razonSocial}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.rnc ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                      {t.planName ?? 'Gratis'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.subscriptionStatus ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.subscriptionStatus === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {t.subscriptionStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleDateString('es-DO')}
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
