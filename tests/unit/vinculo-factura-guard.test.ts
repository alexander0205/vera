import { describe, it, expect } from 'vitest';
import { validarFacturaDeTutor } from '@/lib/administracion-escolar/vinculo-factura-guard';

/**
 * Enlazar factura↔cargo: se acepta la factura de cualquier tutor del alumno,
 * no solo el responsable de pago. Caso real Mi Casita (Keiner Tejeda): papá
 * responsable, mamá tutor secundario — ambos pagaron facturas distintas.
 */
describe('validarFacturaDeTutor', () => {
  const RESPONSABLE = 100; // papá (facturar_a_client_id)
  const SECUNDARIO = 200;  // mamá (tutor secundario)
  const AJENO = 999;       // contacto que no es tutor del niño

  it('factura del responsable de pago → ok', () => {
    expect(validarFacturaDeTutor({
      facturaClientId: RESPONSABLE, responsableClientId: RESPONSABLE, tutorClientIds: [RESPONSABLE, SECUNDARIO],
    })).toEqual({ ok: true });
  });

  it('factura del TUTOR SECUNDARIO → ok (lo que antes rechazaba)', () => {
    expect(validarFacturaDeTutor({
      facturaClientId: SECUNDARIO, responsableClientId: RESPONSABLE, tutorClientIds: [RESPONSABLE, SECUNDARIO],
    })).toEqual({ ok: true });
  });

  it('factura de un contacto ajeno al niño → rechaza', () => {
    const r = validarFacturaDeTutor({
      facturaClientId: AJENO, responsableClientId: RESPONSABLE, tutorClientIds: [RESPONSABLE, SECUNDARIO],
    });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining('no es tutor') });
  });

  it('tutor secundario aunque el responsable de pago sea null', () => {
    expect(validarFacturaDeTutor({
      facturaClientId: SECUNDARIO, responsableClientId: null, tutorClientIds: [SECUNDARIO],
    })).toEqual({ ok: true });
  });

  it('sin responsable ni tutores → rechaza', () => {
    const r = validarFacturaDeTutor({
      facturaClientId: RESPONSABLE, responsableClientId: null, tutorClientIds: [],
    });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining('no tiene responsable') });
  });

  it('factura sin cliente (null) → rechaza', () => {
    expect(validarFacturaDeTutor({
      facturaClientId: null, responsableClientId: RESPONSABLE, tutorClientIds: [RESPONSABLE],
    }).ok).toBe(false);
  });

  it('ignora clientIds null en la lista de tutores', () => {
    expect(validarFacturaDeTutor({
      facturaClientId: SECUNDARIO, responsableClientId: RESPONSABLE, tutorClientIds: [null, SECUNDARIO, null],
    })).toEqual({ ok: true });
  });
});
