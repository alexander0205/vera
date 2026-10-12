'use client';

import { CalendarDays, Mail, MessageCircle, Receipt, Smartphone, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { sumarDias } from '@/lib/administracion-escolar/calendario';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

/**
 * Qué le va a pasar a esta cuota, en una línea de tiempo.
 *
 * La tabla enseña el monto y el vencimiento, y con eso no se puede contestar lo
 * que la familia pregunta por teléfono: cuándo le llega la factura, hasta
 * cuándo tiene para pagar sin recargo, de cuánto es ese recargo y si le van a
 * avisar. Todo eso ya estaba decidido —en el concepto, en el calendario y en la
 * política de mora del negocio— pero repartido en tres pantallas de
 * configuración distintas.
 *
 * Es de solo lectura a propósito: cambiar cualquiera de estas fechas afecta a
 * todos los alumnos del grado, y ese cambio se hace en Conceptos, no aquí.
 */

export interface ReglasCuota {
  diasParaPago: number | null;
  cobraMora: boolean;
  moraDiasGracia: number;
  avisosActivos: boolean;
  avisoDiaEmision: boolean;
  avisoDiaVencimiento: boolean;
  avisoAntesMoraDias: number | null;
  avisoCorreo: boolean;
  avisoWhatsapp: boolean;
  avisoSms: boolean;
}

export interface CobroDelColegio {
  recargoActivo: boolean;
  recargoModo: string;
  recargoPorcentajeBps: number;
  recargoMontoCentavos: number;
  canales: { correo: boolean; whatsapp: boolean; sms: boolean };
}

export interface CuotaDetallada {
  concepto: string;
  mes: number | null;
  anio: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  reglas: ReglasCuota;
}

/**
 * Por qué canal sale cada aviso. Es el mismo reparto fijo que usa el motor
 * (`CANALES_DEL_AVISO`), repetido aquí porque aquel módulo arrastra la base de
 * datos y esto es un componente de cliente. Si allá cambia, cambia aquí.
 */
const CANALES_POR_AVISO = {
  'al-emitir':  ['correo', 'whatsapp'],
  'al-vencer':  ['correo', 'sms'],
  'antes-mora': ['correo', 'sms'],
} as const;

const CANAL_META = {
  correo:   { label: 'Correo',   icon: Mail },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  sms:      { label: 'SMS',      icon: Smartphone },
} as const;

type Canal = keyof typeof CANAL_META;

interface Hito {
  fecha: string;
  titulo: string;
  detalle: string;
  tono: 'neutro' | 'alerta';
  canales?: Canal[];
}

/** Lo que se le cobra de recargo, con la política del negocio. */
function montoRecargo(monto: number, c: CobroDelColegio): number {
  return c.recargoModo === 'fijo'
    ? c.recargoMontoCentavos
    : Math.round((monto * c.recargoPorcentajeBps) / 10000);
}

export function DetalleCuotaDialog({ cuota, cobro, open, onClose }: {
  cuota: CuotaDetallada | null;
  cobro: CobroDelColegio | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!cuota) return null;
  const r = cuota.reglas;
  const canalesColegio = cobro?.canales ?? { correo: true, whatsapp: true, sms: true };

  // Un canal sale si lo enciende el concepto Y el colegio. Enseñar los del
  // concepto a secas prometería un WhatsApp que el colegio tiene apagado.
  const vivos = (aviso: keyof typeof CANALES_POR_AVISO): Canal[] =>
    CANALES_POR_AVISO[aviso].filter((c) => (
      c === 'correo' ? r.avisoCorreo && canalesColegio.correo
        : c === 'whatsapp' ? r.avisoWhatsapp && canalesColegio.whatsapp
        : r.avisoSms && canalesColegio.sms
    ));

  const hitos: Hito[] = [
    {
      fecha: cuota.fechaEmision,
      titulo: 'Se genera la factura',
      detalle: `${fmtDOP(cuota.montoCentavos)} · desde aquí es deuda`,
      tono: 'neutro',
    },
  ];

  if (r.avisosActivos && r.avisoDiaEmision && vivos('al-emitir').length > 0) {
    hitos.push({
      fecha: cuota.fechaEmision,
      titulo: 'Aviso: ya tienes la factura',
      detalle: 'El mismo día de la emisión',
      tono: 'neutro',
      canales: vivos('al-emitir'),
    });
  }

  // La fecha del recargo: vencimiento + los días de gracia del concepto. Con
  // gracia 0 el recargo entra el mismo día que vence.
  const fechaMora = cuota.fechaVencimiento && r.cobraMora
    ? sumarDias(cuota.fechaVencimiento, Math.max(0, r.moraDiasGracia))
    : null;

  if (r.avisosActivos && r.avisoAntesMoraDias && r.avisoAntesMoraDias > 0
      && fechaMora && r.moraDiasGracia > 0 && vivos('antes-mora').length > 0) {
    hitos.push({
      fecha: sumarDias(fechaMora, -r.avisoAntesMoraDias),
      titulo: 'Aviso: paga antes del recargo',
      detalle: `${r.avisoAntesMoraDias} día(s) antes de que entre`,
      tono: 'neutro',
      canales: vivos('antes-mora'),
    });
  }

  if (cuota.fechaVencimiento) {
    hitos.push({
      fecha: cuota.fechaVencimiento,
      titulo: 'Vence',
      detalle: r.diasParaPago != null
        ? `${r.diasParaPago} día(s) desde que se emite`
        : 'Fecha límite para pagar',
      tono: 'neutro',
    });
    if (r.avisosActivos && r.avisoDiaVencimiento && vivos('al-vencer').length > 0) {
      hitos.push({
        fecha: cuota.fechaVencimiento,
        titulo: 'Aviso: venció hoy',
        detalle: 'El mismo día del vencimiento',
        tono: 'neutro',
        canales: vivos('al-vencer'),
      });
    }
  }

  if (fechaMora) {
    const recargo = cobro?.recargoActivo ? montoRecargo(cuota.montoCentavos, cobro) : null;
    hitos.push({
      fecha: fechaMora,
      titulo: 'Le entra el recargo por mora',
      detalle: recargo != null
        ? `${fmtDOP(recargo)}${cobro?.recargoModo === 'fijo' ? ' (monto fijo)'
            : ` (${(cobro!.recargoPorcentajeBps / 100).toFixed(2)}% del cargo)`}`
        // El concepto dice que cobra mora pero el negocio tiene el recargo
        // apagado: no se inventa un monto, se dice que no va a salir.
        : 'El recargo está apagado en la empresa: no se le va a cobrar',
      tono: recargo != null ? 'alerta' : 'neutro',
    });
  }

  hitos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  const sinAvisos = !r.avisosActivos || hitos.every((h) => !h.canales);

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <ModalHeader
          title={cuota.concepto}
          subtitle={`${fmtDOP(cuota.montoCentavos)} · qué le va a pasar a este cobro`}
        />
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-4">
          <ol className="space-y-3">
            {hitos.map((h, i) => (
              <li key={`${h.fecha}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    h.tono === 'alerta' ? 'bg-red-50 text-red-600' : 'bg-zero-50 text-zero-600'
                  }`}>
                    {h.canales ? <Mail className="h-3.5 w-3.5" />
                      : h.tono === 'alerta' ? <TriangleAlert className="h-3.5 w-3.5" />
                      : i === 0 ? <Receipt className="h-3.5 w-3.5" />
                      : <CalendarDays className="h-3.5 w-3.5" />}
                  </span>
                  {i < hitos.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200" />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium text-gray-900">
                    {fmtFechaCorta(h.fecha)} — {h.titulo}
                  </p>
                  <p className="text-xs text-gray-500">{h.detalle}</p>
                  {h.canales && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {h.canales.map((c) => {
                        const meta = CANAL_META[c];
                        return (
                          <span key={c}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                            <meta.icon className="h-3 w-3" />{meta.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {sinAvisos && (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500">
              A este cobro no le sale ningún recordatorio. Se encienden en
              Configuración → Conceptos, y el canal en Configuración → Avisos.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
