import type { LucideIcon } from 'lucide-react';

interface EstadoVacioModuloProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EstadoVacioModulo({ icon: Icon, title, description }: EstadoVacioModuloProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-24 px-6 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
      <div className="h-12 w-12 rounded-full bg-teal-50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-teal-600" />
      </div>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 max-w-sm">{description}</p>
    </div>
  );
}
