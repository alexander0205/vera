import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    redirect('/dashboard');
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center gap-4">
        <div className="h-7 w-7 bg-teal-500 rounded-lg flex items-center justify-center">
          <span className="font-black text-xs text-white">e</span>
        </div>
        <span className="font-bold">EmiteDO Admin</span>
        <nav className="flex items-center gap-4 ml-6 text-sm">
          <a href="/admin" className="text-gray-300 hover:text-white">Dashboard</a>
          <a href="/admin/usuarios" className="text-gray-300 hover:text-white">Usuarios</a>
          <a href="/admin/empresas" className="text-gray-300 hover:text-white">Empresas</a>
          <a href="/admin/logs" className="text-gray-300 hover:text-white">Logs</a>
        </nav>
        <a href="/dashboard" className="ml-auto text-sm text-gray-400 hover:text-white">← App</a>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
