/**
 * Un gasto se puede guardar sin NCF.
 *
 * El dueño subió la factura de un contratista del exterior —cobra en dólares,
 * no tiene NCF ni RNC— y el formulario no lo dejaba guardar: «Escribe el NCF
 * del comprobante» y «Falta el RNC o la cédula del proveedor», en rojo.
 *
 * Sin NCF no es un NCF mal escrito al que se le perdona: es un estado con
 * nombre, el gasto sin comprobante fiscal. Se guarda, pero no va al 606, su
 * ITBIS va completo al costo y el RNC deja de ser obligatorio. Con NCF nada
 * cambia, y eso es lo que más se comprueba aquí.
 *
 * El formulario y el servidor no tienen pruebas propias (uno es un componente
 * y el otro toca la base), así que lo que se amarra es que los dos decidan con
 * la misma función pura y que esa función diga lo que tiene que decir.
 *
 * Los RNC y las cédulas de aquí son inventados a propósito con el dígito
 * verificador mal: no pueden ser los de nadie. A estas reglas solo les importa
 * cuántos dígitos tienen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analizarIdentificacion, analizarNcf, avisoRetencionSinNcf, itbisAlCostoPorDefecto, reglasComprobante, resumirCompra,
  type CompraPara606, type TipoProveedor,
} from '@/lib/compras/fiscal';
import { construirFormato606 } from '@/lib/compras/formato606';

const raiz = join(__dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

const RNC = '123456789';
const CEDULA = '12345678901';

interface Caso { clase?: 'compra' | 'gasto'; ncf?: string | null; tipoProveedor?: TipoProveedor; rnc?: string | null; nombre?: string | null; conInventario?: boolean }
// Por defecto, un gasto con todo en regla: B01, RNC y nombre de prueba.
const reglas = (c: Caso = {}) => reglasComprobante({
  clase: c.clase ?? 'gasto',
  ncf: analizarNcf('ncf' in c ? c.ncf : 'B0100000123'),
  tipoProveedor: c.tipoProveedor ?? 'juridica',
  id: analizarIdentificacion('rnc' in c ? c.rnc : RNC),
  nombre: 'nombre' in c ? c.nombre : 'PROVEEDOR DE PRUEBA SRL',
  conInventario: c.conInventario,
});

describe('sin NCF es un estado con nombre, no un NCF mal escrito', () => {
  it('vacío, espacios o nada: sin NCF, y sigue sin ser un comprobante válido', () => {
    for (const texto of ['', '   ', null, undefined]) {
      expect(analizarNcf(texto)).toMatchObject({ sinNcf: true, valido: false, ncf: '', daCreditoItbis: false, reporta606: false, esNota: false });
    }
  });

  it('un NCF a medias no es «sin NCF»: es un error', () => {
    expect(analizarNcf('B01123')).toMatchObject({ sinNcf: false, valido: false });
    expect(analizarNcf('B01123').error).toContain('11 caracteres');
  });

  it('un NCF de un tipo que no existe o que no sustenta compras tampoco', () => {
    expect(analizarNcf('B9900000001')).toMatchObject({ sinNcf: false, valido: false });
    expect(analizarNcf('B1600000001')).toMatchObject({ sinNcf: false, valido: false });
  });

  it('un NCF válido tampoco', () => {
    expect(analizarNcf('B0100000123')).toMatchObject({ sinNcf: false, valido: true });
  });
});

describe('con NCF todo sigue como estaba', () => {
  it('crédito fiscal con RNC y nombre: nada que objetar, va al 606 y da crédito', () => {
    expect(reglas()).toEqual({ gastoSinNcf: false, errorNcf: null, problemaRnc: null, faltaNombre: false, va606: true, itbisSinCredito: false });
  });

  it('el RNC es obligatorio: vacío o a medias, falta', () => {
    expect(reglas({ rnc: null }).problemaRnc).toBe('falta');
    expect(reglas({ rnc: '12345' }).problemaRnc).toBe('falta');
    expect(reglas({ rnc: CEDULA }).problemaRnc).toBeNull();
  });

  it('consumo: sigue pidiendo RNC, no va al 606 y su ITBIS va al costo', () => {
    expect(reglas({ ncf: 'B0200000001', rnc: null })).toMatchObject({ gastoSinNcf: false, problemaRnc: 'falta', va606: false, itbisSinCredito: true });
  });

  it('gasto menor: ni RNC ni nombre', () => {
    expect(reglas({ ncf: 'E430000000001', rnc: null, nombre: null })).toMatchObject({ errorNcf: null, problemaRnc: null, faltaNombre: false, va606: true, itbisSinCredito: true });
  });

  it('proveedor del exterior: el RNC no se pide ni se revisa', () => {
    expect(reglas({ ncf: 'B1700000001', tipoProveedor: 'exterior', rnc: null }).problemaRnc).toBeNull();
    expect(reglas({ ncf: 'B1700000001', tipoProveedor: 'exterior', rnc: '12345' }).problemaRnc).toBeNull();
  });

  it('un NCF escrito a medias bloquea, en gastos y en compras', () => {
    for (const clase of ['gasto', 'compra'] as const) {
      const r = reglas({ clase, ncf: 'B01123' });
      expect(r.errorNcf).toContain('11 caracteres');
      expect(r).toMatchObject({ gastoSinNcf: false, va606: false, itbisSinCredito: false });
    }
  });

  it('un NCF a medias sigue pidiendo el RNC: no se cuela como «sin NCF»', () => {
    expect(reglas({ ncf: 'B01123', rnc: null }).problemaRnc).toBe('falta');
  });

  it('el nombre del proveedor sigue obligatorio', () => {
    expect(reglas({ nombre: '  ' }).faltaNombre).toBe(true);
  });
});

describe('gasto sin NCF', () => {
  const sinNcf = { ncf: '', rnc: null, nombre: 'CONTRATISTA DE PRUEBA LLC' };

  it('se guarda sin NCF y sin RNC: no va al 606 y su ITBIS no da crédito', () => {
    expect(reglas(sinNcf)).toEqual({ gastoSinNcf: true, errorNcf: null, problemaRnc: null, faltaNombre: false, va606: false, itbisSinCredito: true });
  });

  it('da igual que el NCF llegue vacío, en blanco o que no llegue', () => {
    for (const ncf of ['', '   ', null]) expect(reglas({ ...sinNcf, ncf })).toMatchObject({ gastoSinNcf: true, errorNcf: null });
  });

  it('el RNC es opcional, pero lo que se escriba tiene que ser un RNC o una cédula', () => {
    expect(reglas({ ...sinNcf, rnc: '12345' }).problemaRnc).toBe('incompleto');
    expect(reglas({ ...sinNcf, rnc: RNC }).problemaRnc).toBeNull();
    expect(reglas({ ...sinNcf, rnc: CEDULA }).problemaRnc).toBeNull();
    // Al del exterior no se le revisa, como siempre: su identificación no es dominicana.
    expect(reglas({ ...sinNcf, tipoProveedor: 'exterior', rnc: '12345' }).problemaRnc).toBeNull();
  });

  it('el nombre del proveedor sigue obligatorio', () => {
    expect(reglas({ ...sinNcf, nombre: null }).faltaNombre).toBe(true);
  });

  it('todo el ITBIS va al costo, también en una empresa que cobra ITBIS', () => {
    expect(itbisAlCostoPorDefecto({ ncf: analizarNcf(''), regimenItbis: 'gravado', itbisCents: 1_800 })).toBe(1_800);
    const imp = { itbisFacturadoCents: 1_800, itbisAlCostoCents: 1_800, itbisRetenidoCents: 0, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0 };
    expect(resumirCompra(10_000, imp).itbisPorAdelantarCents).toBe(0);
  });

  // Antes esto se comprobaba buscando dos literales en el fuente de la ruta, que
  // seguían ahí aunque alguien añadiera otra consulta. La barrera está ahora
  // donde se puede ejecutar: quien arma el archivo descarta lo que no reporta.
  const conNcf: CompraPara606 = {
    rncProveedor: RNC, ncf: 'B0100000123', ncfModificado: null, tipoBienes: '02',
    fechaComprobante: '2026-01-15', fechaPago: '2026-01-15', montoServiciosCents: 100_000, montoBienesCents: 0,
    itbisFacturadoCents: 18_000, itbisRetenidoCents: 0, itbisProporcionalidadCents: 0, itbisAlCostoCents: 0,
    isrTipo: null, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0, formaPago: '2',
  };
  // Como quedaría el gasto del contratista si alguien lo colara: sin RNC, sin NCF y con su retención.
  const gastoSinNcf: CompraPara606 = { ...conNcf, rncProveedor: null, ncf: '', itbisAlCostoCents: 18_000, isrTipo: 3, isrRetenidoCents: 27_000 };

  it('no entra al 606: el archivo no escribe un renglón sin NCF, llegue como llegue', () => {
    for (const guardado of [null, '']) expect(analizarNcf(guardado)).toMatchObject({ valido: false, reporta606: false });
    const consumo: CompraPara606 = { ...conNcf, ncf: 'B0200000001' };
    const a = construirFormato606({ rncEmpresa: '987654321', periodo: '202601', compras: [gastoSinNcf, conNcf, consumo] });
    expect(a.registros).toBe(1);
    const [encabezado, ...renglones] = a.contenido.split('\r\n');
    expect(encabezado).toBe('606|987654321|202601|1');
    expect(renglones).toHaveLength(1);
    // Campo 1 (RNC) y campo 4 (NCF): ninguno vacío.
    for (const r of renglones) {
      const campos = r.split('|');
      expect(campos[0]).toBe(RNC);
      expect(campos[3]).toBe('B0100000123');
    }
  });

  it('con solo gastos sin NCF el archivo sale con cero registros', () => {
    const a = construirFormato606({ rncEmpresa: '987654321', periodo: '202601', compras: [gastoSinNcf, gastoSinNcf] });
    expect(a.registros).toBe(0);
    expect(a.contenido).toBe('606|987654321|202601|0');
  });
});

describe('lo que entra al inventario se compra con comprobante', () => {
  // `clase` viaja en el cuerpo de la petición. Si bastara con decir «gasto»,
  // una llamada directa a la API metería mercancía al inventario sin NCF.
  it('un «gasto» con una línea de producto pide NCF como una compra', () => {
    expect(reglas({ ncf: '', rnc: null, conInventario: true })).toMatchObject({
      gastoSinNcf: false, errorNcf: 'Escribe el NCF del comprobante', problemaRnc: 'falta', itbisSinCredito: false,
    });
  });

  it('con NCF las líneas de producto no cambian nada', () => {
    expect(reglas({ conInventario: true })).toEqual(reglas());
    expect(reglas({ ncf: 'B0200000001', conInventario: true })).toEqual(reglas({ ncf: 'B0200000001' }));
  });

  it('el servidor lo decide por las líneas, no por la etiqueta', () => {
    expect(leer('lib/compras/registrar.ts')).toContain('conInventario: Array.isArray(r.lineas) && r.lineas.some((l) => !!l?.productoId)');
  });
});

describe('retenciones anotadas en un gasto sin NCF', () => {
  it('se dice dónde no salen: en el 606, y tampoco en el 609 si es del exterior', () => {
    expect(avisoRetencionSinNcf('exterior')).toContain('no sale en el 606 ni en el 609');
    for (const tipo of ['juridica', 'fisica', 'informal', 'rst', null]) {
      const texto = avisoRetencionSinNcf(tipo);
      expect(texto).toContain('no sale en el 606:');
      expect(texto).not.toContain('609');
    }
  });

  it('y cuál es el camino que sí las reporta', () => {
    expect(avisoRetencionSinNcf('exterior')).toContain('pago al exterior (e47)');
    expect(avisoRetencionSinNcf('informal')).toContain('proveedor informal (e41)');
    expect(avisoRetencionSinNcf('juridica')).toContain('e41 o e47');
    for (const tipo of ['exterior', 'informal', 'juridica']) {
      expect(avisoRetencionSinNcf(tipo)).toContain('«Nuevo gasto»');
      // Es otro registro, no uno más: sin NCF nada detectaría el repetido.
      expect(avisoRetencionSinNcf(tipo)).toContain('en vez de este registro y no además');
    }
  });
});

describe('una compra de inventario sigue pidiendo NCF', () => {
  it('sin NCF bloquea con el mensaje de siempre', () => {
    expect(reglas({ clase: 'compra', ncf: '', rnc: null })).toMatchObject({ gastoSinNcf: false, errorNcf: 'Escribe el NCF del comprobante', problemaRnc: 'falta', itbisSinCredito: false });
  });
});

describe('el formulario y el servidor dicen lo mismo', () => {
  const servidor = leer('lib/compras/registrar.ts');
  const formulario = leer('app/(dashboard)/dashboard/compras/registrar/_registrar-client.tsx');
  const ruta = leer('app/api/compras/local/route.ts');

  it('los dos deciden con reglasComprobante, no cada uno por su cuenta', () => {
    expect(servidor).toContain('reglasComprobante(');
    expect(formulario).toContain('reglasComprobante(');
    expect(servidor).not.toContain("info.error ?? 'NCF inválido'");
    expect(formulario).not.toContain("ncfInfo.error ?? 'NCF inválido'");
  });

  it('y lo dicen con las mismas palabras', () => {
    for (const texto of [
      'Sin NCF el ITBIS no da crédito: va completo al costo',
      'El RNC o la cédula no está completo (9 u 11 dígitos): corrígelo o déjalo vacío',
    ]) {
      expect(servidor).toContain(texto);
      expect(formulario).toContain(texto);
    }
  });

  it('el aviso de las retenciones sale de la misma función en el formulario, al guardar y en el detalle', () => {
    const detalle = leer('app/(dashboard)/dashboard/compras/local/[id]/_page-client.tsx');
    expect(servidor).toContain('avisoRetencionSinNcf(r.tipoProveedor)');
    expect(formulario).toContain('avisoRetencionSinNcf(tipoProveedor)');
    expect(detalle).toContain('avisoRetencionSinNcf(compra.tipoProveedor)');
  });

  it('«Editar retenciones» parte de lo que manda la ley, también sin NCF', () => {
    // Sin NCF la sugerida que se aplica sola es cero; la que se copia al editar
    // es la legal. Si esto vuelve a `sugerida`, el contratista del exterior
    // tendría que calcular el 27 % y buscar el tipo de ISR a mano.
    const cuerpo = formulario.slice(formulario.indexOf('function pasarRetencionAManual()'), formulario.indexOf('setRetencionManual(true);'));
    expect(cuerpo).toContain('sugeridaLegal.itbisRetenidoCents');
    expect(cuerpo).toContain('sugeridaLegal.isrRetenidoCents');
    expect(cuerpo).toContain('sugeridaLegal.isrTipo');
    expect(cuerpo).not.toMatch(/\bsugerida\./);
  });

  it('el servidor guarda NULL y no una cadena vacía, y la ruta acepta que no venga NCF', () => {
    expect(servidor).toContain('referenciaEncf: reglas.gastoSinNcf ? null : info.ncf');
    expect(ruta).toContain('ncf: z.string().max(19).nullable().optional()');
  });

  it('el servidor sigue llevando al costo el ITBIS de un gasto sin NCF: es la única barrera del crédito', () => {
    expect(servidor).toContain('if (reglas.itbisSinCredito && itbisAlCosto < t.itbisCents)');
  });
});
