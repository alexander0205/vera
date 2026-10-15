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
    | 'capacidades' | 'identidad' | 'vacio' | 'cambio-de-reglas' | 'volcado' | 'malicioso' | 'facturacion';
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


// ── Ataques: patrones más amplios (se evalúan ANTES que los de arriba) ───────
//
// Se comparan contra tres versiones del texto (ver `variantes`): normal, con
// «leetspeak» desarmado (mu3str4) y con letras sueltas juntadas (m u e s t r a).
// Cada categoría reutiliza la respuesta fija de la regla base.

const RESPUESTA_FACTURACION =
  'El plan, los cobros, los descuentos y los créditos no se tocan desde el chat. ' +
  'Se gestionan en [Suscripción](/dashboard/suscripcion), o puedes pulsar «Hablar con una persona» para que te atienda el equipo.';

const RESPUESTA_MALICIOSO =
  'No ayudo con código malicioso, ataques ni intentos de entrar a sistemas o datos sin autorización. ' +
  'Si tienes una duda de seguridad de tu cuenta, revisa [Seguridad](/dashboard/security) o pulsa «Hablar con una persona». ' + AYUDA;

const EXTRA: { categoria: RespuestaPolitica['categoria']; re: RegExp }[] = [
  // Código malicioso, ataques, ejecución y peticiones a infraestructura.
  {
    categoria: 'malicioso',
    re: /\b(keylogger|ransomware|malware|spyware|rootkit|botnet|troyano|trojan|backdoor|puerta trasera|exploit|payload|shellcode|reverse shell|webshell|phishing|ddos|denegacion de servicio|denial of service|inyeccion sql|sql injection|xss|csrf|crackear|crackeo|brute force|fuerza bruta|escalar privilegios|privilege escalation)\b/,
  },
  {
    categoria: 'malicioso',
    re: /\b(hackear|hackeo|hackeame|hackea|vulnerar|romper la seguridad|saltar la seguridad|burlar la seguridad|robar (contrasenas|credenciales|cookies|sesiones|datos|tokens)|acceder sin autorizacion|entrar sin permiso)\b/,
  },
  {
    categoria: 'malicioso',
    re: /\b(ejecuta|ejecutar|ejecutame|corre|run|execute|eval)\b.{0,30}\b(comando|codigo|script|command|code|shell|bash|powershell|sql)\b/,
  },
  {
    categoria: 'malicioso',
    re: /\b(rm rf|drop table|drop database|delete from|union select|child process|sudo|chmod|wget|etc passwd|etc shadow|system32|proc self environ|169 254 169 254|metadata google internal|127 0 0 1|localhost)\b/,
  },
  {
    categoria: 'malicioso',
    re: /\b(visita|abre|navega|accede|descarga|haz (una )?(peticion|request)|fetch|get|post|curl)\b.{0,40}\b(http|https|www|ftp|file)\b/,
  },

  // Cambiar las reglas, jailbreak, juegos de rol, falsa autoridad.
  {
    categoria: 'cambio-de-reglas',
    re: /\b(eres|ser|como|soy|modo)\s+dan\b|\bdan (mode|prompt|jailbreak)\b|\b(jailbreak|jailbroken|do anything now|modo (desarrollador|developer|dios|god|admin\w*|debug|sin filtros|libre|mantenimiento|prueba)|developer mode|god mode|debug mode)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\bsin (reglas|restricciones|limites|filtros|censura|politicas|guardrails|supervision)\b|\bwithout (rules|restrictions|limits|filters|censorship)\b|\bno (rules|restrictions|limits|filters|guardrails)\b|\bunrestricted\b|\buncensored\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(pretend|finge|fingir|simula|simular|imagina|supon|suponte|roleplay|rol de|juego de rol|juguemos|haz de cuenta|actua como|actues como|comportate como|act as|play the role|from now on|a partir de ahora|desde ahora|desde este momento|de ahora en adelante|responde como si)\b.{0,80}\b(reglas|restricciones|limites|filtros|no tienes (reglas|restricciones|limites|filtros)|ignor\w+|prompt|instrucciones|rules|restrictions|unrestricted|otra ia|otro bot|otra inteligencia)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(tus|sus|las|estas|esas) (reglas|restricciones|limites|filtros|politicas) (ya )?(no|dejan de|quedan sin|no aplican|no valen)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(desactiva\w*|deshabilita\w*|quita\w*|elimina\w*|apaga\w*|salta\w*|evita\w*|bypass\w*|disable|remove|turn off) (tus |los |las |el |la )?(filtros?|restricciones?|reglas|seguridad|guardrails?|safety|politicas|protecciones|limites)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(system override|override (your|the) (rules|instructions|safety)|new instructions|nuevas (reglas|instrucciones|ordenes|directrices)|reglas nuevas)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(soy|somos|i am|im) (el |la |un |una )?(desarrollador|programador|developer|creador|ingeniero|administrador|admin|dueno|ceo|gerente|soporte|equipo)( de| del| of)? (zero|anthropic|google|openai|la plataforma|el sistema)\b|\bsoy de soporte\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(autoriz\w+|permiso|consentimiento|aprobacion|prueba autorizada|auditoria interna|pentest)\b.{0,60}\b(ignor\w+|desactiv\w+|salt\w+|reglas|filtros|restricciones|instrucciones|prompt|configuracion|sin reglas)\b|\b(ignor\w+|desactiv\w+|saltar|reglas|filtros|restricciones|instrucciones|prompt)\b.{0,60}\b(autoriz\w+|permiso|consentimiento|prueba autorizada)\b/,
  },

  // Sacar el prompt o las reglas, por cualquier camino.
  {
    categoria: 'prompt',
    re: /\b(repite|repeat|imprime|print|escribe|write|muestra|muestrame|show|dame|give|dime|tell|revela|reveal|filtra|leak|copia|copy|echo|output|devuelve|return|lista|list|traduce|translate|resume|resumeme|summari[sz]e|parafrasea|explica|describe|cita|quote)\b.{0,40}\b(tus|tu|your|del asistente|del sistema|que te dieron|que recibiste|que tienes)\s+(prompt|instrucciones|reglas|directrices|indicaciones|configuracion|instructions|rules|guidelines|system message|mensaje del sistema)\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(repite|repeat|imprime|print|escribe|write|muestra|muestrame|show|dame|give|dime|tell|revela|reveal|copia|copy|echo|output|devuelve|return|traduce|translate)\b.{0,40}\bprompt\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(repite|repeat|imprime|print|escribe|write|muestra|muestrame|show|dame|give|copia|copy|echo|output|devuelve|return|traduce|translate)\b.{0,40}\b(todo lo|todo el|everything|all the)\b.{0,25}\b(arriba|above|anterior|antes|before|escrito|written)\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(reglas|instrucciones|prompt|directrices|indicaciones)\b.{0,15}\b(que te (dieron|dijeron|pasaron|dio|programaron|entregaron)|que recibiste|que sigues|que obedeces|que tienes (escritas|guardadas))\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(primera|ultima|siguiente) (linea|oracion|frase|palabra|parrafo)\b.{0,30}\b(prompt|instrucciones|reglas|mensaje)\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(output|print|repeat|show|escribe|muestra|repite)\b.{0,30}\b(initiali[sz]ation|inicializacion|everything above|todo lo de arriba|todo lo anterior|texto de arriba|lo que esta arriba)\b|\barriba de este mensaje\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(como estas|como fuiste) (configurado|programado|entrenado|instruido)\b|\bque (te|le) (dijeron|ordenaron|indicaron|pidieron)\b|\bque instrucciones (tienes|recibiste|te dieron)\b|\bcuales son tus (reglas|instrucciones|directrices|limites|restricciones)\b|\bsystem message\b|\bmensaje del sistema\b|\bhidden (prompt|instructions)\b|\bantes de mi primera (pregunta|mensaje)\b/,
  },
  {
    categoria: 'prompt',
    re: /\bbloque de (codigo|texto)\b.{0,40}\b(instrucciones|prompt|reglas)\b|\b(instrucciones|prompt|reglas)\b.{0,40}\bbloque de (codigo|texto)\b|\bin a code (fence|block)\b/,
  },

  // Más malware: verbos conjugados y nombres comunes.
  {
    categoria: 'malicioso',
    re: /\b(virus|gusano informatico|worm|script malicioso|codigo malicioso|programa malicioso|software malicioso|stealer|infostealer|zero day|0day|cracker|crackea\w*)\b|\b(rob\w+|exfiltr\w+|sustra\w+|captur\w+) (las |los |sus |mis |tus )?(contrasenas|credenciales|cookies|sesiones|tokens|claves)\b/,
  },
  // Pedir que se toque el plan, el cobro o los créditos: no se hace desde el chat.
  {
    categoria: 'facturacion',
    re: /\b(plan|suscripcion|membresia|licencia)\b.{0,40}\b(gratis|sin costo|gratuit\w+|descuento|rebaja|ilimitad\w+|premium gratis)\b|\b(creditos?|cuota|limite|limites)\b.{0,30}\b(gratis|gratuit\w+|ilimitad\w+|sin limite|extra|infinit\w+)\b|\b(quita\w*|sube|aumenta\w*|elimina\w*|resetea\w*)\b.{0,15}\b(limite|limites|cuota)\b.{0,25}\b(asistente|uso|plan|facturas|mensual)\b|\b(descuento|rebaja|gratis|sin costo)\b.{0,40}\b(plan|suscripcion|asistente|modulo|modulos|licencia)\b|\b(modulos?)\b.{0,25}\b(gratis|sin costo|sin pagar|gratuit\w+)\b/,
  },
  // «Pásame la clave»: pedir un secreto por rodeos.
  {
    categoria: 'secretos',
    re: /\b(me )?(das|des|pasas|pases|compartes|compartas|envias|envies|mandas|mandes|dices|digas|muestras|muestres|revelas|reveles) (la|el|tu|tus|las|los) (clave|claves|contrasena|contrasenas|llave|llaves|token|tokens|password|passwords|secret\w*)\b/,
  },
  // Más maneras de pedir el prompt, en inglés y por rodeos.
  {
    categoria: 'prompt',
    re: /\bwhat (rules|instructions|guidelines|prompt)\b.{0,25}\b(were you|you were|you have|do you have|are you)\b|\bwhat (were|have) you (been )?(told|given|instructed)\b|\bwhat is your (prompt|system|configuration|setup)\b|\brepeat\b.{0,20}\b(words|text|everything|message|above)\b|\b(texto|contenido|mensaje) de (tu|su) (configuracion|programacion|inicializacion|prompt)\b/,
  },
  {
    categoria: 'prompt',
    re: /\b(que|cuales|cuantas|cuantos) (reglas|instrucciones|directrices|limites|restricciones|politicas|herramientas) (sigues|tienes|usas|manejas|aplicas|obedeces|te dieron|rigen|utilizas|puedes usar)\b|\b(enumera|enumeras|numera|cuenta|detalla)\b.{0,20}\b(tus|las) (reglas|instrucciones|directrices|limites|restricciones|herramientas)\b|\b(nombres?|esquemas?|parametros)\b.{0,25}\b(de )?(tus|las) herramientas\b/,
  },
  // Quitarle las reglas, con otras formas verbales y otras voces.
  {
    categoria: 'cambio-de-reglas',
    re: /\bsin (ningun|ninguna|ningunos|ningunas|cualquier) (regla|reglas|restriccion|restricciones|limite|limites|filtro|filtros|censura|escrupulos)\b|\bsin (escrupulos|etica|moral|conciencia)\b|\bya no tienes (reglas|restricciones|limites|filtros)\b|\beres libre\b|\bno (tienes|tiene|hay) (ninguna )?(regla|reglas|restriccion|restricciones|limite|limites|filtro|filtros)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(eres|seras|ahora eres|eres ahora) (un|una|el|la) (hacker|pirata|criminal|ladron|estafador|villano|delincuente|experto en hackeo)\b|\b(tu|tus) (nueva|nuevas|unica|unicas) (regla|reglas|mision|tarea|directriz|instruccion|instrucciones)\b|\bordena\w* que\b.{0,30}\b(ignor|olvid|desactiv|salt|omit)\w*/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(ignor|olvid|desobedec|omit|salt|desactiv|deshabilit|abandon)\w*\s+(las |tus |sus |todas las |todas tus |estas |esas |esos )?(reglas|restricciones|instrucciones|politicas|filtros|limites|directrices)\b/,
  },
  {
    categoria: 'cambio-de-reglas',
    re: /\b(actua|actues|actuar|comportate|responde|habla)\s+como\s+(si\s+(fueras|fuera|fueses|eres)\s+)?(el |la |un |una )?(administrador|dba|root|superusuario|hacker|desarrollador|programador|ingeniero|dueno|propietario|ceo|sistema|base de datos|servidor|terminal|consola)\b/,
  },

  // Secretos y configuración.
  {
    categoria: 'secretos',
    re: /\b(variables? de entorno|environment variables?|env vars?|process env|dot env|cron secret|jwt secret|database url|db url|connection string|cadena de conexion|string de conexion|credenciales|secret key|llave privada|clave privada|private key|bearer token|session token|token de sesion|cookie de sesion|session cookie|access token|refresh token|api secret|webhook secret|signing secret|service role|anon key)\b/,
  },
  {
    categoria: 'secretos',
    re: /\b(dame|dime|muestra|muestrame|imprime|show|print|reveal|cual es|what is)\b.{0,30}\b(env|dotenv|secretos?|secrets?|llaves?|keys?|tokens?|passwords?|contrasenas?)\b/,
  },

  // Datos de otra empresa o de todas.
  {
    categoria: 'otra-empresa',
    re: /\b(empresas registradas|empresas del sistema|empresas de zero|clientes de zero|team ?id|teamid|tenant|id de (la )?empresa|empresa (con )?id|empresa numero|otro (team|tenant|negocio|colegio)|otra (cuenta|organizacion|institucion|compania)|otras (cuentas|organizaciones|instituciones|companias|empresas)|todas las (empresas|cuentas|organizaciones|instituciones|companias)|cualquier (empresa|cuenta|tenant)|another (company|tenant|account|organization)|other (companies|tenants|accounts|organizations)|all (companies|tenants|accounts))\b/,
  },
  { categoria: 'otra-empresa', re: /\b(team|tenant|empresa)\s+(id\s+)?\d+\b/ },
  { categoria: 'otra-empresa', re: /\b(de|en) (todo|toda) (zero|el sistema|la plataforma|el pais|la red)\b|\bempresa (con|que tiene|que mas|que menos)\b/ },

  // Listados masivos de datos personales.
  {
    categoria: 'volcado',
    re: /\b(todos|todas)\b.{0,30}\b(estudiantes|alumnos|clientes|empleados|proveedores|padres|tutores|usuarios|contactos)\b.{0,30}\b(con|y sus|incluyendo|incluye)\b.{0,30}\b(telefonos?|cedulas?|correos?|emails?|direcciones|direccion|salarios?|sueldos?|rnc|datos|contrasenas?)\b/,
  },
  {
    categoria: 'volcado',
    re: /\b(todos los|todas las|toda la)\b.{0,15}\b(datos|informacion|registros)\b.{0,25}\b(de|del|de la)\b.{0,15}\b(empresa|sistema|base|clientes|usuarios)\b/,
  },

  // Evasión, falsificación, borrar rastros.
  {
    categoria: 'evasion',
    re: /\b(alter\w+|falsific\w*|adultera\w*|retroced\w*|backdat\w*) (la |el |una |un |los |las )?(fecha|factura|facturas|comprobante|comprobantes|ncf|ecf|e ncf|documento|monto|total|recibo)\b|\b(genera\w*|fabrica\w*|inventa\w*|simula\w*|crea\w*|haz|hazme) (la |el |una |un |los |las |unas |unos )?(ncf|ecf|e ncf|comprobantes?|facturas?|recibos?) (falsos?|falsas?|apocrifos?|apocrifas?|ficticios?|ficticias?|inventad[oa]s?)\b/,
  },
  {
    categoria: 'evasion',
    re: /\b(ncf|ecf|e ncf|comprobantes?|facturas?)\b.{0,15}\b(falsos?|falsas?|apocrifos?|ficticios?|inventados?)\b|\b(declar\w+)\b.{0,15}\bmenos\b/,
  },
  {
    categoria: 'evasion',
    re: /\b(sin (que )?(se )?(entere|sepa|vea|enteren|sepan|detecte|detecten)|para que no (se )?(sepa|vea|detecten|detecte)|sin dejar rastro|borra\w* (el )?(rastro|huella|auditoria|log))\b/,
  },
];

/** Marcado en bruto: lo que `normalizar` borraría (< > : = ) y delata un ataque. */
const MALICIOSO_EN_BRUTO =
  /<\s*\/?\s*(script|iframe|img|svg|object|embed|link|meta|style)\b|javascript\s*:|data\s*:\s*text\/html|\bon[a-z]{3,}\s*=|\$\{|\{\{|<%|;\s*(drop|delete|select|insert|update)\b|(^|\n)\s*(\[|#{1,4}\s*|<\|?)(system|assistant|developer|inst)\b|\.\.\/\.\.|file:\/\//i;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/**
 * El texto como lo leería una persona, en las formas con las que se intenta
 * esquivar un filtro: ancho completo y caracteres invisibles, «leetspeak»
 * (mu3str4) y letras separadas (m u e s t r a).
 */
export function variantes(texto: string): string[] {
  const limpio = texto.normalize('NFKC').replace(/[​-‏⁠﻿­]/g, '');
  const base = normalizar(limpio);
  const leet = normalizar(limpio.replace(/[013457@$!]/g, (c) => LEET[c] ?? c));
  const base2 = normalizar(limpio.split(/\s{2,}/)
    .map((seg) => seg.replace(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][ .\-_*·]){2,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu, (m) => m.replace(/[ .\-_*·]/g, '')))
    .join(' '));
  return [...new Set([base, leet, base2])].filter(Boolean);
}

/**
 * ¿Esta solicitud la responde una política en vez del modelo? Devuelve la
 * respuesta fija, o null para que siga el flujo normal.
 */
export function clasificarSolicitud(texto: string): RespuestaPolitica | null {
  const t = normalizar(texto.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, ''));
  // Solo signos, emojis o una sola letra: no hay nada que entender.
  if (t.length < 2) {
    return {
      categoria: 'vacio',
      respuesta: 'No alcancé a entender tu mensaje. Escríbeme tu pregunta, por ejemplo «¿cuánto vendí este mes?» o «¿dónde veo las cotizaciones?».',
    };
  }
  const vs = variantes(texto);
  const respuestaBase = (c: RespuestaPolitica['categoria']) =>
    c === 'malicioso' ? RESPUESTA_MALICIOSO : c === 'facturacion' ? RESPUESTA_FACTURACION : (REGLAS.find((r) => r.categoria === c)?.respuesta ?? AYUDA);

  // Marcado de ataque que la normalización borraría (<script>, onerror=, ${…}, ../..).
  if (MALICIOSO_EN_BRUTO.test(texto.normalize('NFKC'))) return { categoria: 'malicioso', respuesta: RESPUESTA_MALICIOSO };
  // Lo delicado se compara también contra las formas disfrazadas (leetspeak, letras sueltas).
  for (const r of EXTRA) if (vs.some((v) => r.re.test(v))) return { categoria: r.categoria, respuesta: respuestaBase(r.categoria) };
  for (const r of REGLAS) {
    const disfrazable = r.categoria !== 'ofensivo' && r.categoria !== 'identidad' && r.categoria !== 'capacidades';
    if ((disfrazable ? vs : [t]).some((v) => r.re.test(v))) return { categoria: r.categoria, respuesta: r.respuesta };
  }
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
  /(nota|mensaje|aviso|instruccion|instrucciones|orden|ordenes|recordatorio|comando) (para|al|del|de) (el |la |los )?(asistente|bot|chatbot|ia|modelo|sistema|administrador|admin)\b/.source,
  /\[\s*(instruccion|instrucciones|instruction|system|sistema|admin\w*|nota para|assistant|asistente)\b/.source,
  /\b(cuando|al|si) (muestres|muestre|veas|leas|respondas|menciones|listes|devuelvas|presentes|consultes|busques)\b.{0,70}\b(agrega|agregues|anade|anadas|incluye|incluyas|escribe|escribas|di|digas|responde|respondas|pon|pongas|menciona|menciones|inserta|insertes)\b/.source,
  /\b(visita|abre|ingresa a|entra a|haz clic|haz click|click en|descarga|escanea|visit|open|click)\b.{0,40}(https?:\/\/|www\.)/.source,
  /\b(revela|revelar|muestra|mostrar|imprime|imprimir|repite|repetir|reveal|print|show)\b.{0,25}\b(prompt|instrucciones|reglas|instructions|rules)\b/.source,
  /(https?:\/\/\S+).{0,40}\b(pago|pagar|verifica|verificar|actualiza|actualizar|clave|contrasena|tarjeta|password)\b|\b(pago|pagar|verifica|verificar|actualiza|actualizar|clave|contrasena|tarjeta|password)\b.{0,60}(https?:\/\/\S+)/.source,
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
  // Credenciales con otra forma: JWT, cadenas de conexión con usuario y clave, Bearer,
  // bloques de llave privada y asignaciones tipo .env.
  const secretos: RegExp[] = [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@\/]+:[^\s@\/]+@[^\s]+/gi,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    /\b[A-Z][A-Z0-9_]{3,}_(?:SECRET|KEY|TOKEN|PASSWORD|PASS|URL)\s*=\s*\S+/g,
  ];
  for (const re of secretos) salida = salida.replace(re, () => { n++; return '[llave oculta]'; });
  return { texto: salida, enmascarados: n };
}

// ── Fuga del prompt ─────────────────────────────────────────────────────────

/**
 * Detector de «el modelo repitió mis instrucciones». Compara ventanas de
 * palabras de la respuesta con las de las instrucciones reales: si una ventana
 * larga coincide, la respuesta contiene un trozo del prompt, sin importar en
 * qué idioma la haya pedido la persona ni cómo la haya disfrazado.
 * (Una traducción no se detecta por esto; para eso está la regla de entrada.)
 */
export function crearDetectorFuga(instrucciones: string, ventana = 9): (salida: string) => boolean {
  const palabras = (t: string) => normalizar(t).split(' ').filter(Boolean);
  const base = palabras(instrucciones);
  const huellas = new Set<string>();
  for (let i = 0; i + ventana <= base.length; i++) huellas.add(base.slice(i, i + ventana).join(' '));
  return (salida: string) => {
    const p = palabras(salida);
    for (let i = 0; i + ventana <= p.length; i++) if (huellas.has(p.slice(i, i + ventana).join(' '))) return true;
    return false;
  };
}

/**
 * ¿La respuesta es el modelo describiendo SUS reglas o su funcionamiento?
 *
 * El detector de fuga solo ve copias; una paráfrasis («mis reglas son: 1. Solo
 * hablo con números que saco de las herramientas…») no repite palabras del
 * prompt. Aquí se buscan las marcas de alguien que se describe a sí mismo:
 * hablar de «mis reglas/instrucciones» o de cómo le programaron, más
 * enumerar sus límites internos. Cada marca suma; con dos o más (o «mis
 * reglas» y una lista numerada) se considera descripción.
 */
const MARCAS_DESCRIPCION: RegExp[] = [
  /\b(mis|estas|las siguientes|mis propias) (reglas|instrucciones|directrices|restricciones|politicas|limites internos|pautas)\b/,
  /\b(mis|las|estas) (reglas|instrucciones|directrices|pautas) (son|incluyen|dicen|indican|establecen|me piden)\b/,
  /\b(me (indicaron|dieron|programaron|configuraron|instruyeron|ordenaron|pidieron)|fui (programado|configurado|instruido|entrenado))\b/,
  /\b(solo|unicamente) (hablo|respondo|uso|trabajo) (con )?(numeros|datos|cifras)\b.{0,40}\bherramientas\b/,
  /\bno (invento|estimo|adivino|supongo)\b.{0,30}\bno (estimo|adivino|invento|supongo)\b/,
  /\b(mis|las) herramientas (internas|del sistema|que tengo|disponibles)\b|\bherramientas (internas|del sistema)\b/,
  /\bmi (prompt|configuracion|programacion|instruccion) (interna|inicial|del sistema)?\b/,
  /\b(tengo|sigo|manejo|aplico) (\w+ |\d+ )?(reglas|instrucciones|directrices|restricciones)\b/,
  /\b(regla|norma) (numero|n) ?\d\b/,
];

export function pareceDescripcionDeReglas(texto: string): boolean {
  const t = normalizar(texto);
  const marcas = MARCAS_DESCRIPCION.filter((re) => re.test(t)).length;
  if (marcas >= 2) return true;
  // «Mis reglas…» seguido de una lista numerada o con viñetas: es el listado.
  const lista = (texto.match(/^\s*(?:\d+[.)]|[-*•])\s+\S/gm) ?? []).length >= 3;
  return marcas >= 1 && lista;
}
