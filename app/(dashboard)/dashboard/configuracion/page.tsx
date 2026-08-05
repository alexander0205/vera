'use client';

import { useState, useEffect, useRef } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Palette, ImageIcon, PenLine,
  CheckCircle, Loader2, Upload, X, Eye, AlertCircle, Wallet, Lock, CreditCard,
} from 'lucide-react';
import { ProvinciaMunicipioSelect } from '@/components/provincia-municipio-select';
import { EquipoCard } from './EquipoCard';
import { formatTelefonoDO } from '@/lib/utils/format';
import { roleHasPermission } from '@/lib/config/roles';
import { METODOS_PAGO } from '@/lib/pagos/metodos';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Formatea un monto DOP para los ejemplos (sin decimales si es entero). */
function fmtEjemplo(dop: number): string {
  return `RD$${dop.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
}

/** Formatea una fecha para el ejemplo: "5 de agosto". */
function fmtDiaMes(d: Date): string {
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long' });
}

interface PasoEjemplo { fecha: string; titulo: string; detalle: string; monto?: string }

/**
 * Construye un ejemplo paso a paso de cómo se aplicaría la mora sobre una
 * factura de RD$10,000, con la configuración actual. Solo para ilustrar en la UI.
 */
function construirEjemploMora(opts: {
  modo: 'porcentaje' | 'fijo';
  porcentaje: number;      // %
  montoFijo: number;       // DOP
  diasGracia: number;
  periodicidad: number;    // días; 0 = una sola vez
}): PasoEjemplo[] {
  const base = 10_000;
  const cargo = opts.modo === 'fijo'
    ? opts.montoFijo
    : Math.round(base * opts.porcentaje) / 100;
  const hoy = new Date();
  const masDias = (n: number) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d; };

  const pasos: PasoEjemplo[] = [
    {
      fecha: fmtDiaMes(hoy),
      titulo: 'Factura original',
      detalle: `Monto ${fmtEjemplo(base)}. Vence este día.`,
    },
    {
      fecha: fmtDiaMes(masDias(opts.diasGracia)),
      titulo: 'Primer recargo',
      detalle: opts.diasGracia > 0
        ? `${opts.diasGracia} día${opts.diasGracia === 1 ? '' : 's'} después del vencimiento, si sigue sin pagarse.`
        : 'Al día siguiente del vencimiento, si sigue sin pagarse.',
      monto: fmtEjemplo(cargo),
    },
  ];

  if (opts.periodicidad > 0) {
    pasos.push({
      fecha: fmtDiaMes(masDias(opts.diasGracia + opts.periodicidad)),
      titulo: 'Segundo recargo',
      detalle: `Si aún hay saldo, se cobra otra vez sobre el saldo pendiente.`,
      monto: fmtEjemplo(cargo),
    });
    pasos.push({
      fecha: `Cada ${opts.periodicidad} días`,
      titulo: 'Se repite',
      detalle: 'Hasta que se pague la factura o se alcance el límite (si tiene).',
    });
  } else {
    pasos.push({
      fecha: '—',
      titulo: 'No se repite',
      detalle: 'Se cobra una sola vez.',
    });
  }

  return pasos;
}

/** Traduce la periodicidad en días a una frase clara para el usuario. */
function etiquetaPeriodicidad(dias: number): string {
  if (!dias || dias <= 0) return 'Se cobra una sola vez al vencer.';
  const equivalente =
    dias === 7  ? ' (semanal)' :
    dias === 15 ? ' (quincenal)' :
    dias === 30 ? ' (mensual)' :
    dias === 60 ? ' (cada 2 meses)' :
    dias === 90 ? ' (trimestral)' :
    dias === 365 ? ' (anual)' : '';
  return `Se repite cada ${dias} días${equivalente} mientras siga vencida.`;
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
  label, hint, value, onChange, disabled = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
        onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={`relative border-2 border-dashed rounded-xl transition-colors
          ${disabled ? 'cursor-not-allowed opacity-60 bg-gray-50 border-gray-200' : `cursor-pointer ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}`}
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
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
  const [role, setRole]           = useState<string | null>(null);

  // Permisos derivados del rol
  const canManage     = roleHasPermission(role, 'configuracion:gestionar');
  const canManageTeam = roleHasPermission(role, 'equipo:gestionar');

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
  const [recargoModo, setRecargoModo]                   = useState<'porcentaje' | 'fijo'>('porcentaje');
  const [recargoMontoFijo, setRecargoMontoFijo]         = useState('500.00'); // mostrado en RD$
  const [recargoDiasGracia, setRecargoDiasGracia]       = useState('0');      // días tras el vencimiento
  const [recargoPeriodicidad, setRecargoPeriodicidad]   = useState('0');      // días; 0 = una sola vez
  const [recargoTope, setRecargoTope]                   = useState('');       // % de mora acumulada; '' = sin tope
  const [recargoMaxPeriodos, setRecargoMaxPeriodos]     = useState('');       // '' = sin límite
  // Módulo cuadre de caja
  const [cajaHabilitada, setCajaHabilitada]             = useState(false);
  // null = sin límite. Es el estado real por defecto: la función nace apagada.
  const [cajaLimiteHoras, setCajaLimiteHoras]           = useState<number | null>(null);
  const [cajaAvisoMinutos, setCajaAvisoMinutos]         = useState(60);
  const [cajaGraciaHoras, setCajaGraciaHoras]           = useState<number | null>(2);
  // Alerta double-check del método de pago
  const [alertaMetodoPagoActivo, setAlertaMetodoPagoActivo] = useState(false);
  // Módulo punto de venta (POS)
  const [posHabilitado, setPosHabilitado]               = useState(false);
  const [posEscolarHabilitado, setPosEscolarHabilitado] = useState(false);
  // Plazo de pago por defecto: '' = de contado; '8'/'15'/'30'/'60' = crédito N días
  const [plazoDefaultDias, setPlazoDefaultDias]         = useState('');
  // Métodos de pago que obligan emisión a la DGII (bloquean guardar como borrador)
  const [metodosObligaDgii, setMetodosObligaDgii]      = useState<string[]>([]);

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
        setRecargoModo(d.recargoMoraModo === 'fijo' ? 'fijo' : 'porcentaje');
        setRecargoMontoFijo(((d.recargoMoraMontoCents ?? 50000) / 100).toFixed(2));
        setRecargoDiasGracia(String(d.recargoMoraDiasGracia ?? 0));
        setRecargoPeriodicidad(String(d.recargoMoraPeriodicidadDias ?? 0));
        setRecargoTope(d.recargoMoraTopeBps ? (d.recargoMoraTopeBps / 100).toFixed(0) : '');
        setRecargoMaxPeriodos(d.recargoMoraMaxPeriodos ? String(d.recargoMoraMaxPeriodos) : '');
        // Módulo caja
        setCajaHabilitada(d.cajaHabilitada ?? false);
        setCajaLimiteHoras(d.cajaLimiteHoras ?? null);
        setCajaAvisoMinutos(d.cajaAvisoMinutos ?? 60);
        setCajaGraciaHoras(d.cajaGraciaHoras ?? null);
        // Alerta método de pago
        setAlertaMetodoPagoActivo(d.alertaMetodoPagoActivo ?? false);
        // Módulo POS
        setPosHabilitado(d.posHabilitado ?? false);
        setPosEscolarHabilitado(d.posEscolarHabilitado ?? false);
        setPlazoDefaultDias(d.plazoPagoDefaultDias != null ? String(d.plazoPagoDefaultDias) : '');
        setMetodosObligaDgii(Array.isArray(d.metodosObligaDgii) ? d.metodosObligaDgii : []);
        setRole(d.role ?? null);
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
          recargoMoraModo:       recargoModo,
          recargoMoraMontoCents: Math.round(parseFloat(recargoMontoFijo || '0') * 100),
          recargoMoraDiasGracia: parseInt(recargoDiasGracia || '0', 10),
          recargoMoraPeriodicidadDias: parseInt(recargoPeriodicidad || '0', 10),
          // Mora sobre mora descartada: la mora siempre se calcula sobre el
          // saldo de la factura (base simple). La columna queda en false.
          recargoMoraCompuesta:  false,
          recargoMoraTopeBps:    recargoTope ? Math.round(parseFloat(recargoTope) * 100) : 0,
          recargoMoraMaxPeriodos: recargoMaxPeriodos ? parseInt(recargoMaxPeriodos, 10) : 0,
          cajaHabilitada,
          cajaLimiteHoras,
          cajaAvisoMinutos,
          cajaGraciaHoras,
          alertaMetodoPagoActivo,
          posHabilitado,
          posEscolarHabilitado,
          plazoPagoDefaultDias:  plazoDefaultDias ? parseInt(plazoDefaultDias, 10) : null,
          metodosObligaDgii,
        }),
      });
      if (!res.ok) throw new Error('Error guardando');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      mutate('/api/empresa/list');
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
    <div className="p-4 sm:p-6 min-h-full flex flex-col">
      <div className="flex flex-col flex-1 gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Configuración del negocio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estos datos aparecen en todas tus facturas PDF
          </p>
        </div>
        {canManage && (
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
        )}
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-700">
          <Lock className="h-4 w-4 shrink-0" />
          Solo lectura — tu rol puede ver la configuración pero no modificarla.
        </div>
      )}

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
              placeholder="Empresa XYZ SRL" disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre Comercial</Label>
            <Input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)}
              placeholder="MiTienda (opcional)" disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label>RNC</Label>
            <Input value={rnc} onChange={e => setRnc(e.target.value)}
              placeholder="130123456" maxLength={11} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={e => setTelefono(formatTelefonoDO(e.target.value))}
              inputMode="tel"
              placeholder="(809) 000-0000" disabled={!canManage} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Calle y número" disabled={!canManage} />
          </div>
          {/* Provincia / Municipio en cascada */}
          <div className={`md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 ${!canManage ? 'pointer-events-none opacity-60' : ''}`}>
            <ProvinciaMunicipioSelect
              provincia={provincia}
              municipio={municipio}
              onProvinciaChange={setProvincia}
              onMunicipioChange={setMunicipio}
              className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email de facturación</Label>
            <Input type="email" value={emailFacturacion}
              onChange={e => setEmailFacturacion(e.target.value)}
              placeholder="facturacion@empresa.com" disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label>Sitio web</Label>
            <Input value={sitioWeb} onChange={e => setSitioWeb(e.target.value)}
              placeholder="www.miempresa.com" disabled={!canManage} />
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
            disabled={!canManage}
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
            disabled={!canManage}
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
          <div className={`flex flex-wrap gap-2 ${!canManage ? 'pointer-events-none opacity-60' : ''}`}>
            {COLORES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColorPrimario(c.value)}
                title={c.label}
                disabled={!canManage}
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
              disabled={!canManage}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Input
              value={colorPrimario}
              onChange={e => setColorPrimario(e.target.value)}
              placeholder="#1e40af"
              className="w-32 font-mono"
              maxLength={7}
              disabled={!canManage}
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

      {/* 5. Plazo de pago por defecto — solo roles con configuracion:gestionar */}
      {canManage && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-teal-600" />
            Plazo de pago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Plazo de pago por defecto al crear una factura nueva o recurrente.
            Puedes cambiarlo en cada factura.
          </p>
          <div className="space-y-1.5 md:max-w-xs">
            <Label>Plazo de pago por defecto</Label>
            <Select value={plazoDefaultDias || 'contado'} onValueChange={v => setPlazoDefaultDias(v === 'contado' ? '' : v)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contado">De contado</SelectItem>
                <SelectItem value="8">8 días</SelectItem>
                <SelectItem value="15">15 días</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
                <SelectItem value="60">60 días</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              «De contado» no genera fecha de vencimiento.
            </p>
          </div>
        </CardContent>
      </Card>}

      {/* 5b. Métodos que obligan emisión a la DGII — solo configuracion:gestionar */}
      {canManage && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-teal-600" />
            Métodos que obligan facturar a la DGII
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Cuando una factura registra un cobro con alguno de estos métodos, no se
            podrá guardar sin emitir: habrá que emitirla a la DGII. Útil, por
            ejemplo, para que toda venta con tarjeta quede fiscalizada.
          </p>

          <div className="space-y-2">
            {METODOS_PAGO.map(m => {
              const activo = metodosObligaDgii.includes(m.value);
              return (
                <div
                  key={m.value}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
                >
                  <p className="text-sm font-medium text-gray-800">{m.label}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    aria-label={`Obligar DGII para ${m.label}`}
                    onClick={() => setMetodosObligaDgii(prev =>
                      prev.includes(m.value)
                        ? prev.filter(v => v !== m.value)
                        : [...prev, m.value],
                    )}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                      activo ? 'bg-teal-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        activo ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {metodosObligaDgii.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              <strong>Activo:</strong> las facturas cobradas con{' '}
              {metodosObligaDgii.map(v => METODOS_PAGO.find(m => m.value === v)?.label ?? v).join(', ')}{' '}
              no se podrán guardar sin emitir — se deben emitir a la DGII.
            </div>
          )}
        </CardContent>
      </Card>}

      {/* 6. Recargo por mora — solo roles con configuracion:gestionar */}
      {canManage && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-teal-600" />
            Recargo por mora
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">Cobra un extra cuando la factura se paga tarde.</p>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Toggle Activado */}
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors ${
            recargoActivo ? 'border-teal-200 bg-teal-50/60' : 'border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={recargoActivo}
                onClick={() => setRecargoActivo(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                  recargoActivo ? 'bg-teal-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  recargoActivo ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <div>
                <p className={`text-sm font-semibold ${recargoActivo ? 'text-teal-700' : 'text-gray-500'}`}>
                  {recargoActivo ? 'Activado' : 'Desactivado'}
                </p>
                <p className="text-xs text-gray-500">
                  Se aplicarán recargos automáticamente a las facturas a crédito vencidas.
                </p>
              </div>
            </div>
          </div>

          {/* Layout: formulario (izq) + ejemplo (der) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

            {/* ── FORM ─────────────────────────────────────────────── */}
            <div className={`space-y-6 ${recargoActivo ? '' : 'opacity-40 pointer-events-none'}`}>

              {/* Sección 1: ¿Cuánto cobrar? */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">1</span>
                  ¿Cuánto cobrar?
                </h3>
                <div className="space-y-1.5 md:max-w-sm">
                  <Label>Tipo de recargo</Label>
                  <Select value={recargoModo} onValueChange={v => setRecargoModo(v as 'porcentaje' | 'fijo')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porcentaje">Porcentaje del saldo pendiente</SelectItem>
                      <SelectItem value="fijo">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recargoModo === 'porcentaje' ? (
                  <div className="space-y-1.5 md:max-w-sm">
                    <Label>Porcentaje de recargo</Label>
                    <div className="relative">
                      <Input
                        type="number" step="0.01" min="0.01" max="100"
                        value={recargoPorcentaje}
                        onChange={e => setRecargoPorcentaje(e.target.value)}
                        placeholder="2.00" className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Se cobrará el {parseFloat(recargoPorcentaje || '0').toFixed(2)}% del saldo pendiente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 md:max-w-sm">
                    <Label>Monto fijo del recargo</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">RD$</span>
                      <Input
                        type="number" step="0.01" min="0.01"
                        value={recargoMontoFijo}
                        onChange={e => setRecargoMontoFijo(e.target.value)}
                        placeholder="500.00" className="pl-11"
                      />
                    </div>
                    <p className="text-xs text-gray-400">Se cobra este monto exacto en cada recargo.</p>
                  </div>
                )}
              </section>

              {/* Sección 2: ¿Cuándo empezar? */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">2</span>
                  ¿Cuándo empezar?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Días de gracia</Label>
                    <div className="relative">
                      <Input
                        type="number" step="1" min="0" max="365"
                        value={recargoDiasGracia}
                        onChange={e => setRecargoDiasGracia(e.target.value)}
                        placeholder="0" className="pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Días después del vencimiento antes de aplicar el primer recargo. 0 = al día siguiente.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>¿Cada cuánto se repite?</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { dias: 0,  label: 'Una sola vez' },
                        { dias: 15, label: 'Cada 15 días' },
                        { dias: 30, label: 'Cada 30 días' },
                        { dias: 60, label: 'Cada 60 días' },
                      ].map(opt => {
                        const activo = parseInt(recargoPeriodicidad || '0', 10) === opt.dias;
                        return (
                          <button
                            key={opt.dias}
                            type="button"
                            onClick={() => setRecargoPeriodicidad(String(opt.dias))}
                            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                              activo
                                ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400">
                      {etiquetaPeriodicidad(parseInt(recargoPeriodicidad || '0', 10))}
                    </p>
                  </div>
                </div>
              </section>

              {/* Sección 3: ¿Poner límites? (opcional) */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">3</span>
                  ¿Poner límites al recargo?
                  <span className="text-xs font-normal text-gray-400">(opcional)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Límite del monto total</Label>
                    <Select
                      value={recargoTope === '' ? 'sin' : recargoTope}
                      onValueChange={v => setRecargoTope(v === 'sin' ? '' : v)}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sin">Sin límite</SelectItem>
                        {recargoTope && !['25', '50', '100', '150', '200'].includes(recargoTope) && (
                          <SelectItem value={recargoTope}>{recargoTope}% de la factura</SelectItem>
                        )}
                        <SelectItem value="25">25% de la factura</SelectItem>
                        <SelectItem value="50">50% de la factura</SelectItem>
                        <SelectItem value="100">100% de la factura</SelectItem>
                        <SelectItem value="150">150% de la factura</SelectItem>
                        <SelectItem value="200">200% de la factura</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">
                      Máximo que se puede cobrar de recargos en esta factura.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Máximo de veces que se aplica</Label>
                    <Select
                      value={recargoMaxPeriodos === '' ? 'sin' : recargoMaxPeriodos}
                      onValueChange={v => setRecargoMaxPeriodos(v === 'sin' ? '' : v)}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sin">Sin límite</SelectItem>
                        {recargoMaxPeriodos && !['1', '3', '6', '12'].includes(recargoMaxPeriodos) && (
                          <SelectItem value={recargoMaxPeriodos}>{recargoMaxPeriodos} veces</SelectItem>
                        )}
                        <SelectItem value="1">1 vez</SelectItem>
                        <SelectItem value="3">3 veces</SelectItem>
                        <SelectItem value="6">6 veces</SelectItem>
                        <SelectItem value="12">12 veces</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">
                      Número máximo de recargos que se aplicarán.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* ── ASÍ FUNCIONA (ejemplo dinámico) ──────────────────── */}
            <aside className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 h-fit lg:sticky lg:top-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Así funciona (ejemplo)</h3>
              <ol className="space-y-3">
                {construirEjemploMora({
                  modo: recargoModo,
                  porcentaje: parseFloat(recargoPorcentaje || '0'),
                  montoFijo: parseFloat(recargoMontoFijo || '0'),
                  diasGracia: parseInt(recargoDiasGracia || '0', 10),
                  periodicidad: parseInt(recargoPeriodicidad || '0', 10),
                }).map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                      {i < 3 && <span className="flex-1 w-px bg-gray-200 my-1" />}
                    </div>
                    <div className="min-w-0 -mt-1">
                      <p className="text-xs font-semibold text-gray-900">{paso.titulo}</p>
                      <p className="text-[11px] text-gray-500">{paso.fecha}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{paso.detalle}</p>
                      {paso.monto && (
                        <p className="text-xs font-semibold text-teal-700 mt-0.5">= {paso.monto}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-800">
                El recargo siempre se calcula sobre el saldo pendiente. Los recargos anteriores no
                generan nuevos recargos.
              </p>
            </aside>
          </div>

          {/* Resumen de tu configuración */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-3.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
              <CheckCircle className="h-4 w-4 text-teal-600" />
              Resumen de tu configuración
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Recargo</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {recargoModo === 'fijo'
                    ? `${fmtEjemplo(parseFloat(recargoMontoFijo || '0'))} fijo`
                    : `${parseFloat(recargoPorcentaje || '0').toFixed(2)}% del saldo`}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Inicia</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {parseInt(recargoDiasGracia || '0', 10) > 0
                    ? `${recargoDiasGracia} días después del vencimiento`
                    : 'Al día siguiente del vencimiento'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Se repite</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {parseInt(recargoPeriodicidad || '0', 10) > 0
                    ? `Cada ${recargoPeriodicidad} días`
                    : 'Una sola vez'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Límites</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {recargoTope ? `Hasta ${recargoTope}% de la factura` : 'Sin límite de monto'}
                  {recargoMaxPeriodos ? ` · máx. ${recargoMaxPeriodos} veces` : ' · sin límite de veces'}
                </p>
              </div>
            </div>
          </div>

          {recargoActivo && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              <strong>Nota fiscal:</strong> El recargo NO modifica la factura electrónica emitida ante la DGII.
              Solo se suma al saldo visible en Cuentas por cobrar y en los tickets de cobranza.
            </div>
          )}
        </CardContent>
      </Card>}

      {/* 6. Módulo de caja — solo roles con configuracion:gestionar */}
      {canManage && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-teal-600" />
            Cuadre de Caja
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Habilita el módulo de apertura y cierre de turnos de caja. Los cajeros deberán
            abrir un turno antes de emitir facturas, y el sistema calculará automáticamente
            el efectivo esperado al cierre.
          </p>

          {/* Toggle activar */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Activar cuadre de caja</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Aparecerá el menú "Caja" en el panel y se requerirá turno abierto para facturar.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={cajaHabilitada}
              onClick={() => setCajaHabilitada(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                cajaHabilitada ? 'bg-teal-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  cajaHabilitada ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {cajaHabilitada && (
            <>
              {/* Límite de duración del turno */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="caja-limite" className="text-sm font-medium text-gray-800">
                    Límite del turno (horas)
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5 mb-1.5">
                    Vacío = sin límite ni avisos.
                  </p>
                  <Input
                    id="caja-limite"
                    type="number"
                    min={1}
                    max={24}
                    className="h-9 text-sm"
                    placeholder="8"
                    value={cajaLimiteHoras ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setCajaLimiteHoras(v === '' ? null : parseInt(v, 10));
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="caja-aviso" className="text-sm font-medium text-gray-800">
                    Avisar desde (min antes)
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5 mb-1.5">
                    Cuándo aparece el contador arriba.
                  </p>
                  <Input
                    id="caja-aviso"
                    type="number"
                    min={5}
                    max={240}
                    className="h-9 text-sm"
                    placeholder="60"
                    value={cajaAvisoMinutos}
                    onChange={(e) => setCajaAvisoMinutos(parseInt(e.target.value, 10) || 60)}
                  />
                </div>
                <div>
                  <label htmlFor="caja-gracia" className="text-sm font-medium text-gray-800">
                    Gracia antes de bloquear (h)
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5 mb-1.5">
                    Vacío o 0 = nunca bloquea, solo avisa.
                  </p>
                  <Input
                    id="caja-gracia"
                    type="number"
                    min={0}
                    max={12}
                    className="h-9 text-sm"
                    placeholder="2"
                    value={cajaGraciaHoras ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setCajaGraciaHoras(v === '' ? null : parseInt(v, 10));
                    }}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-xs text-teal-700">
                <strong>Activo:</strong> El módulo "Caja" aparecerá en el menú lateral. Cada cajero
                debe abrir su turno antes de emitir o cobrar. Los cierres con descuadre requieren
                aprobación de un admin u owner.
              </div>

              {cajaLimiteHoras ? (
                <div className={`rounded-lg border px-4 py-3 text-xs ${
                  cajaGraciaHoras
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}>
                  {cajaGraciaHoras ? (
                    <>
                      <strong>Bloqueo activo:</strong> el contador aparece a las{' '}
                      {cajaLimiteHoras}h menos {cajaAvisoMinutos} min. A las {cajaLimiteHoras}h el
                      turno vence, y a las {cajaLimiteHoras + cajaGraciaHoras}h el cajero{' '}
                      <strong>no podrá facturar ni cobrar</strong> hasta cerrar caja.
                    </>
                  ) : (
                    <>
                      <strong>Solo avisa:</strong> el contador aparece a las {cajaLimiteHoras}h menos{' '}
                      {cajaAvisoMinutos} min y el turno vence a las {cajaLimiteHoras}h, pero el cajero
                      puede seguir facturando indefinidamente.
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600">
                  Sin límite de duración: los turnos pueden quedar abiertos indefinidamente y no se
                  muestra contador.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>}

      {/* ── Alerta de método de pago ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Alerta de método de pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Al cobrar una factura o venta en POS, pide reconfirmar el método de pago antes de
            finalizar (evita registrar efectivo por transferencia, o viceversa). Aplica solo a los
            roles que además tengan el permiso <code>Alerta double-check de método de pago</code>.
          </p>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Pedir confirmación del método de pago</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Aparece una alerta al cobrar para revisar el método antes de crear la factura.
              </p>
            </div>
            <button
              type="button" role="switch" aria-checked={alertaMetodoPagoActivo}
              onClick={() => setAlertaMetodoPagoActivo(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                alertaMetodoPagoActivo ? 'bg-teal-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${alertaMetodoPagoActivo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Módulo Punto de Venta (POS) ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Punto de venta (POS)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Habilita la pantalla de venta rápida full-screen para cafeterías, tiendas o cualquier
            negocio de mostrador. Cada caja se configura como una "terminal" con su almacén fijo.
          </p>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Activar punto de venta</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Habilita el acceso a <code>/pos</code> y la gestión de terminales.
              </p>
            </div>
            <button
              type="button" role="switch" aria-checked={posHabilitado}
              onClick={() => setPosHabilitado(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                posHabilitado ? 'bg-teal-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${posHabilitado ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {posHabilitado && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Capa escolar (monedero del estudiante)</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Solo para colegios: saldo prepago por estudiante con cargo al acudiente.
                </p>
              </div>
              <button
                type="button" role="switch" aria-checked={posEscolarHabilitado}
                onClick={() => setPosEscolarHabilitado(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                  posEscolarHabilitado ? 'bg-teal-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${posEscolarHabilitado ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipo y permisos — solo roles con equipo:gestionar */}
      {canManageTeam && <EquipoCard />}

      </div>

      {/* Botón guardar final — barra sticky inferior (solo si puede editar) */}
      {canManage && (
        <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 mt-auto bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] flex justify-end py-3">
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
      )}
    </div>
  );
}
