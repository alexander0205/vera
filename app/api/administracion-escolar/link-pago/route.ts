/**
 * El enlace de pago de un responsable, para poder verlo y mandarlo a mano.
 *
 *   GET ?clientId=N               → { existe:true, url, referencia }  · lo crea si falta
 *   GET ?facturaId=N              → igual, pero la url viene ACOTADA a esa factura
 *                                   (`…/pagar/{token}?f=N`): cobra solo su importe,
 *                                   no toda la deuda de la familia
 *   GET ?clientId=N&consultar=1   → { existe } sin crear nada
 *
 * Lo crea si no existe. No es un efecto raro: el enlace no caduca, es único por
 * responsable y no revela nada por existir — lo que hace falta para verlo es
 * exactamente lo que hace falta para tenerlo.
 *
 * Existe porque el enlace viaja dentro de un aviso automático y hasta ahora no
 * había forma de verlo: si el padre decía que no le llegó, en el colegio no
 * tenían qué mandarle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, ecfDocuments } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { buscarLink, getOCrearLink, urlDelLink } from '@/lib/administracion-escolar/link-pago';
import { origenPublico } from '@/lib/http/origen-publico';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  /**
   * Por factura o por contacto.
   *
   * Desde la pantalla de la factura no se conoce el id del contacto —el detalle
   * solo trae el nombre y el RNC del comprador— y añadirlo al payload por esto
   * sería mover una pieza grande para una acción pequeña. Se resuelve aquí, que
   * además obliga a que la factura sea de este colegio.
   *
   * Se mira el parámetro CRUDO, no el número: `Number(null)` es `0` y
   * `Number.isInteger(0)` es `true`, así que preguntando por el número esta
   * rama se metía también cuando no venía ninguna factura —iba a buscar la
   * factura 0, no la encontraba, y pedir el enlace por contacto contestaba
   * «Esa factura no tiene contacto».
   */
  const crudoFactura = sp.get('facturaId');
  const crudoClient = sp.get('clientId');
  let clientId = crudoClient == null ? NaN : Number(crudoClient);
  // Cuando se pide por factura, el enlace se acota a ESA factura (`?f=`): abre el
  // cobro de su importe, no de todo lo que debe la familia. El enlace por
  // contacto (`clientId`) sigue siendo el agregado de siempre.
  let facturaScopeId: number | null = null;
  if (crudoFactura != null) {
    const facturaId = Number(crudoFactura);
    if (!Number.isInteger(facturaId)) {
      return NextResponse.json({ error: 'facturaId inválido' }, { status: 400 });
    }
    const [doc] = await db
      .select({ clientId: ecfDocuments.clientId })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, facturaId), eq(ecfDocuments.teamId, auth.teamId)))
      .limit(1);
    if (!doc?.clientId) {
      return NextResponse.json(
        { error: 'Esa factura no tiene contacto: no se le puede generar un enlace de pago.' },
        { status: 404 },
      );
    }
    clientId = doc.clientId;
    facturaScopeId = facturaId;
  }
  const sufijoFactura = facturaScopeId != null ? `?f=${facturaScopeId}` : '';

  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: 'Falta clientId o facturaId' }, { status: 400 });
  }

  /**
   * Solo de responsables de ESTE colegio.
   *
   * Sin esta comprobación, cualquiera con sesión podría pedir el enlace de un
   * contacto de otra empresa pasando su id — y el enlace es la credencial de
   * una página que enseña nombres de menores y una deuda.
   */
  const [suyo] = await db
    .select({ id: adminEscolarEstudiantes.id })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.facturarAClientId, clientId),
    ))
    .limit(1);

  if (!suyo) {
    return NextResponse.json(
      { error: 'Ese contacto no es responsable de pago de ningún alumno del colegio' },
      { status: 404 },
    );
  }

  // `?consultar=1` mira sin crear. La pantalla lo usa para poder avisar «esto
  // va a generar un enlace nuevo» ANTES de generarlo: sin esta rama, abrir el
  // menú por curiosidad ya dejaba fila y nadie se enteraba.
  if (sp.get('consultar') === '1') {
    const ya = await buscarLink(auth.teamId, clientId);
    return NextResponse.json(
      ya
        ? { existe: true, url: urlDelLink(ya.token, origenPublico(req)) + sufijoFactura, referencia: ya.referencia }
        : { existe: false },
    );
  }

  const link = await getOCrearLink(auth.teamId, clientId);
  // Desde el origen de ESTA petición: lo que se devuelve aquí es para que
  // alguien lo copie del navegador que lo está pidiendo.
  return NextResponse.json({
    existe: true,
    url: urlDelLink(link.token, origenPublico(req)) + sufijoFactura,
    referencia: link.referencia,
  });
}
