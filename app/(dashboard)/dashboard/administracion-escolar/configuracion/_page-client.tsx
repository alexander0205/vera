'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays, GraduationCap, BookOpen, Receipt, Plus, Pencil, Loader2, Settings, Search, X,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Periodo  { id: number; nombre: string; fechaInicio: string | null; fechaFin: string | null; activo: boolean; }
interface Curso    { id: number; nombre: string; nivel: string | null; orden: number; activo: boolean; }
interface Materia  { id: number; nombre: string; activo: boolean; }
interface Concepto {
  id: number; nombre: string; tipo: string; recurrente: boolean; activo: boolean;
  productId: number | null; productNombre: string | null;
}
interface Producto { id: number; nombre: string; precioDOP: number; tipo: string; }

type EntityKind = 'periodo' | 'curso' | 'materia' | 'concepto';

const TIPOS_CONCEPTO = [
  { value: 'inscripcion', label: 'Inscripción' },
  { value: 'mensualidad', label: 'Mensualidad' },
  { value: 'uniforme',    label: 'Uniforme' },
  { value: 'actividad',   label: 'Actividad' },
  { value: 'otro',        label: 'Otro' },
];

const TIPO_LABEL: Record<string, string> =
  Object.fromEntries(TIPOS_CONCEPTO.map((t) => [t.value, t.label]));

// Formulario genérico — un solo objeto cubre todas las entidades.
interface FormState {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  nivel: string;
  orden: string;
  tipo: string;
  recurrente: boolean;
  activo: boolean;
}
const EMPTY_FORM: FormState = {
  nombre: '', fechaInicio: '', fechaFin: '', nivel: '', orden: '0',
  tipo: 'otro', recurrente: false, activo: true,
};

const ENDPOINT: Record<EntityKind, string> = {
  periodo:  '/api/administracion-escolar/periodos',
  curso:    '/api/administracion-escolar/cursos',
  materia:  '/api/administracion-escolar/materias',
  concepto: '/api/administracion-escolar/conceptos',
};

const TITULO: Record<EntityKind, string> = {
  periodo: 'período', curso: 'curso', materia: 'materia', concepto: 'concepto',
};

// ─── Página ────────────────────────────────────────────────────────────────

export default function ConfiguracionEscolarClient() {
  const [periodos, setPeriodos]   = useState<Periodo[]>([]);
  const [cursos, setCursos]       = useState<Curso[]>([]);
  const [materias, setMaterias]   = useState<Materia[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading]     = useState(true);

  // Estado del modal genérico. `open` controla la visibilidad y `kind` se
  // conserva durante el cierre para que la animación de salida no muestre un
  // título vacío ("Nuevo ") al ponerse en null.
  const [open, setOpen]           = useState(false);
  const [kind, setKind]           = useState<EntityKind | null>(null);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [opError, setOpError]     = useState<string | null>(null);

  // Producto/servicio vinculado al concepto. Obligatorio para conceptos nuevos
  // (el nombre se hereda del producto). `conceptoLegacy`=true al editar un
  // concepto viejo sin producto: se mantiene editable por nombre para no romperlo.
  const [productoSel, setProductoSel] = useState<Producto | null>(null);
  const [productoQuery, setProductoQuery] = useState('');
  const [productoResultados, setProductoResultados] = useState<Producto[]>([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);
  const [conceptoLegacy, setConceptoLegacy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, m, k] = await Promise.all([
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
        fetch('/api/administracion-escolar/materias').then((r) => r.json()),
        fetch('/api/administracion-escolar/conceptos').then((r) => r.json()),
      ]);
      setPeriodos(p.periodos ?? []);
      setCursos(c.cursos ?? []);
      setMaterias(m.materias ?? []);
      setConceptos(k.conceptos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Búsqueda de productos con debounce (solo dentro del form de concepto).
  useEffect(() => {
    if (!open || kind !== 'concepto' || productoSel) { setProductoResultados([]); return; }
    const q = productoQuery.trim();
    if (!q) { setProductoResultados([]); return; }
    setBuscandoProducto(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetch(`/api/productos?q=${encodeURIComponent(q)}`).then((r) => r.json());
        setProductoResultados(data.productos ?? []);
      } finally {
        setBuscandoProducto(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [productoQuery, open, kind, productoSel]);

  function abrirNuevo(k: EntityKind) {
    setKind(k);
    setEditId(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setProductoSel(null);
    setProductoQuery('');
    setConceptoLegacy(false);
    setOpen(true);
  }

  function abrirEdicion(k: EntityKind, data: Periodo | Curso | Materia | Concepto) {
    setKind(k);
    setEditId(data.id);
    setOpError(null);
    setOpen(true);
    setForm({
      ...EMPTY_FORM,
      nombre: data.nombre,
      activo: data.activo,
      fechaInicio: (data as Periodo).fechaInicio ?? '',
      fechaFin: (data as Periodo).fechaFin ?? '',
      nivel: (data as Curso).nivel ?? '',
      orden: String((data as Curso).orden ?? 0),
      tipo: (data as Concepto).tipo ?? 'otro',
      recurrente: (data as Concepto).recurrente ?? false,
    });
    const concepto = data as Concepto;
    setProductoSel(
      concepto.productId
        ? { id: concepto.productId, nombre: concepto.productNombre ?? `#${concepto.productId}`, precioDOP: 0, tipo: '' }
        : null,
    );
    // Concepto viejo sin producto: modo legacy (editable por nombre).
    setConceptoLegacy(k === 'concepto' && !concepto.productId);
    setProductoQuery('');
  }

  function cerrar() { setOpen(false); }

  // Construye el body según la entidad activa.
  function buildBody(): Record<string, unknown> {
    switch (kind) {
      case 'periodo':
        return { nombre: form.nombre, fechaInicio: form.fechaInicio || null, fechaFin: form.fechaFin || null, activo: form.activo };
      case 'curso':
        return { nombre: form.nombre, nivel: form.nivel || null, orden: parseInt(form.orden) || 0, activo: form.activo };
      case 'materia':
        return { nombre: form.nombre, activo: form.activo };
      case 'concepto':
        return {
          // Conceptos nuevos heredan el nombre del producto; los legacy sin
          // producto conservan su nombre escrito.
          nombre: conceptoLegacy ? form.nombre : (productoSel?.nombre ?? form.nombre),
          tipo: form.tipo, recurrente: form.recurrente, activo: form.activo,
          productId: productoSel?.id ?? null,
        };
      default:
        return {};
    }
  }

  async function handleGuardar() {
    if (!kind) return;
    if (kind === 'concepto' && !conceptoLegacy) {
      if (!productoSel) { setOpError('Selecciona o crea un producto/servicio'); return; }
    } else if (!form.nombre.trim()) {
      setOpError('El nombre es obligatorio'); return;
    }
    setSaving(true);
    setOpError(null);
    try {
      const url = editId ? `${ENDPOINT[kind]}/${editId}` : ENDPOINT[kind];
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      cerrar();
      cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  const periodoActivo = periodos.find((p) => p.activo);

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración escolar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Solo administradores. Define la estructura académica y financiera: períodos, cursos, materias y conceptos de pago.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo?.nombre ?? '—'} />
        <StatCard icon={GraduationCap} label="Cursos" value={String(cursos.length)} />
        <StatCard icon={BookOpen} label="Materias" value={String(materias.length)} />
        <StatCard icon={Receipt} label="Conceptos de pago" value={String(conceptos.length)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          {/* 3 columnas: períodos, cursos, conceptos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Períodos */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />Períodos escolares
              </CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {periodos.length === 0 && <EmptyRow text="Sin períodos" />}
                {periodos.map((p) => (
                  <ListRow key={p.id} onEdit={() => abrirEdicion('periodo', p)}>
                    <span className="font-medium text-gray-900">{p.nombre}</span>
                    {p.activo
                      ? <Badge className="bg-teal-50 text-teal-700 border-teal-200">Activo</Badge>
                      : <Badge variant="outline" className="text-gray-500">Inactivo</Badge>}
                  </ListRow>
                ))}
                <AddButton onClick={() => abrirNuevo('periodo')} label="Nuevo período" />
              </CardContent>
            </Card>

            {/* Cursos */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />Cursos y grados
              </CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {cursos.length === 0 && <EmptyRow text="Sin cursos" />}
                {cursos.map((c) => (
                  <ListRow key={c.id} onEdit={() => abrirEdicion('curso', c)}>
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-sm text-gray-500">{c.nivel ?? '—'}</span>
                  </ListRow>
                ))}
                <AddButton onClick={() => abrirNuevo('curso')} label="Nuevo curso" />
              </CardContent>
            </Card>

            {/* Conceptos */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />Conceptos de pago
              </CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {conceptos.length === 0 && <EmptyRow text="Sin conceptos" />}
                {conceptos.map((k) => (
                  <ListRow key={k.id} onEdit={() => abrirEdicion('concepto', k)}>
                    <span className="font-medium text-gray-900 truncate">
                      {k.nombre}
                      {k.productNombre && <span className="text-xs text-teal-600 font-normal ml-1.5">· {k.productNombre}</span>}
                    </span>
                    <span className="text-sm text-gray-500 shrink-0">{TIPO_LABEL[k.tipo] ?? k.tipo}</span>
                  </ListRow>
                ))}
                <AddButton onClick={() => abrirNuevo('concepto')} label="Nuevo concepto" />
              </CardContent>
            </Card>
          </div>

          {/* Materias — tabla ancha */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />Materias
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => abrirNuevo('materia')}>
                <Plus className="h-4 w-4 mr-1" />Nueva materia
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {materias.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">Sin materias registradas</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Materia</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materias.map((m) => (
                      <TableRow key={m.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium text-gray-900">{m.nombre}</TableCell>
                        <TableCell>
                          {m.activo
                            ? <Badge className="bg-teal-50 text-teal-700 border-teal-200">Activa</Badge>
                            : <Badge variant="outline" className="text-gray-500">Inactiva</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicion('materia', m)}>
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal genérico crear/editar */}
      <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? 'Editar' : 'Nuevo'} {kind ? TITULO[kind] : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}

            {(kind !== 'concepto' || conceptoLegacy) && (
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  autoFocus
                  placeholder={kind === 'periodo' ? 'Ej: 2025-2026' : kind === 'curso' ? 'Ej: Primero A' : kind === 'concepto' ? 'Ej: Mensualidad' : 'Ej: Matemáticas'}
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                />
                {kind === 'concepto' && conceptoLegacy && (
                  <p className="text-xs text-amber-600">Concepto sin producto. Vincula uno abajo para estandarizarlo.</p>
                )}
              </div>
            )}

            {kind === 'periodo' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha inicio</Label>
                  <Input type="date" value={form.fechaInicio}
                    onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha fin</Label>
                  <Input type="date" value={form.fechaFin}
                    onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))} />
                </div>
              </div>
            )}

            {kind === 'curso' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nivel</Label>
                  <Input placeholder="Ej: Primaria" value={form.nivel}
                    onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Orden</Label>
                  <Input type="number" value={form.orden}
                    onChange={(e) => setForm((f) => ({ ...f, orden: e.target.value }))} />
                </div>
              </div>
            )}

            {kind === 'concepto' && (
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v, recurrente: v === 'mensualidad' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONCEPTO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-1.5">
                  <Label>Producto/servicio *</Label>
                  <p className="text-xs text-gray-400 -mt-1">
                    El concepto toma su nombre e ITBIS de este producto/servicio (un solo catálogo, sin duplicar).
                  </p>
                  {productoSel ? (
                    <div className="flex items-center justify-between gap-2 border border-teal-200 bg-teal-50 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-teal-800 truncate">{productoSel.nombre}</span>
                      <button onClick={() => setProductoSel(null)} className="text-teal-600 hover:text-teal-800 shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input className="pl-8" placeholder="Buscar producto o servicio…"
                          value={productoQuery} onChange={(e) => setProductoQuery(e.target.value)} />
                        {(buscandoProducto || productoResultados.length > 0) && (
                          <div className="absolute z-10 left-0 right-0 mt-1 border border-gray-200 bg-white rounded-lg shadow-sm max-h-40 overflow-y-auto">
                            {buscandoProducto ? (
                              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-teal-600" /></div>
                            ) : productoResultados.map((p) => (
                              <button key={p.id}
                                onClick={() => { setProductoSel(p); setProductoQuery(''); setProductoResultados([]); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                                <p className="font-medium text-gray-900">{p.nombre}</p>
                                <p className="text-xs text-gray-400 capitalize">{p.tipo} · RD${p.precioDOP.toFixed(2)}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-gray-400">¿No existe?</span>
                        <a href="/dashboard/productos?nuevo=1" target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700">
                          <Plus className="h-3.5 w-3.5" />Crear producto/servicio
                        </a>
                        <span className="text-xs text-gray-400">y vuelve a buscarlo.</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              {kind === 'periodo' ? 'Período activo' : 'Activo'}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : (editId ? 'Guardar cambios' : 'Crear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: typeof Settings; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

function ListRow({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="group flex items-center justify-between gap-2 py-2 px-1 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-2 flex-1 min-w-0">{children}</div>
      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5 text-gray-400" />
      </Button>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-3 text-center text-sm text-gray-400">{text}</div>;
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-2 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors flex items-center justify-center gap-1"
    >
      <Plus className="h-4 w-4" />{label}
    </button>
  );
}
