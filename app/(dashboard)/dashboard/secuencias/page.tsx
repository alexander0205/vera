'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, AlertTriangle, Loader2, RefreshCw, ExternalLink,
  Hash, Calendar, CheckCircle2, XCircle, AlertCircle, Star, Infinity,
} from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Secuencia {
  id:                   number;
  tipoEcf:              string;
  nombre:               string;
  secuenciaDesde:       string;
  secuenciaActual:      string;
  secuenciaHasta:       string;
  disponibles:          number;   // -1 = ilimitado (sin-ncf)
  fechaVencimiento:     string | null;
  preferida:            boolean;
  numeracionAutomatica: boolean;
  prefijo:              string | null;
  pieDeFactura:         string | null;
  sucursal:             string | null;
  estado:               'activa' | 'vencida' | 'agotada';
}

// ─── Catálogo de tipos (aplanado desde CATEGORIAS_ECF) ────────────────────────

const TIPOS_PLANO: Record<string, { corto: string }> = {};
for (const cat of CATEGORIAS_ECF) {
  for (const t of cat.tipos) {
    TIPOS_PLANO[t.codigo] = { corto: t.etiqueta };
  }
}

function getLabelTipo(s: Secuencia): string {
  if (s.tipoEcf === 'sin-ncf') return 'Sin NCF';
  return TIPOS_PLANO[s.tipoEcf]?.corto ?? `e${s.tipoEcf}`;
}

function formatEncf(tipo: string, numero: number | string): string {
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

function today(): string { return new Date().toISOString().slice(0, 10); }

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: Secuencia['estado'] }) {
  if (estado === 'activa') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" />
        Activa
      </span>
    );
  }
  if (estado === 'vencida') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <XCircle className="h-3 w-3" />
        Vencida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <AlertCircle className="h-3 w-3" />
      Agotada
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SecuenciasPage() {
  const [secuencias, setSecuencias]     = useState<Secuencia[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo]     = useState('todos');

  // Modales
  const [editTarget, setEditTarget]     = useState<Secuencia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Secuencia | null>(null);

  // Estado de operaciones
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [opError, setOpError]   = useState<string | null>(null);

  // Formulario edición
  const [editNombre, setEditNombre]       = useState('');
  const [editHasta, setEditHasta]         = useState('');
  const [editVenc, setEditVenc]           = useState('');
  const [editPreferida, setEditPreferida] = useState(false);
  const [editSucursal, setEditSucursal]   = useState('');
  const [editPie, setEditPie]             = useState('');

  // ─── Cargar datos ──────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/secuencias');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando numeraciones');
      setSecuencias(data.sequences);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function abrirEdicion(s: Secuencia) {
    setEditTarget(s);
    setEditNombre(s.nombre);
    setEditHasta(s.secuenciaHasta);
    setEditVenc(s.fechaVencimiento ? s.fechaVencimiento.slice(0, 10) : '');
    setEditPreferida(s.preferida);
    setEditSucursal(s.sucursal ?? '');
    setEditPie(s.pieDeFactura ?? '');
    setOpError(null);
  }

  async function handleEditar() {
    if (!editTarget) return;
    if (!editNombre.trim()) {
      setOpError('El nombre es obligatorio.');
      return;
    }
    setSaving(true); setOpError(null);
    try {
      const esSinNcf = editTarget.tipoEcf === 'sin-ncf';
      const payload: Record<string, unknown> = {
        nombre:   editNombre.trim(),
        preferida: editPreferida,
        sucursal:  editSucursal.trim() || null,
        pieDeFactura: editPie.trim() || null,
      };
      if (!esSinNcf && editHasta) {
        payload.hasta = parseInt(editHasta);
      }
      if (editVenc) {
        payload.fechaVencimiento = editVenc;
      }

      const res = await fetch(`/api/secuencias/${editTarget.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error actualizando');
      setEditTarget(null); await cargar();
    } catch (e: unknown) { setOpError(e instanceof Error ? e.message : 'Error actualizando'); }
    finally { setSaving(false); }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setOpError(null);
    try {
      const res  = await fetch(`/api/secuencias/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); await cargar();
    } catch (e: unknown) { setOpError(e instanceof Error ? e.message : 'Error eliminando'); }
    finally { setDeleting(false); }
  }

  // ─── Filtrado ───────────────────────────────────────────────────────────────

  const filtradas = filtroTipo === 'todos'
    ? secuencias
    : secuencias.filter((s) => s.tipoEcf === filtroTipo);

  // Tipos únicos presentes en la lista para el filtro
  const tiposPresentes = Array.from(new Set(secuencias.map(s => s.tipoEcf)));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#eef0f7] min-h-full p-6">
      <div className="space-y-6">

        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Numeraciones de comprobantes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Registra aquí los rangos de e-NCF autorizados por la DGII para tu empresa.{' '}
              <a
                href="https://ofv.dgii.gov.do"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal-600 hover:underline"
              >
                Solicitar rangos en OFV <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={cargar} disabled={loading} className="text-gray-600">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Link href="/dashboard/secuencias/nueva">
              <Button className="bg-teal-600 hover:bg-teal-700 text-white">
                <Plus className="h-4 w-4 mr-1" />
                Nueva numeración
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* CARD PRINCIPAL */}
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
                  {tiposPresentes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code === 'sin-ncf' ? 'Sin NCF' : (TIPOS_PLANO[code]?.corto ?? `e${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!loading && (
              <p className="text-sm text-gray-400">
                {filtradas.length} {filtradas.length === 1 ? 'numeración' : 'numeraciones'}
              </p>
            )}
          </div>

          {/* Contenido */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="h-12 w-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Hash className="h-6 w-6 text-teal-600" />
              </div>
              <p className="text-gray-700 font-semibold mb-1">Sin numeraciones registradas</p>
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
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir a OFV DGII
                </a>
                <Link href="/dashboard/secuencias/nueva">
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Nueva numeración
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Header tabla */}
              <div className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-500 bg-gray-50/60 uppercase tracking-wide">
                <div>Tipo / Nombre</div>
                <div>Próximo e-NCF</div>
                <div className="text-center">Rango</div>
                <div className="text-center">Disponibles</div>
                <div>Vencimiento</div>
                <div className="text-right pr-2">Acciones</div>
              </div>

              {/* Filas */}
              {filtradas.map((s) => {
                const esSinNcf = s.tipoEcf === 'sin-ncf';
                const encf     = (!esSinNcf && s.estado === 'activa')
                  ? formatEncf(s.tipoEcf, s.secuenciaActual)
                  : null;
                const pct = (!esSinNcf && Number(s.secuenciaHasta) > 0)
                  ? Math.round((Number(s.secuenciaActual) / Number(s.secuenciaHasta)) * 100)
                  : 0;

                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 border-b border-gray-50 hover:bg-gray-50/60 items-center last:border-0"
                  >
                    {/* Tipo / Nombre */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 font-mono shrink-0 border ${
                          esSinNcf
                            ? 'text-gray-600 bg-gray-50 border-gray-200'
                            : 'text-teal-700 bg-teal-50 border-teal-200'
                        }`}>
                          {esSinNcf ? 'Sin NCF' : `e${s.tipoEcf}`}
                        </span>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {s.nombre}
                        </p>
                        {s.preferida && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                            <Star className="h-2.5 w-2.5 fill-amber-500" />
                            Preferida
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <EstadoBadge estado={s.estado} />
                        {s.sucursal && (
                          <span className="text-[10px] text-gray-400">
                            {s.sucursal}
                          </span>
                        )}
                        {!esSinNcf && s.disponibles < 50 && s.estado === 'activa' && (
                          <span className="text-[10px] text-amber-600">¡Pocos disponibles!</span>
                        )}
                      </div>
                    </div>

                    {/* Próximo e-NCF */}
                    <div>
                      {esSinNcf ? (
                        <span className="text-xs text-gray-400 italic">Numeración automática</span>
                      ) : encf ? (
                        <span className="font-mono text-sm font-semibold text-gray-800 tracking-tight">{encf}</span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">—</span>
                      )}
                    </div>

                    {/* Rango */}
                    <div className="text-center">
                      {esSinNcf ? (
                        <div className="flex flex-col items-center gap-1">
                          <Infinity className="h-4 w-4 text-gray-300" />
                          {s.prefijo && (
                            <span className="text-[10px] text-gray-400 font-mono">{s.prefijo}…</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 font-mono">
                            {Number(s.secuenciaActual).toLocaleString('es-DO')} –{' '}
                            {Number(s.secuenciaHasta).toLocaleString('es-DO')}
                          </p>
                          <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden w-20 mx-auto">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-teal-400'
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Disponibles */}
                    <div className="text-center">
                      {esSinNcf ? (
                        <Infinity className="h-4 w-4 text-teal-500 mx-auto" />
                      ) : (
                        <span className={`text-sm font-semibold ${
                          s.disponibles < 50 ? 'text-amber-600' : 'text-gray-700'
                        }`}>
                          {s.disponibles.toLocaleString('es-DO')}
                        </span>
                      )}
                    </div>

                    {/* Vencimiento */}
                    <div className="flex items-center gap-1.5">
                      {esSinNcf ? (
                        <span className="text-xs text-gray-400 italic">Sin vencimiento</span>
                      ) : (
                        <>
                          <Calendar className={`h-3.5 w-3.5 shrink-0 ${s.estado === 'vencida' ? 'text-red-400' : 'text-gray-300'}`} />
                          <span className={`text-sm ${s.estado === 'vencida' ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                            {fmtFecha(s.fechaVencimiento)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-0.5 justify-end">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(s)}
                        title="Editar numeración"
                        className="p-2 text-gray-400 hover:text-teal-600 rounded-md hover:bg-teal-50 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeleteTarget(s); setOpError(null); }}
                        title="Eliminar numeración"
                        className="p-2 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Modal: Editar numeración ─────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Editar numeración</DialogTitle>
          </DialogHeader>
          {editTarget && (() => {
            const esSinNcf = editTarget.tipoEcf === 'sin-ncf';
            const showFechaVenc = !esSinNcf && editTarget.tipoEcf !== '32' && editTarget.tipoEcf !== '34';
            const showPie = CATEGORIAS_ECF
              .filter(c => c.id === 'factura-venta' || c.id === 'nota-credito')
              .some(c => c.tipos.some(t => t.codigo === editTarget.tipoEcf));

            return (
              <div className="space-y-4 py-2">
                {opError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
                )}

                {/* Info */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-center gap-2.5">
                  <span className={`font-mono text-[11px] font-bold rounded px-1.5 py-0.5 border ${
                    esSinNcf ? 'text-gray-600 bg-gray-100 border-gray-200' : 'text-teal-700 bg-teal-50 border-teal-200'
                  }`}>
                    {esSinNcf ? 'Sin NCF' : `e${editTarget.tipoEcf}`}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{getLabelTipo(editTarget)}</span>
                </div>

                {/* Nombre */}
                <div className="space-y-1.5">
                  <Label>Nombre <span className="text-red-500">*</span></Label>
                  <Input value={editNombre} onChange={e => setEditNombre(e.target.value)} />
                </div>

                {/* Preferida */}
                <div className="flex items-center justify-between">
                  <Label>Numeración preferida</Label>
                  <button
                    type="button"
                    onClick={() => setEditPreferida(p => !p)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editPreferida ? 'bg-teal-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      editPreferida ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {/* Número final (solo si no es sin-ncf) */}
                {!esSinNcf && (
                  <div className="space-y-1.5">
                    <Label>Número final del rango <span className="text-red-500">*</span></Label>
                    <p className="text-xs text-gray-400">
                      Actual: <span className="font-mono">{editTarget.secuenciaHasta}</span> — no puede ser menor al siguiente número (<span className="font-mono">{editTarget.secuenciaActual}</span>)
                    </p>
                    <Input
                      type="number"
                      min={editTarget.secuenciaActual}
                      value={editHasta}
                      onChange={(e) => setEditHasta(e.target.value)}
                    />
                  </div>
                )}

                {/* Fecha vencimiento (condicional) */}
                {showFechaVenc && (
                  <div className="space-y-1.5">
                    <Label>Fecha de vencimiento</Label>
                    <Input type="date" min={today()} value={editVenc} onChange={(e) => setEditVenc(e.target.value)} />
                  </div>
                )}

                {/* Sucursal */}
                <div className="space-y-1.5">
                  <Label>Sucursal</Label>
                  <Input
                    placeholder="Opcional"
                    value={editSucursal}
                    onChange={e => setEditSucursal(e.target.value)}
                  />
                </div>

                {/* Pie de factura (solo factura-venta y nota-credito) */}
                {showPie && (
                  <div className="space-y-1.5">
                    <Label>Pie de factura</Label>
                    <Textarea
                      className="resize-none text-sm"
                      rows={3}
                      placeholder="Texto al pie del comprobante..."
                      maxLength={2000}
                      value={editPie}
                      onChange={e => setEditPie(e.target.value)}
                    />
                    <p className="text-xs text-gray-400">{editPie.length}/2000 caracteres</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleEditar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ─────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar numeración?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>{' '}
              {deleteTarget?.tipoEcf !== 'sin-ncf' && (
                <span className="font-mono text-xs text-gray-500">(e{deleteTarget?.tipoEcf})</span>
              )}.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Los comprobantes ya emitidos no se verán afectados. Para volver a emitir este tipo deberás registrar un nuevo rango.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
