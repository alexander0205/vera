'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import ClienteForm from '@/app/(dashboard)/dashboard/clientes/_cliente-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';

/**
 * A quién se le factura este alumno.
 *
 * Es un CONTACTO de Facturación, no un tutor. Antes salía de marcar una casilla
 * en el tutor, y eso obligaba a que la misma persona existiera dos veces —como
 * tutor y como cliente— con el teléfono y el correo duplicados en las dos.
 *
 * Dos caminos porque los dos pasan de verdad: el padre que ya es cliente del
 * colegio (otro hijo, o le compra el uniforme) y el que entra por primera vez.
 */

/**
 * `editar` abre el contacto que YA está asignado. Es el mismo formulario de los
 * otros dos modos: corregirle el teléfono al padre no debería sacar al usuario
 * de la ficha del alumno para dejarlo en otra pantalla del sistema.
 */
type Modo = 'buscar' | 'crear' | 'editar';

export interface Contacto {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
}

export function ResponsablePagoDialog({
  open, onOpenChange, onElegir, onCreado, onActualizado, prefill,
  modoInicial = 'buscar', clienteId, existente = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Datos para arrancar «Nuevo contacto» ya escrito (viene de un tutor). */
  prefill?: { razonSocial?: string; rnc?: string; telefono?: string; celular?: string; whatsapp?: string; email?: string };
  /** Con qué pestaña abre. `crear` cuando ya se buscó y no había nada. */
  modoInicial?: Modo;
  /** El contacto que se edita. Solo se usa con `modoInicial='editar'`. */
  clienteId?: number;
  /**
   * Un contacto que YA tiene esa misma cédula.
   *
   * Sale al hacer responsable a un tutor: se busca su documento en Contactos y,
   * si aparece, en vez de asignarlo por su cuenta —que dejaba al usuario sin
   * ver qué pasó— se enseña arriba del formulario para que elija entre usar el
   * que hay o crear otro. Es lo que evita dos fichas del mismo padre.
   */
  existente?: Contacto | null;
  /** Se eligió un contacto que ya existía. */
  onElegir: (c: Contacto) => void;
  /** Se creó uno nuevo; lo guardó el propio formulario y devuelve id y nombre. */
  onCreado: (clienteId: number, razonSocial: string) => void;
  /** Se guardaron cambios sobre el responsable que ya estaba asignado. */
  onActualizado?: () => void;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const editando = modo === 'editar';
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Contacto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); setResultados([]); setError(null); }
    else setModo(modoInicial);
  }, [open, modoInicial]);

  // La búsqueda espera a que se pare de escribir: son contactos de todo el
  // colegio y una consulta por tecla no adelanta nada.
  useEffect(() => {
    if (!open || modo !== 'buscar') return;
    const t = setTimeout(async () => {
      const term = q.trim();
      if (!term) { setResultados([]); return; }
      setBuscando(true);
      try {
        const r = await fetch(`/api/clientes?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setResultados(j.clientes ?? []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open, modo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ModalHeader
          title={editando ? 'Editar responsable de pago' : 'Responsable de pago'}
          subtitle={editando
            ? 'Los cambios valen para todas sus facturas, no solo para este alumno.'
            : 'El contacto al que se le emiten las facturas de este alumno.'}
        />

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Editando no hay nada que elegir: el contacto ya está asignado. */}
          {!editando && (
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {([['buscar', 'Buscar contacto'], ['crear', 'Nuevo contacto']] as const).map(([v, etiqueta]) => (
                <button key={v} type="button" onClick={() => { setModo(v); setError(null); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    modo === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  }`}>
                  {etiqueta}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {modo === 'buscar' ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input value={q} autoFocus placeholder="Nombre, RNC o cédula…"
                  style={{ paddingLeft: '2.25rem' }}
                  onChange={(e) => setQ(e.target.value)} />
              </div>

              {buscando ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
              ) : resultados.length > 0 ? (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {resultados.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { onElegir(c); onOpenChange(false); }}
                      className="block w-full px-3 py-2.5 text-left hover:bg-gray-50">
                      <p className="text-sm font-medium text-gray-900">{c.razonSocial}</p>
                      <p className="text-xs text-gray-500">
                        {c.rnc ?? 'sin documento'}{c.telefono ? ` · ${c.telefono}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              ) : q.trim() ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
                  <p className="text-sm text-gray-500">Ningún contacto con esos datos.</p>
                  <Button variant="outline" size="sm" className="mt-3"
                    onClick={() => setModo('crear')}>
                    <UserPlus className="mr-1.5 h-4 w-4" />Crearlo
                  </Button>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">
                  Busca por nombre, RNC o cédula.
                </p>
              )}
            </>
          ) : (
            <>
            {/* Ya hay alguien con esa cédula: se enseña antes del formulario,
                no después de haber creado el duplicado. */}
            {!editando && existente && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Ya existe con esa cédula</p>
                  <p className="truncate text-xs text-gray-600">
                    {existente.razonSocial}{existente.rnc ? ` · ${existente.rnc}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0"
                  onClick={() => { onElegir(existente); onOpenChange(false); }}>
                  Usar este
                </Button>
              </div>
            )}
            {/* Qué campo sirve para avisar, dicho ANTES de llenar el formulario.
                El primer campo del formulario se llama «Teléfono» y es el único
                que no recibe nada: quien venía a arreglar un responsable «al que
                no se le puede avisar» escribía ahí el número, guardaba —se
                guardaba de verdad, con 200— y la ficha seguía diciendo lo mismo.
                El aviso de los iconos ya lo explicaba, pero en un tooltip de una
                pantalla anterior, o sea después de haberse equivocado. */}
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Los recordatorios salen por <b>Celular</b>, <b>WhatsApp</b> y <b>Email</b>.
              El <b>Teléfono</b> fijo no recibe SMS ni WhatsApp.
            </p>
            {/* El MISMO formulario de Contactos, embebido. Copiarlo aquí habría
                significado que el día que Contactos gane un campo, el colegio
                siga creando responsables sin él. */}
            <ClienteForm
              embebido
              key={editando ? `editar-${clienteId}` : (prefill?.rnc ?? 'nuevo')}
              clienteId={editando ? clienteId : undefined}
              valoresIniciales={editando ? undefined : prefill}
              onCancelar={() => (editando ? onOpenChange(false) : setModo('buscar'))}
              onGuardado={(id, nombre) => {
                if (editando) onActualizado?.();
                else onCreado(id, nombre);
                onOpenChange(false);
              }}
            />
            </>
          )}
        </div>

        {/* En «Nuevo contacto» los botones los pone el propio formulario. */}
        {modo === 'buscar' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
