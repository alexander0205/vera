'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Zap, ToggleLeft, ToggleRight, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const EVENTOS_OPTIONS = ['ecf.emitido', 'ecf.anulado', 'ecf.aceptado', 'ecf.rechazado', 'pago.registrado'];

interface Webhook {
  id: number; nombre: string; url: string; secret: string;
  eventos: string; activo: boolean; ultimoDisparo: string | null;
  ultimoEstatus: number | null;
}

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nombre: '', url: '', eventos: ['ecf.emitido'] });
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => { fetch('/api/webhooks').then(r => r.json()).then(setHooks); }, []);

  async function create() {
    setLoading(true);
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setHooks(h => [...h, data]);
      setForm({ nombre: '', url: '', eventos: ['ecf.emitido'] });
      setShowNew(false);
      toast.success('Webhook creado');
    } else {
      toast.error(data.error ?? 'Error');
    }
    setLoading(false);
  }

  async function toggle(hook: Webhook) {
    await fetch(`/api/webhooks/${hook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !hook.activo }),
    });
    setHooks(h => h.map(x => x.id === hook.id ? { ...x, activo: !x.activo } : x));
  }

  async function remove(id: number) {
    if (!confirm('¿Eliminar este webhook?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    setHooks(h => h.filter(x => x.id !== id));
    toast.success('Webhook eliminado');
  }

  function copySecret(hook: Webhook) {
    navigator.clipboard.writeText(hook.secret);
    setCopiedId(hook.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">Notifica a tus sistemas cuando ocurran eventos en EmiteDO</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-700 font-medium">
          <Plus className="h-4 w-4" /> Nuevo Webhook
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Nuevo Webhook</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: ERP de ventas"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL de destino</label>
            <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://tusistema.com/webhooks/emitedo"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Eventos</label>
            <div className="space-y-2">
              {EVENTOS_OPTIONS.map(e => (
                <label key={e} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox"
                    checked={form.eventos.includes(e)}
                    onChange={() => setForm(f => ({
                      ...f,
                      eventos: f.eventos.includes(e) ? f.eventos.filter(x => x !== e) : [...f.eventos, e],
                    }))}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{e}</code>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={create} disabled={loading || !form.nombre || !form.url || form.eventos.length === 0}
              className="bg-teal-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
              {loading ? 'Guardando...' : 'Crear webhook'}
            </button>
            <button onClick={() => setShowNew(false)}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {hooks.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <Zap className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay webhooks configurados</p>
          </div>
        ) : hooks.map(hook => (
          <div key={hook.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{hook.nombre}</p>
                <p className="text-xs text-gray-400 truncate max-w-sm">{hook.url}</p>
              </div>
              <div className="flex items-center gap-2">
                {hook.ultimoEstatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${hook.ultimoEstatus >= 200 && hook.ultimoEstatus < 300 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {hook.ultimoEstatus}
                  </span>
                )}
                <button onClick={() => toggle(hook)} className="text-gray-400 hover:text-teal-600">
                  {hook.activo ? <ToggleRight className="h-6 w-6 text-teal-500" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
                <button onClick={() => remove(hook.id)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>Eventos: <span className="font-mono text-gray-600">{hook.eventos}</span></span>
              <button onClick={() => copySecret(hook)} className="flex items-center gap-1 hover:text-gray-600">
                {copiedId === hook.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copiedId === hook.id ? 'Copiado' : 'Copiar secret'}
              </button>
              {hook.ultimoDisparo && (
                <span>Último: {new Date(hook.ultimoDisparo).toLocaleDateString('es-DO')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
