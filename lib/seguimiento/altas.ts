/**
 * Seguimiento automático de quien empezó a registrarse y se quedó a medias.
 *
 * En octubre de 2026, de seis cuentas nuevas solo dos terminaron el alta, y a
 * las otras se les escribió a mano días después. Esto lo hace solo: a las 24
 * horas, UN correo personal —de Alexander, no de «noreply»— según dónde se
 * quedó la persona:
 *
 *  - no confirmó el correo  → un enlace nuevo para confirmarlo (el primero ya
 *    caducó) y la pregunta de qué venía a resolver;
 *  - no puso el RNC          → que con el RNC el sistema completa el resto;
 *  - no terminó (tamaño o el último paso) → que su cuenta sigue guardada y
 *    sigue donde iba.
 *
 * Reglas para no ser pesados:
 *  - Un solo correo por empresa, nunca otro (se apunta en `audit_logs`,
 *    acción `SEGUIMIENTO_ALTA`).
 *  - Solo a quien FUNDÓ la empresa (no a los invitados) y no a las cuentas
 *    internas (admin de la plataforma).
 *  - Entre 24 horas y 7 días después del registro: antes es insistir, después
 *    ya no se acuerda.
 *  - Solo registros desde `DESDE`: a los anteriores ya se les escribió a mano.
 *
 * Lo que decide quién y qué se dice vive aquí, en funciones puras; la ruta
 * `/api/cron/seguimiento-altas` lee la base, llama a esto y envía.
 */

export const DESDE = '2026-10-16';
export const ESPERA_HORAS = 24;
export const VENTANA_DIAS = 7;

export const REMITENTE = 'Alexander Ferreras <alexander@zero.com.do>';
export const RESPONDER_A = 'alexander@zero.com.do';

export type Etapa = 'sin-verificar' | 'sin-rnc' | 'sin-terminar';

export interface Candidato {
  teamId: number;
  userId: number;
  email: string;
  nombre: string | null;
  empresa: string | null;      // razón social o nombre comercial, si ya puso el RNC
  registro: Date;
  verificado: boolean;
  paso: number;                // `onboarding_paso`: 1 sin datos, 3 con RNC, 4 con tamaño
  completado: boolean;
  interno: boolean;
  yaContactado: boolean;       // ya tiene un SEGUIMIENTO_ALTA
}

/** Dónde se quedó. `null` = terminó el alta: no hay nada que decirle. */
export function etapaDeAlta(c: Pick<Candidato, 'verificado' | 'paso' | 'completado'>): Etapa | null {
  if (c.completado) return null;
  if (!c.verificado) return 'sin-verificar';
  if (c.paso < 3) return 'sin-rnc';
  return 'sin-terminar';
}

/** A quién le toca hoy, y con qué etapa. */
export function aQuienEscribir(candidatos: Candidato[], ahora: Date): { candidato: Candidato; etapa: Etapa }[] {
  const desde = new Date(`${DESDE}T00:00:00-04:00`).getTime();
  const minimo = ahora.getTime() - ESPERA_HORAS * 3_600_000;
  const maximo = ahora.getTime() - VENTANA_DIAS * 86_400_000;
  const salida: { candidato: Candidato; etapa: Etapa }[] = [];
  for (const c of candidatos) {
    const t = c.registro.getTime();
    if (c.interno || c.yaContactado) continue;
    if (t < desde || t > minimo || t < maximo) continue;
    const etapa = etapaDeAlta(c);
    if (etapa) salida.push({ candidato: c, etapa });
  }
  return salida;
}

/**
 * El nombre de pila, si parece un nombre. Con Google llega el nombre de la
 * cuenta, que a veces es un canal o una marca («Vídeos sorprendente HD»): ahí
 * es mejor un «Hola:» a secas que tratar a alguien por el nombre de su canal.
 */
export function nombreDePila(nombre: string | null): string | null {
  const primero = (nombre ?? '').trim().split(/\s+/)[0] ?? '';
  if (!primero || primero.length > 20) return null;
  if (!/^[\p{L}'-]+$/u.test(primero)) return null;
  if (/\b(hd|tv|oficial|official|team|ventas|admin|info)\b/i.test(nombre ?? '')) return null;
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

/** El correo, en texto plano: así se lee como lo que es, un correo de una persona. */
export function correoDeSeguimiento(
  etapa: Etapa,
  datos: { nombre: string | null; empresa: string | null; enlaceVerificar?: string; enlaceEntrar: string },
): { asunto: string; texto: string } {
  const pila = nombreDePila(datos.nombre);
  const saludo = pila ? `Hola, ${pila}:` : 'Hola:';
  const firma = 'Saludos,\nAlexander\nZero · zero.com.do';
  const ayuda =
    '¿Qué estabas buscando resolver? ¿Facturación electrónica, cuentas por cobrar, inventario, ' +
    'el cobro de un colegio u otra cosa? Cuéntame y te ayudo a dejarlo listo. Si te queda más ' +
    'fácil, respóndeme con tu WhatsApp y te escribo por ahí.';

  if (etapa === 'sin-verificar') {
    return {
      asunto: 'Te falta un paso para entrar a Zero',
      texto: [
        saludo,
        'Soy Alexander, de Zero. Vi que empezaste a crear tu cuenta pero no llegaste a confirmar tu correo (a veces el mensaje cae en no deseados).',
        `Aquí tienes un enlace nuevo para confirmarlo y entrar:\n${datos.enlaceVerificar ?? datos.enlaceEntrar}`,
        ayuda,
        firma,
      ].join('\n\n'),
    };
  }

  if (etapa === 'sin-rnc') {
    return {
      asunto: '¿Te ayudo a terminar tu cuenta de Zero?',
      texto: [
        saludo,
        'Soy Alexander, de Zero. Vi que creaste tu cuenta pero no llegaste a poner los datos de tu empresa. Con tu RNC, el sistema completa el resto solo.',
        `Tu cuenta sigue guardada; entra aquí y sigues donde ibas:\n${datos.enlaceEntrar}`,
        ayuda,
        firma,
      ].join('\n\n'),
    };
  }

  const de = datos.empresa ? ` de ${datos.empresa}` : '';
  return {
    asunto: `Tu cuenta${de} en Zero está casi lista`,
    texto: [
      saludo,
      `Soy Alexander, de Zero. Vi que estabas creando la cuenta${de} y te quedó muy poco para terminar.`,
      `Sigue guardada tal como la dejaste; entra aquí y terminas en un minuto:\n${datos.enlaceEntrar}`,
      ayuda,
      firma,
    ].join('\n\n'),
  };
}
