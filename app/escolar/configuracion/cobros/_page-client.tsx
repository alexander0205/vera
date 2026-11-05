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
import { Textarea } from '@/components/ui/textarea';
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
  'Asociación La Nacional',
];

const TIPOS_CUENTA = ['Ahorros', 'Corriente'];

const OTRO = '__otro__';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * La opción de la lista que corresponde a lo guardado. Lo de antes se escribió
 * a mano y viene de mil formas («Cuenta corriente», «Ahorro», «Banco BHD»):
 * sin esto todas caerían en «Otro…» aunque sean un banco de la lista.
 */
export function opcionQueCoincide(valor: string, opciones: string[]): string | null {
  const v = sinAcentos(valor);
  if (!v) return null;
  return opciones.find((o) => {
    const x = sinAcentos(o);
    return x === v || (v.length >= 3 && (v.includes(x) || x.includes(v)));
  }) ?? null;
}
/**
 * Validación de lo que el servidor acepta pero recorta o guarda mal sin decirlo
 * (`datos-pago` hace `slice` a 20/40/60 y quita lo que no es \w). Aquí se avisa
 * antes de guardar, junto al campo, en vez de descubrirlo en la página del padre.
 * Los topes son los mismos que los del servidor.
 */
const MAX = { banco: 120, cuenta: 60, titular: 120, documento: 20, telefono: 40, horario: 120, instrucciones: 500 } as const;

const soloDigitos = (v: string) => v.replace(/\D/g, '');

/** RNC (9) o cédula (11). Vacío es válido: es opcional o hereda el del colegio. */
function errorDocumento(v: string): string | null {
  if (!v.trim()) return null;
  const n = soloDigitos(v).length;
  return n === 9 || n === 11 ? null : `Un RNC lleva 9 dígitos y una cédula 11; tiene ${n}.`;
}

/** Teléfono dominicano: 10 dígitos (809/829/849), con o sin +1. */
function errorTelefono(v: string): string | null {
  if (!v.trim()) return null;
  const d = soloDigitos(v);
  const n = d.startsWith('1') && d.length === 11 ? 10 : d.length;
  return n >= 7 && n <= 11 ? null : 'Escribe un teléfono completo, con el código de área (809, 829 o 849).';
}

const claseLista = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-zero-500 focus:outline-none focus:ring-1 focus:ring-zero-500';

/**
 * Una lista para elegir, con una salida «Otro…» que abre una casilla para
 * escribirlo. Antes era un campo con sugerencias del navegador: aceptaba
 * cualquier texto, pero parecía un desplegable cerrado y nadie veía cómo poner
 * un banco que no estaba.
 */
function ListaConOtro({ valor, opciones, etiquetaOtro, placeholderOtro, onCambio }: {
  valor: string;
  opciones: string[];
  etiquetaOtro: string;
  placeholderOtro: string;
  onCambio: (v: string) => void;
}) {
  const coincide = opcionQueCoincide(valor, opciones);
  const [escribiendo, setEscribiendo] = useState(!coincide && valor.trim() !== '');
  return (
    <div className="space-y-2">
      <select className={claseLista} aria-label={etiquetaOtro.replace('…', '')} value={escribiendo ? OTRO : coincide ?? ''}
        onChange={(e) => {
          if (e.target.value === OTRO) { setEscribiendo(true); onCambio(''); return; }
          setEscribiendo(false);
          onCambio(e.target.value);
        }}>
        <option value="" disabled>Elige…</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTRO}>{etiquetaOtro}</option>
      </select>
      {escribiendo && (
        <Input autoFocus value={valor} placeholder={placeholderOtro} maxLength={MAX.banco}
          aria-label={etiquetaOtro}
          onChange={(e) => onCambio(e.target.value)} />
      )}
    </div>
  );
}

export default function CobrosClient() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [contacto, setContacto] = useState<Contacto>(CONTACTO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tras el primer intento de guardar se enseñan los errores de cada campo. */
  const [intento, setIntento] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/administracion-escolar/datos-pago', { cache: 'no-store' });
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

  /** Cuentas a medio llenar: se descartan al guardar, y es mejor decirlo que callarlo. */
  const incompletas = cuentas.filter((c) => (c.banco.trim() || c.numeroCuenta.trim() || c.titular.trim()) && !(c.banco.trim() && c.numeroCuenta.trim()));
  const hayErrores = errorDocumento(contacto.documento) || errorTelefono(contacto.telefonoAyuda)
    || cuentas.some((c) => errorDocumento(c.documento));

  async function guardar() {
    setIntento(true);
    if (hayErrores) { setError('Corrige los campos marcados en rojo antes de guardar.'); return; }
    if (incompletas.length > 0) { setError('Hay cuentas sin banco o sin número. Complétalas o quítalas.'); return; }
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
                    <button type="button" title="Quitar esta cuenta" aria-label={`Quitar la cuenta ${c.banco.trim() || i + 1}`}
                      onClick={() => setCuentas((p) => p.filter((_, j) => j !== i))}
                      className="text-gray-400 transition hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Banco</span>
                      <ListaConOtro valor={c.banco} opciones={BANCOS} etiquetaOtro="Otro banco…"
                        placeholderOtro="Escribe el nombre del banco"
                        onCambio={(v) => editar(i, 'banco', v)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Tipo de cuenta</span>
                      <ListaConOtro valor={c.tipoCuenta} opciones={TIPOS_CUENTA} etiquetaOtro="Otro…"
                        placeholderOtro="Escribe el tipo de cuenta"
                        onCambio={(v) => editar(i, 'tipoCuenta', v)} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Número de cuenta</span>
                      <Input value={c.numeroCuenta} inputMode="numeric" autoComplete="off" maxLength={MAX.cuenta}
                        error={intento && !c.numeroCuenta.trim() && !!c.banco.trim()}
                        onChange={(e) => editar(i, 'numeroCuenta', e.target.value.replace(/[^\w-]/g, ''))} />
                      {intento && !c.numeroCuenta.trim() && !!c.banco.trim() && (
                        <span className="mt-1 block text-xs text-red-600">Falta el número de cuenta.</span>
                      )}
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Titular</span>
                      <Input value={c.titular} placeholder="Tal como aparece en el banco" maxLength={MAX.titular}
                        onChange={(e) => editar(i, 'titular', e.target.value)} />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-gray-700">
                        RNC o cédula del titular
                      </span>
                      <Input value={c.documento} inputMode="numeric" maxLength={MAX.documento}
                        placeholder={contacto.documento
                          ? `${contacto.documento} (el del colegio)`
                          : 'RNC o cédula'}
                        error={intento && !!errorDocumento(c.documento)}
                        onChange={(e) => editar(i, 'documento', e.target.value)} />
                      {intento && errorDocumento(c.documento) && (
                        <span className="mt-1 block text-xs text-red-600">{errorDocumento(c.documento)}</span>
                      )}
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
              <Input value={contacto.documento} inputMode="numeric" maxLength={MAX.documento}
                error={intento && !!errorDocumento(contacto.documento)}
                onChange={(e) => setContacto({ ...contacto, documento: e.target.value })} />
              {intento && errorDocumento(contacto.documento) && (
                <span className="mt-1 block text-xs text-red-600">{errorDocumento(contacto.documento)}</span>
              )}
              <span className="mt-1 block text-xs text-gray-400">
                El que usan las cuentas que no digan otro. El RNC lleva 9 dígitos y la
                cédula 11; la página de la familia lo llama por su nombre según lo que
                escribas.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Teléfono de ayuda</span>
              <Input value={contacto.telefonoAyuda} type="tel" inputMode="tel" maxLength={MAX.telefono} placeholder="809-555-1234"
                error={intento && !!errorTelefono(contacto.telefonoAyuda)}
                onChange={(e) => setContacto({ ...contacto, telefonoAyuda: e.target.value })} />
              {intento && errorTelefono(contacto.telefonoAyuda) && (
                <span className="mt-1 block text-xs text-red-600">{errorTelefono(contacto.telefonoAyuda)}</span>
              )}
              <span className="mt-1 block text-xs text-gray-400">
                A dónde llama la familia si algo falla.
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-gray-700">Horario</span>
              <Input value={contacto.horarioAyuda} placeholder="Lun–Vie 8:00 a.m. – 5:00 p.m." maxLength={MAX.horario}
                onChange={(e) => setContacto({ ...contacto, horarioAyuda: e.target.value })} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Instrucciones extra (opcional)</span>
            <Textarea rows={3} value={contacto.instrucciones} maxLength={MAX.instrucciones}
              onChange={(e) => setContacto({ ...contacto, instrucciones: e.target.value })}
              placeholder="Ej.: no aceptamos depósitos en efectivo en ventanilla." />
            <span className="mt-1 block text-right text-xs text-gray-400">{contacto.instrucciones.length}/{MAX.instrucciones}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={contacto.aceptaTransferencia}
              onChange={(e) => setContacto({ ...contacto, aceptaTransferencia: e.target.checked })} />
            Aceptar transferencias desde el enlace de pago
          </label>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

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
