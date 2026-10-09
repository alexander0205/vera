'use client';

/**
 * Las cuentas a las que las familias transfieren, y el contacto del colegio.
 *
 * Dos bloques y no uno porque son dos cosas distintas: las CUENTAS son varias
 * —un colegio cobra por Popular y por BHD para que cada familia use su propio
 * banco y no pague comisión— y el CONTACTO es uno solo. Repetir el RNC y el
 * teléfono por cuenta serían tres oportunidades de que uno quede mal escrito, y
 * el padre vería tres documentos distintos del mismo colegio.
 *
 * Todo esto acaba impreso en la página del padre, así que se enseña ahí mismo
 * cómo se va a ver.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle, CheckCircle2, Landmark, Loader2, Phone, Plus, Trash2,
} from 'lucide-react';

interface Cuenta {
  id: number | null;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  /** Vacío = hereda el del colegio. */
  documento: string;
}

interface Contacto {
  documento: string;
  telefonoAyuda: string;
  horarioAyuda: string;
  instrucciones: string;
  aceptaTransferencia: boolean;
}

const CONTACTO_VACIO: Contacto = {
  documento: '', telefonoAyuda: '', horarioAyuda: '',
  instrucciones: '', aceptaTransferencia: true,
};

const CUENTA_VACIA: Cuenta = { id: null, banco: '', tipoCuenta: '', numeroCuenta: '', titular: '', documento: '' };

/** Los que de verdad se usan en RD. El campo admite cualquiera igual. */
const BANCOS = [
  'Banco Popular', 'Banreservas', 'BHD', 'Scotiabank', 'Banco Santa Cruz',
  'Banesco', 'Banco Caribe', 'Banco Promerica', 'APAP', 'Asociación Cibao',
];

export default function CobrosClient() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [contacto, setContacto] = useState<Contacto>(CONTACTO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/administracion-escolar/datos-pago');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error cargando');
      setCuentas((d.cuentas ?? []).map((c: Partial<Cuenta>) => ({
        id: c.id ?? null, banco: c.banco ?? '', tipoCuenta: c.tipoCuenta ?? '',
        numeroCuenta: c.numeroCuenta ?? '', titular: c.titular ?? '',
        documento: c.documento ?? '',
      })));
      if (d.datos) {
        setContacto({
          documento: d.datos.documento ?? '',
          telefonoAyuda: d.datos.telefonoAyuda ?? '',
          horarioAyuda: d.datos.horarioAyuda ?? '',
          instrucciones: d.datos.instrucciones ?? '',
          aceptaTransferencia: d.datos.aceptaTransferencia ?? true,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function editar(i: number, campo: keyof Cuenta, valor: string) {
    setCuentas((prev) => prev.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));
  }

  async function guardar() {
    setGuardando(true); setError(null); setGuardado(false);
    try {
      const r = await fetch('/api/administracion-escolar/datos-pago', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Se mandan solo las que tienen banco y número: una fila a medio llenar
        // en la página del padre es peor que una cuenta menos.
        body: JSON.stringify({
          ...contacto,
          cuentas: cuentas.filter((c) => c.banco.trim() && c.numeroCuenta.trim()),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return; }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
      await cargar();
    } catch {
      setError('Error de red');
    } finally {
      setGuardando(false);
    }
  }

  const listas = cuentas.filter((c) => c.banco.trim() && c.numeroCuenta.trim());

  if (cargando) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      {listas.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            Sin ninguna cuenta, el enlace de pago que reciben las familias no ofrece
            transferencia: les dice que llamen al colegio.
          </p>
        </div>
      )}

      {/* Cuentas */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold text-gray-900">Cuentas para recibir transferencias</h2>
            </div>
            <Button variant="outline" size="sm"
              onClick={() => setCuentas((p) => [...p, { ...CUENTA_VACIA }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Agregar banco
            </Button>
          </div>
          <p className="-mt-1 text-sm text-gray-500">
            Pon todas las que uses. La familia elige la de su propio banco, donde
            transferir suele ser gratis y llegar al momento.
          </p>

          {cuentas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
              Todavía no hay ninguna cuenta.
            </p>
          ) : (
            <div className="space-y-3">
              {cuentas.map((c, i) => (
                <div key={c.id ?? `nueva-${i}`} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {c.banco.trim() || `Banco ${i + 1}`}
                    </span>
                    <button type="button" title="Quitar esta cuenta"
                      onClick={() => setCuentas((p) => p.filter((_, j) => j !== i))}
                      className="text-gray-400 transition hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Banco</span>
                      <Input list="bancos-rd" value={c.banco}
                        onChange={(e) => editar(i, 'banco', e.target.value)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Tipo de cuenta</span>
                      <Input value={c.tipoCuenta} placeholder="Corriente o de ahorros"
                        onChange={(e) => editar(i, 'tipoCuenta', e.target.value)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Número de cuenta</span>
                      <Input value={c.numeroCuenta} inputMode="numeric"
                        onChange={(e) => editar(i, 'numeroCuenta', e.target.value)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Titular</span>
                      <Input value={c.titular} placeholder="Tal como aparece en el banco"
                        onChange={(e) => editar(i, 'titular', e.target.value)} />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-gray-700">
                        RNC o cédula del titular
                      </span>
                      <Input value={c.documento}
                        placeholder={contacto.documento
                          ? `${contacto.documento} (el del colegio)`
                          : 'RNC o cédula'}
                        onChange={(e) => editar(i, 'documento', e.target.value)} />
                      <span className="mt-1 block text-xs text-gray-400">
                        Solo si esta cuenta está a nombre de otro —una fundación, el
                        dueño—. En blanco usa el del colegio. El padre lo teclea en su
                        banco: si no cuadra con el titular, el banco rebota la
                        transferencia.
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <datalist id="bancos-rd">
            {BANCOS.map((b) => <option key={b} value={b} />)}
          </datalist>
        </CardContent>
      </Card>

      {/* Contacto: uno solo para todas */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Datos del colegio</h2>
          </div>
          <p className="-mt-2 text-sm text-gray-500">
            Uno solo, el mismo para todas las cuentas.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">RNC o cédula del colegio</span>
              <Input value={contacto.documento}
                onChange={(e) => setContacto({ ...contacto, documento: e.target.value })} />
              <span className="mt-1 block text-xs text-gray-400">
                El que usan las cuentas que no digan otro. El RNC lleva 9 dígitos y la
                cédula 11; la página de la familia lo llama por su nombre según lo que
                escribas.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Teléfono de ayuda</span>
              <Input value={contacto.telefonoAyuda}
                onChange={(e) => setContacto({ ...contacto, telefonoAyuda: e.target.value })} />
              <span className="mt-1 block text-xs text-gray-400">
                A dónde llama la familia si algo falla.
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-gray-700">Horario</span>
              <Input value={contacto.horarioAyuda} placeholder="Lun–Vie 8:00 a.m. – 5:00 p.m."
                onChange={(e) => setContacto({ ...contacto, horarioAyuda: e.target.value })} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Instrucciones extra (opcional)</span>
            <textarea rows={2} value={contacto.instrucciones}
              onChange={(e) => setContacto({ ...contacto, instrucciones: e.target.value })}
              placeholder="Ej.: no aceptamos depósitos en efectivo en ventanilla."
              className="w-full rounded-md border border-gray-200 p-2 text-sm" />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={contacto.aceptaTransferencia}
              onChange={(e) => setContacto({ ...contacto, aceptaTransferencia: e.target.checked })} />
            Aceptar transferencias desde el enlace de pago
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
            {guardado && (
              <span className="flex items-center gap-1 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Guardado
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lo mismo que verá la familia. Es la única forma de notar que el titular
          está mal escrito antes de que lo copien treinta padres. */}
      {listas.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Así lo verá la familia
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {listas.map((c, i) => (
                <div key={c.id ?? i} className="overflow-hidden rounded-lg border border-gray-200">
                  <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2">
                    <span className="font-bold text-gray-900">{c.banco}</span>
                    {c.tipoCuenta && <span className="text-xs text-gray-500">{c.tipoCuenta}</span>}
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[11px] text-gray-500">Número de cuenta</p>
                    <p className="text-lg font-bold tracking-wide text-gray-900">{c.numeroCuenta}</p>
                    {c.titular && (
                      <>
                        <p className="mt-1.5 text-[11px] text-gray-500">A nombre de</p>
                        <p className="text-sm text-gray-900">{c.titular}</p>
                      </>
                    )}
                    {(c.documento || contacto.documento) && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {((c.documento || contacto.documento).replace(/\D/g, '').length === 11
                          ? 'Cédula' : 'RNC')}:{' '}
                        <span className="font-semibold text-gray-900">
                          {c.documento || contacto.documento}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Debajo van, una sola vez, la referencia y el total. La referencia es
              distinta para cada familia: es lo que te permite saber de quién es cada
              transferencia.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
