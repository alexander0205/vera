import { me } from '@/lib/ecf-api/client';
import { Wifi, WifiOff } from 'lucide-react';

/**
 * El estado de la conexión con ecf-api, en la barra lateral. Componente de
 * servidor asíncrono: va dentro de un `<Suspense>` para que la llamada de red
 * no retrase el resto del panel (antes estaba en el layout y cada navegación
 * esperaba a ecf-api).
 */

const caja = 'rounded-lg border px-3 py-2 text-[11px] leading-snug';

export function EstadoEcfApiCargando() {
  return (
    <div className={`${caja} border-white/10 text-slate-400`} aria-busy="true">
      Comprobando ecf-api…
    </div>
  );
}

export async function EstadoEcfApi() {
  let ecf: Awaited<ReturnType<typeof me>> | null = null;
  try {
    ecf = await me();
  } catch (e) {
    console.error('[admin] ecf-api /me error:', e instanceof Error ? e.message : e);
  }

  if (!ecf) {
    return (
      <div className={`${caja} border-red-400/30 bg-red-500/10 text-red-200`} title="Revisa ECF_API_URL y ECF_API_KEY">
        <span className="flex items-center gap-1.5 font-semibold"><WifiOff size={12} /> ecf-api inalcanzable</span>
      </div>
    );
  }
  return (
    <div className={`${caja} border-emerald-400/25 bg-emerald-500/10 text-emerald-200`}>
      <span className="flex items-center gap-1.5 font-semibold"><Wifi size={12} /> ecf-api conectada</span>
      <span className="block text-emerald-300/80">{ecf.software.nombre} v{ecf.software.version} · {ecf.software.ambienteDefault}</span>
    </div>
  );
}
