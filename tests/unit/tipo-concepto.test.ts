import { describe, it, expect } from 'vitest';
import {
  ETIQUETA_TIPO, PISTA_TIPO, TIPOS_DE_CONCEPTO, becaPorDefecto, esTipoDeConcepto,
} from '@/lib/administracion-escolar/tipo-concepto';

/**
 * Qué es un cobro, separado de cada cuánto se cobra.
 *
 * El fallo real: el interruptor «Se cobra varias veces al año» escribía
 * `frecuencia` y `tipo` a la vez, así que una evaluación cobrada en tres pagos
 * quedaba guardada como colegiatura — y con `tipo='mensualidad'` la
 * facturación del mes la trata como LA mensualidad de ese mes.
 */

describe('los tipos', () => {
  it('son los cinco que acepta la ruta de conceptos', () => {
    // Misma lista que `TIPOS` en app/api/administracion-escolar/conceptos/[id]/route.ts.
    expect([...TIPOS_DE_CONCEPTO].sort())
      .toEqual(['actividad', 'inscripcion', 'mensualidad', 'otro', 'uniforme']);
  });

  it('todos tienen nombre y pista: el desplegable no puede salir con un hueco', () => {
    for (const t of TIPOS_DE_CONCEPTO) {
      expect(ETIQUETA_TIPO[t]).toBeTruthy();
      expect(PISTA_TIPO[t]).toBeTruthy();
    }
  });

  it('la colegiatura se dice «Colegiatura», no «mensualidad»', () => {
    expect(ETIQUETA_TIPO.mensualidad).toBe('Colegiatura');
  });

  it('reconoce lo que es un tipo y lo que no', () => {
    expect(esTipoDeConcepto('actividad')).toBe(true);
    expect(esTipoDeConcepto('mensualidad')).toBe(true);
    // Lo que se guardó mal o se quedó viejo no se da por bueno: la pantalla lo
    // enseña como «Otro cobro» en vez de dejar el desplegable en blanco.
    expect(esTipoDeConcepto('colegiatura')).toBe(false);
    expect(esTipoDeConcepto('')).toBe(false);
    expect(esTipoDeConcepto(undefined)).toBe(false);
    expect(esTipoDeConcepto(null)).toBe(false);
  });
});

describe('becaPorDefecto', () => {
  it('solo la colegiatura admite beca', () => {
    expect(becaPorDefecto('mensualidad')).toBe(true);
  });

  /*
   * Antes la beca colgaba del interruptor de recurrencia: encenderlo la ponía
   * en sí. Una evaluación trimestral nacía descontando beca sin que nadie lo
   * pidiera.
   */
  it('lo que se repite durante el año ya no admite beca por repetirse', () => {
    expect(becaPorDefecto('actividad')).toBe(false);
    expect(becaPorDefecto('inscripcion')).toBe(false);
    expect(becaPorDefecto('uniforme')).toBe(false);
    expect(becaPorDefecto('otro')).toBe(false);
  });
});
