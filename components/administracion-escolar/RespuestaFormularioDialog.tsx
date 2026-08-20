'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';

/**
 * Lo que contestó la familia, para leerlo ANTES de aprobarlo.
 *
 * El módulo entero se sostiene sobre que recibir y aprobar son dos actos: sin
 * esta pantalla, el segundo era firmar a ciegas — el renglón decía «por
 * aprobar» y no había forma de abrir lo que había dentro.
 *
 * Se enseña también el borrador a medio llenar, sin botones de decidir: la
 * pregunta «¿ya lo llenó?» se contesta mirando, no esperando a que envíe.
 */

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

interface CampoRespuesta {
  id: string;
  tipo: string;
  label: string;
  requerido: boolean;
  valor: unknown;
}

interface Respuesta {
  formulario: string;
  enviado: boolean;
  enviadoEn: string | null;
  actualizadoEn: string | null;
  campos: CampoRespuesta[];
  error?: string;
}

export function RespuestaFormularioDialog({ requeridoId, open, onOpenChange, onAprobar, onRechazar }: {
  requeridoId: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  const { data, isLoading } = useSWR<Respuesta>(
    open && requeridoId
      ? `/api/administracion-escolar/documentos/extras/${requeridoId}/respuesta`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const fecha = data?.enviadoEn ?? data?.actualizadoEn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <ModalHeader
          title={data?.formulario ?? 'Respuesta de la familia'}
          subtitle={
            !data ? undefined
              : data.error ? undefined
                : data.enviado
                  ? `Lo mandó la familia${fecha ? ` el ${new Date(fecha).toLocaleDateString('es-DO')}` : ''}. Revísalo antes de darlo por bueno.`
                  : 'Todavía no lo ha enviado: esto es lo que lleva escrito hasta ahora.'
          }
        />

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-zero-600" />
            </div>
          )}

          {data?.error && (
            <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              {data.error}
            </p>
          )}

          {data && !data.error && (
            <dl className="divide-y divide-gray-100">
              {data.campos.map((c) => (
                <Fila key={c.id} campo={c} />
              ))}
            </dl>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {/* Decidir solo cuando hay algo enviado: sobre un borrador a medias no
              hay nada que aprobar todavía. */}
          {data?.enviado && (
            <>
              <Button variant="outline" className="text-red-600 hover:bg-red-50"
                onClick={() => { onOpenChange(false); onRechazar(); }}>
                <X className="mr-1.5 h-4 w-4" />Rechazar
              </Button>
              <Button onClick={() => { onOpenChange(false); onAprobar(); }}>
                <Check className="mr-1.5 h-4 w-4" />Aprobar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fila({ campo }: { campo: CampoRespuesta }) {
  // Los títulos y párrafos del formulario no son preguntas: hacen de separador
  // y así la ficha se lee con las mismas secciones que vio la familia.
  if (campo.tipo === 'heading' || campo.tipo === 'paragraph') {
    return (
      <div className="pb-2 pt-5 first:pt-0">
        <p className={campo.tipo === 'heading'
          ? 'text-sm font-semibold text-gray-900'
          : 'text-xs text-gray-500'}>
          {campo.label}
        </p>
      </div>
    );
  }

  const vacio = campo.valor == null || campo.valor === ''
    || (Array.isArray(campo.valor) && campo.valor.length === 0);

  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(0,240px)_1fr] sm:gap-4">
      <dt className="text-xs text-gray-500">
        {campo.label}
        {campo.requerido && <span className="ml-0.5 text-red-500">*</span>}
      </dt>
      <dd className="text-sm text-gray-900">
        {vacio
          ? <span className="text-gray-300">Sin contestar</span>
          : <Valor tipo={campo.tipo} valor={campo.valor} />}
      </dd>
    </div>
  );
}

/**
 * La firma, con red debajo.
 *
 * Si el dato viniera roto —una firma a medio guardar, un navegador raro—, un
 * `<img>` pelado deja el icono de imagen partida en la ficha que alguien está a
 * punto de aprobar. Mejor decir que la firma está y no se puede pintar.
 */
function Firma({ src }: { src: string }) {
  const [roto, setRoto] = useState(false);
  if (roto) return <span className="text-xs text-gray-500">Firmado (la firma no se pudo mostrar)</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Firma"
      onError={() => setRoto(true)}
      className="h-16 rounded border border-gray-200 bg-white"
    />
  );
}

function Valor({ tipo, valor }: { tipo: string; valor: unknown }) {
  if (tipo === 'firma' && typeof valor === 'string' && valor.startsWith('data:image')) {
    return <Firma src={valor} />;
  }

  if (tipo === 'archivo' && valor && typeof valor === 'object') {
    const v = valor as { nombre?: string; key?: string };
    return <span>{v.nombre ?? 'Archivo adjunto'}</span>;
  }

  if (Array.isArray(valor)) {
    return (
      <div className="flex flex-wrap gap-1">
        {valor.map((v, i) => (
          <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{String(v)}</span>
        ))}
      </div>
    );
  }

  if (valor && typeof valor === 'object') {
    // Los compuestos (dirección, nombre completo) se enseñan por sus partes.
    return (
      <span>{Object.values(valor as Record<string, unknown>).filter(Boolean).join(', ')}</span>
    );
  }

  return <span className="whitespace-pre-line">{String(valor)}</span>;
}
