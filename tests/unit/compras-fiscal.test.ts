import { describe, it, expect } from 'vitest';
import {
  analizarIdentificacion, analizarNcf, erroresCompra, formaPago606, itbisAlCostoPorDefecto,
  lineaFormato606, resumirCompra, sugerirRetenciones, tasasRetencion, totalizarLineas,
  type CompraPara606,
} from '@/lib/compras/fiscal';
import { CATEGORIAS_COMPRA, tipo606Dominante } from '@/lib/compras/categorias';

describe('identificación del proveedor', () => {
  it('RNC de 9 dígitos con su dígito verificador', () => {
    expect(analizarIdentificacion('131-98803-2')).toMatchObject({ limpio: '131988032', tipoId: '1', persona: 'juridica', formatoValido: true, digitoOk: true });
    expect(analizarIdentificacion('131988033').digitoOk).toBe(false);
  });

  it('cédula de 11 dígitos', () => {
    expect(analizarIdentificacion('001-1234567-3')).toMatchObject({ tipoId: '2', persona: 'fisica', formatoValido: true, digitoOk: true });
  });

  it('otra longitud no es válida', () => {
    expect(analizarIdentificacion('12345').formatoValido).toBe(false);
    expect(analizarIdentificacion(null).tipoId).toBeNull();
  });
});

describe('NCF', () => {
  it('crédito fiscal en papel y electrónico', () => {
    expect(analizarNcf('b01 0000 0123')).toMatchObject({ ncf: 'B0100000123', valido: true, tipoBase: '01', electronico: false, daCreditoItbis: true, reporta606: true });
    expect(analizarNcf('E310000000123')).toMatchObject({ valido: true, tipo: '31', tipoBase: '01', electronico: true, daCreditoItbis: true });
  });

  it('consumo no da crédito ni va al 606', () => {
    expect(analizarNcf('B0200000001')).toMatchObject({ valido: true, daCreditoItbis: false, reporta606: false });
    expect(analizarNcf('E320000000001').reporta606).toBe(false);
  });

  it('gastos menores y pagos al exterior son autoemitidos y sin adelanto', () => {
    expect(analizarNcf('E430000000001')).toMatchObject({ origen: 'autoemitido', daCreditoItbis: false, reporta606: true });
    expect(analizarNcf('B1700000001')).toMatchObject({ origen: 'autoemitido', nombre: 'Pagos al exterior' });
  });

  it('notas de crédito y débito', () => {
    expect(analizarNcf('E340000000009').esNota).toBe(true);
  });

  it('errores con explicación', () => {
    expect(analizarNcf('B01123').error).toContain('11 caracteres');
    expect(analizarNcf('E3100001').error).toContain('13 caracteres');
    expect(analizarNcf('B1600000001').error).toContain('no sustenta compras');
    expect(analizarNcf('B9900000001').error).toContain('No existe');
    expect(analizarNcf('').valido).toBe(false);
  });
});

describe('líneas y totales', () => {
  it('separa servicios de bienes y calcula el ITBIS por línea', () => {
    const t = totalizarLineas([
      { cantidad: 1, costoUnitarioCents: 1_000_000, itbisTasa: '0.18', esServicio: true },
      { cantidad: 3, costoUnitarioCents: 50_000, itbisTasa: 'exento', esServicio: false },
      { cantidad: 2, costoUnitarioCents: 12_345, itbisTasa: '0.16', esServicio: false },
    ]);
    expect(t).toMatchObject({ baseServiciosCents: 1_000_000, baseBienesCents: 174_690, itbisCents: 180_000 + 3_950, itbisServiciosCents: 180_000 });
    expect(t.lineas[2]).toEqual({ baseCents: 24_690, itbisCents: 3_950 });
  });

  it('ITBIS al costo: consumo, gastos menores y empresas exentas', () => {
    expect(itbisAlCostoPorDefecto({ ncf: analizarNcf('B0200000001'), regimenItbis: 'gravado', itbisCents: 1800 })).toBe(1800);
    expect(itbisAlCostoPorDefecto({ ncf: analizarNcf('B0100000001'), regimenItbis: 'gravado', itbisCents: 1800 })).toBe(0);
    expect(itbisAlCostoPorDefecto({ ncf: analizarNcf('B0100000001'), regimenItbis: 'exento', itbisCents: 1800 })).toBe(1800);
  });
});

describe('retenciones', () => {
  const base = { baseServiciosCents: 1_000_000, baseBienesCents: 0, itbisCents: 180_000, itbisServiciosCents: 180_000 };

  it('las tasas de personas físicas cambian el 1-jul-2026 (Ley 30-26)', () => {
    expect(tasasRetencion('2026-06-30')).toMatchObject({ honorariosPF: 0.10, alquilerPF: 0.10, tecnicosPF: 0.02 });
    expect(tasasRetencion('2026-07-01')).toMatchObject({ honorariosPF: 0.15, alquilerPF: 0.15, tecnicosPF: 0.03 });
  });

  it('honorarios a persona física: 100 % del ITBIS y 15 % de ISR', () => {
    const r = sugerirRetenciones({ ...base, tipoProveedor: 'fisica', concepto: 'servicios_profesionales', fecha: '2026-09-14' });
    expect(r).toMatchObject({ itbisRetenidoCents: 180_000, isrRetenidoCents: 150_000, isrTipo: 2 });
    expect(r.motivos.join(' ')).toContain('Ley 30-26');
    const antes = sugerirRetenciones({ ...base, tipoProveedor: 'fisica', concepto: 'servicios_profesionales', fecha: '2026-06-15' });
    expect(antes.isrRetenidoCents).toBe(100_000);
  });

  it('alquiler y servicios técnicos de persona física', () => {
    expect(sugerirRetenciones({ ...base, tipoProveedor: 'fisica', concepto: 'alquiler', fecha: '2026-09-14' })).toMatchObject({ isrRetenidoCents: 150_000, isrTipo: 1 });
    expect(sugerirRetenciones({ ...base, tipoProveedor: 'informal', concepto: 'servicios_tecnicos', fecha: '2026-09-14' })).toMatchObject({ itbisRetenidoCents: 180_000, isrRetenidoCents: 30_000, isrTipo: 4 });
  });

  it('entre empresas: 30 % del ITBIS en servicios profesionales, 100 % en seguridad, nada en bienes', () => {
    expect(sugerirRetenciones({ ...base, tipoProveedor: 'juridica', concepto: 'servicios_profesionales', fecha: '2026-09-14' })).toMatchObject({ itbisRetenidoCents: 54_000, isrRetenidoCents: 0, isrTipo: null });
    expect(sugerirRetenciones({ ...base, tipoProveedor: 'juridica', concepto: 'seguridad', fecha: '2026-09-14' }).itbisRetenidoCents).toBe(180_000);
    const bienes = sugerirRetenciones({ baseServiciosCents: 0, baseBienesCents: 1_000_000, itbisCents: 180_000, itbisServiciosCents: 0, tipoProveedor: 'juridica', concepto: 'bienes', fecha: '2026-09-14' });
    expect(bienes).toMatchObject({ itbisRetenidoCents: 0, isrRetenidoCents: 0, motivos: [] });
  });

  it('pagos al exterior: 27 % de ISR', () => {
    expect(sugerirRetenciones({ baseServiciosCents: 500_000, baseBienesCents: 0, itbisCents: 0, itbisServiciosCents: 0, tipoProveedor: 'exterior', concepto: 'otros_servicios', fecha: '2026-09-14' })).toMatchObject({ isrRetenidoCents: 135_000, isrTipo: 3 });
  });
});

describe('resumen y validación', () => {
  const imp = { itbisFacturadoCents: 180_000, itbisAlCostoCents: 0, itbisRetenidoCents: 54_000, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 100_000 };

  it('neto a pagar = total − retenciones', () => {
    expect(resumirCompra(1_000_000, imp)).toEqual({ totalCents: 1_280_000, retencionesCents: 54_000, netoAPagarCents: 1_226_000, itbisPorAdelantarCents: 180_000 });
  });

  it('errores', () => {
    expect(erroresCompra({ baseCents: 1_000_000, imp: { ...imp, itbisAlCostoCents: 200_000 }, formaPago: 'credito', fechaPago: null })).toContain('El ITBIS llevado al costo no puede pasar del ITBIS facturado');
    expect(erroresCompra({ baseCents: 1_000_000, imp, formaPago: 'contado', fechaPago: null })).toContain('Con retenciones hace falta la fecha de pago: el 606 la exige');
    expect(erroresCompra({ baseCents: 1_000_000, imp, formaPago: 'contado', fechaPago: '2026-09-14' })).toEqual([]);
  });
});

describe('Formato 606', () => {
  const compra: CompraPara606 = {
    rncProveedor: '101-00001-1', ncf: 'E310000000123', ncfModificado: null, tipoBienes: '02',
    fechaComprobante: '2026-09-10', fechaPago: '2026-09-12',
    montoServiciosCents: 1_000_000, montoBienesCents: 250_000, itbisFacturadoCents: 225_000,
    itbisRetenidoCents: 54_000, itbisProporcionalidadCents: 0, itbisAlCostoCents: 0,
    isrTipo: null, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0, formaPago: '2',
  };

  it('23 campos en el orden de la Norma General 07-2018', () => {
    const campos = lineaFormato606(compra, '131988032').split('|');
    expect(campos).toHaveLength(23);
    expect(campos).toEqual([
      '101000011', '1', '02', 'E310000000123', '', '20260910', '20260912',
      '10000.00', '2500.00', '12500.00', '2250.00', '540.00', '', '', '2250.00', '',
      '', '', '', '', '', '', '2',
    ]);
  });

  it('gastos menores llevan el RNC de la propia empresa', () => {
    const campos = lineaFormato606({ ...compra, ncf: 'E430000000001', rncProveedor: null }, '131-98803-2').split('|');
    expect(campos[0]).toBe('131988032');
  });

  it('sin fecha de pago no se reportan las retenciones', () => {
    const campos = lineaFormato606({ ...compra, fechaPago: null, isrTipo: 2, isrRetenidoCents: 150_000 }, '131988032').split('|');
    expect(campos[6]).toBe('');
    expect(campos[11]).toBe('');
    expect(campos[16]).toBe('');
    expect(campos[17]).toBe('');
  });

  it('forma de pago', () => {
    expect(formaPago606('credito', 'efectivo')).toBe('4');
    expect(formaPago606('contado', 'efectivo')).toBe('1');
    expect(formaPago606('contado', 'tarjeta')).toBe('3');
    expect(formaPago606('contado', 'transferencia')).toBe('2');
  });
});

describe('categorías', () => {
  it('cada categoría tiene tipo 606, cuenta y concepto', () => {
    for (const c of CATEGORIAS_COMPRA) {
      expect(c.tipo606).toMatch(/^(0[1-9]|1[01])$/);
      expect(c.cuentaCodigo).toMatch(/^\d{4}$/);
    }
    expect(new Set(CATEGORIAS_COMPRA.map((c) => c.clave)).size).toBe(CATEGORIAS_COMPRA.length);
  });

  it('el tipo del 606 es el de la línea de mayor monto', () => {
    expect(tipo606Dominante([{ tipo606: '02', baseCents: 100 }, { tipo606: '03', baseCents: 500 }, { tipo606: '02', baseCents: 450 }])).toBe('02');
  });
});

describe('e-CF recibido', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ECF><Encabezado><Version>1.0</Version><IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000456</eNCF>
<FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia><TipoIngresos>01</TipoIngresos>
<TipoPago>2</TipoPago><FechaLimitePago>10-10-2026</FechaLimitePago></IdDoc>
<Emisor><RNCEmisor>101000011</RNCEmisor><RazonSocialEmisor>DISTRIBUIDORA DEL CARIBE &amp; ASOC. SRL</RazonSocialEmisor>
<FechaEmision>10-09-2026</FechaEmision></Emisor><Comprador><RNCComprador>131988032</RNCComprador></Comprador>
<Totales><MontoGravadoTotal>1500.00</MontoGravadoTotal><MontoExento>200.00</MontoExento><TotalITBIS>270.00</TotalITBIS><MontoTotal>1970.00</MontoTotal></Totales></Encabezado>
<DetallesItems>
<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion><NombreItem>Resma papel</NombreItem><IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>3</CantidadItem><PrecioUnitarioItem>500.00</PrecioUnitarioItem><MontoItem>1500.00</MontoItem></Item>
<Item><NumeroLinea>2</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion><NombreItem>Entrega</NombreItem><IndicadorBienoServicio>2</IndicadorBienoServicio><CantidadItem>3</CantidadItem><PrecioUnitarioItem>66.67</PrecioUnitarioItem><MontoItem>200.00</MontoItem></Item>
</DetallesItems></ECF>`;

  it('lee emisor, fechas, crédito y líneas con su ITBIS', async () => {
    const { leerEcfRecibido } = await import('@/lib/compras/ecf-xml');
    const e = leerEcfRecibido(xml)!;
    expect(e).toMatchObject({
      tipo: '31', encf: 'E310000000456', rncEmisor: '101000011', razonSocialEmisor: 'DISTRIBUIDORA DEL CARIBE & ASOC. SRL',
      fechaEmision: '2026-09-10', formaPago: 'credito', fechaLimitePago: '2026-10-10', montoTotalCents: 197_000, totalItbisCents: 27_000,
    });
    expect(e.lineas[0]).toEqual({ descripcion: 'Resma papel', cantidad: 3, costoUnitarioCents: 50_000, itbisTasa: '0.18', esServicio: false });
    // 3 × 66.67 no da 200.00 exacto: una unidad por el monto de la línea.
    expect(e.lineas[1]).toMatchObject({ cantidad: 1, costoUnitarioCents: 20_000, itbisTasa: 'exento', esServicio: true });
    const t = totalizarLineas(e.lineas);
    expect(t.baseCents + t.itbisCents).toBe(e.montoTotalCents);
  });

  it('lo que no es un e-CF no se lee', async () => {
    const { leerEcfRecibido } = await import('@/lib/compras/ecf-xml');
    expect(leerEcfRecibido('<ARECF></ARECF>')).toBeNull();
    expect(leerEcfRecibido(null)).toBeNull();
  });
});

describe('archivo 606', () => {
  it('encabezado, CRLF y nombre del archivo', async () => {
    const { construirFormato606, retencionesDeJson } = await import('@/lib/compras/formato606');
    const compra: CompraPara606 = {
      rncProveedor: '101000011', ncf: 'B0100000123', ncfModificado: null, tipoBienes: '09',
      fechaComprobante: '2026-09-02', fechaPago: '2026-09-02', montoServiciosCents: 0, montoBienesCents: 100_000,
      itbisFacturadoCents: 18_000, itbisRetenidoCents: 0, itbisProporcionalidadCents: 0, itbisAlCostoCents: 0,
      isrTipo: null, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0, formaPago: '1',
    };
    const a = construirFormato606({ rncEmpresa: '131-98803-2', periodo: '202609', compras: [compra, compra] });
    expect(a.nombreArchivo).toBe('DGII_F_606_131988032_202609.TXT');
    const lineas = a.contenido.split('\r\n');
    expect(lineas[0]).toBe('606|131988032|202609|2');
    expect(lineas).toHaveLength(3);
    expect(retencionesDeJson('[{"tipo":"itbis","monto":180},{"tipo":"isr","monto":150.5}]')).toEqual({ itbisCents: 18_000, isrCents: 15_050 });
    expect(retencionesDeJson('no es json')).toEqual({ itbisCents: 0, isrCents: 0 });
  });
});
