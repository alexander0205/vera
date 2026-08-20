'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Loader2, Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ETIQUETA_FRECUENCIA } from '@/lib/administracion-escolar/calendario';
import { ConceptoDetalle, type Concepto } from './ConceptoDetalle';
import { type ApiCalendario } from './CalendarioCuotas';
import { Agarradera } from './arbol';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * El catálogo de conceptos: qué cobra el colegio y con qué ritmo.
 *
 * Está separado de la pantalla de tarifas a propósito. Definir un concepto
 * —cómo se llama, cada cuánto se cobra, cuándo vence, cuándo se avisa— se hace una
 * vez al montar el colegio; ponerle precio a cada grado se repite cada año al
 * subir la colegiatura. Mezclarlas obligaba a atravesar el árbol de grados
 * para cambiar un nombre.
 *
 * El ciclo de cobro vive en el concepto y no en un ajuste único del colegio
 * porque no todo se cobra igual: la colegiatura puede emitirse el día 28 y el
 * transporte el 1, y un solo número no puede decir eso.
 */

// `no-store` a propósito: sin él el navegador puede responder desde su propia
// caché HTTP después de guardar, y entonces `mutate()` "refresca" a la versión
// vieja. Con el orden editable eso es peor que ver un nombre viejo: la lista
// adopta el orden caducado y el siguiente movimiento lo guarda de vuelta.
const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

/** Mismo aspecto que las flechas del árbol de Estructura: se ordena igual. */
const FLECHA = 'shrink-0 rounded text-gray-300 enabled:hover:bg-gray-200 enabled:hover:text-gray-700 disabled:opacity-30';

export function ConceptosCatalogo() {
  const { data, isLoading, mutate } = useSWR<{ conceptos: Concepto[] }>(
    '/api/administracion-escolar/conceptos', fetcher,
  );
  const conceptos = useMemo(() => data?.conceptos ?? [], [data]);

  const [selId, setSelId] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Concepto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  /**
   * El calendario de cuotas se registra aquí para que «Guardar cambios» lo
   * guarde con el concepto. Antes tenía botón propio, abajo de su tabla, y era
   * el único que lo guardaba: quitabas un mes, pulsabas el botón grande de
   * abajo del todo y el mes volvía como si el borrado no funcionara.
   */
  const calendario = useRef<ApiCalendario | null>(null);
  const [porBorrar, setPorBorrar] = useState<Concepto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<number | null>(null);
  const [sobre, setSobre] = useState<{ id: number; lado: 'arriba' | 'abajo' } | null>(null);

  // Al abrir, el primero de la lista: una pantalla de detalle vacía no dice
  // nada sobre lo que hay dentro.
  useEffect(() => {
    if (selId == null && conceptos.length > 0) setSelId(conceptos[0].id);
  }, [conceptos, selId]);

  const seleccionado = conceptos.find((c) => c.id === selId) ?? null;

  useEffect(() => {
    setBorrador(seleccionado ? { ...seleccionado } : null);
    setError(null);
  }, [seleccionado]);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/conceptos/${borrador.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(borrador),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
      // El calendario va DESPUÉS del concepto y dentro del mismo botón: sus
      // cuotas dependen de la frecuencia y del día de emisión que se acaban de
      // guardar. Si el PUT falla, lanza, y este `guardar` no dice que guardó.
      await calendario.current?.guardar();
      await mutate();
      // Guardar el concepto puede tocar las cuotas por detrás —renombrarlo
      // renombra la del pago único—, así que el calendario se rebaja.
      await calendario.current?.recargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function crear() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      const res = await fetch('/api/administracion-escolar/conceptos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo: 'otro' }),
      });
      const json = await res.json();
      if (res.ok && json.concepto) {
        setNuevoNombre('');
        await mutate();
        setSelId(json.concepto.id);
      }
    } finally {
      setCreando(false);
    }
  }

  /**
   * Lleva un concepto a la posición `destino` y lo deja guardado.
   *
   * Se renumera la lista ENTERA (0..n-1) y no se intercambian dos posiciones:
   * los conceptos vienen de una migración que pudo dejar empates, y con dos
   * filas en el mismo número un intercambio no mueve nada — la flecha parecería
   * rota. Renumerar deshace el empate en el primer movimiento.
   *
   * Toma un índice de destino y no un salto de uno porque las flechas y el
   * arrastre son la misma operación: soltar en mitad de la lista mueve varias
   * posiciones de golpe.
   */
  async function colocar(id: number, destino: number) {
    const i = conceptos.findIndex((c) => c.id === id);
    const d = Math.max(0, Math.min(conceptos.length - 1, destino));
    if (i < 0 || i === d) return;

    const lista = [...conceptos];
    const [movido] = lista.splice(i, 1);
    lista.splice(d, 0, movido);
    const renumerada = lista.map((c, k) => ({ ...c, orden: k }));

    // Optimista: la fila salta al instante. `false` para que SWR no revalide
    // todavía y la lista no parpadee al orden viejo mientras vuelve el PATCH.
    await mutate({ conceptos: renumerada }, false);

    const res = await fetch('/api/administracion-escolar/orden', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nivel: 'concepto',
        items: renumerada.map((c) => ({ id: c.id, orden: c.orden })),
      }),
    });
    // Si falló, lo pintado es mentira: se vuelve a traer lo que hay de verdad.
    if (!res.ok) setError('No se pudo guardar el orden.');
    await mutate();
  }

  /**
   * Arrastre nativo del navegador, sin librería: la lista es plana y solo hace
   * falta reordenar hermanos. `sobre` guarda encima de qué fila está el cursor
   * y de qué lado, para pintar la línea de destino.
   */
  function dnd(id: number) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setArrastre(id);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox no inicia el arrastre si no se escribe algo en dataTransfer.
        e.dataTransfer.setData('text/plain', String(id));
      },
      onDragOver: (e: React.DragEvent) => {
        if (arrastre == null || arrastre === id) return;
        e.preventDefault();          // sin esto el navegador no permite soltar
        e.dataTransfer.dropEffect = 'move';
        const caja = e.currentTarget.getBoundingClientRect();
        const lado = e.clientY < caja.top + caja.height / 2 ? 'arriba' : 'abajo';
        setSobre((s) => (s?.id === id && s.lado === lado ? s : { id, lado }));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const dest = sobre;
        const orig = arrastre;
        setArrastre(null); setSobre(null);
        if (orig == null || !dest) return;

        const iOrig = conceptos.findIndex((x) => x.id === orig);
        const iSobre = conceptos.findIndex((x) => x.id === dest.id);
        if (iOrig < 0 || iSobre < 0) return;
        // Índice de inserción en la lista YA sin el elemento arrastrado: si
        // venía de más arriba, todo lo de abajo subió un puesto.
        let destino = dest.lado === 'arriba' ? iSobre : iSobre + 1;
        if (iOrig < destino) destino -= 1;
        void colocar(orig, destino);
      },
      onDragEnd: () => { setArrastre(null); setSobre(null); },
    };
  }

  /**
   * Borra un concepto, con confirmación propia.
   *
   * Ya no con `window.confirm`: en el navegador embebido de la app devuelve
   * `false` al instante y sin enseñar nada, así que la papelera no hacía
   * absolutamente nada —ni borraba ni avisaba— y parecía rota.
   */
  async function confirmarBorrado() {
    const c = porBorrar;
    if (!c) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/conceptos/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrorBorrado(j.error ?? 'No se pudo eliminar');
        return;
      }
      setPorBorrar(null);
      setErrorBorrado(null);
      if (selId === c.id) setSelId(null);
      await mutate();
    } finally {
      setBorrando(false);
    }
  }

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />Cargando conceptos…
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <p className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
          Conceptos
        </p>
        {conceptos.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">Todavía no hay ninguno.</p>
        ) : conceptos.map((c, i) => (
          // Fila y no un solo <button>: la agarradera y las flechas son
          // controles aparte y no pueden ir dentro del que selecciona. El grupo
          // se queda con el hover para que solo salgan en la fila que se está
          // mirando; siempre visibles, once conceptos son veintidós flechas
          // compitiendo con los nombres.
          <div key={c.id} {...dnd(c.id)}
            className={`group relative flex items-center border-l-2 pr-1 transition-colors ${
              c.id === selId
                ? 'border-zero-600 bg-zero-50 text-zero-800'
                : 'border-transparent text-gray-700 hover:bg-gray-50'
            } ${arrastre === c.id ? 'opacity-40' : ''}`}>
            {/* La línea de destino va absoluta, no como borde: como borde
                empujaría la fila 2px al pasar por encima y la lista entera
                tiembla mientras se arrastra. */}
            {sobre?.id === c.id && arrastre != null && arrastre !== c.id && (
              <span aria-hidden className={`pointer-events-none absolute inset-x-0 h-0.5 bg-zero-500 ${
                sobre.lado === 'arriba' ? 'top-0' : 'bottom-0'}`} />
            )}
            <span className="pl-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Agarradera />
            </span>
            <button type="button" onClick={() => setSelId(c.id)}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm">
              <span className={`min-w-0 flex-1 truncate ${c.activo ? '' : 'text-gray-400 line-through'}`}>
                {c.nombre}
              </span>
              {c.frecuencia !== 'unico' && (
                <Repeat className="h-3.5 w-3.5 shrink-0 opacity-60" aria-label={ETIQUETA_FRECUENCIA[c.frecuencia]} />
              )}
            </button>
            {/* Las flechas se quedan además del arrastre: son el camino con
                teclado, y en una lista con barra de desplazamiento mover una
                fila dos puestos con el mouse es más fácil pulsando dos veces
                que arrastrando. */}
            <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" title="Subir" aria-label={`Subir ${c.nombre}`}
                disabled={i === 0} onClick={() => void colocar(c.id, i - 1)}
                className={FLECHA}><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" title="Bajar" aria-label={`Bajar ${c.nombre}`}
                disabled={i === conceptos.length - 1} onClick={() => void colocar(c.id, i + 1)}
                className={FLECHA}><ChevronDown className="h-3.5 w-3.5" /></button>
            </span>
          </div>
        ))}
        <div className="flex gap-1.5 border-t border-gray-100 p-2">
          <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }}
            placeholder="Nuevo concepto" className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={() => void crear()}
            disabled={creando || !nuevoNombre.trim()} className="h-8 shrink-0 px-2">
            {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {!borrador ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Elige un concepto para configurarlo.
        </div>
      ) : (
        <ConceptoDetalle
          borrador={borrador}
          setBorrador={setBorrador}
          guardando={guardando}
          error={error}
          onGuardar={() => void guardar()}
          onBorrar={() => setPorBorrar(borrador)}
          calendario={calendario}
        />
      )}

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o: boolean) => { if (!o) { setPorBorrar(null); setErrorBorrado(null); } }}
        title={`Eliminar "${porBorrar?.nombre ?? ''}"`}
        description={
          <>
            Se va con él lo que tenga puesto: su calendario de cuotas y las tarifas
            de cada grado. Si ya se le cobró a algún alumno, no se puede borrar.
            {errorBorrado && (
              <span className="mt-2 block rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {errorBorrado}
              </span>
            )}
          </>
        }
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        onConfirm={() => void confirmarBorrado()} />
    </div>
  );
}
