'use client';

/**
 * Anulación de rangos de e-NCF ante la DGII (ANECF).
 *
 * Flujo de tres pasos deliberado: revisar → confirmar → enviar. El envío es
 * irreversible ante la DGII, así que nunca se manda desde el primer clic: el
 * usuario ve primero qué hay dentro del tramo y qué se le va a decir a la DGII.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, Ban,
  ExternalLink,
} from 'lucide-react';
import { ESTADO_NCF_META, type EstadoNcf } from '@/lib/contabilidad/estados';
import { usePermissions } from '@/lib/hooks/usePermissions';

// Tipos de comprobante que el XSD ANECF acepta.
const TIPOS = [
  { value: '31', label: '31 — Crédito fiscal' },
  { value: '32', label: '32 — Consumo' },
  { value: '33', label: '33 — Nota de débito' },
  { value: '34', label: '34 — Nota de crédito' },
  { value: '41', label: '41 — Compras' },
  { value: '43', label: '43 — Gastos menores' },
  { value: '44', label: '44 — Régimen especial' },
  { value: '45', label: '45 — Gubernamental' },
  { value: '46', label: '46 — Exportación' },
  { value: '47', label: '47 — Pago exterior' },
];

interface Bloqueo {
  encf: string;
  numero: number;
  estado: EstadoNcf;
  estadoLabel: string;
  motivo: string;
  documentoId: number | null;
  urlVerificacion: string | null;
}

/** Estados en los que la salida correcta es emitir una Nota de crédito. */
const NECESITA_NOTA_CREDITO: EstadoNcf[] = ['ACEPTADO', 'ACEPTADO_CONDICIONAL'];
interface Revision {
  tipoEcf: string;
  desde: number;
  hasta: number;
  total: number;
  anulables: number;
  yaAnulados: number;
  bloqueos: Bloqueo[];
  porEstado: Record<string, number>;
  ok: boolean;
}
interface Resultado {
  id: number;
  tipoEcf: string;
  desde: number;
  hasta: number;
  cantidad: number;
  nuevos: number;
  estado: string;
  trackId: string | null;
  aceptado: boolean;
}

function encf(tipo: string, n: number) {
  return `E${tipo}${String(n).padStart(10, '0')}`;
}

export function AnularRangoPanel() {
  const { can, isLoading: permisosCargando } = usePermissions();
  const puedeAnular = can('facturas:anular');

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('32');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');

  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Cualquier cambio en el tramo invalida la revisión: no se puede confirmar
  // un preview que ya no corresponde a lo que dice el formulario.
  function resetRevision() {
    setRevision(null);
    setResultado(null);
    setConfirmando(false);
    setError(null);
  }

  async function revisar(e: React.FormEvent) {
    e.preventDefault();
    setRevisando(true); setError(null); setResultado(null); setConfirmando(false);
    try {
      const qs = `tipo=${tipo}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(`/api/contabilidad/anular-rango?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo revisar el tramo');
      setRevision(json);
    } catch (err) {
      setError((err as Error).message);
      setRevision(null);
    } finally {
      setRevisando(false);
    }
  }

  async function enviar() {
    if (!revision) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch('/api/contabilidad/anular-rango', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tipo, desde: revision.desde, hasta: revision.hasta, motivo }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Si el backend devolvió una revisión nueva (el tramo cambió entre el
        // preview y el clic), la mostramos en vez de solo el mensaje.
        if (json.detalle?.bloqueos) setRevision(json.detalle);
        throw new Error(json.error ?? 'No se pudo anular el tramo');
      }
      setResultado(json);
      setRevision(null);
      setConfirmando(false);
      setMotivo('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (permisosCargando || !puedeAnular) return null;

  const rangoValido = desde.trim() !== '' && hasta.trim() !== ''
    && Number(desde) >= 1 && Number(hasta) >= 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl print:hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 rounded-xl"
      >
        <span className="flex items-center gap-2">
          <Ban className="w-4 h-4 text-gray-400" />
          Anular comprobantes no usados ante la DGII
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
          {/* Qué es y qué no es — evita el error de creer que anula facturas */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Esto anula números, no facturas.</p>
              <p className="text-amber-800 mt-0.5">
                Le avisa a la DGII que un tramo de e-NCF autorizados nunca se va a usar, para que
                no queden como huecos sin explicar. Una factura que la DGII ya aceptó{' '}
                <strong>no se anula así</strong> — esa se revierte con una Nota de crédito.
                La anulación es definitiva: esos números no se podrán usar nunca más.
              </p>
            </div>
          </div>

          {/* ── Formulario del tramo ─────────────────────────────────────── */}
          <form onSubmit={revisar} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Tipo de comprobante</span>
              <select
                value={tipo}
                onChange={e => { setTipo(e.target.value); resetRevision(); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[210px] bg-white"
              >
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Del número</span>
              <input
                type="number" min={1} value={desde} placeholder="1"
                onChange={e => { setDesde(e.target.value); resetRevision(); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Al número</span>
              <input
                type="number" min={1} value={hasta} placeholder="10"
                onChange={e => { setHasta(e.target.value); resetRevision(); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="text-xs font-medium text-gray-500">Nota interna (opcional)</span>
              <input
                value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500}
                placeholder="Ej. secuencia vencida sin usar"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </label>
            <button
              type="submit" disabled={revisando || !rangoValido}
              className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {revisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              Revisar tramo
            </button>
          </form>

          {rangoValido && (
            <p className="text-xs text-gray-400">
              Se revisará {encf(tipo, Number(desde))} → {encf(tipo, Number(hasta))}.
              La nota interna se guarda aquí; la DGII solo recibe el tramo.
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* ── Veredicto de la revisión ─────────────────────────────────── */}
          {revision && (
            <div className={`border rounded-lg p-4 space-y-3 ${
              revision.ok ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm text-gray-800">
                Tramo <strong className="font-mono text-xs">{encf(revision.tipoEcf, revision.desde)}</strong> →{' '}
                <strong className="font-mono text-xs">{encf(revision.tipoEcf, revision.hasta)}</strong>
                {' '}— {revision.total.toLocaleString('es-DO')} número{revision.total === 1 ? '' : 's'}.
              </p>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-gray-700">
                  Se anularían: <strong className="tabular-nums">{revision.anulables.toLocaleString('es-DO')}</strong>
                </span>
                {revision.yaAnulados > 0 && (
                  <span className="text-gray-500">
                    Ya estaban anulados: <strong className="tabular-nums">{revision.yaAnulados.toLocaleString('es-DO')}</strong>
                  </span>
                )}
                {revision.bloqueos.length > 0 && (
                  <span className="text-red-700">
                    Bloquean el envío: <strong className="tabular-nums">{revision.bloqueos.length.toLocaleString('es-DO')}</strong>
                  </span>
                )}
              </div>

              {/* Desglose de lo anulable, para que no sea una cifra a ciegas */}
              {Object.keys(revision.porEstado).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(revision.porEstado).map(([est, n]) => (
                    <span key={est} className="text-xs bg-white border border-gray-200 text-gray-600 rounded-full px-2.5 py-1">
                      {ESTADO_NCF_META[est as EstadoNcf]?.label ?? est}: <strong className="tabular-nums">{n}</strong>
                    </span>
                  ))}
                </div>
              )}

              {/* Bloqueos — el usuario tiene que poder arreglar el rango */}
              {revision.bloqueos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-800">
                    La DGII no permite anular estos números por rango. Ajusta el tramo para excluirlos:
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-red-200 bg-white divide-y divide-red-100">
                    {revision.bloqueos.slice(0, 50).map(b => (
                      <div key={b.encf} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-gray-900">{b.encf}</span>
                          <span className="font-medium text-red-700">{b.estadoLabel}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5">{b.motivo}</p>
                        {(b.documentoId || b.urlVerificacion) && (
                          <div className="flex flex-wrap gap-3 mt-1">
                            {b.documentoId && (
                              <Link
                                href={`/dashboard/facturas/${b.documentoId}`}
                                target="_blank"
                                className="font-medium text-teal-600 hover:underline"
                              >
                                Ver factura
                              </Link>
                            )}
                            {b.documentoId && NECESITA_NOTA_CREDITO.includes(b.estado) && (
                              <Link
                                href={`/dashboard/notas-credito/nueva?padreId=${b.documentoId}`}
                                target="_blank"
                                className="font-medium text-teal-600 hover:underline"
                              >
                                Emitir nota de crédito
                              </Link>
                            )}
                            {b.urlVerificacion && (
                              <a
                                href={b.urlVerificacion}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-teal-600 hover:underline"
                              >
                                Verificar en la DGII <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {revision.bloqueos.length > 50 && (
                    <p className="text-xs text-red-700">
                      … y {(revision.bloqueos.length - 50).toLocaleString('es-DO')} más. Prueba con un tramo más chico.
                    </p>
                  )}
                </div>
              )}

              {revision.ok && !confirmando && (
                <button
                  onClick={() => setConfirmando(true)}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <Ban className="w-4 h-4" />
                  Anular {revision.anulables.toLocaleString('es-DO')} número{revision.anulables === 1 ? '' : 's'} en la DGII
                </button>
              )}

              {revision.ok && confirmando && (
                <div className="bg-white border border-red-300 rounded-lg p-3 space-y-3">
                  <p className="text-sm text-gray-800">
                    Se enviará a la DGII la anulación de{' '}
                    <strong>{revision.anulables.toLocaleString('es-DO')}</strong> e-NCF del tipo {revision.tipoEcf}
                    {' '}({encf(revision.tipoEcf, revision.desde)} → {encf(revision.tipoEcf, revision.hasta)}).
                    {' '}<strong>No se puede deshacer</strong> — esos números quedan inutilizables para siempre.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={enviar} disabled={enviando}
                      className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"
                    >
                      {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Sí, anular en la DGII
                    </button>
                    <button
                      onClick={() => setConfirmando(false)} disabled={enviando}
                      className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {!revision.ok && revision.bloqueos.length === 0 && (
                <p className="text-sm text-gray-600">
                  {revision.yaAnulados > 0
                    ? 'Todos los números de este tramo ya estaban anulados ante la DGII.'
                    : 'No hay nada que anular en este tramo.'}
                </p>
              )}
            </div>
          )}

          {/* ── Resultado del envío ──────────────────────────────────────── */}
          {resultado && (
            <div className={`border rounded-lg p-4 text-sm flex gap-2 ${
              resultado.aceptado
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              {resultado.aceptado
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                {resultado.aceptado ? (
                  <>
                    <p className="font-medium">
                      La DGII aceptó la anulación de {resultado.nuevos.toLocaleString('es-DO')} e-NCF.
                    </p>
                    <p className="mt-0.5">
                      {encf(resultado.tipoEcf, resultado.desde)} → {encf(resultado.tipoEcf, resultado.hasta)}.
                      {' '}Vuelve a consultar el rango arriba y aparecerán como &ldquo;Anulado ante la DGII&rdquo;.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      La DGII recibió el envío pero devolvió estado {resultado.estado}.
                    </p>
                    <p className="mt-0.5">
                      Los números NO se marcaron como anulados. Revisa con soporte antes de reintentar
                      {resultado.trackId && <> — track id <span className="font-mono text-xs">{resultado.trackId}</span></>}.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
