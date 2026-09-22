import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes, teams } from '@/lib/db/schema';
import { getConfig, cuentasDeGasto } from '@/lib/contabilidad/config';
import { recepciones } from '@/lib/ecf-api/client';
import { leerEcfRecibido } from '@/lib/compras/ecf-xml';
import { hoyRD } from '@/lib/utils/format';
import { detalleCaptura } from '@/lib/compras/captura/consultas';
import { inicialDesdeCaptura } from '@/lib/compras/captura/datos';
import type { ContextoRegistro } from './_registrar-client';

/**
 * Lo que el formulario necesita antes de pintarse. Con `ecf` trae el e-CF
 * recibido de ecf-api y lo convierte en un borrador del registro: emisor, NCF,
 * fecha, crédito y líneas con su ITBIS.
 */
export async function contextoRegistro(
  teamId: number, clase: 'compra' | 'gasto', ecfIdPedido: string | null, capturaId: number | null = null,
): Promise<ContextoRegistro> {
  const [cfg, listaAlmacenes, [team], cuentaPorCategoria, cuentasGasto] = await Promise.all([
    getConfig(teamId),
    db.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes).where(eq(almacenes.teamId, teamId)).orderBy(almacenes.nombre),
    db.select({ rnc: teams.rnc, cp: teams.ecfCodigoPublico }).from(teams).where(eq(teams.id, teamId)).limit(1),
    // A qué cuenta va cada categoría en esta empresa, y las cuentas entre las
    // que se puede cambiar: gasto, costo y activo (una compra de activo fijo no
    // es gasto). Un pasivo o un ingreso ahí solo sería un error.
    cuentasDeGasto(teamId),
    db.execute(sql`
      SELECT id, codigo, nombre FROM contabilidad_cuentas
      WHERE team_id = ${teamId} AND imputable AND activa AND tipo IN ('gasto', 'costo', 'activo')
      ORDER BY codigo
    `) as unknown as Promise<{ id: number; codigo: string; nombre: string }[]>,
  ]);

  let inicial: ContextoRegistro['inicial'] = null;
  let avisoEcf: string | null = null;
  let captura: ContextoRegistro['captura'] = null;
  let avisosCaptura: string[] = [];
  let ecfId = ecfIdPedido;

  // Una factura fotografiada: si el proveedor ya mandó ese e-CF por ecf-api se
  // registra desde su XML (líneas e ITBIS exactos); si no, con lo leído.
  if (capturaId) {
    const c = await detalleCaptura(teamId, capturaId);
    if (!c) {
      avisoEcf = 'No se encontró la factura fotografiada.';
    } else if (c.estado !== 'por_revisar') {
      avisoEcf = c.estado === 'registrada'
        ? 'Esta factura fotografiada ya se registró.'
        : c.estado === 'descartada' ? 'Esta factura fotografiada se descartó.' : 'Esta factura todavía se está leyendo: espera unos segundos y vuelve a abrirla.';
    } else {
      captura = { id: c.id, metodo: c.metodo, subidoPor: c.subidoPor, archivos: c.archivos };
      if (c.datos?.ecfRecibidoId && !ecfId) {
        ecfId = c.datos.ecfRecibidoId;
        avisosCaptura = ['El proveedor ya envió este e-CF: los datos salen de su XML.'];
      } else if (c.datos) {
        const r = inicialDesdeCaptura(c.datos);
        inicial = r.inicial;
        avisosCaptura = r.avisos;
      } else {
        avisosCaptura = ['No se pudo leer la factura: complétala mirando la foto.'];
      }
    }
  }

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
    cuentasGasto: [...cuentasGasto],
    cuentaPorCategoria,
    rncEmpresa: team?.rnc ?? null,
    hoy: hoyRD(),
    inicial,
    avisoEcf,
    captura,
    avisosCaptura,
  };
}
