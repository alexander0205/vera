'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowLeft, Copy, Check, ChevronDown, ChevronRight, AlertTriangle, Loader2,
} from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO:             'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ACEPTADO_CONDICIONAL: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  RECHAZADO:            'bg-red-50 text-red-700 ring-1 ring-red-200',
  RECIBIDO:             'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  PENDIENTE:            'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Crédito Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito',   '41': 'Compras', '43': 'Gastos Menores',
  '44': 'Régimen Único',  '45': 'Gubernamental', '46': 'Exportación', '47': 'Otros',
};

/** Tipo e-CF: `tipoECF` suele venir null; el real está en el e-NCF (E31… → "31"). */
function tipoCode(item: RecepcionEcfDto): string {
  return (item.tipoECF || item.tipoComprobante || item.eNcf?.match(/^E(\d{2})/)?.[1] || '') as string;
}
function tipoLabel(item: RecepcionEcfDto): string {
  const c = tipoCode(item);
  return c ? `${TIPO_LABELS[c] ?? `Tipo e${c}`}${c ? ` (e${c})` : ''}` : '—';
}

/** El monto NO viene como campo del API — se extrae del XML firmado (<MontoTotal>, en pesos). */
function fmtMonto(item: RecepcionEcfDto): string {
  const xml = item.xmlFirmado ?? item.xmlOriginal;
  const m = xml?.match(/<MontoTotal>\s*([\d.]+)\s*<\/MontoTotal>/i);
  if (!m) return '—';
  return `RD$${Number(m[1]).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : r.json().then((d: unknown) => Promise.reject(d)));

// ─── XML section colapsable ────────────────────────────────────────────────────

function XmlSection({ title, xml }: { title: string; xml?: string | null }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!xml) return;
    navigator.clipboard.writeText(xml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {open
          ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {xml ? (
            <>
              <div className="flex justify-end px-4 py-2 border-b border-gray-100 bg-gray-50">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {copied
                    ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado</>
                    : <><Copy className="h-3.5 w-3.5" /> Copiar</>
                  }
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-80 bg-gray-50 leading-relaxed whitespace-pre-wrap break-all">
                {xml}
              </pre>
            </>
          ) : (
            <p className="px-4 py-4 text-sm text-gray-400 italic">No disponible</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fila de detalle ──────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <dt className="w-36 shrink-0 text-xs font-medium text-gray-500">{label}</dt>
      <dd className="flex-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CompraDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { can, isLoading: permLoading } = usePermissions();

  const { data, isLoading, error } = useSWR<RecepcionEcfDto>(
    !permLoading && can('compras:ver') && id ? `/api/compras/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (permLoading || isLoading) {
    return (
      <section className="p-4 sm:p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </section>
    );
  }

  if (!permLoading && !can('compras:ver')) {
    return (
      <section className="p-4 sm:p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No tienes permiso para ver esta sección.</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    const msg = (error as { error?: string } | null)?.error ?? 'No se pudo cargar el detalle.';
    return (
      <section className="p-4 sm:p-6 space-y-4">
        <Link
          href="/dashboard/compras"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Compras
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{msg}</p>
        </div>
      </section>
    );
  }

  const estado = data.estado ?? 'PENDIENTE';

  return (
    <section className="p-4 sm:p-6 space-y-4 max-w-3xl">
      {/* Back */}
      <Link
        href="/dashboard/compras"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Compras
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900 font-mono">{data.eNcf}</h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}
            >
              {estado}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{tipoLabel(data)}</p>
        </div>
      </div>

      {/* Datos principales */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Detalle</h2>
        </div>
        <dl className="px-4 divide-y divide-gray-100">
          <DetailRow label="Emisor (RNC)" value={
            <span className="font-mono">{data.rncEmisor ?? data.rnc}</span>
          } />
          <DetailRow label="e-NCF" value={
            <span className="font-mono">{data.eNcf}</span>
          } />
          <DetailRow label="Tipo de comprobante" value={tipoLabel(data)} />
          <DetailRow label="Fecha recepción" value={
            fmtFechaCorta(data.fechaRecepcion ?? data.createdAt)
          } />
          <DetailRow label="Estado" value={
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}>
              {estado}
            </span>
          } />
          {typeof data.firmaValida === 'boolean' && (
            <DetailRow label="Firma" value={
              data.firmaValida
                ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" /> Válida</span>
                : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Inválida</span>
            } />
          )}
          <DetailRow label="Monto" value={
            <span className="font-semibold">{fmtMonto(data)}</span>
          } />
        </dl>
      </div>

      {/* XML emisor */}
      <XmlSection title="XML del emisor" xml={data.xmlFirmado ?? data.xmlOriginal} />

      {/* ARECF */}
      <XmlSection title="ARECF (nuestra respuesta)" xml={data.arecfXml} />
    </section>
  );
}
