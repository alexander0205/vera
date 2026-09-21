import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes, teams, comprasCapturas } from '@/lib/db/schema';
import { getConfig } from '@/lib/contabilidad/config';
import { recepciones } from '@/lib/ecf-api/client';
import { leerEcfRecibido } from '@/lib/compras/ecf-xml';
import { hoyRD } from '@/lib/utils/format';
import type { TasaItbis } from '@/lib/compras/fiscal';
import type { ContextoRegistro } from './_registrar-client';

/**
 * Lo que el formulario necesita antes de pintarse. Con `ecf` trae el e-CF
 * recibido de ecf-api y lo convierte en un borrador del registro: emisor, NCF,
 * fecha, crédito y líneas con su ITBIS. Con `capturaId`, prellena desde una
 * captura de foto (QR/IA) pendiente de revisar.
 */
export async function contextoRegistro(teamId: number, clase: 'compra' | 'gasto', ecfId: string | null, capturaId: number | null = null): Promise<ContextoRegistro> {
  const [cfg, listaAlmacenes, [team]] = await Promise.all([
    getConfig(teamId),
    db.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes).where(eq(almacenes.teamId, teamId)).orderBy(almacenes.nombre),
    db.select({ rnc: teams.rnc, cp: teams.ecfCodigoPublico }).from(teams).where(eq(teams.id, teamId)).limit(1),
  ]);

  let inicial: ContextoRegistro['inicial'] = null;
  let avisoEcf: string | null = null;
  if (ecfId) {
    try {
      if (!team?.cp) throw new Error('sin contribuyente');
      const item = await recepciones.getEcf(team.cp, ecfId);
      const e = leerEcfRecibido(item.xmlFirmado ?? item.xmlOriginal);
      if (!e) throw new Error('XML ilegible');
      inicial = {
        proveedorRnc: e.rncEmisor ?? item.rncEmisor ?? null,
        proveedorNombre: e.razonSocialEmisor,
        ncf: e.encf ?? item.eNcf ?? null,
        fecha: e.fechaEmision,
        formaPago: e.formaPago,
        fechaVencimiento: e.fechaLimitePago,
        montoTotalCents: e.montoTotalCents,
        lineas: e.lineas,
      };
    } catch {
      avisoEcf = 'No se pudo leer el e-CF recibido: completa los datos a mano.';
    }
  }

  // Prellenado desde una captura de foto. Es un BORRADOR: la tasa de ITBIS de
  // cada línea se pone por defecto (el ticket no la detalla) y el revisor la
  // ajusta. Por eso el aviso.
  let capturaAviso: string | null = null;
  if (!inicial && capturaId) {
    const [cap] = await db
      .select({ extraido: comprasCapturas.extraido, estado: comprasCapturas.estado })
      .from(comprasCapturas)
      .where(and(eq(comprasCapturas.id, capturaId), eq(comprasCapturas.teamId, teamId)))
      .limit(1);
    const e = cap?.extraido;
    if (e) {
      const tasa: TasaItbis = (e.itbisCents ?? 0) > 0 ? '0.18' : '0';
      inicial = {
        proveedorRnc: e.proveedorRnc,
        proveedorNombre: e.proveedorNombre,
        ncf: e.ncf,
        fecha: e.fecha,
        formaPago: 'contado',
        fechaVencimiento: null,
        montoTotalCents: e.totalCents,
        lineas: e.lineas.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          costoUnitarioCents: l.costoUnitarioCents,
          itbisTasa: tasa,
          esServicio: false,
        })),
      };
      capturaAviso = cap.estado === 'registrada'
        ? 'Esta captura ya se registró antes; vas a crear otra compra.'
        : 'Datos leídos de una foto: verifica montos, ITBIS y líneas antes de guardar.';
    }
  }

  return {
    clase,
    regimenItbis: cfg.regimenItbis,
    almacenes: listaAlmacenes,
    rncEmpresa: team?.rnc ?? null,
    hoy: hoyRD(),
    inicial,
    avisoEcf: avisoEcf ?? capturaAviso,
    capturaId: inicial && capturaId ? capturaId : null,
  };
}
