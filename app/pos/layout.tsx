import { Toaster } from 'sonner';

export const metadata = { title: 'Punto de venta' };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {children}
      <Toaster position="top-center" richColors />
    </div>
  );
}
