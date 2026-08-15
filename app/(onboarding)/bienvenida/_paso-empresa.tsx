'use client';

/**
 * Paso 1 — el RNC.
 *
 * Un solo campo. Con once dígitos el sistema devuelve razón social, nombre
 * comercial, actividad y estado ante la DGII, y deduce qué línea de producto
 * le toca. La persona confirma en vez de rellenar.
 *
 * Dos cosas que no se pueden quitar:
 *
 * · El aviso de estado fiscal. Cuatro de cada diez RNC del padrón no están en
 *   estado 2, y quien no lo esté no va a poder emitir. Decírselo ahora vale
 *   más que cualquier otra cosa de esta pantalla. Avisa, no bloquea: la
 *   semántica exacta de los códigos no está documentada y encerrar a alguien
 *   fuera de su cuenta por un dato dudoso sería peor que el problema.
 *
 * · La entrada a mano. Las empresas recién constituidas no están en el padrón
 *   —una de nuestras once tampoco—, y como el onboarding es obligatorio, sin
 *   esta salida el RNC ausente significa cuenta muerta.
 */

import { useActionState, useState } from 'react';
import { Loader2, Search, ArrowRight, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { guardarEmpresa } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import type { LineaKey } from '@/lib/onboarding/deducir';

type Hallazgo = {
  encontrado: boolean;
  rnc: string;
  razonSocial?: string;
  nombreComercial?: string | null;
  actividad?: string | null;
  linea?: LineaKey;
  fiscal?: { activo: boolean; etiqueta: string; aviso: string | null };
};

const LINEAS: Array<{ key: LineaKey; titulo: string; detalle: string }> = [
  { key: 'erp',         titulo: 'Facturo y llevo mi negocio', detalle: 'Facturación electrónica, contabilidad, inventario y compras.' },
  { key: 'pos-erp',     titulo: 'Vendo en mostrador',         detalle: 'Todo lo anterior más punto de venta: caja, turnos y stock.' },
  { key: 'erp-colegio', titulo: 'Soy un colegio',             detalle: 'Todo lo anterior más matrículas, cargos y expedientes.' },
];

const campo =
  'h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-900 ' +
  'placeholder:text-gray-400 outline-none transition focus:border-zero-500 focus:ring-4 focus:ring-zero-500/10';

export function PasoEmpresa({ rncActual, razonSocialActual }: {
  rncActual: string | null; razonSocialActual: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    guardarEmpresa, { error: '' },
  );

  const [rnc, setRnc] = useState(rncActual ?? '');
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<Hallazgo | null>(null);
  const [aMano, setAMano] = useState(false);
  const [linea, setLinea] = useState<LineaKey>('erp');
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  async function buscar() {
    const limpio = rnc.replace(/\D/g, '');
    if (limpio.length < 9) { setErrorBusqueda('El RNC debe tener 9 u 11 dígitos'); return; }

    setBuscando(true); setErrorBusqueda(null); setHallazgo(null); setAMano(false);
    try {
      const r = await fetch(`/api/onboarding/rnc?rnc=${limpio}`);
      const d = await r.json();
      if (!r.ok) { setErrorBusqueda(d.error ?? 'No se pudo buscar'); return; }
      setHallazgo(d);
      if (d.linea) setLinea(d.linea);
      if (!d.encontrado) setAMano(true);
    } catch {
      setErrorBusqueda('No se pudo conectar. Revisa tu internet.');
    } finally {
      setBuscando(false);
    }
  }

  const confirmado = hallazgo?.encontrado === true;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-[-0.02em] text-gray-950">
        Empecemos por tu RNC
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
        Con eso buscamos tu empresa en el padrón de la DGII y llenamos el resto nosotros.
      </p>

      {/* La búsqueda vive fuera del <form>: pulsar Enter aquí tiene que buscar,
          no enviar el paso con los campos todavía vacíos. */}
      <div className="mt-8 flex gap-3">
        <input
          value={rnc}
          onChange={(e) => setRnc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }}
          inputMode="numeric" maxLength={13} placeholder="131793916"
          aria-label="RNC" className={campo}
        />
        <button
          type="button" onClick={buscar} disabled={buscando}
          className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-zero-600 px-6 text-[15px] font-semibold text-white transition hover:bg-zero-700 disabled:opacity-60"
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </div>

      {errorBusqueda && (
        <p role="alert" className="mt-3 text-sm text-red-600">{errorBusqueda}</p>
      )}

      {hallazgo && !hallazgo.encontrado && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-800">
            Ese RNC no aparece en el padrón. Suele pasar con empresas recién
            constituidas — escribe los datos a mano y sigue.
          </p>
        </div>
      )}

      {(confirmado || aMano) && (
        <form action={formAction} className="mt-8 space-y-6">
          <input type="hidden" name="rnc" value={rnc.replace(/\D/g, '')} />
          {aMano && <input type="hidden" name="manual" value="on" />}

          {confirmado && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Encontramos tu empresa
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-[19px] font-semibold text-gray-950">
                {hallazgo!.razonSocial}
              </p>
              {hallazgo!.nombreComercial && (
                <p className="text-sm text-gray-500">{hallazgo!.nombreComercial}</p>
              )}

              {/* El dato que nadie más le da. */}
              <div className={[
                'mt-4 flex gap-2.5 rounded-xl px-3.5 py-3',
                hallazgo!.fiscal?.activo
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900',
              ].join(' ')}>
                {hallazgo!.fiscal?.activo
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="text-sm">
                  <p className="font-semibold">{hallazgo!.fiscal?.etiqueta}</p>
                  {hallazgo!.fiscal?.aviso && <p className="mt-0.5">{hallazgo!.fiscal.aviso}</p>}
                </div>
              </div>

              <input type="hidden" name="razonSocial" value={hallazgo!.razonSocial ?? ''} />
              <input type="hidden" name="nombreComercial" value={hallazgo!.nombreComercial ?? ''} />
            </div>
          )}

          {aMano && (
            <div className="space-y-4">
              <div>
                <label htmlFor="razonSocial" className="mb-2 block text-sm font-medium text-gray-700">
                  Razón social
                </label>
                <input id="razonSocial" name="razonSocial" required maxLength={255}
                  defaultValue={razonSocialActual ?? ''} placeholder="Tal como aparece en tu RNC"
                  className={campo} />
              </div>
              <div>
                <label htmlFor="nombreComercial" className="mb-2 block text-sm font-medium text-gray-700">
                  Nombre comercial <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input id="nombreComercial" name="nombreComercial" maxLength={255}
                  placeholder="Con el que te conocen tus clientes" className={campo} />
              </div>
            </div>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">
              {confirmado && hallazgo!.actividad
                ? <>Por tu actividad ante la DGII —<span className="font-semibold">{hallazgo!.actividad.trim()}</span>— esto parece lo tuyo:</>
                : '¿Qué haces?'}
            </legend>

            <div className="mt-3 space-y-2.5">
              {LINEAS.map((l) => (
                <label key={l.key}
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition',
                    linea === l.key
                      ? 'border-zero-500 bg-zero-50/60 ring-4 ring-zero-500/10'
                      : 'border-gray-200 bg-white hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="radio" name="linea" value={l.key} required
                    checked={linea === l.key} onChange={() => setLinea(l.key)}
                    className="mt-0.5 h-4 w-4 border-gray-300 text-zero-600 focus:ring-zero-500/30"
                  />
                  <span>
                    <span className="block text-[15px] font-semibold text-gray-900">{l.titulo}</span>
                    <span className="block text-sm text-gray-500">{l.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {state?.error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <button
            type="submit" disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zero-600 text-[15px] font-semibold text-white transition hover:bg-zero-700 disabled:opacity-60"
          >
            {pending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              : <>Continuar <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      )}
    </div>
  );
}
