'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP } from '@/lib/utils/format';
import type { MesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import {
  cobrosALaVista, ecoDeLaFecha, ecoDelMonto, esCobroFijo, normalizar, PISTA_DEL_MONTO,
  type CobroDelColegio, type ErroresPaso1, type OrigenMonto,
} from '@/lib/administracion-escolar/cargo-lote';

/**
 * Paso 1 de «Cargo a varios alumnos»: qué se cobra, cuánto y hasta cuándo.
 *
 * Antes era un buscador que abría una lista flotante con «conceptos», un enlace
 * «+ Crear uno nuevo» con su propio nombre y su propio precio, un campo «Año»,
 * el monto y el vencimiento. Cinco cosas con nombre de sistema. Ahora son tres
 * preguntas dichas como se dicen en la oficina:
 *
 *  - «¿Qué vas a cobrar?» — los cobros del colegio a la vista, uno por fila, y
 *    el primero de todos «Un cobro nuevo». No hay que saber que existe un
 *    catálogo ni buscar nada para ver qué hay;
 *  - «¿Cuánto paga cada alumno?» — y debajo el número de vuelta, ya con sus
 *    comas, para ver que «1,100» se leyó mil cien;
 *  - «¿Hasta cuándo pueden pagar?» — con el día de la semana escrito.
 *
 * El cobro nuevo NO se crea al escribir su nombre: se crea al pulsar
 * «Continuar», que es cuando la persona ha dicho que sí. Y lo que casi nunca
 * se cobra por aquí —mensualidad e inscripción, que tienen precio por curso y
 * becas— va detrás de un enlace y con aviso.
 *
 * Este componente no decide nada del cobro: pinta lo que la pantalla le pasa y
 * le avisa de cada cambio. Lo único que guarda es de interfaz: qué listas están
 * abiertas y qué se está buscando.
 */

interface Producto {
  id: number;
  nombre: string;
  /** En centavos, como todo el dinero del sistema. */
  precio: number;
}

const traer = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { productos: [] }));

/** Cuántos cobros se enseñan sin pedirlo. Más, y la lista tapa el monto. */
const COBROS_A_LA_VISTA = 6;
/** A partir de cuántos cobros merece la pena un buscador encima. */
const COBROS_PARA_BUSCAR = 8;

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/*
 * Nota de maquetación. Las etiquetas, los campos y los botones de esta app son
 * de MUI, y sus estilos ganan a cualquier utilidad de Tailwind sobre la misma
 * propiedad: un margen puesto a un campo no hace nada. Por eso aquí el aire
 * entre una etiqueta y su campo sale del HUECO de su contenedor (`grid gap-…`)
 * y los anchos de un `div` envoltorio, nunca de una clase en el componente.
 */
const FILA = 'flex cursor-pointer items-center gap-3 px-3 py-3';
const RADIO = 'h-4 w-4 shrink-0 accent-zero-600';
const LISTA = 'divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200';
const ENLACE = 'inline-flex items-center gap-1.5 rounded text-left text-xs font-medium text-zero-600 hover:text-zero-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500';
const fondo = (puesta: boolean) => (puesta ? 'bg-zero-50' : 'hover:bg-gray-50');

/** Enter en un buscador busca; no puede ser «Continuar» por accidente. */
function noEnviarConEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.preventDefault();
}

export function QueSeCobra({
  cobros, puedeCrear, cobroId, nombreNuevo, cobroCorregibleId, nombreCorregido, esMensualidad, meses, mesKey,
  monto, origenMonto, montoUltimaVez, fecha, hoy, errores, notaRepetido, yaCobrado, guardando,
  onElegirCobro, onElegirNuevo, onNombreNuevo, onNombreCorregido, onUsarUltimaVez,
  onMes, onMonto, onFecha, onConceptoCreado, onContinuar,
}: {
  /** Los cobros activos del colegio. */
  cobros: CobroDelColegio[];
  /** ¿Puede crear cobros y traer productos? Es el permiso de configurar. */
  puedeCrear: boolean;
  /** Id del cobro elegido, como texto. Vacío = ninguno. */
  cobroId: string;
  /** Lo escrito en «Un cobro nuevo». `null` = esa fila no está elegida. */
  nombreNuevo: string | null;
  /**
   * El cobro que se creó en esta visita y con el que todavía no se ha cobrado:
   * mientras esté elegido se le puede corregir el nombre. `null` = ninguno.
   */
  cobroCorregibleId: number | null;
  /** El nombre corregido, a medio escribir. `null` = no lo ha tocado. */
  nombreCorregido: string | null;
  esMensualidad: boolean;
  /** Los meses del año escolar, para la mensualidad. */
  meses: MesDelPeriodo[];
  /** El mes elegido como 'YYYY-MM'. Vacío = ninguno. */
  mesKey: string;
  monto: string;
  origenMonto: OrigenMonto;
  /** Lo que se cobró la última vez por el cobro elegido, en centavos. `null` si no se sabe. */
  montoUltimaVez: number | null;
  fecha: string;
  /** Hoy en República Dominicana, 'YYYY-MM-DD'. */
  hoy: string;
  errores: ErroresPaso1;
  /** Nombre del cobro que ya existía y quedó elegido en vez de crear un gemelo. */
  notaRepetido: string | null;
  /** El cobro elegido ya se le cobró a alguien este año escolar. */
  yaCobrado: boolean;
  /** Se está guardando el cobro nuevo. */
  guardando: boolean;
  onElegirCobro: (id: string, extra?: { precioCentavos?: number }) => void;
  onElegirNuevo: () => void;
  onNombreNuevo: (texto: string) => void;
  onNombreCorregido: (texto: string) => void;
  /** Poner en el campo lo que se cobró la última vez. */
  onUsarUltimaVez: () => void;
  onMes: (key: string) => void;
  onMonto: (texto: string) => void;
  onFecha: (iso: string) => void;
  /** Se trajo un producto como cobro: la pantalla lo añade a su lista. */
  onConceptoCreado: (creado: CobroDelColegio) => void;
  onContinuar: () => void;
}) {
  const [filtro, setFiltro] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [fijosAbiertos, setFijosAbiertos] = useState(false);
  const [qProducto, setQProducto] = useState('');
  const [trayendo, setTrayendo] = useState<number | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);

  // Lo que se cobra de vez en cuando, con el más nuevo arriba: el «día de cine»
  // que se acaba de crear es el que se va a buscar.
  const sueltos = useMemo(
    () => cobros.filter((c) => !esCobroFijo(c.tipo)).sort((a, b) => b.id - a.id),
    [cobros],
  );
  const fijos = useMemo(() => cobros.filter((c) => esCobroFijo(c.tipo)), [cobros]);
  const elegido = cobros.find((c) => String(c.id) === cobroId) ?? null;
  const elegidoEsFijo = elegido !== null && esCobroFijo(elegido.tipo);

  const buscado = normalizar(filtro.trim());
  // El elegido se enseña siempre, también con algo escrito en el buscador: una
  // lista sin ninguna fila marcada parece que no se ha elegido nada, y
  // «Continuar» seguiría adelante con un cobro que no está a la vista.
  const { visibles, sinCoincidencias } = useMemo(
    () => cobrosALaVista(sueltos, { buscado: filtro, verTodos, cobroId, tope: COBROS_A_LA_VISTA }),
    [filtro, cobroId, sueltos, verTodos],
  );

  // El catálogo solo se consulta con algo escrito: son cientos de productos.
  const busca = qProducto.trim().length >= 2;
  const { data: cat, isLoading: buscando } = useSWR<{ productos?: Producto[]; items?: Producto[] }>(
    catalogoAbierto && busca ? `/api/productos?q=${encodeURIComponent(qProducto.trim())}&limit=8` : null,
    traer,
  );
  const productos: Producto[] = cat?.productos ?? cat?.items ?? [];
  /**
   * Lo que el colegio ya tiene como cobro no se ofrece otra vez: por id cuando
   * está enlazado y también POR NOMBRE, porque los cobros escritos a mano no
   * apuntan a ningún producto y elegir el de abajo crearía un gemelo. Es la
   * misma regla del buscador del cargo individual.
   */
  const yaEstan = useMemo(() => ({
    ids: new Set(cobros.map((c) => c.productId).filter((v): v is number => v != null)),
    nombres: new Set(cobros.map((c) => normalizar(c.nombre.trim()))),
  }), [cobros]);
  const productosNuevos = productos.filter(
    (p) => !yaEstan.ids.has(p.id) && !yaEstan.nombres.has(normalizar(p.nombre.trim())),
  );

  /**
   * Trae el producto al colegio: crea el cobro enlazado a él y lo deja elegido,
   * con su precio puesto. Nace como cobro suelto («otro»), no como mensualidad.
   */
  async function usarProducto(p: Producto) {
    setTrayendo(p.id);
    setErrorCatalogo(null);
    try {
      const res = await fetch('/api/administracion-escolar/conceptos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: p.nombre, tipo: 'otro', productId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      const creado: CobroDelColegio | undefined = data?.concepto;
      if (!res.ok || !creado) {
        setErrorCatalogo(res.status === 403
          ? 'No tienes permiso para traer productos. Pídeselo a un administrador de tu colegio.'
          : 'No se pudo traer el producto. Inténtalo otra vez.');
        return;
      }
      onConceptoCreado(creado);
      onElegirCobro(String(creado.id), { precioCentavos: p.precio });
      setCatalogoAbierto(false);
      setQProducto('');
    } catch {
      setErrorCatalogo('No se pudo traer el producto. Inténtalo otra vez.');
    } finally {
      setTrayendo(null);
    }
  }

  const ecoMonto = ecoDelMonto(monto);
  // El error del monto ya trae la pista: debajo no se repite.
  const ecoMontoALaVista = !(errores.monto && ecoMonto.texto === PISTA_DEL_MONTO);
  const ecoFecha = ecoDeLaFecha(fecha, hoy);
  const listaFijosAbierta = fijosAbiertos || elegidoEsFijo;
  const sinNadaQueElegir = !puedeCrear && sueltos.length === 0;

  const filaDeCobro = (c: CobroDelColegio) => {
    const puesta = String(c.id) === cobroId;
    // El cobro nuevo se guarda al pulsar «Continuar», y la errata se ve dos
    // pasos después, en la frase grande. Mientras no se haya cobrado con él se
    // corrige aquí mismo: sin esto la única salida era crear otro y dejar el
    // mal escrito en la lista para siempre.
    const corregible = puesta && c.id === cobroCorregibleId;
    return (
      <div key={c.id}>
        <label className={`${FILA} ${fondo(puesta)}`}>
          <input type="radio" name="lote-cobro" className={RADIO}
            checked={puesta} onChange={() => onElegirCobro(String(c.id))} />
          <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">{c.nombre}</span>
        </label>
        {corregible && (
          <div className="grid gap-1.5 border-t border-zero-100 bg-zero-50/40 px-3 py-3 sm:pl-10">
            <Label htmlFor="lote-nombre">¿Lo escribiste mal? Corrígelo aquí</Label>
            <Input id="lote-nombre" maxLength={80} autoComplete="off"
              value={nombreCorregido ?? c.nombre} onChange={(e) => onNombreCorregido(e.target.value)}
              error={Boolean(errores.nombre)} aria-invalid={Boolean(errores.nombre)}
              aria-describedby={errores.nombre ? 'lote-nombre-error lote-nombre-ayuda' : 'lote-nombre-ayuda'} />
            {errores.nombre && (
              <p id="lote-nombre-error" role="alert" className="text-xs text-red-600">{errores.nombre}</p>
            )}
            <p id="lote-nombre-ayuda" className="text-xs text-gray-500">
              Lo acabas de crear y todavía no se le ha cobrado a nadie. Si cambias el nombre, se guarda al
              pulsar «Continuar».
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <form noValidate className="space-y-5 px-4 pb-4 pt-4 sm:px-5 sm:pb-5"
      onSubmit={(e) => { e.preventDefault(); onContinuar(); }}>

      {/* ¿Qué vas a cobrar? */}
      <div className="space-y-2">
        <p id="lote-cobro-pregunta" className="text-sm font-medium text-gray-700">¿Qué vas a cobrar?</p>

        {sueltos.length > COBROS_PARA_BUSCAR && (
          <div>
            <Input aria-label="Buscar entre tus cobros…" placeholder="Buscar entre tus cobros…"
              autoComplete="off" value={filtro}
              onChange={(e) => setFiltro(e.target.value)} onKeyDown={noEnviarConEnter} />
          </div>
        )}

        {sinNadaQueElegir ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
            Tu colegio todavía no tiene cobros creados. Pídele a un administrador que cree el que necesitas.
          </p>
        ) : (
          <div role="radiogroup" aria-labelledby="lote-cobro-pregunta"
            aria-describedby={errores.cobro ? 'lote-cobro-error' : undefined} className={LISTA}>
            {puedeCrear && (
              <div>
                {/* Con el ratón o el dedo, el cursor pasa al nombre. Con las
                    flechas del teclado no: recorrer la lista marcando cada fila
                    no puede sacar el foco de la lista.
                    Se escucha en la FILA y no en el circulito: lo normal es
                    tocar el texto, y el clic que el navegador le reenvía
                    entonces al circulito llega como «simulado» (detail 0),
                    igual que el de las flechas. El clic de verdad es el de la
                    fila, y ese sí dice que hubo un dedo o un ratón. */}
                <label className={`${FILA} ${fondo(nombreNuevo !== null)}`}
                  onClick={(e) => {
                    if (e.detail > 0) setTimeout(() => document.getElementById('lote-nombre')?.focus(), 0);
                  }}>
                  <input type="radio" name="lote-cobro" className={RADIO}
                    checked={nombreNuevo !== null} onChange={onElegirNuevo} />
                  <Plus className="h-4 w-4 shrink-0 text-zero-600" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                    Un cobro nuevo
                    <span className="block text-xs font-normal text-gray-500">
                      Algo que todavía no está en esta lista.
                    </span>
                  </span>
                </label>
                {nombreNuevo !== null && (
                  <div className="grid gap-1.5 border-t border-zero-100 bg-zero-50/40 px-3 py-3 sm:pl-10">
                    <Label htmlFor="lote-nombre">¿Cómo se llama?</Label>
                    <Input id="lote-nombre" maxLength={80} autoComplete="off"
                      placeholder="Ej.: Día de cine de octubre"
                      value={nombreNuevo} onChange={(e) => onNombreNuevo(e.target.value)}
                      error={Boolean(errores.nombre)} aria-invalid={Boolean(errores.nombre)}
                      aria-describedby={errores.nombre ? 'lote-nombre-error lote-nombre-ayuda' : 'lote-nombre-ayuda'} />
                    {errores.nombre && (
                      <p id="lote-nombre-error" role="alert" className="text-xs text-red-600">{errores.nombre}</p>
                    )}
                    <p id="lote-nombre-ayuda" className="text-xs text-gray-500">
                      Así le sale en la cuenta al alumno. Ponle algo que lo distinga, como el mes: el mismo
                      cobro no se le pone dos veces a un alumno en el mismo año escolar.
                    </p>
                  </div>
                )}
              </div>
            )}

            {visibles.map(filaDeCobro)}

            {sinCoincidencias && (
              <p className="px-3 py-3 text-sm text-gray-500">Ningún cobro con ese nombre.</p>
            )}
          </div>
        )}

        {!buscado && sueltos.length > COBROS_A_LA_VISTA && (
          <button type="button" className={ENLACE} aria-expanded={verTodos}
            onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'Ver menos' : `Ver los ${sueltos.length} cobros`}
          </button>
        )}

        {errores.cobro && (
          <p id="lote-cobro-error" role="alert" className="text-xs text-red-600">{errores.cobro}</p>
        )}

        {/* Se anuncia sola: al pulsar «Continuar» no se avanzó, y quien no ve la
            pantalla tiene que enterarse de por qué. */}
        {notaRepetido && (
          <p role="status" className="text-xs text-zero-800">
            Ya tienes un cobro llamado «{notaRepetido}» y quedó elegido ese. Si lo tuyo es otro distinto,
            elige «Un cobro nuevo» y ponle otro nombre.
          </p>
        )}

        {/* El servidor no le cobra dos veces el mismo cobro a un alumno en el
            mismo año escolar, lo haya pagado o no. El segundo «día de cine» del
            año, cobrado con el mismo nombre, se le salta a quien fue al
            primero: se avisa aquí, antes de elegir a quién. */}
        {yaCobrado && elegido && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Este año escolar ya le cobraste «{elegido.nombre}» a otros alumnos, y a nadie se le cobra dos
            veces lo mismo. ¿Es otro día distinto?{' '}
            {puedeCrear
              ? 'Elige «Un cobro nuevo» y ponle otro nombre.'
              : 'Pídele a un administrador de tu colegio que cree el cobro con otro nombre.'}
            {' '}¿Se lo vas a cobrar a los que faltaban? Sigue.
          </p>
        )}

        {!puedeCrear && !sinNadaQueElegir && (
          <p className="text-xs text-gray-500">
            ¿No está el que buscas? Solo un administrador de tu colegio puede crear cobros nuevos. Pídeselo.
          </p>
        )}

        {(puedeCrear || fijos.length > 0) && (
          <div className="flex flex-col items-start gap-1.5 pt-1">
            {puedeCrear && (
              <button type="button" className={ENLACE} aria-expanded={catalogoAbierto} aria-controls="lote-catalogo"
                onClick={() => { setCatalogoAbierto((a) => !a); setErrorCatalogo(null); }}>
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Traer algo de tu catálogo de productos
              </button>
            )}
            {fijos.length > 0 && (
              <button type="button" className={ENLACE} aria-expanded={listaFijosAbierta} aria-controls="lote-fijos"
                onClick={() => setFijosAbiertos((a) => !a)}>
                Mensualidad e inscripción
              </button>
            )}
          </div>
        )}

        {puedeCrear && catalogoAbierto && (
          <div id="lote-catalogo" className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Label htmlFor="lote-producto">Busca el producto o servicio</Label>
            <Input id="lote-producto" placeholder="Ej.: camiseta" autoComplete="off"
              value={qProducto} onChange={(e) => setQProducto(e.target.value)} onKeyDown={noEnviarConEnter} />
            {errorCatalogo && <p role="alert" className="text-xs text-red-600">{errorCatalogo}</p>}
            {!busca ? (
              <p className="text-xs text-gray-500">Escribe al menos dos letras.</p>
            ) : buscando ? (
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Buscando…
              </p>
            ) : productos.length === 0 ? (
              <p className="text-xs text-gray-500">No hay nada en tu catálogo con ese nombre.</p>
            ) : productosNuevos.length === 0 ? (
              <p className="text-xs text-gray-500">Lo que coincide ya está entre tus cobros, arriba.</p>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {productosNuevos.map((p) => (
                  <button key={p.id} type="button" disabled={trayendo != null}
                    onClick={() => void usarProducto(p)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500">{fmtDOP(p.precio)}</span>
                    {trayendo === p.id
                      ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zero-600" aria-label="Trayéndolo" />
                      : <span className="shrink-0 text-xs font-medium text-zero-600">Usar</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {fijos.length > 0 && listaFijosAbierta && (
          <div id="lote-fijos" className="space-y-2">
            <p className="text-xs text-amber-700">
              Desde aquí todos pagan el mismo monto: no se aplican los precios por curso ni las becas.
            </p>
            <div role="radiogroup" aria-label="Mensualidad e inscripción" className={LISTA}>
              {fijos.map(filaDeCobro)}
            </div>
          </div>
        )}
      </div>

      {/* ¿De qué mes? — solo la mensualidad lo pide. */}
      {esMensualidad && (
        <div className="grid gap-1.5">
          <Label htmlFor="lote-mes">¿De qué mes?</Label>
          {meses.length === 0 ? (
            // Aquí no hay selector donde poner el cursor. Al pulsar «Continuar»
            // el foco viene a este párrafo y se pone en rojo: sin eso el botón
            // no hacía nada a la vista, porque la explicación queda más arriba.
            <p id="lote-mes-sin-fechas" tabIndex={-1} role={errores.mes ? 'alert' : undefined}
              className={`rounded text-xs outline-none ${errores.mes ? 'font-medium text-red-600' : 'text-amber-700'}`}>
              {errores.mes && 'Así no se puede continuar. '}
              Este año escolar no tiene fecha de inicio y de fin, y sin ellas no se puede cobrar una
              mensualidad. Pídele a un administrador que las ponga en Configuración → Estructura, o elige
              otro cobro.
            </p>
          ) : (
            <>
              <div className="sm:w-64">
                <NativeSelect id="lote-mes" value={mesKey} onChange={(e) => onMes(e.target.value)}
                  aria-invalid={Boolean(errores.mes)}
                  aria-describedby={errores.mes ? 'lote-mes-error' : undefined}>
                  <option value="" disabled>Elige el mes</option>
                  {meses.map((m) => <option key={m.key} value={m.key}>{MESES[m.mes]} {m.anio}</option>)}
                </NativeSelect>
              </div>
              {errores.mes && <p id="lote-mes-error" role="alert" className="text-xs text-red-600">{errores.mes}</p>}
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ¿Cuánto paga cada alumno? El «RD$» va FUERA del campo: metido dentro,
            encima de un campo de MUI, se monta sobre lo que se escribe. */}
        <div className="grid content-start gap-1.5">
          <Label htmlFor="lote-monto">¿Cuánto paga cada alumno?</Label>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-sm font-medium text-gray-500">RD$</span>
            <div className="w-40">
              <Input id="lote-monto" type="text" inputMode="decimal" autoComplete="off"
                className="tabular-nums" value={monto} onChange={(e) => onMonto(e.target.value)}
                error={Boolean(errores.monto)} aria-invalid={Boolean(errores.monto)}
                aria-describedby={[errores.monto && 'lote-monto-error', ecoMontoALaVista && 'lote-monto-eco'].filter(Boolean).join(' ') || undefined} />
            </div>
          </div>
          {errores.monto && <p id="lote-monto-error" role="alert" className="text-xs text-red-600">{errores.monto}</p>}
          {ecoMontoALaVista && (
            <p id="lote-monto-eco" className={`text-xs tabular-nums ${ecoMonto.aviso ? 'text-amber-700' : 'text-gray-500'}`}>
              {ecoMonto.texto}
            </p>
          )}
          {origenMonto === 'ultima-vez' && elegido && (
            <p className="text-xs text-gray-500">
              Es lo que cobraste la última vez por «{elegido.nombre}». Cámbialo si hace falta.
            </p>
          )}
          {/* Con el cursor ya dentro del campo el monto de la última vez no se
              escribe solo (lo tecleado se le pegaría detrás): se ofrece. */}
          {montoUltimaVez !== null && origenMonto === null && monto.trim() === '' && elegido && (
            <p className="text-xs text-gray-500">
              La última vez cobraste {fmtDOP(montoUltimaVez)} por «{elegido.nombre}».{' '}
              <button type="button" className={ENLACE} onClick={onUsarUltimaVez}>Usar ese monto</button>
            </p>
          )}
          {origenMonto === 'catalogo' && (
            <p className="text-xs text-gray-500">
              Es el precio que tiene en tu catálogo de productos. Cámbialo si hace falta.
            </p>
          )}
        </div>

        {/* ¿Hasta cuándo pueden pagar? */}
        <div className="grid content-start gap-1.5">
          <Label htmlFor="lote-fecha">¿Hasta cuándo pueden pagar?</Label>
          <div className="w-44">
            <Input id="lote-fecha" type="date" value={fecha} onChange={(e) => onFecha(e.target.value)}
              error={Boolean(errores.fecha)} aria-invalid={Boolean(errores.fecha)}
              aria-describedby={errores.fecha ? 'lote-fecha-error lote-fecha-eco' : 'lote-fecha-eco'} />
          </div>
          {errores.fecha && <p id="lote-fecha-error" role="alert" className="text-xs text-red-600">{errores.fecha}</p>}
          <p id="lote-fecha-eco" className={`text-xs ${ecoFecha.aviso ? 'text-amber-700' : 'text-gray-500'}`}>
            {ecoFecha.texto}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" className="w-full sm:w-auto bg-zero-600 hover:bg-zero-700" disabled={guardando}>
          {guardando
            ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />Guardando el cobro…</>
            : 'Continuar'}
        </Button>
      </div>
    </form>
  );
}
