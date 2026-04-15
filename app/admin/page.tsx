import { db } from '@/lib/db/drizzle';
import { users, teams, ecfDocuments } from '@/lib/db/schema';
import { count, gte } from 'drizzle-orm';

export default async function AdminDashboard() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [totalUsers, totalTeams, totalDocs, docsMes] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(teams),
    db.select({ c: count() }).from(ecfDocuments),
    db.select({ c: count() }).from(ecfDocuments).where(gte(ecfDocuments.createdAt, startOfMonth)),
  ]);

  const stats = [
    { label: 'Usuarios registrados', value: totalUsers[0]?.c ?? 0, color: 'bg-blue-50 text-blue-700' },
    { label: 'Empresas (teams)', value: totalTeams[0]?.c ?? 0, color: 'bg-teal-50 text-teal-700' },
    { label: 'Total e-CF emitidos', value: totalDocs[0]?.c ?? 0, color: 'bg-purple-50 text-purple-700' },
    { label: 'e-CF este mes', value: docsMes[0]?.c ?? 0, color: 'bg-green-50 text-green-700' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`rounded-xl p-5 ${s.color} border border-current/10`}>
            <p className="text-3xl font-bold">{s.value.toLocaleString('es-DO')}</p>
            <p className="text-sm mt-1 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
