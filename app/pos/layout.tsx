export const metadata = { title: 'Punto de venta' };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  // El <Toaster> vive en el layout raíz (app/layout.tsx). No montar otro aquí:
  // duplicaba cada notificación (salían dos toasts por acción).
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {children}
    </div>
  );
}
