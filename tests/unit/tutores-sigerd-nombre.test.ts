/**
 * El PDF de SIGERD a veces corre los teléfonos a la columna del nombre: con
 * CEMM (29-oct-2026) salió un «tutor» llamado «143-880675 (849) 537-4954 809
 * 709-0051». Eso no se guarda como persona.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('esNombreDePersona', async () => {
  const { esNombreDePersona } = await import('@/lib/sigerd/tutores-desde-sigerd');

  it('acepta nombres de verdad, también pegados o en mayúsculas', () => {
    expect(esNombreDePersona('Vanessa Arias Capellan')).toBe(true);
    expect(esNombreDePersona('WILSON RADHAMESMORISGARCIA')).toBe(true);
    expect(esNombreDePersona('Gadiel Henríquez')).toBe(true);
  });

  it('reconoce a la misma persona aunque el PDF pegue el nombre', async () => {
    const { claveDeNombre } = await import('@/lib/sigerd/tutores-desde-sigerd');
    expect(claveDeNombre('AMANDAJAVIERACOSTA')).toBe(claveDeNombre('Amanda Javier Acosta'));
    expect(claveDeNombre('Gadiel Henríquez')).toBe(claveDeNombre('GADIEL HENRIQUEZ'));
    expect(claveDeNombre('Ana Pérez')).not.toBe(claveDeNombre('Ana Peralta'));
  });

  it('rechaza teléfonos y restos sin letras', () => {
    expect(esNombreDePersona('143-880675 (849) 537-4954 809 709-0051')).toBe(false);
    expect(esNombreDePersona('809 555')).toBe(false);
    expect(esNombreDePersona('N/A')).toBe(false);
  });
});
