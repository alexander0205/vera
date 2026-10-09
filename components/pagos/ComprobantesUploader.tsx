'use client';

/**
 * Comprobantes de pago — subida y galería.
 *
 * Los archivos se suben APENAS se eligen, no al enviar el formulario. Dos
 * razones: el servidor puede exigir el comprobante antes de crear el cobro
 * (recibe los ids ya subidos), y el usuario ve el error de un archivo malo en el
 * momento en vez de perder el formulario completo al final.
 *
 * Contrapartida: si cierran el modal sin registrar el pago, los comprobantes
 * quedan colgando de la factura. Se ven en su detalle y se pueden borrar ahí.
 */

import { useState, useCallback } from 'react';
import { X, FileText, AlertTriangle, Upload } from 'lucide-react';
import ComprobanteVisor from '@/components/pagos/ComprobanteVisor';
import { ZonaArchivo, useSoltarArchivos } from '@/components/shared/ZonaArchivo';

export interface AdjuntoSubido {
  id:          number;
  nombre:      string;
  mime:        string;
  tamanoBytes: number;
  /** false en PDF: no hay miniatura y se pinta el ícono. */
  tieneThumb?: boolean;
}

/**
 * Un archivo elegido antes de que exista la factura.
 *
 * Al CREAR una factura con su pago todavía no hay `docId` —lo asigna el
 * servidor— así que no hay nada a lo que colgar el comprobante. En vez de
 * negarle la subida a la secretaria hasta que guarde, el archivo se queda en
 * memoria y sube en cuanto la factura nace, con `subirPendientes`.
 *
 * El `id` es negativo a propósito: comparte la lista con los ya subidos, que
 * llevan id real y positivo, y así la galería se pinta con un solo bucle.
 */
export interface Pendiente {
  id:         number;
  archivo:    File;
  /** objectURL para la miniatura; null en PDF. Se revoca al quitarlo. */
  previewUrl: string | null;
}

interface Props {
  /**
   * La factura a la que se cuelgan. `null` = todavía no existe (creación):
   * los archivos se acumulan en `pendientes` y suben después.
   */
  docId:            number | null;
  /** Ids ya subidos. El padre los manda al registrar el pago. */
  adjuntos:         AdjuntoSubido[];
  onChange:         (adjuntos: AdjuntoSubido[]) => void;
  /** Solo en modo diferido (`docId === null`). */
  pendientes?:      Pendiente[];
  onPendientesChange?: (pendientes: Pendiente[]) => void;
  disabled?:        boolean;
  /** El método elegido exige comprobante: cambia el copy y marca el bloque. */
  obligatorio?:     boolean;
  max?:             number;
  /** Columna angosta (sidebar del detalle): el encabezado se apila en vez de
   *  competir por el ancho, que es lo que partía el título en dos líneas. */
  compacto?:        boolean;
}

/**
 * Sube a la factura recién creada los archivos que esperaban en memoria.
 *
 * Devuelve los que lograron subir. NO lanza: la factura ya está creada y
 * emitida, y tumbar ese flujo porque una foto no subió sería cambiar un
 * problema pequeño por uno grande. Lo que no suba se puede adjuntar después
 * desde el detalle de la factura, que es justo para lo que sirve esa tarjeta.
 */
export async function subirPendientes(
  docId: number,
  pendientes: Pendiente[],
): Promise<{ subidos: AdjuntoSubido[]; fallidos: number }> {
  const subidos: AdjuntoSubido[] = [];
  let fallidos = 0;

  for (const p of pendientes) {
    try {
      const fd = new FormData();
      fd.append('docId', String(docId));
      fd.append('archivo', p.archivo);
      const res  = await fetch('/api/pagos/adjuntos', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { fallidos++; continue; }
      subidos.push(json.adjunto);
    } catch {
      fallidos++;
    } finally {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
  }

  return { subidos, fallidos };
}

function kb(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ComprobantesUploader({
  docId, adjuntos, onChange, pendientes = [], onPendientesChange,
  disabled = false, obligatorio = false, max = 5, compacto = false,
}: Props) {
  const [subiendo, setSubiendo]     = useState(false);
  const [viendo, setViendo]         = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const diferido = docId === null;
  const lleno = adjuntos.length + pendientes.length >= max;
  const aceptaSoltar = !disabled && !lleno && !subiendo;

  // Los archivos llegan ya comprimidos de `ZonaArchivo`: una foto de celular
  // pesa 3–8 MB y el body de una función de Vercel topa en 4.5 MB.
  const subir = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setError(null);

    const sitio = max - adjuntos.length - pendientes.length;
    if (sitio <= 0) return;

    // Sin factura todavía: se guardan en memoria y suben al crearla.
    if (diferido) {
      const nuevos: Pendiente[] = files.slice(0, sitio).map((archivo, i) => ({
        // Negativo y decreciente: no puede chocar con un id real.
        id: -(pendientes.length + i + 1),
        archivo,
        previewUrl: archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null,
      }));
      onPendientesChange?.([...pendientes, ...nuevos]);
      return;
    }

    setSubiendo(true);

    const nuevos: AdjuntoSubido[] = [];
    try {
      for (const archivo of files.slice(0, sitio)) {
        const fd = new FormData();
        fd.append('docId', String(docId));
        fd.append('archivo', archivo);

        const res  = await fetch('/api/pagos/adjuntos', { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'No se pudo subir el archivo');
        nuevos.push(json.adjunto);
      }
      if (nuevos.length) onChange([...adjuntos, ...nuevos]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo');
      if (nuevos.length) onChange([...adjuntos, ...nuevos]);
    } finally {
      setSubiendo(false);
    }
  }, [adjuntos, docId, diferido, max, onChange, onPendientesChange, pendientes]);

  async function quitar(id: number) {
    // Id negativo = todavía no subió: solo hay que soltar el objectURL.
    if (id < 0) {
      const fuera = pendientes.find(p => p.id === id);
      if (fuera?.previewUrl) URL.revokeObjectURL(fuera.previewUrl);
      onPendientesChange?.(pendientes.filter(p => p.id !== id));
      return;
    }
    onChange(adjuntos.filter(a => a.id !== id));
    // Si el usuario no tiene permiso de borrar, el archivo queda en la factura
    // pero fuera de este pago. No es un error que valga la pena mostrar.
    await fetch(`/api/pagos/adjuntos/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  // Se puede soltar sobre la tarjeta entera, no solo sobre el botón de 70px.
  const { arrastrando, handlers } = useSoltarArchivos(
    (files) => subir(Array.from(files)),
    !disabled && !lleno && !subiendo,
  );

  const marco = arrastrando
    ? 'border-zero-500 bg-zero-50 border-dashed'
    : obligatorio
      ? 'border-amber-300 bg-amber-50/60'
      : 'border-gray-200 bg-gray-50/60';

  // El visor solo maneja imágenes. Un PDF (o cualquier otro documento) se abre
  // en una pestaña, donde el navegador usa su propio visor: zoom, buscar,
  // imprimir y guardar salen gratis, y no hay que reimplementar nada.
  const esImagen = (a: AdjuntoSubido) => a.mime.startsWith('image/');

  /**
   * Subidos y pendientes en una sola lista, para pintarlos con un solo bucle.
   * Los pendientes traen `previewUrl` porque no tienen endpoint del que sacar
   * la miniatura: todavía no existen en el servidor.
   */
  type Item = AdjuntoSubido & { previewUrl?: string | null };
  const items: Item[] = [
    ...adjuntos,
    ...pendientes.map(p => ({
      id:          p.id,
      nombre:      p.archivo.name,
      mime:        p.archivo.type,
      tamanoBytes: p.archivo.size,
      previewUrl:  p.previewUrl,
    })),
  ];

  // El visor pide las imágenes al servidor, así que solo entran las ya subidas.
  const imagenes = adjuntos.filter(esImagen);

  function abrir(a: Item) {
    if (a.id < 0) {
      // Pendiente: se abre el objectURL, que es lo único que existe de él.
      if (a.previewUrl) window.open(a.previewUrl, '_blank', 'noopener');
      return;
    }
    if (esImagen(a)) {
      setViendo(imagenes.findIndex(i => i.id === a.id));
      return;
    }
    window.open(`/api/pagos/adjuntos/${a.id}`, '_blank', 'noopener');
  }

  return (
    <div
      className={`relative rounded-lg border transition-colors ${marco} p-3`}
      {...handlers}
    >
      {arrastrando && (
        <div className="absolute inset-0 z-10 rounded-lg bg-zero-50/90 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <Upload className="h-5 w-5 text-zero-600" />
          <span className="text-xs font-medium text-zero-700">Suelta aquí el comprobante</span>
        </div>
      )}

      <div className={`mb-2.5 ${compacto ? 'space-y-0.5' : 'flex items-center justify-between gap-3'}`}>
        <span className="block text-xs font-medium text-gray-700">
          Comprobante de pago {obligatorio && <span className="text-amber-700">· requerido</span>}
        </span>
        <span className="block text-[10px] text-gray-400 leading-snug">
          {compacto
            ? `Arrastra, pega o elige · hasta ${max}, 3 MB c/u`
            : `${obligatorio ? 'Este método lo exige' : 'Opcional'} · arrastra, pega o elige · hasta ${max}, 3 MB c/u`}
        </span>
      </div>

      <div className="flex gap-2 flex-wrap items-start">
        {items.map(a => (
          <div key={a.id} className="flex flex-col gap-1 w-[70px] group">
            <div className="relative h-[64px] w-[70px] rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => abrir(a)}
                title={esImagen(a) ? `Ver ${a.nombre}` : `Abrir ${a.nombre} en una pestaña`}
                className={`h-full w-full flex items-center justify-center hover:opacity-90 ${
                  esImagen(a) ? 'cursor-zoom-in' : 'cursor-pointer'
                }`}
              >
                {esImagen(a) ? (
                  // `size=thumb` trae ~5 KB en vez del original completo. El
                  // binario sale del proxy con sesión; no hay URL pública.
                  <img
                    src={a.previewUrl ?? `/api/pagos/adjuntos/${a.id}?size=thumb`}
                    alt={a.nombre}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-0.5 text-red-500">
                    <FileText className="h-5 w-5" />
                    <span className="text-[8px] font-medium uppercase tracking-wide">
                      {(a.nombre.split('.').pop() ?? 'doc').slice(0, 4)}
                    </span>
                  </span>
                )}
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => quitar(a.id)}
                  aria-label={`Quitar ${a.nombre}`}
                  title={`Quitar ${a.nombre}`}
                  className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-gray-900/70 text-white flex items-center justify-center hover:bg-gray-900 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <span className="text-[9px] text-gray-500 truncate" title={a.nombre}>
              {kb(a.tamanoBytes)}
            </span>
          </div>
        ))}

        {!lleno && !disabled && (
          <ZonaArchivo
            variante="compacta"
            multiple
            pegar
            ocupado={subiendo}
            onArchivos={subir}
          />
        )}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {/* Solo las imágenes entran al visor; así las flechas ‹ › no caen nunca
          en un PDF que no se puede mostrar. */}
      <ComprobanteVisor
        adjuntos={imagenes}
        indice={viendo}
        onClose={() => setViendo(null)}
        onIndice={setViendo}
      />
    </div>
  );
}
