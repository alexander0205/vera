import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { autorizarCapturas } from '@/lib/compras/captura/autorizar';
import { crearEnlace, desactivarEnlace, enlaceVivo } from '@/lib/compras/captura/enlace';
import { origenPublico } from '@/lib/http/origen-publico';

export const dynamic = 'force-dynamic';

const url = (req: NextRequest, token: string) => `${origenPublico(req)}/subir-factura/${token}`;
/** El QR para pegarlo en la oficina o mostrarlo en pantalla: se escanea y abre la página. */
const qr = (u: string) => QRCode.toDataURL(u, { width: 320, margin: 1 });

/** El enlace de la empresa para fotografiar facturas, si hay uno. */
export async function GET(req: NextRequest) {
  const auth = await autorizarCapturas(false);
  if (!auth.ok) return auth.response;
  const e = await enlaceVivo(auth.teamId);
  if (!e) return NextResponse.json({ enlace: null });
  const u = e.token ? url(req, e.token) : null;
  return NextResponse.json({ enlace: { url: u, qr: u ? await qr(u) : null, creadoEn: e.creadoEn, ultimoUsoEn: e.ultimoUsoEn } });
}

/** Crea el enlace o lo cambia por uno nuevo (el anterior deja de abrir). */
export async function POST(req: NextRequest) {
  const auth = await autorizarCapturas(true);
  if (!auth.ok) return auth.response;
  const token = await crearEnlace(auth.teamId, auth.user.id);
  const u = url(req, token);
  return NextResponse.json({ enlace: { url: u, qr: await qr(u), creadoEn: new Date(), ultimoUsoEn: null } }, { status: 201 });
}

/** Desactiva el enlace: nadie más puede subir facturas con él. */
export async function DELETE() {
  const auth = await autorizarCapturas(true);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: await desactivarEnlace(auth.teamId) });
}
