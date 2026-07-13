import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { me } from '@/lib/ecf-api/client';
import { Wifi, WifiOff } from 'lucide-react';

async function fetchEcfApiMe() {
  try {
    return await me();
  } catch (e) {
    console.error('[admin layout] ecf-api /me error:', e);
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') {
    redirect('/dashboard');
  }

  const ecfMe = await fetchEcfApiMe();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="h-7 w-7 bg-teal-500 rounded-lg flex items-center justify-center">
            <span className="font-black text-xs text-white">z</span>
          </div>
          <span className="font-bold text-sm sm:text-base">Zero Admin</span>
        </div>
        <nav className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm overflow-x-auto -mx-1 px-1 sm:ml-2 order-3 sm:order-2 w-full sm:w-auto">
          <a href="/admin" className="text-gray-300 hover:text-white whitespace-nowrap">Dashboard</a>
          <a href="/admin/usuarios" className="text-gray-300 hover:text-white whitespace-nowrap">Usuarios</a>
          <a href="/admin/empresas" className="text-gray-300 hover:text-white whitespace-nowrap">Empresas</a>
          <a href="/admin/logs" className="text-gray-300 hover:text-white whitespace-nowrap">Logs</a>
        </nav>
        <a href="/dashboard" className="ml-auto text-xs sm:text-sm text-gray-400 hover:text-white whitespace-nowrap order-2 sm:order-3">← App</a>
      </header>

      {/* Banner conexión ecf-api */}
      {ecfMe ? (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2 text-xs text-emerald-800 flex items-center gap-3 flex-wrap">
          <Wifi className="w-3.5 h-3.5" />
          <span>
            <strong>ecf-api</strong> · {ecfMe.empresa.nombre}
            <span className="text-emerald-600"> · key:</span> {ecfMe.apiKey.nombre}
            <span className="text-emerald-600"> · ambiente:</span> {ecfMe.software.ambienteDefault}
            {ecfMe.apiKey.esAdmin && (
              <span className="ml-2 px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold">ADMIN</span>
            )}
          </span>
          <span className="ml-auto text-emerald-600">
            {ecfMe.software.nombre} v{ecfMe.software.version}
          </span>
        </div>
      ) : (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-800 flex items-center gap-3">
          <WifiOff className="w-3.5 h-3.5" />
          <strong>ecf-api inalcanzable</strong>
          <span className="text-red-600">
            Verifica <code className="bg-red-100 px-1 rounded">ECF_API_URL</code> y{' '}
            <code className="bg-red-100 px-1 rounded">ECF_API_KEY</code> en .env
          </span>
        </div>
      )}

      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
