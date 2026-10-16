/**
 * Alertas que el asistente muestra al abrir el panel: cosas que conviene
 * atender hoy y que la persona probablemente no está mirando. Solo datos que
 * ya existen en Zero (facturas rechazadas, secuencias, certificado); aquí la
 * parte pura: de los datos crudos a una lista corta y ordenada.
 */

export type NivelAlerta = 'alto' | 'medio';

export interface Alerta {
  id: string;
  nivel: NivelAlerta;
  titulo: string;
  detalle: string;
  /** Pantalla de Zero donde se atiende (ruta real). */
  enlace: string;
  accion: string;
}

export interface SecuenciaApi {
  tipoEcf: string;
  nombre?: string | null;
  disponibles: number;
  fechaVencimiento: string | null;
  estado: 'activa' | 'vencida' | 'agotada';
  secuenciaDesde?: string;
  secuenciaHasta?: string;
}

export interface DatosAlertas {
  hoy: string;
  rechazadas: number;
  enProceso: number;
  secuencias: SecuenciaApi[];
  certificado: { tieneCertificado: boolean; vencimiento?: string | null } | null;
}

const MAX_ALERTAS = 3;
const DIAS_AVISO = 30;
/** Por debajo de esto una secuencia «por agotarse» merece aviso. */
const UMBRAL_DISPONIBLES = 50;

const dias = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

export function construirAlertas(d: DatosAlertas): Alerta[] {
  const alertas: Alerta[] = [];

  if (d.rechazadas > 0) {
    alertas.push({
      id: 'rechazadas', nivel: 'alto',
      titulo: `${d.rechazadas} ${plural(d.rechazadas, 'factura rechazada', 'facturas rechazadas')} por la DGII`,
      detalle: 'No son comprobantes válidos hasta corregirlos. Ábrelas y pregúntame «¿por qué la rechazaron?».',
      enlace: '/dashboard/facturas', accion: 'Ver facturas',
    });
  }

  // Secuencias: vencida o agotada es urgente (no se puede emitir); «por agotarse» o «por vencer», aviso.
  for (const s of d.secuencias) {
    if (s.tipoEcf === 'sin-ncf') continue;
    const nombre = s.nombre ?? `tipo ${s.tipoEcf}`;
    if (s.estado === 'vencida' || s.estado === 'agotada') {
      // Una secuencia vieja ya reemplazada por otra activa del mismo tipo no es una alerta.
      const hayOtraActiva = d.secuencias.some((o) => o !== s && o.tipoEcf === s.tipoEcf && o.estado === 'activa');
      if (hayOtraActiva) continue;
      alertas.push({
        id: `secuencia-${s.tipoEcf}-${s.estado}`, nivel: 'alto',
        titulo: `La secuencia de ${nombre} está ${s.estado}`,
        detalle: 'Sin una secuencia vigente no puedes emitir ese tipo de comprobante. Solicita un nuevo rango en la Oficina Virtual de la DGII.',
        enlace: '/dashboard/secuencias', accion: 'Ir a secuencias',
      });
      continue;
    }
    if (s.disponibles >= 0 && s.disponibles <= UMBRAL_DISPONIBLES) {
      alertas.push({
        id: `secuencia-${s.tipoEcf}-poca`, nivel: 'medio',
        titulo: `Quedan ${s.disponibles} ${plural(s.disponibles, 'número', 'números')} en la secuencia de ${nombre}`,
        detalle: 'Pide un nuevo rango antes de que se agote para no frenar la facturación.',
        enlace: '/dashboard/secuencias', accion: 'Ir a secuencias',
      });
    } else if (s.fechaVencimiento) {
      const faltan = dias(d.hoy, s.fechaVencimiento);
      if (faltan >= 0 && faltan <= DIAS_AVISO) {
        alertas.push({
          id: `secuencia-${s.tipoEcf}-vence`, nivel: 'medio',
          titulo: `La secuencia de ${nombre} vence en ${faltan} ${plural(faltan, 'día', 'días')}`,
          detalle: 'Solicita un nuevo rango en la Oficina Virtual de la DGII antes de que venza.',
          enlace: '/dashboard/secuencias', accion: 'Ir a secuencias',
        });
      }
    }
  }

  const c = d.certificado;
  if (c?.tieneCertificado && c.vencimiento) {
    const faltan = dias(d.hoy, c.vencimiento);
    if (faltan < 0) {
      alertas.push({
        id: 'certificado-vencido', nivel: 'alto', titulo: 'Tu certificado digital está vencido',
        detalle: 'Con un certificado vencido la DGII rechaza los comprobantes. Sube uno vigente.',
        enlace: '/dashboard/certificado', accion: 'Ir al certificado',
      });
    } else if (faltan <= DIAS_AVISO) {
      alertas.push({
        id: 'certificado-vence', nivel: faltan <= 7 ? 'alto' : 'medio',
        titulo: `Tu certificado digital vence en ${faltan} ${plural(faltan, 'día', 'días')}`,
        detalle: 'Renuévalo con tu proveedor y súbelo antes de la fecha para no dejar de emitir.',
        enlace: '/dashboard/certificado', accion: 'Ir al certificado',
      });
    }
  }

  if (d.enProceso > 3) {
    alertas.push({
      id: 'en-proceso', nivel: 'medio',
      titulo: `${d.enProceso} facturas siguen «en proceso» ante la DGII`,
      detalle: 'Suelen resolverse en minutos. Si llevan horas, usa «Consultar DGII» en cada una.',
      enlace: '/dashboard/facturas', accion: 'Ver facturas',
    });
  }

  const peso = (a: Alerta) => (a.nivel === 'alto' ? 0 : 1);
  return alertas.sort((a, b) => peso(a) - peso(b)).slice(0, MAX_ALERTAS);
}
