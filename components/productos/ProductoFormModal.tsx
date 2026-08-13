'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Check, ChevronDown, ChevronUp, Camera, X } from 'lucide-react';
import MaestrosProductoSection from '@/app/(dashboard)/dashboard/productos/MaestrosProductoSection';
import { VariantesEditor, type VariantesPayload } from '@/components/productos/VariantesEditor';
import {
  VariantesEditorEdit, type VariantesEditPayload, type VariantesEditInitial,
} from '@/components/productos/VariantesEditorEdit';
import {
  OPCIONES_DONDE_SE_VENDE, aBanderas, desdeBanderas, type DondeSeVende,
} from '@/lib/productos/donde-se-vende';

// ─── Constantes / helpers (movidos desde productos/_page-client) ─────────────

const IMG_MAX_BYTES = 800_000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TASA_ITBIS_OPCIONES = [
  { value: 'exento', label: 'Exento (fuera de ITBIS)' },
  { value: '0',      label: 'ITBIS 0% (gravado al 0%)' },
  { value: '0.16',   label: 'ITBIS 16%' },
  { value: '0.18',   label: 'ITBIS 18%' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

const EMPTY_FORM = {
  nombre: '', descripcion: '', referencia: '', codigoBarras: '',
  precio: '', tasaItbis: 'exento', tipo: 'servicio', unidad: 'Unidad',
  costo: '', stockActual: '', stockMinimo: '',
  controlaInventario: false, permiteVentaSinStock: true,
  categoriaId: '', imagen: '',
  // "¿Dónde se vende?" — se guarda como visiblePos/visibleFacturacion.
  donde: 'ambos' as DondeSeVende,
};

interface Categoria { id: number; nombre: string; }

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Modal compartido de Crear / Editar producto o servicio. Reusado por la lista
 * `Productos y servicios` y por el detalle del producto (botón Editar). Recibe
 * `productoId` (null = crear) y carga el detalle + variantes él mismo, así los
 * dos callers no necesitan conocer la forma completa del producto.
 */
export function ProductoFormModal({ open, productoId, onClose, onSaved }: {
  open: boolean;
  productoId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [opError, setOpError]     = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);
  const [categorias, setCategorias]     = useState<Categoria[]>([]);

  // Variantes en CREAR (o convertir un bien simple): payload cartesiano.
  const [variantesNuevas, setVariantesNuevas] = useState<VariantesPayload>({ activo: false, variantAtributos: [], variants: [] });
  const [resetVariantes, setResetVariantes]   = useState(0);
  // Variantes EXISTENTES (editar): datos iniciales + payload editado.
  const [variantesInit, setVariantesInit]     = useState<VariantesEditInitial | null>(null);
  const [basePrecioVar, setBasePrecioVar]     = useState(0);
  const [variantesEdit, setVariantesEdit]     = useState<VariantesEditPayload | null>(null);

  const esEdicion = productoId != null;
  const tieneVariantes = variantesInit != null && variantesInit.variants.length > 0;
  // Usa el editor cartesiano (crear) cuando: es alta, o es un bien existente que
  // AÚN no tiene variantes (permite convertirlo a variantes).
  const usaEditorNuevo = form.tipo === 'bien' && !tieneVariantes;
  const usaVariantesNuevas = usaEditorNuevo && variantesNuevas.activo;

  useEffect(() => {
    fetch('/api/categorias').then((r) => r.json()).then((d) => setCategorias(d.categorias ?? [])).catch(() => {});
  }, []);

  // Al abrir: reset (crear) o cargar detalle + variantes (editar).
  const cargarDetalle = useCallback(async (id: number) => {
    setLoadingDetalle(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/productos/${id}`);
      const data = await res.json();
      const p = data?.producto;
      if (!res.ok || !p) throw new Error(data?.error ?? 'No se pudo cargar el producto');
      setForm({
        nombre:               p.nombre ?? '',
        descripcion:          p.descripcion ?? '',
        referencia:           p.referencia ?? '',
        codigoBarras:         p.codigoBarras ?? '',
        precio:               p.precioDOP != null ? String(p.precioDOP) : '',
        tasaItbis:            p.tasaItbis ?? 'exento',
        tipo:                 p.tipo ?? 'servicio',
        unidad:               p.unidadMedida ?? 'Unidad',
        costo:                p.costoDOP != null ? String(p.costoDOP) : '',
        stockActual:          p.stockActual != null ? String(p.stockActual) : '',
        stockMinimo:          p.stockMinimo != null ? String(p.stockMinimo) : '',
        controlaInventario:   p.controlaInventario ?? false,
        permiteVentaSinStock: p.permiteVentaSinStock ?? true,
        categoriaId:          p.categoriaId != null ? String(p.categoriaId) : '',
        imagen:               p.imagen ?? '',
        donde:                desdeBanderas(p),
      });
      // Variantes existentes (solo bienes).
      if (p.tipo === 'bien' && Array.isArray(p.variantAtributos) && p.variantAtributos.length > 0) {
        try {
          const vr = await fetch(`/api/productos/${id}/variants`);
          const vd = await vr.json();
          if (vr.ok && Array.isArray(vd.variants) && vd.variants.length > 0) {
            setVariantesInit({ variantAtributos: p.variantAtributos, variants: vd.variants });
            setBasePrecioVar(vd.basePrecioDOP ?? p.precioDOP ?? 0);
          } else {
            setVariantesInit(null);
          }
        } catch { setVariantesInit(null); }
      } else {
        setVariantesInit(null);
      }
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error cargando el producto');
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setOpError(null);
    setShowAvanzado(false);
    setVariantesEdit(null);
    if (productoId == null) {
      setForm(EMPTY_FORM);
      setVariantesInit(null);
      setVariantesNuevas({ activo: false, variantAtributos: [], variants: [] });
      setResetVariantes(n => n + 1);
    } else {
      cargarDetalle(productoId);
    }
  }, [open, productoId, cargarDetalle]);

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    const precio = parseFloat(form.precio);
    if (isNaN(precio) || precio < 0) { setOpError('El precio debe ser un número positivo'); return; }

    setSaving(true);
    setOpError(null);
    try {
      const url    = esEdicion ? `/api/productos/${productoId}` : '/api/productos';
      const method = esEdicion ? 'PUT' : 'POST';
      const costo       = parseFloat(form.costo) || 0;
      const stockActual = parseInt(form.stockActual) || 0;
      const stockMinimo = parseInt(form.stockMinimo) || 0;

      // Con variantes el stock/inventario los lleva el bloque de variantes; no se
      // manda el stock a nivel producto (evita un ajuste espurio).
      const conVariantesEdit = tieneVariantes && variantesEdit != null;
      const conVariantesNuevas = usaVariantesNuevas;

      const body: Record<string, unknown> = {
        nombre:               form.nombre,
        descripcion:          form.descripcion,
        referencia:           form.referencia,
        codigoBarras:         form.codigoBarras,
        precio,
        tasaItbis:            form.tasaItbis,
        tipo:                 form.tipo,
        unidadMedida:         form.unidad,
        costo,
        controlaInventario:   form.controlaInventario,
        permiteVentaSinStock: form.permiteVentaSinStock,
        categoriaId:          form.categoriaId ? Number(form.categoriaId) : null,
        imagen:               form.imagen || null,
        ...aBanderas(form.donde),
      };
      if (!conVariantesEdit && !conVariantesNuevas) {
        body.stockActual = stockActual;
        body.stockMinimo = stockMinimo;
      }
      if (conVariantesEdit) {
        body.variantAtributos = variantesEdit!.variantAtributos;
        body.variants         = variantesEdit!.variants;
      } else if (conVariantesNuevas) {
        body.variantAtributos = variantesNuevas.variantAtributos;
        body.variants         = variantesNuevas.variants;
      }

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setResetVariantes(n => n + 1);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setShowAvanzado(false); } }}>
      {/* Sin `lg:left-[calc(50%+7rem)]`. Esa compensación venía de cuando
          `DialogContent` era el de Radix —que se centra a mano con `left-1/2` y
          un translate— y había que correrlo para que el sidebar no lo tapara.
          Aquí ese mismo componente ya es un Dialog de MUI, que centra por flex:
          el `left` deja de compensar nada y se convierte en un desplazamiento a
          secas, que sacaba el modal 652 px fuera de la pantalla. */}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar ítem' : 'Nuevo producto o servicio'}</DialogTitle>
        </DialogHeader>
        {opError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
        )}

        {loadingDetalle ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6 py-2 md:grid-cols-[1fr_260px]">
          {/* ── Columna principal ──────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Tipo toggle pills — solo al crear (no se cambia el tipo luego). */}
            {!esEdicion && (
              <div>
                <div className="flex gap-2">
                  {TIPOS_ITEM.map((t) => {
                    const isSelected = form.tipo === t.value;
                    if (t.disabled) {
                      return (
                        <div key={t.value} title="Próximamente"
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium cursor-not-allowed opacity-40 bg-white border-gray-200 text-gray-400 select-none">
                          {t.label}
                        </div>
                      );
                    }
                    return (
                      <button key={t.value} type="button"
                        onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-teal-100 border-teal-300 text-teal-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}>
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
                </p>
              </div>
            )}

            {/* Nombre + Categoría */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-red-500">*</span></Label>
                <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
                  value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.categoriaId || 'ninguna'}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoriaId: v === 'ninguna' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Sin categoría</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dónde se vende — una pregunta, tres respuestas. Ver
                lib/productos/donde-se-vende.ts. */}
            <div className="space-y-1.5">
              <Label>¿Dónde se vende?</Label>
              <Select value={form.donde}
                onValueChange={(v) => setForm((f) => ({ ...f, donde: v as DondeSeVende }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPCIONES_DONDE_SE_VENDE.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      <span className="block text-sm">{o.label}</span>
                      <span className="block text-[11px] text-gray-400">{o.ayuda}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unidad de medida */}
            <div className="space-y-1.5">
              <Label>Unidad de medida</Label>
              <Select value={form.unidad} onValueChange={(v) => setForm((f) => ({ ...f, unidad: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Precio + ITBIS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Precio (DOP) <span className="text-red-500">*</span></Label>
                <Input type="number" min={0} step={0.01} placeholder="0.00"
                  value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Impuesto (ITBIS)</Label>
                <Select value={form.tasaItbis} onValueChange={(v) => setForm((f) => ({ ...f, tasaItbis: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASA_ITBIS_OPCIONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Costo — solo para bienes */}
            {form.tipo === 'bien' && (
              <div className="space-y-1.5">
                <Label>Costo de compra (DOP)</Label>
                <Input type="number" min={0} step={0.01} placeholder="0.00"
                  value={form.costo} onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))} />
                <p className="text-xs text-gray-400">Usado para calcular margen y costo de ventas. No aparece en la factura.</p>
              </div>
            )}

            {/* Variantes existentes (editar) */}
            {tieneVariantes && variantesInit && (
              <VariantesEditorEdit
                initial={variantesInit}
                basePrecioDOP={basePrecioVar}
                onChange={setVariantesEdit}
              />
            )}

            {/* Variantes nuevas (crear o convertir un bien simple) */}
            {usaEditorNuevo && (
              <VariantesEditor onChange={setVariantesNuevas} resetSignal={resetVariantes} />
            )}

            {/* Control de inventario — solo bienes sin variantes */}
            {form.tipo === 'bien' && !tieneVariantes && !usaVariantesNuevas && (
              <div className="space-y-3 border border-dashed border-teal-200 rounded-lg p-4 bg-teal-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Controlar inventario</p>
                    <p className="text-xs text-gray-400 mt-0.5">El stock se descuenta automáticamente al guardar o emitir facturas</p>
                  </div>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, controlaInventario: !f.controlaInventario }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.controlaInventario ? 'bg-teal-600' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.controlaInventario ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                {form.controlaInventario && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Stock actual</Label>
                        <Input type="number" min={0} step={1} placeholder="0"
                          value={form.stockActual} onChange={(e) => setForm((f) => ({ ...f, stockActual: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Stock mínimo</Label>
                        <Input type="number" min={0} step={1} placeholder="0"
                          value={form.stockMinimo} onChange={(e) => setForm((f) => ({ ...f, stockMinimo: e.target.value }))} />
                        <p className="text-xs text-gray-400">Alerta si el stock baja de este número</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700">Permitir venta sin stock</p>
                        <p className="text-xs text-gray-400 mt-0.5">Si está desactivado, se bloqueará la factura cuando el stock sea 0</p>
                      </div>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, permiteVentaSinStock: !f.permiteVentaSinStock }))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.permiteVentaSinStock ? 'bg-teal-600' : 'bg-gray-200'}`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.permiteVentaSinStock ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Formulario avanzado */}
            <div>
              <button type="button"
                onClick={() => setShowAvanzado((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 font-medium">
                {showAvanzado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Mostrar formulario avanzado
              </button>
              {showAvanzado && (
                <div className="mt-3 space-y-3 border border-dashed border-gray-200 rounded-lg p-4">
                  <div className="space-y-1.5">
                    <Label>Código de barras (POS)</Label>
                    <Input placeholder="Escanea o escribe el EAN/UPC" value={form.codigoBarras}
                      onChange={(e) => setForm((f) => ({ ...f, codigoBarras: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Input placeholder="Descripción opcional que aparecerá en la factura"
                      value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Atributos (maestros) — solo al editar un producto existente */}
            {esEdicion && productoId != null && <MaestrosProductoSection productId={productoId} />}
          </div>

          {/* ── Columna lateral: imagen + preview ──────────────────────── */}
          <div className="space-y-4">
            <ImagenProductoBox
              imagen={form.imagen}
              onChange={(v) => setForm((f) => ({ ...f, imagen: v }))}
            />

            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-sm font-medium text-gray-800 truncate">{form.nombre || 'Nombre del producto'}</p>
              <p className="text-sm text-gray-500">
                {form.precio ? `RD$${Number(form.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : 'RD$0.00'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">Referencia</Label>
              <Input placeholder="SERV-001" value={form.referencia}
                onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} />
            </div>
          </div>
        </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setShowAvanzado(false); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving || loadingDetalle}>
            {saving
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
              : (esEdicion ? 'Guardar cambios' : 'Crear ítem')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Imagen del producto (upload + preview) ──────────────────────────────────

function ImagenProductoBox({ imagen, onChange }: { imagen: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { setError('Imagen demasiado grande (máx 800 KB)'); return; }
    setError(null);
    onChange(await fileToBase64(file));
  }

  return (
    <div className="space-y-1.5">
      <Label>Imagen (opcional)</Label>
      <label className="relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300">
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {imagen ? (
          <>
            <img src={imagen} alt="Producto" className="h-full w-full rounded-lg object-cover" />
            <button type="button" onClick={(e) => { e.preventDefault(); onChange(''); }}
              className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-gray-600 shadow hover:bg-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Camera className="h-8 w-8" />
            <span className="text-xs text-center">Selecciona una imagen<br />Tamaño máximo: 800 KB</span>
          </>
        )}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
