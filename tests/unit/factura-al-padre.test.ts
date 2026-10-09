import { describe, expect, it } from 'vitest';
import { elegirDestinatario } from '@/lib/administracion-escolar/factura-al-padre';

describe('elegirDestinatario', () => {
  it('el correo del responsable de pago manda sobre el del comprador', () => {
    expect(elegirDestinatario('madre@correo.com', 'otro@correo.com')).toBe('madre@correo.com');
  });

  it('sin correo de responsable cae al del comprador de la factura', () => {
    expect(elegirDestinatario(null, 'otro@correo.com')).toBe('otro@correo.com');
    expect(elegirDestinatario('', 'otro@correo.com')).toBe('otro@correo.com');
  });

  it('un correo mal escrito no cuenta: se prueba con el siguiente', () => {
    // Un `a@b` sin punto lo rechaza Resend y el pago quedaría sin su factura.
    expect(elegirDestinatario('madre@correo', 'otro@correo.com')).toBe('otro@correo.com');
  });

  it('quita los espacios de los bordes', () => {
    expect(elegirDestinatario('  madre@correo.com ', null)).toBe('madre@correo.com');
  });

  it('sin ninguno devuelve null', () => {
    expect(elegirDestinatario(null, undefined)).toBeNull();
    expect(elegirDestinatario('   ', 'xx')).toBeNull();
  });
});
