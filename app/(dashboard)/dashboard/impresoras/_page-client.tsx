'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Printer, FileText, Ticket, CheckCircle, Settings2, Ruler } from 'lucide-react';

const STORAGE_KEY = 'emitedo:printer';

interface PrinterConfig {
  formatoDefault: 'normal' | 'ticket';
  anchoTicket:    '80mm' | '58mm';
  nombreImpresora: string;
}

function loadConfig(): PrinterConfig {
  if (typeof window === 'undefined') return { formatoDefault: 'normal', anchoTicket: '80mm', nombreImpresora: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { formatoDefault: 'normal', anchoTicket: '80mm', nombreImpresora: '', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { formatoDefault: 'normal', anchoTicket: '80mm', nombreImpresora: '' };
}

function saveConfig(cfg: PrinterConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

export default function ImpresorasPage() {
  const [config, setConfig]   = useState<PrinterConfig>({ formatoDefault: 'normal', anchoTicket: '80mm', nombreImpresora: '' });
  const [saved, setSaved]     = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  function update<K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!hydrated) return null;

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Printer className="h-6 w-6 text-teal-600" />
          Impresoras
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configura el formato de impresión predeterminado para tus comprobantes
        </p>
      </div>

      {/* Formato predeterminado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Formato de impresión predeterminado
          </CardTitle>
          <CardDescription className="text-xs">
            Selecciona qué formato se usará cuando hagas clic en &quot;Imprimir&quot; desde una factura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => update('formatoDefault', 'normal')}
              className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                config.formatoDefault === 'normal'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {config.formatoDefault === 'normal' && (
                <CheckCircle className="absolute top-3 right-3 h-5 w-5 text-teal-600" />
              )}
              <div className="w-20 h-28 bg-white border border-gray-300 rounded shadow-sm flex flex-col p-1.5 gap-1">
                <div className="h-2 w-12 bg-teal-200 rounded" />
                <div className="h-1 w-16 bg-gray-200 rounded" />
                <div className="h-1 w-14 bg-gray-200 rounded" />
                <div className="flex-1 mt-1 space-y-0.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-0.5 bg-gray-100 rounded w-full" />
                  ))}
                </div>
                <div className="h-1.5 w-10 bg-teal-100 rounded self-end" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-sm text-gray-900">
                  <FileText className="h-4 w-4 text-teal-600" />
                  Formato normal
                </div>
                <p className="text-xs text-gray-500 mt-0.5">PDF carta / A4, diseño completo</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => update('formatoDefault', 'ticket')}
              className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                config.formatoDefault === 'ticket'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {config.formatoDefault === 'ticket' && (
                <CheckCircle className="absolute top-3 right-3 h-5 w-5 text-teal-600" />
              )}
              <div className="w-10 h-28 bg-white border border-gray-300 rounded shadow-sm flex flex-col p-1 gap-0.5">
                <div className="h-1 w-full bg-gray-800 rounded" />
                <div className="h-0.5 w-full bg-gray-200 rounded" />
                <div className="h-0.5 w-6 bg-gray-200 rounded" />
                <div className="border-t border-dashed border-gray-300 my-0.5" />
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-0.5 bg-gray-100 rounded w-full" />
                ))}
                <div className="border-t border-dashed border-gray-300 my-0.5" />
                <div className="h-1 w-full bg-gray-300 rounded" />
                <div className="h-1 w-full bg-gray-300 rounded" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-sm text-gray-900">
                  <Ticket className="h-4 w-4 text-teal-600" />
                  Ticket térmico
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Recibo 80mm, ideal para puntos de venta</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {config.formatoDefault === 'ticket' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Ancho del papel térmico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(['80mm', '58mm'] as const).map((ancho) => (
                <button
                  key={ancho}
                  type="button"
                  onClick={() => update('anchoTicket', ancho)}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 text-center transition-all ${
                    config.anchoTicket === ancho
                      ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg font-bold">{ancho}</span>
                  <p className="text-xs mt-0.5 opacity-70">
                    {ancho === '80mm' ? 'Estándar (más común)' : 'Compacto'}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Nombre de impresora (opcional)
          </CardTitle>
          <CardDescription className="text-xs">
            Referencia para que tus usuarios sepan qué impresora usar.
            La selección final se hace en el diálogo de impresión del navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="nombre-imp">Nombre o descripción</Label>
            <input
              id="nombre-imp"
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ej: Impresora térmica recepción, Epson TM-T20III..."
              value={config.nombreImpresora}
              onChange={(e) => update('nombreImpresora', e.target.value)}
              maxLength={100}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Printer className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">¿Cómo funciona la impresión?</p>
              <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
                <li><strong>Formato normal:</strong> Abre el PDF de la factura en una nueva pestaña para imprimir desde el navegador</li>
                <li><strong>Ticket térmico:</strong> Genera una página HTML optimizada para papel de 80mm con fuente monoespaciada y código QR</li>
                <li>En ambos casos, el diálogo de impresión del navegador te permite seleccionar la impresora deseada</li>
                <li>Para impresoras térmicas, selecciona &quot;Sin márgenes&quot; y desactiva los encabezados de página</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-teal-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            Configuración guardada
          </span>
        )}
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={handleSave}
        >
          Guardar configuración
        </Button>
      </div>
    </section>
  );
}
