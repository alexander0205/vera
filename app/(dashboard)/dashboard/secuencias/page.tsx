'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, AlertTriangle, Loader2, RefreshCw, ExternalLink,
  Hash, Calendar, CheckCircle2, XCircle, AlertCircle, Settings,
} from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NcfRango {
  id: string;
  tipoComprobante: string;
  serie: string;
  desde: number;
  hasta: number;
  siguiente: number;
  siguienteENCF: string;
  capacidadDisponible: number;
  pctUtilizado: number;
  fechaVencimiento: string;
  activo: boolean;
}

interface CampoFaltante {
  campo: string;
  label: string;
}

// ─── Catálogo de tipos ────────────────────────────────────────────────────────

const TIPOS_PLANO: Record<string, string> = {};
for (const cat of CATEGORIAS_ECF) {
  for (const t of cat.tipos) {
    if (t.codigo !== 'sin-ncf') TIPOS_PLANO[t.codigo] = t.etiqueta;
  }
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function estadoDeRango(r: NcfRango): 'activa' | 'vencida' | 'agotada' {
  if (!r.activo || r.capacidadDisponible <= 0) return 'agotada';
  if (r.fechaVencimiento && new Date(r.fechaVencimiento) < new Date()) return 'vencida';
  return 'activa';
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: 'activa' | 'vencida' | 'agotada' }) {
  if (estado === 'activa') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Activa
    </span>
  );
  if (estado === 'vencida') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle className="h-3 w-3" /> Vencida
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <AlertCircle className="h-3 w-3" /> Agotada
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SecuenciasPage() {
  const [rangos, setRangos]           = useState<NcfRango[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [camposFaltantes, setCamposFaltantes] = useState<CampoFaltante[]>([]);
  const [filtroTipo, setFiltroTipo]   = useState('todos');

  const cargar = useCallback(async () => {
    setLoading(true); setError(null); setCamposFaltantes([]);
    try {
      const res  = await fetch('/api/secuencias');
      const data = await res.json();

      if (res.status === 422 && data.error === 'campos_faltantes') {
        setCamposFaltantes(data.faltantes ?? []);
        setRangos([]);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Error cargando secuencias');
      setRangos(data.sequences ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const tiposPresentes = Array.from(new Set(rangos.map(r => r.tipoComprobante)));
  const filtrados = filtroTipo === 'todos'
    ? rangos
    : rangos.filter(r => r.tipoComprobante === filtroTipo);

  return (
    <div className="bg-[#eef0f7] min-h-full p-6">
      <div className="space-y-6">

        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Numeraciones de comprobantes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Rangos de e-NCF autorizados por la DGII para tu empresa.{' '}
              <a
                href="https://ofv.dgii.gov.do"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal-600 hover:underline"
              >
                Solicitar en OFV <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={cargar} disabled={loading} className="text-gray-600">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {!camposFaltantes.length && (
              <Link href="/dashboard/secuencias/nueva">
                <Button className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Plus className="h-4 w-4 mr-1" />
                  Nueva numeración
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* BANNER: Campos faltantes */}
        {camposFaltantes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Completa el perfil de tu empresa para activar las numeraciones
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Faltan los siguientes datos:{' '}
                <strong>{camposFaltantes.map(f => f.label).join(', ')}</strong>
              </p>
            </div>
            <Link href="/dashboard/configuracion">
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">
                <Settings className="h-3.5 w-3.5 mr-1" />
                Ir a configuración
              </Button>
            </Link>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* CARD PRINCIPAL */}
        {!camposFaltantes.length && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Filtro */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center gap-4">
              <div className="flex-1">
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Tipo de documento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los tipos</SelectItem>
                    {tiposPresentes.map(code => (
                      <SelectItem key={code} value={code}>
                        {TIPOS_PLANO[code] ?? `e${code}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!loading && (
                <p className="text-sm text-gray-400">
                  {filtrados.length} {filtrados.length === 1 ? 'rango' : 'rangos'}
                </p>
              )}
            </div>

            {/* Contenido */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-20 px-6">
                <div className="h-12 w-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Hash className="h-6 w-6 text-teal-600" />
                </div>
                <p className="text-gray-700 font-semibold mb-1">Sin rangos registrados</p>
                <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
                  Solicita tus rangos de e-NCF en la Oficina Virtual de la DGII y regístralos aquí.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href="https://ofv.dgii.gov.do"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ir a OFV DGII
                  </a>
                  <Link href="/dashboard/secuencias/nueva">
                    <Button className="bg-teal-600 hover:bg-teal-700 text-white" size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Nueva numeración
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Header tabla */}
                <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-500 bg-gray-50/60 uppercase tracking-wide">
                  <div>Tipo</div>
                  <div>Próximo e-NCF</div>
                  <div className="text-center">Rango</div>
                  <div className="text-center">Disponibles</div>
                  <div>Vencimiento</div>
                </div>

                {filtrados.map((r) => {
                  const estado = estadoDeRango(r);
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-gray-50 hover:bg-gray-50/60 items-center last:border-0"
                    >
                      {/* Tipo */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5 font-mono border text-teal-700 bg-teal-50 border-teal-200">
                            e{r.tipoComprobante}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {TIPOS_PLANO[r.tipoComprobante] ?? `Tipo ${r.tipoComprobante}`}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <EstadoBadge estado={estado} />
                          {r.capacidadDisponible < 50 && estado === 'activa' && (
                            <span className="text-[10px] text-amber-600">¡Pocos disponibles!</span>
                          )}
                        </div>
                      </div>

                      {/* Próximo e-NCF */}
                      <div>
                        {estado === 'activa' ? (
                          <span className="font-mono text-sm font-semibold text-gray-800 tracking-tight">
                            {r.siguienteENCF}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </div>

                      {/* Rango */}
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-mono">
                          {r.desde.toLocaleString('es-DO')} – {r.hasta.toLocaleString('es-DO')}
                        </p>
                        <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden w-20 mx-auto">
                          <div
                            className={`h-1 rounded-full transition-all ${
                              r.pctUtilizado > 80 ? 'bg-red-400'
                              : r.pctUtilizado > 50 ? 'bg-amber-400'
                              : 'bg-teal-400'
                            }`}
                            style={{ width: `${Math.min(r.pctUtilizado, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Disponibles */}
                      <div className="text-center">
                        <span className={`text-sm font-semibold ${
                          r.capacidadDisponible < 50 ? 'text-amber-600' : 'text-gray-700'
                        }`}>
                          {r.capacidadDisponible.toLocaleString('es-DO')}
                        </span>
                      </div>

                      {/* Vencimiento */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className={`h-3.5 w-3.5 shrink-0 ${estado === 'vencida' ? 'text-red-400' : 'text-gray-300'}`} />
                        <span className={`text-sm ${estado === 'vencida' ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {fmtFecha(r.fechaVencimiento)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
