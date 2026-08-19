/**
 * Volver al login sin saber por qué es un fallo, no un detalle.
 *
 * Pasó de verdad: alguien se registró con su correo, verificó bien —la cuenta
 * quedó `email_verified = true` y el token con `used_at` a los 22 segundos— y
 * al abrir el correo otra vez y pulsar el enlace acabó en `/sign-in` con la
 * pantalla pelada. Sin una palabra. Conclusión razonable de quien lo vive: «el
 * registro falló».
 *
 * Eran dos fallos encadenados:
 *
 *   1. `verify-email` filtraba por `usedAt IS NULL`, así que un enlace YA USADO
 *      no aparecía en la consulta y caía en la misma rama que uno caducado. Un
 *      segundo clic —abrir el correo otra vez, lo más normal del mundo— decía
 *      «expiró».
 *   2. `MOTIVOS` en la pantalla de acceso solo traducía los códigos de Google.
 *      `expired`, `invalid` e `invitacion_invalida` llegaban sin traducción, así
 *      que no se pintaba nada. Es justo el fallo que el comentario del archivo
 *      describe y que ya se había arreglado… solo para Google.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz  = join(__dirname, '..', '..');
const login = readFileSync(join(raiz, 'app/(login)/login.tsx'), 'utf8');
const ruta  = readFileSync(join(raiz, 'app/api/auth/verify-email/route.ts'), 'utf8');

/** Los códigos que alguna redirección puede poner en la URL del login. */
const CODIGOS_DE_ERROR = [
  'google_no_disponible', 'google_2fa', 'google_perfil',
  'google_state', 'google_caducado', 'google',
  'expired', 'invalid', 'invitacion_invalida',
];

describe('todo código que llega al login tiene mensaje', () => {
  it.each(CODIGOS_DE_ERROR)('«%s» está traducido', (codigo) => {
    expect(login).toMatch(new RegExp(`\\b${codigo}:\\s*['"]`));
  });

  it('el aviso de "ya verificado" no se pinta como error', () => {
    expect(login).toContain('ya_verificado');
    // En verde, y con role="status": no ha fallado nada.
    expect(login).toContain('role="status"');
    expect(login).toMatch(/emerald/);
  });

  it('los errores siguen siendo errores, con role="alert"', () => {
    expect(login).toContain('role="alert"');
  });
});

describe('verify-email distingue los tres finales', () => {
  it('ya no filtra por usedAt: sin ver el usado no se puede distinguir', () => {
    expect(ruta).not.toContain('isNull(emailVerificationTokens.usedAt)');
  });

  it('un enlace ya usado no se llama "expirado"', () => {
    const iUsado = ruta.indexOf('record.usedAt');
    const iExpira = ruta.indexOf('record.expiresAt');
    expect(iUsado).toBeGreaterThan(-1);
    // La rama de "ya usado" va ANTES de la de caducado, o nunca se alcanzaría.
    expect(iUsado).toBeLessThan(iExpira);
    expect(ruta).toContain('aviso=ya_verificado');
  });

  it('token inexistente es "invalid", no "expired"', () => {
    expect(ruta).toMatch(/if \(!record\)[\s\S]{0,120}error=invalid/);
  });

  it('un token vivo sigue verificando y llevando a /bienvenida', () => {
    expect(ruta).toContain('emailVerified: true');
    expect(ruta).toContain('/bienvenida?verificado=1');
  });
});
