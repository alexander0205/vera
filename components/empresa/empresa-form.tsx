'use client';

/**
 * Formulario de configuración de empresa.
 * Reusable: lo usa Lite y (eventualmente) el dashboard Full.
 *
 * Lee/guarda vía /api/equipo/perfil (GET/POST).
 * Recibe los datos iniciales como prop para evitar un fetch extra (los lee
 * el server en la página padre y los pasa renderizados).
 */

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface EmpresaData {
  razonSocial?:      string | null;
  nombreComercial?:  string | null;
  rnc?:              string | null;
  direccion?:        string | null;
  telefono?:         string | null;
  emailFacturacion?: string | null;
  sitioWeb?:         string | null;
}

export function EmpresaForm({ initial }: { initial: EmpresaData }) {
  const [data, setData]     = useState<EmpresaData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  function set<K extends keyof EmpresaData>(k: K, v: EmpresaData[K]) {
    setData(d => ({ ...d, [k]: v }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res  = await fetch('/api/equipo/perfil', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar');
        return;
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Datos de tu empresa</h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Esta información aparece en cada factura emitida.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Razón social" required>
          <input
            type="text"
            value={data.razonSocial ?? ''}
            onChange={e => set('razonSocial', e.target.value)}
            className="input"
            placeholder="Mi Empresa SRL"
          />
        </Field>

        <Field label="Nombre comercial">
          <input
            type="text"
            value={data.nombreComercial ?? ''}
            onChange={e => set('nombreComercial', e.target.value)}
            className="input"
            placeholder="Mi Empresa"
          />
        </Field>

        <Field label="RNC" required>
          <input
            type="text"
            inputMode="numeric"
            value={data.rnc ?? ''}
            onChange={e => set('rnc', e.target.value)}
            className="input"
            placeholder="131988032"
            maxLength={11}
          />
        </Field>

        <Field label="Teléfono">
          <input
            type="tel"
            value={data.telefono ?? ''}
            onChange={e => set('telefono', e.target.value)}
            className="input"
            placeholder="809-555-0001"
          />
        </Field>

        <Field label="Dirección" className="md:col-span-2">
          <input
            type="text"
            value={data.direccion ?? ''}
            onChange={e => set('direccion', e.target.value)}
            className="input"
            placeholder="Calle, número, sector, ciudad"
          />
        </Field>

        <Field label="Email de facturación">
          <input
            type="email"
            value={data.emailFacturacion ?? ''}
            onChange={e => set('emailFacturacion', e.target.value)}
            className="input"
            placeholder="facturas@miempresa.com"
          />
        </Field>

        <Field label="Sitio web">
          <input
            type="url"
            value={data.sitioWeb ?? ''}
            onChange={e => set('sitioWeb', e.target.value)}
            className="input"
            placeholder="https://miempresa.com"
          />
        </Field>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Cambios guardados.</span>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-orange-600 text-white font-medium rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
          ) : 'Guardar cambios'}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          font-size: 1rem;
          border: 1px solid rgb(209 213 219);
          border-radius: 0.375rem;
        }
        @media (min-width: 768px) {
          .input { font-size: 0.875rem; }
        }
        .input:focus {
          outline: none;
          border-color: rgb(249 115 22);
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children, className = '' }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
