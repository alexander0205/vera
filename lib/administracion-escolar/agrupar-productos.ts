/**
 * Agrupa los servicios de facturación que en realidad son el mismo concepto.
 *
 * Un colegio que factura sin conceptos termina con un producto por grado y por
 * año, y con el nombre escrito distinto cada vez: "Material gastable 01",
 * "Material gastable 002", "Materiales gastables 2024". Agrupar por nombre
 * exacto no colapsa nada — hay que quitarle al nombre lo que solo distingue
 * grado, tanda o año, y quedarse con el concepto que hay debajo.
 */

/** Sobra en el nombre: no distingue conceptos, solo instancias. */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'por', 'para', 'en']);

/** Quita el plural más común del español sin meterse en excepciones. */
function singular(p: string): string {
  if (p.length > 4 && p.endsWith('es')) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}

/**
 * Raíz del nombre: sin tildes, sin números, sin años, sin relleno y en
 * singular. "Materiales gastables 2024" y "Material gastable 01" caen en la
 * misma.
 */
export function raizConcepto(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\d{4}\s*-\s*\d{4}/g, ' ')  // 2025-2026
    .replace(/[^a-z\s]+/g, ' ')          // códigos, números de grado, guiones
    .split(/\s+/)
    .filter((p) => p && !RELLENO.has(p))
    .map(singular)
    .join(' ')
    .trim();
}

/** Quita el código de instancia del final: "Material gastable 01" → "Material gastable". */
function limpiarNombre(nombre: string): string {
  const limpio = nombre
    .replace(/\d{4}\s*-\s*\d{4}\s*$/, '')
    .replace(/[\s-]+\d+\s*$/, '')
    .trim();
  return limpio || nombre.trim();
}

export interface GrupoConcepto {
  /** Nombre propuesto: el más corto del grupo, que suele ser el más limpio. */
  nombre: string;
  productos: number;
}

/**
 * Junta los productos por raíz y después fusiona las raíces que se contienen
 * ("colegiatura" dentro de "colegiatura pre primero"), quedándose con el
 * nombre más corto como propuesta.
 */
export function agruparProductos(
  productos: { nombre: string }[],
  yaSonConcepto: Set<string> = new Set(),
): GrupoConcepto[] {
  const porRaiz = new Map<string, { nombres: string[]; total: number }>();

  for (const p of productos) {
    const nombre = p.nombre.trim();
    const raiz = raizConcepto(nombre);
    if (!raiz) continue;
    const g = porRaiz.get(raiz) ?? { nombres: [], total: 0 };
    g.nombres.push(nombre);
    g.total += 1;
    porRaiz.set(raiz, g);
  }

  // Fusiona raíces contenidas en otra. Se recorre de la más corta a la más
  // larga para que la corta sea siempre la que absorbe.
  const raices = [...porRaiz.keys()].sort((a, b) => a.length - b.length);
  const destino = new Map<string, string>();
  for (const r of raices) {
    const padre = raices.find((otra) => otra !== r && otra.length < r.length && r.includes(otra));
    destino.set(r, padre ? destino.get(padre) ?? padre : r);
  }

  const fusionado = new Map<string, { nombres: string[]; total: number }>();
  for (const [raiz, g] of porRaiz) {
    const clave = destino.get(raiz) ?? raiz;
    const acc = fusionado.get(clave) ?? { nombres: [], total: 0 };
    acc.nombres.push(...g.nombres);
    acc.total += g.total;
    fusionado.set(clave, acc);
  }

  return [...fusionado.values()]
    .map((g) => ({
      // El nombre más corto del grupo, sin el código de la instancia: cuando
      // todos se llaman "Material gastable 01/02/03", el concepto es
      // "Material gastable".
      nombre: limpiarNombre(g.nombres.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0]),
      productos: g.total,
    }))
    // Se descarta lo que ya es concepto, y basta con que una raíz contenga a la
    // otra: si el colegio ya tiene "Pago de colegiatura", proponerle
    // "Colegiatura" es proponerle un duplicado.
    .filter((g) => {
      const raiz = raizConcepto(g.nombre);
      for (const existente of yaSonConcepto) {
        if (raiz === existente || raiz.includes(existente) || existente.includes(raiz)) return false;
      }
      return true;
    })
    .sort((a, b) => b.productos - a.productos);
}
