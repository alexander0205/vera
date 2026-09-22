import { describe, it, expect } from 'vitest';
import { leerTimbre, fechaDgii } from '@/lib/compras/captura/timbre';
import { datosDesdeTimbre, datosDesdeIa, combinarDatos, inicialDesdeCaptura, emparejarProductos, cuadrarLineas, ncfDesdeLectura, type LecturaIa } from '@/lib/compras/captura/datos';

const QR_31 = 'https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=132274741&RncComprador=131988032&encf=E310000000034&fechaemision=15-09-2026&montototal=3200.00&fechafirma=15-09-2026%2015%3A14%3A02&codigoseguridad=XdnBqr';
const QR_FC = 'https://fc.dgii.gov.do/ecf/consultatimbrefc?rncemisor=132274741&encf=E320000000108&montototal=5300&codigoseguridad=JTzJOI';

const ia = (p: Partial<LecturaIa> = {}): LecturaIa => ({
  esFactura: true, clase: 'gasto', legible: true, completa: true, proveedorNombre: 'FERRETERIA PRUEBA SRL', nif: null, proveedorRnc: '101-01010-1',
  tipoProveedor: null, resolucionDgii: null, fechaResolucionDgii: null, ncf: 'B0100000123', fecha: '10/09/2026', formaPago: 'contado', metodoPago: 'efectivo',
  categoria: 'materiales', moneda: 'DOP', subtotal: 1000, itbis: 180, isc: null, otrosImpuestos: null, propina: null,
  itbisRetenido: null, isrRetenido: null, totalImpreso: 'TOTAL RD$ 1,180.00', total: 1180, lineas: [], ...p,
});

describe('QR del e-CF', () => {
  it('lee el timbre de un E31 con los parámetros como vienen impresos', () => {
    const t = leerTimbre(QR_31)!;
    expect(t).toMatchObject({
      ambiente: 'produccion', consumo: false, rncEmisor: '132274741', rncComprador: '131988032',
      encf: 'E310000000034', fechaEmision: '2026-09-15', montoTotalCents: 320000, codigoSeguridad: 'XdnBqr',
    });
    expect(t.fechaFirma).toBe('15-09-2026 15:14:02');
  });

  it('lee el de consumo, que no trae comprador ni fecha', () => {
    const t = leerTimbre(QR_FC)!;
    expect(t).toMatchObject({ consumo: true, encf: 'E320000000108', montoTotalCents: 530000, rncComprador: null, fechaEmision: null });
  });

  it('distingue los ambientes de prueba', () => {
    expect(leerTimbre(QR_31.replace('/ecf/', '/testecf/'))!.ambiente).toBe('pruebas');
    expect(leerTimbre(QR_31.replace('/ecf/', '/certecf/'))!.ambiente).toBe('certificacion');
  });

  it('rechaza lo que no es un timbre de la DGII', () => {
    expect(leerTimbre('https://ecf.dgii.gov.do.evil.com/ecf/consultatimbre?encf=E310000000034')).toBeNull();
    expect(leerTimbre('http://ecf.dgii.gov.do/ecf/consultatimbre?encf=E310000000034')).toBeNull();
    expect(leerTimbre('https://dgii.gov.do/otra-cosa')).toBeNull();
    expect(leerTimbre('B0100000123')).toBeNull();
    expect(leerTimbre('')).toBeNull();
  });

  it('fechas imposibles no pasan', () => {
    expect(fechaDgii('31-02-2026')).toBeNull();
    expect(fechaDgii('01-12-2026')).toBe('2026-12-01');
  });
});

describe('datos de la captura', () => {
  it('avisa si la factura no está a nombre de la empresa', () => {
    const d = datosDesdeTimbre(leerTimbre(QR_31)!, '130000001');
    expect(d.avisos.join(' ')).toContain('no está a nombre de la empresa');
    expect(datosDesdeTimbre(leerTimbre(QR_31)!, '131988032').avisos).toEqual([]);
  });

  it('normaliza la lectura con IA: RNC, NCF, fecha y montos', () => {
    const d = datosDesdeIa(ia());
    expect(d).toMatchObject({ proveedorRnc: '101010101', ncf: 'B0100000123', fecha: '2026-09-10', totalCents: 118000, itbisCents: 18000 });
  });

  it('no deja pasar un NCF inventado y lo dice', () => {
    const d = datosDesdeIa(ia({ ncf: 'B99' }));
    expect(d.ncf).toBeNull();
    expect(d.avisos.join(' ')).toContain('no es válido');
  });

  it('el QR manda sobre la foto y la discrepancia se avisa', () => {
    const qr = datosDesdeTimbre(leerTimbre(QR_31)!, '131988032');
    const c = combinarDatos(qr, datosDesdeIa(ia({ ncf: 'E310000000035', total: 3500 })));
    expect(c.ncf).toBe('E310000000034');
    expect(c.totalCents).toBe(320000);
    expect(c.proveedorNombre).toBe('FERRETERIA PRUEBA SRL');
    expect(c.avisos.join(' ')).toContain('no coincide con el del QR');
  });

  it('solo con el QR la línea queda exenta por el total y se avisa', () => {
    const { inicial, avisos } = inicialDesdeCaptura(datosDesdeTimbre(leerTimbre(QR_31)!, '131988032'));
    expect(inicial.lineas).toEqual([{ descripcion: 'Factura E310000000034', cantidad: 1, costoUnitarioCents: 320000, itbisTasa: 'exento', esServicio: false, categoria: null }]);
    expect(avisos.join(' ')).toContain('No se leyó el ITBIS');
  });

  it('con ITBIS del 18 % la línea lleva la base', () => {
    const { inicial } = inicialDesdeCaptura(datosDesdeIa(ia()));
    expect(inicial.lineas).toEqual([{ descripcion: 'Factura B0100000123', cantidad: 1, costoUnitarioCents: 100000, itbisTasa: '0.18', esServicio: false, categoria: 'materiales' }]);
  });

  it('las líneas leídas pasan con su tasa y una cantidad fraccionada entra como una unidad', () => {
    const d = datosDesdeIa(ia({
      lineas: [
        { descripcion: 'Cemento', cantidad: 2, precioUnitario: 450, itbisPorcentaje: 18, esServicio: false, categoria: 'materiales' },
        { descripcion: 'Arena (m3)', cantidad: 1.5, precioUnitario: 100, itbisPorcentaje: null, esServicio: false, categoria: null },
      ],
    }));
    expect(d.lineas).toEqual([
      { descripcion: 'Cemento', cantidad: 2, costoUnitarioCents: 45000, itbisTasa: '0.18', esServicio: false, categoria: 'materiales' },
      // Sin categoría propia hereda la del comprobante.
      { descripcion: 'Arena (m3)', cantidad: 1, costoUnitarioCents: 15000, itbisTasa: 'exento', esServicio: false, categoria: 'materiales' },
    ]);
  });
});

describe('la IA llena lo que hace falta para registrar', () => {
  it('trae categoría, método de pago y retenciones impresas', () => {
    const d = datosDesdeIa(ia({ categoria: 'combustible', metodoPago: 'tarjeta', itbisRetenido: 27, isrRetenido: 100, isc: 12.5, otrosImpuestos: 3 }));
    expect(d).toMatchObject({
      categoria: 'combustible', metodoPago: 'tarjeta',
      itbisRetenidoCents: 2700, isrRetenidoCents: 10000, iscCents: 1250, otrosImpuestosCents: 300,
    });
  });

  it('una categoría inventada no pasa', () => {
    expect(datosDesdeIa(ia({ categoria: 'criptomonedas' as never })).categoria).toBeNull();
  });

  it('el tipo de proveedor sale de la identificación: 9 dígitos empresa, 11 persona', () => {
    expect(datosDesdeIa(ia({ proveedorRnc: '101010101', tipoProveedor: 'fisica' })).tipoProveedor).toBe('juridica');
    expect(datosDesdeIa(ia({ proveedorRnc: '00112345673', tipoProveedor: null })).tipoProveedor).toBe('fisica');
  });

  it('pero el RST y el exterior los decide la factura, porque cambian las retenciones', () => {
    expect(datosDesdeIa(ia({ proveedorRnc: '101010101', tipoProveedor: 'rst' })).tipoProveedor).toBe('rst');
    expect(datosDesdeIa(ia({ proveedorRnc: null, tipoProveedor: 'exterior' })).tipoProveedor).toBe('exterior');
  });

  it('el borrador del registro sale con todo puesto', () => {
    const { inicial } = inicialDesdeCaptura(datosDesdeIa(ia({ categoria: 'representacion', metodoPago: 'tarjeta', propina: 100 })));
    expect(inicial).toMatchObject({
      proveedorRnc: '101010101', tipoProveedor: 'juridica', ncf: 'B0100000123', fecha: '2026-09-10',
      formaPago: 'contado', metodoPago: 'tarjeta', propinaCents: 10000, montoTotalCents: 118000,
    });
    expect(inicial.lineas[0]).toMatchObject({ categoria: 'representacion', itbisTasa: '0.18' });
  });

  it('el QR manda en su parte pero conserva lo que solo trae la IA', () => {
    const qr = datosDesdeTimbre(leerTimbre(QR_31)!, '131988032');
    const c = combinarDatos(qr, datosDesdeIa(ia({ categoria: 'materiales', metodoPago: 'transferencia', itbis: 540, total: 3540 })));
    expect(c).toMatchObject({
      ncf: 'E310000000034', totalCents: 320000, categoria: 'materiales', metodoPago: 'transferencia', itbisCents: 54000,
    });
  });
});

describe('gasto o compra de inventario', () => {
  it('la IA dice cuál es y viaja con los datos', () => {
    expect(datosDesdeIa(ia({ clase: 'compra' })).clase).toBe('compra');
    expect(datosDesdeIa(ia({ clase: null })).clase).toBeNull();
  });

  const productos = [
    { id: 1, nombre: 'Tóner HP 85A', referencia: 'TON-85A', codigoBarras: null },
    { id: 2, nombre: 'Resma papel 8.5x11', referencia: null, codigoBarras: '7501031311309' },
    { id: 3, nombre: 'Cemento gris', referencia: null, codigoBarras: null },
    { id: 4, nombre: 'Cemento gris', referencia: null, codigoBarras: null },
  ];
  const linea = (descripcion: string) => ({ descripcion, cantidad: 1, costoUnitarioCents: 100, itbisTasa: '0.18' as const, esServicio: false, categoria: null });

  it('enlaza por nombre sin acentos ni mayúsculas', () => {
    expect(emparejarProductos([linea('TONER HP 85A')], productos)[0].productoId).toBe(1);
  });

  it('o por la referencia o el código de barras dentro de la descripción', () => {
    expect(emparejarProductos([linea('Toner original TON-85A negro')], productos)[0].productoId).toBe(1);
    expect(emparejarProductos([linea('Papel 7501031311309 caja')], productos)[0].productoId).toBe(2);
  });

  it('si dos productos encajan igual, no elige ninguno', () => {
    expect(emparejarProductos([linea('Cemento gris')], productos)[0].productoId).toBeUndefined();
  });

  it('lo que no se reconoce queda sin producto, para asignarlo a mano', () => {
    expect(emparejarProductos([linea('Clavos de 2 pulgadas')], productos)[0].productoId).toBeUndefined();
  });
});

describe('las cuentas de lo leído tienen que cuadrar', () => {
  const l = (precio: number, tasa: '0.18' | 'exento' = '0.18') =>
    ({ descripcion: 'x', cantidad: 1, costoUnitarioCents: precio, itbisTasa: tasa, esServicio: false, categoria: null });

  it('precios ya con ITBIS (recibo de supermercado): se les quita', () => {
    // 209.00 con ITBIS + 149.00 exento = 358.00 de total.
    const r = cuadrarLineas([l(20900), l(14900, 'exento')], 35800);
    expect(r.incluianItbis).toBe(true);
    expect(r.lineas.map((x) => x.costoUnitarioCents)).toEqual([17712, 14900]);
  });

  it('precios sin ITBIS que con el impuesto dan el total: se dejan', () => {
    const r = cuadrarLineas([l(100000)], 118000);
    expect(r).toMatchObject({ incluianItbis: false, noCuadra: false });
    expect(r.lineas[0].costoUnitarioCents).toBe(100000);
  });

  it('un total que no sale de ninguna forma (foto cortada, total inventado) se avisa', () => {
    expect(cuadrarLineas([l(20900), l(14900, 'exento')], 129200).noCuadra).toBe(true);
  });

  it('la lectura avisa de la foto cortada, la fecha lejana y el NCF que falta', () => {
    const d = datosDesdeIa(ia({ completa: false, fecha: '2009-02-02', ncf: null }), '2026-09-22');
    const texto = d.avisos.join(' ');
    expect(texto).toContain('no muestra la factura entera');
    expect(texto).toContain('02/02/2009');
    expect(texto).toContain('No se leyó un NCF válido');
  });
});

// Encabezado de un recibo de caja real (La Sirena, 2022):
//   RNC 101796822 · Res DGII : 02-2009   Del : 02/02/2009 · AUTORIZADO POR DGII
//   09/08/22 10:09:38 · NIF:1508520000060915 NCF:B023095708000000000
describe('el encabezado de los recibos de caja', () => {
  it('la fecha de la resolución DGII no pasa por fecha de la venta', () => {
    const d = datosDesdeIa(ia({ fecha: '2009-02-02', fechaResolucionDgii: '2009-02-02', resolucionDgii: '02-2009' }), '2026-09-22');
    expect(d.fecha).toBeNull();
    expect(d.avisos.join(' ')).toContain('es la de la autorización de la DGII');
  });

  it('bien separadas, la fecha de la venta se queda', () => {
    const d = datosDesdeIa(ia({ fecha: '2022-08-09', fechaResolucionDgii: '2009-02-02' }), '2026-09-22');
    expect(d.fecha).toBe('2022-08-09');
    expect(d.avisos.join(' ')).not.toContain('autorización de la DGII');
  });

  it('el número de la resolución no es un NCF mal leído: no se señala como NCF inválido', () => {
    const d = datosDesdeIa(ia({ ncf: '02-2009' }));
    expect(d.ncf).toBeNull();
    expect(d.avisos.join(' ')).not.toContain('El NCF leído');
    expect(d.avisos.join(' ')).toContain('No se leyó un NCF válido');
  });

  it('el NCF con los ceros de relleno del formato viejo se recorta y se dice', () => {
    expect(ncfDesdeLectura('B023095708000000000')).toEqual({ ncf: 'B0230957080', relleno: true });
    // El modelo a veces copia menos ceros de los que hay.
    expect(ncfDesdeLectura('B0230957080000000')).toEqual({ ncf: 'B0230957080', relleno: true });
    const d = datosDesdeIa(ia({ ncf: 'B023095708000000000' }));
    expect(d.ncf).toBe('B0230957080');
    expect(d.avisos.join(' ')).toContain('se tomó B0230957080');
  });

  it('un comprobante de consumo pasa, pero avisa que no da crédito ni va al 606', () => {
    const d = datosDesdeIa(ia({ ncf: 'B0230957080' }));
    expect(d.ncf).toBe('B0230957080');
    expect(d.avisos).toContain('Es una factura de consumo (B02): no da crédito de ITBIS ni va al 606.');
  });

  it('espacios y guiones fuera; los e-NCF pasan tal cual', () => {
    expect(ncfDesdeLectura('b01 0000-0123')).toEqual({ ncf: 'B0100000123', relleno: false });
    expect(ncfDesdeLectura('E310000000045')).toEqual({ ncf: 'E310000000045', relleno: false });
    expect(ncfDesdeLectura(null)).toEqual({ ncf: null, relleno: false });
  });

  it('el NIF no pasa por RNC, y el RNC que falta se avisa', () => {
    const d = datosDesdeIa(ia({ proveedorRnc: '1508520000060915', nif: '1508520000060915' }));
    expect(d.proveedorRnc).toBeNull();
    expect(d.avisos).toContain('No se leyó el RNC del proveedor: escríbelo mirando la foto.');
    expect(datosDesdeIa(ia({ proveedorRnc: null, tipoProveedor: 'exterior' })).avisos.join(' ')).not.toContain('RNC');
  });

  it('sin el renglón del total a la vista no hay total, aunque el modelo sume uno', () => {
    // Foto del Olé cortada bajo las líneas: el modelo daba 1,541.74, 1,231.32 o 1,347.75.
    const d = datosDesdeIa(ia({ totalImpreso: null, total: 1541.74 }));
    expect(d.totalCents).toBeNull();
    expect(d.avisos.join(' ')).toContain('no muestra la factura entera');
    expect(d.avisos.join(' ')).not.toContain('no suman el total');
  });
});
