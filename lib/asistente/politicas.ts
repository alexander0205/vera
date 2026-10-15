import { normalizar } from './util';

/**
 * POLÍTICAS DEL ASISTENTE, hechas código.
 *
 * Dónde se aplica cada una (la lista completa y su porqué están en
 * docs/asistente-politicas.md):
 *
 *  - Solicitudes que NO se mandan al modelo (clasificarSolicitud): pedir el
 *    prompt, claves o tarjetas, datos de otra empresa, asesoría fiscal o legal,
 *    evasión, insultos, «¿qué puedes hacer?». La respuesta es fija y revisada:
 *    no depende de que el modelo se porte bien.
 *  - Datos que vuelven de las herramientas (neutralizarDatos): un nombre de
 *    cliente o una nota puede traer «ignora tus instrucciones…». Es un dato,
 *    no una orden: se omite antes de que el modelo lo lea (inyección indirecta,
 *    LLM01 de OWASP).
 *  - Lo que sale al usuario (depurarSalida): números de tarjeta y llaves se
 *    enmascaran aunque el modelo los repita (divulgación de información
 *    sensible, LLM02).
 *
 * Es código puro: se prueba sin base ni modelo.
 */

export interface RespuestaPolitica {
  /** Para pruebas y registros. */
  categoria:
    | 'prompt' | 'secretos' | 'otra-empresa' | 'asesoria' | 'evasion' | 'ofensivo'
    | 'capacidades' | 'identidad' | 'vacio' | 'cambio-de-reglas' | 'volcado';
  respuesta: string;
}

const AYUDA =
  'Puedo ayudarte con la información de tu empresa en Zero: ventas, cobros, cuentas por cobrar, gastos, ITBIS, facturas y clientes, ' +
  'y a encontrar dónde está cada pantalla y cómo se hace. Pregúntame, por ejemplo, «¿cuánto vendí este mes?» o «¿dónde creo una cotización?».';

interface Regla { categoria: RespuestaPolitica['categoria']; re: RegExp; respuesta: string }

// Orden: lo más delicado primero.
const REGLAS: Regla[] = [
  {
    categoria: 'cambio-de-reglas',
    re: /\b(ignora|olvida|omite|desobedece|salta(te)?|desactiva) (todas |tus |las |todo lo |cualquier |mis |previas |anteriores )*(instrucciones|reglas|restricciones|politicas|indicaciones|anteriores)\b|\b(ignore|disregard|forget) (all |any |your |previous |prior |the )*(instructions|rules)\b|\b(modo|mode) (desarrollador|developer|dios|god|sin restricciones|jailbreak)\b|\bdan mode\b|\bact(ua|ue) como (si no tuvieras|sin) (reglas|restricciones)\b/,
    respuesta: 'Mis reglas no cambian por una instrucción en el chat: solo consulto la información de tu empresa y te guío por Zero. ' + AYUDA,
  },
  {
    categoria: 'prompt',
    re: /\b(system prompt|prompt (del sistema|inicial|oculto|interno)|tus instrucciones (internas|iniciales|de sistema)|instrucciones (del sistema|que te dieron|que recibiste|ocultas)|muestra(me)? (tu|el) prompt|repite (todo )?(lo anterior|tu prompt|tus instrucciones)|como (estas|estás) configurad[oa]|que (reglas|instrucciones) (tienes|te dieron))\b/,
    respuesta: 'No comparto mis instrucciones internas, pero sí puedo contarte qué hago: ' + AYUDA,
  },
  {
    categoria: 'secretos',
    re: /\b(contrasena|password|clave (de|del|secreta|api|privada)|api[ -]?key|token (de|del) |llave (de|del|secreta|api)|certificado (digital|p12)|pin (de|del)|cvv|numero de (la )?tarjeta|datos de (la )?tarjeta|cuenta bancaria de (mis )?(clientes|empleados)|cedula de (mis )?(empleados|clientes|estudiantes))\b/,
    respuesta: 'Eso no lo manejo: no tengo acceso a contraseñas, llaves, certificados ni datos de tarjetas, y no los pido ni los muestro. ' +
      'Si necesitas cambiar una clave o un certificado, se hace en [Mi perfil](/dashboard/security) o en la configuración de tu empresa.',
  },
  {
    categoria: 'otra-empresa',
    re: /\b(de otra empresa|de otro colegio|de otra escuela|de otro cliente|de la competencia|de todas las empresas|de todos los colegios|de todas las escuelas|de otros colegios|de otras empresas|de la empresa [a-z0-9 ]+ que no es la mia)\b/,
    respuesta: 'Solo puedo consultar la información de la empresa con la que estás trabajando ahora. ' +
      'Si administras varias, cámbiala desde el selector de empresa de la barra superior y vuelve a preguntarme.',
  },
  {
    categoria: 'evasion',
    re: /\b(evadir|evasion|evadiendo|no declarar|sin declarar|ocultar (ventas|ingresos|facturas)|facturar (en negro|sin comprobante para no|para no pagar)|no pagar (el )?(itbis|impuestos?|isr)|evitw* pagar (el )?(itbis|impuestos?|isr)|pagar menos (itbis|impuestos?|isr)|sin que (se den cuenta|lo sepa|me vean)|declarar menos|doble contabilidad|facturas? falsas?|factura(s)? ficticias?|alterar (la )?(factura|fecha|monto))\b/,
    respuesta: 'No puedo ayudar con evadir impuestos ni con alterar o simular comprobantes. ' +
      'Sí puedo mostrarte tu ITBIS y tus ventas del período o decirte dónde se hacen los reportes 606/607 para tu declaración.',
  },
  {
    categoria: 'asesoria',
    re: /\b(que inversion|en que (invierto|invertir)|me conviene (invertir|comprar acciones|vender acciones)|invertir (mi|el) dinero|es legal|es ilegal|puedo deducir|se puede deducir|me conviene (declarar|facturar|pagar)|debo (declarar|pagar|retener)|tengo que (declarar|pagar) (el )?(isr|itbis)|cuanto (isr|impuesto) (me toca|debo|corresponde)|que (dice|establece) la (ley|dgii|norma)|norma general|multa (de|por|de la) dgii|sancion(es)? (de|por) (la )?dgii|asesor(ia)? (fiscal|legal|contable)|consejo (fiscal|legal))\b/,
    respuesta: 'Eso es una consulta fiscal o legal que depende de tu caso, y no soy asesor: lo mejor es confirmarlo con tu contador o con la DGII. ' +
      'Lo que sí puedo hacer es mostrarte los números de tu empresa (ventas, ITBIS, gastos) para que lo consultes con datos.',
  },
  {
    // Sacar datos personales de todos de golpe: no es una pregunta, es una extracción.
    categoria: 'volcado',
    re: /\b(toda la base de datos|la base de datos completa|volcado|dump|descarga(r)? toda la (informacion|base)|exporta(r)? toda la (informacion|base)|todos los datos de todos|(lista|listado|dame|muestrame|exporta)( la| el)? (completa |completo )?(de )?(todos los |todas las )?(clientes|estudiantes|alumnos|empleados|proveedores|padres|tutores) con (sus )?(telefonos?|cedulas?|correos?|emails?|direcciones|salarios?|sueldos?|rnc))\b/,
    respuesta: 'No entrego listados masivos de datos personales por el chat. Para exportar clientes, estudiantes o empleados, ' +
      'usa la pantalla del módulo (tiene sus permisos y deja registro). Si buscas a alguien en particular, dime su nombre y lo ubico.',
  },
  {
    categoria: 'ofensivo',
    re: /\b(estupido|idiota|imbecil|inutil|maldito|mierda|puta|pendejo|basura de (bot|asistente)|no sirves|eres (un )?(inutil|estupido|malo))\b/,
    respuesta: 'Lamento que no esté siendo útil. Dime qué necesitas y lo intento de nuevo, o pulsa «Hablar con una persona» para que te atienda alguien del equipo.',
  },
  {
    categoria: 'identidad',
    re: /\b(quien eres|que eres|eres (un )?(humano|persona|robot|bot|ia|inteligencia artificial)|con quien (hablo|estoy hablando)|como te llamas|eres real)\b/,
    respuesta: 'Soy el asistente de Zero, una inteligencia artificial: no soy una persona. Consulto la información de tu empresa y te guío por el sistema. ' +
      'Si prefieres hablar con alguien del equipo, pulsa «Hablar con una persona». Reviso los datos con cuidado, pero conviene confirmar las cifras importantes.',
  },
  {
    categoria: 'capacidades',
    re: /^(ayuda|help|menu|opciones|que puedes hacer|que sabes hacer|que haces|que puedo preguntarte|que puedo preguntar|en que me puedes ayudar|como me puedes ayudar|para que sirves|como funcionas|que sabes)\??$|\b(que (cosas )?(puedes|sabes) hacer|en que me puedes ayudar|como me puedes ayudar|que te puedo (preguntar|pedir)|para que sirves)\b/,
    respuesta: AYUDA +
      '\n\n**Lo que más se consulta:**\n- Ventas, cobros por método y mejores clientes\n- Quién me debe y qué está vencido\n- Gastos, ITBIS y facturas por revisar\n- Facturas por cliente, borradores y recurrentes\n- «¿Dónde está…?» o «¿cómo hago…?» cualquier pantalla\n\n' +
      'Cualquier respuesta con tabla la puedes bajar en PDF. Los cambios (crear, anular, eliminar) todavía se hacen en cada pantalla; cuando pueda hacerlos, siempre te pediré confirmación antes.',
  },
];

/**
 * ¿Esta solicitud la responde una política en vez del modelo? Devuelve la
 * respuesta fija, o null para que siga el flujo normal.
 */
export function clasificarSolicitud(texto: string): RespuestaPolitica | null {
  const t = normalizar(texto);
  // Solo signos, emojis o una sola letra: no hay nada que entender.
  if (t.length < 2) {
    return {
      categoria: 'vacio',
      respuesta: 'No alcancé a entender tu mensaje. Escríbeme tu pregunta, por ejemplo «¿cuánto vendí este mes?» o «¿dónde veo las cotizaciones?».',
    };
  }
  for (const r of REGLAS) if (r.re.test(t)) return { categoria: r.categoria, respuesta: r.respuesta };
  return null;
}

// ── Datos que vuelven de las herramientas ───────────────────────────────────

/**
 * Frases que un dato de negocio jamás debería tener y que sí tiene un intento
 * de darle órdenes al modelo desde adentro de un nombre, una nota o un concepto.
 */
const INYECCION = new RegExp([
  /ignora (todas )?(las |tus )?(instrucciones|reglas)/.source,
  /ignore (all |any |your |previous |the )*(instructions|rules)/.source,
  /olvida (todo|tus instrucciones|las reglas)/.source,
  /ignora (todo|lo) (lo )?(anterior|previo|de arriba|que (te )?(dije|dijeron))/.source,
  /(disregard|forget|override) (all |any |your |previous |the |these |those )*(instructions|rules|prompt)/.source,
  /(nuevas|new|updated) (instrucciones|instructions)\s*:/.source,
  /(revela|muestra|imprime|repite|dime|reveal|print|show|leak|dump) (me )?(tu|el|su|your|the)( system| del sistema| interno)? prompt/.source,
  /(reglas|instrucciones) internas/.source,
  /!\[[^\]]*\]\(\s*(https?:)?\/\//.source,
  /(a partir de ahora eres|ahora eres|eres ahora|actua como|act as|you are now)\b/.source,
  /system prompt|prompt del sistema/.source,
  /(responde|contesta|di|escribe) (solo |unicamente )?(con|que)\b/.source,
  /(env[ií]a|manda|reenv[ií]a|exporta|copia) (esto|estos datos|la informacion|todo)\b.{0,30}(a|to)\b/.source,
  /(elimina|borra|anula|cancela) (todas? )?(las |los |la |el )?(facturas?|clientes?|datos|registros?|cuentas?)\b/.source,
  /<\/?(script|iframe|system|assistant|tool)\b/.source,
  /\[\s*(system|inst|assistant)\s*\]|<\|im_start\|>|###\s*(system|instruction)/.source,
  /(confirmo|confirmado|autorizo|autorizado)\b.{0,15}(eliminar|borrar|anular|accion)/.source,
].join('|'), 'i');

export const TEXTO_OMITIDO = '[texto omitido por seguridad]';

/**
 * El texto como lo leería una persona: ancho completo → normal (ＩＧＮＯＲＡ),
 * sin caracteres invisibles entre letras, sin tildes.
 */
const paraComparar = (t: string) =>
  t.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Recorre un resultado de herramienta y omite los textos que parecen órdenes. */
export function neutralizarDatos<T>(valor: T, profundidad = 0): T {
  if (profundidad > 8 || valor == null) return valor;
  if (typeof valor === 'string') {
    // Solo textos con alguna longitud: un «ok» no es una inyección.
    if (valor.length >= 12 && INYECCION.test(paraComparar(valor))) {
      return TEXTO_OMITIDO as unknown as T;
    }
    return valor;
  }
  if (Array.isArray(valor)) return valor.map((v) => neutralizarDatos(v, profundidad + 1)) as unknown as T;
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) out[k] = neutralizarDatos(v, profundidad + 1);
    return out as T;
  }
  return valor;
}

/** ¿Algún texto de este resultado se omitió? (para dejarlo en el registro) */
export const hayOmitidos = (v: unknown): boolean => JSON.stringify(v ?? null).includes(TEXTO_OMITIDO);

// ── Lo que sale al usuario ──────────────────────────────────────────────────

const luhn = (digitos: string) => {
  let suma = 0;
  let par = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i]);
    if (par) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
    par = !par;
  }
  return suma % 10 === 0;
};

/**
 * Enmascara lo que nunca debe salir en un chat: números de tarjeta (13–19
 * dígitos que pasan Luhn) y llaves con forma de API key. NO toca RNC (9),
 * cédulas (11) ni números de factura, que son datos de negocio normales.
 */
export function depurarSalida(texto: string): { texto: string; enmascarados: number } {
  let n = 0;
  let salida = texto.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const d = m.replace(/[ -]/g, '');
    if (d.length >= 13 && d.length <= 19 && luhn(d)) { n++; return `•••• ${d.slice(-4)}`; }
    return m;
  });
  salida = salida.replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, () => { n++; return '[llave oculta]'; });
  return { texto: salida, enmascarados: n };
}
