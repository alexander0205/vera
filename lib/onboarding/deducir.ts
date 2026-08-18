/**
 * Lo que el sistema deduce solo, para no tener que preguntarlo.
 *
 * La idea del onboarding entero está aquí: el usuario da su RNC y nosotros
 * sacamos del padrón de la DGII quién es y a qué se dedica. Lo que en otros
 * sistemas es una encuesta de cinco pantallas, aquí es una confirmación.
 *
 * Todo lo de este archivo son SUGERENCIAS. Ninguna decide nada por su cuenta:
 * la pantalla las enseña y el usuario las confirma o las cambia. Por eso una
 * deducción floja es aceptable y una deducción silenciosa no lo sería.
 */

import {
  LINEAS_PRODUCTO, planesDeFamilia, tramoPorEstudiantes, type PlanDef,
} from '@/lib/config/plans';

export type LineaKey = 'erp' | 'pos-erp' | 'erp-colegio';

/**
 * La columna `actividad` del padrón viene RECORTADA a 10 caracteres —así la
 * publica la DGII y así la guardamos—, de modo que aquí no se compara contra
 * textos completos sino contra los prefijos que de verdad llegan. «ENSEÑANZA
 * PRIVADA» y «ENSEÑANZA PRIMARIA» llegan las dos como `ENSEÑANZA `.
 */
const POR_ACTIVIDAD: Array<{ prefijo: string; linea: LineaKey }> = [
  // Un colegio es el caso que más se gana con acertar: cambia de familia de
  // planes entera, no solo de escalón.
  { prefijo: 'ENSEÑANZA',  linea: 'erp-colegio' },

  // Mostrador: se cobra de frente, con caja y turno. El resto del ERP también
  // lo necesitan, por eso la línea es POS + ERP y no POS a secas.
  { prefijo: 'VENTA AL P', linea: 'pos-erp' },   // venta al por menor
  { prefijo: 'COLMADOS',   linea: 'pos-erp' },
  { prefijo: 'VENTA DE A', linea: 'pos-erp' },
  { prefijo: 'BANCAS DE',  linea: 'pos-erp' },
];

/**
 * Qué línea parece, según a qué se dedica ante la DGII.
 *
 * Cae en `erp` por defecto, y a propósito: es la línea que sirve a cualquiera
 * que facture, así que equivocarse hacia ahí solo cuesta un clic de
 * corrección. Empujar a alguien a POS o a Colegio por error cuesta mucho más.
 */
export function lineaPorActividad(actividad: string | null | undefined): LineaKey {
  const a = (actividad ?? '').trim().toUpperCase();
  if (!a) return 'erp';
  return POR_ACTIVIDAD.find(r => a.startsWith(r.prefijo))?.linea ?? 'erp';
}

/** Los escalones de e-CF, por comprobantes al mes. -1 = sin tope. */
export function tramoPorFacturas(facturas: number): PlanDef | null {
  return planesDeFamilia('ecf')
    .find(p => p.limits.docs === -1 || facturas <= p.limits.docs) ?? null;
}

/**
 * El plan que le toca: un número y la línea bastan.
 *
 * Se pregunta por facturas o por estudiantes según la línea porque es
 * literalmente en lo que se diferencian los planes de cada familia. No es una
 * pregunta de mercadeo disfrazada: es el dato que decide.
 */
export function planSugerido(linea: LineaKey, tamano: number): PlanDef | null {
  const def = LINEAS_PRODUCTO.find(l => l.key === linea);
  if (!def) return null;
  return def.familia === 'colegio'
    ? tramoPorEstudiantes(tamano)
    : tramoPorFacturas(tamano);
}

/**
 * Cómo interpreta la DGII el estado de un RNC.
 *
 * Verificado contra nuestros propios clientes: los diez que facturan de verdad
 * están en `2`. Fuera de ese valor NO se bloquea a nadie —solo se avisa—,
 * porque el padrón trae 313.000 registros fuera de estado 2 y la semántica
 * exacta de cada código no está documentada por la DGII. Encerrar a alguien
 * fuera de su cuenta con un dato que no entendemos del todo sería peor que el
 * problema que evita.
 */
export function estadoFiscal(estado: string | null | undefined): {
  activo: boolean; etiqueta: string; aviso: string | null;
} {
  const e = (estado ?? '').trim();
  if (e === '2') {
    return { activo: true, etiqueta: 'Activo ante la DGII', aviso: null };
  }
  return {
    activo: false,
    etiqueta: 'No figura como activo',
    aviso:
      'La DGII no tiene este RNC como activo. Puedes seguir y configurar todo, ' +
      'pero es probable que tus comprobantes sean rechazados hasta que lo ' +
      'regularices. Conviene revisarlo en la Oficina Virtual antes de emitir.',
  };
}

/** Qué se le pregunta en el paso del tamaño, según la línea. */
export function preguntaDeTamano(linea: LineaKey): {
  titulo: string; ayuda: string; opciones: Array<{ valor: number; etiqueta: string }>;
} {
  if (linea === 'erp-colegio') {
    return {
      titulo: '¿Cuántos estudiantes tiene el colegio?',
      ayuda: 'Es lo que decide tu plan. Si creces durante el año, se cambia sin perder nada.',
      // Una opción por tramo, sacada del catálogo. Escritas a mano se
      // quedaron en 150/300/500/800 cuando los planes pasaron a
      // 100/225/400/650, y el colegio elegía un tamaño que ya no existía —
      // dos opciones distintas caían en el mismo plan y otro tramo no salía
      // nunca. El test «sin escalones muertos» es el que caza eso.
      opciones: planesDeFamilia('colegio').map(p => ({
        valor: p.limits.estudiantes,
        etiqueta: `Hasta ${p.limits.estudiantes}`,
      })),
    };
  }
  return {
    titulo: '¿Cuántas facturas emites al mes?',
    ayuda: 'Un aproximado basta. Si te quedas corto, se sube de plan en cualquier momento.',
    opciones: [
      { valor: 50,   etiqueta: 'Hasta 50' },
      { valor: 200,  etiqueta: 'Hasta 200' },
      { valor: 500,  etiqueta: 'Hasta 500' },
      { valor: 5000, etiqueta: 'Más de 500' },
    ],
  };
}
