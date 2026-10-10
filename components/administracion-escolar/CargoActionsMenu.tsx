'use client';

/**
 * El menú ⋮ de un cargo escolar: las trece cosas que se pueden hacer con él.
 *
 * Vivía dentro de la pantalla del período de la ficha del estudiante. Salió de
 * ahí porque la ficha de la FAMILIA enseña esos mismos cargos y solo dejaba
 * cobrarlos: con una copia del menú en cada pantalla, las dos acabarían
 * ofreciendo cosas distintas sobre el mismo cargo.
 *
 * QUÉ acciones tocan no se decide aquí: lo dice `accionesDeCargo`, que es puro
 * y tiene sus pruebas. Aquí solo está cómo se pinta cada una y a quién se
 * llama. Lo que abre un diálogo o cambia datos llega por callbacks; las cuatro
 * que solo navegan o abren el PDF se resuelven en el propio menú.
 *
 * Es genérico en el tipo del cargo a propósito: cada pantalla tiene el suyo
 * —con más campos que los que el menú lee— y así sigue pasando sus manejadores
 * `(cargo: SuCargo) => void` sin tocar un tipo.
 */

import { useRouter } from 'next/navigation';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { AlertTriangle, Ban, ExternalLink, FileText, Link2, Mail, MessageCircle, MoreVertical, Printer, Receipt, Send, Wallet } from 'lucide-react';
import { accionesDeCargo, type CargoAccionable } from '@/lib/administracion-escolar/acciones-cargo';

export function CargoActionsMenu<C extends CargoAccionable>({ cargo, puedePagos, puedeFacturar, puedeGestionar, mesTieneFactura, onRegistrarPago, onAplicarMora, onCrearFactura, onVerFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onReenviarAviso, aplicandoMora, reenviando }: {
  cargo: C;
  puedePagos: boolean;
  puedeFacturar: boolean;
  puedeGestionar: boolean;
  /** Solo mensualidades: el MES ya tiene una factura en otro de sus cargos.
   *  Bloquea "Anular cargo" aunque este cargo suelto no tenga factura. */
  mesTieneFactura?: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: C) => void;
  /** Abre la factura en el cajón, sin salir de la ficha de la familia. */
  onVerFactura: (documentoId: number) => void;
  onVincular: (cargo: C) => void;
  onAnular: (cargo: C) => void;
  onAnularFactura: (cargo: C) => void;
  onEnviarCorreo: (cargo: C) => void;
  /** Reenvía el aviso por WhatsApp. Solo tiene sentido con factura emitida. */
  onReenviarAviso: (cargoId: number) => void;
  aplicandoMora: boolean;
  reenviando: boolean;
}) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const a = new Set(accionesDeCargo(cargo, {
    pagos: puedePagos,
    facturar: puedeFacturar,
    gestionar: puedeGestionar,
    anularFactura: permissions.includes('facturas:anular'),
    emitirDgii: permissions.includes('facturas:emitir-dgii'),
  }, { mesTieneFactura }));
  // El PDF se pide por código cuando lo hay, igual que en la pantalla de la
  // factura: es lo que sale impreso y lo que la familia reconoce.
  const refPdf = cargo.facturaCodigo ?? cargo.ecfDocumentId;
  if (a.size === 0) return <span className="text-gray-300 text-xs">—</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones de ${cargo.concepto ?? 'cargo'}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 data-[state=open]:bg-gray-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {a.has('registrar-pago') && (
          <DropdownMenuItem onSelect={() => onRegistrarPago(cargo.ecfDocumentId!)}>
            <Wallet className="h-4 w-4" />Registrar pago
          </DropdownMenuItem>
        )}
        {/* Solo con factura: el aviso lleva el enlace de pago, y sin factura
            ese enlace lleva a una página donde el padre transfiere para que
            nadie pueda aplicarlo. */}
        {a.has('reenviar-whatsapp') && (
          <DropdownMenuItem disabled={reenviando} onSelect={() => onReenviarAviso(cargo.id)}>
            <MessageCircle className="h-4 w-4" />
            {reenviando ? 'Enviando…' : 'Reenviar por WhatsApp'}
          </DropdownMenuItem>
        )}
        {a.has('mora') && (
          <DropdownMenuItem disabled={aplicandoMora} onSelect={() => onAplicarMora(cargo.ecfDocumentId!)}>
            <AlertTriangle className="h-4 w-4" />{aplicandoMora ? 'Generando mora…' : 'Cargo por mora'}
          </DropdownMenuItem>
        )}
        {a.has('facturar') && (
          <DropdownMenuItem onSelect={() => onCrearFactura(cargo)}>
            <Receipt className="h-4 w-4" />Facturar
          </DropdownMenuItem>
        )}
        {/* Vincular ata el cargo a una factura existente vía el endpoint
            `saldar-con-factura`, que pide permiso de pagos —no de facturar—:
            se gatea por `puedePagos` para no ofrecer un botón que daría 403. */}
        {a.has('vincular') && (
          <DropdownMenuItem onSelect={() => onVincular(cargo)}>
            <Link2 className="h-4 w-4" />Vincular factura
          </DropdownMenuItem>
        )}
        {/* Antes esto solo salía cuando NO se podía cobrar ni facturar, así que
            un usuario con permisos no tenía por dónde abrir la factura del mes:
            la veía en la columna pero el menú no la ofrecía. */}
        {a.has('ver-factura') && (
          <DropdownMenuItem onSelect={() => onVerFactura(cargo.ecfDocumentId!)}>
            <Receipt className="h-4 w-4" />Ver factura
          </DropdownMenuItem>
        )}
        {/* Salir a Facturación es OTRA cosa que ver la factura: se va de la
            ficha de la familia. Se queda, pero dicho con su nombre. */}
        {a.has('abrir-facturacion') && (
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/facturas/${cargo.ecfDocumentId}`)}>
            <ExternalLink className="h-4 w-4" />Abrir en Facturación
          </DropdownMenuItem>
        )}
        {/* Ver el PDF e imprimirlo no necesitan salir de aquí: son dos rutas que
            devuelven el documento ya armado. Ir a la pantalla de la factura solo
            para descargarlo era un rodeo. */}
        {a.has('ver-pdf') && (
          <DropdownMenuItem onSelect={() => window.open(`/api/pdf/factura/${refPdf}`, '_blank', 'noreferrer')}>
            <FileText className="h-4 w-4" />Ver PDF
          </DropdownMenuItem>
        )}
        {a.has('imprimir') && (
          <DropdownMenuItem onSelect={() => window.open(`/api/pdf/factura/${refPdf}/ticket`, '_blank', 'noreferrer')}>
            <Printer className="h-4 w-4" />Imprimir
          </DropdownMenuItem>
        )}
        {/* Emitir SÍ manda a la pantalla de la factura: la DGII pide elegir
            secuencia y a veces completar datos del comprador, y eso no cabe en
            un menú. El `?emitir=1` abre allí el modal directo. */}
        {a.has('emitir-dgii') && (
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/facturas/${cargo.ecfDocumentId}?emitir=1`)}>
            <Send className="h-4 w-4" />Emitir en DGII
          </DropdownMenuItem>
        )}
        {a.has('enviar-correo') && (
          <DropdownMenuItem onSelect={() => onEnviarCorreo(cargo)}>
            <Mail className="h-4 w-4" />Enviar por correo
          </DropdownMenuItem>
        )}
        {a.has('anular-cargo') && (
          <DropdownMenuItem
            onSelect={() => onAnular(cargo)}
            className="text-red-600 focus:text-red-600"
          >
            <Ban className="h-4 w-4" />Anular cargo
          </DropdownMenuItem>
        )}
        {/* Anular la FACTURA es otra cosa que anular el cargo, y pesa más: toca
            un documento fiscal. Por eso va detrás de su propio permiso, que el
            servidor vuelve a comprobar. */}
        {a.has('anular-factura') && (
          <DropdownMenuItem
            onSelect={() => onAnularFactura(cargo)}
            className="text-red-600 focus:text-red-600"
          >
            <Ban className="h-4 w-4" />Anular factura
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
