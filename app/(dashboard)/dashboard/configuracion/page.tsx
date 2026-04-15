'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2, Palette, ImageIcon, PenLine,
  CheckCircle, Loader2, Upload, X, Eye, Database, RefreshCw,
} from 'lucide-react';

// ─── Padrón DGII Card ─────────────────────────────────────────────────────────

type SyncEvent = {
  step:     'download' | 'extract' | 'prepare' | 'insert' | 'done' | 'error';
  message:  string;
  count?:   number;
  total?:   number;
  duration?: string;
};

function DgiiPadronCard() {
  const [syncing, setSyncing]   = useState(false);
  const [progress, setProgress] = useState<SyncEvent | null>(null);

  async function handleSync() {
    setSyncing(true);
    setProgress(null);

    try {
      const res = await fetch('/api/rnc/sync', { method: 'POST' });
      if (!res.body) throw new Error('Sin respuesta del servidor');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.trim().replace(/^data:\s*/, '');
          if (!dataLine) continue;
          try {
            const event: SyncEvent = JSON.parse(dataLine);
            setProgress(event);
            if (event.step === 'done' || event.step === 'error') break;
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setProgress({ step: 'error', message: err instanceof Error ? err.message : 'Error de conexión' });
    } finally {
      setSyncing(false);
    }
  }

  const pct = progress?.count && progress?.total
    ? Math.round((progress.count / progress.total) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-teal-600" />
          Padrón de Contribuyentes DGII
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          Descarga el registro oficial de contribuyentes de la DGII (~770K empresas y personas).
          Una vez sincronizado, podrás buscar cualquier RNC o razón social al crear facturas.
          Recomendamos sincronizar una vez al mes.
        </p>

        {/* Estado / progreso */}
        {progress && (
          progress.step === 'error' ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {progress.message}
            </div>
          ) : progress.step === 'done' ? (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 text-sm rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {progress.message}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-gray-600">{progress.message}</p>
              {pct !== null && (
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {pct !== null && (
                <p className="text-xs text-gray-400 text-right">{pct}%</p>
              )}
            </div>
          )
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleSync}
          disabled={syncing}
          className="border-teal-200 text-teal-700 hover:bg-teal-50"
        >
          {syncing
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando…</>
            : <><RefreshCw className="h-4 w-4 mr-2" />Sincronizar padrón DGII</>}
        </Button>
        <p className="text-xs text-gray-400">
          Fuente: <span className="font-mono">dgii.gov.do</span> — DGII_RNC.zip (~20 MB, ~2 min)
        </p>
      </CardContent>
    </Card>
  );
}

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

  // Cargar datos actuales
  useEffect(() => {
    fetch('/api/equipo/perfil')
      .then(r => r.json())
      .then(d => {
        setRazonSocial(d.razonSocial ?? '');
        setNombreComercial(d.nombreComercial ?? '');
        setRnc(d.rnc ?? '');
        setDireccion(d.direccion ?? '');
        setTelefono(d.telefono ?? '');
        setSitioWeb(d.sitioWeb ?? '');
        setEmailFacturacion(d.emailFacturacion ?? '');
        setColorPrimario(d.colorPrimario ?? '#1e40af');
        setLogo(d.logo ?? '');
        setFirma(d.firma ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/equipo/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial, nombreComercial, rnc, direccion,
          telefono, sitioWeb, emailFacturacion, colorPrimario,
          logo, firma,
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración del negocio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estos datos aparecen en todas tus facturas PDF
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-teal-600 hover:bg-teal-700 min-w-[130px]"
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
            <Input value={telefono} onChange={e => setTelefono(e.target.value)}
              placeholder="(809) 000-0000" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Calle, No., Ciudad, Provincia" />
          </div>
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

      {/* ── Padrón DGII ──────────────────────────────────────────────────────── */}
      <DgiiPadronCard />

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
