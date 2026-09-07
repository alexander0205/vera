'use client';

/**
 * Copiar el enlace de pago del responsable, desde cualquier tabla del colegio.
 *
 * El enlace es del RESPONSABLE, no del cargo ni del estudiante: un padre con
 * tres hijos tiene uno solo. Por eso el botón pide `clientId` —o la factura, y
 * el servidor resuelve el responsable— y no el id del alumno.
 *
 * Avisa ANTES de crear. Ver un enlace y generarlo son la misma acción en el
 * servidor, así que sin este paso abrir el menú por curiosidad dejaba fila y
 * nadie se enteraba. Primero se consulta sin crear; si no hay, se pregunta.
 *
 * No caduca ni revela nada por existir: quien puede verlo es quien ya podía
 * cobrarle a esa familia. Lo que se cuida no es el secreto, es la sorpresa.
 */

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Props = {
  /** El responsable de pago. Uno de los dos es obligatorio. */
  clientId?: number | null;
  /** O la factura, y el servidor resuelve el responsable. */
  facturaId?: number | null;
  /** Para el texto del aviso: «… de María Peña». */
  nombre?: string | null;
  /** `menu` pinta una fila de menú; `boton` un botón suelto. */
  como?: 'menu' | 'boton';
  /** En tablas densas: conserva accesibilidad, ahorra el texto visible. */
  soloIcono?: boolean;
  className?: string;
};

async function pedir(qs: string): Promise<{ existe: boolean; url?: string; referencia?: string }> {
  const r = await fetch(`/api/administracion-escolar/link-pago?${qs}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? 'No se pudo obtener el enlace');
  return j;
}

/**
 * Copiar al portapapeles sin romperse fuera de HTTPS.
 *
 * `navigator.clipboard` no existe en contextos no seguros —una IP en la red
 * local, por ejemplo— y ahí la acción fallaba en silencio. El respaldo es feo
 * pero funciona en todas partes.
 */
async function alPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopiarLinkPago({ clientId, facturaId, nombre, como = 'menu', soloIcono = false, className }: Props) {
  const [cargando, setCargando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);

  const qs = facturaId ? `facturaId=${facturaId}` : `clientId=${clientId}`;
  const inutil = !clientId && !facturaId;

  async function copiar(url: string, referencia?: string, nuevo = false) {
    const ok = await alPortapapeles(url);
    if (!ok) {
      toast.error('No se pudo copiar', { description: url });
      return;
    }
    toast.success(nuevo ? 'Enlace creado y copiado' : 'Enlace copiado', {
      description: referencia ? `Referencia ${referencia}` : undefined,
    });
  }

  async function alHacerClic(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (inutil || cargando) return;
    setCargando(true);
    try {
      const r = await pedir(`${qs}&consultar=1`);
      if (r.existe && r.url) {
        await copiar(r.url, r.referencia);
      } else {
        setPreguntando(true);   // no hay: se avisa antes de crear
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo obtener el enlace');
    } finally {
      setCargando(false);
    }
  }

  async function crearYCopiar() {
    setPreguntando(false);
    setCargando(true);
    try {
      const r = await pedir(qs);
      if (r.url) await copiar(r.url, r.referencia, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el enlace');
    } finally {
      setCargando(false);
    }
  }

  const icono = cargando
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <Link2 className="h-4 w-4" />;

  return (
    <>
      {como === 'menu' ? (
        <div
          role="menuitem"
          tabIndex={0}
          onClick={alHacerClic}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') alHacerClic(); }}
          className={`relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus:bg-accent ${inutil ? 'pointer-events-none opacity-50' : ''} ${className ?? ''}`}
        >
          {icono}Copiar link de pago
        </div>
      ) : (
        <button
          type="button"
          onClick={alHacerClic}
          disabled={inutil || cargando}
          aria-label="Copiar link de pago"
          title="Copiar link de pago"
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50 ${soloIcono ? 'h-7 w-7 justify-center p-0' : ''} ${className ?? ''}`}
        >
          {icono}{!soloIcono && <span className="hidden sm:inline">Link de pago</span>}
        </button>
      )}

      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        title="Todavía no hay enlace de pago"
        icon={<Link2 className="h-5 w-5" />}
        description={
          <>
            Se va a crear el enlace de pago{nombre ? <> de <strong>{nombre}</strong></> : ' de este responsable'} y
            se copiará al portapapeles. Es permanente y el mismo que viaja en los avisos automáticos:
            si se lo manda hoy, le va a servir todo el año.
          </>
        }
        confirmLabel="Crear y copiar"
        onConfirm={crearYCopiar}
        loading={cargando}
      />
    </>
  );
}
