import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { Receipt, LogOut } from 'lucide-react';

export default async function LiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const team = await getTeamForUser();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/lite" className="flex items-center gap-2 font-semibold min-w-0">
            <Receipt className="w-5 h-5 text-orange-600 flex-shrink-0" />
            <span className="truncate">{team?.razonSocial ?? team?.name ?? 'Factura'}</span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4 text-sm text-gray-600 flex-shrink-0">
            <span className="hidden sm:inline truncate max-w-[180px]">{user.email}</span>
            <Link
              href="/sign-out"
              className="flex items-center gap-1 hover:text-gray-900 p-1"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
