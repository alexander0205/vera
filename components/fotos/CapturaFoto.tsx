'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Upload, Trash2, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Componente de fotos reutilizable.
 *
 * Sabe pintar la foto de CUALQUIER entidad registrada en lib/fotos/entidades.ts
 * y ofrecerte las dos maneras de ponerle una: escanear un QR y disparar con el
 * teléfono, o subir un archivo que ya tenías.
 *
 *   <CapturaFoto entidad="estudiante" entidadId={12} nombre="Ana Pérez" />
 *   <CapturaFoto entidad="personal"   entidadId={7}  />
 *   <CapturaFoto entidad="producto"   entidadId={310} forma="cuadrada" />
 *
 * No sabe qué es un estudiante ni dónde vive su tabla: todo eso lo resuelve el
 * servidor a partir de `entidad`. Añadir una entidad nueva no toca este archivo.
 *
 * El escritorio se entera de la foto del móvil sondeando el estado de la sesión
 * mientras el diálogo está abierto — sin WebSockets, y el sondeo muere al
 * cerrar el diálogo o al desmontar.
 */

export interface FotoActual {
  url: string | null;
  urlMiniatura: string | null;
  actualizadaEn: string;
  origen: string;
}

export interface CapturaFotoProps {
  /** Clave del registro de entidades: 'estudiante' | 'personal' | 'producto' | 'empresa'. */
  entidad: string;
  entidadId: number;
  /** Solo para las iniciales del hueco vacío y el título del diálogo. */
  nombre?: string;
  /** false = solo mostrar (sin botón de cámara). Por defecto true. */
  editable?: boolean;
  /** Lado del avatar en px. Por defecto 56 (el de la ficha). */
  tamano?: number;
  forma?: 'redonda' | 'cuadrada';
  /** Se llama al quedar guardada una foto nueva (o al quitarla: null). */
  onListo?: (foto: FotoActual | null) => void;
  className?: string;
}

const MS_SONDEO = 2500;

const traer = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('fallo'))));

export function CapturaFoto({
  entidad, entidadId, nombre, editable = true, tamano = 56,
  forma = 'redonda', onListo, className,
}: CapturaFotoProps) {
  const clave = `/api/fotos?entidad=${encodeURIComponent(entidad)}&entidadId=${entidadId}`;
  const { data, mutate } = useSWR<{ foto: FotoActual | null; nombre: string }>(clave, traer);
  const foto = data?.foto ?? null;

  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const refrescar = useCallback(async () => {
    const nuevo = await mutate();
    onListo?.(nuevo?.foto ?? null);
  }, [mutate, onListo]);

  const subirArchivo = useCallback(async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append('foto', archivo);
      const res = await fetch(clave, { method: 'POST', body: form });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo subir la foto');
      toast.success('Foto actualizada');
      setAbierto(false);
      await refrescar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la foto');
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  }, [clave, refrescar]);

  const quitar = useCallback(async () => {
    setSubiendo(true);
    try {
      const res = await fetch(clave, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo quitar la foto');
      toast.success('Foto quitada');
      setAbierto(false);
      await refrescar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo quitar la foto');
    } finally {
      setSubiendo(false);
    }
  }, [clave, refrescar]);

  const iniciales = (nombre ?? data?.nombre ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const redondez = forma === 'redonda' ? 'rounded-full' : 'rounded-lg';

  return (
    <>
      <div className={`relative shrink-0 ${className ?? ''}`} style={{ width: tamano, height: tamano }}>
        <div
          className={`${redondez} overflow-hidden bg-zero-100 text-zero-700 flex items-center justify-center font-semibold w-full h-full`}
          style={{ fontSize: Math.round(tamano / 3) }}
        >
          {foto?.urlMiniatura || foto?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de S3 con vida corta: next/image la cachearía con una URL que caduca
            <img src={foto.urlMiniatura ?? foto.url ?? ''} alt={nombre ?? 'Foto'} className="w-full h-full object-cover" />
          ) : (
            iniciales || <Camera className="h-1/3 w-1/3 opacity-50" />
          )}
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            title="Tomar o cambiar la foto"
            aria-label="Tomar o cambiar la foto"
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-zero-600 hover:border-zero-200"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foto de {nombre ?? data?.nombre ?? 'la ficha'}</DialogTitle>
          </DialogHeader>

          {abierto && (
            <PanelQR
              entidad={entidad}
              entidadId={entidadId}
              onFotoLista={async () => {
                toast.success('Foto recibida desde el teléfono');
                setAbierto(false);
                await refrescar();
              }}
            />
          )}

          <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => subirArchivo(e.target.files?.[0])}
            />
            <Button
              variant="outline" size="sm" disabled={subiendo}
              onClick={() => archivoRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" />Subir un archivo
            </Button>
            {foto && (
              <Button variant="outline" size="sm" disabled={subiendo} onClick={quitar}
                className="text-red-600 hover:text-red-700">
                <Trash2 className="h-4 w-4 mr-1.5" />Quitar
              </Button>
            )}
            {subiendo && <Loader2 className="h-4 w-4 animate-spin text-gray-400 self-center" />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Pide la sesión de captura, enseña el QR y espera. Vive dentro del diálogo a
 * propósito: se monta al abrir (ahí se crea el token, no antes) y al cerrarse
 * se desmonta, que es lo que corta el sondeo.
 */
function PanelQR({
  entidad, entidadId, onFotoLista,
}: { entidad: string; entidadId: number; onFotoLista: () => void }) {
  const [sesion, setSesion] = useState<{ token: string; qr: string; url: string } | null>(null);
  const [estado, setEstado] = useState<'pidiendo' | 'esperando' | 'expirada' | 'error'>('pidiendo');
  const [segundos, setSegundos] = useState(0);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado('pidiendo');
    (async () => {
      try {
        const res = await fetch('/api/fotos/sesiones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entidad, entidadId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) { setEstado('error'); return; }
        setSesion({ token: data.token, qr: data.qr, url: data.url });
        setEstado('esperando');
      } catch {
        if (vivo) setEstado('error');
      }
    })();
    return () => { vivo = false; };
  }, [entidad, entidadId, intento]);

  // El aviso al padre se guarda en una ref y NO entra como dependencia: quien
  // usa el componente lo pasa como función en línea, así que cambia de
  // identidad en cada render y el intervalo se estaría reiniciando sin parar
  // (con un tick de 2,5 s, podría no llegar a dispararse nunca).
  const avisar = useRef(onFotoLista);
  avisar.current = onFotoLista;

  // Sondeo: solo mientras hay token y seguimos esperando. El intervalo se limpia
  // al desmontar (cerrar el diálogo) y al llegar la foto — nunca queda corriendo.
  useEffect(() => {
    if (!sesion || estado !== 'esperando') return;
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/fotos/sesiones/${sesion.token}`);
        if (!res.ok || !vivo) return;
        const data = await res.json();
        setSegundos(data.segundos ?? 0);
        if (data.estado === 'usada') { clearInterval(id); avisar.current(); }
        else if (data.estado === 'expirada') { clearInterval(id); setEstado('expirada'); }
      } catch {
        // Un fallo suelto de red no debe matar la espera: el siguiente tick lo reintenta.
      }
    }, MS_SONDEO);
    return () => { vivo = false; clearInterval(id); };
  }, [sesion, estado]);

  if (estado === 'pidiendo') {
    return <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>;
  }
  if (estado === 'error') {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-gray-500">No se pudo generar el código.</p>
        <Button variant="outline" size="sm" onClick={() => setIntento((i) => i + 1)}>
          <RefreshCw className="h-4 w-4 mr-1.5" />Reintentar
        </Button>
      </div>
    );
  }
  if (estado === 'expirada') {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-gray-500">El código caducó.</p>
        <Button variant="outline" size="sm" onClick={() => setIntento((i) => i + 1)}>
          <RefreshCw className="h-4 w-4 mr-1.5" />Generar otro
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <p className="text-sm text-gray-600">
        Escanea este código con la cámara del teléfono y toma la foto.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL generada en el servidor */}
      <img src={sesion?.qr} alt="Código QR para tomar la foto" className="mx-auto h-56 w-56" />
      <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Esperando la foto{segundos > 0 ? ` · caduca en ${Math.ceil(segundos / 60)} min` : ''}
      </p>
      <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
        <Check className="h-3 w-3" />La foto aparecerá aquí sola, sin recargar
      </p>
    </div>
  );
}
