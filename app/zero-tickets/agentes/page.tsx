'use client';

import { useEffect, useState } from 'react';

interface AgentRow {
  id: number;
  userId: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string;
  addedBy: number | null;
  addedByName: string | null;
  avgRating: number | null;
  ratingCount: number;
}

export default function ZeroTicketsAgentesPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // v1: sin buscador de usuarios, solo ID numérico directo. Sin autocomplete a propósito.
  const [newUserId, setNewUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAgents() {
    setLoading(true);
    try {
      const res = await fetch('/api/zero-tickets/agent-management');
      if (res.ok) setAgents((await res.json()).agents);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  async function addAgent() {
    const userId = Number(newUserId);
    if (!userId || !Number.isInteger(userId)) {
      setError('Ingresá un ID de usuario numérico válido.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/zero-tickets/agent-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo agregar el agente.');
      } else {
        setNewUserId('');
        await loadAgents();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(agent: AgentRow) {
    const res = await fetch('/api/zero-tickets/agent-management', {
      method: agent.active ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: agent.userId }),
    });
    if (!res.ok) {
      window.alert('No se pudo actualizar el agente.');
    }
    await loadAgents();
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <div className="border rounded-lg bg-white p-4">
        <div className="font-bold text-gray-900 mb-2">Agregar agente</div>
        <div className="flex gap-2 items-center">
          <input
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAgent()}
            placeholder="ID de usuario"
            inputMode="numeric"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={addAgent}
            disabled={adding}
            className="bg-teal-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-teal-700"
          >
            Agregar
          </button>
        </div>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-bold text-gray-900">Agentes ({agents.length})</div>
        {loading ? (
          <div className="p-4 text-sm text-gray-400">Cargando...</div>
        ) : agents.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">Ningún agente todavía.</div>
        ) : (
          agents.map((a) => (
            <div key={a.id} className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{a.userName ?? a.userEmail}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      a.active ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {a.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{a.userEmail}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {a.ratingCount > 0 ? `★ ${a.avgRating?.toFixed(1)} (${a.ratingCount})` : 'Sin calificaciones'}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  Agregado por {a.addedByName ?? '—'}
                </div>
              </div>
              <button
                onClick={() => toggleActive(a)}
                className={`text-xs px-3 py-1.5 rounded border shrink-0 ${
                  a.active
                    ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    : 'border-teal-600 text-teal-700 hover:bg-teal-50'
                }`}
              >
                {a.active ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
