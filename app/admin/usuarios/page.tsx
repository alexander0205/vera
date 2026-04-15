import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export default async function AdminUsuariosPage() {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(500);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Usuarios ({allUsers.length})</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email verificado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">2FA</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allUsers.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.emailVerified ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.emailVerified ? 'Verificado' : 'Pendiente'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.twoFactorEnabled ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.twoFactorEnabled ? 'Activo' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{u.role}</td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(u.createdAt).toLocaleDateString('es-DO')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
