'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Plus, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cuenta } from '@/lib/contabilidad/cuentas';
// Valores desde `metodos` (sin dependencias de base) y tipos desde `config`.
// Importar valores de `config` aquí rompe el bundle del cliente: arrastra
// `postgres` y falla con "Can't resolve 'fs'".
import {
  CLAVE_METODO_LABEL, CLAVES_SIN_COBRO, esPasarela, type ClaveMetodo,
} from '@/lib/contabilidad/metodos';
import type {
  ConfigContable, MetodoConfigurado, OverrideIngreso,
} from '@/lib/contabilidad/config';
import type { EstadoConfiguracion } from '@/lib/contabilidad/validacion';

/** Las 5 generales, con la explicación que ve el usuario. */
const GENERALES: { campo: keyof ConfigContable; label: string; ayuda: string }[] = [
  { campo: 'cuentaPorCobrarId', label: 'Cuenta por cobrar',
    ayuda: 'Lo que un cliente queda debiendo al emitirle una factura a crédito.' },
  { campo: 'cuentaItbisId', label: 'ITBIS por pagar',
    ayuda: 'El ITBIS que cobras no es tuyo: es de la DGII hasta que lo declares.' },
  { campo: 'cuentaIngresosId', label: 'Ingresos por defecto',
    ayuda: 'La red de seguridad, para lo que no cae en ninguna regla más específica.' },
  { campo: 'cuentaDescuentosId', label: 'Descuentos y devoluciones',
    ayuda: 'Donde restan las notas de crédito. Sin esto, las ventas netas salen infladas.' },
  { campo: 'cuentaMoraId', label: 'Ingresos por mora',
    ayuda: 'Los recargos por atraso son un ingreso distinto de las ventas.' },
  { campo: 'cuentaSaldosFavorId', label: 'Saldos a favor de clientes',
    ayuda: 'Si una nota de crédito supera la deuda, el sobrante es dinero que le debes al cliente.' },
  { campo: 'cuentaRetencionesId', label: 'Retenciones por cobrar',
    ayuda: 'Lo que el cliente retiene no entra a tu banco, pero te deja un crédito fiscal.' },
];

/** Métodos que se ofrecen para configurar, sin los que no mueven dinero. */
const METODOS_CONFIGURABLES = (Object.keys(CLAVE_METODO_LABEL) as ClaveMetodo[])
  .filter((c) => !CLAVES_SIN_COBRO.includes(c));


export function ConfigClient({
  configInicial, metodosIniciales, overridesIniciales, estadoInicial,
  cuentas, categorias, productos, puedeConfigurar,
}: {
  configInicial:      ConfigContable;
  metodosIniciales:   MetodoConfigurado[];
  overridesIniciales: OverrideIngreso[];
  estadoInicial:      EstadoConfiguracion;
  cuentas:            Cuenta[];
  categorias:         { id: number; nombre: string }[];
  productos:          { id: number; nombre: string }[];
  puedeConfigurar:    boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nuevoOverride, setNuevoOverride] = useState<{
    tipo: 'categoria' | 'producto'; destinoId: string; cuentaId: string;
  } | null>(null);

  const metodoPorClave = new Map(metodosIniciales.map((m) => [m.clave, m]));

  async function enviar(payload: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    const res = await fetch('/api/contabilidad/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setGuardando(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo guardar.');
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  const selectCuenta = (
    valor: number | null,
    onChange: (id: number | null) => void,
    placeholder = 'Sin configurar',
  ) => (
    <select
      value={valor ?? ''}
      disabled={!puedeConfigurar || guardando}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
    >
      <option value="">{placeholder}</option>
      {cuentas.map((c) => (
        <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ─── Estado: qué falta ─────────────────────────────────────────── */}
      <div className={`rounded-lg border px-4 py-4 ${
        estadoInicial.completa
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-start gap-3">
          {estadoInicial.completa
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}

          <div className="min-w-0 flex-1 space-y-2">
            <p className={`text-sm font-medium ${
              estadoInicial.completa ? 'text-emerald-900' : 'text-amber-900'
            }`}>
              {estadoInicial.completa
                ? 'La configuración está completa.'
                : `Faltan ${estadoInicial.huecos.length} cosa(s) por configurar.`}
            </p>

            {estadoInicial.huecos.length > 0 && (
              <ul className="space-y-1.5 text-sm text-amber-900">
                {estadoInicial.huecos.map((h) => (
                  <li key={h.clave}>
                    <strong>{h.que}</strong> — {h.porque}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-3 pt-1">
              <span className="text-sm text-gray-700">
                Contabilidad automática:{' '}
                <strong>{estadoInicial.activa ? 'encendida' : 'apagada'}</strong>
              </span>
              {puedeConfigurar && (
                <Button
                  size="sm"
                  variant={estadoInicial.activa ? 'outline' : 'default'}
                  disabled={guardando || (!estadoInicial.completa && !estadoInicial.activa)}
                  onClick={() => enviar({ seccion: 'activar', activa: !estadoInicial.activa })}
                >
                  {estadoInicial.activa ? 'Apagar' : 'Encender'}
                </Button>
              )}
            </div>

            {!estadoInicial.completa && !estadoInicial.activa && (
              <p className="text-xs text-amber-800">
                No se puede encender con la configuración incompleta: los asientos
                saldrían descuadrados, y eso es peor que no generarlos.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── 1. Cuentas generales ──────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Cuentas generales</h2>
          <p className="text-xs text-gray-500">
            Lo que se usa en toda factura, sin importar el producto ni la forma de cobro.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {GENERALES.map((g) => (
            <div key={g.campo} className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{g.label}</label>
              {selectCuenta(
                configInicial[g.campo] as number | null,
                (id) => enviar({ seccion: 'general', [g.campo]: id }),
              )}
              <p className="text-xs text-gray-500">{g.ayuda}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 2. Métodos de cobro ───────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Formas de cobro</h2>
          <p className="text-xs text-gray-500">
            A qué cuenta entra el dinero según cómo te paguen.
          </p>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-xs text-blue-900">
            <strong>Los links de pago van aparte de la tarjeta de mostrador.</strong>{' '}
            Cuando cobras por CardNet o Azul el dinero no entra a tu banco ese día:
            la pasarela liquida después y te retiene su comisión. Por eso conviene
            apuntarlos a <em>Cobros por liquidar</em> y no a Bancos — si no, el banco
            te muestra plata que todavía no tienes.
          </p>
        </div>

        <div className="space-y-3">
          {METODOS_CONFIGURABLES.map((clave) => {
            const m = metodoPorClave.get(clave);
            const falta = estadoInicial.metodosSinCuenta.includes(clave);
            return (
              <div key={clave} className="grid gap-3 sm:grid-cols-[200px_1fr_1fr] sm:items-center">
                <div className="text-sm text-gray-700">
                  {CLAVE_METODO_LABEL[clave]}
                  {falta && (
                    <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                      lo usas y falta
                    </span>
                  )}
                </div>

                {selectCuenta(
                  m?.cuentaId ?? null,
                  (id) => enviar({
                    seccion: 'metodo', clave, cuentaId: id,
                    cuentaComisionId: m?.cuentaComisionId ?? null,
                  }),
                )}

                {esPasarela(clave) ? (
                  <div>
                    {selectCuenta(
                      m?.cuentaComisionId ?? null,
                      (id) => m?.cuentaId
                        ? enviar({ seccion: 'metodo', clave, cuentaId: m.cuentaId, cuentaComisionId: id })
                        : setError('Primero elige la cuenta donde entra el cobro.'),
                      'Cuenta de comisión (opcional)',
                    )}
                  </div>
                ) : <div />}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── 3. Ingresos por categoría o producto ──────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Ingresos por categoría o producto</h2>
          <p className="text-xs text-gray-500">
            Solo para las excepciones. Por defecto los bienes van a{' '}
            <strong>4101 Ingresos por venta de mercancía</strong> y los servicios a{' '}
            <strong>4104 Ingresos por servicios</strong>, sin configurar nada.
          </p>
        </div>

        {overridesIniciales.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Aplica a</th>
                  <th className="px-3 py-2 font-medium">Va a la cuenta</th>
                  {puedeConfigurar && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overridesIniciales.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2">
                      <span className="text-gray-400 text-xs mr-1.5">
                        {o.categoriaId !== null ? 'Categoría' : 'Producto'}
                      </span>
                      {o.destinoNombre}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      <span className="font-mono text-xs">{o.cuentaCodigo}</span> {o.cuentaNombre}
                    </td>
                    {puedeConfigurar && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => enviar({ seccion: 'ingreso', id: o.id, cuentaId: null })}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Quitar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {puedeConfigurar && (nuevoOverride ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={nuevoOverride.tipo}
                onChange={(e) => setNuevoOverride({
                  ...nuevoOverride, tipo: e.target.value as 'categoria' | 'producto', destinoId: '',
                })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="categoria">Categoría</option>
                <option value="producto">Producto</option>
              </select>

              <select
                value={nuevoOverride.destinoId}
                onChange={(e) => setNuevoOverride({ ...nuevoOverride, destinoId: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Elegir…</option>
                {(nuevoOverride.tipo === 'categoria' ? categorias : productos).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>

              <select
                value={nuevoOverride.cuentaId}
                onChange={(e) => setNuevoOverride({ ...nuevoOverride, cuentaId: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Cuenta…</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={guardando || !nuevoOverride.destinoId || !nuevoOverride.cuentaId}
                onClick={async () => {
                  const ok = await enviar({
                    seccion: 'ingreso',
                    categoriaId: nuevoOverride.tipo === 'categoria' ? Number(nuevoOverride.destinoId) : null,
                    productoId:  nuevoOverride.tipo === 'producto'  ? Number(nuevoOverride.destinoId) : null,
                    cuentaId: Number(nuevoOverride.cuentaId),
                  });
                  if (ok) setNuevoOverride(null);
                }}
              >
                Agregar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNuevoOverride(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm" variant="outline"
            onClick={() => setNuevoOverride({ tipo: 'categoria', destinoId: '', cuentaId: '' })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar excepción
          </Button>
        ))}
      </section>
    </div>
  );
}
