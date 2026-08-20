'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Link2, CheckCircle2, HelpCircle, ExternalLink } from 'lucide-react';

interface Tutorial {
  pasos: string[];
  requisitos: string[];
  links: { label: string; url: string }[];
  nota: string;
}

/** Materiales de onboarding por proveedor: cómo el negocio saca su cuenta. */
const TUTORIALS: Record<string, Tutorial> = {
  azul: {
    pasos: [
      'Contacta a Azul (Servicios al Comercio) y solicita el producto “Payment Page” (e-commerce).',
      'Firma el contrato de afiliación de comercio y asocia tu cuenta bancaria donde recibirás el dinero.',
      'Azul te entrega: MerchantId, Auth1 y Auth2 (llaves de sandbox y de producción).',
      'Empieza en Sandbox para probar; cuando Azul apruebe tu comercio, cambia a Producción.',
      'Pega MerchantId, Auth1 y Auth2 aquí y activa la pasarela.',
    ],
    requisitos: [
      'RNC y documentos legales del negocio (registro mercantil, cédula del representante).',
      'Cuenta bancaria del negocio para la liquidación de los pagos.',
      'Estados financieros / info del giro comercial (Azul los pide en la afiliación).',
    ],
    links: [
      { label: 'Portal desarrolladores Azul', url: 'https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx' },
      { label: 'Solicitar comercio / contacto Azul', url: 'https://www.azul.com.do/' },
    ],
    nota: 'El dinero cae en la cuenta bancaria del negocio, no en Zero. Las llaves Auth1/Auth2 son secretas — nunca las compartas.',
  },
  cardnet: {
    pasos: [
      'Contacta a CardNet (Servicios Digitales Popular) y pide el “Botón de Pago” e-commerce.',
      'Firma la afiliación de comercio y asocia tu cuenta bancaria.',
      'CardNet te asigna un ejecutivo y te entrega MerchantId, Terminal y credenciales.',
      'Prueba en Sandbox; con el comercio aprobado, cambia a Producción.',
      'Pega MerchantId y Terminal aquí y activa la pasarela.',
    ],
    requisitos: [
      'RNC y documentos legales del negocio.',
      'Cuenta bancaria del negocio para la liquidación.',
      'Datos del giro comercial / volumen estimado de ventas.',
    ],
    links: [
      { label: 'Portal desarrolladores CardNet', url: 'https://developers.cardnet.com.do/' },
      { label: 'Solicitar comercio / contacto CardNet', url: 'https://www.cardnet.com.do/' },
    ],
    nota: 'El dinero cae en la cuenta bancaria del negocio, no en Zero. Sandbox público: merchant 349041263 / terminal 77777777.',
  },
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface ConfigRow {
  provider: string;
  merchantId: string | null;
  terminalId: string | null;
  ambiente: string;
  enabled: boolean;
  hasAuthKey: boolean;
  hasApiKey: boolean;
}

const ALL_PROVIDERS = [
  { key: 'cardnet',   label: 'CardNet',            hint: 'Servicios Digitales Popular. Sandbox público: merchant 349041263 / terminal 77777777.' },
  { key: 'azul',      label: 'Azul',               hint: 'AZUL Payment Page. Requiere MerchantId + Auth1 + Auth2 del comercio (sandbox: pruebas.azul.com.do).' },
  { key: 'simulador', label: 'Simulador (pruebas)', hint: 'Gateway interno para probar el flujo completo sin credenciales reales.' },
];

/**
 * Qué pasarelas se muestran:
 *  - cardnet   → siempre (probada contra el gateway real).
 *  - azul      → solo si NEXT_PUBLIC_AZUL_ENABLED='true'. Está implementada pero
 *                sin verificar E2E (falta Auth1/Auth2 reales + confirmar AuthHash),
 *                así que en prod queda oculta hasta validarla.
 *  - simulador → nunca en producción (marca pagos sin dinero; el endpoint también
 *                está bloqueado server-side).
 */
const PROVIDERS = ALL_PROVIDERS.filter((p) => {
  if (p.key === 'azul')      return process.env.NEXT_PUBLIC_AZUL_ENABLED === 'true';
  if (p.key === 'simulador') return process.env.NODE_ENV !== 'production';
  return true;
});

/**
 * Ambientes elegibles. En producción solo 'prod': una pasarela en sandbox no
 * cobra dinero real, así que dejarla elegible ahí es una trampa. En dev se
 * pueden usar los dos. El servidor lo fuerza igual (no confiamos en el select).
 */
const ES_PROD = process.env.NODE_ENV === 'production';
const AMBIENTES: { value: 'sandbox' | 'prod'; label: string }[] = ES_PROD
  ? [{ value: 'prod', label: 'Producción' }]
  : [{ value: 'sandbox', label: 'Sandbox' }, { value: 'prod', label: 'Producción' }];
const AMBIENTE_DEFAULT: 'sandbox' | 'prod' = ES_PROD ? 'prod' : 'sandbox';

export default function PasarelasClient() {
  const { data, mutate } = useSWR<{ configs: ConfigRow[] }>('/api/pagos/pasarelas', fetcher);
  const configs = data?.configs ?? [];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-zero-600" /> Pasarelas de pago
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta una pasarela para generar <b>links de pago</b> de tus facturas y cotizaciones.
          El cliente paga con tarjeta y el cobro se registra automáticamente.
        </p>
      </div>

      {PROVIDERS.map((p) => (
        <ProviderCard
          key={p.key}
          providerKey={p.key}
          label={p.label}
          hint={p.hint}
          current={configs.find((c) => c.provider === p.key)}
          onSaved={() => mutate()}
        />
      ))}
    </div>
  );
}

function ProviderCard({ providerKey, label, hint, current, onSaved }: {
  providerKey: string; label: string; hint: string;
  current?: ConfigRow; onSaved: () => void;
}) {
  const [merchantId, setMerchantId] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [authKey, setAuthKey]       = useState(''); // CardNet AuthKey / Azul Auth1
  const [auth2, setAuth2]           = useState(''); // Azul Auth2
  const [ambiente, setAmbiente]     = useState<'sandbox' | 'prod'>(AMBIENTE_DEFAULT);
  const [enabled, setEnabled]       = useState(false);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (current) {
      setMerchantId(current.merchantId ?? '');
      setTerminalId(current.terminalId ?? '');
      // En producción no ofrecemos sandbox: si hay una config vieja en sandbox,
      // el select la muestra como Producción (y al guardar queda corregida).
      setAmbiente(ES_PROD ? 'prod' : (current.ambiente === 'prod' ? 'prod' : 'sandbox'));
      setEnabled(current.enabled);
    }
  }, [current]);

  const isSim  = providerKey === 'simulador';
  const isAzul = providerKey === 'azul';
  const tuto   = TUTORIALS[providerKey];

  async function guardar() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { provider: providerKey, ambiente, enabled };
      if (!isSim) {
        body.merchantId = merchantId || null;
        body.terminalId = terminalId || null;
        if (authKey) body.authKeyPlain = authKey;
        if (isAzul && auth2) body.apiKeyPlain = auth2;
      }
      const r = await fetch('/api/pagos/pasarelas', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Error'); }
      toast.success(`${label} guardado`);
      setAuthKey(''); setAuth2('');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-slate-500" />
          <span className="font-semibold">{label}</span>
          {current?.enabled && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Activo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{hint}</p>

        {/* Tutorial: cómo sacar la cuenta y qué necesita el negocio */}
        {tuto && (
          <details className="rounded-lg border border-slate-200 bg-slate-50/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-zero-700 flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> ¿Cómo obtener tu cuenta de {label}?
            </summary>
            <div className="px-4 pb-3 pt-1 text-sm text-slate-600 space-y-2">
              <div>
                <div className="font-medium text-slate-700 mb-1">Pasos</div>
                <ol className="list-decimal ml-5 space-y-0.5">{tuto.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </div>
              <div>
                <div className="font-medium text-slate-700 mb-1">Qué necesitas tener a mano</div>
                <ul className="list-disc ml-5 space-y-0.5">{tuto.requisitos.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {tuto.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-zero-700 hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> {l.label}
                  </a>
                ))}
              </div>
              <p className="text-xs text-slate-500 pt-1">{tuto.nota}</p>
            </div>
          </details>
        )}

        {!isSim && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={isAzul ? 'sm:col-span-2' : ''}>
              <Label className="text-xs">Merchant ID</Label>
              <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)}
                placeholder={isAzul ? 'MerchantId de Azul' : '349041263'} />
            </div>
            {!isAzul && (
              <div>
                <Label className="text-xs">Terminal ID</Label>
                <Input value={terminalId} onChange={(e) => setTerminalId(e.target.value)} placeholder="77777777" />
              </div>
            )}
            {isAzul ? (
              <>
                <div>
                  <Label className="text-xs">Auth1 (se cifra)</Label>
                  <Input type="password" value={authKey} onChange={(e) => setAuthKey(e.target.value)}
                    placeholder={current?.hasAuthKey ? '•••••• (guardada)' : 'Auth Key 1 de Azul'} />
                </div>
                <div>
                  <Label className="text-xs">Auth2 (se cifra)</Label>
                  <Input type="password" value={auth2} onChange={(e) => setAuth2(e.target.value)}
                    placeholder={current?.hasApiKey ? '•••••• (guardada)' : 'Auth Key 2 de Azul'} />
                </div>
              </>
            ) : (
              <div className="sm:col-span-2">
                <Label className="text-xs">Auth Key / clave (se cifra)</Label>
                <Input type="password" value={authKey} onChange={(e) => setAuthKey(e.target.value)}
                  placeholder={current?.hasAuthKey ? '•••••• (guardada — deja vacío para no cambiar)' : 'Opcional en sandbox'} />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {!isSim && (
            <label className="text-sm flex items-center gap-2">
              Ambiente:
              <select value={ambiente} onChange={(e) => setAmbiente(e.target.value as 'sandbox' | 'prod')}
                disabled={AMBIENTES.length === 1}
                className="border rounded px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-500">
                {AMBIENTES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Activar esta pasarela
          </label>
          <Button onClick={guardar} disabled={saving} className="ml-auto">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
