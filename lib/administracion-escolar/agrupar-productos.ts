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

/**
 * Lleva una palabra a una forma común para singular y plural.
 *
 * No intenta ser el singular correcto —eso pide un diccionario—, solo que
 * "gastable" y "gastables" acaben igual. Se quita la ese final y después la e,
 * que es lo que resuelve los dos plurales del español sin tener que
 * distinguirlos: "gastables"→"gastabl" y "gastable"→"gastabl";
 * "materiales"→"material" y "material"→"material".
 */
function singular(p: string): string {
  let s = p;
  if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
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

  // Fusiona las raíces que hablan de lo mismo. No basta con mirar si una cadena
  // contiene a la otra: "pago colegiatura" y "colegiatura pre primero" son el
  // mismo concepto y ninguna contiene a la otra. Lo que las hermana es
  // compartir una palabra con peso — "colegiatura" —, así que se agrupa por
  // eso, ignorando las palabras cortas que aparecen en cualquier nombre.
  const raices = [...porRaiz.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const destino = new Map<string, string>();

  const significativas = (r: string) => new Set(r.split(' ').filter((p) => p.length >= 6));

  for (const r of raices) {
    const mias = significativas(r);
    const padre = raices.find((otra) => {
      if (otra === r || otra.length > r.length) return false;
      if (r.includes(otra)) return true;
      for (const p of significativas(otra)) if (mias.has(p)) return true;
      return false;
    });
    // Se sigue la cadena hasta la raíz del grupo: si A se fue con B y B con C,
    // A tiene que acabar en C y no en B.
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
