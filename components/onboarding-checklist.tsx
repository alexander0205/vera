'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, Circle, X, ChevronDown, ChevronUp } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

interface OnboardingData {
  tieneCertificado: boolean;
  tieneSecuencias: boolean;
  tieneClientes: boolean;
  tieneFacturas: boolean;
  perfilCompleto: boolean;
}

export function OnboardingChecklist() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('onboarding_dismissed');
    if (saved === 'true') { setDismissed(true); return; }
    fetch('/api/onboarding/status').then(r => r.json()).then(setData).catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem('onboarding_dismissed', 'true');
    setDismissed(true);
  }

  if (dismissed || !data) return null;

  const items: ChecklistItem[] = [
    {
      id: 'perfil',
      label: 'Completa el perfil de tu empresa',
      description: 'Agrega RNC, dirección y logo',
      href: '/dashboard/configuracion',
      done: data.perfilCompleto,
    },
    {
      id: 'certificado',
      label: 'Sube tu certificado P12',
      description: 'Necesario para firmar comprobantes digitales',
      href: '/dashboard/certificado',
      done: data.tieneCertificado,
    },
    {
      id: 'secuencias',
      label: 'Registra tus secuencias de e-NCF',
      description: 'Solicítalas en la OVTT de la DGII',
      href: '/dashboard/secuencias',
      done: data.tieneSecuencias,
    },
    {
      id: 'clientes',
      label: 'Agrega tu primer cliente',
      description: 'Para poder emitir facturas rápido',
      href: '/dashboard/clientes',
      done: data.tieneClientes,
    },
    {
      id: 'facturas',
      label: 'Emite tu primer comprobante',
      description: '¡Ya estás listo para facturar!',
      href: '/dashboard/facturas/nueva',
      done: data.tieneFacturas,
    },
  ];

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;

  if (allDone) {
    dismiss();
    return null;
  }

  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="bg-white border border-teal-200 rounded-xl shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-teal-50">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-teal-900">Configuración inicial — {doneCount}/{items.length} completados</p>
            <div className="mt-1 h-1.5 bg-teal-200 rounded-full w-48">
              <div className="h-1.5 bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed(c => !c)} className="text-teal-600 hover:text-teal-800">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button onClick={dismiss} className="text-teal-400 hover:text-teal-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="divide-y divide-gray-100">
          {items.map(item => (
            <div key={item.id} className={`flex items-center gap-4 px-5 py-3 ${item.done ? 'opacity-60' : ''}`}>
              {item.done
                ? <CheckCircle className="h-5 w-5 text-teal-500 shrink-0" />
                : <Circle className="h-5 w-5 text-gray-300 shrink-0" />
              }
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {item.label}
                </p>
                <p className="text-xs text-gray-400">{item.description}</p>
              </div>
              {!item.done && (
                <Link href={item.href}
                  className="text-xs font-medium text-teal-600 hover:text-teal-800 border border-teal-200 px-3 py-1 rounded-lg hover:bg-teal-50">
                  Ir →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
