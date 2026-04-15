'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Key, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ApiKeyRow {
  id: number;
  nombre: string;
  keyPrefix: string;
  permisos: string;
  ultimoUsoAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [nombre, setNombre] = useState('');
  const [permisos, setPermisos] = useState('read');
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetch('/api/api-keys').then(r => r.json()).then(setKeys); }, []);

  async function create() {
    setLoading(true);
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, permisos }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewKey(data.rawKey);
      setKeys(k => [...k, data]);
      setNombre(''); setShowNew(false);
    } else {
      toast.error(data.error ?? 'Error creando API key');
    }
    setLoading(false);
  }

  async function revoke(id: number) {
    if (!confirm('¿Revocar esta API key? Esta acción no se puede deshacer.')) return;
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    setKeys(k => k.filter(x => x.id !== id));
    toast.success('API key revocada');
  }

  function copy() {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">Integra EmiteDO con tus sistemas externos</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-700 font-medium">
          <Plus className="h-4 w-4" /> Nueva Key
        </button>
      </div>

      {newKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Copia esta clave ahora — no se volverá a mostrar
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
            <code className="flex-1 text-xs font-mono text-gray-800 break-all">{newKey}</code>
            <button onClick={copy} className="shrink-0 text-gray-500 hover:text-gray-700">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button onClick={() => setNewKey('')} className="text-xs text-amber-600 hover:underline">
            Ya la copié, cerrar
          </button>
        </div>
      )}

      {showNew && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Nueva API Key</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / descripción</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Integración ERP interno"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Permisos</label>
            <select value={permisos} onChange={e => setPermisos(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="read">Solo lectura</option>
              <option value="write">Lectura + escritura</option>
              <option value="full">Acceso completo</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={create} disabled={loading || !nombre}
              className="bg-teal-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
              {loading ? 'Generando...' : 'Generar key'}
            </button>
            <button onClick={() => setShowNew(false)}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {keys.length === 0 ? (
          <div className="py-16 text-center">
            <Key className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay API keys creadas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Prefijo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Permisos</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Último uso</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{k.nombre}</td>
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs bg-gray-100 rounded px-2 py-0.5">{k.keyPrefix}...</code>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                      {k.permisos}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400 hidden md:table-cell">
                    {k.ultimoUsoAt ? new Date(k.ultimoUsoAt).toLocaleDateString('es-DO') : 'Nunca'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => revoke(k.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
