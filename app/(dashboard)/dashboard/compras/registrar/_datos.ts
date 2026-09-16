import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes, teams } from '@/lib/db/schema';
import { getConfig } from '@/lib/contabilidad/config';
import { recepciones } from '@/lib/ecf-api/client';
import { leerEcfRecibido } from '@/lib/compras/ecf-xml';
import { hoyRD } from '@/lib/utils/format';
import type { ContextoRegistro } from './_registrar-client';

/**
 * Lo que el formulario necesita antes de pintarse. Con `ecf` trae el e-CF
 * recibido de ecf-api y lo convierte en un borrador del registro: emisor, NCF,
 * fecha, crédito y líneas con su ITBIS.
 */
export async function contextoRegistro(teamId: number, clase: 'compra' | 'gasto', ecfId: string | null): Promise<ContextoRegistro> {
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

  return {
    clase,
    regimenItbis: cfg.regimenItbis,
    almacenes: listaAlmacenes,
    rncEmpresa: team?.rnc ?? null,
    hoy: hoyRD(),
    inicial,
    avisoEcf,
  };
}
