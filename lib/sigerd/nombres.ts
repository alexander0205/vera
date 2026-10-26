/**
 * Partir un nombre completo dominicano en nombres y apellidos.
 *
 * Hace falta porque el listado de SIGERD trae "AYLA PAMELA REYNOSO SANCHEZ" de
 * una pieza y nuestra tabla los guarda en dos columnas. El reporte del portal sí
 * los trae separados, pero cuesta una llamada por alumno; esto deja cruzar los
 * 465 sin tocar el portal.
 *
 * La regla: los DOS últimos son apellidos. Acierta en la mayoría de los nombres
 * dominicanos, que son dos nombres y dos apellidos. Lo que no acierta se corrige
 * a mano, y por eso `partirNombre` marca `dudoso` cuando la forma se sale de lo
 * corriente — para poder enseñarlo en pantalla en vez de que pase callado.
 *
 * Los apellidos con partícula ("DE LA CRUZ", "DEL ROSARIO") se pegan hacia
 * atrás: sin eso, "MARIA DE LA CRUZ PEREZ" partiría en apellidos "CRUZ PEREZ" y
 * dejaría "DE LA" colgando de los nombres.
 */

/** Partículas que arrastran hacia atrás lo que va delante de un apellido. */
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA', 'VAN', 'VON', 'DA', 'DI']);

export interface NombrePartido {
  nombres: string;
  apellidos: string;
  /** El corte no es de libro y conviene que una persona lo mire. */
  dudoso: boolean;
}

export function partirNombre(completo: string): NombrePartido {
  const partes = completo.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

  if (partes.length === 0) return { nombres: 'Sin nombre', apellidos: '', dudoso: true };
  // Un solo token: no hay forma de saber si es nombre o apellido. Se guarda como
  // nombre —que es lo que se lee en las listas— y se marca.
  if (partes.length === 1) return { nombres: partes[0], apellidos: '', dudoso: true };
  // Dos: uno y uno, que es la lectura natural y casi siempre correcta.
  if (partes.length === 2) return { nombres: partes[0], apellidos: partes[1], dudoso: false };

  // Tres o más: los dos últimos son apellidos, y se estira hacia atrás mientras
  // lo de delante sea partícula.
  let corte = partes.length - 2;
  while (corte > 1 && PARTICULAS.has(partes[corte - 1].toUpperCase())) corte--;

  return {
    nombres: partes.slice(0, corte).join(' '),
    apellidos: partes.slice(corte).join(' '),
    // Se cuentan las piezas de verdad, sin partículas: "MARIA ALTAGRACIA DE LA
    // CRUZ PEREZ" son seis palabras pero cuatro piezas, y es un nombre de lo
    // más normal. Contando las seis, medio colegio saldría marcado para
    // revisar y la marca dejaría de significar algo.
    dudoso: partes.filter((p) => !PARTICULAS.has(p.toUpperCase())).length > 5,
  };
}

export interface ApellidosPartidos {
  primero: string;
  segundo: string;
  /** Hay más de dos apellidos: dónde acaba el primero es una apuesta. */
  dudoso: boolean;
}

/**
 * Partir el campo «apellidos» en primer y segundo apellido.
 *
 * Es el camino de vuelta: nuestra tabla guarda los dos en una sola columna y el
 * buscador del portal los pide por separado. Escritos juntos en «Primer
 * apellido», el portal no encuentra a nadie y parece que el alumno no existe.
 *
 * Aquí la partícula se pega hacia DELANTE, al apellido que introduce: en "DE LA
 * NADA INVENTADO" el primero es "DE LA NADA". Cortar por el primer espacio
 * daría "DE", y `partirNombre` tampoco sirve: está hecho para dejar siempre una
 * palabra de nombre delante y aquí no hay ninguna.
 *
 * Con tres apellidos o más no hay regla que valga —"INVENTADO FICTICIO
 * IMAGINARIO" puede ser uno y dos o dos y uno—. Se devuelve el primero y el
 * resto junto, y se marca `dudoso` para que quien llama decida si se fía del
 * segundo.
 */
export function partirApellidos(apellidos: string): ApellidosPartidos {
  const partes = apellidos.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

  // Cada apellido es su palabra más las partículas que traiga delante.
  const piezas: string[] = [];
  let pendiente: string[] = [];
  for (const p of partes) {
    pendiente.push(p);
    if (!PARTICULAS.has(p.toUpperCase())) {
      piezas.push(pendiente.join(' '));
      pendiente = [];
    }
  }
  // Partículas que se quedaron sin apellido detrás ("INVENTADO DE", a medio
  // escribir): no son un apellido más, se quedan con el anterior.
  if (pendiente.length > 0) {
    if (piezas.length > 0) piezas[piezas.length - 1] += ` ${pendiente.join(' ')}`;
    else piezas.push(pendiente.join(' '));
  }

  return {
    primero: piezas[0] ?? '',
    segundo: piezas.slice(1).join(' '),
    dudoso: piezas.length > 2,
  };
}

/**
 * Separa las palabras que el PDF dejó pegadas: «Rosa MaríaPeñaPaniagua» →
 * «Rosa María Peña Paniagua».
 *
 * El reporte en PDF de SIGERD (ficha-pdf.ts) pinta cada parte del nombre como un trozo de texto aparte, sin un
 * espacio entre ellos, y al leerlo quedan juntas. Se corta donde una minúscula
 * va seguida de una mayúscula, que dentro de un nombre propio solo pasa en la
 * unión de dos palabras. Un nombre todo en mayúsculas no se puede separar así,
 * y se deja como viene.
 */
export function separarPegadas(nombre: string): string {
  return nombre.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
}
