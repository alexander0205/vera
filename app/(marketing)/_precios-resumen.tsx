/**
 * Los precios, completos, donde el visitante los busca.
 *
 * La portada y la página de colegios enseñaban un «desde US$N» y mandaban a
 * /precios para ver el resto. Este bloque pone la lista entera —cada plan de
 * cada línea con su cifra, los adicionales y lo que se vende aparte— porque el
 * que compara no quiere el mínimo, quiere saber cuánto le toca a él.
 *
 * Todo sale de `lib/config/plans.ts`, que es de donde sale el cobro de Stripe:
 * ni un número escrito a mano. Y respeta `precioBajoCotizacion`: si una línea
 * deja de publicar, aquí deja de haber cifra sin tocar este archivo — y no
 * queda escondida con CSS, que en una página pública sigue estando en el fuente
 * para quien mire.
 */

import Link from 'next/link';
import {
  ADDONS, PRODUCTOS_APARTE, TEXTO_BAJO_COTIZACION,
  getLinea, lineaBajoCotizacion, planesDeLinea,
  type PlanDef,
} from '@/lib/config/plans';
import { Flecha } from './_piezas';

const usd = (n: number) => `US$${n.toLocaleString('es-DO')}`;

/**
 * La dimensión por la que se cobra ese plan, en una línea.
 *
 * Un colegio paga por estudiantes y un negocio por comprobantes: poner el mismo
 * rótulo en los dos dejaría la mitad de la tabla sin decir de qué depende la
 * cifra que tiene al lado.
 */
function porQueSeCobra(plan: PlanDef): string {
  if (plan.limits.estudiantes > 0) return `hasta ${plan.limits.estudiantes.toLocaleString('es-DO')} estudiantes`;
  const docs = plan.limits.docs < 0
    ? 'Comprobantes sin tope'
    : `${plan.limits.docs.toLocaleString('es-DO')} comprobantes al mes`;
  const usuarios = plan.limits.users < 0
    ? 'usuarios sin tope'
    : `${plan.limits.users} ${plan.limits.users === 1 ? 'usuario' : 'usuarios'}`;
  return `${docs} · ${usuarios}`;
}

function TarjetaLinea({ lineaKey }: { lineaKey: string }) {
  const linea = getLinea(lineaKey);
  if (!linea) return null;

  const planes = planesDeLinea(linea.key);
  // `null` y no 0: la cifra no sale del servidor cuando la línea se cotiza.
  const cotiza = lineaBajoCotizacion(linea.key);

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-[#e7edfb] bg-white p-5 sm:p-6">
      <p className="m-0 font-[family-name:var(--font-display)] text-[15.5px] font-semibold tracking-[-.02em] text-[#102a72]">
        {linea.nombre}
      </p>
      <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{linea.descripcion}</p>

      <ul className="m-0 mt-4 flex list-none flex-col gap-0 p-0">
        {planes.map(({ plan, precio }, i) => (
          <li
            key={plan.key}
            className={`flex items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-[#f0f3fa]' : ''}`}
          >
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-[#102a72]">{plan.name}</span>
              <span className="mt-0.5 block text-pretty text-[11.5px] leading-[1.45] text-[#666d80]">
                {porQueSeCobra(plan)}
              </span>
            </span>
            {cotiza ? (
              <span className="shrink-0 text-right text-[11.5px] font-semibold text-zero-600">
                {TEXTO_BAJO_COTIZACION}
              </span>
            ) : (
              <span className="shrink-0 text-right">
                <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold tabular-nums tracking-[-.02em] text-[#102a72]">
                  {usd(precio)}
                </span>
                <span className="ml-1 text-[11.5px] text-[#666d80]">/mes</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** La página que cuenta cada línea, para la mención de una línea. */
const PAGINA_DE_LINEA: Record<string, string> = {
  erp: '/productos/erp',
  'pos-erp': '/productos/punto-de-venta',
  'erp-colegio': '/colegios',
};

/**
 * Una línea nombrada en una frase, con su precio de entrada.
 *
 * Para la portada: el colegio tiene su página, y media sección de tramos por
 * estudiante en la portada de un negocio es media sección que no le habla a
 * nadie ahí. Pero el colegio que sí llega tiene que saber que existe y cuánto
 * cuesta sin buscarlo. La cifra sale del catálogo como todas.
 */
function MencionDeLinea({ lineaKey }: { lineaKey: string }) {
  const linea = getLinea(lineaKey);
  if (!linea) return null;
  const planes = planesDeLinea(linea.key);
  const desde = planes.length > 0 ? Math.min(...planes.map(p => p.precio)) : null;
  const porEstudiantes = planes.some(p => p.plan.limits.estudiantes > 0);
  const cifra = lineaBajoCotizacion(linea.key) || desde === null
    ? TEXTO_BAJO_COTIZACION.toLowerCase()
    : `desde ${usd(desde)} al mes`;

  return (
    <Link
      href={PAGINA_DE_LINEA[linea.key] ?? '/precios'}
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-2xl border border-[#e7edfb] bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:border-zero-200"
    >
      <span className="min-w-0 text-pretty text-[13px] leading-[1.5] text-[#3b4252]">
        <span className="font-semibold text-[#102a72]">{linea.nombre}</span>
        {porEstudiantes ? ' se cobra por cantidad de estudiantes, ' : ', '}
        {cifra}.
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-zero-600">
        Ver la línea
        <Flecha tamano={12} />
      </span>
    </Link>
  );
}

export function ResumenDePrecios({
  lineas = ['erp', 'erp-colegio'],
  mencionar = [],
}: {
  /**
   * Qué líneas enseñar, por su clave del catálogo.
   *
   * «Zero POS + ERP» no está: es la línea de arriba con el Punto de Venta
   * sumado, así que enseñarla aquí repetía los mismos cuatro planes con otra
   * cifra y obligaba a comparar dos columnas casi iguales para descubrir que
   * la diferencia son nueve dólares. El adicional lo dice mejor: +US$9. La
   * línea combinada sigue viva en el catálogo y en /precios, donde se compara
   * funcionalidad por funcionalidad.
   */
  lineas?: string[];
  /** Líneas que solo se nombran, en una frase con su precio de entrada. */
  mencionar?: string[];
}) {
  const familias = new Set(
    lineas.map(k => getLinea(k)?.familia).filter((f): f is 'ecf' | 'colegio' => f !== undefined),
  );

  // Un adicional solo se ofrece donde NO viene ya dentro: cobrarle el Punto de
  // Venta a un colegio que lo trae en su tramo es el error obvio, y anunciarlo
  // en su página es prometer un cargo que no existe.
  const adicionales = ADDONS.filter(a => [...familias].some(f => !a.incluidoEn.includes(f)));

  return (
    <div className="min-w-0">
      <div className={`grid min-w-0 gap-3.5 ${lineas.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {lineas.map(key => <TarjetaLinea key={key} lineaKey={key} />)}
        {mencionar.map(key => <MencionDeLinea key={key} lineaKey={key} />)}
      </div>

      <div className="mt-3.5 grid min-w-0 gap-3.5 sm:grid-cols-2">
        {adicionales.map(addon => (
          <div key={addon.key} className="min-w-0 rounded-2xl border border-[#e7edfb] bg-[#f7f9ff] p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#102a72]">
                {addon.name}
              </span>
              <span className="shrink-0 font-[family-name:var(--font-display)] text-[13.5px] font-semibold tabular-nums text-zero-600">
                +{usd(addon.price)}/mes
              </span>
            </div>
            <p className="m-0 mt-2 text-pretty text-[11.5px] leading-[1.5] text-[#5c6373]">{addon.descripcion}</p>
          </div>
        ))}

        {/* Lo que se vende aparte del sistema. No es un adicional —no tiene
            precio en Stripe ni módulo que encender— y por eso va con el borde
            discontinuo y con su línea: nombrarlo junto a los planes sin decir
            que se contrata aparte lo haría pasar por incluido. */}
        {PRODUCTOS_APARTE.map(p => (
          <Link
            key={p.key}
            href="/productos/crm"
            className={`block min-w-0 rounded-2xl border border-dashed border-[#d9e1f6] bg-white p-5 transition hover:-translate-y-0.5 hover:border-zero-200 ${
              adicionales.length % 2 === 0 ? 'sm:col-span-2' : ''
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
              <span className="font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#102a72]">
                {p.nombre}
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-zero-600">
                {p.bajoCotizacion || p.precio === null ? TEXTO_BAJO_COTIZACION : `${usd(p.precio)}/mes`}
              </span>
            </div>
            <p className="m-0 mt-2 text-pretty text-[11.5px] leading-[1.5] text-[#5c6373]">
              {p.descripcion} Se contrata aparte de estos planes.
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="m-0 text-[11.5px] text-[#666d80]">
          Precios mensuales en dólares estadounidenses, sin ITBIS. Sin contrato mínimo.
        </p>
        <Link
          href="/precios"
          className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-zero-600 transition hover:text-[#102a72]"
        >
          Comparar qué incluye cada plan
          <Flecha tamano={13} />
        </Link>
      </div>
    </div>
  );
}
