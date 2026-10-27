'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fraseDelAvisoAlCrear } from '@/lib/administracion-escolar/aviso-al-crear';
import {
  fraseDeLoCobrado, fraseDeNoEncontrados, fraseDeOmitidos, fraseDeSinComprobar, tituloDelResultado,
  type PedidoRevisado,
} from '@/lib/administracion-escolar/cargo-lote';

/**
 * Lo que se acaba de hacer, y qué se puede hacer después.
 *
 * Ocupa el sitio de los tres pasos, no convive con ellos. Antes el «Listo» salía
 * en un panel al lado del formulario, que seguía lleno: bastaba tocar un campo
 * para que el resumen y lo que había en pantalla dijeran cosas distintas, y no
 * se sabía si el cargo estaba creado o a medio crear.
 *
 * Todo lo que dice sale de dos sitios que no se mueven: lo que contestó el
 * servidor (cuántos creó, a quiénes) y el pedido con que se creó. Por eso
 * puede decir «Les cobraste RD$150.00…» con el número de verdad aunque entre la
 * revisión y el clic alguien más le haya puesto el mismo cargo a dos alumnos.
 *
 * Los nombres llevan a la ficha de cada alumno porque es el único sitio donde
 * un cargo se puede anular: si hubo un error, el camino para arreglarlo tiene
 * que estar aquí, a la vista, y no en saber por dónde se entra.
 *
 * También es lo que se enseña cuando la respuesta de crear se perdió y, al
 * volver a mirar, los cargos estaban (`comprobado`). En ese momento la persona
 * solo quiere saber una cosa —¿cobré o no?— y la contestación es esta misma
 * pantalla de «Listo», con una línea que dice que se comprobó.
 */

/** Hasta ocho nombres se enseñan sin pedirlo; más, y empujan los botones fuera de la pantalla. */
const NOMBRES_A_LA_VISTA = 8;

export function ResultadoLote({
  creados, omitidos, detalles, pedido, grupo, noEncontrados, comprobado = false, sinComprobar = [],
  avisoAlCrear = null, hoy, onOtroGrupo, onOtroCargo,
}: {
  /** El día en que sale el aviso a las familias, si se pidió. */
  avisoAlCrear?: string | null;
  /** Cuántos cargos creó el servidor. */
  creados: number;
  /** Cuántos de los marcados ya lo tenían cuando se fue a crear. */
  omitidos: number;
  /** A quiénes se les creó. */
  detalles: { estudianteId: number; nombre: string }[];
  /** El pedido con que se creó: cobro, monto, mes y fecha de ESE momento. */
  pedido: PedidoRevisado;
  /** El grupo que se revisó. `null` es todo el colegio. */
  grupo: string | null;
  /** Nombres de los marcados que el servidor ya no encontró en el grupo. */
  noEncontrados: string[];
  /** La respuesta de crear no llegó y esto se supo volviendo a mirar la lista. */
  comprobado?: boolean;
  /** Tras comprobar: los marcados que ya no salen en el grupo, de los que no se sabe. */
  sinComprobar?: string[];
  /** Hoy en República Dominicana, 'YYYY-MM-DD'. */
  hoy: string;
  onOtroGrupo: () => void;
  onOtroCargo: () => void;
}) {
  const [listaAbierta, setListaAbierta] = useState(detalles.length <= NOMBRES_A_LA_VISTA);

  const seCreo = creados > 0;
  const frase = fraseDeLoCobrado({
    montoCentavos: pedido.cuerpo.montoCentavos,
    cobro: pedido.cobro,
    mesTexto: pedido.mesTexto,
    aMano: pedido.aMano,
    grupo,
    creados,
    fechaVencimiento: pedido.cuerpo.fechaVencimiento,
    hoy,
  });

  return (
    <div role="status" className="rounded-xl border border-gray-200 bg-white p-6 text-center sm:p-8">
      <div className="flex justify-center">
        {seCreo
          ? <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
          : <Users className="h-10 w-10 text-amber-500" aria-hidden />}
      </div>

      {/* El foco cae aquí al terminar: es lo primero que tiene que oír quien no
          ve la pantalla, y de aquí se sigue con Tab a los botones. */}
      <h2 id="lote-resultado" tabIndex={-1} className="mt-3 text-lg font-semibold text-gray-900 outline-none">
        {tituloDelResultado(creados)}
      </h2>

      {comprobado && seCreo && (
        <p className="mx-auto mt-2 max-w-md rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-sm text-zero-800">
          No había llegado la respuesta, pero ya se comprobó: los cargos sí se crearon. No hace falta
          cobrarlos otra vez.
        </p>
      )}

      {seCreo ? (
        <>
          <p className="mx-auto mt-1 max-w-md break-words text-sm text-gray-600">
            {frase.principal}{' '}
            <span className="font-medium tabular-nums text-gray-900">{frase.total}</span>
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{frase.plazo}</p>
          {avisoAlCrear && (
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{fraseDelAvisoAlCrear(avisoAlCrear, hoy)}</p>
          )}
        </>
      ) : omitidos > 0 && (
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">Todos los que marcaste ya lo tenían.</p>
      )}

      {seCreo && omitidos > 0 && (
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{fraseDeOmitidos(omitidos)}</p>
      )}

      {noEncontrados.length > 0 && (
        <p className="mx-auto mt-1 max-w-md break-words text-sm text-amber-800">
          {fraseDeNoEncontrados(noEncontrados)}
        </p>
      )}

      {sinComprobar.length > 0 && (
        <p className="mx-auto mt-1 max-w-md break-words text-sm text-amber-800">
          {fraseDeSinComprobar(sinComprobar)}
        </p>
      )}

      {seCreo && (
        <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
          Cada cargo quedó pendiente en la cuenta de su alumno. Las facturas que ya tenían no se tocaron.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {seCreo && (
          <Button asChild className="bg-zero-600 hover:bg-zero-700">
            {/* Responsables filtrado por este cobro: las familias a las que se les cargó. */}
            <Link href={`/escolar/responsables?concepto=${pedido.cuerpo.conceptoId}`}>Ver las familias con este cobro</Link>
          </Button>
        )}
        <Button variant="outline" onClick={onOtroGrupo}>Cobrar lo mismo a otro grupo</Button>
        <Button variant="outline" onClick={onOtroCargo}>Hacer otro cargo</Button>
      </div>

      {seCreo && detalles.length > 0 && (
        <div className="mt-5 text-left">
          <button type="button" aria-expanded={listaAbierta} aria-controls="lote-cobrados"
            onClick={() => setListaAbierta((a) => !a)}
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-zero-600 hover:text-zero-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zero-500">
            {listaAbierta ? 'Ocultar la lista' : `Ver a quién se le cobró (${detalles.length})`}
            {listaAbierta
              ? <ChevronUp className="h-4 w-4" aria-hidden />
              : <ChevronDown className="h-4 w-4" aria-hidden />}
          </button>
          {listaAbierta && (
            <div id="lote-cobrados">
              <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                {detalles.map((d) => (
                  <li key={d.estudianteId}>
                    <Link href={`/escolar/estudiantes/${d.estudianteId}`}
                      className="block truncate px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 hover:text-zero-600 focus:outline-none focus-visible:bg-zero-50 focus-visible:text-zero-700">
                      {d.nombre}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">
                ¿Te equivocaste con alguno? Toca su nombre: en su ficha puedes anular el cargo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
