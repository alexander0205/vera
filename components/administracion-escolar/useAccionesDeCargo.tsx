'use client';

/**
 * Lo que HACE cada acción del menú ⋮ de un cargo, y los diálogos con que lo hace.
 *
 * Todo esto vivía suelto dentro de la ficha del estudiante: catorce estados,
 * siete funciones y siete diálogos entre el resto de la página. La ficha de la
 * FAMILIA necesita exactamente lo mismo —cobrar, mora, vincular, anular, correo,
 * WhatsApp, ver la factura— y copiarlo allí era tener dos cobros y dos
 * anulaciones que mantener iguales a mano.
 *
 * Devuelve dos cosas, y hacen falta las dos:
 *
 *  · `acciones`: los manejadores que se le pasan al menú;
 *  · `dialogos`: lo que esos manejadores abren. La página lo pinta UNA vez con
 *    `{dialogos}`. Si falta, el menú sale y sus acciones no hacen nada, sin
 *    ningún error.
 *
 * Los diálogos van en la página y no junto a las tablas porque las tablas viven
 * dentro de una pestaña, y una pestaña que no está activa no se pinta: se
 * cerrarían solos al cambiar de pestaña.
 *
 * Es un hook: se llama antes de cualquier `return` temprano de la página.
 *
 * No sabe de qué pantalla lo llaman. Recibe a quién se le factura —para buscar
 * sus facturas al vincular— y `onCambio`, que es como cada pantalla refresca lo
 * suyo después de algo que tocó datos.
 */

import { useCallback, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Ban, Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalHeader } from '@/components/ui/modal-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fmtDOP } from '@/lib/utils/format';

import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { ReenviarAvisoDialog } from '@/components/administracion-escolar/ReenviarAvisoDialog';
import type { Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import type { CargoAccionable } from '@/lib/administracion-escolar/acciones-cargo';

/**
 * El modal de cobro arrastra diecisiete componentes de MUI entre él y su
 * selector de métodos de pago. Importado de forma normal, todo eso viajaba en
 * el paquete inicial de la ficha del estudiante, que se abre muchas veces al
 * día, para un diálogo que se abre pocas. Se carga cuando hace falta.
 */
const PagoModal = dynamic(
  () => import('@/components/cuentas-por-cobrar/PagoModal').then((m) => m.PagoModal),
  { ssr: false },
);

/**
 * El cajón de «Ver factura» monta la pantalla entera de una factura, que es de
 * las más pesadas del sistema: no debe viajar en el paquete inicial de ninguna
 * de las dos fichas. Como el cajón está siempre montado —cerrado—, su trozo se
 * descarga por detrás nada más abrir la página, y al cerrarlo se conserva la
 * animación.
 */
const VerFacturaDrawer = dynamic(
  () => import('@/components/administracion-escolar/VerFacturaDrawer').then((m) => m.VerFacturaDrawer),
  { ssr: false },
);

// Declarado aquí y no importado de la pantalla del período: ese módulo son
// miles de líneas, y la ficha de la familia se las llevaría enteras por doce
// nombres de mes.
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Lo que se le pasa al menú de un cargo, y a las tablas que lo pintan. */
export interface AccionesDeCargo {
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onVerFactura: (documentoId: number) => void;
  onVincular: (cargo: CargoAccionable) => void;
  onAnular: (cargo: CargoAccionable) => void;
  onAnularFactura: (cargo: CargoAccionable) => void;
  onEnviarCorreo: (cargo: CargoAccionable) => void;
  /** Manda por correo una factura suelta, sin cargo detrás. */
  onEnviarFactura: (ecfDocumentId: number, etiqueta: string) => void;
  onReenviarAviso: (cargoId: number) => void;
  aplicandoMoraFacturaId: number | null;
  reenviandoCargoId: number | null;
}

export function useAccionesDeCargo({ clienteId, onCambio }: {
  /** El contacto al que se le factura. Null si aún no hay: no hay dónde buscar facturas. */
  clienteId: number | null;
  /** Refresca la pantalla. Se llama después de todo lo que cambia datos. */
  onCambio: () => void | Promise<void>;
}): { acciones: AccionesDeCargo; dialogos: ReactNode } {
  const [cargoVincularFactura, setCargoVincularFactura] = useState<CargoAccionable | null>(null);

  // Modal de cobro in-place: reutiliza el PagoModal de Cuentas por Cobrar sin
  // salir del perfil. El flujo de datos es el mismo (registra en la factura).
  const [pagoCuenta, setPagoCuenta] = useState<Cuenta | null>(null);
  const [cargandoPago, setCargandoPago] = useState(false);
  const [aplicandoMoraFacturaId, setAplicandoMoraFacturaId] = useState<number | null>(null);
  /**
   * El cargo cuyo aviso se está por reenviar.
   *
   * Abre un diálogo en vez de mandar: esto le escribe a una familia real y el
   * texto cambia según la mora del concepto. Quien pulsa tiene que leer antes
   * lo que va a salir y a qué número.
   */
  const [reenviandoCargoId, setReenviandoCargoId] = useState<number | null>(null);
  const [cargoAnular, setCargoAnular] = useState<CargoAccionable | null>(null);
  // La mora se confirma antes de crearla: el cron la aplica solo, y el usuario
  // tiene que saberlo antes de adelantarse a mano.
  const [moraFacturaId, setMoraFacturaId] = useState<number | null>(null);
  const [facturaAnular, setFacturaAnular] = useState<CargoAccionable | null>(null);
  const [anulandoFactura, setAnulandoFactura] = useState(false);
  const [anulando, setAnulando] = useState(false);

  // Enviar la factura por correo desde la ficha. El destinatario se trae del
  // comprador de la factura —que puede no ser el tutor, si se factura a la
  // empresa del padre— y se deja editable: quien envía tiene que ver a dónde va.
  /**
   * La factura que se va a mandar por correo.
   *
   * Guarda el DOCUMENTO y no el cargo: el mismo diálogo sirve ahora para las
   * facturas hechas en Facturación, que no cuelgan de ningún cargo y antes no
   * se podían mandar desde aquí.
   */
  const [correoCargo, setCorreoCargo] = useState<{ ecfDocumentId: number; etiqueta: string } | null>(null);
  const [correoEmail, setCorreoEmail] = useState('');
  const [correoCargando, setCorreoCargando] = useState(false);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  /**
   * La factura que se está mirando en el cajón. `null` = cerrado.
   *
   * Se ve aquí y no saltando a `/dashboard/facturas/[id]` por el mismo motivo
   * que crear una factura se hace en un cajón: mirar una factura del colegio
   * empieza en el estado de cuenta de la familia, y al cambiar de pantalla esa
   * información se pierde justo cuando hace falta. Salir a Facturación sigue
   * estando, con su nombre: «Abrir en Facturación».
   */
  const [facturaEnCajon, setFacturaEnCajon] = useState<number | null>(null);

  const abrirCorreoFactura = useCallback(async (ecfDocumentId: number, etiqueta: string) => {
    setCorreoCargo({ ecfDocumentId, etiqueta });
    setCorreoEmail('');
    setCorreoCargando(true);
    try {
      const res = await fetch(`/api/facturas/${ecfDocumentId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCorreoEmail(data.comprador?.email ?? '');
    } finally {
      setCorreoCargando(false);
    }
  }, []);

  /** Desde un cargo: se manda su factura, con el concepto en el texto. */
  const abrirCorreo = useCallback((cargo: CargoAccionable) => {
    if (!cargo.ecfDocumentId) return;
    void abrirCorreoFactura(
      cargo.ecfDocumentId,
      `${cargo.facturaEncf || cargo.facturaCodigo || 'la factura'} de «${cargo.concepto ?? 'este cargo'}»`,
    );
  }, [abrirCorreoFactura]);

  const enviarCorreo = useCallback(async () => {
    if (!correoCargo || !correoEmail.trim()) return;
    setEnviandoCorreo(true);
    try {
      const res = await fetch(`/api/facturas/${correoCargo.ecfDocumentId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correoEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la factura');
      toast.success('Factura enviada por correo');
      setCorreoCargo(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la factura');
    } finally {
      setEnviandoCorreo(false);
    }
  }, [correoCargo, correoEmail]);

  const abrirPago = useCallback(async (ecfDocumentId: number) => {
    setCargandoPago(true);
    try {
      const res = await fetch(`/api/cuentas-por-cobrar/${ecfDocumentId}`);
      const json = await res.json();
      if (!res.ok || !json.cuenta) {
        toast.error(json.error ?? 'No se pudo cargar la factura para cobrar');
        return;
      }
      setPagoCuenta(json.cuenta);
    } catch {
      toast.error('No se pudo cargar la factura para cobrar');
    } finally {
      setCargandoPago(false);
    }
  }, []);

  // La mora pertenece al motor de facturación: crea una ND tipo 33 sobre la
  // factura del cargo. El perfil escolar nunca calcula ni persiste mora propia.
  const aplicarMora = useCallback(async (ecfDocumentId: number) => {
    setAplicandoMoraFacturaId(ecfDocumentId);
    try {
      const res = await fetch(`/api/facturas/${ecfDocumentId}/nota-debito-mora`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.info(data.error ?? 'Ya existe un cargo por mora para esta factura');
        return;
      }
      if (!res.ok) {
        if (res.status === 422) {
          toast.error(data.error ?? 'La factura no tiene saldo o el porcentaje de mora es cero');
          return;
        }
        throw new Error(data.error ?? 'No se pudo generar el cargo por mora');
      }
      toast.success('Cargo por mora generado');
      await onCambio();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el cargo por mora');
    } finally {
      setAplicandoMoraFacturaId(null);
    }
  }, [onCambio]);

  /**
   * Anula la FACTURA del cargo, no el cargo.
   *
   * Son dos cosas distintas y por eso están separadas en el menú: anular el
   * cargo dice "esta deuda no existía"; anular la factura dice "el documento
   * estaba mal". Lo segundo toca el motor de facturación y solo puede hacerlo
   * quien tenga `facturas:anular`, que el servidor vuelve a comprobar.
   */
  const anularFactura = useCallback(async () => {
    if (!facturaAnular?.ecfDocumentId) return;
    setAnulandoFactura(true);
    try {
      const res = await fetch(`/api/facturas/${facturaAnular.ecfDocumentId}/anular`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo anular la factura');
      toast.success('Factura anulada');
      setFacturaAnular(null);
      // El refresco no se espera: ya está anulada y el diálogo cerrado. En la
      // ficha de la familia refrescar son dos consultas seguidas, y mientras
      // duraban, «Anular la factura» de OTRO cargo se abría con los botones
      // apagados, como si ya se estuviera anulando sin haberlo confirmado.
      void onCambio();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular la factura');
    } finally {
      setAnulandoFactura(false);
    }
  }, [onCambio, facturaAnular]);

  // Anula un cargo puesto por error (soft-delete en el backend). El backend
  // bloquea (409) los cargos con factura vinculada: hay que desvincular primero.
  // La confirmación vive en un modal propio (ConfirmarAnularDialog), no en el
  // window.confirm nativo del navegador.
  const confirmarAnular = useCallback(async () => {
    if (!cargoAnular) return;
    setAnulando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/cargos/${cargoAnular.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo anular el cargo');
      toast.success('Cargo anulado');
      setCargoAnular(null);
      // Sin esperar el refresco, por lo mismo que al anular la factura: con dos
      // cargos duplicados, el diálogo del segundo salía diciendo «Anulando…» y
      // sin dejar cancelar mientras se refrescaba la anulación del primero.
      void onCambio();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular el cargo');
    } finally {
      setAnulando(false);
    }
  }, [onCambio, cargoAnular]);

  const acciones: AccionesDeCargo = {
    onRegistrarPago: abrirPago,
    onAplicarMora: setMoraFacturaId,
    onVerFactura: setFacturaEnCajon,
    onVincular: setCargoVincularFactura,
    onAnular: setCargoAnular,
    onAnularFactura: setFacturaAnular,
    onEnviarCorreo: abrirCorreo,
    onEnviarFactura: (id, etiqueta) => void abrirCorreoFactura(id, etiqueta),
    onReenviarAviso: setReenviandoCargoId,
    aplicandoMoraFacturaId,
    reenviandoCargoId,
  };

  const dialogos = (
    <>
      {/* Al cerrar se refresca: dentro del cajón está la pantalla entera de la
          factura, y desde ahí se puede anular, emitir y aplicar la mora. Sin
          refrescar, las filas de detrás seguían enseñando la factura de antes. */}
      <VerFacturaDrawer
        documentoId={facturaEnCajon}
        onCerrar={() => { setFacturaEnCajon(null); void onCambio(); }}
      />

      {/* Enseña el aviso ANTES de mandarlo: esto le escribe a una familia
          real y el texto cambia según la mora del concepto. */}
      <ReenviarAvisoDialog
        cargoId={reenviandoCargoId}
        abierto={reenviandoCargoId != null}
        onCerrar={() => setReenviandoCargoId(null)}
        onEnviado={() => { void onCambio(); }}
      />

      {cargoVincularFactura && (
        <VincularFacturaDialog
          cargoId={cargoVincularFactura.id}
          cargoLabel={`${cargoVincularFactura.concepto ?? 'Cargo'}${cargoVincularFactura.mes ? ` ${MESES[cargoVincularFactura.mes]}` : ''}`}
          cargoSaldoCentavos={cargoVincularFactura.saldoCentavos}
          clienteId={clienteId}
          open={!!cargoVincularFactura}
          onClose={() => setCargoVincularFactura(null)}
          onSaved={onCambio}
        />
      )}

      {/* Cobro in-place: mismo modal de Cuentas por Cobrar, sin salir del perfil. */}
      {cargandoPago && !pagoCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-zero-600" />
        </div>
      )}
      {pagoCuenta && (
        <PagoModal
          cuenta={pagoCuenta}
          onClose={() => setPagoCuenta(null)}
          onSuccess={() => { setPagoCuenta(null); void onCambio(); }}
        />
      )}

      <ConfirmarAnularDialog
        cargo={cargoAnular}
        anulando={anulando}
        onCancel={() => { if (!anulando) setCargoAnular(null); }}
        onConfirm={confirmarAnular}
      />

      {/* La mora la aplica un cron cada mañana sobre lo vencido. Hacerlo a mano
          es adelantarse, no algo distinto, y quien pulsa tiene que saberlo:
          si no, acaba pensando que sin este botón nadie cobra el recargo. */}
      <Dialog open={moraFacturaId !== null} onOpenChange={(o) => { if (!o) setMoraFacturaId(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Generar el cargo por mora ahora"
            subtitle={
              'El sistema aplica la mora solo, cada día, a lo que esté vencido y según el porcentaje '
              + 'configurado. Esto lo adelanta para esta factura: se crea una nota de débito por el recargo. '
              + 'Si ya existe una, no se duplica.'
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoraFacturaId(null)}>Cancelar</Button>
            <Button onClick={() => { const f = moraFacturaId; setMoraFacturaId(null); if (f) void aplicarMora(f); }}>
              Generar mora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!facturaAnular} onOpenChange={(o) => { if (!o && !anulandoFactura) setFacturaAnular(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Anular la factura"
            subtitle={facturaAnular
              ? `Se anula ${facturaAnular.facturaEncf || facturaAnular.facturaCodigo || 'la factura'} `
                // En plural a propósito: una factura hecha con «Facturar juntos»
                // cubre cargos de varios hermanos, y anularla los devuelve TODOS
                // a «sin facturar», no solo el de la fila que se pulsó.
                + `de «${facturaAnular.concepto ?? 'este cargo'}». Los cargos que cubre esa factura `
                + '—puede haber más de uno, y de más de un hijo— se quedan y vuelven a estar '
                + 'pendientes de facturar. Esto no se deshace.'
              : undefined}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFacturaAnular(null)} disabled={anulandoFactura}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={anularFactura} disabled={anulandoFactura}>
              {anulandoFactura && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anular factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enviar la factura por correo. El destinatario llega del comprador de la
          factura, pero se puede cambiar antes de mandar: el envío sale a nombre
          del colegio y no debe salir a ciegas. */}
      <Dialog open={!!correoCargo} onOpenChange={(o) => { if (!o && !enviandoCorreo) setCorreoCargo(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Enviar factura por correo"
            subtitle={correoCargo
              ? `Se envía ${correoCargo.etiqueta} en PDF adjunto.`
              : undefined}
          />
          <div className="space-y-1.5 px-6 py-2">
            <Label htmlFor="correo-factura">Correo del destinatario</Label>
            <Input
              id="correo-factura"
              type="email"
              value={correoEmail}
              placeholder={correoCargando ? 'Buscando el correo…' : 'nombre@correo.com'}
              onChange={(e) => setCorreoEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorreoCargo(null)} disabled={enviandoCorreo}>
              Cancelar
            </Button>
            <Button onClick={enviarCorreo} disabled={enviandoCorreo || correoCargando || !correoEmail.trim()}>
              {enviandoCorreo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Mail className="mr-1.5 h-4 w-4" />Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { acciones, dialogos };
}

// Confirmación de anular un cargo, con la estética de la app (Dialog + Button)
// en vez del window.confirm nativo del navegador.
function ConfirmarAnularDialog({ cargo, anulando, onCancel, onConfirm }: {
  cargo: CargoAccionable | null;
  anulando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = cargo
    ? `${cargo.concepto ?? 'Cargo'}${cargo.mes ? ` · ${MESES[cargo.mes]} ${cargo.anio}` : ''}`
    : '';
  return (
    <Dialog open={!!cargo} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Ban className="h-5 w-5" />
            </span>
            <DialogTitle>Anular cargo</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Vas a anular <span className="font-medium text-gray-900">{label}</span>{cargo ? <> por <span className="font-medium text-gray-900">{fmtDOP(cargo.montoCentavos)}</span></> : null}.</p>
          <p>Dejará de contar en la deuda del estudiante. Esta acción no se puede deshacer.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={anulando}>Cancelar</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={onConfirm} disabled={anulando}>
            {anulando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Anulando…</> : 'Anular cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
