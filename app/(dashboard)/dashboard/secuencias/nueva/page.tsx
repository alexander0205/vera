'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, HelpCircle } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function addYears(n: number): string {
  const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10);
}
function formatEncf(tipo: string, numero: number): string {
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

// ─── Tooltip decorativo ───────────────────────────────────────────────────────

function Tip() {
  return <HelpCircle className="h-3.5 w-3.5 text-gray-400 inline ml-1 align-middle" />;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function NuevaSecuenciaPage() {
  const router = useRouter();

  // ── Categoría y tipo ────────────────────────────────────────────────────────
  const [categoriaId, setCategoriaId] = useState(CATEGORIAS_ECF[0].id);
  const [tipoCodigo, setTipoCodigo]   = useState(CATEGORIAS_ECF[0].tipos[0].codigo);

  // ── Campos del formulario ───────────────────────────────────────────────────
  const [nombre, setNombre]                       = useState('');
  const [desde,  setDesde]                        = useState('1');
  const [hasta,  setHasta]                        = useState('1000');
  const [venc,   setVenc]                         = useState(addYears(1));
  const [preferida, setPreferida]                 = useState(false);
  const [numeracionAutomatica]                    = useState(true); // siempre true por ahora
  const [prefijo, setPrefijo]                     = useState('');
  const [pieDeFactura, setPieDeFactura]           = useState('');
  const [sucursal, setSucursal]                   = useState('');

  // ── Estado UI ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── Derivados ───────────────────────────────────────────────────────────────
  const categoria    = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  const tiposCategoria = categoria.tipos;
  const tipoActual   = tiposCategoria.find(t => t.codigo === tipoCodigo) ?? tiposCategoria[0];

  const esSinNcf       = tipoCodigo === 'sin-ncf';
  // Fecha vencimiento: NO mostrar para e32, e34 ni sin-ncf
  const showFechaVenc  = !esSinNcf && tipoCodigo !== '32' && tipoCodigo !== '34';
  // Número final: NO mostrar para sin-ncf
  const showNumeroFinal = !esSinNcf;
  // Prefijo: SOLO para sin-ncf
  const showPrefijo    = esSinNcf;
  // Pie de factura: SOLO para factura-venta y nota-credito
  const showPieFactura = categoriaId === 'factura-venta' || categoriaId === 'nota-credito';

  const desdeNum    = parseInt(desde)  || 0;
  const hastaNum    = parseInt(hasta)  || 0;
  const disponibles = showNumeroFinal ? Math.max(0, hastaNum - desdeNum + 1) : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCategoriaChange(id: string) {
    setCategoriaId(id);
    const cat = CATEGORIAS_ECF.find(c => c.id === id) ?? CATEGORIAS_ECF[0];
    setTipoCodigo(cat.tipos[0].codigo);
    // Resetear campos condicionales al cambiar categoría
    setPrefijo('');
    setPieDeFactura('');
  }

  function handleTipoChange(codigo: string) {
    setTipoCodigo(codigo);
    // Resetear campos condicionales al cambiar tipo
    if (codigo !== 'sin-ncf') setPrefijo('');
    if (!showFechaVenc) setVenc(addYears(1));
  }

  async function handleGuardar() {
    setError(null);

    // Validaciones
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (desdeNum < 1) {
      setError('El número inicial debe ser mayor a 0.');
      return;
    }
    if (showNumeroFinal && hastaNum < desdeNum) {
      setError('El número final debe ser mayor o igual al número inicial.');
      return;
    }
    if (showFechaVenc && !venc) {
      setError('La fecha de vencimiento es obligatoria para este tipo de comprobante.');
      return;
    }
    if (showFechaVenc && venc <= today()) {
      setError('La fecha de vencimiento debe ser futura.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tipoEcf:          tipoCodigo,
        nombre:           nombre.trim(),
        desde:            desdeNum,
        preferida,
        numeracionAutomatica,
        sucursal:         sucursal.trim() || undefined,
      };

      if (showNumeroFinal)  payload.hasta         = hastaNum;
      if (showFechaVenc)    payload.fechaVencimiento = venc;
      if (showPrefijo && prefijo.trim()) payload.prefijo = prefijo.trim();
      if (showPieFactura && pieDeFactura.trim()) payload.pieDeFactura = pieDeFactura.trim();

      const res  = await fetch('/api/secuencias', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push('/dashboard/secuencias');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#eef0f7] min-h-full">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link
          href="/dashboard/secuencias"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Secuencias
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nueva numeración</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Crea una numeración para organizar y tener el control de tus comprobantes.{' '}
            <a
              href="https://ayuda.dgii.gov.do"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:underline"
            >
              Saber más
            </a>
          </p>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-6 py-6 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
            {error}
          </div>
        )}

        {/* CARD: Configuración general */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Header de la card con toggle Preferida */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Configuración general</h2>
              <p className="text-xs text-gray-500 mt-0.5">Agrega los datos principales de tu numeración</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Preferida</span>
              <button
                type="button"
                onClick={() => setPreferida(p => !p)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  preferida ? 'bg-teal-600' : 'bg-gray-200'
                }`}
                aria-label="Marcar como preferida"
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    preferida ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Row 1: Tipo de documento + Tipo e-CF */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Tipo de documento <span className="text-red-500">*</span>
                </Label>
                <Select value={categoriaId} onValueChange={handleCategoriaChange}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_ECF.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Tipo <span className="text-red-500">*</span>
                  <Tip />
                </Label>
                <Select
                  value={tipoCodigo}
                  onValueChange={handleTipoChange}
                  disabled={tiposCategoria.length === 1}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposCategoria.map(t => (
                      <SelectItem key={t.codigo} value={t.codigo}>
                        {t.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tipoActual && (
                  <p className="text-xs text-gray-400">{tipoActual.nombre}</p>
                )}
              </div>
            </div>

            {/* Row 2: Numeración automática + Número inicial */}
            <div className="grid grid-cols-2 gap-4 items-start">
              {/* Numeración automática (checkbox estilo Alegra) */}
              <div className="flex items-center gap-2 pt-1">
                <div className="h-4 w-4 rounded border-2 border-teal-600 bg-teal-600 flex items-center justify-center shrink-0">
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm text-gray-700">Numeración automática</span>
                <Tip />
              </div>

              {/* Número inicial */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Número inicial <span className="text-red-500">*</span>
                  <Tip />
                </Label>
                <Input
                  className="h-10"
                  type="number"
                  min={1}
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                />
              </div>
            </div>

            {/* Row 3: Nombre + Número final (condicional) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="h-10"
                  placeholder="Ej: Facturas de crédito fiscal"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                />
              </div>

              {showNumeroFinal && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Número final
                    <Tip />
                  </Label>
                  <Input
                    className="h-10"
                    type="number"
                    min={1}
                    value={hasta}
                    onChange={e => setHasta(e.target.value)}
                  />
                  {disponibles !== null && disponibles > 0 && (
                    <p className="text-xs text-gray-400">
                      {disponibles.toLocaleString('es-DO')} comprobantes
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Row 4: Fecha vencimiento (condicional) + Sucursal */}
            <div className="grid grid-cols-2 gap-4">
              {showFechaVenc && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Fecha de vencimiento <span className="text-red-500">*</span>
                    <Tip />
                  </Label>
                  <Input
                    className="h-10"
                    type="date"
                    min={today()}
                    value={venc}
                    onChange={e => setVenc(e.target.value)}
                  />
                </div>
              )}

              <div className={`space-y-1.5 ${!showFechaVenc ? 'col-span-1' : ''}`}>
                <Label className="text-sm font-medium">
                  Sucursal
                  <Tip />
                </Label>
                <Input
                  className="h-10"
                  placeholder="Opcional"
                  value={sucursal}
                  onChange={e => setSucursal(e.target.value)}
                />
              </div>
            </div>

            {/* Row 5: Prefijo (solo sin-ncf) */}
            {showPrefijo && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Prefijo
                    <Tip />
                  </Label>
                  <Input
                    className="h-10"
                    placeholder="Ej: FAC-"
                    maxLength={20}
                    value={prefijo}
                    onChange={e => setPrefijo(e.target.value)}
                  />
                  <p className="text-xs text-gray-400">
                    Se añadirá antes del número al generar el documento
                  </p>
                </div>
              </div>
            )}

            {/* Row 6: Pie de factura (solo factura-venta y nota-credito) */}
            {showPieFactura && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Pie de factura
                  <Tip />
                </Label>
                <Textarea
                  className="resize-none text-sm"
                  rows={3}
                  placeholder="Texto que aparecerá al pie del comprobante..."
                  maxLength={2000}
                  value={pieDeFactura}
                  onChange={e => setPieDeFactura(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  {pieDeFactura.length}/2000 caracteres
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Vista previa e-NCF (solo para tipos con número) */}
        {!esSinNcf && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Vista previa del e-NCF</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Código</p>
                  <span className="inline-block font-mono text-sm font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
                    e{tipoCodigo}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Primer e-NCF</p>
                  <p className="font-mono text-sm font-bold text-gray-900">
                    {desdeNum > 0 ? formatEncf(tipoCodigo, desdeNum) : '—'}
                  </p>
                </div>
                {showNumeroFinal && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Último e-NCF</p>
                    <p className="font-mono text-sm text-gray-500">
                      {hastaNum > 0 ? formatEncf(tipoCodigo, hastaNum) : '—'}
                    </p>
                  </div>
                )}
              </div>
              {showNumeroFinal && disponibles !== null && disponibles > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-2">
                  <span className="text-sm text-gray-500">Total disponibles:</span>
                  <span className="text-base font-bold text-teal-700">
                    {disponibles.toLocaleString('es-DO')} comprobantes
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom bar con nota y botones */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Los campos con <span className="text-red-500">*</span> son obligatorios
          </p>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/secuencias">
              <Button variant="outline" disabled={saving}>Cancelar</Button>
            </Link>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white px-6"
              onClick={handleGuardar}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
