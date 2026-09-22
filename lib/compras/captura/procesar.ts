import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { capturaFacturas, products, rncPadron, teams } from '@/lib/db/schema';
import { recepciones } from '@/lib/ecf-api/client';
import { leerArchivosDeCaptura } from './archivos';
import { leerQr } from './qr';
import { leerTimbre } from './timbre';
import { combinarDatos, datosDesdeIa, datosDesdeTimbre, emparejarProductos, DATOS_VACIOS, type DatosCaptura } from './datos';
import { iaDisponible, leerFacturaConIa } from './ia';
import { hoyRD } from '@/lib/utils/format';

/**
 * Lee una factura recién fotografiada y la deja «por revisar».
 *
 *  1. El QR del e-CF, si la foto lo trae: RNC, e-NCF, fecha y total exactos.
 *  2. La IA, si está activada: nombre, ITBIS, líneas, forma de pago.
 *  3. El nombre del proveedor del padrón de la DGII si nadie lo leyó.
 *  4. Si el proveedor ya mandó ese e-CF por ecf-api, se enlaza: el registro
 *     sale entero de su XML.
 *
 * Nunca registra nada: eso lo hace una persona desde la bandeja. Un fallo aquí
 * deja la factura por revisar para completarla a mano, jamás la pierde.
 */
export async function procesarCaptura(teamId: number, capturaId: number): Promise<void> {
  const soloSiProcesando = and(eq(capturaFacturas.id, capturaId), eq(capturaFacturas.teamId, teamId), eq(capturaFacturas.estado, 'procesando'));
  try {
    const [team] = await db
      .select({ rnc: teams.rnc, cp: teams.ecfCodigoPublico, nombre: teams.nombreComercial, razon: teams.razonSocial, name: teams.name })
      .from(teams).where(eq(teams.id, teamId)).limit(1);
    const archivos = await leerArchivosDeCaptura(teamId, capturaId);

    let qr: DatosCaptura | null = null;
    for (const a of archivos) {
      if (!a.mime.startsWith('image/')) continue;
      const timbre = leerTimbre(await leerQr(a.buffer));
      if (timbre) { qr = datosDesdeTimbre(timbre, team?.rnc ?? null); break; }
    }

    let ia: DatosCaptura | null = null;
    let error: string | null = null;
    if (iaDisponible() && archivos.length) {
      try {
        ia = datosDesdeIa(await leerFacturaConIa(archivos, { empresa: team?.nombre || team?.razon || team?.name }), hoyRD());
      } catch (e) {
        console.error('[captura-factura] IA', e);
        error = 'La lectura con IA falló; se usó solo lo que se pudo leer.';
      }
    }

    const datos = combinarDatos(qr, ia);

    // Una compra de inventario: cada línea se enlaza con su producto si no hay
    // duda, para que al registrarla sume existencia sin tocar nada.
    if (datos.clase === 'compra' && datos.lineas.length) {
      const catalogo = await db
        .select({ id: products.id, nombre: products.nombre, referencia: products.referencia, codigoBarras: products.codigoBarras })
        .from(products)
        .where(and(eq(products.teamId, teamId), eq(products.tipo, 'bien'), eq(products.activo, 'true')));
      datos.lineas = emparejarProductos(datos.lineas, catalogo);
      // Compra de inventario sin un solo artículo del inventario no es compra de
      // inventario: la IA confunde a menudo lo que se consume con mercancía
      // (champú, comida, papel de oficina). Pasa a gasto y se avisa.
      if (!datos.lineas.some((l) => l.productoId)) {
        datos.clase = 'gasto';
        datos.lineas = datos.lineas.map((l) => (l.categoria === 'costo_venta' ? { ...l, categoria: null } : l));
        if (datos.categoria === 'costo_venta') datos.categoria = null;
        datos.avisos.push('Ningún artículo coincide con tu inventario: se trata como gasto. Si es mercancía, usa «Es compra de inventario».');
      }
    }

    if (datos.proveedorRnc && !datos.proveedorNombre) {
      const [p] = await db.select({ nombre: rncPadron.nombre }).from(rncPadron).where(eq(rncPadron.rnc, datos.proveedorRnc)).limit(1);
      if (p) datos.proveedorNombre = p.nombre;
    }

    if (datos.ncf?.startsWith('E') && team?.cp) {
      try {
        const recibido = (await recepciones.listEcf(team.cp))
          .find((r) => r.eNcf === datos.ncf && (!datos.proveedorRnc || !r.rncEmisor || r.rncEmisor === datos.proveedorRnc));
        if (recibido) datos.ecfRecibidoId = recibido.id;
      } catch {
        // Sin ecf-api se sigue con lo leído de la foto.
      }
    }

    const metodo = qr ? 'qr' : ia ? 'ia' : 'manual';
    if (metodo === 'manual') {
      datos.avisos.unshift(iaDisponible()
        ? 'No se pudo leer la factura: complétala mirando la foto.'
        : 'La foto no trae el QR de un e-CF y la lectura con IA no está activada: complétala mirando la foto.');
    }

    await db.update(capturaFacturas)
      .set({ estado: 'por_revisar', metodo, datos, error, procesadoEn: new Date() })
      .where(soloSiProcesando);
  } catch (e) {
    console.error('[captura-factura] procesar', e);
    await db.update(capturaFacturas)
      .set({
        estado: 'por_revisar', metodo: 'manual', procesadoEn: new Date(), error: String(e).slice(0, 500),
        datos: { ...DATOS_VACIOS, avisos: ['No se pudo leer la foto: complétala a mano.'] },
      })
      .where(soloSiProcesando);
  }
}
