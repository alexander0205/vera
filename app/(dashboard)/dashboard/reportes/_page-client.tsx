'use client';
import { useState } from 'react';
import { Download, BarChart3, AlertTriangle, TrendingUp, FileX, Globe, Loader2 } from 'lucide-react';

type ReporteId = '606' | '607' | '608' | '609';

interface ReporteCard {
  id: ReporteId;
  titulo: string;
  descripcion: string;
  icon: React.ElementType;
  colorIcon: string;
  colorBadge: string;
  badge: string;
}

const REPORTES: ReporteCard[] = [
  {
    id: '606',
    titulo: 'Formato 606',
    descripcion: 'Compras de bienes y servicios a proveedores del RNC. Incluye tipos e-CF 41 (Compras) y 43 (Gastos Menores).',
    icon: TrendingUp,
    colorIcon: 'bg-blue-50 text-blue-600',
    colorBadge: 'bg-blue-100 text-blue-700',
    badge: 'Compras',
  },
  {
    id: '607',
    titulo: 'Formato 607',
    descripcion: 'Ventas y retenciones del período. Incluye tipos e-CF 31, 32, 33, 34, 44, 45 y 46.',
    icon: BarChart3,
    colorIcon: 'bg-teal-50 text-teal-600',
    colorBadge: 'bg-teal-100 text-teal-700',
    badge: 'Ventas',
  },
  {
    id: '608',
    titulo: 'Formato 608',
    descripcion: 'Comprobantes anulados en el período. Todos los e-CF con estado ANULADO.',
    icon: FileX,
    colorIcon: 'bg-red-50 text-red-600',
    colorBadge: 'bg-red-100 text-red-700',
    badge: 'Anulados',
  },
  {
    id: '609',
    titulo: 'Formato 609',
    descripcion: 'Pagos por servicios al exterior. Tipo e-CF 47 (Pagos al Exterior) con ISR retenido.',
    icon: Globe,
    colorIcon: 'bg-purple-50 text-purple-600',
    colorBadge: 'bg-purple-100 text-purple-700',
    badge: 'Exterior',
  },
];

const MESES: [string, string][] = [
  ['01', 'Enero'],     ['02', 'Febrero'],  ['03', 'Marzo'],     ['04', 'Abril'],
  ['05', 'Mayo'],      ['06', 'Junio'],    ['07', 'Julio'],      ['08', 'Agosto'],
  ['09', 'Septiembre'],['10', 'Octubre'],  ['11', 'Noviembre'], ['12', 'Diciembre'],
];

export default function ReportesPage() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear().toString());
  const [mes, setMes]   = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [loadingId, setLoadingId] = useState<ReporteId | null>(null);

  const mesLabel = MESES.find(([v]) => v === mes)?.[1] ?? mes;
  const anios = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  function downloadReporte(id: ReporteId) {
    setLoadingId(id);
    const url = `/api/reportes/${id}?anio=${anio}&mes=${mes}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
    setTimeout(() => setLoadingId(null), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes DGII</h1>
        <p className="text-sm text-gray-500 mt-1">
          Genera los archivos TXT para enviar al portal OFV de la DGII — Norma General 07-18
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">Período de reporte</p>
        <div className="flex gap-3 flex-wrap items-center">
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {MESES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={anio}
            onChange={e => setAnio(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-sm text-gray-400">
            → Archivo del período {mes}/{anio}
          </span>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {REPORTES.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${r.colorIcon} flex items-center justify-center shrink-0`}>
                  <r.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.titulo}</p>
                  <p className="text-xs text-gray-400">{mesLabel} {anio}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.colorBadge}`}>
                {r.badge}
              </span>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed flex-1">{r.descripcion}</p>

            <button
              onClick={() => downloadReporte(r.id)}
              disabled={loadingId === r.id}
              className="w-full flex items-center justify-center gap-2 text-sm bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60 font-medium transition-colors"
            >
              {loadingId === r.id
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
                : <><Download className="h-4 w-4" /> Descargar TXT</>
              }
            </button>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Instrucciones de envío</p>
        <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>Descarga el archivo TXT del período que deseas reportar.</li>
          <li>Ingresa al portal <span className="font-mono bg-gray-100 px-1 rounded">dgii.gov.do/ofv</span> con tu usuario y contraseña.</li>
          <li>Ve a <strong>Enviar Archivos</strong> y selecciona el tipo de formato (606, 607, 608 o 609).</li>
          <li>Adjunta el archivo TXT descargado y haz clic en <strong>Enviar Datos</strong>.</li>
          <li>Si el período no tuvo operaciones, usa <strong>Declaraciones en Cero</strong>.</li>
        </ol>
        <p className="text-xs text-gray-400">Fecha límite: día 15 del mes siguiente al período reportado.</p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Verifica los datos antes de enviar</p>
          <p className="text-xs text-amber-600 mt-1">
            Los archivos se generan desde los comprobantes registrados en EmiteDO. Asegúrate de que
            todos los e-CF del período estén correctamente emitidos y aceptados por la DGII antes de
            enviar el reporte. Los comprobantes anulados aparecen en el 608 automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
