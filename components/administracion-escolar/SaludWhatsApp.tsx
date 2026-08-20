'use client';

/**
 * Si los avisos de WhatsApp están llegando.
 *
 * Hace falta una pantalla propia porque un canal roto se ve igual que uno sano:
 * el envío devuelve 201 y el aviso queda marcado como enviado aunque Meta lo
 * rechace después. Sin esto, un colegio puede pasarse una semana «avisando» sin
 * que llegue un solo mensaje.
 *
 * Lo importante no es el número de fallos, es el MOTIVO: `131042` se arregla en
 * el Billing Hub de Meta y `131026` revisando el teléfono del responsable. Por
 * eso el motivo va entero y con su instrucción al lado.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Send, XCircle,
} from 'lucide-react';

interface Salud {
  conexion: string;
  conexionDescripcion: string;
  puedeEnviar: boolean;
  enviados: number;
  entregados: number;
  fallidos: number;
  sinAcuse: number;
  errores: { motivo: string; cuantos: number }[];
  queHacer: string | null;
}

export function SaludWhatsApp() {
  const [s, setS] = useState<Salud | null>(null);
  const [cargando, setCargando] = useState(true);
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/administracion-escolar/whatsapp-salud');
      if (r.ok) setS(await r.json());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function revisar() {
    setRevisando(true); setAviso(null);
    try {
      const r = await fetch('/api/administracion-escolar/whatsapp-salud', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setAviso(d.error ?? 'No se pudo revisar'); return; }
      if (d.salud) setS(d.salud);
      setAviso(
        d.revisados === 0
          ? 'No había avisos por confirmar.'
          : `${d.revisados} revisado(s): ${d.entregados} entregado(s), ${d.fallidos} fallido(s)` +
            (d.reintentables > 0 ? `. ${d.reintentables} vuelven a intentarse hoy.` : '.'),
      );
    } finally {
      setRevisando(false);
    }
  }

  if (cargando) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }
  if (!s) return null;

  const sano = s.puedeEnviar && s.fallidos === 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {sano
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            <div>
              <h3 className="font-semibold text-gray-900">
                {s.puedeEnviar ? 'WhatsApp conectado' : 'WhatsApp no puede enviar'}
              </h3>
              <p className="text-sm text-gray-500">{s.conexionDescripcion}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={revisar} disabled={revisando}>
            {revisando
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Revisar entregas
          </Button>
        </div>

        {/* Últimos 7 días. Lo que se mandó no es lo que llegó. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Enviados',    s.enviados,   Send,         'text-gray-900'],
            ['Entregados',  s.entregados, CheckCircle2, 'text-emerald-700'],
            ['Fallidos',    s.fallidos,   XCircle,      'text-red-700'],
            ['Sin acuse',   s.sinAcuse,   Clock,        'text-amber-700'],
          ] as const).map(([label, valor, Icono, color]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
                <Icono className="h-3.5 w-3.5" /> {label}
              </div>
              <p className={`text-xl font-bold ${color}`}>{valor}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Últimos 7 días. «Sin acuse» son los que WhatsApp aceptó pero todavía no
          confirmó — toca «Revisar entregas» para preguntar.
        </p>

        {aviso && <p className="text-sm text-gray-700">{aviso}</p>}

        {s.queHacer && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">{s.queHacer}</p>
          </div>
        )}

        {s.errores.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Por qué fallaron
            </p>
            <ul className="space-y-1.5">
              {s.errores.slice(0, 5).map((e) => (
                <li key={e.motivo} className="flex gap-2 text-sm">
                  <span className="shrink-0 rounded bg-red-100 px-1.5 text-xs font-bold text-red-800">
                    {e.cuantos}
                  </span>
                  <span className="break-words text-gray-700">{e.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
