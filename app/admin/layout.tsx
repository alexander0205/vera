import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    redirect('/dashboard');
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="h-7 w-7 bg-teal-500 rounded-lg flex items-center justify-center">
            <span className="font-black text-xs text-white">e</span>
          </div>
          <span className="font-bold text-sm sm:text-base">EmiteDO Admin</span>
        </div>
        <nav className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm overflow-x-auto -mx-1 px-1 sm:ml-2 order-3 sm:order-2 w-full sm:w-auto">
          <a href="/admin" className="text-gray-300 hover:text-white whitespace-nowrap">Dashboard</a>
          <a href="/admin/usuarios" className="text-gray-300 hover:text-white whitespace-nowrap">Usuarios</a>
          <a href="/admin/empresas" className="text-gray-300 hover:text-white whitespace-nowrap">Empresas</a>
          <a href="/admin/logs" className="text-gray-300 hover:text-white whitespace-nowrap">Logs</a>
        </nav>
        <a href="/dashboard" className="ml-auto text-xs sm:text-sm text-gray-400 hover:text-white whitespace-nowrap order-2 sm:order-3">← App</a>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
