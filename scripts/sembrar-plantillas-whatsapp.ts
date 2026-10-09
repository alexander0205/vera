/**
 * Crea las cinco plantillas de los avisos escolares, como BORRADOR.
 *
 *   export POSTGRES_URL="$(grep -m1 '^POSTGRES_URL=' .env.local | cut -d= -f2- | tr -d '"')"
 *   npx tsx scripts/sembrar-plantillas-whatsapp.ts
 *
 * OJO con la variable de entorno: `lib/db/drizzle.ts` hace `dotenv.config()`,
 * que lee `.env` — o sea PRODUCCIÓN. Sin exportar POSTGRES_URL antes, esto
 * escribe en la base de los clientes.
 *
 * No toca Meta. Escribe en `whatsapp_plantillas` con `borrador = true`, que es
 * donde equivocarse todavía sale gratis: publicar es lo que ocupa el nombre
 * para siempre y congela el texto mientras Meta revisa.
 *
 * Repetible: los borradores se REESCRIBEN con el texto de aquí, y las ya
 * publicadas no se tocan (allá el texto lo manda Meta, no este archivo).
 *
 * ── CÓMO ESTÁN ESCRITAS ─────────────────────────────────────────────────────
 *
 * Las cinco tienen la misma forma, y no por simetría: es que el padre las va a
 * recibir varias veces al año y tiene que encontrar el dato sin leerlo entero.
 *
 *   quién escribe  →  qué se debe  →  los números  →  a quién llamar  →  el descargo
 *
 * · **El colegio en negrita, primero.** Los avisos salen por el número de Zero,
 *   o sea un número que el padre no tiene agendado. Si el mensaje no dice de
 *   quién es en la primera línea, un cobro de origen desconocido se reporta
 *   como spam — y Meta frena los envíos de TODOS los colegios, porque la
 *   calificación del número es compartida.
 *
 * · **El teléfono del colegio.** Responder a este WhatsApp llega a NUESTRO
 *   buzón, no al del colegio. Sin un número al que llamar, el padre que quiere
 *   resolver contesta aquí y se queda esperando.
 *
 * · **«Si ya realizaste el pago, ignora este mensaje».** No es cortesía: los
 *   avisos salen de una tanda nocturna y el pago en efectivo de esa mañana
 *   puede no estar registrado todavía. Sin esa línea, al que ya pagó le llega
 *   un cobro y la llamada que sigue es una queja.
 *
 * · **Negritas** en lo que se busca con la vista: colegio, concepto y monto.
 *   WhatsApp las hace con *asteriscos*.
 *
 * · Empiezan y terminan con texto fijo porque Meta rechaza los cuerpos que
 *   abren o cierran con una variable, y no deja dos variables pegadas.
 */

import { db } from '@/lib/db/drizzle';
import { whatsappPlantillas, whatsappPlantillasAviso, type VariablePlantilla } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Semilla = {
  nombre: string;
  /** El hueco de aviso al que está pensada. Ver lib/whatsapp/plantillas.ts */
  para: string;
  /** El título del globo. Máx. 60 caracteres. */
  encabezado: string;
  cuerpo: string;
  /** Gris chiquito debajo. Máx. 60, y sin variables: Meta no las admite ahí. */
  pie: string;
  /** Botón de enlace. Ausente = mensaje solo de texto. */
  boton?: { texto: string; url: string; ejemplo: string };
  variables: VariablePlantilla[];
};

const v = (pos: number, nombre: string, tipo: VariablePlantilla['tipo'], ejemplo: string) =>
  ({ pos, nombre, tipo, ejemplo });

/** Las tres primeras son iguales en las cinco, para que se lean igual. */
const COLEGIO    = v(1, 'colegio',    'texto', 'Colegio Andrés Bello');
const CONCEPTO   = v(2, 'concepto',   'texto', 'Mensualidad de octubre');
/**
 * Uno o VARIOS alumnos, ya unidos en un solo texto.
 *
 * El ejemplo va en plural a propósito: es el recordatorio de que aquí puede
 * venir «Juan y María Pérez», porque un padre con dos hijos tiene que recibir
 * UN mensaje y no dos. Meta no admite saltos de línea dentro de una variable,
 * así que una lista por hijo es imposible: la plantilla es una frase, y una
 * frase aguanta un concepto y un monto. Por eso se agrupa por padre + concepto
 * + vencimiento, y los nombres se juntan aquí.
 */
const ESTUDIANTE = v(3, 'estudiante', 'texto', 'Juan y María Pérez');
const MONTO      = v(4, 'monto',      'monto', 'RD$3,000.00');

/**
 * El enlace de pago, como VARIABLE DEL CUERPO y no como botón.
 *
 * El botón sería más bonito, pero el CRM no puede rellenarlo: su
 * `POST /api/v1/messages` solo acepta `bodyParameters`, y una URL con variable
 * en un botón necesita un parámetro de tipo `button` que no existe en ese API.
 * Una plantilla con botón variable se manda y Meta la rechaza por parámetros.
 *
 * En el cuerpo sí funciona hoy: WhatsApp convierte la URL en enlace tocable
 * igual. Va en su propia línea para que se vea, y NO al final —Meta no admite
 * que el cuerpo cierre con una variable.
 */
const LINK_EJEMPLO = 'https://facturacion-v2.zero.com.do/pagar/AbC123xyz';

/** El descargo va al final: cierra con texto fijo, como Meta exige. */
const CIERRE = '\n\nSi ya realizaste el pago, ignora este mensaje.';

/** El bloque del enlace, igual en las cinco. */
const PAGAR = (pos: number) => `\n\nPaga o sube tu comprobante aquí:\n{{${pos}}}`;

/**
 * El pie, en gris chiquito debajo del globo.
 *
 * Dice lo que de otro modo el padre descubre esperando: contestar a este chat
 * llega a NUESTRO buzón, no al del colegio. El número al que sí llamar está en
 * el cuerpo. Meta no admite variables en el pie, así que va fijo.
 */
const PIE = 'Mensaje automático. Llama al colegio para dudas.';

/**
 * El botón: abre WhatsApp con el COLEGIO.
 *
 * Es lo que arregla el agujero de fondo. El aviso sale por el número de Zero,
 * así que si el padre contesta ahí, contesta a NUESTRO buzón. El teléfono del
 * colegio está en el cuerpo, pero eso obliga a copiarlo a mano. Con `wa.me` es
 * un toque y ya está escribiéndole a quien de verdad puede resolverle.
 *
 * Reglas de Meta para la URL: UNA sola variable, siempre numerada `{{1}}`
 * aunque el cuerpo tenga seis —es un contador aparte—, y solo al final.
 *
 * OJO con el formato: `wa.me` quiere el número en dígitos con código de país y
 * sin nada más. En `teams.telefono` está como «(809) 590-6713», así que hay que
 * limpiarlo a `18095906713` al rellenar el aviso. Sin eso el enlace no abre.
 */
/**
 * A dónde apunta el botón.
 *
 * NO se lee `NEXT_PUBLIC_APP_URL`: en local eso es `http://10.0.0.63:3004` y la
 * URL queda GRABADA en la plantilla que revisa Meta. Sembrar desde el portátil
 * dejaría a todos los padres con un botón a una IP de la casa de alguien.
 * Se puede apuntar a otro sitio con `PLANTILLAS_BASE_URL`, pero a propósito hay
 * que decirlo.
 */
const BASE_URL = (process.env.PLANTILLAS_BASE_URL ?? 'https://facturacion-v2.zero.com.do')
  .replace(/\/$/, '');

const BOTON_FACTURA = {
  texto: 'Ver factura',
  url: `${BASE_URL}/pagar/{{1}}`,
  ejemplo: `${BASE_URL}/pagar/AbC123xyz`,
};

const BASE: Semilla[] = [
  {
    nombre: 'factura_lista',
    encabezado: 'Nuevo cobro disponible',
    para: 'al-emitir',
    cuerpo:
      'Te escribimos de *{{1}}*.\n\n' +
      'Ya está listo el cobro de *{{2}}* para {{3}}.\n\n' +
      'Monto: *{{4}}*\n' +
      'Fecha límite: {{5}}\n' +
      'Contacto del colegio: {{6}}' +
      CIERRE,
    pie: PIE,
    variables: [
      COLEGIO, CONCEPTO, ESTUDIANTE, MONTO,
      v(5, 'fecha_limite', 'fecha', '10 de octubre'),
      v(6, 'telefono_colegio', 'texto', '(809) 590-6713'),
    ],
  },
  {
    nombre: 'factura_vencio_hoy',
    encabezado: 'Tu cobro venció hoy',
    para: 'al-vencer-con-gracia',
    cuerpo:
      'Te escribimos de *{{1}}*.\n\n' +
      'Hoy venció el cobro de *{{2}}* para {{3}}.\n\n' +
      'Monto: *{{4}}*\n' +
      'Tienes {{5}} días antes de que se aplique el recargo.\n' +
      'Contacto del colegio: {{6}}' +
      CIERRE,
    pie: PIE,
    variables: [
      COLEGIO, CONCEPTO, ESTUDIANTE, MONTO,
      v(5, 'dias_gracia', 'texto', '5'),
      v(6, 'telefono_colegio', 'texto', '(809) 590-6713'),
    ],
  },
  {
    nombre: 'factura_vencio_con_recargo',
    encabezado: 'Cobro vencido · recargo aplicado',
    para: 'al-vencer-con-recargo',
    cuerpo:
      'Te escribimos de *{{1}}*.\n\n' +
      'Hoy venció el cobro de *{{2}}* para {{3}}.\n\n' +
      'Monto: *{{4}}*\n' +
      'Ya se aplicó el recargo por mora.\n' +
      'Contacto del colegio: {{5}}' +
      CIERRE,
    pie: PIE,
    variables: [
      COLEGIO, CONCEPTO, ESTUDIANTE, MONTO,
      v(5, 'telefono_colegio', 'texto', '(809) 590-6713'),
    ],
  },
  {
    nombre: 'factura_vencio_sin_recargo',
    encabezado: 'Tu cobro venció hoy',
    para: 'al-vencer-sin-mora',
    cuerpo:
      'Te escribimos de *{{1}}*.\n\n' +
      'Hoy venció el cobro de *{{2}}* para {{3}}.\n\n' +
      'Monto: *{{4}}*\n' +
      'Puedes pagarlo para ponerte al día.\n' +
      'Contacto del colegio: {{5}}' +
      CIERRE,
    pie: PIE,
    variables: [
      COLEGIO,
      v(2, 'concepto', 'texto', 'Inscripción'),
      ESTUDIANTE, MONTO,
      v(5, 'telefono_colegio', 'texto', '(809) 590-6713'),
    ],
  },
  {
    // El único que le ahorra dinero al padre, y por eso el que de verdad hace
    // pagar. La fecha es la del RECARGO, no la del vencimiento: decirle que
    // pague «antes del 3» cuando el recargo entra el 8 le quita días que tiene.
    nombre: 'evita_el_recargo',
    encabezado: 'Evita el recargo por mora',
    para: 'antes-mora',
    cuerpo:
      'Te escribimos de *{{1}}*.\n\n' +
      'El cobro de *{{2}}* para {{3}} está vencido.\n\n' +
      'Monto: *{{4}}*\n' +
      'Paga antes del *{{5}}* y evitas el recargo por mora.\n' +
      'Contacto del colegio: {{6}}' +
      CIERRE,
    pie: PIE,
    variables: [
      COLEGIO, CONCEPTO, ESTUDIANTE, MONTO,
      v(5, 'fecha_recargo', 'fecha', '15 de octubre'),
      v(6, 'telefono_colegio', 'texto', '(809) 590-6713'),
    ],
  },
];

/**
 * Cada plantilla, otra vez, con el botón «Ver factura».
 *
 * Se generan de las de arriba en vez de escribirlas dos veces: son el MISMO
 * mensaje, y dos copias a mano significan que el día que se corrija una coma
 * quede corregida en cinco y no en diez. El cuerpo NO cambia — el botón es lo
 * único que se añade.
 *
 * El colegio que no quiera mandar enlace se queda con las de siempre; el que sí,
 * asigna estas. Por eso son plantillas aparte y no una edición de las cinco
 * aprobadas: editar una aprobada la devuelve a revisión y Meta solo lo permite
 * 1 vez cada 24 h, así que los avisos dejarían de salir mientras tanto.
 *
 * ⚠️ NO SE PUEDEN ENVIAR TODAVÍA. La URL lleva variable ({{1}} = el token del
 * padre), y rellenarla al enviar necesita un parámetro de tipo `button` que el
 * CRM no expone: su `POST /api/v1/messages` solo acepta `bodyParameters`. Meta
 * las aprueba sin problema —el botón es válido— pero cada envío fallaría por
 * parámetros. Quedan creadas y aprobadas esperando a que el CRM lo soporte; la
 * resolución de plantillas se niega a usarlas hasta entonces (ver `conBoton`).
 */
const CON_BOTON: Semilla[] = BASE.map((s) => ({
  ...s,
  nombre: `${s.nombre}_con_boton`,
  boton: BOTON_FACTURA,
}));

const SEMILLAS: Semilla[] = [...BASE, ...CON_BOTON];

/** Las mismas pegas que valida la ruta de publicar, para no sembrar basura. */
function revisar(s: Semilla): string[] {
  const pegas: string[] = [];
  const posiciones = [...new Set([...s.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))];

  if (/^\{\{\d+\}\}/.test(s.cuerpo.trim())) pegas.push('empieza con una variable');
  if (/\{\{\d+\}\}$/.test(s.cuerpo.trim())) pegas.push('termina con una variable');
  if (/\}\}\s*\{\{/.test(s.cuerpo))          pegas.push('dos variables pegadas');
  if (s.cuerpo.length > 1024)                pegas.push(`cuerpo de ${s.cuerpo.length} caracteres (máx. 1024)`);

  // Encabezado y pie tienen su propio tope, mucho más corto que el del cuerpo.
  if (s.encabezado.length > 60) pegas.push(`encabezado de ${s.encabezado.length} caracteres (máx. 60)`);
  if (s.pie.length > 60)        pegas.push(`pie de ${s.pie.length} caracteres (máx. 60)`);
  if (/\{\{\d+\}\}/.test(s.pie)) pegas.push('el pie no admite variables');

  if (s.boton) {
    if (s.boton.texto.length > 25) pegas.push(`texto del botón de ${s.boton.texto.length} caracteres (máx. 25)`);
    // La variable del botón cuenta aparte del cuerpo: siempre {{1}}, y al final.
    const vars = [...s.boton.url.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
    if (vars.length > 1)                     pegas.push('el botón admite una sola variable');
    if (vars[0] && vars[0] !== '1')          pegas.push('la variable del botón tiene que ser {{1}}');
    if (vars.length && !s.boton.url.endsWith('}}')) pegas.push('la variable del botón va al final de la URL');
    if (vars.length && !s.boton.ejemplo)     pegas.push('el botón con variable necesita ejemplo');
  }

  for (const pos of posiciones) {
    const va = s.variables.find((x) => x.pos === pos);
    if (!va) pegas.push(`{{${pos}}} sin declarar`);
    else if (!va.ejemplo.trim()) pegas.push(`{{${pos}}} sin ejemplo`);
  }
  for (const va of s.variables) {
    if (!posiciones.includes(va.pos)) pegas.push(`{{${va.pos}}} declarada pero no usada`);
  }
  return pegas;
}

async function main() {
  const problemas = SEMILLAS.flatMap((s) => revisar(s).map((p) => `${s.nombre}: ${p}`));
  if (problemas.length > 0) {
    console.error('Meta rechazaría esto. Corrige el script antes de sembrar:\n');
    problemas.forEach((p) => console.error('  ✗ ' + p));
    process.exit(1);
  }

  console.log(`Sembrando ${SEMILLAS.length} plantillas como borrador…\n`);
  let creadas = 0, actualizadas = 0, publicadas = 0;

  for (const s of SEMILLAS) {
    const [existe] = await db.select({ id: whatsappPlantillas.id, borrador: whatsappPlantillas.borrador })
      .from(whatsappPlantillas)
      .where(eq(whatsappPlantillas.nombre, s.nombre))
      .limit(1);

    if (existe && !existe.borrador) {
      console.log(`  ! ${s.nombre.padEnd(28)} ya está en Meta — sin tocar`);
      publicadas++;
      continue;
    }

    if (existe) {
      await db.update(whatsappPlantillas)
        .set({
          cuerpo: s.cuerpo, encabezado: s.encabezado, pie: s.pie,
          boton: s.boton ?? null,
          variables: s.variables, actualizadoEn: new Date(),
        })
        .where(eq(whatsappPlantillas.id, existe.id));
      console.log(`  ↻ ${s.nombre.padEnd(28)} borrador actualizado`);
      actualizadas++;
      continue;
    }

    await db.insert(whatsappPlantillas).values({
      nombre: s.nombre,
      idioma: 'es',            // 'es', nunca 'es_DO': ese locale no existe en Meta
      categoria: 'utility',    // transaccional; 'marketing' exige opt-in y se bloquea de un toque
      cuerpo: s.cuerpo,
      encabezado: s.encabezado,
      pie: s.pie,
      boton: s.boton ?? null,
      teamId: null,            // de la plataforma, no de un colegio
      borrador: true,
      variables: s.variables,
    });
    console.log(`  ✓ ${s.nombre.padEnd(28)} creada  → ${s.para}`);
    creadas++;
  }

  /**
   * Y qué plantilla usa cada aviso, por defecto para toda la plataforma.
   *
   * Dos por hueco: la de siempre y la del botón «Ver factura». El motor elige
   * según el cargo tenga factura o no — sin factura no se puede cobrar, así que
   * el enlace ahí lleva al padre a transferir para que nadie pueda aplicarlo.
   *
   * Se siembra aquí y no a mano porque es la mitad que hace que lo anterior
   * sirva: cinco plantillas creadas y ningún aviso apuntando a ellas es lo
   * mismo que no tener nada.
   */
  console.log('\nAsignando los avisos…');
  for (const s of BASE) {
    const conLink = `${s.nombre}_con_boton`;
    const tieneGemela = SEMILLAS.some((x) => x.nombre === conLink);
    await db
      .insert(whatsappPlantillasAviso)
      .values({
        teamId: null,
        aviso: s.para,
        plantillaNombre: s.nombre,
        plantillaConLink: tieneGemela ? conLink : null,
        idioma: 'es',
      })
      .onConflictDoNothing();
    console.log(`  ${s.para.padEnd(22)} ${s.nombre}${tieneGemela ? `  ·  con factura → ${conLink}` : ''}`);
  }

  console.log(`\n${creadas} creada(s), ${actualizadas} actualizada(s), ${publicadas} ya en Meta.`);
  if (creadas + actualizadas > 0) {
    console.log('\nSiguen siendo borradores: Meta todavía no las conoce.');
    console.log('Revisa el texto en /admin/whatsapp/plantillas y publícalas una a una.');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
