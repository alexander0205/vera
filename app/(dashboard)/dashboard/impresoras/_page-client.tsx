'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Printer, FileText, Ticket, CheckCircle, Plus, Trash2,
  Loader2, Star, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Impresora {
  id:        number;
  nombre:    string;
  tipo:      string;
  esDefault: boolean;
  ip:        string | null;
  backend:   string;
  createdAt: string;
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  a4:           'A4 / Carta',
  termica_80mm: 'Térmica 80mm',
  termica_58mm: 'Térmica 58mm',
};

const TIPO_ICONS: Record<string, React.ElementType> = {
  a4:           FileText,
  termica_80mm: Ticket,
  termica_58mm: Ticket,
};

const BACKEND_LABELS: Record<string, string> = {
  browser: 'Navegador (PDF)',
  cups:    'CUPS',
  escpos:  'ESC/POS',
};

function TipoIcon({ tipo, className }: { tipo: string; className?: string }) {
  const Icon = TIPO_ICONS[tipo] ?? Printer;
  return <Icon className={className} />;
}

// ─── Formulario de nueva impresora ────────────────────────────────────────────

interface FormState {
  nombre:    string;
  tipo:      string;
  esDefault: boolean;
  ip:        string;
  backend:   string;
}

const FORM_EMPTY: FormState = {
  nombre:    '',
  tipo:      'a4',
  esDefault: false,
  ip:        '',
  backend:   'browser',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImpresorasPage() {
  const [impresoras, setImpresoras]       = useState<Impresora[]>([]);
  const [loading, setLoading]             = useState(true);

  const [showModal, setShowModal]         = useState(false);
  const [form, setForm]                   = useState<FormState>(FORM_EMPTY);
  const [saving, setSaving]               = useState(false);

  const [deleteTarget, setDeleteTarget]   = useState<Impresora | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/impresoras');
      const data = await res.json();
      setImpresoras(data.impresoras ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Crear ──────────────────────────────────────────────────────────────────

  async function handleCrear() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/impresoras', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando');
      toast.success('Impresora agregada');
      setShowModal(false);
      setForm(FORM_EMPTY);
      cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error creando impresora');
    } finally {
      setSaving(false);
    }
  }

  // ─── Marcar default ─────────────────────────────────────────────────────────

  async function handleMarcarDefault(imp: Impresora) {
    if (imp.esDefault) return;
    try {
      const res = await fetch(`/api/impresoras/${imp.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ esDefault: true }),
      });
      if (!res.ok) throw new Error('Error actualizando');
      toast.success(`"${imp.nombre}" es ahora la impresora predeterminada`);
      cargar();
    } catch {
      toast.error('No se pudo actualizar la impresora');
    }
  }

  // ─── Eliminar ────────────────────────────────────────────────────────────────

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/impresoras/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error eliminando');
      toast.success('Impresora eliminada');
      setDeleteTarget(null);
      cargar();
    } catch {
      toast.error('No se pudo eliminar la impresora');
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const defaultImp = impresoras.find(i => i.esDefault);

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Printer className="h-6 w-6 text-teal-600" />
            Impresoras
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configura las impresoras de tu empresa. La predeterminada se usará al hacer clic en &quot;Imprimir&quot; desde una factura.
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700"
          onClick={() => { setForm(FORM_EMPTY); setShowModal(true); }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar impresora
        </Button>
      </div>

      {/* Impresora predeterminada activa */}
      {defaultImp && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                <TipoIcon tipo={defaultImp.tipo} className="h-5 w-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-teal-900 truncate">{defaultImp.nombre}</p>
                  <Badge className="bg-teal-600 text-white text-[10px] py-0">Predeterminada</Badge>
                </div>
                <p className="text-xs text-teal-700">
                  {TIPO_LABELS[defaultImp.tipo] ?? defaultImp.tipo}
                  {defaultImp.ip && ` · ${defaultImp.ip}`}
                  {' · '}{BACKEND_LABELS[defaultImp.backend] ?? defaultImp.backend}
                </p>
              </div>
              <CheckCircle className="h-5 w-5 text-teal-500 shrink-0" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de impresoras */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">Impresoras configuradas</CardTitle>
          <CardDescription className="text-xs">
            Haz clic en &quot;Predeterminar&quot; para que esa impresora se use automáticamente al imprimir facturas
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
          ) : impresoras.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Printer className="h-10 w-10 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500">No hay impresoras configuradas</p>
              <p className="text-xs text-gray-400">Agrega una para comenzar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {impresoras.map(imp => {
                const Icon = TIPO_ICONS[imp.tipo] ?? Printer;
                return (
                  <div key={imp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      imp.esDefault ? 'bg-teal-100' : 'bg-gray-100'
                    }`}>
                      <Icon className={`h-4.5 w-4.5 ${imp.esDefault ? 'text-teal-600' : 'text-gray-500'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{imp.nombre}</span>
                        {imp.esDefault && (
                          <Badge className="bg-teal-600 text-white text-[10px] py-0 leading-4">
                            Predeterminada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {TIPO_LABELS[imp.tipo] ?? imp.tipo}
                        {imp.ip && ` · IP: ${imp.ip}`}
                        {' · '}{BACKEND_LABELS[imp.backend] ?? imp.backend}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!imp.esDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleMarcarDefault(imp)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Predeterminar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(imp)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cómo funciona */}
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">¿Cómo funciona la impresión?</p>
              <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
                <li><strong>Impresora A4:</strong> Abre el PDF tamaño carta/A4 en nueva pestaña</li>
                <li><strong>Térmica 80mm / 58mm:</strong> Abre el PDF tirilla optimizado para papel térmico</li>
                <li>En ambos casos, el diálogo de impresión del navegador permite seleccionar la impresora física</li>
                <li>Para impresoras térmicas, selecciona &quot;Sin márgenes&quot; y desactiva los encabezados</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Modal: Agregar impresora ── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar impresora</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            <div className="space-y-1.5">
              <Label>Nombre de la impresora *</Label>
              <Input
                placeholder="Ej: Bematech 80mm recepción"
                value={form.nombre}
                onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de impresora</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['a4', 'termica_80mm', 'termica_58mm'] as const).map(tipo => {
                  const TIcon = TIPO_ICONS[tipo] ?? Printer;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, tipo }))}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                        form.tipo === tipo
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <TIcon className={`h-5 w-5 ${form.tipo === tipo ? 'text-teal-600' : 'text-gray-500'}`} />
                      <span className={`text-[11px] font-medium leading-tight ${
                        form.tipo === tipo ? 'text-teal-700' : 'text-gray-600'
                      }`}>{TIPO_LABELS[tipo]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>IP de red (opcional)</Label>
              <Input
                placeholder="192.168.1.100"
                value={form.ip}
                onChange={(e) => setForm(f => ({ ...f, ip: e.target.value }))}
              />
              <p className="text-[11px] text-gray-400">Solo como referencia visual. No se conecta directamente.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Backend</Label>
              <select
                value={form.backend}
                onChange={(e) => setForm(f => ({ ...f, backend: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="browser">Navegador (PDF)</option>
                <option value="cups">CUPS</option>
                <option value="escpos">ESC/POS</option>
              </select>
              <p className="text-[11px] text-gray-400">CUPS y ESC/POS son informativos en esta versión.</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.esDefault}
                onChange={(e) => setForm(f => ({ ...f, esDefault: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Marcar como predeterminada</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={handleCrear}
              disabled={saving || !form.nombre.trim()}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : 'Guardar impresora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar impresora?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            {deleteTarget?.esDefault && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Esta es tu impresora predeterminada. Al eliminarla, ninguna quedará seleccionada
                  y el botón &quot;Imprimir&quot; usará A4 como respaldo.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</>
                : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
