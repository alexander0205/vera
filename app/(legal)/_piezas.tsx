/**
 * Las piezas repetidas de los dos documentos legales.
 *
 * Viven aparte del layout porque un archivo `layout.tsx` de Next solo debe
 * exportar el layout: cualquier otro export ahí es una convención rota que
 * tarde o temprano alguien intenta usar como página.
 */

/**
 * Título de sección, numerado y enlazable.
 *
 * La numeración no es adorno: estos textos se citan por número («según el
 * punto 7 de los Términos»), y el `id` permite mandar a alguien directo al
 * párrafo en vez de decirle «búscalo».
 */
export function Seccion({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section id={`s${n}`} className="mt-10 scroll-mt-24">
      <h2 className="font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-[-0.01em] text-gray-950">
        <span className="mr-2 tabular-nums text-gray-300">{n}.</span>
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

/** Encabezado del documento: título y fecha de última actualización. */
export function Cabecera({ titulo, actualizado, children }: {
  titulo: string; actualizado: string; children: React.ReactNode;
}) {
  return (
    <header>
      <h1 className="font-[family-name:var(--font-display)] text-[32px] font-semibold tracking-[-0.02em] text-gray-950">
        {titulo}
      </h1>
      <p className="mt-2 text-sm text-gray-400">Última actualización: {actualizado}</p>
      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </header>
  );
}

/**
 * Lista de puntos. `dt/dd` y no `ul` cuando cada punto tiene nombre y
 * explicación: es una definición, y marcarla como tal es lo que hace que un
 * lector de pantalla lea «Stripe: para cobrar la suscripción» y no dos frases
 * sueltas seguidas.
 */
export function Definiciones({ items }: { items: Array<{ que: string; detalle: React.ReactNode }> }) {
  return (
    <dl className="space-y-3">
      {items.map((i) => (
        <div key={i.que}>
          <dt className="font-medium text-gray-900">{i.que}</dt>
          <dd className="mt-0.5">{i.detalle}</dd>
        </div>
      ))}
    </dl>
  );
}
