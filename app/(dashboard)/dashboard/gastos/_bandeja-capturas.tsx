'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, Camera, FileText, Loader2, QrCode, Sparkles, Trash2, RotateCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { FilaCaptura } from '@/lib/compras/captura/consultas';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const hace = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : fmtFechaCorta(iso);
};

/**
 * «Facturas por revisar»: lo que llegó por el enlace de fotos. Nada de esto está
 * en el 606 ni en la contabilidad todavía; cada una se registra (con la foto al
 * lado) o se descarta.
 *
 * Solo se vuelve a consultar sola mientras hay alguna leyéndose —el resto del
 * tiempo, al volver a la pestaña—: una bandeja abierta todo el día no debe
 * tener despierta la base (ver sondeos de soporte).
 */
export function BandejaCapturas({ inicial }: { inicial: FilaCaptura[] }) {
  const { data, mutate } = useSWR<{ capturas: FilaCaptura[] }>('/api/gastos/capturas?estado=pendientes', fetcher, {
    fallbackData: { capturas: inicial },
    // Con `fallbackData`, SWR no consulta al montarse; y al volver de registrar
    // una factura, `inicial` puede ser la lista de antes. Se consulta siempre.
    revalidateOnMount: true,
  });
  // Mientras alguna factura se está leyendo (con IA tarda unos segundos) se
  // vuelve a consultar cada 3 s; después, nada. Con `refreshInterval` como
  // función SWR calculaba el intervalo con la caché vacía del primer montaje y
  // no lo volvía a programar: la bandeja se quedaba en «Leyendo la factura…».
  const leyendo = (data?.capturas ?? []).some((c) => c.estado === 'procesando');
  useEffect(() => {
    if (!leyendo) return;
    const t = setInterval(() => { void mutate(); }, 3000);
    return () => clearInterval(t);
  }, [leyendo, mutate]);
  // Next conserva montado el componente de una visita anterior y, al volver,
  // SWR se queda con su caché aunque el servidor ya mande otra lista (p. ej.
  // la factura que se acaba de registrar). Lo que llega del servidor manda.
  useEffect(() => {
    void mutate({ capturas: inicial }, { revalidate: false });
  }, [inicial, mutate]);
  const [descartar, setDescartar] = useState<FilaCaptura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const capturas = data?.capturas ?? [];
  if (!capturas.length) return null;

  async function accion(c: FilaCaptura, accion: 'descartar' | 'volver-a-leer') {
    setOcupado(true);
    try {
      const r = await fetch(`/api/gastos/capturas/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'No se pudo');
      toast.success(accion === 'descartar' ? 'Factura descartada' : 'Leyendo la factura otra vez…');
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setOcupado(false);
      setDescartar(null);
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50/40 p-4" data-testid="bandeja-capturas">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Camera className="h-4 w-4 text-amber-600" /> Facturas por revisar
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{capturas.length}</span>
        <span className="font-normal text-gray-500">— llegaron por el enlace de fotos; todavía no están registradas.</span>
      </h2>
      <div className="space-y-2">
        {capturas.map((c) => {
          const d = c.datos;
          const foto = c.archivos.find((a) => a.mime.startsWith('image/'));
          const procesando = c.estado === 'procesando';
          const esCompra = d?.clase === 'compra';
          return (
            <div key={c.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center" data-testid={`captura-${c.id}`}>
              <a href={foto ? `/api/gastos/capturas/${c.id}/archivos/${foto.id}` : undefined} target="_blank" rel="noreferrer"
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-gray-50">
                {foto
                  // eslint-disable-next-line @next/next/no-img-element -- binario privado servido por la API
                  ? <img src={`/api/gastos/capturas/${c.id}/archivos/${foto.id}`} alt="" className="h-full w-full object-cover" />
                  : <FileText className="h-6 w-6 text-gray-400" />}
              </a>
              <div className="min-w-0 flex-1">
                {procesando ? (
                  <p className="flex items-center gap-1.5 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la factura…</p>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium text-gray-900">
                      {d?.proveedorNombre || (d?.proveedorRnc ? `RNC ${d.proveedorRnc}` : 'Proveedor sin leer')}
                      {d?.totalCents != null && <span className="ml-2 font-semibold">{fmtDOP(d.totalCents)}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      <span className="font-mono">{d?.ncf ?? 'NCF sin leer'}</span>
                      {d?.fecha ? ` · ${fmtFechaCorta(d.fecha)}` : ''}
                      {' · '}
                      {c.metodo === 'qr'
                        ? <span className="inline-flex items-center gap-0.5 text-emerald-700"><QrCode className="h-3 w-3" /> QR del e-CF</span>
                        : c.metodo === 'ia'
                          ? <span className="inline-flex items-center gap-0.5 text-sky-700"><Sparkles className="h-3 w-3" /> leída con IA</span>
                          : <span className="text-gray-500">sin leer</span>}
                      {d?.clase && <> · <span className="font-medium text-gray-700">{d.clase === 'compra' ? 'compra de inventario' : 'gasto'}</span></>}
                    </p>
                    {d?.avisos?.[0] && (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />{d.avisos[0]}</p>
                    )}
                  </>
                )}
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {c.subidoPor ? `La envió ${c.subidoPor}` : 'Enviada por enlace'} · {hace(c.creadoEn)}{c.nota ? ` · «${c.nota}»` : ''}
                </p>
              </div>
              {!procesando && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {/* La lectura dice si es gasto o compra de inventario y el botón
                      principal lleva a esa pantalla; el otro queda por si se equivocó. */}
                  <Link href={esCompra ? `/dashboard/compras/registrar?captura=${c.id}` : `/dashboard/gastos/registrar?captura=${c.id}`}
                    data-testid={`registrar-${c.id}`}
                    className="inline-flex h-8 items-center rounded-lg bg-zero-600 px-3 text-xs font-semibold text-white hover:bg-zero-700">
                    {esCompra ? 'Registrar compra' : 'Registrar gasto'}
                  </Link>
                  <Link href={esCompra ? `/dashboard/gastos/registrar?captura=${c.id}` : `/dashboard/compras/registrar?captura=${c.id}`}
                    className="inline-flex h-8 items-center rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    {esCompra ? 'Es un gasto' : 'Es compra de inventario'}
                  </Link>
                  {/* También con lectura: el modelo no lee igual dos veces y una
                      segunda pasada puede sacar lo que la primera no vio. */}
                  <button type="button" onClick={() => accion(c, 'volver-a-leer')} disabled={ocupado} title="Leer otra vez"
                    aria-label="Leer otra vez" data-testid={`releer-${c.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDescartar(c)} disabled={ocupado} aria-label="Descartar" data-testid={`descartar-${c.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={descartar !== null}
        onOpenChange={(o) => !o && setDescartar(null)}
        title="¿Descartar esta factura?"
        description="No se registra. Úsalo si la foto está repetida, no es una factura o no corresponde a la empresa."
        confirmLabel="Descartar"
        destructive
        loading={ocupado}
        onConfirm={() => descartar && accion(descartar, 'descartar')}
      />
    </section>
  );
}
