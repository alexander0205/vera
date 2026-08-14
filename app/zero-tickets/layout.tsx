import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';

export default async function ZeroTicketsLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-4">
        <div className="h-7 w-7 bg-teal-500 rounded-lg flex items-center justify-center">
          <span className="font-black text-xs text-white">z</span>
        </div>
        <span className="font-bold text-sm sm:text-base">Zero Tickets</span>
        <a href="/dashboard" className="ml-auto text-xs sm:text-sm text-gray-400 hover:text-white">← App</a>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
