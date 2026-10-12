'use client';

/**
 * Guía de conexión del MCP, dentro de la pantalla de API Keys.
 *
 * Vive acá y no en un README porque quien crea la key es quien necesita el
 * instructivo, en ese mismo momento: la key se muestra UNA sola vez y hay que
 * pegarla en ChatGPT antes de cerrar el diálogo.
 */

import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Lock, Eye, Gauge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** La base sale del navegador: en producción es app.zero.com.do, en local el host de turno. */
function baseActual(): string {
  if (typeof window === 'undefined') return 'https://app.zero.com.do';
  return window.location.origin;
}

function Copiable({ texto, etiqueta }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-pre rounded-md bg-gray-900 px-3 py-2 font-mono text-xs text-gray-100">
        {texto}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(texto).then(
            () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); },
            () => {},
          );
        }}
        title={etiqueta ? `Copiar ${etiqueta}` : 'Copiar'}
        aria-label={etiqueta ? `Copiar ${etiqueta}` : 'Copiar'}
        className="shrink-0 rounded-md border border-gray-300 px-3 text-gray-600 hover:bg-gray-50"
      >
        {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zero-600 text-xs font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-gray-900">{titulo}</p>
        <div className="space-y-2 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

const HERRAMIENTAS: { grupo: string; items: string; que: string }[] = [
  { grupo: 'Clientes', items: 'list_clients · get_client', que: 'Buscar por nombre, RNC o correo.' },
  { grupo: 'Facturas', items: 'list_invoices · get_invoice', que: 'Filtra por estado, estado de pago, cliente y rango de fechas.' },
  { grupo: 'Recurrentes', items: 'list_recurring_invoices · get_recurring_invoice', que: 'Los planes: frecuencia, día de cobro, próxima emisión.' },
  { grupo: 'Cuentas por cobrar', items: 'get_accounts_receivable', que: 'Saldos con antigüedad y totales vencidos.' },
  { grupo: 'Pagos', items: 'list_payments · get_payment', que: 'Cuándo se cobró, por cuánto, por qué vía y quién lo registró.' },
  { grupo: 'Cargos escolares', items: 'list_school_charges · get_school_charge', que: 'Lo que falta cobrar. Es la única que mira hacia adelante.' },
];

const EJEMPLOS = [
  '¿Cuánto facturé este mes y cuánto llevo cobrado?',
  '¿Quién me debe hace más de 60 días?',
  '¿Cuánto entró la semana pasada en efectivo?',
  '¿A qué estudiantes les vence la mensualidad esta semana?',
  '¿Cuánto me falta cobrar de aquí a fin de año?',
];

export function GuiaConexion() {
  const [abierto, setAbierto] = useState(false);
  const base = baseActual();
  const url = `${base}/api/mcp`;

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-gray-900">Conectar con ChatGPT o Claude</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Preguntá por tu facturación en lenguaje natural. Solo lectura.
            </p>
          </div>
          {abierto
            ? <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
            : <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />}
        </button>

        {abierto ? (
          <div className="mt-5 space-y-6 border-t border-gray-100 pt-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-900">La dirección del servidor</p>
              <Copiable texto={url} etiqueta="la dirección" />
            </div>

            <div className="space-y-4">
              <Paso n={1} titulo="Creá una key acá arriba">
                <p>
                  Se muestra <strong>una sola vez</strong>. Copiala antes de cerrar el diálogo — si la
                  perdés, no se puede recuperar: hay que revocarla y crear otra.
                </p>
              </Paso>

              <Paso n={2} titulo="En ChatGPT, prendé el modo desarrollador">
                <p>
                  Ajustes → Aplicaciones → Configuración avanzada → <strong>Modo desarrollador</strong>.
                  Está disponible en las cuentas Plus, Pro, Business, Enterprise y Edu, desde el
                  navegador. En cuentas de empresa puede hacer falta que el administrador lo habilite
                  en Permisos y roles.
                </p>
              </Paso>

              <Paso n={3} titulo="Agregá el conector">
                <p>
                  Ajustes → Conectores → agregar servidor MCP. Pegá la dirección de arriba, elegí
                  autenticación por <strong>API key</strong> y pegá la tuya.
                </p>
                <p className="text-gray-500">
                  En Claude es el mismo camino: Configuración → Conectores → agregar conector
                  personalizado, con la misma dirección y la misma key.
                </p>
              </Paso>

              <Paso n={4} titulo="Probá que responde">
                <p>Antes de conectarlo, podés comprobar la key desde una terminal:</p>
                <Copiable
                  texto={`curl -H "Authorization: Bearer TU_KEY" \\\n  ${base}/api/mcp/v1/facturas?limit=1`}
                  etiqueta="el comando de prueba"
                />
                <p>
                  Si devuelve tus facturas, la key sirve. Si devuelve{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">401</code>, está mal
                  copiada o fue revocada.
                </p>
              </Paso>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Qué puede consultar</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {HERRAMIENTAS.map((h) => (
                      <tr key={h.grupo}>
                        <td className="py-2 pr-3 align-top font-medium text-gray-900">{h.grupo}</td>
                        <td className="py-2 pr-3 align-top font-mono text-xs text-gray-500">{h.items}</td>
                        <td className="py-2 align-top text-gray-600">{h.que}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Cosas que ya podés preguntarle</p>
              <ul className="space-y-1">
                {EJEMPLOS.map((e) => (
                  <li key={e} className="text-sm text-gray-600">«{e}»</li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-3">
              <div className="flex gap-2">
                <Eye className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-xs text-gray-600">
                  <strong className="block text-gray-900">Solo lectura</strong>
                  No puede emitir, cobrar ni modificar nada. Esas operaciones no existen en el
                  servidor.
                </p>
              </div>
              <div className="flex gap-2">
                <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-xs text-gray-600">
                  <strong className="block text-gray-900">Solo tu empresa</strong>
                  La empresa sale de la key, no de la pregunta. No hay forma de consultar datos de
                  otra.
                </p>
              </div>
              <div className="flex gap-2">
                <Gauge className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-xs text-gray-600">
                  <strong className="block text-gray-900">Con tope</strong>
                  300 consultas por minuto por key. Pasado eso responde y pide reintentar.
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              La key da acceso de lectura a toda tu facturación: tratala como una contraseña. Si se
              filtra, revocala desde esta misma pantalla — deja de funcionar al instante.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
