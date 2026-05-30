'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2, Palette, ImageIcon, PenLine,
  CheckCircle, Loader2, Upload, X, Eye, AlertCircle,
} from 'lucide-react';
import { ProvinciaMunicipioSelect } from '@/components/provincia-municipio-select';
import { EquipoCard } from './EquipoCard';
import { formatTelefonoDO } from '@/lib/utils/format';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const COLORES = [
  { label: 'Azul DGII',    value: '#1e40af' },
  { label: 'Azul oscuro',  value: '#1e3a5f' },
  { label: 'Verde',        value: '#15803d' },
  { label: 'Rojo',         value: '#b91c1c' },
  { label: 'Morado',       value: '#7c3aed' },
  { label: 'Naranja',      value: '#c2410c' },
  { label: 'Gris oscuro',  value: '#374151' },
  { label: 'Negro',        value: '#111827' },
];

// ─── Sub-componente: UploadImagen ─────────────────────────────────────────────

function UploadImagen({
  label, hint, value, onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 800_000) {
      alert('Imagen demasiado grande (máx 800 KB). Comprime antes de subir.');
      return;
    }
    const b64 = await fileToBase64(file);
    onChange(b64);
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-gray-500">{hint}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
        onClick={() => inputRef.current?.click()}
        style={{ minHeight: 100 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {value ? (
          <div className="flex items-center justify-center p-4 gap-4">
            <img src={value} alt={label} className="max-h-20 max-w-[180px] object-contain rounded" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-400">
            <Upload className="h-8 w-8" />
            <span className="text-sm">Arrastra o haz click para subir</span>
            <span className="text-xs">PNG, JPG, SVG · Máx 800 KB</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Campos
  const [razonSocial, setRazonSocial]           = useState('');
  const [nombreComercial, setNombreComercial]   = useState('');
  const [rnc, setRnc]                           = useState('');
  const [direccion, setDireccion]               = useState('');
  const [telefono, setTelefono]                 = useState('');
  const [sitioWeb, setSitioWeb]                 = useState('');
  const [emailFacturacion, setEmailFacturacion] = useState('');
  const [colorPrimario, setColorPrimario]       = useState('#1e40af');
  const [logo, setLogo]                         = useState('');
  const [firma, setFirma]                       = useState('');
  const [previewPDF, setPreviewPDF]             = useState(false);
  const [provincia, setProvincia]               = useState('');
  const [municipio, setMunicipio]               = useState('');
  // Recargo por mora
  const [recargoActivo, setRecargoActivo]               = useState(false);
  const [recargoPorcentaje, setRecargoPorcentaje]       = useState('2.00');   // mostrado como %
  const [recargoDiasGracia, setRecargoDiasGracia]       = useState('5');

  // Cargar datos actuales
  useEffect(() => {
    fetch('/api/equipo/perfil')
      .then(r => r.json())
      .then(d => {
        setRazonSocial(d.razonSocial ?? '');
        setNombreComercial(d.nombreComercial ?? '');
        setRnc(d.rnc ?? '');
        setDireccion(d.direccion ?? '');
        setTelefono(formatTelefonoDO(d.telefono ?? ''));
        setSitioWeb(d.sitioWeb ?? '');
        setEmailFacturacion(d.emailFacturacion ?? '');
        setColorPrimario(d.colorPrimario ?? '#1e40af');
        setLogo(d.logo ?? '');
        setFirma(d.firma ?? '');
        setProvincia(d.provincia ?? '');
        setMunicipio(d.municipio ?? '');
        // Recargo por mora — convertir bps → %
        setRecargoActivo(d.recargoMoraActivo ?? false);
        setRecargoPorcentaje(((d.recargoMoraPorcentaje ?? 200) / 100).toFixed(2));
        setRecargoDiasGracia(String(d.recargoMoraDiasGracia ?? 5));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Convertir % → bps para guardar (ej: "2.50" → 250)
      const pctBps = Math.round(parseFloat(recargoPorcentaje || '0') * 100);
      const diasGracia = parseInt(recargoDiasGracia || '0', 10);

      const res = await fetch('/api/equipo/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial, nombreComercial, rnc, direccion,
          provincia, municipio,
          telefono, sitioWeb, emailFacturacion, colorPrimario,
          logo, firma,
          recargoMoraActivo:     recargoActivo,
          recargoMoraPorcentaje: pctBps,
          recargoMoraDiasGracia: diasGracia,
        }),
      });
      if (!res.ok) throw new Error('Error guardando');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Configuración del negocio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estos datos aparecen en todas tus facturas PDF
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-teal-600 hover:bg-teal-700 sm:min-w-[130px] w-full sm:w-auto"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</>
          ) : saved ? (
            <><CheckCircle className="h-4 w-4 mr-2" />Guardado</>
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
          {error}
        </div>
      )}

      {/* 1. Datos fiscales */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-600" />
            Datos fiscales
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Razón Social</Label>
            <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)}
              placeholder="Empresa XYZ SRL" />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre Comercial</Label>
            <Input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)}
              placeholder="MiTienda (opcional)" />
          </div>
          <div className="space-y-1.5">
            <Label>RNC</Label>
            <Input value={rnc} onChange={e => setRnc(e.target.value)}
              placeholder="130123456" maxLength={11} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={e => setTelefono(formatTelefonoDO(e.target.value))}
              inputMode="tel"
              placeholder="(809) 000-0000" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Calle y número" />
          </div>
          {/* Provincia / Municipio en cascada */}
          <ProvinciaMunicipioSelect
            provincia={provincia}
            municipio={municipio}
            onProvinciaChange={setProvincia}
            onMunicipioChange={setMunicipio}
            className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4"
          />
          <div className="space-y-1.5">
            <Label>Email de facturación</Label>
            <Input type="email" value={emailFacturacion}
              onChange={e => setEmailFacturacion(e.target.value)}
              placeholder="facturacion@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Sitio web</Label>
            <Input value={sitioWeb} onChange={e => setSitioWeb(e.target.value)}
              placeholder="www.miempresa.com" />
          </div>
        </CardContent>
      </Card>

      {/* 2. Logo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-teal-600" />
            Logo de la empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UploadImagen
            label="Logo"
            hint="Aparece en la esquina superior izquierda de cada factura. Fondo transparente recomendado."
            value={logo}
            onChange={setLogo}
          />
        </CardContent>
      </Card>

      {/* 3. Firma */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-teal-600" />
            Firma autorizada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UploadImagen
            label="Imagen de firma"
            hint="Aparece en el pie de cada factura. Usa fondo blanco o transparente."
            value={firma}
            onChange={setFirma}
          />
        </CardContent>
      </Card>

      {/* 4. Color */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-teal-600" />
            Color de marca
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Se usa en el encabezado, tabla y totales del PDF de la factura.
          </p>

          {/* Paleta rápida */}
          <div className="flex flex-wrap gap-2">
            {COLORES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColorPrimario(c.value)}
                title={c.label}
                className={`w-9 h-9 rounded-full border-2 transition-all ${
                  colorPrimario === c.value
                    ? 'border-gray-900 scale-110 shadow-md'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          {/* Picker manual */}
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorPrimario}
              onChange={e => setColorPrimario(e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <Input
              value={colorPrimario}
              onChange={e => setColorPrimario(e.target.value)}
              placeholder="#1e40af"
              className="w-32 font-mono"
              maxLength={7}
            />
            <div
              className="flex-1 h-10 rounded-lg border border-gray-200 flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: colorPrimario }}
            >
              Vista previa
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview visual del encabezado */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-teal-600" />
            Previsualización del encabezado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            {/* Simula el header del PDF */}
            <div
              className="flex items-center justify-between p-4 text-white"
              style={{ backgroundColor: colorPrimario }}
            >
              {logo ? (
                <img src={logo} alt="Logo" className="h-12 object-contain bg-white rounded p-1" />
              ) : (
                <div className="bg-white/20 rounded px-3 py-2 text-sm font-bold">
                  {(nombreComercial || razonSocial || 'LOGO').substring(0, 8).toUpperCase()}
                </div>
              )}
              <div className="text-right">
                <div className="text-xl font-bold tracking-widest">e-CF</div>
                <div className="text-sm opacity-80 font-mono">E320000000001</div>
                <div className="text-xs opacity-70">Factura de Consumo</div>
              </div>
            </div>
            <div className="p-4 bg-white text-sm text-gray-700 space-y-0.5">
              <p className="font-bold">{nombreComercial || razonSocial || 'Nombre de tu empresa'}</p>
              <p className="text-gray-500">RNC: {rnc || '000-00000-0'}</p>
              {direccion && <p className="text-gray-500">{direccion}</p>}
              {telefono && <p className="text-gray-500">Tel: {telefono}</p>}
              {emailFacturacion && <p className="text-gray-500">{emailFacturacion}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Padrón DGII se sincroniza automáticamente vía cron diario — no UI expuesta */}

      {/* 5. Recargo por mora */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-teal-600" />
            Recargo por mora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Aplica automáticamente un recargo a facturas a crédito vencidas.
            El recargo se suma al saldo de cobranza — el documento fiscal original no se modifica.
          </p>

          {/* Toggle activar */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Activar recargo por mora</p>
              <p className="text-xs text-gray-400 mt-0.5">
                El cron diario (09:00 UTC) aplicará el recargo una sola vez por factura.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={recargoActivo}
              onClick={() => setRecargoActivo(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                recargoActivo ? 'bg-teal-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  recargoActivo ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Porcentaje y días de gracia */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity ${recargoActivo ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="space-y-1.5">
              <Label>Porcentaje de recargo (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={recargoPorcentaje}
                  onChange={e => setRecargoPorcentaje(e.target.value)}
                  placeholder="2.00"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
              <p className="text-xs text-gray-400">Default: 2.00% (200 basis points)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Días de gracia</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={recargoDiasGracia}
                  onChange={e => setRecargoDiasGracia(e.target.value)}
                  placeholder="5"
                  className="pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
              </div>
              <p className="text-xs text-gray-400">
                El recargo se aplica si la factura lleva más de estos días vencida. Default: 5.
              </p>
            </div>
          </div>

          {recargoActivo && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              <strong>Nota fiscal:</strong> El recargo NO modifica la factura electrónica emitida ante la DGII.
              Solo se suma al saldo visible en Cuentas por cobrar y en tickets de cobranza.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipo y permisos — solo el owner ve esta pantalla (gate en layout.tsx) */}
      <EquipoCard />

      {/* Botón guardar final */}
      <div className="flex justify-end pb-6">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-teal-600 hover:bg-teal-700 min-w-[160px]"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</>
          ) : saved ? (
            <><CheckCircle className="h-4 w-4 mr-2" />¡Guardado!</>
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </div>
  );
}
