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
