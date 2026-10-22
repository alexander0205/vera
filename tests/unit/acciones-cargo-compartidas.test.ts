/**
 * Las acciones de un cargo son UN solo código para las dos fichas.
 *
 * La ficha de la familia enseña los mismos cargos que la del alumno, pero en su
 * columna «Acción» solo se podía cobrar. Todo lo demás —mora, correo, WhatsApp,
 * vincular, anular, ver la factura— vivía suelto dentro de la ficha del alumno:
 * el menú incrustado en la pantalla del período y, en la página, catorce
 * estados, siete funciones y siete diálogos. Y la familia ya tenía su propia
 * copia del cobro, con su modal y su refresco.
 *
 * Igualarlas copiando era tener dos cobros, dos anulaciones y dos moras que
 * mantener iguales a mano. Ahora hay una función con las reglas, un menú y un
 * hook, y las dos páginas usan los tres.
 *
 * Esta prueba lee el fuente para que no vuelva a nacer una copia: un menú
 * redefinido en una pantalla, un `fetch` de cobro en una página, o unos
 * diálogos que alguien se olvidó de pintar —y entonces el menú sale y sus
 * acciones no hacen nada, sin ningún error—.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCIONES_DE_CARGO } from '@/lib/administracion-escolar/acciones-cargo';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const menu     = lee('components/administracion-escolar/CargoActionsMenu.tsx');
const hook     = lee('components/administracion-escolar/useAccionesDeCargo.tsx');
const periodo  = lee('components/administracion-escolar/PeriodoDetalle.tsx');
const tarjetas = lee('components/administracion-escolar/PeriodosDeLaFamilia.tsx');
const ficha    = lee('app/escolar/estudiantes/[id]/_perfil-client.tsx');
const familia  = lee('app/escolar/responsables/[id]/_perfil-client.tsx');
const ruta     = lee('app/api/administracion-escolar/responsables/[id]/periodos/route.ts');

const veces = (texto: string, trozo: string) => texto.split(trozo).length - 1;

describe('el menú ⋮ de un cargo vive en un solo archivo', () => {
  it('la pantalla del período ya no lo define: lo importa', () => {
    expect(periodo).not.toMatch(/function CargoActionsMenu/);
    expect(periodo).toContain("import { CargoActionsMenu } from './CargoActionsMenu';");
  });

  it('la tabla de la familia importa ese mismo archivo y lo monta', () => {
    expect(tarjetas).not.toMatch(/function CargoActionsMenu/);
    expect(tarjetas).toContain("import { CargoActionsMenu } from './CargoActionsMenu';");
    expect(tarjetas).toContain('<CargoActionsMenu');
  });

  it('no depende de la pantalla del período: la familia no se la lleva entera', () => {
    expect(menu).toMatch(/export function CargoActionsMenu</);
    expect(menu).not.toContain('PeriodoDetalle');
  });
});

describe('qué acciones salen lo decide la función pura, no el menú', () => {
  it('el menú se las pregunta y no vuelve a mirar el estado del cargo', () => {
    expect(menu).toContain('accionesDeCargo(');
    expect(menu).not.toContain('.includes(cargo.estado)');
  });

  it('cada una de las trece tiene su ítem: ninguna se queda sin pintar', () => {
    for (const clave of ACCIONES_DE_CARGO) {
      expect(menu).toContain(`a.has('${clave}')`);
    }
  });

  it('los ítems van en el mismo orden que la lista, una vez cada uno', () => {
    const pintadas = [...menu.matchAll(/a\.has\('([a-z-]+)'\)/g)].map((m) => m[1]);
    expect(pintadas).toEqual([...ACCIONES_DE_CARGO]);
  });
});

describe('la familia monta el menú con los manejadores de la ficha del alumno', () => {
  it('los ocho que comparten salen de `acciones` en las dos pantallas', () => {
    for (const nombre of [
      'onRegistrarPago', 'onAplicarMora', 'onVerFactura', 'onVincular',
      'onAnular', 'onAnularFactura', 'onEnviarCorreo', 'onReenviarAviso',
    ]) {
      expect(ficha).toContain(`${nombre}={acciones.${nombre}}`);
      expect(tarjetas).toContain(`${nombre}={acciones.${nombre}}`);
    }
  });

  it('le pasa el permiso de gestionar: sin él no saldrían WhatsApp ni «Anular cargo»', () => {
    expect(tarjetas).toContain('puedeGestionar={puedeGestionar}');
    expect(familia).toContain("permissions.includes('administracion-escolar:gestionar')");
    expect(familia).toContain('puedeGestionar={puedeGestionar}');
  });

  it('no deja anular la mensualidad suelta de un mes que ya tiene factura', () => {
    expect(tarjetas).toContain('mesTieneFactura={mesYaFacturado(');
    expect(tarjetas).toMatch(/const mesesFacturados = mesesConFactura\(cargos\.flatMap\(/);
  });

  it('la columna de acción está siempre, también para quien solo puede mirar', () => {
    expect(tarjetas).not.toContain('conCobro');
    expect(tarjetas).not.toMatch(/&& <Box sx=\{\{ \.\.\.ENCABEZADO, textAlign: 'right' \}\}>Acción<\/Box>/);
  });
});

describe('«Cobrar» sigue a la vista en la familia, y no es otro cobro', () => {
  it('el botón verde está, con la condición de siempre', () => {
    expect(tarjetas).toContain('<Wallet size={12} />Cobrar');
    expect(tarjetas).toContain('{puedePagos && f.ecfDocumentId != null && f.saldoCentavos > 0 && (');
  });

  it('llama al mismo manejador que «Registrar pago» del menú', () => {
    expect(tarjetas).toContain('onClick={() => acciones.onRegistrarPago(f.ecfDocumentId!)}');
    expect(tarjetas).toContain('onRegistrarPago={acciones.onRegistrarPago}');
    expect(tarjetas).not.toContain('onCobrar');
    expect(familia).not.toContain('onCobrar');
  });

  it('la página de la familia ya no guarda su copia del cobro', () => {
    for (const resto of ['PagoModal', 'pagoCuenta', 'cargandoPago', 'abrirPago']) {
      expect(familia).not.toContain(resto);
    }
    // Ni la tabla: el modal lo abre el hook, que es quien lo pinta.
    expect(tarjetas).not.toContain('<PagoModal');
    expect(tarjetas).not.toMatch(/import[^\n]*PagoModal/);
  });
});

describe('la columna de acción se alcanza aunque la tabla no quepa', () => {
  it('la tabla de cargos se desplaza de lado en vez de quedar recortada', () => {
    // El trozo que va de las pistas de la rejilla de cargos a su cabecera.
    const desde = tarjetas.indexOf("'92px 92px 132px 96px',");
    const hasta = tarjetas.indexOf('<Box sx={ENCABEZADO}>Concepto</Box>', desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    expect(tarjetas.slice(desde, hasta)).toContain("overflowX: 'auto'");
  });
});

describe('las dos páginas usan el mismo hook y no guardan nada suyo', () => {
  const paginas = [['la ficha del alumno', ficha], ['la ficha de la familia', familia]] as const;

  it('las dos lo llaman y pintan sus diálogos exactamente una vez', () => {
    for (const [nombre, fuente] of paginas) {
      expect(veces(fuente, 'useAccionesDeCargo('), nombre).toBe(1);
      expect(veces(fuente, '{dialogos}'), nombre).toBe(1);
    }
  });

  it('ninguna vuelve a hacer por su cuenta lo que hace el hook', () => {
    const delHook = [
      'nota-debito-mora',
      '/api/cuentas-por-cobrar/',
      'function ConfirmarAnularDialog',
      '}/anular`',
      '}/email`',
    ];
    for (const trozo of delHook) {
      expect(hook).toContain(trozo);
      for (const [nombre, fuente] of paginas) {
        expect(fuente.includes(trozo), `${nombre} contiene «${trozo}»`).toBe(false);
      }
    }
  });
});

describe('anular no deja bloqueado el diálogo del cargo siguiente', () => {
  // En la familia refrescar son dos consultas seguidas. Esperándolas con la
  // bandera de «anulando» todavía puesta, quien anulaba dos cargos duplicados
  // abría el diálogo del segundo y lo encontraba diciendo «Anulando…», sin
  // poder cancelar, como si ya se estuviera anulando sin haberlo confirmado.

  /** Lo que hace el hook desde que avisa del éxito hasta su `catch`. */
  const trasElExito = (aviso: string) => {
    const desde = hook.indexOf(aviso);
    const hasta = hook.indexOf('} catch', desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    return hook.slice(desde, hasta);
  };

  it('tras anular un cargo cierra el diálogo y refresca sin esperar', () => {
    const trozo = trasElExito("toast.success('Cargo anulado');");
    expect(trozo).toContain('setCargoAnular(null);');
    expect(trozo).toContain('void onCambio();');
    expect(trozo).not.toContain('await onCambio()');
  });

  it('tras anular una factura, lo mismo', () => {
    const trozo = trasElExito("toast.success('Factura anulada');");
    expect(trozo).toContain('setFacturaAnular(null);');
    expect(trozo).toContain('void onCambio();');
    expect(trozo).not.toContain('await onCambio()');
  });

  it('la bandera se suelta en el `finally`, que ya no espera a nadie', () => {
    expect(hook).toMatch(/\} finally \{\s*setAnulando\(false\);\s*\}/);
    expect(hook).toMatch(/\} finally \{\s*setAnulandoFactura\(false\);\s*\}/);
  });
});

describe('la ruta de la familia manda lo que el menú necesita', () => {
  it('el estado ante la DGII: sin él «Emitir en DGII» saldría en toda factura', () => {
    expect(ruta).toContain('facturaEstado: c.facturaEstado');
  });

  it('el tipo del concepto: con él se sabe si el mes ya tiene factura', () => {
    expect(ruta).toContain('conceptoTipo: c.conceptoTipo');
  });

  it('un previsto los lleva también, vacío el de la factura', () => {
    expect(ruta).toContain('conceptoTipo: p.tipo');
    expect(ruta).toContain('facturaEstado: null');
  });
});

describe('la familia refresca sus dos consultas en orden', () => {
  it('primero los meses —la única que sincroniza saldos— y después la cabecera', () => {
    expect(familia).toMatch(new RegExp([
      'const refrescar = useCallback\\(async \\(\\) => \\{',
      '\\s*await revalidar\\(`/api/administracion-escolar/responsables/\\$\\{clientId\\}/periodos`\\);',
      '\\s*await revalidar\\(`/api/administracion-escolar/responsables/\\$\\{clientId\\}`\\);',
      '\\s*\\}, \\[clientId\\]\\);',
    ].join('\\n')));
  });

  it('es lo que el hook llama después de cada acción, y lo que usa el cajón de facturar', () => {
    expect(familia).toContain('onCambio: refrescar');
    expect(familia).toContain('void refrescar();');
    // Ningún refresco suelto en paralelo: todos pasan por `refrescar`.
    expect(familia).not.toContain('void revalidar(');
  });
});
