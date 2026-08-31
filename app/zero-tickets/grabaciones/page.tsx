'use client';

import { useEffect, useState } from 'react';

interface GrabacionRow {
  id: number;
  role: 'user' | 'agent';
  duracionSegundos: number;
  createdAt: string;
  ticketId: number;
  userName: string | null;
  userEmail: string;
}

function formatearDuracion(seg: number): string {
  const min = Math.floor(seg / 60);
  const s = seg % 60;
  return min > 0 ? `${min}m ${s}s` : `${s}s`;
}

export default function ZeroTicketsGrabacionesPage() {
  const [grabaciones, setGrabaciones] = useState<GrabacionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/zero-tickets/agent/recordings');
        setGrabaciones(res.ok ? (await res.json()).recordings : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4">
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-bold text-gray-900">Grabaciones ({grabaciones.length})</div>
        {loading ? (
          <div className="p-4 text-sm text-gray-400">Cargando...</div>
        ) : grabaciones.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">Ninguna grabación todavía.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Hora</th>
                <th className="px-4 py-2 font-medium">Usuario</th>
                <th className="px-4 py-2 font-medium">Lado</th>
                <th className="px-4 py-2 font-medium">Duración</th>
                <th className="px-4 py-2 font-medium">Ticket</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {grabaciones.map((g) => {
                const fecha = new Date(g.createdAt);
                return (
                  <tr key={g.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{fecha.toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-gray-700">{fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2 text-gray-900">{g.userName ?? g.userEmail}</td>
                    <td className="px-4 py-2 text-gray-700">{g.role === 'agent' ? 'Agente' : 'Cliente'}</td>
                    <td className="px-4 py-2 text-gray-700">{formatearDuracion(g.duracionSegundos)}</td>
                    <td className="px-4 py-2 text-gray-500">#{g.ticketId}</td>
                    <td className="px-4 py-2">
                      <a
                        href={`/api/zero-tickets/agent/recordings/${g.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#3658e1] hover:underline"
                      >
                        Reproducir
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
