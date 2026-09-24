import type { MetadataRoute } from 'next';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';

/**
 * Qué puede recorrer un buscador —y los buscadores con IA, que hoy traen tanta
 * gente como Google.
 *
 * Se abre el sitio público entero y se cierra la aplicación: dentro no hay nada
 * que indexar —todo pide sesión— y dejarlo abierto solo gasta rastreo y llena
 * los resultados de pantallas de inicio de sesión.
 *
 * Las rutas con secreto en la dirección NO se listan aquí a propósito.
 * `robots.txt` es público: escribir `/pagar/` es publicar que existe. No están
 * enlazadas desde ningún sitio, que es lo que de verdad las mantiene fuera.
 *
 * Los rastreadores de IA van NOMBRADOS uno por uno aunque la regla `*` ya los
 * cubra. Dos razones: deja por escrito que los queremos —el día que alguien
 * ponga un bloqueo general, estas líneas obligan a decidir a mano— y separa los
 * dos permisos que la gente confunde:
 *
 *  · `OAI-SearchBot` es el que mete el sitio en las respuestas de ChatGPT.
 *    Respeta robots.txt: bloquearlo es desaparecer de ahí.
 *  · `GPTBot` es el de entrenamiento. Se permite a propósito: que el modelo
 *    sepa qué es Zero es exactamente lo que queremos cuando a alguien le
 *    preguntan por un ERP dominicano.
 *  · `ChatGPT-User` entra cuando una persona pide algo en ChatGPT. Ese NO
 *    respeta robots.txt —lo dice OpenAI— así que la línea es informativa.
 */
const RASTREADORES_IA = [
  'OAI-SearchBot',      // ChatGPT · búsqueda
  'ChatGPT-User',       // ChatGPT · a petición de una persona
  'GPTBot',             // OpenAI · entrenamiento
  'ClaudeBot',          // Anthropic
  'Claude-SearchBot',   // Anthropic · búsqueda
  'PerplexityBot',      // Perplexity
  'Perplexity-User',
  'Google-Extended',    // Gemini
  'Applebot-Extended',  // Apple Intelligence
  'Bingbot',            // Bing y Copilot
  'Amazonbot',
  'meta-externalagent',
];

const FUERA_DE_LIMITES = [
  '/api/', '/dashboard/', '/admin/', '/pos/', '/nomina/', '/contabilidad/',
  '/escolar/', '/cuenta/', '/zero-tickets/', '/sign-in', '/sign-up',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: FUERA_DE_LIMITES },
      ...RASTREADORES_IA.map(userAgent => ({ userAgent, allow: '/', disallow: FUERA_DE_LIMITES })),
    ],
    sitemap: new URL('/sitemap.xml', SITIO_PUBLICO).toString(),
    host: SITIO_PUBLICO,
  };
}
