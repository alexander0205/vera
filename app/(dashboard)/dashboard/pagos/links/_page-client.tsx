'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { toast } from 'sonner';
import { fmtMoneda } from '@/lib/factura/core';
import { Link2, Copy, Check, ExternalLink } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface LinkRow {
  token: string;
  url: string;
  provider: string;
  montoCentavos: number;
  estado: string;
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
  documento: string;
  cliente: string;
}

const PROVIDER_LABELS: Record<string, string> = { cardnet: 'CardNet', azul: 'Azul', simulador: 'Simulador' };

const ESTADO_STYLE: Record<string, string> = {
  pagado:     'bg-green-100 text-green-700',
  pendiente:  'bg-amber-100 text-amber-700',
  procesando: 'bg-blue-100 text-blue-700',
  fallido:    'bg-red-100 text-red-700',
  expirado:   'bg-gray-100 text-gray-500',
  cancelado:  'bg-gray-100 text-gray-500',
};

export default function LinksClient() {
  const { data } = useSWR<{ links: LinkRow[] }>('/api/pagos/link', fetcher, { refreshInterval: 5000 });
  const links = data?.links ?? [];
  const [copied, setCopied] = useState<string>('');

  function copiar(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url); toast.success('Link copiado'); setTimeout(() => setCopied(''), 1500);
  }

  const fmtFecha = (s: string | null) =>
    s ? new Date(s).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-teal-600" /> Links de pago
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todos los links generados y su estado. Se actualiza solo cuando el cliente paga.
        </p>
      </div>

      <div className="border rounded-xl overflow-x-auto bg-white">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Documento</th>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Pasarela</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-left px-3 py-2">Referencia</th>
              <th className="text-left px-3 py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-10">
                Aún no has generado links de pago.
              </td></tr>
            )}
            {links.map((l) => (
              <tr key={l.token} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(l.createdAt)}</td>
                <td className="px-3 py-2">{l.documento}</td>
                <td className="px-3 py-2">{l.cliente}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtMoneda(l.montoCentavos / 100)}</td>
                <td className="px-3 py-2">{PROVIDER_LABELS[l.provider] ?? l.provider}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_STYLE[l.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                    {l.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{l.providerRef ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => copiar(l.url)} title="Copiar link" className="p-1 hover:bg-slate-200 rounded">
                      {copied === l.url ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
                    </button>
                    <a href={l.url} target="_blank" rel="noreferrer" title="Abrir" className="p-1 hover:bg-slate-200 rounded">
                      <ExternalLink className="h-4 w-4 text-slate-500" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
