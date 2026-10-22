/**
 * Piezas para las páginas de consulta (`/agentes`, `/funciones`): las que se
 * leen buscando un dato y no un argumento de venta.
 *
 * Las de `_guia.tsx` están hechas para trámites: su lista marca cada punto como
 * hecho y su tabla alinea a la derecha porque es de cifras. Aquí hace falta lo
 * contrario —listas neutras, tablas de texto y bloques de código—, y se
 * comparte para que las dos páginas se vean igual.
 */

/** Lista sin marca de «hecho»: para lo que NO se puede, un cheque engaña. */
export function ListaLlana({ puntos }: { puntos: readonly string[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.6] text-[#3b4252] marker:text-[#9aa3b8]">
      {puntos.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

/** Tabla de texto: la de las guías alinea a la derecha porque es de cifras. */
export function TablaDeTexto({ columnas, filas }: {
  columnas: readonly string[];
  filas: readonly (readonly React.ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e7edfb]">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[#eef1f8] bg-[#f7f9ff] text-[11px] uppercase tracking-[.1em] text-[#666d80]">
            {columnas.map((c) => <th key={c} className="px-4 py-2.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-[#f4f6fc] align-top last:border-0">
              {f.map((celda, j) => (
                <td key={j} className={`px-4 py-3 leading-[1.55] ${j === 0 ? 'text-[#102a72]' : 'text-[#3b4252]'}`}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Codigo({ children }: { children: string }) {
  return (
    <pre className="m-0 overflow-x-auto rounded-xl border border-[#e7edfb] bg-[#0f1b3d] p-4 text-[12.5px] leading-[1.6] text-[#e6ecff]">
      <code>{children}</code>
    </pre>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-[#f1f4fb] px-1.5 py-0.5 text-[12.5px] text-[#102a72]">{children}</code>;
}
