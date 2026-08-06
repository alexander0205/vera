'use client';

import { useState } from 'react';
import { Coins, Layers, Tag } from 'lucide-react';
import { EstructuraTree } from '@/components/administracion-escolar/EstructuraTree';
import { ConceptosPanel } from '@/components/administracion-escolar/ConceptosPanel';
import { ConceptosCatalogo } from '@/components/administracion-escolar/ConceptosCatalogo';

type TabKey = 'estructura' | 'conceptos' | 'tarifas';

const TABS: { key: TabKey; label: string; icon: typeof Layers; hint: string }[] = [
  { key: 'estructura', label: 'Estructura', icon: Layers, hint: 'Períodos, servicios (tandas), grados y secciones.' },
  { key: 'conceptos',  label: 'Conceptos',  icon: Tag, hint: 'Qué se cobra: tipo, ciclo de cobro y recordatorios.' },
  { key: 'tarifas',    label: 'Tarifas',    icon: Coins, hint: 'Cuánto cuesta cada concepto por servicio, grado o sección.' },
];

/**
 * Configuración escolar con sub-nav: Estructura · Conceptos · Tarifas.
 *
 * Conceptos y Tarifas estaban en la misma pantalla y son dos trabajos
 * distintos: definir qué se cobra se hace una vez al montar el colegio, y
 * ponerle precio a cada grado se repite cada año al subir la colegiatura.
 * Juntos obligaban a atravesar el árbol de grados para cambiar un nombre.
 */
export default function ConfiguracionEscolarClient() {
  const [tab, setTab] = useState<TabKey>('estructura');
  const activa = TABS.find((t) => t.key === tab)!;

  return (
    <section className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración escolar</h1>
        <p className="mt-1 text-sm text-gray-500">Solo administradores. {activa.hint}</p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                on ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'estructura' && <EstructuraTree />}
      {tab === 'conceptos' && <ConceptosCatalogo />}
      {tab === 'tarifas' && <ConceptosPanel />}
    </section>
  );
}
