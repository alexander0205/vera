/**
 * Explica en lenguaje llano por qué la DGII no aceptó un comprobante y qué
 * hacer, a partir de los mensajes que devolvió (`mensajesDgii`) y del estado.
 *
 * No inventa causas: solo reconoce motivos conocidos por lo que dice el
 * mensaje; lo que no reconoce se muestra tal cual y se manda a corregir o a
 * soporte. Las rutas de «dónde se arregla» son pantallas reales de Zero (la
 * prueba lo comprueba contra el mapa).
 */

import { normalizar } from './util';

export interface MensajeDgii { codigo: number | string | null; mensaje: string }

export interface Explicacion {
  mensaje: string;
  causa: string;
  solucion: string;
  /** Pantalla de Zero donde se corrige (ruta real), si hay una. */
  enlace?: { texto: string; ruta: string };
}

interface Motivo {
  re: RegExp;
  causa: string;
  solucion: string;
  enlace?: { texto: string; ruta: string };
}

const MOTIVOS: Motivo[] = [
  {
    re: /\brnc\b.*(no (existe|esta|valido|registrado|encontrado|activo)|invalido|inexistente|suspendid)|(comprador|receptor).*rnc.*(invalid|no)/,
    causa: 'El RNC o la cédula del comprador no es válido o no existe en la DGII.',
    solucion: 'Corrige el RNC en la ficha del cliente y vuelve a emitir.',
    enlace: { texto: 'Clientes', ruta: '/dashboard/clientes' },
  },
  {
    re: /(encf|e ncf|secuencia|numero de comprobante).*(utilizad|usad|duplicad|ya (existe|fue|esta)|repetid)/,
    causa: 'Ese número de comprobante (e-NCF) ya fue usado.',
    solucion: 'Revisa tus secuencias: puede haber un rango repetido o una numeración manual que se cruzó. No reutilices el número; emite con el siguiente disponible.',
    enlace: { texto: 'Secuencias', ruta: '/dashboard/secuencias' },
  },
  {
    re: /(secuencia|autorizacion|rango).*(vencid|expirad|agotad|no (vigente|autorizad))|(vencid|expirad|agotad).*(secuencia|rango)/,
    causa: 'La secuencia de numeración está vencida, agotada o no está autorizada.',
    solucion: 'Solicita un nuevo rango en la Oficina Virtual de la DGII y regístralo en Zero.',
    enlace: { texto: 'Secuencias', ruta: '/dashboard/secuencias' },
  },
  {
    re: /(certificado|firma).*(invalid|vencid|expirad|no (coincide|valid|reconoc)|revocad)/,
    causa: 'El certificado digital con el que se firmó está vencido, es inválido o no corresponde.',
    solucion: 'Sube un certificado vigente de la empresa y vuelve a emitir.',
    enlace: { texto: 'Certificado digital', ruta: '/dashboard/certificado' },
  },
  {
    re: /(monto|total|suma|itbis|base imponible|subtotal).*(no (coincide|cuadra|corresponde)|diferencia|incorrect|distint|difiere)|(no (coincide|cuadra)).*(monto|total|itbis)/,
    causa: 'Los montos no cuadran: el total, la base o el ITBIS no coinciden con la suma de las líneas.',
    solucion: 'Abre la factura, revisa precios, cantidades, descuentos e ITBIS de cada línea y vuelve a emitir.',
  },
  {
    re: /fecha.*(emision|vencimiento|invalid|futura|anterior|fuera de rango|no (valida|permitida))/,
    causa: 'La fecha del comprobante no es válida (fuera de rango, futura o anterior a lo permitido).',
    solucion: 'Corrige la fecha de emisión o de vencimiento y vuelve a emitir.',
  },
  {
    re: /(tipo de (comprobante|ecf|e cf)|tipoecf).*(no (permit|autoriz|habilit|valid)|invalid)/,
    causa: 'La empresa no está habilitada para emitir ese tipo de comprobante.',
    solucion: 'Emite con un tipo habilitado, o completa la habilitación de ese tipo ante la DGII.',
    enlace: { texto: 'Habilitación DGII', ruta: '/dashboard/habilitacion' },
  },
  {
    re: /(error|invalid\w*|no (cumple|valid\w*)).{0,30}(xml|estructura|esquema|schema|xsd)|(xml|estructura|esquema|schema|xsd).{0,30}(invalid|error|no (cumple|valid))|campo.*(requerid|obligatori|faltante)/,
    causa: 'Falta un dato obligatorio o el formato del comprobante no cumple el esquema de la DGII.',
    solucion: 'Revisa los datos del cliente y de las líneas (RNC, descripción, cantidad, unidad) y vuelve a emitir.',
  },
  {
    re: /(contingencia|sin conexion|servicio no disponible|tiempo de espera|timeout|no (se )?pudo conectar)/,
    causa: 'La DGII o la conexión no respondieron a tiempo; no es un error del comprobante.',
    solucion: 'Espera unos minutos y usa «Consultar DGII» en la factura para actualizar su estado.',
  },
];

export const ESTADOS_NO_ACEPTADOS = ['RECHAZADO', 'EN_PROCESO', 'ACEPTADO_CONDICIONAL'] as const;

/** Mensajes de la DGII como los guarda Zero: [{ codigo, valor }] (o `mensaje`). Lo vacío se descarta. */
export function leerMensajesDgii(crudo: unknown): MensajeDgii[] {
  if (!Array.isArray(crudo)) return [];
  const salida: MensajeDgii[] = [];
  for (const m of crudo) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const texto = String(o.valor ?? o.mensaje ?? o.message ?? '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    salida.push({ codigo: (o.codigo as number | string | undefined) ?? null, mensaje: texto.slice(0, 300) });
  }
  return salida.slice(0, 6);
}

export function explicarMensajesDgii(mensajes: MensajeDgii[]): Explicacion[] {
  return mensajes.map((m) => {
    const t = normalizar(m.mensaje);
    const hallado = MOTIVOS.find((x) => x.re.test(t));
    if (hallado) return { mensaje: m.mensaje, causa: hallado.causa, solucion: hallado.solucion, enlace: hallado.enlace };
    return {
      mensaje: m.mensaje,
      causa: 'La DGII devolvió este mensaje y no tengo una explicación segura para él.',
      solucion: 'Corrige lo que indica el mensaje y vuelve a emitir; si no queda claro, pulsa «Hablar con una persona» y comparte el mensaje.',
    };
  });
}

/** Qué significa el estado del comprobante ante la DGII, en una frase. */
export function significadoDelEstado(estado: string): string {
  switch (estado) {
    case 'ACEPTADO': return 'La DGII lo aceptó: es un comprobante válido.';
    case 'ACEPTADO_CONDICIONAL': return 'La DGII lo aceptó con observaciones: es válido, pero conviene revisar los avisos.';
    case 'EN_PROCESO': return 'La DGII todavía lo está procesando. Suele resolverse en minutos.';
    case 'RECHAZADO': return 'La DGII lo rechazó: no es un comprobante válido hasta corregirlo.';
    case 'ANULADO': return 'Está anulado: ya no cuenta como venta.';
    case 'BORRADOR': return 'Todavía es un borrador: no se ha enviado a la DGII.';
    default: return `Estado ante la DGII: ${estado}.`;
  }
}

/** Solo para pruebas: los motivos conocidos. */
export const MOTIVOS_PARA_PRUEBA = MOTIVOS;
