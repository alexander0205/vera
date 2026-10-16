import { describe, expect, it } from 'vitest';
import {
  armarMensajeGuiado, avanzarGuiado, iniciarGuiado, leerEstado, type BuscadoresGuiado, type Estado, type IdGuiado, type Opcion, type RespuestaGuiada,
} from '@/lib/asistente/guiado';

const CLIENTES: Opcion[] = [{ id: 7, nombre: 'Colegio Andrés Bello', rnc: '131234567', email: 'a@b.com' }, { id: 8, nombre: 'Colegio Santa Ana', rnc: '101010101' }];
const PRODUCTOS: Opcion[] = [{ id: 3, nombre: 'Uniforme escolar', precio: 1500, tasa: '0.18', bien: true }, { id: 4, nombre: 'Uniforme deportivo', precio: 900, tasa: '0.18', bien: true }];
const b: BuscadoresGuiado = {
  hoy: '2026-10-16',
  clientes: async (q) => (/zzz/.test(q) ? [] : CLIENTES),
  productos: async (q) => (/zzz/.test(q) ? [] : PRODUCTOS),
  facturas: async (q, borr) => (/zzz/.test(q) ? [] : [{ id: 50, nombre: 'E310000000001 - Colegio X', saldo: 1000, total: 1180 }, ...(borr ? [] : [{ id: 51, nombre: 'E310000000002 - Colegio Y', saldo: 500, total: 600 }])]),
  cotizaciones: async () => [{ id: 70, nombre: 'COT-0001 - Colegio X', total: 5000 }],
  detalleFactura: async () => ({ error: null, lineas: [{ nombre: 'Uniforme', cantidad: 4, precio: 1000, tasa: '0.18' as const }] }),
};

/**
 * Cada botón que el asistente ofrece se manda como texto: tiene que entenderse.
 * Se recorre cada flujo con respuestas válidas y, en cada paso, se prueba cada botón desde ese estado.
 */
async function recorrer(f: IdGuiado, respuestas: string[]) {
  let r: RespuestaGuiada = iniciarGuiado(f);
  const fallos: string[] = [];
  const probar = async (e: Estado, paso: string) => {
    for (const chip of e.c ?? []) {
      // «Atrás» y «Cancelar» son órdenes; los demás deben avanzar o, al menos, no ser un «no te entendí».
      const copia = leerEstado(armarMensajeGuiado({ texto: '', chips: [], estado: e }))!;
      const x = await avanzarGuiado(copia, chip, b);
      if (/No te entendí|No te leí/.test(x.texto)) fallos.push(`${f}/${paso}: «${chip}» → ${x.texto.slice(0, 60)}`);
    }
  };
  if (r.estado) await probar(r.estado, r.estado.p);
  for (const t of respuestas) {
    const e = leerEstado(armarMensajeGuiado(r));
    expect(e, `estado antes de «${t}»`).not.toBeNull();
    r = await avanzarGuiado(e as Estado, t, b);
    if (r.estado) await probar(r.estado, r.estado.p);
  }
  return fallos;
}

describe('los botones que ofrece la creación guiada se entienden al pulsarlos', () => {
  const flujos: [IdGuiado, string[]][] = [
    ['cliente', ['Ana', '131234567', 'a@b.com', 'No', 'No']],
    ['producto', ['Camiseta', 'Producto', '350', '18 %', 'No']],
    ['factura', ['Sin comprobante', 'Consumo final', 'cosa zzz', 'Sí, línea libre', '100', '18 %', '1', 'Sí', 'Uniforme', '1', '2', 'Sí', 'No', 'No, por cobrar', 'No']],
    ['factura', ['Crédito fiscal', 'Colegio', '1', 'Uniforme', '1', '1', 'Sí', 'No', 'Efectivo', 'No', 'Cambiar algo', 'Cliente', 'Colegio', '1']],
    ['factura', ['Consumo', 'zzz nuevo', 'Sí, usar ese nombre', 'x zzz', 'Sí, línea libre', '5', 'Exento', '1']],
    ['cotizacion', ['Sin cliente', 'En 30 días', 'Uniforme', '1', '1', 'Sí', 'No', 'No']],
    ['cotizacion', ['Colegio', '1', 'No vence', 'Uniforme', '1', '1', 'Sí', 'Quitar la última']],
    ['pago', ['E31', '1', 'Todo', 'Efectivo', 'Hoy', 'No']],
    ['pago', ['E31', '1', '100', 'Transferencia', 'Ayer', 'ABC']],
    ['anulacion', ['E31', '1', '1', 'No']],
    ['notacredito', ['E31', '1', '1', 'Todo']],
    ['notacredito', ['E31', '1', '6', 'por error', 'Todo']],
    ['notadebito', ['E31', '1', '1', 'Recargo zzz', 'Sí, línea libre', '300', '18 %', '1', 'No']],
    ['convertir', ['COT']],
    ['borrador', ['x', '1 y 3', 'Colegio', '1', 'Nota nueva']],
  ];
  for (const [f, resp] of flujos) {
    it(`${f}: ${resp.slice(0, 4).join(' › ')}…`, async () => {
      expect(await recorrer(f, resp)).toEqual([]);
    });
  }
});
