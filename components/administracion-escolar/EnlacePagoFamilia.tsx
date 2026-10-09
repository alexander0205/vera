'use client';

/**
 * El enlace de pago de una familia.
 *
 * Es UNO por responsable, no uno por factura: abre una página donde el padre
 * ve todo lo que debe —de todos sus hijos— y puede subir el comprobante de lo
 * que transfiera. No caduca y es único, así que verlo y tenerlo son la misma
 * cosa; el servidor lo crea al pedirlo si todavía no existía.
 *
 * Vive en la ficha del responsable y no en la del alumno. Puesto junto a un
 * alumno se leía como «el enlace de ESTA factura» —lo primero que preguntó
 * quien lo vio fue a qué factura llevaba— y no lo es. Aquí, al lado de la
 * deuda de la familia entera, su alcance se ve solo.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';

export function EnlacePagoFamilia({ clientId }: { clientId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function pedir() {
    setCargando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/link-pago?clientId=${clientId}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? 'No se pudo obtener el enlace'); return; }
      setUrl(d.url);
      setRef(d.referencia);
    } catch {
      toast.error('No se pudo obtener el enlace');
    } finally {
      setCargando(false);
    }
  }

  // Se pide al abrirlo, no con la ficha: la mayoría de las veces nadie lo mira,
  // y la pantalla ya carga cinco consultas.
  if (!url) {
    return (
      <button type="button" onClick={pedir} disabled={cargando}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zero-600 transition-colors hover:text-zero-800 disabled:opacity-50">
        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {cargando ? 'Buscando…' : 'Ver su enlace de pago'}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
      {/* Qué abre, dicho antes que el enlace: es lo que hay que saber para
          decidir si mandarlo, y lo que evita que se lea como una factura. */}
      <p className="text-[10px] text-gray-500">
        Enlace de pago de la familia · ref. <span className="font-mono font-semibold">{ref}</span>
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-[11px] text-zero-600 hover:underline">{url}</a>
        <button type="button" title="Copiar el enlace"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            } catch { toast.error('No se pudo copiar'); }
          }}
          className={`shrink-0 ${copiado ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-700'}`}>
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-gray-400">
        Lleva todo lo que la familia debe, de todos sus hijos. No caduca.
      </p>
    </div>
  );
}
