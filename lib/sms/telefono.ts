/**
 * Normalización de teléfonos a E.164 para SMS.
 *
 * El origen es `admin_escolar_tutores.telefono`: un varchar(30) escrito a mano
 * por secretaría. Ahí adentro hay de todo — guiones, paréntesis, dos números en
 * la misma casilla, "no tiene", extensiones. Cada SMS que sale cuesta dinero y
 * un número reconstruido a medias no llega a nadie, así que la regla es una
 * sola: **ante la duda, null**. El llamador reporta "teléfono inválido" y un
 * humano lo arregla; eso es infinitamente más barato que adivinar.
 *
 * Función pura, sin DB ni red: se puede probar sin tocar AWS.
 */

/**
 * Códigos de área que el NANP asignó a República Dominicana. Son estos tres y
 * nada más; si aparece un cuarto algún día, esta es la única línea que cambia.
 */
const AREAS_RD = new Set(['809', '829', '849']);

/** Máximo de dígitos que admite E.164 (sin contar el '+'). */
const MAX_DIGITOS_E164 = 15;
/** Mínimo razonable para un número internacional completo (país + abonado). */
const MIN_DIGITOS_E164 = 8;

/**
 * ¿Los 10 dígitos tienen forma de número NANP real?
 * NPA (área) y NXX (central) tienen que empezar en 2-9, y el área no puede ser
 * N11 (911, 411…). Esto descarta de un tiro los rellenos tipo 809-000-0000 y
 * 809-111-1111 que la gente mete para pasar un formulario obligatorio.
 */
function esNanpValido(diezDigitos: string): boolean {
  if (diezDigitos.length !== 10) return false;
  const area = diezDigitos.slice(0, 3);
  const central = diezDigitos.slice(3, 6);
  if (!/^[2-9]/.test(area)) return false;
  if (area[1] === '1' && area[2] === '1') return false;
  if (!/^[2-9]/.test(central)) return false;
  return true;
}

/**
 * Devuelve el número en E.164 (`+18095551234`) o `null` si no se puede afirmar
 * con certeza cuál es el número.
 *
 * Acepta:
 *   - 10 dígitos con área dominicana:      `8095551234`, `809-555-1234`, `(809) 555 1234`
 *   - 11 dígitos con el 1 del país:        `18095551234`, `1 809 555 1234`
 *   - forma internacional explícita:       `+18095551234`, `+50912345678`, `0018095551234`
 *
 * Rechaza (a propósito):
 *   - 7 dígitos sin área — no sabemos si es 809, 829 o 849
 *   - 10 dígitos con área NANP que no es dominicana y sin país explícito
 *   - dos números en la misma casilla — sobran dígitos, no elegimos uno
 *   - cualquier cosa con letras: "no tiene", "s/n", "809-555-1234 ext 12"
 */
export function normalizarTelefono(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const bruto = entrada.trim();
  if (!bruto) return null;

  // Una sola letra descalifica el campo completo. En una extensión ("ext 12")
  // los dígitos de la extensión se pegarían al número y saldría un E.164 que no
  // existe; en "no tiene" no hay nada que salvar. Cortar aquí es lo correcto.
  if (/[a-zA-ZÀ-ÿ]/.test(bruto)) return null;

  // El '+' solo cuenta al inicio. Si aparece en el medio es que hay dos números
  // en la casilla, y eso lo caza igual el conteo de dígitos de más abajo.
  const masExplicito = bruto.startsWith('+');
  let cuerpo = bruto.replace(/\D/g, '');
  if (!cuerpo) return null;

  // Prefijos de marcación internacional escritos a mano ('011' en el NANP, '00'
  // en el resto del mundo). Ninguno puede confundirse con un número local
  // dominicano, que siempre empieza en 8, así que quitarlos es seguro.
  let prefijoInternacional = false;
  if (!masExplicito && cuerpo.startsWith('011') && cuerpo.length > 11) {
    cuerpo = cuerpo.slice(3);
    prefijoInternacional = true;
  } else if (!masExplicito && cuerpo.startsWith('00') && cuerpo.length > 10) {
    cuerpo = cuerpo.slice(2);
    prefijoInternacional = true;
  }

  // ── Camino NANP (RD, EE.UU., Canadá, el resto del +1) ────────────────────
  // 11 dígitos que empiezan en 1 son inequívocos: país + 10. 10 dígitos son la
  // forma local de aquí.
  const nanp =
    cuerpo.length === 11 && cuerpo.startsWith('1') ? cuerpo.slice(1)
    : cuerpo.length === 10                         ? cuerpo
    : null;

  if (nanp !== null) {
    if (!esNanpValido(nanp)) return null;
    // Sin país declarado solo aceptamos áreas dominicanas. Un `2125551234` suelto
    // en la ficha de un colegio de aquí es mucho más probable que sea un tecleo
    // malo que un número de Manhattan, y no nos toca decidir cuál.
    const declaroPais = masExplicito || prefijoInternacional || cuerpo.length === 11;
    if (!declaroPais && !AREAS_RD.has(nanp.slice(0, 3))) return null;
    return `+1${nanp}`;
  }

  // ── Camino internacional (todo lo que no es +1) ───────────────────────────
  // Solo con un '+' escrito de verdad. No basta un '00'/'011' al frente: ahí ya
  // estaríamos interpretando cómo quiso escribirlo la persona, y si lo que queda
  // no arma un NANP (arriba) lo más probable es que sea un número incompleto.
  // Con '+' sí confiamos en el código de país declarado — no validamos la forma
  // de cada país, pero exigimos que quepa en un E.164.
  if (!masExplicito) return null;
  // Un +1 tiene que ser exactamente 11 dígitos; si llegó aquí, no lo era.
  if (cuerpo.startsWith('1')) return null;
  if (cuerpo.length < MIN_DIGITOS_E164 || cuerpo.length > MAX_DIGITOS_E164) return null;
  if (cuerpo.startsWith('0')) return null; // ningún código de país empieza en 0

  return `+${cuerpo}`;
}

/**
 * ¿El E.164 ya normalizado es dominicano? Sirve para estimar costo: SNS cobra
 * distinto por destino y un número de fuera puede salir mucho más caro.
 */
export function esTelefonoRd(e164: string): boolean {
  return /^\+1\d{10}$/.test(e164) && AREAS_RD.has(e164.slice(2, 5));
}
