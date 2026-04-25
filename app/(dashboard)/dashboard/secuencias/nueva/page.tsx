'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function addYears(n: number): string {
  const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10);
}
function formatEncf(tipo: string, numero: number): string {
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

// Solo tipos e-CF numéricos (sin sin-ncf — no soportado por ecf-api)
const TIPOS_ECF = CATEGORIAS_ECF.flatMap(c =>
  c.tipos.filter(t => t.codigo !== 'sin-ncf')
);

// ─── Página ───────────────────────────────────────────────────────────────────

export default function NuevaSecuenciaPage() {
  const router = useRouter();

  const [tipoCodigo, setTipoCodigo] = useState(TIPOS_ECF[0].codigo);
  const [desde, setDesde]           = useState('1');
  const [hasta, setHasta]           = useState('1000');
  const [venc,  setVenc]            = useState(addYears(1));

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const desdeNum    = parseInt(desde) || 0;
  const hastaNum    = parseInt(hasta) || 0;
  const disponibles = Math.max(0, hastaNum - desdeNum + 1);
  const tipoActual  = TIPOS_ECF.find(t => t.codigo === tipoCodigo) ?? TIPOS_ECF[0];

  async function handleGuardar() {
    setError(null);

    if (desdeNum < 1) { setError('El número inicial debe ser mayor a 0.'); return; }
    if (hastaNum < desdeNum) { setError('El número final debe ser mayor o igual al inicial.'); return; }
    if (!venc || venc <= today()) { setError('La fecha de vencimiento debe ser futura.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/secuencias', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoComprobante: tipoCodigo,
          desde: desdeNum,
          hasta: hastaNum,
          fechaVencimiento: venc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push('/dashboard/secuencias');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      setSaving(false);
    }
  }

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
          <h1 className="text-xl font-bold text-gray-900">Nuevo rango de numeración</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registra el rango de e-NCF autorizado por la DGII para tu empresa.
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
            {error}
          </div>
        )}

        {/* CARD: Datos del rango */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Datos del rango</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Ingresa exactamente los valores que aparecen en tu autorización de la DGII
            </p>
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Tipo de comprobante */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Tipo de comprobante <span className="text-red-500">*</span>
              </Label>
              <Select value={tipoCodigo} onValueChange={setTipoCodigo}>
                <SelectTrigger className="h-10 max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_ECF.map(cat => (
                    <div key={cat.id}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {cat.label}
                      </div>
                      {cat.tipos
                        .filter(t => t.codigo !== 'sin-ncf')
                        .map(t => (
                          <SelectItem key={t.codigo} value={t.codigo}>
                            <span className="font-mono text-xs mr-2 text-teal-700">e{t.codigo}</span>
                            {t.etiqueta}
                          </SelectItem>
                        ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {tipoActual && (
                <p className="text-xs text-gray-400">{tipoActual.nombre}</p>
              )}
            </div>

            {/* Desde / Hasta */}
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Número inicial <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="h-10"
                  type="number"
                  min={1}
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Número final <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="h-10"
                  type="number"
                  min={1}
                  value={hasta}
                  onChange={e => setHasta(e.target.value)}
                />
                {disponibles > 0 && (
                  <p className="text-xs text-gray-400">
                    {disponibles.toLocaleString('es-DO')} comprobantes
                  </p>
                )}
              </div>
            </div>

            {/* Fecha de vencimiento */}
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-sm font-medium">
                Fecha de vencimiento <span className="text-red-500">*</span>
              </Label>
              <Input
                className="h-10"
                type="date"
                min={today()}
                value={venc}
                onChange={e => setVenc(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                Tal como aparece en tu autorización de la DGII
              </p>
            </div>

          </div>
        </div>

        {/* Vista previa */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Vista previa</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Tipo</p>
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
              <div className="space-y-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Último e-NCF</p>
                <p className="font-mono text-sm text-gray-500">
                  {hastaNum > 0 ? formatEncf(tipoCodigo, hastaNum) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
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
              ) : 'Guardar rango'}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
